/**
 * @fileoverview X-Wing technique (rank 8).
 *
 * For a digit D: if in exactly two rows, D's candidates are confined to the
 * same two columns, then D can be eliminated from those two columns in all
 * other rows. The symmetric case (two columns, same two rows) is also checked.
 *
 * Reference: sudokuwiki.org/X_Wing_Strategy
 */

import { UNITS } from '../../util/grid.js';

const ROW_UNITS = UNITS.slice(0, 9);
const COL_UNITS = UNITS.slice(9, 18);

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function xWing(state) {
  return fish(state, 2, ROW_UNITS, COL_UNITS) ||
         fish(state, 2, COL_UNITS, ROW_UNITS);
}

/**
 * Generic fish finder (X-Wing = size 2).
 *
 * For each digit, find `size` base units whose candidate cells for that digit
 * all fall within the same `size` cover units. Eliminate from cover units
 * outside the base units.
 *
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @param {number} size
 * @param {number[][]} baseUnits
 * @param {number[][]} coverUnits
 * @returns {{ placements: Array, eliminations: Array, technique: string }|null}
 */
export function fish(state, size, baseUnits, coverUnits) {
  const { board, candidates } = state;

  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);

    // For each base unit, collect the cover-unit indices that contain d.
    const basePositions = baseUnits.map(unit => {
      const pos = [];
      for (let idx = 0; idx < unit.length; idx++) {
        const i = unit[idx];
        if (board[i] === 0 && (candidates[i] & bit)) pos.push(idx);
      }
      return pos; // indices within the cover units (0–8)
    });

    // Base units are eligible if their candidate count is between 2 and `size`.
    // X-Wing requires exactly 2 (both bounds collapse); Swordfish/Jellyfish
    // allow fewer than `size` candidates per base unit.
    const eligible = [];
    for (let b = 0; b < baseUnits.length; b++) {
      const len = basePositions[b].length;
      if (len >= 2 && len <= size) eligible.push(b);
    }

    if (eligible.length < size) continue;

    for (const baseCombo of combinations(eligible, size)) {
      // The cover-unit positions must be exactly the same `size` indices.
      const coverSet = new Set();
      for (const b of baseCombo) {
        for (const p of basePositions[b]) coverSet.add(p);
      }
      if (coverSet.size !== size) continue;

      // Found a fish. Eliminate d from cover units outside the base units.
      const baseCells = new Set();
      for (const b of baseCombo) {
        for (const i of baseUnits[b]) {
          if (board[i] === 0 && (candidates[i] & bit)) baseCells.add(i);
        }
      }

      const elims = [];
      for (const coverIdx of coverSet) {
        for (const i of coverUnits[coverIdx]) {
          if (!baseCells.has(i) && board[i] === 0 && (candidates[i] & bit)) {
            elims.push({ cellIndex: i, digit: d });
          }
        }
      }

      if (elims.length > 0) {
        return { placements: [], eliminations: elims, technique: 'X-Wing' };
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
