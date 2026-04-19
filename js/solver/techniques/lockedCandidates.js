/**
 * @fileoverview Locked Candidates technique (rank 3).
 *
 * Two patterns — both exploit confinement of a digit within a box-row or
 * box-column intersection:
 *
 * Pointing: A digit's only candidates in a box lie in one row or column →
 *   eliminate that digit from the rest of that row/column.
 *
 * Claiming: A digit's only candidates in a row/column lie in one box →
 *   eliminate that digit from the rest of that box.
 */

import { UNITS } from '../../util/grid.js';

const ROW_UNITS = UNITS.slice(0, 9);   // indices 0–8
const COL_UNITS = UNITS.slice(9, 18);  // indices 9–17
const BOX_UNITS = UNITS.slice(18, 27); // indices 18–26

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function lockedCandidates(state) {
  const { board, candidates } = state;

  // --- Pointing ---
  for (const box of BOX_UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      const cells = box.filter(i => board[i] === 0 && (candidates[i] & bit));
      if (cells.length < 2) continue;

      // Check if all cells share the same row.
      const row0 = (cells[0] / 9) | 0;
      if (cells.every(i => ((i / 9) | 0) === row0)) {
        const elims = ROW_UNITS[row0]
          .filter(i => !box.includes(i) && board[i] === 0 && (candidates[i] & bit))
          .map(i => ({ cellIndex: i, digit: d }));
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'Locked Candidates' };
        }
      }

      // Check if all cells share the same column.
      const col0 = cells[0] % 9;
      if (cells.every(i => (i % 9) === col0)) {
        const elims = COL_UNITS[col0]
          .filter(i => !box.includes(i) && board[i] === 0 && (candidates[i] & bit))
          .map(i => ({ cellIndex: i, digit: d }));
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'Locked Candidates' };
        }
      }
    }
  }

  // --- Claiming ---
  for (const line of [...ROW_UNITS, ...COL_UNITS]) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      const cells = line.filter(i => board[i] === 0 && (candidates[i] & bit));
      if (cells.length < 2) continue;

      // Check if all cells are in the same box.
      const box0 = boxIndexOf(cells[0]);
      if (cells.every(i => boxIndexOf(i) === box0)) {
        const box = BOX_UNITS[box0];
        const elims = box
          .filter(i => !line.includes(i) && board[i] === 0 && (candidates[i] & bit))
          .map(i => ({ cellIndex: i, digit: d }));
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'Locked Candidates' };
        }
      }
    }
  }

  return null;
}

/** @param {number} i */
function boxIndexOf(i) {
  return ((((i / 9) | 0) / 3) | 0) * 3 + (((i % 9) / 3) | 0);
}
