/**
 * @fileoverview Norvig-style constraint-propagation solver used exclusively for
 * uniqueness checking during puzzle generation.
 */

import { PEERS } from '../util/grid.js';
import { ALL } from '../util/bitset.js';

/**
 * Count solutions for a given puzzle, stopping at `cap`.
 *
 * Algorithm: constraint propagation (assign + eliminate) followed by
 * search on the cell with fewest candidates (MRV heuristic). Propagation
 * frequently solves the puzzle without search; search kicks in only for
 * harder puzzles.
 *
 * @param {Uint8Array} givens - 81-element array; 0 = empty, 1–9 = digit.
 * @param {number} [cap=2] - Stop counting once this many solutions are found.
 * @returns {{ count: number, solution: Uint8Array|null }}
 *   `count` is 0, 1, or `cap` (meaning ≥ cap). `solution` is set only when
 *   count === 1.
 */
export function countSolutions(givens, cap = 2) {
  // candidates[i]: bitmask of still-possible digits for cell i.
  const candidates = new Uint16Array(81).fill(ALL);
  let filled = 0;

  // Propagate all filled cells from the input.
  for (let i = 0; i < 81; i++) {
    const d = givens[i];
    if (d !== 0) {
      if (!assign(candidates, i, d)) {
        // Contradiction during initial setup — 0 solutions.
        return { count: 0, solution: null };
      }
      filled++;
    }
  }

  // Count how many cells were already forced to a single digit via propagation.
  // Re-count from candidates to get the true filled count after propagation.
  filled = 0;
  for (let i = 0; i < 81; i++) {
    const c = candidates[i];
    if (c === 0) return { count: 0, solution: null }; // contradiction
    if ((c & (c - 1)) === 0) filled++; // exactly one bit set
  }

  const result = { count: 0, solution: null };
  search(candidates, filled, cap, result);
  return result;
}

/**
 * Assign digit `d` to cell `i` in `candidates`.
 * Eliminates all other candidates from `i`, then propagates peer constraints.
 * Returns false on contradiction.
 *
 * @param {Uint16Array} candidates
 * @param {number} i
 * @param {number} d - digit 1–9
 * @returns {boolean}
 */
function assign(candidates, i, d) {
  const mask = candidates[i];
  const bit = 1 << (d - 1);
  if (!(mask & bit)) return false; // digit not possible here

  // Eliminate every other digit from cell i.
  for (let dd = 1; dd <= 9; dd++) {
    if (dd !== d) {
      if (mask & (1 << (dd - 1))) {
        if (!eliminate(candidates, i, dd)) return false;
      }
    }
  }
  return true;
}

/**
 * Eliminate digit `d` from cell `i`. Propagates two Norvig constraints:
 * 1. If cell `i` is reduced to a single candidate, assign it (naked single).
 * 2. If in any unit that contains `i`, digit `d` now has only one possible
 *    cell, assign it there (hidden single).
 *
 * @param {Uint16Array} candidates
 * @param {number} i
 * @param {number} d - digit 1–9
 * @returns {boolean}
 */
function eliminate(candidates, i, d) {
  const bit = 1 << (d - 1);
  if (!(candidates[i] & bit)) return true; // already eliminated, nothing to do

  candidates[i] &= ~bit;
  const c = candidates[i];

  if (c === 0) return false; // contradiction: no candidates left

  // Constraint 1: naked single propagation.
  if ((c & (c - 1)) === 0) {
    // Exactly one bit remains — assign this digit to all peers.
    const forced = 31 - Math.clz32(c) + 1; // bit index → digit
    for (const peer of PEERS[i]) {
      if (!eliminate(candidates, peer, forced)) return false;
    }
  }

  // Constraint 2: hidden single propagation across the 3 units of cell i.
  // (Reusing the same UNITS_OF lookup used elsewhere in the solver.)
  for (const unit of UNITS_OF_CELL[i]) {
    let possCount = 0;
    let possCell = -1;
    for (const j of unit) {
      if (candidates[j] & bit) {
        possCount++;
        possCell = j;
      }
    }
    if (possCount === 0) return false; // no cell in unit can hold d
    if (possCount === 1) {
      if (!assign(candidates, possCell, d)) return false;
    }
  }

  return true;
}

/**
 * Depth-first search with MRV (minimum remaining values) heuristic.
 * Modifies a clone of `candidates` per branch; original is not mutated.
 *
 * @param {Uint16Array} candidates
 * @param {number} filled - Number of cells assigned so far.
 * @param {number} cap
 * @param {{ count: number, solution: Uint8Array|null }} result
 */
function search(candidates, filled, cap, result) {
  if (filled === 81) {
    result.count++;
    if (result.count === 1) {
      // Record the solution.
      const sol = new Uint8Array(81);
      for (let i = 0; i < 81; i++) {
        sol[i] = 31 - Math.clz32(candidates[i]) + 1;
      }
      result.solution = sol;
    } else {
      result.solution = null; // more than one — clear
    }
    return;
  }

  // Pick the unfilled cell with fewest candidates (MRV).
  let minCount = 10;
  let minCell = -1;
  for (let i = 0; i < 81; i++) {
    const c = candidates[i];
    if ((c & (c - 1)) !== 0) {
      // More than one candidate — this cell is unfilled.
      const n = popcount(c);
      if (n < minCount) {
        minCount = n;
        minCell = i;
        if (n === 2) break; // can't do better
      }
    }
  }

  if (minCell === -1) return; // contradiction (shouldn't reach here normally)

  const bits = candidates[minCell];
  for (let d = 1; d <= 9; d++) {
    if (bits & (1 << (d - 1))) {
      // Branch: clone candidates and try assigning d to minCell.
      const clone = candidates.slice();
      if (assign(clone, minCell, d)) {
        // Count filled cells in clone.
        let newFilled = 0;
        for (let i = 0; i < 81; i++) {
          const cc = clone[i];
          if ((cc & (cc - 1)) === 0 && cc !== 0) newFilled++;
        }
        search(clone, newFilled, cap, result);
      }
      if (result.count >= cap) return;
    }
  }
}

/** @param {number} n */
function popcount(n) {
  let count = 0;
  let s = n;
  while (s) { s &= s - 1; count++; }
  return count;
}

// ---------------------------------------------------------------------------
// Local precomputation of unit membership (avoids circular import from grid.js
// if UNITS_OF is imported; we replicate it cheaply for the 3-unit lookup).
// ---------------------------------------------------------------------------

/** @type {Array<Array<number[]>>} Units for each cell: [row, col, box]. */
const UNITS_OF_CELL = (() => {
  const rows = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => r * 9 + c)
  );
  const cols = Array.from({ length: 9 }, (_, c) =>
    Array.from({ length: 9 }, (_, r) => r * 9 + c)
  );
  const boxes = Array.from({ length: 9 }, (_, b) => {
    const br = (b / 3) | 0, bc = b % 3;
    return Array.from({ length: 9 }, (_, k) => (br * 3 + ((k / 3) | 0)) * 9 + bc * 3 + (k % 3));
  });

  return Array.from({ length: 81 }, (_, i) => {
    const r = (i / 9) | 0;
    const c = i % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    return [rows[r], cols[c], boxes[b]];
  });
})();
