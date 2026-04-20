/**
 * X-Wing technique fixtures.
 * Source: sudokuwiki.org/X_Wing_Strategy
 *
 * X-Wing: digit D confined to exactly 2 rows (or columns) each having exactly 2
 * candidate cells, and those cells share the same 2 columns (or rows).
 * Eliminates D from those 2 columns (or rows) outside the base rows.
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Position 1: Row-based X-Wing.
//
// Digit 6 confined to exactly two cells in each of rows 0 and 4,
// both pairs in columns 2 and 6. Eliminates 6 from cols 2 and 6 elsewhere.
// ---------------------------------------------------------------------------
export const position1 = (() => {
  const b = new Uint8Array(81);

  // Block digit 6 from all rows except 0 and 4 in cols 2 and 6.
  // Also block 6 from other cells in rows 0 and 4 so it appears only in c2 and c6.

  // Row 0: block 6 from cells 0,1,3,4,5,7,8 (leave cells 2 and 6 free for digit 6).
  // Place 6 in the columns of those cells (via other rows).
  b[9]  = 6; // col 0, row 1 — blocks 6 from cell 0 (row 0, col 0)
  b[19] = 6; // col 1, row 2 — blocks 6 from cell 1
  // col 2 and col 6 must NOT have 6 placed — leave them open.
  b[30] = 6; // col 3, row 3 — blocks 6 from cell 3
  b[40] = 6; // col 4, row 4 — blocks 6 from cell 4 (row 0, col 4)
  b[50] = 6; // col 5, row 5 — blocks 6 from cell 5
  b[61] = 6; // col 7, row 6 — blocks 6 from cell 7 (row 0, col 7) — wait 6*9+7=61 ✓
  b[71] = 6; // col 8, row 7 — blocks 6 from cell 8 (row 0, col 8) — 7*9+8=71 ✓

  // But we placed 6 in rows 1,2,3,4,5,6,7 in various cols.
  // Row 4 also needs 6 only in cols 2 and 6.
  // Row 4 = cells 36-44. We already placed b[40]=6 (row4, col4) — that blocks col4 row4.
  // That placement IS in row 4, so row 4 already has a 6 at col 4 — bad for our X-Wing!
  // We want row 4 to have 6 only at cols 2 and 6.

  // Start over with a cleaner construction.
  const c = new Uint8Array(81);

  // Build: digit 1 forms an X-Wing in rows 1 and 5, columns 3 and 7.
  // Row 1 (cells 9-17): block 1 from all cells except col3 (cell 12) and col7 (cell 16).
  c[9]  = 2; // row1,col0 — gives 2 here, blocks 1 from col0-row1 (not needed if row has 1 elsewhere)
  // Use row-level: fill row 1 except cells 12 and 16 with digits that don't include 1.
  c[9]  = 2; c[10] = 3; c[11] = 4; // col 0,1,2
  // skip cell 12 (col3) — target
  c[13] = 5; c[14] = 6; c[15] = 7; // col 4,5,6
  // skip cell 16 (col7) — target
  c[17] = 8; // col 8

  // Row 5 (cells 45-53): similarly block 1 from all except col3 (cell 48) and col7 (cell 52).
  c[45] = 2; c[46] = 3; c[47] = 4;
  // skip cell 48 (col3)
  c[49] = 5; c[50] = 6; c[51] = 7;
  // skip cell 52 (col7)
  c[53] = 8;

  // Now digit 1 in rows 1 and 5 can only go in {col3, col7}.
  // For X-Wing: we need 1 to have exactly 2 candidate cells per row, and those to be
  // the same two columns. That's satisfied: {12,16} and {48,52}.
  // But we also need 1 to appear in cols 3 and 7 in OTHER rows (for eliminations to exist).
  // Don't block 1 from col3 or col7 in other rows. Col3 and col7 are currently open.
  // Other rows (0,2,3,4,6,7,8) have no restrictions from our placements, so
  // cells in col3 and col7 for those rows will have 1 as a candidate.

  // Also ensure col3 and col7 don't already have 1 placed (which would eliminate candidates).
  // Currently no placement of 1 in col3 or col7 — good.

  // Verify: cells in col3 outside rows 1,5 (cells 3,21,30,39,57,66,75) and
  //         cells in col7 outside rows 1,5 (cells 7,25,34,43,61,70,79)
  // should have 1 as a candidate → those are the X-Wing eliminations.

  return {
    board: c,
    state: makeState(c),
    expected: {
      placements: [],
      eliminations: [
        // col3 cells not in rows 1 or 5: rows 0,2,3,4,6,7,8 = cells 3,21,30,39,57,66,75
        { cellIndex: 3,  digit: 1 },
        { cellIndex: 21, digit: 1 },
        { cellIndex: 30, digit: 1 },
        { cellIndex: 39, digit: 1 },
        { cellIndex: 57, digit: 1 },
        { cellIndex: 66, digit: 1 },
        { cellIndex: 75, digit: 1 },
        // col7 cells not in rows 1 or 5: rows 0,2,3,4,6,7,8 = cells 7,25,34,43,61,70,79
        { cellIndex: 7,  digit: 1 },
        { cellIndex: 25, digit: 1 },
        { cellIndex: 34, digit: 1 },
        { cellIndex: 43, digit: 1 },
        { cellIndex: 61, digit: 1 },
        { cellIndex: 70, digit: 1 },
        { cellIndex: 79, digit: 1 },
      ],
    },
    source: 'sudokuwiki.org/X_Wing_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 2: Column-based X-Wing.
//
// Digit 3 confined to exactly 2 rows (rows 2 and 6) in each of cols 1 and 5.
// But using the column orientation: 3 confined to cols 2 and 8, rows 0 and 3.
// Eliminates 3 from rows 0 and 3 outside cols 2 and 8.
// ---------------------------------------------------------------------------
export const position2 = (() => {
  const b = new Uint8Array(81);

  // Column-based X-Wing: digit 5 confined to 2 cells in each of cols 0 and 6,
  // and those 2 cells share rows 2 and 7.
  // Col 0 (cells 0,9,18,27,36,45,54,63,72): block 5 from all except rows 2 (cell 18) and 7 (cell 63).
  b[0]  = 1; b[9]  = 2; b[27] = 3; b[36] = 4; b[45] = 6; b[54] = 7; b[72] = 8;
  // Cells 18 and 63 are left empty — digit 5 can go there in col 0.

  // Col 6 (cells 6,15,24,33,42,51,60,69,78): block 5 from all except rows 2 (cell 24) and 7 (cell 69).
  b[6]  = 1; b[15] = 2; b[33] = 3; b[42] = 4; b[51] = 6; b[60] = 7; b[78] = 8;
  // Cells 24 and 69 are left empty — digit 5 can go there in col 6.

  // Now 5 in col 0 is only at rows 2,7 and 5 in col 6 is only at rows 2,7.
  // This forms an X-Wing on rows 2 and 7.
  // Eliminations: row 2 (cells 10-17, not cols 0 and 6) and row 7 (cells 55-71, not cols 0 and 6).
  // Row 2: cells 9..17. Col 0 (cell 18) and col 6 (cell 24) are IN the X-Wing so don't eliminate.
  // Row 2 cells outside cols 0 and 6: 19,20,21,22,23,25,26.
  // Row 7 cells outside cols 0 and 6: 64,65,66,67,68,70,71.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        // row 2 non-X-Wing cells: cells 19,20,21,22,23,25,26
        { cellIndex: 19, digit: 5 },
        { cellIndex: 20, digit: 5 },
        { cellIndex: 21, digit: 5 },
        { cellIndex: 22, digit: 5 },
        { cellIndex: 23, digit: 5 },
        { cellIndex: 25, digit: 5 },
        { cellIndex: 26, digit: 5 },
        // row 7 non-X-Wing cells: cells 64,65,66,67,68,70,71
        { cellIndex: 64, digit: 5 },
        { cellIndex: 65, digit: 5 },
        { cellIndex: 66, digit: 5 },
        { cellIndex: 67, digit: 5 },
        { cellIndex: 68, digit: 5 },
        { cellIndex: 70, digit: 5 },
        { cellIndex: 71, digit: 5 },
      ],
    },
    source: 'sudokuwiki.org/X_Wing_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 3: X-Wing where all four corners are bivalue cells.
// Same row-based pattern but the 4 corner cells each have exactly 2 candidates.
// ---------------------------------------------------------------------------
export const position3 = (() => {
  const b = new Uint8Array(81);

  // Digit 9 forms X-Wing in rows 3 and 6, cols 1 and 8.
  // Row 3 (27-35): block 9 from all except col1 (cell 28) and col8 (cell 35).
  b[27] = 1; b[29] = 2; b[30] = 3; b[31] = 4; b[32] = 5; b[33] = 6; b[34] = 7;

  // Row 6 (54-62): block 9 from all except col1 (cell 55) and col8 (cell 62).
  b[54] = 1; b[56] = 2; b[57] = 3; b[58] = 4; b[59] = 5; b[60] = 6; b[61] = 7;

  // Make the 4 corners bivalue by also blocking all digits except {9, X} from them.
  // Cell 28 (r3,c1): row3 has {1,2,3,4,5,6,7} → row blocks those → cell28 has {8,9}.
  // Cell 35 (r3,c8): row3 same → cell35 has {8,9}.
  // Cell 55 (r6,c1): row6 has {1,2,3,4,5,6,7} → cell55 has {8,9}.
  // Cell 62 (r6,c8): row6 same → cell62 has {8,9}.
  // All four corners are bivalue {8,9}. ✓

  // For eliminations to exist: col1 and col8 need other rows with 9 as candidate.
  // Col1 and col8 are not blocked in other rows.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        // col1 outside rows 3,6: cells 1,10,19,37,46,64,73
        { cellIndex: 1,  digit: 9 },
        { cellIndex: 10, digit: 9 },
        { cellIndex: 19, digit: 9 },
        { cellIndex: 37, digit: 9 },
        { cellIndex: 46, digit: 9 },
        { cellIndex: 64, digit: 9 },
        { cellIndex: 73, digit: 9 },
        // col8 outside rows 3,6: cells 8,17,26,44,53,71,80
        { cellIndex: 8,  digit: 9 },
        { cellIndex: 17, digit: 9 },
        { cellIndex: 26, digit: 9 },
        { cellIndex: 44, digit: 9 },
        { cellIndex: 53, digit: 9 },
        { cellIndex: 71, digit: 9 },
        { cellIndex: 80, digit: 9 },
      ],
    },
    source: 'sudokuwiki.org/X_Wing_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 4 (non-fire guard): Only 3 corners present — not a valid X-Wing.
// ---------------------------------------------------------------------------
export const positionNearMiss = (() => {
  const b = new Uint8Array(81);

  // Digit 7 in rows 0 and 1: row 0 has 7 only at cols 2 and 5 (cells 2,5);
  // row 1 has 7 only at cols 2 and 4 (cells 11,13) — mismatched columns → no X-Wing.
  b[0]  = 1; b[1] = 2; b[3] = 3; b[4] = 4; b[6] = 5; b[7] = 6; b[8] = 8;
  b[9]  = 1; b[10] = 2; b[12] = 3; b[14] = 4; b[15] = 5; b[16] = 6; b[17] = 8;

  return {
    board: b,
    state: makeState(b),
    expected: { placements: [], eliminations: [] },
    source: 'sudokuwiki.org/X_Wing_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 5 (null guard): No X-Wing pattern exists.
// ---------------------------------------------------------------------------
export const positionNoFire = (() => {
  const b = new Uint8Array(81);
  b[0] = 1; b[40] = 5; b[80] = 9;
  return {
    board: b,
    state: makeState(b),
    expected: { placements: [], eliminations: [] },
    source: 'guard',
  };
})();

export default [position1, position2, position3, positionNearMiss, positionNoFire];
