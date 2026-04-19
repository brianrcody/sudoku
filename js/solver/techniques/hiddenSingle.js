/**
 * @fileoverview Hidden Single technique (rank 2).
 *
 * In a unit (row, column, or box), if a digit has exactly one cell that can
 * hold it, that cell must contain that digit.
 */

import { UNITS } from '../../util/grid.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array<{cellIndex:number,digit:number}>, eliminations: Array, technique: string }|null}
 */
export default function hiddenSingle(state) {
  const { board, candidates } = state;

  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      let count = 0;
      let found = -1;

      for (const i of unit) {
        if (board[i] === 0 && (candidates[i] & bit)) {
          count++;
          found = i;
          if (count > 1) break;
        }
      }

      if (count === 1) {
        return {
          placements: [{ cellIndex: found, digit: d }],
          eliminations: [],
          technique: 'Hidden Single',
        };
      }
    }
  }

  return null;
}
