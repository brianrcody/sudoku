/**
 * Jellyfish technique fixtures.
 * Source: sudokuwiki.org/Jelly_Fish_Strategy
 *
 * Jellyfish: digit D confined to ≤4 cells in each of 4 rows (or columns),
 * and all candidate cells lie within the same 4 columns (or rows).
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Position 1: Row-based Jellyfish (4×4).
//
// Digit 8 confined in rows 0, 2, 5, 7 to cols {0, 2, 6, 8}.
// Eliminates 8 from those cols in rows 1, 3, 4, 6, 8.
// ---------------------------------------------------------------------------
export const position1 = (() => {
  const b = new Uint8Array(81);

  // Row 0 (cells 0-8): block 8 from all except cells 0, 2, 6, 8 (cols 0,2,6,8).
  b[1] = 1; b[3] = 2; b[4] = 3; b[5] = 4; b[7] = 5;

  // Row 2 (cells 18-26): block 8 from all except cells 18, 20, 24, 26.
  b[19] = 1; b[21] = 2; b[22] = 3; b[23] = 4; b[25] = 5;

  // Row 5 (cells 45-53): block 8 from all except cells 45, 47, 51, 53.
  b[46] = 1; b[48] = 2; b[49] = 3; b[50] = 4; b[52] = 5;

  // Row 7 (cells 63-71): block 8 from all except cells 63, 65, 69, 71.
  b[64] = 1; b[66] = 2; b[67] = 3; b[68] = 4; b[70] = 5;

  // Jellyfish covers cols 0, 2, 6, 8. Eliminate 8 from those cols in non-base rows.
  // Non-base rows: 1,3,4,6,8.
  // col0: rows 1,3,4,6,8 = cells 9,27,36,54,72
  // col2: rows 1,3,4,6,8 = cells 11,29,38,56,74
  // col6: rows 1,3,4,6,8 = cells 15,33,42,60,78
  // col8: rows 1,3,4,6,8 = cells 17,35,44,62,80

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 9,  digit: 8 }, { cellIndex: 27, digit: 8 }, { cellIndex: 36, digit: 8 },
        { cellIndex: 54, digit: 8 }, { cellIndex: 72, digit: 8 },
        { cellIndex: 11, digit: 8 }, { cellIndex: 29, digit: 8 }, { cellIndex: 38, digit: 8 },
        { cellIndex: 56, digit: 8 }, { cellIndex: 74, digit: 8 },
        { cellIndex: 15, digit: 8 }, { cellIndex: 33, digit: 8 }, { cellIndex: 42, digit: 8 },
        { cellIndex: 60, digit: 8 }, { cellIndex: 78, digit: 8 },
        { cellIndex: 17, digit: 8 }, { cellIndex: 35, digit: 8 }, { cellIndex: 44, digit: 8 },
        { cellIndex: 62, digit: 8 }, { cellIndex: 80, digit: 8 },
      ],
    },
    source: 'sudokuwiki.org/Jelly_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 2: Column-based Jellyfish (4×4).
//
// Digit 3 confined in cols 1, 3, 5, 7 to rows {0, 3, 6, 8}.
// Eliminates 3 from rows 0, 3, 6, 8 outside those columns.
// ---------------------------------------------------------------------------
export const position2 = (() => {
  const b = new Uint8Array(81);

  // Col 1 (cells 1,10,19,...): block 3 from all except rows 0,3,6,8.
  b[10] = 1; b[28] = 2; b[37] = 4; b[55] = 5; b[64] = 6;
  // Wait: col1 cells for rows 0,3,6,8 = cells 1,28,55,73.
  // Block from rows 1,2,4,5,7 = cells 10,19,37,46,64.
  const c = new Uint8Array(81);
  // Col 1: block 3 from rows 1,2,4,5,7 (cells 10,19,37,46,64) → place 3 in their rows.
  c[9]  = 3; // row1, col0 → blocks row1 → cell 10 (row1,col1) loses 3
  c[18] = 3; // row2, col0 → blocks row2 → cell 19 loses 3
  c[36] = 3; // row4, col0 → blocks row4 → cell 37 loses 3
  c[45] = 3; // row5, col0 → blocks row5 → cell 46 loses 3
  c[63] = 3; // row7, col0 → blocks row7 → cell 64 loses 3

  // Col 3: block 3 from rows 1,2,4,5,7 (cells 12,21,39,48,66).
  c[11] = 3; // row1,col2 → blocks row1 → cell 12 loses 3 (but row1 already has 3@col0)
  // Actually once row1 has 3 at col0, ALL row1 cells lose 3 including cols 3,5,7. ✓
  // Same rows 2,4,5,7.

  // Col 5: block 3 from rows 1,2,4,5,7 — already handled by row placements above. ✓
  // Col 7: same. ✓

  // Rows 0,3,6,8 must have 3 as candidate in non-{1,3,5,7} cols for eliminations.
  // Row 0: non-base cols = 0,2,4,6,8 = cells 0,2,4,6,8.
  // Row 3: non-base cols = cells 27,29,31,33,35.
  // Row 6: non-base cols = cells 54,56,58,60,62.
  // Row 8: non-base cols = cells 72,74,76,78,80.

  return {
    board: c,
    state: makeState(c),
    expected: {
      placements: [],
      eliminations: [
        // row 0 non-base cols 0,2,4,6,8
        { cellIndex: 0,  digit: 3 }, { cellIndex: 2,  digit: 3 }, { cellIndex: 4,  digit: 3 },
        { cellIndex: 6,  digit: 3 }, { cellIndex: 8,  digit: 3 },
        // row 3 non-base cols 0,2,4,6,8
        { cellIndex: 27, digit: 3 }, { cellIndex: 29, digit: 3 }, { cellIndex: 31, digit: 3 },
        { cellIndex: 33, digit: 3 }, { cellIndex: 35, digit: 3 },
        // row 6 non-base cols 0,2,4,6,8
        { cellIndex: 54, digit: 3 }, { cellIndex: 56, digit: 3 }, { cellIndex: 58, digit: 3 },
        { cellIndex: 60, digit: 3 }, { cellIndex: 62, digit: 3 },
        // row 8 non-base cols 0,2,4,6,8
        { cellIndex: 72, digit: 3 }, { cellIndex: 74, digit: 3 }, { cellIndex: 76, digit: 3 },
        { cellIndex: 78, digit: 3 }, { cellIndex: 80, digit: 3 },
      ],
    },
    source: 'sudokuwiki.org/Jelly_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 3: Row-based Jellyfish with irregular counts (2-3-4-4).
//
// Digit 6 in rows 1,3,5,7 spanning cols {0,3,5,7}.
// Row 1: cols {0,3} (2 cells); rows 3,5,7: cols {0,3,5,7} (up to 4 cells each).
// ---------------------------------------------------------------------------
export const position3 = (() => {
  const b = new Uint8Array(81);

  // Row 1 (cells 9-17): 6 only at cols 0 and 3 (cells 9 and 12).
  b[10] = 1; b[11] = 2; b[13] = 3; b[14] = 4; b[15] = 5; b[16] = 7; b[17] = 8;

  // Row 3 (cells 27-35): 6 only at cols 0,3,5,7 (cells 27,30,32,34).
  b[28] = 1; b[29] = 2; b[31] = 3; b[33] = 4; b[35] = 8;

  // Row 5 (cells 45-53): 6 only at cols 0,3,5,7 (cells 45,48,50,52).
  b[46] = 1; b[47] = 2; b[49] = 3; b[51] = 4; b[53] = 8;

  // Row 7 (cells 63-71): 6 only at cols 0,3,5,7 (cells 63,66,68,70).
  b[64] = 1; b[65] = 2; b[67] = 3; b[69] = 4; b[71] = 8;

  // Cover = {0,3,5,7}. Eliminate 6 from cols 0,3,5,7 in non-base rows 0,2,4,6,8.
  // col0: rows 0,2,4,6,8 = cells 0,18,36,54,72
  // col3: rows 0,2,4,6,8 = cells 3,21,39,57,75
  // col5: rows 0,2,4,6,8 = cells 5,23,41,59,77
  // col7: rows 0,2,4,6,8 = cells 7,25,43,61,79

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 0,  digit: 6 }, { cellIndex: 18, digit: 6 }, { cellIndex: 36, digit: 6 },
        { cellIndex: 54, digit: 6 }, { cellIndex: 72, digit: 6 },
        { cellIndex: 3,  digit: 6 }, { cellIndex: 21, digit: 6 }, { cellIndex: 39, digit: 6 },
        { cellIndex: 57, digit: 6 }, { cellIndex: 75, digit: 6 },
        { cellIndex: 5,  digit: 6 }, { cellIndex: 23, digit: 6 }, { cellIndex: 41, digit: 6 },
        { cellIndex: 59, digit: 6 }, { cellIndex: 77, digit: 6 },
        { cellIndex: 7,  digit: 6 }, { cellIndex: 25, digit: 6 }, { cellIndex: 43, digit: 6 },
        { cellIndex: 61, digit: 6 }, { cellIndex: 79, digit: 6 },
      ],
    },
    source: 'sudokuwiki.org/Jelly_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 4 (null guard): No Jellyfish pattern.
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

export default [position1, position2, position3, positionNoFire];
