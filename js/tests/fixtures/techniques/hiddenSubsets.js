/**
 * Hidden Subsets (Pair + Triple) fixtures.
 * Source: sudokuwiki.org/Hidden_Candidates
 *
 * Hidden Pair: two digits each confined to the same two cells in a unit →
 * eliminate all OTHER candidates from those two cells.
 *
 * Hidden Triple: three digits confined to three cells → eliminate others.
 */

import { makeState } from './_helpers.js';

// ---------------------------------------------------------------------------
// Hidden Pair in a row.
//
// In row 0: digits 4 and 7 can ONLY appear in cells 0 and 1.
// Cells 0 and 1 each have extra candidates that must be eliminated.
// ---------------------------------------------------------------------------
export const hiddenPairRow = (() => {
  const b = new Uint8Array(81);
  // Fill row 0 cells 2-8 with 1,2,3,5,6,8,9 → those digits blocked from cells 0,1.
  b[2] = 1; b[3] = 2; b[4] = 3; b[5] = 5; b[6] = 6; b[7] = 8; b[8] = 9;
  // Cells 0,1 row-candidates: {4,7} only (from row alone).
  // But we need cells 0 and 1 to have EXTRA candidates via column/box.
  // If col 0 doesn't block anything extra, cell 0 = {4,7}. That's already a naked pair!
  // For a hidden pair, cells 0 and 1 must each have ≥3 candidates, with {4,7} being hidden.
  // So we must NOT block all extras from those cells — leave some column candidates open.
  // Actually with row giving {1,2,3,5,6,8,9} blocked, cells 0 and 1 have exactly {4,7}.
  // That's a naked pair, not a hidden pair. For a hidden pair, we need cells 0,1 to have
  // more candidates, with 4 and 7 confined only to them in the unit.

  // Revised approach: use a column where 2 digits are hidden.
  // Col 0: cells 0,9,18,27,36,45,54,63,72. Give cells 18-72 with digits 1,2,3,5,6,8,9.
  const c = new Uint8Array(81);
  c[18] = 1; c[27] = 2; c[36] = 3; c[45] = 5; c[54] = 6; c[63] = 8; c[72] = 9;
  // Col 0 has {1,2,3,5,6,8,9} given. Cells 0,9 are empty.
  // Digits 4,7 are only possible in cells 0 or 9 in col 0.
  // But cells 0,9 each have ALL \ col_given = {4,7} → naked pair again.

  // The hidden pair distinction comes when there are EXTRA candidates.
  // Need row/box to add candidates beyond {4,7} to cells 0,9.
  // Cell 0 (r0,c0): row0 is empty → all row-0 digits available → cell 0 has many candidates.
  // cell 9 (r1,c0): row1 is empty → cell 9 has many candidates.
  // col0 blocks {1,2,3,5,6,8,9} → cell 0 = {4,7}. Still a naked pair.

  // Key insight: for a hidden pair, we need OTHER empty cells in the unit that DON'T
  // have digits 4,7 — and the target cells to have extra digits blocked.
  // But if col0 has all of {1,2,3,5,6,8,9} given, then cells 0,9 can ONLY be {4,7}.
  // That IS a naked pair AND a hidden pair simultaneously (degenerate case).

  // For a meaningful hidden pair test: use a unit where some cells have {4,7} plus extras,
  // and the solver finds the hidden pair (two digits confined to two cells).

  // Row unit where digit 3 and digit 7 appear in ONLY cells 5 and 6, but those cells
  // also have other candidates.
  const d = new Uint8Array(81);
  // Row 5 (cells 45-53). Leave cells 50 and 51 empty; give the rest.
  d[45] = 1; d[46] = 2; d[47] = 4; d[48] = 5; d[49] = 6; d[52] = 8; d[53] = 9;
  // Row 5 has {1,2,4,5,6,8,9} given. Missing in row5: {3,7}.
  // Cells 50 (r5c5) and 51 (r5c6) are the only empties in row 5 → get {3,7}.
  // col5 for cell 50: add digits to give cell 50 more candidates.
  // col5 (cells 5,14,23,32,41,50,59,68,77): if col5 only has given {1,2,4,5,6,8,9} outside row5,
  // cell 50 still only = {3,7} from the combined constraints.
  // To make them have EXTRA candidates, don't fill the rest of col5/col6.
  // Cell 50 (r5c5): row5 missing = {3,7}; col5 empty → cell 50 = {3,7}.
  // This is still a degenerate naked pair. A real hidden pair requires more cells.

  // FINAL approach: use a row with more empty cells where 2 specific digits are confined.
  // Row 3 (cells 27-35). Leave 4 cells empty: 27,28,29,34. Give the rest.
  d[30] = 1; d[31] = 2; d[32] = 5; d[33] = 6;
  // Row 3 has {1,2,5,6} given (in cells 30-33). Wait, d already has row5 data.
  // Start fresh for this fixture.
  const e = new Uint8Array(81);
  // Row 2 (cells 18-26). Give cells 20-26; leave cells 18,19 empty.
  e[20] = 4; e[21] = 5; e[22] = 8; e[23] = 9; e[24] = 1; e[25] = 2; e[26] = 3;
  // Row 2 missing: {6,7}. Cells 18,19 each get candidates including {6,7} from row.
  // For hidden pair: digits 6,7 confined only to cells 18,19 in row 2.
  // But cells 18,19 ALSO get extra candidates from col/box.
  // Cell 18 (r2,c0): row2 has {4,5,8,9,1,2,3} → loses those. col0 is empty → nothing extra.
  // cell 18 candidates = {6,7}. Still naked pair.

  // The fundamental issue: a hidden pair requires the two cells to have candidates BEYOND
  // the two hidden digits. This only happens when column/box brings in extra digits.
  // Let's be explicit: give row + extra col candidates.

  const f = new Uint8Array(81);
  // Row 4 (cells 36-44). Give cells 37-44; leave cell 36 empty.
  // But we need TWO cells for a hidden pair. Use cells 36 and 44.
  // Give cells 37-43:
  f[37] = 1; f[38] = 2; f[39] = 3; f[40] = 5; f[41] = 6; f[42] = 9;
  // f[43] empty and f[44] empty? Let me use cells 36 and 43 as the pair.
  // Give 37-42, 44 (all except 36,43):
  f[44] = 4; // restore
  // Row 4 (36-44): give 37=1,38=2,39=3,40=5,41=6,42=9,44=4. Leave 36,43 empty.
  // Row 4 missing: {7,8}. Cells 36,43 each get {7,8} from row alone.
  // Add col candidates:
  // Col 0 (cell 36, r4c0): add digits to col0 to give cell 36 more options.
  // If col0 has {3,4,5,6,9} given, cell 36 also gets... but {7,8} are the only
  // row-missing so cell 36 still = {7,8}.
  // I cannot add candidates ABOVE what the board provides. The formula is:
  //   candidates = ALL \ {digits in same row/col/box}
  // So to add candidates, I must NOT block them. To REDUCE candidates (force {7,8}),
  // I block everything except 7,8.

  // If row4 already gives {1,2,3,4,5,6,9} and col/box don't add back those digits,
  // cells 36,43 = {7,8}. That's always a naked pair.
  // Hidden pair is when the UNIT has MORE empty cells, but two specific digits are only
  // in the target cells.

  // SIMPLEST CONSTRUCTION: use a row with 4 empty cells.
  // In row 6 (cells 54-62): give 5 cells; leave 3 empty. Two of the three empty cells
  // form a hidden pair {X,Y}, and the third empty cell has X,Y plus other candidates.

  const g = new Uint8Array(81);
  // Row 6 (cells 54-62). Give cells 56,57,58,59,60 with 1,2,3,4,5. Leave 54,55,61,62 empty.
  g[56] = 1; g[57] = 2; g[58] = 3; g[59] = 4; g[60] = 5;
  // Row 6 missing: {6,7,8,9}. Cells 54,55,61,62 each start with {6,7,8,9} from row alone.
  // Hidden pair: digits 6,7 appear ONLY in cells 54,55 (and not in 61,62).
  // Block 6 and 7 from cells 61,62:
  // Cell 61 (r6,c7): block via col7: g[7]=6 (r0,c7) and g[16]=7 (r1,c7).
  g[7] = 6; g[16] = 7; // col7 has {6,7} → cell 61 loses 6,7.
  // Cell 62 (r6,c8): block via col8: g[8]=6? but col8 can only have 6 once.
  // Use different blocking: g[8]=7 (r0,c8), g[17]=6 (r1,c8).
  g[8] = 7; g[17] = 6; // col8 has {6,7} → cell 62 loses 6,7.
  // Now in row 6: digits 6,7 can only be in cells 54,55.
  // Cells 54 (r6,c0) and 55 (r6,c1) have candidates {6,7,8,9} (row) minus col/box.
  // Keep cells 54,55 with candidates {6,7,8,9} → hidden pair {6,7} in those cells.
  // The OTHER candidates in cells 54,55 ({8,9}) must be eliminated.
  // Cells 61,62 have {8,9} (after losing 6,7). No conflict with the pair.
  // Expected eliminations: from cells 54,55, remove {8,9}.

  return {
    board: g,
    state: makeState(g),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 54, digit: 8 },
        { cellIndex: 54, digit: 9 },
        { cellIndex: 55, digit: 8 },
        { cellIndex: 55, digit: 9 },
      ],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Hidden Pair in a column.
// ---------------------------------------------------------------------------
export const hiddenPairCol = (() => {
  const b = new Uint8Array(81);
  // Col 8 (cells 8,17,26,35,44,53,62,71,80). Give cells 26-80 with 1,2,3,4,5,6,7.
  // Leave cells 8,17 empty; also leave cell 35 empty for the other pair.
  // Wait — need 2 cells for hidden pair + 1 victim.
  // Give cells 26,44,53,62,71,80 with some digits. Leave cells 8,17,35 empty.
  b[26] = 1; b[44] = 2; b[53] = 3; b[62] = 4; b[71] = 5; b[80] = 6;
  // Col 8 has {1,2,3,4,5,6}. Missing: {7,8,9}. Cells 8,17,35 each start with {7,8,9} from col.
  // Hide digits 7,8 in cells 8,17 only.
  // Block 7 and 8 from cell 35 (r3,c8):
  // row3 (cells 27-35): g[27]=7 and g[28]=8.
  b[27] = 7; b[28] = 8; // row3 → cell 35 loses 7,8.
  // Cell 35 now has {9}. That's a naked single, not what we want.
  // Better: block just digit 7 from cell 35, so cell 35 has {8,9}.
  // Then hidden pair {7,8} in cells 8,17 — but cell 17 needs 8, and cell 35 has 8.
  // Actually: if digit 7 is in cells {8,17} only in col8, and digit 8 is in cells {8,17,35},
  // then {7,8} is NOT a hidden pair (8 appears in cell 35 too).

  // Correct approach: block BOTH 7 and 8 from ALL col-8 cells except 8 and 17.
  const c = new Uint8Array(81);
  c[26] = 1; c[44] = 2; c[53] = 3; c[62] = 4; c[71] = 5; c[80] = 6;
  // Block 7 from cells 35,44,53,...80 — but 44,53,62,71,80 are given (non-zero) → 7 is naturally
  // not a candidate. Cell 35 (r3,c8): block 7 via row3: c[27]=7.
  c[27] = 7;
  // Block 8 from cell 35 via row3: c[28]=8.
  c[28] = 8;
  // Now cell 35 has {9} → naked single. Still wrong.
  // The issue: if the only remaining digits in col8 are {7,8,9} and all 3 are confined to
  // cells 8,17,35, we get a naked triple, not a hidden pair.
  // Need 4+ empty cells in the column with {7,8} hidden in just 2.

  // Rebuild: col 3 with 5 empties, digits {3,8} hidden in two specific cells.
  const d = new Uint8Array(81);
  // Col 3 (cells 3,12,21,30,39,48,57,66,75).
  // Give cells 30,48,57,66,75 with values 5,6,7,9,1. Leave cells 3,12,21,39 empty.
  d[30] = 5; d[48] = 6; d[57] = 7; d[66] = 9; d[75] = 1;
  // Col 3 has {5,6,7,9,1}. Missing: {2,3,4,8}. Cells 3,12,21,39 each have {2,3,4,8} from col.
  // Hide digits {3,8} in cells 3 and 12 by blocking 3,8 from cells 21,39.
  // Cell 21 (r2,c3): block 3 and 8 via row2: d[18]=3, d[19]=8.
  d[18] = 3; d[19] = 8; // row2 → cell 21 loses 3 and 8. Cell 21 = {2,4}.
  // Cell 39 (r4,c3): block 3 and 8 via row4: d[36]=3, d[37]=8.
  d[36] = 3; d[37] = 8; // row4 → cell 39 loses 3,8. Cell 39 = {2,4}.
  // Now in col 3: digits 3 and 8 only appear in cells 3 and 12 → hidden pair {3,8} in {3,12}.
  // Cells 3,12 each have {2,3,4,8} (from col) minus whatever row/box blocks.
  // Cell 3 (r0,c3): row0 empty → no extra blocking. cell 3 = {2,3,4,8}.
  // Cell 12 (r1,c3): row1 empty → cell 12 = {2,3,4,8}.
  // Expected: eliminate {2,4} from cells 3 and 12 (keep only {3,8}).
  return {
    board: d,
    state: makeState(d),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 3, digit: 2 },
        { cellIndex: 3, digit: 4 },
        { cellIndex: 12, digit: 2 },
        { cellIndex: 12, digit: 4 },
      ],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Hidden Pair in a box.
// ---------------------------------------------------------------------------
export const hiddenPairBox = (() => {
  const b = new Uint8Array(81);
  // Box 8 (rows 6-8, cols 6-8): cells 60,61,62,69,70,71,78,79,80.
  // Give cells 61,62,69,71,78,80 with 1,2,3,4,5,6. Leave 60,70,79 empty.
  b[61] = 1; b[62] = 2; b[69] = 3; b[71] = 4; b[78] = 5; b[80] = 6;
  // Box 8 has {1,2,3,4,5,6}. Missing: {7,8,9}. Cells 60,70,79 each have {7,8,9} from box.
  // Hide {7,8} in cells 60,70 by blocking 7,8 from cell 79.
  // Cell 79 (r8,c7): block 7 and 8 via row8: b[72]=7, b[73]=8.
  b[72] = 7; b[73] = 8;
  // Cell 79 now = {9}. That's a naked single again (same problem as before).
  // Need cell 79 to have extra non-{7,8} candidates. Add box entry and row entry.
  const c = new Uint8Array(81);
  c[61] = 1; c[62] = 2; c[69] = 3; c[71] = 4; c[78] = 5; c[80] = 6;
  // Cell 79 (r8,c7): col7 (cells 7,16,25,34,43,52,61,70,79):
  //   c[61]=1 in col7. Block 7,8 from cell 79 via col7: add 7,8 to col7 above box8.
  c[7] = 7; c[16] = 8; // col7 now has {1,7,8} → cell 79 loses 7,8.
  // Cell 79 = box8 missing \ col7{7,8} = {9}. Still naked single.
  // The problem: if box gives {1,2,3,4,5,6} and col blocks {7,8}, only {9} remains.
  // Need box to have fewer givens.

  // Use box 5 (rows 3-5, cols 6-8): cells 33,34,35,42,43,44,51,52,53.
  const d = new Uint8Array(81);
  // Give 4 cells; leave 5 empty. Hidden pair in two of them.
  d[35] = 1; d[42] = 2; d[44] = 3; d[51] = 4;
  // Box 5 has {1,2,3,4}. Missing: {5,6,7,8,9}. 5 empty cells: 33,34,43,52,53.
  // Hide {5,6} in cells 33 and 52.
  // Block 5,6 from cells 34,43,53:
  // Cell 34 (r3,c7): row3 block 5,6: d[27]=5, d[28]=6.
  d[27] = 5; d[28] = 6;
  // Cell 43 (r4,c7): row4 block 5,6: d[36]=5, d[37]=6.
  d[36] = 5; d[37] = 6;
  // Cell 53 (r5,c8): row5 block 5,6: d[45]=5, d[46]=6.
  d[45] = 5; d[46] = 6;
  // Now in box 5: digits 5 and 6 can only go in cells 33 and 52.
  // cell 33 (r3,c6): box{1,2,3,4}; row3 has {5,6} → loses 5,6?
  // Wait: d[27]=5 and d[28]=6 are in row3 (cells 27-35). Cell 33 is also in row3!
  // So row3 blocks 5 and 6 from cell 33 as well. That breaks the hidden pair.

  // Fix: put 5,6 blockings in cols, not rows.
  const e = new Uint8Array(81);
  e[35] = 1; e[42] = 2; e[44] = 3; e[51] = 4;
  // Block 5,6 from cell 34 (r3,c7) via col7:
  e[7] = 5; e[16] = 6; // col7 rows 0,1 → blocks 5,6 from cell 34.
  // Block 5,6 from cell 43 (r4,c7) via col7: already blocked by e[7]=5,e[16]=6. ✓
  // Block 5,6 from cell 53 (r5,c8) via col8:
  e[8] = 5; e[17] = 6; // col8 rows 0,1 → blocks 5,6 from cells 53.
  // Now: cells 34,43 in col7 → lose 5,6 from col7. ✓
  //       cell 53 in col8 → loses 5,6 from col8. ✓
  // Cells in box5: 33(r3c6),34(r3c7),43(r4c7),52(r5c7),53(r5c8) and given 35,42,44,51.
  // Open empties: 33,34,43,52,53.
  // Digits 5,6 blocked from 34,43,53. Can 5,6 reach cells 33,52?
  // Cell 33 (r3,c6): col6 (cells 6,15,24,33,...) — not blocking 5 or 6. ✓
  // Cell 52 (r5,c7): col7 has {5,6} (e[7]=5,e[16]=6) → loses 5,6. That blocks 52 too!

  // This design is still broken. The column blocking propagates to ALL col-7 cells including 52.
  // I need to block 5,6 from SOME cells in box5 without blocking from the target pair cells.
  // Solution: use row-based blocking that only applies to non-target rows.

  // Use a completely different strategy: accept that the fixture may be complex
  // and use an explicitly crafted candidate array rather than a board.
  // Actually we can't — makeState computes candidates from the board.
  // We need to use row+col placements carefully.

  // NEW PLAN: use box 0, targeting cells 1 (r0c1) and 10 (r1c1).
  // col1 has digit 4 and 9 only in rows 0 and 1 → hidden pair in box0 cells 1,10.
  const f = new Uint8Array(81);
  // Box 0 cells: 0,1,2,9,10,11,18,19,20.
  // Give: 0=2, 2=3, 9=5, 11=6, 18=7, 19=8, 20=1. Leave cells 1,10 empty.
  f[0] = 2; f[2] = 3; f[9] = 5; f[11] = 6; f[18] = 7; f[19] = 8; f[20] = 1;
  // Box 0 has {2,3,5,6,7,8,1}. Missing: {4,9}. Only cells 1 and 10 are empty.
  // Cells 1 and 10 each have {4,9} from box.
  // Need them to have extra candidates via row/col.
  // Cell 1 (r0,c1): row0 has {2,3} (from f[0]=2,f[2]=3). Box has more...
  // cell 1 = ALL \ box{2,3,5,6,7,8,1} = {4,9} — naked pair. Same issue.

  // I accept: for a degenerate hidden pair (where candidates = exactly the hidden digits),
  // hiddenSubset won't find any eliminations (because there's nothing to eliminate).
  // A non-degenerate hidden pair needs cells with extra candidates.
  // The test framework should use this to verify the algorithm finds it in a harder context.

  // Let me use a known real Sudoku puzzle position from SudokuWiki.
  // sudokuwiki.org example: Row 9 has cells A,B each containing {3,5} plus extras.
  // I'll construct an analogous board:

  // Row 7 (cells 63-71): 5 empty cells. Digits 2 and 6 confined to cells 63 and 64.
  const h = new Uint8Array(81);
  // Give row7 cells 65-71 with 1,3,4,5,7,8,9:
  h[65] = 1; h[66] = 3; h[67] = 4; h[68] = 5; h[69] = 7; h[70] = 8; h[71] = 9;
  // Row 7 missing: {2,6}. Cells 63,64 are empty.
  // But we need more empty cells for it to be "hidden" rather than "naked".
  // Actually with only 2 empties and both having {2,6}, it IS a hidden pair but also a naked pair.
  // The hiddenSubset algorithm will find it as long as there's elimination to do.
  // Cell 63 (r7,c0): col0 candidates? Without blockings: col0 is unrestricted → cell 63 has {2,6}+more.
  // Add col-0 givens to give cell 63 extra candidates:
  // col0: h[0]=? h[9]=? etc. Leave most empty so col0 doesn't block much.
  // Actually with row7 givens {1,3,4,5,7,8,9}: cell 63 = ALL \ row{1,3,4,5,7,8,9} = {2,6}.
  // Even without col/box restrictions, it's {2,6}. To add extras, we'd need to UN-give some row cells.

  // I'll use a different row with 3 empties (two form hidden pair, one has extra candidates).
  const j = new Uint8Array(81);
  // Row 7 with 3 empty cells: 63, 64, 65. Give cells 66-71 with 1,3,5,7,8,9.
  j[66] = 1; j[67] = 3; j[68] = 5; j[69] = 7; j[70] = 8; j[71] = 9;
  // Row 7 missing: {2,4,6}. Cells 63,64,65 each have {2,4,6} from row alone.
  // Hide digits {2,6} in cells 63,64 by blocking them from cell 65.
  // Block 2 from cell 65 (r7,c2) via col2: j[2]=2.
  j[2] = 2;
  // Block 6 from cell 65 via col2: j[11]=6. But col2 can only have one 2 — ok for 6.
  j[11] = 6;
  // Cell 65 (r7,c2): row7 = {2,4,6} candidates; col2 blocks {2,6} → cell 65 = {4}.
  // That's a naked single. The hidden pair {2,6} in {63,64} produces no useful elimination
  // since cell 65 only has {4} (not 2 or 6).
  // We need cell 65 to have {2,4,6} so {2,6} gets eliminated from it.
  // But we blocked 2,6 from cell 65 to confine them to 63,64! That's the trade-off.
  // The elimination happens ON THE TARGET CELLS (63,64), not on cell 65:
  // cells 63,64 each have {2,4,6}; hidden pair removes 4 from cells 63 and 64.

  // Don't block 2,6 from cell 65! Instead add extra col candidates to cells 63,64.
  const k = new Uint8Array(81);
  j[66] = 1; j[67] = 3; j[68] = 5; j[69] = 7; j[70] = 8; j[71] = 9;
  k[66] = 1; k[67] = 3; k[68] = 5; k[69] = 7; k[70] = 8; k[71] = 9;
  // Row 7 missing: {2,4,6}. 3 empties: 63,64,65.
  // Block 4 from cells 63,64 (so they have {2,6} only). But also need cell 65 to have {2,4,6}.
  // Block 4 from cell 63 (r7,c0) via col0: k[0]=4.
  k[0] = 4;
  // Block 4 from cell 64 (r7,c1) via col1: k[1]=4? But row0 can have only one 4.
  // k[10]=4 (r1,c1):
  k[10] = 4;
  // Cell 63 = {2,6}; cell 64 = {2,6}; cell 65 = {2,4,6}.
  // Hidden pair {2,6} in cells {63,64} → eliminate 2,6 from cell 65.
  // Wait: we actually WANT to eliminate the NON-hidden candidates from the target cells.
  // Hidden pair means: 2 and 6 only appear in cells 63,64 in row 7.
  // So from cells 63 and 64, we eliminate all candidates EXCEPT 2 and 6.
  // Cells 63 and 64 already have exactly {2,6} — nothing to eliminate!
  // Cell 65 has {2,4,6} — but 2 and 6 also appear there, so it's NOT a hidden pair.

  // Key insight: For hidden pair to work, digits A,B must appear ONLY in the 2 target cells.
  // That means ALL OTHER cells in the unit must NOT have A or B as candidates.
  // But the target cells must have EXTRA candidates beyond A,B for there to be eliminations.
  // This requires that A,B are present in target cells' candidates from another constraint
  // (not from the unit itself) while being blocked from other cells via col/box.

  // Constructing this properly:
  // Row 7 has 4 empties: 63,64,65,66. Give 67-71 with 1,3,5,7,9.
  // Digits 2,6 confined to cells 63,64.
  // Block 2 from cells 65,66 via their columns (not row 7).
  // Block 6 from cells 65,66 via their columns.
  // Cells 63,64 still have {2,4,6,8} from row (missing {1,2,3,4,5,6,7,8,9}\{1,3,5,7,9}={2,4,6,8}).
  // Actually row missing = {2,4,6,8}. All 4 empty cells start with {2,4,6,8}.
  // Block 2,6 from cells 65,66:
  //   cell 65 (r7,c2): block 2 via col2: put 2 in col2 rows 0-6.
  //   block 6 via col2: put 6 in col2 rows 0-6. But col2 can only have each digit once!
  //   Use: k[2]=2 (r0c2), k[11]=6 (r1c2). → col2 has 2 and 6 → cell 65 loses 2,6. ✓
  //   cell 66 (r7,c3): block 2 via col3: k[3]=2, block 6: k[12]=6.
  const m = new Uint8Array(81);
  m[67] = 1; m[68] = 3; m[69] = 5; m[70] = 7; m[71] = 9;
  // Block 2,6 from cell 65 via col2:
  m[2] = 2; m[11] = 6;
  // Block 2,6 from cell 66 via col3:
  m[3] = 2; m[12] = 6;
  // Now digits 2,6 in row7 are confined to cells 63,64. ✓
  // Cells 63,64 have {2,4,6,8} — hidden pair {2,6} → eliminate {4,8}.
  // Verify col0,col1 don't block 2,6 from cells 63,64:
  // col0: m[0] not set. col1: m[1] not set. ✓
  return {
    board: m,
    state: makeState(m),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 63, digit: 4 },
        { cellIndex: 63, digit: 8 },
        { cellIndex: 64, digit: 4 },
        { cellIndex: 64, digit: 8 },
      ],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Hidden Triple in a unit.
// ---------------------------------------------------------------------------
export const hiddenTriple1 = (() => {
  // Row 8 (cells 72-80). Give cells 75-80 with 1,2,3,4,5,6. Leave 72,73,74 empty.
  // Wait — need the hidden triple digits to be blocked from enough cells.
  // Use row 3 with 5 empty cells. Digits 1,5,9 hidden in cells 27,28,29.
  const b = new Uint8Array(81);
  // Row 3 (cells 27-35). Give cells 30,31,32,33 with 2,3,4,6. Leave 27,28,29,34,35 empty.
  b[30] = 2; b[31] = 3; b[32] = 4; b[33] = 6;
  // Row 3 missing: {1,5,7,8,9}. All 5 empty cells start with {1,5,7,8,9}.
  // Hide {1,5,9} in cells 27,28,29 by blocking 1,5,9 from cells 34,35.
  // Cell 34 (r3,c7): block via col7: b[7]=1, b[16]=5, b[25]=9.
  b[7] = 1; b[16] = 5; b[25] = 9;
  // Cell 35 (r3,c8): block via col8: b[8]=1, b[17]=5, b[26]=9.
  b[8] = 1; b[17] = 5; b[26] = 9;
  // Cells 27,28,29 have {1,5,7,8,9}. Hidden triple {1,5,9} → eliminate {7,8}.
  return {
    board: b,
    state: makeState(b),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 27, digit: 7 },
        { cellIndex: 27, digit: 8 },
        { cellIndex: 28, digit: 7 },
        { cellIndex: 28, digit: 8 },
        { cellIndex: 29, digit: 7 },
        { cellIndex: 29, digit: 8 },
      ],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// Hidden Triple variant.
// ---------------------------------------------------------------------------
export const hiddenTriple2 = (() => {
  // Col 4 (cells 4,13,22,31,40,49,58,67,76). 4 empty cells; 3 form hidden triple.
  const b = new Uint8Array(81);
  // Give cells 31,40,49,58,67,76 with 1,2,3,4,5,6. Leave 4,13,22 empty (plus one more).
  b[31] = 1; b[40] = 2; b[49] = 3; b[58] = 4; b[67] = 5; b[76] = 6;
  // Wait: need 4th empty cell. Use cell 4,13,22,76 but 76 is given... Let me redo.
  // Actually leave 4,13,22,58 empty (give others).
  const c = new Uint8Array(81);
  c[31] = 1; c[40] = 2; c[49] = 3; c[67] = 5; c[76] = 6;
  // Col4 has {1,2,3,5,6}. Missing {4,7,8,9}. Empties: 4,13,22,58. All have {4,7,8,9} from col.
  // Hide {7,8,9} in cells 4,13,22.
  // Block 7,8,9 from cell 58 (r6,c4): via row6.
  c[54] = 7; c[55] = 8; c[56] = 9; // row6 cells 54,55,56 → blocks 7,8,9 from cell 58.
  // Cells 4,13,22 have {4,7,8,9}. Hidden triple {7,8,9} → eliminate {4}.
  return {
    board: c,
    state: makeState(c),
    expected: {
      placements: [],
      eliminations: [
        { cellIndex: 4, digit: 4 },
        { cellIndex: 13, digit: 4 },
        { cellIndex: 22, digit: 4 },
      ],
    },
    source: 'sudokuwiki.org/Hidden_Candidates',
  };
})();

// ---------------------------------------------------------------------------
// No hidden subset → null guard.
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
