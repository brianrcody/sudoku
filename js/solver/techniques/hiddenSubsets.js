/**
 * @fileoverview Hidden Pair (rank 5) and Hidden Triple (rank 7).
 *
 * Hidden Pair: Two digits in a unit each have only two candidate cells, and
 * those two cells are the same. All other candidates can be removed from
 * those two cells.
 *
 * Hidden Triple: Three digits in a unit are confined to the same three cells.
 * All other candidates in those three cells can be removed.
 */

import { UNITS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function hiddenPair(state) {
  return hiddenSubset(state, 2, 'Hidden Pair');
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function hiddenTriple(state) {
  return hiddenSubset(state, 3, 'Hidden Triple');
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @param {number} size
 * @param {string} techniqueName
 * @returns {{ placements: Array, eliminations: Array, technique: string }|null}
 */
function hiddenSubset(state, size, techniqueName) {
  const { board, candidates } = state;

  for (const unit of UNITS) {
    // For each digit, which cells in this unit can hold it?
    const cellsForDigit = new Array(10); // index by digit 1–9
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      cellsForDigit[d] = unit.filter(i => board[i] === 0 && (candidates[i] & bit));
    }

    // Digits that appear in 2..size cells are candidates for a hidden subset.
    const eligible = [];
    for (let d = 1; d <= 9; d++) {
      const n = cellsForDigit[d].length;
      if (n >= 2 && n <= size) eligible.push(d);
    }

    if (eligible.length < size) continue;

    for (const digitCombo of combinations(eligible, size)) {
      // Union of all cells that hold any digit in this combo.
      const cellSet = new Set();
      for (const d of digitCombo) {
        for (const i of cellsForDigit[d]) cellSet.add(i);
      }

      if (cellSet.size !== size) continue;

      // We have `size` digits confined to exactly `size` cells.
      // Eliminate all other candidates from those cells.
      const digitMask = digitCombo.reduce((m, d) => m | (1 << (d - 1)), 0);
      const elims = [];
      for (const i of cellSet) {
        const extra = candidates[i] & ~digitMask;
        if (extra) {
          for (const d of iterate(extra)) {
            elims.push({ cellIndex: i, digit: d });
          }
        }
      }
      if (elims.length > 0) {
        return { placements: [], eliminations: elims, technique: techniqueName };
      }
    }
  }

  return null;
}

/**
 * @param {number[]} arr
 * @param {number} k
 * @returns {number[][]}
 */
function combinations(arr, k) {
  const result = [];
  const combo = new Array(k);
  function recurse(start, depth) {
    if (depth === k) { result.push(combo.slice()); return; }
    for (let i = start; i <= arr.length - (k - depth); i++) {
      combo[depth] = arr[i];
      recurse(i + 1, depth + 1);
    }
  }
  recurse(0, 0);
  return result;
}
