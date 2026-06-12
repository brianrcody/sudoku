/**
 * @fileoverview SPIKE (throwaway) — Unique Rectangle Type 1.
 *
 * Four unsolved cells at the intersections of two rows and two columns,
 * spanning exactly two boxes. Three cells (the floor) hold exactly the same
 * bivalue pair {a,b}; the fourth (the roof) holds {a,b} plus extras. If the
 * roof were reduced to {a,b}, the four cells could swap a/b freely, giving two
 * solutions — impossible in a valid puzzle. Therefore a and b are eliminated
 * from the roof.
 *
 * Reference: sudokuwiki.org/Unique_Rectangles
 */

import { boxOf } from '../../js/util/grid.js';
import { count, iterate } from '../../js/util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function urType1(state) {
  const { board, candidates } = state;

  for (let r1 = 0; r1 < 8; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 8; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];

          // The deadly-pattern swap only preserves box constraints when the
          // rectangle spans exactly two boxes.
          if (new Set(cells.map(boxOf)).size !== 2) continue;
          if (cells.some(i => board[i] !== 0)) continue;

          for (let roofIdx = 0; roofIdx < 4; roofIdx++) {
            const floorMask = candidates[cells[(roofIdx + 1) % 4]];
            if (count(floorMask) !== 2) continue;
            let floorOk = true;
            for (let k = 0; k < 4; k++) {
              if (k === roofIdx) continue;
              if (candidates[cells[k]] !== floorMask) { floorOk = false; break; }
            }
            if (!floorOk) continue;

            const roof = cells[roofIdx];
            const roofMask = candidates[roof];
            // Roof must contain the pair plus at least one extra candidate.
            if ((roofMask & floorMask) !== floorMask) continue;
            if (count(roofMask) < 3) continue;

            const digits = iterate(floorMask);
            return {
              placements: [],
              eliminations: digits.map(d => ({ cellIndex: roof, digit: d })),
              technique: 'Unique Rectangle (Type 1)',
              urCells: cells,
              urDigits: digits,
            };
          }
        }
      }
    }
  }

  return null;
}
