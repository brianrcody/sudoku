/**
 * @fileoverview Conflict detection for committed pen digits.
 */

import { rowOf, colOf, boxOf } from '../util/grid.js';

/**
 * Returns the set of cell indices that participate in any row/col/box
 * duplicate pen digit. Pencil marks are never flagged.
 *
 * Recomputed in full on every pen-edit event — no incremental state.
 *
 * @param {Uint8Array} board - 81-element board; 0 = empty.
 * @returns {Set<number>}
 */
export function computeConflicts(board) {
  const conflicts = new Set();

  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (v === 0) continue;
    for (let j = i + 1; j < 81; j++) {
      if (board[j] !== v) continue;
      if (
        rowOf(i) === rowOf(j) ||
        colOf(i) === colOf(j) ||
        boxOf(i) === boxOf(j)
      ) {
        conflicts.add(i);
        conflicts.add(j);
      }
    }
  }

  return conflicts;
}
