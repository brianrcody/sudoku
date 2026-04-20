/**
 * Swordfish technique fixtures.
 * Source: sudokuwiki.org/Sword_Fish_Strategy
 *
 * Swordfish: digit D confined to ≤3 cells in each of 3 rows (or columns),
 * and all candidate cells lie within the same 3 columns (or rows).
 * Eliminates D from those 3 columns (or rows) outside the base rows.
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Position 1: Row-based Swordfish (3×3).
//
// Digit 2 confined in rows 0, 3, 6 to cols {1, 4, 7}.
// Eliminates 2 from cols 1, 4, 7 in all other rows.
// ---------------------------------------------------------------------------
export const position1 = (() => {
  const b = new Uint8Array(81);

  // Row 0 (cells 0-8): block 2 from all except cells 1, 4, 7.
  b[0] = 1; b[2] = 3; b[3] = 4; b[5] = 5; b[6] = 6; b[8] = 7;

  // Row 3 (cells 27-35): block 2 from all except cells 28, 31, 34.
  b[27] = 1; b[29] = 3; b[30] = 4; b[32] = 5; b[33] = 6; b[35] = 7;

  // Row 6 (cells 54-62): block 2 from all except cells 55, 58, 61.
  b[54] = 1; b[56] = 3; b[57] = 4; b[59] = 5; b[60] = 6; b[62] = 7;

  // Cols 1, 4, 7 must have 2 as a candidate in non-base rows (1,2,4,5,7,8)
  // so eliminations can occur. Those cols are not blocked elsewhere.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        // col1 (cells with col=1) not in rows 0,3,6: rows 1,2,4,5,7,8 = cells 10,19,37,46,64,73
        { cellIndex: 10, digit: 2 },
        { cellIndex: 19, digit: 2 },
        { cellIndex: 37, digit: 2 },
        { cellIndex: 46, digit: 2 },
        { cellIndex: 64, digit: 2 },
        { cellIndex: 73, digit: 2 },
        // col4: rows 1,2,4,5,7,8 = cells 13,22,40,49,67,76
        { cellIndex: 13, digit: 2 },
        { cellIndex: 22, digit: 2 },
        { cellIndex: 40, digit: 2 },
        { cellIndex: 49, digit: 2 },
        { cellIndex: 67, digit: 2 },
        { cellIndex: 76, digit: 2 },
        // col7: rows 1,2,4,5,7,8 = cells 16,25,43,52,70,79
        { cellIndex: 16, digit: 2 },
        { cellIndex: 25, digit: 2 },
        { cellIndex: 43, digit: 2 },
        { cellIndex: 52, digit: 2 },
        { cellIndex: 70, digit: 2 },
        { cellIndex: 79, digit: 2 },
      ],
    },
    source: 'sudokuwiki.org/Sword_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 2: Column-based Swordfish (3×3).
//
// Digit 4 confined in cols 0, 3, 6 to rows {2, 5, 8}.
// Eliminates 4 from rows 2, 5, 8 outside those three columns.
// ---------------------------------------------------------------------------
export const position2 = (() => {
  const b = new Uint8Array(81);

  // Col 0 (cells 0,9,18,...,72): block 4 from all except rows 2 (18), 5 (45), 8 (72).
  b[0]  = 1; b[9]  = 2; b[27] = 3; b[36] = 5; b[54] = 6; b[63] = 7;

  // Col 3 (cells 3,12,21,...,75): block 4 from all except rows 2 (21), 5 (48), 8 (75).
  b[3]  = 1; b[12] = 2; b[30] = 3; b[39] = 5; b[57] = 6; b[66] = 7;

  // Col 6 (cells 6,15,24,...,78): block 4 from all except rows 2 (24), 5 (51), 8 (78).
  b[6]  = 1; b[15] = 2; b[33] = 3; b[42] = 5; b[60] = 6; b[69] = 7;

  // Rows 2, 5, 8 must have 4 in non-base cols for eliminations.
  // Row 2 (cells 18-26): cols 0,3,6 are base; other cells (19,20,22,23,25,26) can have 4.
  // Row 5 (cells 45-53): similarly 46,47,49,50,52,53.
  // Row 8 (cells 72-80): similarly 73,74,76,77,79,80.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        // row 2 non-base cols (not 0,3,6): cells 19,20,22,23,25,26
        { cellIndex: 19, digit: 4 },
        { cellIndex: 20, digit: 4 },
        { cellIndex: 22, digit: 4 },
        { cellIndex: 23, digit: 4 },
        { cellIndex: 25, digit: 4 },
        { cellIndex: 26, digit: 4 },
        // row 5 non-base cols: cells 46,47,49,50,52,53
        { cellIndex: 46, digit: 4 },
        { cellIndex: 47, digit: 4 },
        { cellIndex: 49, digit: 4 },
        { cellIndex: 50, digit: 4 },
        { cellIndex: 52, digit: 4 },
        { cellIndex: 53, digit: 4 },
        // row 8 non-base cols: cells 73,74,76,77,79,80
        { cellIndex: 73, digit: 4 },
        { cellIndex: 74, digit: 4 },
        { cellIndex: 76, digit: 4 },
        { cellIndex: 77, digit: 4 },
        { cellIndex: 79, digit: 4 },
        { cellIndex: 80, digit: 4 },
      ],
    },
    source: 'sudokuwiki.org/Sword_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 3: Irregular Swordfish — rows have 2-3-3 candidate counts.
//
// Row 1 has digit 7 in cols {2, 5} (count=2).
// Row 4 has digit 7 in cols {2, 5, 8} (count=3).
// Row 7 has digit 7 in cols {2, 5, 8} (count=3).
// Cover cols = {2, 5, 8}. Eliminates 7 from those cols in rows 0,2,3,5,6,8.
// ---------------------------------------------------------------------------
export const position3 = (() => {
  const b = new Uint8Array(81);

  // Row 1 (cells 9-17): block 7 from all except cells 11 (col2) and 14 (col5).
  b[9] = 1; b[10] = 2; b[12] = 3; b[13] = 4; b[15] = 5; b[16] = 6; b[17] = 8;

  // Row 4 (cells 36-44): block 7 from all except cells 38 (col2), 41 (col5), 44 (col8).
  b[36] = 1; b[37] = 2; b[39] = 3; b[40] = 4; b[42] = 5; b[43] = 6;

  // Row 7 (cells 63-71): block 7 from all except cells 65 (col2), 68 (col5), 71 (col8).
  b[63] = 1; b[64] = 2; b[66] = 3; b[67] = 4; b[69] = 5; b[70] = 6;

  // Result: 7 is in rows {1,4,7} only, within cover cols {2,5,8}.
  // Eliminates from col2 rows 0,2,3,5,6,8 = cells 2,20,29,47,56,74;
  // col5 rows 0,2,3,5,6,8 = cells 5,23,32,50,59,77;
  // col8 rows 0,2,3,5,6,8 = cells 8,26,35,53,62,80.
  // Note: row 1 doesn't use col8, but that's fine — cover size = 3.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 2,  digit: 7 }, { cellIndex: 20, digit: 7 }, { cellIndex: 29, digit: 7 },
        { cellIndex: 47, digit: 7 }, { cellIndex: 56, digit: 7 }, { cellIndex: 74, digit: 7 },
        { cellIndex: 5,  digit: 7 }, { cellIndex: 23, digit: 7 }, { cellIndex: 32, digit: 7 },
        { cellIndex: 50, digit: 7 }, { cellIndex: 59, digit: 7 }, { cellIndex: 77, digit: 7 },
        { cellIndex: 8,  digit: 7 }, { cellIndex: 26, digit: 7 }, { cellIndex: 35, digit: 7 },
        { cellIndex: 53, digit: 7 }, { cellIndex: 62, digit: 7 }, { cellIndex: 80, digit: 7 },
      ],
    },
    source: 'sudokuwiki.org/Sword_Fish_Strategy',
  };
})();

// ---------------------------------------------------------------------------
// Position 4 (non-fire guard): Only 2 rows qualify — X-Wing not Swordfish.
// The fish size check requires exactly 3 base rows for Swordfish.
// ---------------------------------------------------------------------------
export const positionNonFire = (() => {
  const b = new Uint8Array(81);

  // Digit 3 only in rows 0 and 2, cols {1,5} — this is an X-Wing, not a Swordfish.
  // A 3-base-unit search would not find 3 rows since only 2 are eligible.
  b[0] = 2; b[2] = 4; b[3] = 5; b[4] = 6; b[6] = 7; b[7] = 8; b[8] = 9;
  b[18] = 2; b[20] = 4; b[21] = 5; b[22] = 6; b[24] = 7; b[25] = 8; b[26] = 9;

  return {
    board: b,
    state: makeState(b),
    expected: { placements: [], eliminations: [] },
    source: 'guard',
  };
})();

// ---------------------------------------------------------------------------
// Position 5 (null guard): No Swordfish pattern.
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

export default [position1, position2, position3, positionNonFire, positionNoFire];
