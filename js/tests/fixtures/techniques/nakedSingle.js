/**
 * Naked Single technique fixtures.
 * Source: sudokuwiki.org/Getting_Started
 *
 * Each position has exactly one cell with a single candidate.
 * board: 0 = empty, 1-9 = given digit.
 * expected.placements: [{cellIndex, digit}] — the naked single to place.
 */

// Position 1: cell 0 has only digit 5 remaining after all peers are filled.
// Row 0: _, 1, 2, 3, 4, 6, 7, 8, 9  → only 5 missing in row (simplified)
// We construct a board where cell 0 is the only empty cell in its row.
export const position1 = (() => {
  const board = new Uint8Array(81);
  // Row 0: cells 0-8, fill cells 1-8 with 1,2,3,4,6,7,8,9 leaving 5 for cell 0
  board[1] = 1; board[2] = 2; board[3] = 3; board[4] = 4;
  board[5] = 6; board[6] = 7; board[7] = 8; board[8] = 9;
  // Column 0 and box 0: fill to force cell 0 to be 5
  board[9]  = 2; board[18] = 3; board[27] = 4; board[36] = 6;
  board[45] = 7; board[54] = 8; board[63] = 9; board[72] = 1;
  // Box 0 cells (excluding row 0): ensure 5 is eliminated from peers
  board[10] = 8; board[11] = 9;
  board[19] = 6; board[20] = 7;
  return {
    board,
    expected: {
      placements: [{ cellIndex: 0, digit: 5 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Getting_Started',
  };
})();

// Position 2: Multiple naked singles present — returns the first one (cell 4).
export const position2 = (() => {
  const board = new Uint8Array(81);
  // Cell 4 (row 0, col 4): fill its row, col, box so only digit 9 remains.
  // Row 0: cells 0-3 and 5-8 filled
  board[0] = 1; board[1] = 2; board[2] = 3; board[3] = 4;
  board[5] = 5; board[6] = 6; board[7] = 7; board[8] = 8;
  // Col 4: cells 13,22,31,40,49,58,67,76 filled (exclude row 0)
  board[13] = 1; board[22] = 2; board[31] = 3; board[40] = 5;
  board[49] = 6; board[58] = 7; board[67] = 8; board[76] = 4;
  // Box 1 (rows 0-2, cols 3-5): cells 3,5 in row0 already set; fill remaining
  board[12] = 7; board[14] = 1;
  board[21] = 8; board[23] = 6;
  return {
    board,
    expected: {
      placements: [{ cellIndex: 4, digit: 9 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Getting_Started',
  };
})();

// Position 3: Naked single discovered after peers are placed.
// Cell 40 (center, row 4, col 4) is the only empty cell in its unit context.
export const position3 = (() => {
  const board = new Uint8Array(81);
  // Fill row 4 except cell 40 with digits 1-8
  board[36] = 1; board[37] = 2; board[38] = 3; board[39] = 4;
  board[41] = 5; board[42] = 6; board[43] = 7; board[44] = 8;
  // Fill col 4 except cell 40 with missing digits to force 9
  board[4]  = 3; board[13] = 7; board[22] = 2; board[31] = 5;
  board[49] = 6; board[58] = 8; board[67] = 1; board[76] = 4;
  // Box 4 (rows 3-5, cols 3-5): fill remaining cells
  board[30] = 6; board[32] = 7;
  board[48] = 4; board[50] = 1;
  return {
    board,
    expected: {
      placements: [{ cellIndex: 40, digit: 9 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Getting_Started',
  };
})();

// Position 4 (non-fire guard): No naked singles — all empty cells have ≥2 candidates.
export const positionNoFire = (() => {
  // Minimal board with a few givens but no naked singles.
  const board = new Uint8Array(81);
  board[0] = 1;
  board[9] = 2;
  board[18] = 3;
  return {
    board,
    expected: {
      placements: [],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Getting_Started',
  };
})();
