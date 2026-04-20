/**
 * Naked Subsets (Pair + Triple) fixtures.
 * Source: sudokuwiki.org/Naked_Candidates
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Naked Pair in a row.
//
// Row 0 has two cells (cols 3,4) each containing only {4,7}.
// The other empty cells in row 0 must lose candidates 4 and 7.
// ---------------------------------------------------------------------------
export const nakedPairRow = (() => {
  const board = new Uint8Array(81);
  // Fill row 0 except cells 0,3,4 with 1,2,3,5,6,8,9 (leaves only 4,7 missing)
  // Leave cells 0,3,4 empty; cells 1,2,5,6,7,8 given.
  board[1] = 1; board[2] = 2; board[5] = 3; board[6] = 5; board[7] = 6; board[8] = 8;
  // For cells 3 and 4 to be a naked pair {4,7}:
  //   They must have ONLY digits 4 and 7 as candidates.
  //   Block all other digits (1,2,3,5,6,8,9) from cells 3 and 4.
  // cell 3 (row0,col3) — block 1,2,3,5,6,8,9:
  //   1 blocked by board[1] in row0
  //   2 blocked by board[2] in row0
  //   3 blocked by board[5] in row0 (wait: 3 is at col5, not col3)
  //   Actually row peers already block 1,2,3,5,6,8 for cell 3 (since those are in row 0).
  //   Cell 3 loses 1 (col1 peer), 2 (col2 peer), 3 (col5 peer)... wait, row peers include
  //   all other cells in row 0. Since board[1]=1, board[2]=2, board[5]=3, board[6]=5,
  //   board[7]=6, board[8]=8, cell 3's row peers have {1,2,3,5,6,8}.
  //   So cell 3's candidates = ALL \ {1,2,3,5,6,8} = {4,7,9}.
  //   To get just {4,7}, we need to block 9 from cell 3 via col or box.
  //   Place 9 in col 3 (row 3+): board[30]=9 (row3,col3)
  board[30] = 9; // col3,row3 → blocks 9 from cells 3,12,21 in col3

  //   Similarly for cell 4 (row0,col4): row peers give {1,2,3,5,6,8}, candidate = {4,7,9}.
  //   Block 9 from cell 4 via col4: board[40]=9 (row4,col4)
  board[40] = 9; // col4,row4 → blocks 9 from cells 4,13,22 in col4

  // Cell 0 (row0, col0): row peers have {1,2,3,5,6,8} → candidates = {4,7,9}.
  // Do NOT block 9 from cell 0 — it needs 4 or 7 or 9.
  // Actually for the naked pair to work, cell 0 needs 4 or 7 in its candidates
  // so that the pair {cells 3,4} can eliminate 4 and 7 from cell 0.
  // Cell 0's candidates: ALL \ {1,2,3,5,6,8} = {4,7,9} (no 9-blocking for col0).
  // Check col0: no 9 placement → cell 0 has {4,7,9}. ✓

  // Expected: naked pair {cells 3,4} with digits {4,7} → eliminate 4,7 from cell 0 in row 0.
  // (Cell 0 has candidates {4,7,9}; after elimination it would have {9}.)
  return {
    board,
    state: makeState(board),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 0, digit: 4 },
        { cellIndex: 0, digit: 7 },
      ],
    },
    source: 'sudokuwiki.org/Naked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Naked Pair in a column.
//
// Col 0 has two empty cells (rows 0,1) each containing only {2,8}.
// ---------------------------------------------------------------------------
export const nakedPairCol = (() => {
  const board = new Uint8Array(81);
  // Fill col 0 cells 2-8 with 1,3,4,5,6,7,9 (non-{2,8} digits).
  board[18] = 1; board[27] = 3; board[36] = 4; board[45] = 5;
  board[54] = 6; board[63] = 7; board[72] = 9;
  // Col 0 has {1,3,4,5,6,7,9} given → candidates for cells 0,9 start as {2,8}.
  // Cells 0 (row0) and 9 (row1) need to have ONLY {2,8}.
  // Row 0 peers for cell 0: must block everything except 2,8.
  // Block 1,3,4,5,6,7,9 from cell 0 via row (some already done via col).
  // Actually: cell 0 candidates = ALL \ {1,3,4,5,6,7,9} = {2,8}. ✓ (col already has them)
  // Same for cell 9 (row1,col0): col peers give {1,3,4,5,6,7,9} → candidates = {2,8}. ✓

  // Need another empty cell in col 0 to be eliminated from — but col 0 is full (cells 18-72).
  // Actually cells 0 and 9 ARE the only empties in col 0. No other cells to eliminate from!
  // Need a different setup: let col 0 have 3 empty cells where 2 form a naked pair.
  // Revised approach:
  const b = new Uint8Array(81);
  // Col 0 cells: 0(r0),9(r1),18(r2),27(r3),36(r4),45(r5),54(r6),63(r7),72(r8)
  // Give digits 1,3,5,6,7,9 to col-0 cells rows 2-7; leave rows 0,1,8 empty.
  b[18] = 1; b[27] = 3; b[36] = 5; b[45] = 6; b[54] = 7; b[63] = 9;
  // Col 0 now has {1,3,5,6,7,9} → remaining = {2,4,8}.
  // Cells 0,9,72 each get candidate subset.
  // For naked pair {cells 0,9} = {2,8}: block 4 from cells 0 and 9.
  // Cell 0 (row0): block 4 via row0 — board[3]=4 (row0,col3)
  b[3] = 4; // row0 → blocks 4 from cell 0
  // Cell 9 (row1): block 4 via row1 — board[13]=4 (row1,col4)
  b[13] = 4; // row1 → blocks 4 from cell 9
  // Cell 72 (row8): col0 gives {2,4,8}; no 4-blocking → candidates include {2,4,8}.
  // After naked pair elimination: cell 72 loses {2,8}.

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 72, digit: 2 },
        { cellIndex: 72, digit: 8 },
      ],
    },
    source: 'sudokuwiki.org/Naked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Naked Pair in a box.
//
// Box 0 has two cells with only {3,6}; other cells in box lose {3,6}.
// ---------------------------------------------------------------------------
export const nakedPairBox = (() => {
  const b = new Uint8Array(81);
  // Box 0 cells: 0,1,2,9,10,11,18,19,20
  // Give: cells 1,2 = given values; cells 9..20 mostly given; leave 0 and 10 empty.
  // Fill box 0 except cells 0 and 10 with digits 1,2,4,5,7,8,9 (not 3,6).
  b[1] = 1; b[2] = 2; b[9] = 4; b[11] = 5; b[18] = 7; b[19] = 8; b[20] = 9;
  // Box 0 missing: {3,6}. Both cells 0 and 10 are empty.
  // Cell 0 candidates: ALL \ {1,2,4,5,7,8,9} \ row0_peers \ col0_peers
  //   Row 0 peers (cells 1,2): block 1,2.
  //   Col 0 peers (cells 9,18): block 4,7.
  //   Combined box peers already accounted for.
  //   Cell 0 candidates = {3,6}. ✓
  // Cell 10 (row1,col1): col1 peer (cell 1) = 1; row1 peer (cell 9) = 4, (cell 11) = 5;
  //   Box peers block 1,2,4,5,7,8,9.
  //   Cell 10 candidates = {3,6}. ✓
  // Now other empty cells in box 0: none — all given.
  // We need at least one other empty cell in box 0 to eliminate from.
  // Let's leave cell 19 empty instead of given=8:
  const c = new Uint8Array(81);
  c[1] = 1; c[2] = 2; c[9] = 4; c[11] = 5; c[18] = 7; c[20] = 9;
  // Cell 19 (row2,col1) is empty.
  // Box 0: cells 0,10,19 are empty; 1,2,9,11,18,20 given.
  // Cell 0: row0 has {1,2} → loses 1,2; col0 has {4,7} → loses 4,7;
  //   box has {1,2,4,5,7,9} → loses those. Remaining: {3,6,8}.
  //   For naked pair we need {3,6} only. Block 8 from cell 0 via col or row.
  //   c[8]=8 → row0 loses 8 → cell 0 loses 8. Then cell 0 = {3,6}. ✓
  c[8] = 8; // row0,col8
  // Cell 10 (row1,col1): row1 has {4,5} → loses; col1 has {1} → loses;
  //   box has {1,2,4,5,7,9,8} → loses. Remaining: {3,6}. ✓
  // Cell 19 (row2,col1): row2 has {7,9} → loses; col1 has {1,8} → loses;
  //   box has {1,2,4,5,7,9,8} → loses 1,2,4,5,7,8,9. Remaining: {3,6}.
  //   Cell 19 also = {3,6} → it's part of a naked pair/triple, not elimination target!
  // Need a 3rd non-pair cell. Switch: leave cell 2 empty.
  const d = new Uint8Array(81);
  d[1] = 1; d[9] = 4; d[11] = 5; d[18] = 7; d[19] = 8; d[20] = 9;
  d[8] = 8; // row0 to block 8 from cell 0
  // Cell 2 (row0,col2): row0 has {1,8} → loses; col2 has {5,9} → loses;
  //   box has {1,4,5,7,8,9} → loses. Remaining = {2,3,6}.
  //   Cell 2 has candidates {2,3,6} — will be the elimination target.
  // Cell 0: row0 has {1,8}; col0 has {4,7}; box has {1,4,5,7,8,9}.
  //   Remaining = {2,3,6}. Hmm — also has 2.
  // This is getting complicated. Let me use a minimal known-good approach:
  // Build by direct candidate override is not possible; must rely on board.
  // Use a sparser board with more givens to force the exact candidates needed.

  // Final clean attempt:
  const e = new Uint8Array(81);
  // Box 0 (cells 0,1,2,9,10,11,18,19,20):
  // Give all except cells 0 and 9:
  e[1] = 2; e[2] = 9; e[10] = 1; e[11] = 7; e[18] = 4; e[19] = 6; e[20] = 8;
  // Col 0: cells 27,36,45,54,63,72 — place digits to force {3,5} for cells 0,9.
  e[27] = 1; e[36] = 2; e[45] = 7; e[54] = 8; e[63] = 9; e[72] = 6;
  // Row 0 (cells 1-8 partially): e[1]=2, e[2]=9 already; add more.
  e[3] = 1; e[4] = 7; e[5] = 8; e[6] = 6;
  // Cell 0 (row0,col0): row0 = {2,9,1,7,8,6} → lost; col0 = {1,2,7,8,9,6} → lost;
  //   box0 = {2,9,1,7,4,6,8} → lost. From ALL(1-9): still has {3,4,5}...
  // This piecemeal approach is error-prone. Let me accept a slightly looser test
  // that just verifies the technique works on ANY board that produces a naked pair.
  // Use the nakedPairRow fixture structure but for a box.

  // FINAL approach: construct board so box8 has a naked pair.
  // Box 8: cells 60,61,62,69,70,71,78,79,80 (rows 6-8, cols 6-8)
  const f = new Uint8Array(81);
  // Fill box 8 except cells 60 and 70 with digits 1,2,3,4,5,6,9.
  f[61] = 1; f[62] = 2; f[69] = 3; f[71] = 4; f[78] = 5; f[79] = 6; f[80] = 9;
  // cell 60 (row6,col6): box has {1,2,3,4,5,6,9} → remaining = {7,8}.
  //   row6 has {1,2,3}; col6 has {3,5} → doesn't eliminate 7 or 8. Hmm.
  //   Additional row/col constraints needed.
  // Block everything except {7,8} from cell 60:
  //   row6: add 4 and 5 and 6 and 9 → f[63]=4, f[64]=5, f[65]=6, f[66]=9
  f[63] = 4; f[64] = 5; f[65] = 6; f[66] = 9;
  //   col6: already has {3,5,9} from box... add 1,2,4,6 → f[6]=1, f[15]=2, f[24]=4, f[33]=6
  f[6] = 1; f[15] = 2; f[24] = 4; f[33] = 6;
  // Cell 60 now: ALL \ {1,2,3,4,5,6,9} \ row{4,5,6,9} \ col{1,2,4,6,3,5,9} = ?
  // row6 peers: {1,2,3,4,5,6,9} → removes 1-6,9 → leaves {7,8}. ✓

  // cell 70 (row7,col7): box has {1,2,3,4,5,6,9} → remaining = {7,8}.
  //   row7: block 1-6,9 → f[63]=4 already (col0), need row7 to have 1,2,3,5,6,9.
  f[72] = 1; f[73] = 2; f[74] = 3; f[75] = 5; f[76] = 6; f[77] = 9;
  // Cell 70 (row7,col7): row7 has {1,2,3,5,6,9} → ALL \ {1,2,3,4,5,6,9} = {7,8}. ✓

  // Now find another empty cell in box 8 — but all are given except 60 and 70!
  // We need at least one other empty cell. Leave cell 80 empty instead:
  f[80] = 0; // unset cell 80
  // Cell 80 (row8,col8): need to have {7,8} or a superset to be eliminated from.
  // Row8: f[72..79] = {1,2,3,5,6,9,?,?} — cols 0-5,? already. Let's check what's in row8.
  // f[72]=1,f[73]=2,f[74]=3,f[75]=5,f[76]=6,f[77]=9 — that's cols 0-5 in row 7 not row 8!
  // Wait: row7 = cells 63-71. row8 = cells 72-80.
  // f[72]=1(row8,col0), f[73]=2(row8,col1), f[74]=3(row8,col2), f[75]=5(row8,col3),
  // f[76]=6(row8,col4), f[77]=9(row8,col5). Row8 has {1,2,3,5,6,9} → cell 80 = {4,7,8}? No.
  // f[80]=0 now. Row8 missing: {4,7,8}. Cell 80 (col8): what's in col8?
  // col8 cells: 8(row0),17(row1),26(row2),35(row3),44(row4),53(row5),62(row6),71(row7),80(row8)
  // f[62]=2, f[71]=4 in box8. Others in col8 are 0.
  // So cell 80 candidates = ALL \ row8{1,2,3,5,6,9} \ col8{2,4} \ box8{1,2,3,4,5,6,9}
  //   = ALL \ {1,2,3,4,5,6,9} = {7,8}. Hmm — that makes cell 80 also {7,8} = part of pair!
  // No good. Need cell 80 to have a SUPERSET including {7,8} plus some extra digit.
  // Add 9 back to cell 80 by removing 9 from its peers:
  // Remove f[77]=9 → cell 80 col8 would need to NOT have 9 blocked...
  // Actually box8 has cell 80 = 0, and box has {1,2,3,4,5,6} (removed f[80]=9 given).
  // box8 given = {1,2,3,4,5,6}, col8 has {2,4}, row8 has {1,2,3,5,6,9}.
  // cell 80 = ALL \ {1,2,3,4,5,6,9} = {7,8} — still a pair member.

  // OK this design is getting too complex. Use a simpler known approach:
  // I'll just hardcode a board state that's known to produce a naked pair in a box.

  // Build a board where in box4 (rows3-5, cols3-5), cells 30 and 32 have only {4,6}.
  const g = new Uint8Array(81);
  // Box 4 cells: 30(r3c3),31(r3c4),32(r3c5),39(r4c3),40(r4c4),41(r4c5),48(r5c3),49(r5c4),50(r5c5)
  // Give: 31=1, 39=2, 40=3, 41=5, 48=7, 49=8, 50=9. Leave 30,32 empty.
  g[31] = 1; g[39] = 2; g[40] = 3; g[41] = 5; g[48] = 7; g[49] = 8; g[50] = 9;
  // Col 3 (for cell 30): add 1,2,3,5,7,8,9 via other rows.
  g[3] = 1; g[12] = 2; g[21] = 3; g[57] = 5; g[66] = 7; g[75] = 8;
  // col3 has {1,2,3,5,7,8} now. Cell 30 (row3,col3): box has {1,2,3,5,7,8,9}; col has {1,2,3,5,7,8}.
  // row3 (cell 30 peers): g[39]=2 already in row3 (col3→same row3! wait: 39 = 4*9+3 = r4c3, not r3)
  // Actually row3 = cells 27-35. g[31]=1 is in row3. Others in row3?
  // Only g[31]=1 in row3. So row3 contributes {1} to cell 30's block.
  // cell 30 candidates = ALL \ box{1,2,3,5,7,8,9} \ col{1,2,3,5,7,8} \ row{1} = {4,6}. ✓

  // Col 5 (for cell 32): add to block everything except {4,6}.
  // Col 5 cells: 5(r0c5),14(r1),23(r2),32(r3),41(r4,given=5),50(r5,given=9),59(r6),68(r7),77(r8)
  // g[41]=5 (col5,r4), g[50]=9 (col5,r5). Add more to col5:
  g[5] = 1; g[14] = 2; g[23] = 3; g[59] = 7; g[68] = 8;
  // Col 5 has {1,2,3,5,7,8,9}. Cell 32 (row3,col5):
  //   box has {1,2,3,5,7,8,9}; col5 has {1,2,3,5,7,8,9}; row3 has {1} (g[31]).
  //   cell 32 = ALL \ {1,2,3,5,7,8,9} = {4,6}. ✓

  // Now check other empty cells in box 4: cell 30 and 32 are the pair {4,6}.
  // Are there other empty cells in box4? No — 31,39,40,41,48,49,50 are given.
  // Need at least one other empty cell. Change one given to 0 — say g[49]=0.
  g[49] = 0;
  // Cell 49 (r5c4): box has {1,2,3,5,7,9} (removed 8 since g[49] now empty);
  //   row5 = cells 45-53. Only g[48]=7, g[50]=9 in row5 now.
  //   col4 = cells 4,13,22,31,40,49,58,67,76. g[31]=1, g[40]=3 in col4.
  //   cell 49 = ALL \ box{1,2,3,5,7,9} \ row5{7,9} \ col4{1,3}
  //   = ALL \ {1,2,3,5,7,9} = {4,6,8}.
  //   Cell 49 has {4,6,8}. After naked pair {30,32}={4,6}, eliminate 4,6 from cell 49 → {8}. ✓

  return {
    board: g,
    state: makeState(g),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 49, digit: 4 },
        { cellIndex: 49, digit: 6 },
      ],
    },
    source: 'sudokuwiki.org/Naked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Naked Triple in a unit.
//
// In row 0, cells 0,1,2 have combined candidates {1,4,7} (each a subset).
// Other cells in row 0 lose candidates 1, 4, 7.
// ---------------------------------------------------------------------------
export const nakedTriple = (() => {
  const b = new Uint8Array(81);
  // Row 0: fill cells 3-8 with 2,3,5,6,8,9; leave 0,1,2 empty.
  b[3] = 2; b[4] = 3; b[5] = 5; b[6] = 6; b[7] = 8; b[8] = 9;
  // Row 0 candidates for cells 0,1,2 = ALL \ {2,3,5,6,8,9} = {1,4,7}.
  // For naked triple we want each of cells 0,1,2 to have a SUBSET of {1,4,7}.
  // All three automatically have {1,4,7} from row-elimination alone.
  // But we need "other" cells in row 0 to have some of {1,4,7} — there aren't any
  // since cells 3-8 are all given! We need an empty cell with {1,4,7} in its candidates.
  // Instead of row, use col where there are more empties.

  // Use box 2 (rows 0-2, cols 6-8): cells 6,7,8,15,16,17,24,25,26
  const c = new Uint8Array(81);
  // Give 4 cells in box2 values 2,3,5,9. Leave cells 6,7,8,16 empty.
  c[15] = 2; c[17] = 3; c[24] = 5; c[25] = 9;
  // Box2 has {2,3,5,9} given. Missing: {1,4,6,7,8}.
  // For a naked triple among cells {6,7,8}: need their combined candidates = 3 digits.
  // Cell 6 (r0c6): block all except {1,4,7}:
  //   row0 must have {2,3,5,6,8,9} → c[0]=2,c[1]=3,c[2]=5,c[3]=6,c[4]=8,c[5]=9
  c[0] = 2; c[1] = 3; c[2] = 5; c[3] = 6; c[4] = 8; c[5] = 9;
  // Cell 6 (r0,c6): row0 has {2,3,5,6,8,9} → remaining {1,4,7}. But col6 and box2 matter.
  // col6 (c[6],c[15],c[24],c[33],...): c[15]=2,c[24]=5. col6 has {2,5}.
  //   → cell 6 loses 2,5 from col. Still {1,4,7} (2,5 already excluded). ✓
  // Cell 7 (r0,c7): row0 same → {1,4,7}. col7: c[16]? not set; c[25]=9 → loses 9 (already out). ✓
  // Cell 8 (r0,c8): row0 → {1,4,7}. col8: c[17]=3 → loses 3 (already out). ✓
  // Now cell 16 (r1,c7): box2 has {2,3,5,9}; row1: c[15]=2,c[17]=3 → loses 2,3;
  //   col7: c[25]=9 → loses 9. Cell 16 = ALL \ box{2,3,5,9} \ row1{2,3} \ col7{9} = {1,4,6,7,8}.
  //   This will be the elimination target: loses {1,4,7} from naked triple {6,7,8}.

  return {
    board: c,
    state: makeState(c),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 16, digit: 1 },
        { cellIndex: 16, digit: 4 },
        { cellIndex: 16, digit: 7 },
      ],
    },
    source: 'sudokuwiki.org/Naked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Naked Triple — 2-2-3 pattern variant.
// Three cells whose union is exactly 3 digits but each has a subset:
// cell A = {1,2}, cell B = {2,3}, cell C = {1,3}
// ---------------------------------------------------------------------------
export const nakedTriple223 = (() => {
  // Use col 8 (cells 8,17,26,35,44,53,62,71,80).
  const b = new Uint8Array(81);
  // Give cells 35,44,53,62,71,80 digits: 4,5,6,7,8,9.
  b[35] = 4; b[44] = 5; b[53] = 6; b[62] = 7; b[71] = 8; b[80] = 9;
  // Col8 has {4,5,6,7,8,9} given → remaining {1,2,3} for cells 8,17,26.
  // For pattern {1,2},{2,3},{1,3}: need to split candidates by row/box.
  // Cell 8 (r0,c8): col8 gives {4,5,6,7,8,9} blocked. Row0 also blocks things.
  //   Block 3 from cell 8 via row0: b[2]=3
  b[2] = 3; // row0 → cell 8 loses 3. Cell 8 = {1,2}. ✓
  // Cell 17 (r1,c8): block 1 from cell 17 via row1: b[9]=1
  b[9] = 1; // row1 → cell 17 loses 1. Cell 17 = {2,3}. ✓
  // Cell 26 (r2,c8): block 2 from cell 26 via row2: b[20]=2
  b[20] = 2; // row2 → cell 26 loses 2. Cell 26 = {1,3}. ✓

  // Now find another empty cell in col 8 with {1,2,3} candidates — but we gave all others.
  // Change one given to empty: b[71]=0.
  b[71] = 0;
  // Cell 71 (r7,c8): col8 has {4,5,6,7,9} (removed 8 by clearing 71); row7 has {8} (col0 of row7 — no).
  // Actually row7 = cells 63-71. Only b[71] was in row7 and we cleared it. Row7 has nothing.
  // col8 has {4,5,6,7,9} now. Cell 71 = ALL \ col8{4,5,6,7,9} = {1,2,3,8}.
  // After triple {8,17,26}={1,2,3}: eliminate {1,2,3} from cell 71. ✓

  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 71, digit: 1 },
        { cellIndex: 71, digit: 2 },
        { cellIndex: 71, digit: 3 },
      ],
    },
    source: 'sudokuwiki.org/Naked_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// No subset → null guard.
// ---------------------------------------------------------------------------
export const positionNoFire = (() => {
  const board = new Uint8Array(81);
  board[0] = 1; board[40] = 5;
  return {
    board,
    state: makeState(board),
    source: 'guard',
  };
})();
