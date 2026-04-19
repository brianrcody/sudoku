/**
 * @fileoverview Naked Pair (rank 4) and Naked Triple (rank 6).
 *
 * Naked Pair: Two cells in a unit each contain exactly the same two
 * candidates. Those two digits can be eliminated from all other cells in
 * the unit.
 *
 * Naked Triple: Three cells in a unit whose combined candidates are exactly
 * three digits. Those three digits can be eliminated from all other cells.
 *
 * Both are exported as separate functions since the technique ladder treats
 * them at different ranks. The module exports `nakedPair` and `nakedTriple`.
 */

import { UNITS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function nakedPair(state) {
  return nakedSubset(state, 2, 'Naked Pair');
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function nakedTriple(state) {
  return nakedSubset(state, 3, 'Naked Triple');
}

/**
 * Generic naked-subset finder for subsets of size `size`.
 *
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @param {number} size
 * @param {string} techniqueName
 * @returns {{ placements: Array, eliminations: Array, technique: string }|null}
 */
function nakedSubset(state, size, techniqueName) {
  const { board, candidates } = state;

  for (const unit of UNITS) {
    // Collect unsolved cells in this unit.
    const empty = unit.filter(i => board[i] === 0);
    if (empty.length <= size) continue;

    // Enumerate all combinations of `size` cells.
    for (const combo of combinations(empty, size)) {
      // Union of all candidates in this combo.
      let unionMask = 0;
      for (const i of combo) unionMask |= candidates[i];

      if (count(unionMask) !== size) continue;

      // Found a naked subset — eliminate union digits from the rest.
      const elims = [];
      for (const i of unit) {
        if (combo.includes(i) || board[i] !== 0) continue;
        for (const d of iterate(unionMask)) {
          if (candidates[i] & (1 << (d - 1))) {
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
 * Yield all size-k combinations from array `arr`.
 *
 * @param {number[]} arr
 * @param {number} k
 * @returns {number[][]}
 */
function combinations(arr, k) {
  const result = [];
  const combo = new Array(k);

  function recurse(start, depth) {
    if (depth === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - depth); i++) {
      combo[depth] = arr[i];
      recurse(i + 1, depth + 1);
    }
  }

  recurse(0, 0);
  return result;
}
