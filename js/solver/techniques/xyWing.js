/**
 * @fileoverview XY-Wing technique (rank 11).
 *
 * Three bivalue cells: a hinge XY, and two wings XZ and YZ, where the wings
 * each share a peer with the hinge but not necessarily with each other.
 * Any cell that sees both wings can have Z eliminated.
 *
 * Reference: sudokuwiki.org/Y_Wing_Strategy
 */

import { PEERS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function xyWing(state) {
  const { board, candidates } = state;

  // Collect all bivalue cells.
  const bivalue = [];
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0 && count(candidates[i]) === 2) bivalue.push(i);
  }

  for (const hinge of bivalue) {
    const [x, y] = iterate(candidates[hinge]);

    for (const wing1 of bivalue) {
      if (wing1 === hinge) continue;
      if (!PEERS[hinge].includes(wing1)) continue;
      const w1c = candidates[wing1];
      // wing1 must share exactly one digit with hinge and have a different second digit.
      const w1digits = iterate(w1c);
      if (w1digits.length !== 2) continue;
      if (!(w1c & (1 << (x - 1))) && !(w1c & (1 << (y - 1)))) continue;

      // Determine which digit wing1 shares with hinge (X or Y) and what Z is.
      const sharedXW1 = !!(w1c & (1 << (x - 1)));
      const sharedYW1 = !!(w1c & (1 << (y - 1)));
      if (sharedXW1 && sharedYW1) continue; // shares both — not an XY-Wing wing
      // wing1 is XZ: shares X with hinge, has Z; or YZ: shares Y, has Z.
      // Z is the non-shared digit in wing1.
      const sharedHingeDigit = sharedXW1 ? x : y;
      const z = w1digits.find(d => d !== sharedHingeDigit);
      // The other wing must share the other hinge digit (Y or X) + Z.
      const otherHingeDigit = sharedXW1 ? y : x;
      const neededMask = (1 << (otherHingeDigit - 1)) | (1 << (z - 1));

      for (const wing2 of bivalue) {
        if (wing2 === hinge || wing2 === wing1) continue;
        if (!PEERS[hinge].includes(wing2)) continue;
        if (candidates[wing2] !== neededMask) continue;

        // Found XY-Wing: hinge=XY, wing1 shares X (has Z), wing2 shares Y (has Z).
        // Eliminate Z from cells that see both wing1 and wing2.
        const zBit = 1 << (z - 1);
        const elims = [];
        for (const peer of PEERS[wing1]) {
          if (peer === hinge || peer === wing2) continue;
          if (PEERS[wing2].includes(peer) && board[peer] === 0 && (candidates[peer] & zBit)) {
            elims.push({ cellIndex: peer, digit: z });
          }
        }
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'XY-Wing' };
        }
      }
    }
  }

  return null;
}
