/**
 * Hidden Single technique fixtures.
 * Source: sudokuwiki.org/Hidden_Candidates
 *
 * A digit D appears as a candidate in only one cell of a unit.
 */

/**
 * Build a state object (board + candidates) suitable for passing to a technique.
 * @param {Uint8Array} board
 * @returns {{ board: Uint8Array, candidates: Uint16Array }}
 */
function makeState(board) {
  // Inline candidate computation to avoid circular imports in fixtures.
  // Peers for each cell (row, col, box).
  function peers(i) {
    const r = (i / 9) | 0;
    const c = i % 9;
    const br = (r / 3) | 0;
    const bc = (c / 3) | 0;
    const ps = new Set();
    for (let cc = 0; cc < 9; cc++) ps.add(r * 9 + cc);
    for (let rr = 0; rr < 9; rr++) ps.add(rr * 9 + c);
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        ps.add((br * 3 + dr) * 9 + (bc * 3 + dc));
    ps.delete(i);
    return ps;
  }
  const ALL = 0b111111111;
  const candidates = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) {
      candidates[i] = 1 << (board[i] - 1);
    } else {
      let mask = ALL;
      for (const p of peers(i)) {
        if (board[p] !== 0) mask &= ~(1 << (board[p] - 1));
      }
      candidates[i] = mask;
    }
  }
  return { board, candidates };
}

// Position 1: Hidden single in a row.
// Row 2 has digit 7 possible only in cell 18 (row 2, col 0).
export const position1 = (() => {
  const b2 = new Uint8Array(81);
  b2[18] = 0; // target: 7 should go here
  // Place 7 in the column or box for cells 19-26 to force only cell 18.
  b2[28] = 7;  // col 1 row 3: blocks cell 19 (row2 col1) without contaminating box0
  b2[20] = 4; // row2 col2 is given=4: eliminates it
  b2[21] = 3; // given
  b2[22] = 5; // given
  b2[23] = 6; // given
  b2[24] = 2; // given
  b2[25] = 8; // given
  b2[26] = 1; // given
  // With cell 19 blocked (via col 1) and cells 20-26 given, cell 18 is the
  // only candidate for 7 in row 2.
  return {
    board: b2,
    state: makeState(b2),
    expected: {
      placements: [{ cellIndex: 18, digit: 7 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// Position 2: Hidden single in a column.
// Col 5 has digit 3 possible only in cell 14 (row 1, col 5).
export const position2 = (() => {
  const bb = new Uint8Array(81);
  // Spread the four 3-placements across distinct rows/cols/boxes so the
  // hidden single fires first on cell 14 (row 1, col 5) — see comment below.
  bb[8]  = 3; // r0c8 → row 0 + col 8 + box 2 → blocks cells 5, 17 (row1) and box-2 cells in row1
  bb[18] = 3; // r2c0 → row 2 + col 0 + box 0 → blocks cell 23 (row2,col5) and cells 9,10,11 (row1)
  bb[39] = 3; // r4c3 → row 4 + col 3 + box 4 → blocks cells 41,50 (col5) and cell 12 (row1)
  bb[67] = 3; // r7c4 → row 7 + col 4 + box 7 → blocks cells 59,68,77 (col5) and cell 13 (row1)
  // Row 1 is also a HS for digit 3: cells 9,10,11 blocked via box 0, cell 12 via col 3,
  // cell 13 via col 4, cells 15,16 via box 2, cell 17 via col 8 → only cell 14 has 3.
  return {
    board: bb,
    state: makeState(bb),
    expected: {
      placements: [{ cellIndex: 14, digit: 3 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// Position 3: Hidden single in a box.
// Box 4 (rows 3-5, cols 3-5) has digit 8 possible only in cell 40 (row4, col4).
export const position3 = (() => {
  const board = new Uint8Array(81);
  // Box 4 cells: 30,31,32,39,40,41,48,49,50
  // Block 8 from all box-4 cells except cell 40:
  board[3] = 8;  // row 0, col 3 → blocks col 3 in box4 → cells 30,39,48
  board[32] = 5; // cell 32 (row3, col5) given=5 → not 8
  board[41] = 6; // cell 41 (row4, col5) given=6 → not 8
  board[50] = 7; // cell 50 (row5, col5) given=7 → not 8
  board[31] = 4; // cell 31 (row3, col4) given=4 → not 8
  board[49] = 3; // cell 49 (row5, col4) given=3 → not 8
  // Only cell 40 remains for 8 in box 4
  return {
    board,
    state: makeState(board),
    expected: {
      placements: [{ cellIndex: 40, digit: 8 }],
      eliminations: [],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// Position 4 (non-fire guard): No hidden singles exist.
export const positionNoFire = (() => {
  const board = new Uint8Array(81);
  // Sparse board with no hidden singles.
  board[0] = 1;
  board[9] = 2;
  board[18] = 3;
  return {
    board,
    state: makeState(board),
    expected: { placements: [], eliminations: [] },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();
