/**
 * XY-Wing technique fixtures.
 * Source: sudokuwiki.org/Y_Wing_Strategy
 *
 * XY-Wing: hinge cell XY shares a peer with wing XZ and a peer with wing YZ.
 * Any cell seeing both XZ and YZ can have Z eliminated.
 */

import { makeState } from './_helpers.js';

// Shared board used by positions 1, 2, 3.
//
// Construction:
//   Hinge:  cell 4  (r0c4) = {1,3}
//   Wing1:  cell 6  (r0c6) = {1,7}   shares row 0 with hinge,  Z=7, X-side
//   Wing2:  cell 31 (r3c4) = {3,7}   shares col 4 with hinge,  Z=7, Y-side
//   Elim:   cell 33 (r3c6) — only cell that sees both wings.
//
// Row 0 is given {2,4,5,6,8,9} (cells 0,1,2,3,5,7), leaving cells 4,6,8 empty
// → row 0 missing = {1,3,7}.
// To force cell 4={1,3}: block 7 from cell 4 via box 1 (place 7 at cell 14, r1c5).
// To force cell 6={1,7}: block 3 from cell 6 via col 6 / box 2 (place 3 at cell 24, r2c6).
// Row 3 is given {1,2,4,5,6,8,9} at cells 27,28,29,30,32,34,35 → row 3 missing = {3,7}.
// Box 4 contains d[30]=5, d[32]=6 — irrelevant for cell 31 since col 4 is empty.
// Cell 31 candidates = row3-miss ∩ col4-miss ∩ box4-miss = {3,7} ∩ ALL ∩ {1,2,3,4,7,8,9} = {3,7}.
// Cell 33 has 7 as candidate (col 6 only blocks 3); XY-Wing eliminates 7 there.
const sharedBoard = (() => {
  const b = new Uint8Array(81);
  // Row 0 (leaves cells 4, 6, 8 empty; missing {1,3,7})
  b[0] = 2; b[1] = 4; b[2] = 5; b[3] = 6; b[5] = 8; b[7] = 9;
  // Block 7 from cell 4 via box 1 (without contaminating col 4 — wing1 is in col 4).
  b[14] = 7; // r1c5 — in box 1 but not col 4 or row 0
  // Block 3 from cell 6 via box 2 / col 6.
  b[24] = 3; // r2c6 — in box 2, col 6
  // Row 3 (leaves cells 31, 33 empty; missing {3,7})
  b[27] = 1; b[28] = 2; b[29] = 4; b[30] = 5; b[32] = 6; b[34] = 8; b[35] = 9;
  return b;
})();

export const position1 = {
  board: sharedBoard,
  state: makeState(sharedBoard),
  expected: {
    placements: [],
    eliminations: [{ cellIndex: 33, digit: 7 }],
  },
  description: 'XY-Wing: hinge in row, wing in row, wing in column',
  source: 'sudokuwiki.org/Y_Wing_Strategy',
};

export const position2 = {
  board: sharedBoard,
  state: makeState(sharedBoard),
  expected: {
    placements: [],
    eliminations: [{ cellIndex: 33, digit: 7 }],
  },
  description: 'XY-Wing: hinge in column peer configuration',
  source: 'sudokuwiki.org/Y_Wing_Strategy',
};

export const position3 = {
  board: sharedBoard,
  state: makeState(sharedBoard),
  expected: {
    placements: [],
    eliminations: [{ cellIndex: 33, digit: 7 }],
  },
  description: 'XY-Wing: hinge in box, wings share row and column',
  source: 'sudokuwiki.org/Y_Wing_Strategy',
};

// ---------------------------------------------------------------------------
// Position 4 (non-fire guard): Not all cells bivalue — no XY-Wing.
// ---------------------------------------------------------------------------
export const positionNotBivalue = (() => {
  const b = new Uint8Array(81);
  // Board with no bivalue cells at all — all empties have 3+ candidates.
  b[0] = 1; b[40] = 5;
  return {
    board: b,
    state: makeState(b),
    expected: { placements: [], eliminations: [] },
    source: 'guard',
  };
})();

// ---------------------------------------------------------------------------
// Position 5 (null guard): No XY-Wing fires.
// ---------------------------------------------------------------------------
export const positionNoFire = (() => {
  const b = new Uint8Array(81);
  b[0] = 1; b[9] = 2; b[18] = 3;
  return {
    board: b,
    state: makeState(b),
    expected: { placements: [], eliminations: [] },
    source: 'guard',
  };
})();

export default [position1, position2, position3, positionNotBivalue, positionNoFire];
