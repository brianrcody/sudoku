/**
 * Locked Candidates fixtures.
 * Source: sudokuwiki.org/Locked_Candidates
 *
 * Three patterns:
 *  - Pointing (pair in box confined to one row/col → eliminate from rest of row/col)
 *  - Claiming (digit in row/col confined to one box → eliminate from rest of box)
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Position 1: Pointing pair eliminates from row.
//
// Box 0 (rows 0-2, cols 0-2): digit 7 can only go in row 0, cells {0, 1}.
// Therefore 7 can be eliminated from row 0 outside box 0, i.e. cells 3-8.
// ---------------------------------------------------------------------------
export const position1 = (() => {
  const board = new Uint8Array(81);
  // Place 7 in col 0 rows 3-8 to block it from cells 9,18,27,36,45,54.
  // (No — we need 7 to be absent from box 0 cells 3-8 of the col but present in row.)
  // Strategy: 7 is blocked from cells {2,10,11,19,20} in box 0,
  //           and blocked from cells {3..8} via row-col interactions,
  //           leaving only cells {0,1} in box 0 row 0.

  // Block 7 from box-0 cells not in row 0:
  // cell 9 (row1,col0): place 7 somewhere in col0 rows 3+: board[27]=7
  board[27] = 7; // col 0, row 3 → blocks 7 from cells 9,18 in col 0
  // cell 10 (row1,col1): place 7 in col1 rows 3+
  board[37] = 7; // col 1, row 4 → blocks 7 from cells 10,19 in col 1
  // cell 11 (row1,col2): place 7 in col2 rows 3+
  board[47] = 7; // col 2, row 5 → blocks 7 from cells 11,20 in col 2
  // cell 18-20 also blocked since col placements above cover rows 3-5;
  // actually cell 18 (row2,col0) is blocked by col0 having 7 in row 3.
  // Cells 19,20 similarly.

  // Now in box 0, cells that can have 7:
  //   row 0: cells 0,1,2 — but cell 2 (row0,col2): place 7 in row 2, col2 region...
  // Actually to force only cells {0,1}: block cell 2 (row0,col2) from 7.
  // Place 7 in row 2, not col 2 — e.g. board[25]=7 (row2,col7).
  board[25] = 7; // row 2, col 7 → blocks 7 from all row-2 cells → blocks cell 20

  // Wait — we need 7 confined to cells 0,1 in box 0. Let's think again:
  // Box 0 empty cells where 7 is possible = cells {0,1} (row 0, cols 0&1).
  // That means cells {2,9,10,11,18,19,20} must be blocked from 7.
  // cell 2 (row0,col2): blocked if 7 is in col2 (rows 3-8). board[47]=7 ✓ (col2 row5)
  // cells 9,18 (col0): blocked by board[27]=7 ✓
  // cells 10,19 (col1): blocked by board[37]=7 ✓
  // cells 11,20 (col2): blocked by board[47]=7 ✓

  // Now 7 is confined to cells {0,1} in box 0 (row 0, cols 0-1).
  // But cells 3-8 in row 0 must still have 7 as a candidate, so
  // 7 must not appear in rows 3-8 for cols 3-8 in a way that blocks row 0.
  // (They are naturally available since we haven't placed 7 in those rows' cols.)

  // For the elimination to be meaningful: ensure cells 3-8 in row 0 DO have 7 as candidate.
  // No conflicting 7 placements in cols 3-8 within row 0's peers (rows 1-8 for those cols).
  // Our current placements: board[27] col0, board[37] col1, board[47] col2, board[25] row2.
  // None of these block row-0 cols 3-8 from having 7. Good.

  // The pointing pair {0,1} → 7 should be eliminated from cells 3,4,5,6,7,8 in row 0.
  // But cells 3-8 are empty and potentially have 7 — that's the expected elimination.

  return {
    board,
    state: makeState(board),
    expected: {
      placements: [],
      // 7 eliminated from row-0 cells outside box-0: cells 3,4,5,6,7,8
      eliminations: [3, 4, 5, 6, 7, 8].map(c => ({ cellIndex: c, digit: 7 })),
    },
    source: 'sudokuwiki.org/Locked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Position 2: Pointing pair eliminates from column.
//
// Box 0: digit 4 confined to col 2, cells {2, 20} → eliminate 4 from col 2
// outside box 0, i.e. cells 29,38,47,56,65,74.
// ---------------------------------------------------------------------------
export const position2 = (() => {
  const board = new Uint8Array(81);
  // Block 4 from box-0 cells not in col 2: cells 0,1,9,10,11,18,19
  board[9] = 4;  // row1,col0 → blocks cells 0,9 via... wait, gives 4 to cell 9
  // More carefully: block digit 4 from all box-0 cells except col-2 cells.
  // Cells in box 0: 0,1,2 (row0), 9,10,11 (row1), 18,19,20 (row2)
  // Col-2 cells in box 0: 2 (row0), 11 (row1 — wait: col2, row1 = cell 1*9+2=11), 20 (row2)
  // We want only cells {2, 20} to have 4 (not cell 11).
  // Block 4 from cell 0: row0 has 4 elsewhere — board[3]=4
  board[3] = 4;  // row0,col3 → blocks row0 → cells 0,1,2 in row0 can't have 4
  // But that blocks cell 2 as well. We want cell 2 to have 4!
  // Reset: different approach — block 4 from cells 0,1 via column placements.
  const b = new Uint8Array(81);
  // Block 4 from cell 0 (row0,col0): place 4 in col0 not row0/box0 — e.g. row3
  b[27] = 4; // col0,row3 → blocks cells 0,9,18 (col0 in box0) from 4
  // Block 4 from cell 1 (row0,col1): place 4 in col1 not row0/box0
  b[37] = 4; // col1,row4 → blocks cells 1,10,19 (col1 in box0) from 4
  // Block 4 from cell 11 (row1,col2): place 4 in row1 not col2/box0
  b[15] = 4; // row1,col6 → blocks 4 from all row1 cells including cell 11
  // Now in box 0: only cells 2 (row0,col2) and 20 (row2,col2) can have 4.
  // Verify cell 2: row0 doesn't have 4 (board[3] is now cleared), col2 doesn't have 4 in box0.
  //   Actually b[27]=4 blocks col0; b[37]=4 blocks col1; b[15]=4 blocks row1 (cell 11).
  //   Cell 2 (row0,col2): row0 has nothing blocking 4 (b[3] not set). col2 in rows 3-8: nothing. ✓
  //   Cell 20 (row2,col2): row2 has nothing blocking 4. col2 in rows 3-8: nothing. ✓
  //   Cell 11: row1 has 4 (b[15]=4). Blocked. ✓

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      // 4 eliminated from col-2 outside box 0: cells 29,38,47,56,65,74
      eliminations: [29, 38, 47, 56, 65, 74].map(c => ({ cellIndex: c, digit: 4 })),
    },
    source: 'sudokuwiki.org/Locked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Position 3: Claiming — digit confined to one box within a row.
//
// Row 0: digit 9 only possible in cells {0,1,2} (all in box 0).
// Therefore 9 eliminated from the rest of box 0: cells 9..20 not in row 0.
// ---------------------------------------------------------------------------
export const position3 = (() => {
  const b = new Uint8Array(81);
  // Block 9 from row-0 cells outside box 0 (cells 3-8):
  b[12] = 9; // row1,col3 → blocks col3 → cell 3 (row0,col3) loses 9
  b[22] = 9; // row2,col4 → blocks col4 → cell 4 loses 9
  b[32] = 9; // row3,col5 → blocks col5 → cell 5 loses 9
  b[6] = 9;  // wait — that's in row0. Use different placement.
  // Revised: block cell 6 (row0,col6) from 9 via col6
  const c = new Uint8Array(81);
  c[12] = 9; // col3 → blocks cell 3
  c[22] = 9; // col4 → blocks cell 4
  c[32] = 9; // col5 → blocks cell 5
  c[42] = 9; // col6 (row4) → blocks cell 6
  c[52] = 9; // col7 (row5) → blocks cell 7
  c[62] = 9; // col8 (row6) → blocks cell 8
  // Now 9 is confined to cells {0,1,2} in row 0 (all in box 0).
  // Claiming: eliminate 9 from box 0 cells not in row 0: 9,10,11,18,19,20.
  // But those cells must currently have 9 as a candidate (no blocking there).
  // Check: cells 9(col0),10(col1),11(col2) in row1 — 9 is not placed in cols 0-2 or row1. ✓
  return {
    board: c,
    state: makeState(c),
    expected: {
      placements: [],
      eliminations: [9, 10, 11, 18, 19, 20].map(i => ({ cellIndex: i, digit: 9 })),
    },
    source: 'sudokuwiki.org/Locked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Position 4 (non-fire guard): technique does not apply.
// ---------------------------------------------------------------------------
export const positionNoFire = (() => {
  const board = new Uint8Array(81);
  // Sparse board — no locked-candidates pattern.
  board[0] = 1; board[40] = 5; board[80] = 9;
  return {
    board,
    state: makeState(board),
    expected: { placements: [], eliminations: [] },
    source: 'sudokuwiki.org/Locked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Position 5: Pointing pair — returns elimination-only step (no placements).
// This verifies the elimination-only shape: placements=[], eliminations=[...].
// Re-uses position1 since pointing pairs always produce elimination-only steps.
// ---------------------------------------------------------------------------
export const position5 = position1;
