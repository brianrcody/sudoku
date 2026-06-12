/**
 * @fileoverview XYZ-Wing technique (rank 12).
 *
 * A pivot cell with exactly three candidates {X,Y,Z} and two bivalue wings
 * {X,Z} and {Y,Z}, each a peer of the pivot. One of the three cells must be
 * Z, so Z is eliminated from any cell that sees all three.
 *
 * Reference: sudokuwiki.org/XYZ_Wing
 */

import { PEERS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function xyzWing(state) {
  const { board, candidates } = state;

  const bivalue = [];
  const trivalue = [];
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    const n = count(candidates[i]);
    if (n === 2) bivalue.push(i);
    else if (n === 3) trivalue.push(i);
  }

  for (const pivot of trivalue) {
    const pivotMask = candidates[pivot];

    for (const wing1 of bivalue) {
      if (!PEERS[pivot].includes(wing1)) continue;
      const w1 = candidates[wing1];
      // wing1 must be a subset of the pivot's candidates.
      if ((w1 & pivotMask) !== w1) continue;

      for (const wing2 of bivalue) {
        if (wing2 === wing1 || !PEERS[pivot].includes(wing2)) continue;
        const w2 = candidates[wing2];
        if ((w2 & pivotMask) !== w2) continue;
        // The wings must differ and jointly cover all three pivot digits.
        if ((w1 | w2) !== pivotMask) continue;

        // Z is the digit common to both wings (and the pivot). Two bivalue
        // sets whose union is exactly three digits always intersect in
        // exactly one digit, so zMask is guaranteed single-bit here.
        const zMask = w1 & w2;
        const z = iterate(zMask)[0];

        // Eliminate Z from cells seeing pivot AND both wings.
        const elims = [];
        for (const peer of PEERS[pivot]) {
          if (peer === wing1 || peer === wing2) continue;
          if (board[peer] !== 0 || !(candidates[peer] & zMask)) continue;
          if (PEERS[wing1].includes(peer) && PEERS[wing2].includes(peer)) {
            elims.push({ cellIndex: peer, digit: z });
          }
        }
        if (elims.length > 0) {
          return {
            placements: [],
            eliminations: elims,
            technique: 'XYZ-Wing',
            pivot,
            wings: [wing1, wing2],
            z,
          };
        }
      }
    }
  }

  return null;
}
