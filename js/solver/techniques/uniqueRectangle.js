/**
 * @fileoverview Unique Rectangle technique, Types 1, 2, and 4 (rank 20).
 *
 * Four unsolved cells at the intersections of two rows and two columns,
 * spanning exactly two boxes, with a shared candidate pair {a,b}. If all four
 * could be reduced to {a,b}, the pair could swap freely between the corners,
 * giving two solutions — impossible in a valid puzzle. Each type eliminates
 * whatever would complete that deadly pattern:
 *
 * - Type 1: three corners are exactly {a,b} → the fourth cannot be; remove
 *   a and b from it.
 * - Type 2: two corners are exactly {a,b}, the other two exactly {a,b,c} and
 *   adjacent (sharing a row or column) → c must occupy one of them; remove c
 *   from outside cells seeing both.
 * - Type 4: a floor pair is exactly {a,b}; in a unit shared by the roof pair,
 *   digit a appears only in the roof pair → neither roof cell can be b;
 *   remove b from both (and symmetrically with a/b swapped).
 *
 * Reference: sudokuwiki.org/Unique_Rectangles
 */

import { PEERS, UNITS_OF, boxOf } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {object|null}
 */
export default function uniqueRectangle(state) {
  const { board, candidates } = state;

  for (let r1 = 0; r1 < 8; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 8; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];

          // The deadly-pattern swap preserves box constraints only when the
          // rectangle spans exactly two boxes.
          if (new Set(cells.map(boxOf)).size !== 2) continue;
          if (cells.some(i => board[i] !== 0)) continue;

          const result =
            urType1(board, candidates, cells) ||
            urType2(board, candidates, cells) ||
            urType4(board, candidates, cells);
          if (result) return result;
        }
      }
    }
  }

  return null;
}

/** Type 1: three floor corners exactly {a,b}; roof holds {a,b} plus extras. */
function urType1(board, candidates, cells) {
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
    if ((roofMask & floorMask) !== floorMask) continue;
    if (count(roofMask) < 3) continue;

    const digits = iterate(floorMask);
    return makeResult(1, cells, digits, null,
      digits.map(d => ({ cellIndex: roof, digit: d })));
  }
  return null;
}

/** Type 2: two corners exactly {a,b}; two adjacent corners exactly {a,b,c}. */
function urType2(board, candidates, cells) {
  for (const [f1, f2, t1, t2] of CORNER_SPLITS) {
    const floorMask = candidates[cells[f1]];
    if (count(floorMask) !== 2) continue;
    if (candidates[cells[f2]] !== floorMask) continue;

    const roofA = cells[t1];
    const roofB = cells[t2];
    const extra = candidates[roofA] & ~floorMask;
    if (count(extra) !== 1) continue;
    if (candidates[roofA] !== (floorMask | extra)) continue;
    if (candidates[roofB] !== candidates[roofA]) continue;
    // CORNER_SPLITS pairs are always adjacent, so this is Type 2 proper
    // (diagonal Type-5 variants are never generated).

    const c = iterate(extra)[0];
    const elims = [];
    for (const peer of PEERS[roofA]) {
      if (cells.includes(peer)) continue;
      if (board[peer] !== 0 || !(candidates[peer] & extra)) continue;
      if (PEERS[roofB].includes(peer)) {
        elims.push({ cellIndex: peer, digit: c });
      }
    }
    if (elims.length > 0) {
      return makeResult(2, cells, iterate(floorMask), c, elims);
    }
  }
  return null;
}

/** Type 4: roof pair locks digit a in a shared unit → remove b from the roof. */
function urType4(board, candidates, cells) {
  for (const [f1, f2, t1, t2] of CORNER_SPLITS) {
    const floorMask = candidates[cells[f1]];
    if (count(floorMask) !== 2) continue;
    if (candidates[cells[f2]] !== floorMask) continue;

    const roofA = cells[t1];
    const roofB = cells[t2];
    if ((candidates[roofA] & floorMask) !== floorMask) continue;
    if ((candidates[roofB] & floorMask) !== floorMask) continue;
    // Roof cells must have extra candidates, else the board is already broken.
    if (candidates[roofA] === floorMask || candidates[roofB] === floorMask) continue;

    const [a, b] = iterate(floorMask);
    for (const [lockDigit, removeDigit] of [[a, b], [b, a]]) {
      const lockBit = 1 << (lockDigit - 1);
      // A unit shared by both roof cells where lockDigit appears only there.
      for (const unit of UNITS_OF[roofA]) {
        if (!unit.includes(roofB)) continue;
        let lockedToRoof = true;
        for (const i of unit) {
          if (i === roofA || i === roofB) continue;
          if (board[i] === 0 && (candidates[i] & lockBit)) { lockedToRoof = false; break; }
        }
        if (!lockedToRoof) continue;

        return makeResult(4, cells, iterate(floorMask), removeDigit, [
          { cellIndex: roofA, digit: removeDigit },
          { cellIndex: roofB, digit: removeDigit },
        ]);
      }
    }
  }
  return null;
}

/**
 * Corner-index splits [floor1, floor2, roof1, roof2] where each pair is
 * adjacent (shares a row or column). cells order: [r1c1, r1c2, r2c1, r2c2].
 */
const CORNER_SPLITS = [
  [0, 1, 2, 3], // floor = top row,    roof = bottom row
  [2, 3, 0, 1], // floor = bottom row, roof = top row
  [0, 2, 1, 3], // floor = left col,   roof = right col
  [1, 3, 0, 2], // floor = right col,  roof = left col
];

function makeResult(urType, cells, urDigits, urExtra, eliminations) {
  return {
    placements: [],
    eliminations,
    technique: 'Unique Rectangle',
    urType,
    urCells: [...cells],
    urDigits,
    urExtra,
  };
}
