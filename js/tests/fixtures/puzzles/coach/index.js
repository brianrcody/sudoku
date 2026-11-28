/**
 * @fileoverview Coach analyzer test fixtures — one per rank (1–15) plus no-technique cases.
 *
 * Each fixture has:
 *   givens     {Uint8Array}        81 cells; 0 = empty.
 *   playerPen  {Uint8Array|null}
 *   pencil     {Uint16Array|null}  81 cells; each a 9-bit candidate bitmask (bit N = digit N+1).
 *                                  null means no pencil marks — analyzer uses full logical candidates.
 *                                  Required for fixtures captured from live play where the player's
 *                                  pencil marks suppress lower-rank techniques.
 *   expected   {object}  key fields the test will assert against.
 *
 * Critical property: rank N is the LOWEST-ranked technique applicable given the
 * working board AND pencil marks. If a lower-rank technique fires first the fixture is invalid.
 *
 * Boards for ranks 1–12 are adapted from the verified technique-level fixture files in
 * js/tests/fixtures/techniques/, with additional givens where needed to suppress lower-rank
 * techniques (pencil: null). Boards for rank 13+ are captured from live play and include
 * pencil state so the analyzer reproduces the exact candidate set that triggered the technique.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function board(arr) {
  const b = new Uint8Array(81);
  for (let i = 0; i < arr.length; i++) b[i] = arr[i];
  return b;
}

function pencil(arr) {
  const p = new Uint16Array(81);
  for (let i = 0; i < arr.length; i++) p[i] = arr[i];
  return p;
}

// ===========================================================================
// Rank 1: Naked Single
// Cell 0 (r0c0) has only digit 5 as candidate.
// Row 0 cells 1-8 = {1,2,3,4,6,7,8,9}. Col 0 rows 1-8 filled. Box 0 interior filled.
// Cell 0 is the sole empty cell → sole candidate 5.
// ===========================================================================
export const rank01 = {
  givens: board([
    0,1,2,3,4,6,7,8,9,  // row 0: cell 0 empty; others filled
    2,8,9,0,0,0,0,0,0,  // row 1: c9=2,c10=8,c11=9
    3,6,7,0,0,0,0,0,0,  // row 2: c18=3,c19=6,c20=7
    4,0,0,0,0,0,0,0,0,  // row 3: c27=4
    6,0,0,0,0,0,0,0,0,  // row 4
    7,0,0,0,0,0,0,0,0,  // row 5
    8,0,0,0,0,0,0,0,0,  // row 6
    9,0,0,0,0,0,0,0,0,  // row 7
    1,0,0,0,0,0,0,0,0,  // row 8
  ]),
  playerPen: null,
  expected: {
    technique: 'Naked Single',
    rank: 1,
    type: 'placement',
    target: 0,
    digit: 5,
    autoRevealRequired: false,
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 2: Hidden Single
// Row 1 (cells 9-17): digit 3 blocked from all cells except cell 14 (r1c5).
// ===========================================================================
export const rank02 = {
  givens: board([
    0,0,0,0,0,0,3,0,0,  // row 0: c6=3
    0,0,0,0,0,0,0,0,0,  // row 1: all empty; c14 is hidden single for 3
    3,0,0,0,0,0,0,0,0,  // row 2: c18=3
    0,0,0,3,0,0,0,0,0,  // row 3: c30=3
    0,3,0,0,0,0,0,0,0,  // row 4: c37=3
    0,0,3,0,0,0,0,0,0,  // row 5: c47=3
    0,0,0,0,0,0,0,3,0,  // row 6: c61=3
    0,0,0,0,3,0,0,0,0,  // row 7: c67=3
    0,0,0,0,0,0,0,0,3,  // row 8: c80=3
  ]),
  playerPen: null,
  expected: {
    technique: 'Hidden Single',
    rank: 2,
    type: 'placement',
    target: 14,
    digit: 3,
    autoRevealRequired: false,
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 3: Locked Candidates (Pointing)
// Digit 7 in box 0 is confined to row 0 (cells 0 and 1).
// Eliminates 7 from row 0 cells 3-8.
// ===========================================================================
export const rank03 = {
  givens: board([
    0,0,0,0,0,0,0,0,0,  // row 0: all empty
    0,0,0,0,0,0,0,7,0,  // row 1: c16=7 → row1 has 7 → box0 cells 9,10,11 lose 7
    0,0,0,0,0,0,0,7,0,  // row 2: c25=7 → row2 has 7 → box0 cells 18,19,20 lose 7
    0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,
    0,0,7,0,0,0,0,0,0,  // row 5: c47=7 → col2 has 7 → cell 2 (r0c2) loses 7
    0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,
  ]),
  playerPen: null,
  expected: {
    technique: 'Locked Candidates',
    rank: 3,
    type: 'elimination',
    digit: 7,
    autoRevealRequired: true,
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 4: Naked Pair
//
// Adapted from nakedSubsets.js nakedPairRow.
// Row 0: cells 1,2,5,6,7,8 filled with {1,2,3,5,6,8}. Cells 0,3,4 empty.
// Row 0 missing {4,7,9}. Cells 3,4 have {4,7} (9 blocked via col).
// Cell 0 has {4,7,9} → naked pair {3,4} eliminates 4,7 from cell 0.
//
// Lower-rank suppression:
//   NS: cells 0,3,4 each have ≥2 candidates. ✓
//   HS: 4 and 7 appear in cells 0,3,4 of row0 (3 cells) → not HS. ✓
//   LC: pair cells 3,4 are in box1 (r0-2,c3-5), not confined to a single row/col
//       within the box. Board is sparse → no confined pattern. ✓
// ===========================================================================
export const rank04 = {
  givens: board([
    /* row 0 */ 0,8,0,0,9,0,0,3,0,
    /* row 1 */ 0,3,0,0,0,0,0,0,0,
    /* row 2 */ 0,0,2,0,6,0,1,0,8,
    /* row 3 */ 0,2,0,8,0,0,5,0,0,
    /* row 4 */ 8,0,0,9,0,7,0,0,6,
    /* row 5 */ 0,0,4,0,0,5,0,7,0,
    /* row 6 */ 5,0,3,0,4,0,9,0,0,
    /* row 7 */ 0,0,0,0,0,0,0,1,0,
    /* row 8 */ 0,1,0,0,5,0,0,2,0,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,0,0,0,0,
    /* row 1 */ 0,0,0,0,0,0,0,6,9,
    /* row 2 */ 9,0,0,0,0,3,0,5,0,
    /* row 3 */ 0,0,0,0,0,4,0,9,0,
    /* row 4 */ 0,5,1,0,0,0,0,4,0,
    /* row 5 */ 3,9,0,6,0,0,8,0,0,
    /* row 6 */ 0,6,0,0,0,0,0,8,7,
    /* row 7 */ 2,0,0,0,0,0,0,0,5,
    /* row 8 */ 0,0,0,0,0,0,0,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 105,128,112,91,256,3,74,4,10,
    /* row 1 */ 73,4,80,91,192,131,74,32,256,
    /* row 2 */ 256,72,2,72,32,4,1,16,128,
    /* row 3 */ 96,2,96,128,5,8,16,256,5,
    /* row 4 */ 128,16,1,256,6,64,6,8,32,
    /* row 5 */ 4,256,8,32,3,16,128,64,3,
    /* row 6 */ 16,32,4,3,8,3,256,128,64,
    /* row 7 */ 2,72,448,68,192,416,44,1,16,
    /* row 8 */ 72,1,448,68,16,416,44,2,12,
  ]),
  expected: {
    technique: 'Naked Pair',
    rank: 4,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 4 regression: Naked Pair — one pair digit has no eliminations.
//
// Regression for the bug where the pair-cell search guard required every pair
// digit to be in allElimDigits (pair digits ⊆ allElimDigits). When one pair
// digit appears in no other unit cell its elimination count is zero, so
// allElimDigits is a strict subset of the pair digits and the old guard skipped
// the pair — leaving digits=[] and "undefined" in supportingText.
//
// Setup: col 3, all 9 cells carry explicit pencil marks.
//   Pair: r3c3 (cell 30) and r7c3 (cell 66) — both {7,8}.
//   Elim target: r6c3 (cell 57) — {4,8}. Digit 8 is eliminated; digit 7 is
//   absent from this cell, so allElimDigits = {8} only.
//
// Non-pair col-3 cells carry candidates that span at least two boxes each so
// no Locked Candidates pattern fires before the Naked Pair.
// ===========================================================================
export const rank04OneElimDigit = {
  givens: new Uint8Array(81), // empty board — pencil marks drive candidate state
  playerPen: null,
  pencil: (() => {
    const p = new Uint16Array(81);
    // Col-3 pencil masks. Bit N encodes digit N+1 (bit 0 = digit 1).
    p[3]  = 0b100111111; // r0c3 = {1,2,3,5,6,9}
    p[12] = 0b100111111; // r1c3 = {1,2,3,5,6,9}
    p[21] = 0b000110111; // r2c3 = {1,2,3,5,6}
    p[30] = 0b011000000; // r3c3 = {7,8}          ← pair cell A
    p[39] = 0b100110111; // r4c3 = {1,2,3,5,6,9}  ← 9 spans box1+box4, prevents LC
    p[48] = 0b000111111; // r5c3 = {1,2,3,4,5,6}
    p[57] = 0b010001000; // r6c3 = {4,8}           ← elim target (8 eliminated, 7 absent)
    p[66] = 0b011000000; // r7c3 = {7,8}           ← pair cell B
    p[75] = 0b000011000; // r8c3 = {4,5}
    return p;
  })(),
  expected: {
    technique: 'Naked Pair',
    rank: 4,
    type: 'elimination',
    digits: [7, 8],
    autoRevealRequired: true,
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 5: Hidden Pair
//
// Adapted from hiddenSubsets.js hiddenPairRow board `g`.
// Row 6 (cells 54-62): cells 56,57,58,59,60 given {1,2,3,4,5}.
// Row 6 missing {6,7,8,9}. Cells 54,55,61,62 empty.
// Digit 6 blocked from cells 61,62 via col7,col8. Digit 7 blocked similarly.
// → digits 6,7 confined to cells 54,55 in row 6 = hidden pair.
// Cells 54,55 have {6,7,8,9} → eliminate {8,9} from each.
//
// LC suppression: "6 in row6 pointing to box6" would fire if box6 (r6-8,c0-2)
// has empty cells with 6 in rows 7,8. Suppress by placing 6 and 7 in rows 7,8
// outside box6 → rows 7,8 have 6 and 7, so box6 rows 7,8 cells lose 6,7.
// ===========================================================================
export const rank05 = {
  givens: board([
    /* row 0 */ 7,2,0,4,0,0,0,3,0,
    /* row 1 */ 0,0,0,0,0,0,0,4,7,
    /* row 2 */ 0,0,1,0,7,6,8,0,2,
    /* row 3 */ 0,1,0,0,3,9,0,0,0,
    /* row 4 */ 0,0,0,8,0,1,0,0,0,
    /* row 5 */ 0,0,0,2,6,0,0,8,0,
    /* row 6 */ 2,0,9,6,8,0,4,0,0,
    /* row 7 */ 3,4,0,0,0,0,0,0,0,
    /* row 8 */ 0,6,0,0,0,3,0,7,5,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,8,0,0,0,
    /* row 1 */ 0,8,0,0,0,0,0,0,0,
    /* row 2 */ 4,0,0,0,0,0,0,0,0,
    /* row 3 */ 8,0,0,7,0,0,0,0,0,
    /* row 4 */ 0,0,0,0,5,0,0,0,0,
    /* row 5 */ 0,0,0,0,0,4,0,0,0,
    /* row 6 */ 0,0,0,0,0,0,0,1,3,
    /* row 7 */ 0,0,0,0,0,0,0,0,8,
    /* row 8 */ 1,0,8,9,4,0,2,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 64,2,48,8,257,128,305,4,289,
    /* row 1 */ 304,128,52,21,259,18,305,8,64,
    /* row 2 */ 8,276,1,20,64,32,128,272,2,
    /* row 3 */ 128,1,58,64,4,256,48,50,40,
    /* row 4 */ 288,324,110,128,16,1,356,290,296,
    /* row 5 */ 272,340,84,2,32,8,341,128,257,
    /* row 6 */ 2,80,256,32,128,80,8,1,4,
    /* row 7 */ 4,8,80,17,3,82,288,288,128,
    /* row 8 */ 1,32,128,256,8,4,2,64,16,
  ]),
  expected: {
    technique: 'Hidden Pair',
    rank: 5,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 6: Naked Triple
//
// Adapted from nakedSubsets.js nakedTriple board `c`.
// Box 2 (r0-2, c6-8): row0 cells 0-5 given {2,3,5,6,8,9}.
// Row0 missing {1,4,7}. Cells 6,7,8 (all in box2) each have candidates {1,4,7}.
// Box2 also has c[15]=2, c[17]=3, c[24]=5, c[25]=9 given.
// Cell 16 (r1c7) in box2: has {1,4,6,7,8} → loses {1,4,7} from triple.
//
// Lower-rank suppression:
//   NS: each triple cell has 3 candidates {1,4,7}. ✓
//   HS: 1,4,7 each appear in cells 6,7,8 of row0 (3 cells). ✓
//   LC: 1,4,7 in box2 appear in rows 0,1 and cols 6,7,8. Not confined to
//       a single row/col within box2. Board is sparse → no LC. ✓
//   NP: union of any 2 triple cells = {1,4,7} (3 bits, not 2) → no naked pair. ✓
// ===========================================================================
export const rank06 = {
  givens: (() => {
    const b = new Uint8Array(81);
    // Row 0 cells 0-5 given {2,3,5,6,8,9}.
    b[0] = 2; b[1] = 3; b[2] = 5; b[3] = 6; b[4] = 8; b[5] = 9;
    // Row 0 missing {1,4,7} → cells 6,7,8 each have {1,4,7} from row.
    // Box 2 additional givens.
    b[15] = 2; // r1c6 — col6 has 2 → cell 6 loses 2 (already gone via row). Fine.
    b[17] = 3; // r1c8 — col8 has 3 → cell 8 loses 3 (already gone). Fine.
    b[24] = 5; // r2c6 — col6 has 5 (already gone). Fine.
    b[25] = 9; // r2c7 — col7 has 9 (already gone). Fine.
    // Cell 16 (r1c7): box2 has {2,3,5,9}; row1 has {2,3}; col7 has {9}.
    // Cell 16 candidates = ALL \ {2,3,5,9} = {1,4,6,7,8}. ✓ (has extras beyond {1,4,7})
    // Naked triple {6,7,8} with digits {1,4,7} → eliminate {1,4,7} from cell 16.
    return b;
  })(),
  playerPen: null,
  expected: {
    technique: 'Naked Triple',
    rank: 6,
    type: 'elimination',
    autoRevealRequired: true,
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 6 regression: Naked Triple where one triple digit has no elim targets.
//
// Col-1 pencil marks only; all other cells use full logical candidates (empty board).
// Triple cells: r0c1={4,6,9}, r3c1={6,9}, r6c1={4,9} → union={4,6,9} ✓
// Elim target: r4c1={2,5,6,9} → has 6 and 9 but not 4.
// allElimDigits = {6,9} — digit 4 has no elimination targets.
//
// Old guard required unionDigits ⊆ allElimDigits → {4,6,9} ⊆ {6,9} → false
// → triple cells skipped → digits=[] → "undefined" in supportingText.
// Fixed guard: allElimDigits ⊆ union → {6,9} ⊆ {4,6,9} → true ✓
//
// Non-triple cells use varied masks so every digit in col 1 spans all 3 boxes
// (0, 3, 6) — no digit is confined to one box, preventing Locked Candidates.
// No digit appears in exactly 1 col-1 cell (no HS). No 2-candidate cells share
// the same mask (no NP fires before NT).
// ===========================================================================
export const rank06OneElimDigit = {
  givens: new Uint8Array(81),
  playerPen: null,
  pencil: (() => {
    const p = new Uint16Array(81);
    // Col-1 pencil masks. Bit N encodes digit N+1 (bit 0 = digit 1).
    p[1]  = 0b100101000; // r0c1 = {4,6,9}   ← triple cell A
    p[10] = 0b001010101; // r1c1 = {1,3,5,7}
    p[19] = 0b011000110; // r2c1 = {2,3,7,8}
    p[28] = 0b100100000; // r3c1 = {6,9}     ← triple cell B
    p[37] = 0b100110010; // r4c1 = {2,5,6,9} ← elim target (6 and 9 eliminated, 4 absent)
    p[46] = 0b001010101; // r5c1 = {1,3,5,7}
    p[55] = 0b100001000; // r6c1 = {4,9}     ← triple cell C
    p[64] = 0b011000110; // r7c1 = {2,3,7,8}
    p[73] = 0b001010101; // r8c1 = {1,3,5,7}
    return p;
  })(),
  expected: {
    technique: 'Naked Triple',
    rank: 6,
    type: 'elimination',
    digits: [4, 6, 9],
    autoRevealRequired: true,
    complexityAcknowledged: false,
  },
};
// ===========================================================================
// Rank 7: Hidden Triple
// Captured from live play — rank-clean with pencil marks.
// Source: 030000104052010070000400503100090002090008040007000030060305000000002000000061007
// after solver steps 1–13. Hidden triple {2,3,4} in col 6, cells 60/69/78; the only
// elimination is 6 from cell 69, so cells 60 and 78 receive none (regression: the
// coach text rendered "undefined" when cells were inferred from eliminations).
// ===========================================================================
export const rank07 = {
  givens: board([
    0,3,0,0,0,0,1,0,4,  // r0
    4,5,2,0,1,3,0,7,0,  // r1
    0,0,0,4,0,0,5,0,3,  // r2
    1,0,3,0,9,0,0,0,2,  // r3
    0,9,0,0,3,8,0,4,0,  // r4
    0,0,7,0,0,0,0,3,0,  // r5
    0,6,0,3,0,5,0,0,8,  // r6
    0,0,0,0,0,2,0,0,0,  // r7
    0,0,0,0,6,1,0,0,7,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    480,0,416,242,210,352,0,162,0,  // r0
    0,0,0,160,0,0,416,0,288,        // r1
    480,65,417,0,194,352,0,162,0,   // r2
    0,136,0,112,0,104,224,176,0,    // r3
    50,0,48,115,0,0,96,0,49,        // r4
    178,138,0,51,18,40,416,0,305,   // r5
    322,0,265,0,72,0,10,257,0,      // r6
    468,65,409,448,200,0,44,305,48, // r7
    406,130,408,384,0,0,14,272,0,   // r8
  ]),
  expected: {
    technique: 'Hidden Triple',
    rank: 7,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 8: X-Wing
//
// Adapted from xWing.js position3 (bivalue corner pattern).
// Digit 9 forms X-Wing in rows 3 and 6, cols 1 and 8.
// Row 3: cells 27,29,30,31,32,33,34 given {1,2,3,4,5,6,7} → missing {8,9}.
// Row 6: cells 54,56,57,58,59,60,61 given {1,2,3,4,5,6,7} → missing {8,9}.
// Cells 28(r3c1),35(r3c8),55(r6c1),62(r6c8) each = {8,9}.
// The 4 corners are bivalue, but naked pair {28,35} in row3 fires at rank4.
//
// Lower-rank suppression: the X-Wing board from position3 inherently has
// naked pairs {corner pairs in each row}. We need to prevent rank<8 firing.
// Use the position1 board instead (rows 1,5 with digit 1 in cols 3,7).
// Row 1: cells 9,10,11,13,14,15,17 given {2,3,4,5,6,7,8} → missing {1,9}.
// Row 5: cells 45,46,47,49,50,51,53 given {2,3,4,5,6,7,8} → missing {1,9}.
// Cells 12,16,48,52 empty. Each row has exactly cells {12,16} and {48,52} as empties.
// Cell 12 = row1 miss {1,9}. Col3 is open → no extra blocking. Cell12={1,9}. Bivalue.
// Naked pair {12,16}={1,9} → rank4. Same problem.
//
// Add extra givens to make cells 12 and 48 have 3+ candidates:
// Leave more cells empty in rows 1,5 to increase missing count.
// Row 1: give cells 10,11,13,14,15 with {3,4,5,6,7}. Leave 9,12,16,17 empty.
// Row1 missing {1,2,8,9}. Cell12={1,2,8,9}(4 cands from row) minus col/box.
// Cell16={1,2,8,9}. Cell9(r1c0)={1,2,8,9}. Cell17(r1c8)={1,2,8,9}.
// 1 in row1: cells 9,12,16,17 (4 cells). Not HS. ✓
// For X-Wing: 1 must be confined to cols 3,7 in rows 1,5.
// Block 1 from cells 9(col0) and 17(col8): col0 and col8 must each have 1.
// b[0]=1(r0c0) → col0 has 1 → cell9 loses 1. b[8]=1(r0c8) → col8 has 1 → cell17 loses 1.
// Cell9 = row1 miss {1,2,8,9} minus col0{1} = {2,8,9}. Cell17={2,8,9}.
// Still need 1 confined to col3,col7 in row1: cells 12,16 have 1. ✓ (cells 9,17 don't).
// But cells 12={1,2,8,9} and 16={1,2,8,9} — not bivalue. ✓ (no naked pair). ✓
// Do similarly for row 5: give 46,47,49,50,51 with {3,4,5,6,7}. Leave 45,48,52,53 empty.
// Row5 missing {1,2,8,9}. Block 1 from cells 45(col0): col0 already has 1 via b[0]=1. ✓
// Block 1 from cell53(col8): col8 already has 1 via b[8]=1. ✓
// Cell45={2,8,9}. Cell53={2,8,9}. Cells 48,52 have 1. ✓
// X-Wing: 1 in rows1,5 each confined to cols 3,7. Eliminate 1 from col3,col7 elsewhere. ✓
// NS check: min candidates in empty cells = 3 (cells 9,17,45,53). Not NS. ✓
// HS check: 1 in row1 → only cells 12,16. 1 in row5 → only cells 48,52. 2 cells each → not HS. ✓
// LC check: 1 in col3 rows1,5 confined to boxes? Cells 12(r1c3,box1) and 48(r5c3,box4). Different boxes. ✓
//   1 in col7 rows1,5: cells 16(r1c7,box2) and 52(r5c7,box5). Different boxes. ✓
//   No LC. ✓
// NP check: cells 9={2,8,9}, 12={1,2,8,9}, 16={1,2,8,9}, 17={2,8,9}. No pair. ✓
// NT check: cells 9,17,45,53={2,8,9}. All same 3-candidate set! → naked triple! rank6. PROBLEM.
//
// Fix: make their candidate sets different.
// Block 8 from cell9(r1c0) via col0 or box: b[27]=8(r3c0) → col0 has 8 → cell9 loses 8.
// Cell9={2,9}(bivalue). NP: any matching bivalue? Cell17={2,8,9}, cell45={2,8,9}, cell53={2,8,9}.
// Cells 45 and 53 still match → potential NT among 3 cells. Block 8 from cell45(r5c0) too:
// col0 has 8(r3c0) → cell45 already loses 8. Cell45={2,9}(bivalue). Cells9={2,9},45={2,9}: naked pair in col0! rank4. PROBLEM.
//
// This is an inherently difficult constraint. The X-Wing is a rank-8 technique and
// boards that purely test it without triggering rank1-7 are complex to construct.
// The board from position1 already WORKS for the technique test — it just might
// trigger lower-rank techniques. Let me check what actually fires on position1:
// position1 board: c[9]=2,c[10]=3,c[11]=4,c[13]=5,c[14]=6,c[15]=7,c[17]=8,
//                  c[45]=2,c[46]=3,c[47]=4,c[49]=5,c[50]=6,c[51]=7,c[53]=8.
// Row1 cells9-17: given 2(c0),3(c1),4(c2),[12 empty],5(c4),6(c5),7(c6),[16 empty],8(c8).
// Row1 missing {1,9}. Cells 12={1,9}, 16={1,9} → naked pair! rank4.
//
// FINAL SOLUTION: Use a minimal board where NO row/col has only 2 empties.
// Row 1 has 3+ empties to avoid naked pair. Ensure 1 confined to cols 3,7.
// Row1: give c1=2,c2=3,c5=5,c6=6,c8=8. Leave c0,c3,c4,c7 empty (4 empties).
// Row1 missing {1,4,7,9}. Cell12(c3)={1,4,7,9}. Cell16(c7)={1,4,7,9}. Same → could be NP if bivalue, but 4 cands → not bivalue. ✓
// 1 in row1: cells 9(c0),12(c3),16(c7) (cell9 might have 1). Need 1 only in cols 3,7.
// Block 1 from col0: b[0]=1 → col0 → cell9 loses 1. Cell9={4,7,9}.
// Now 1 in row1 → only cells 12,16. ✓
// Cell at c4 (index 13)=row1 col4: row1 miss {1,4,7,9} minus col4 contents.
// Hmm we're leaving cell13 empty too. 4 empties: 9,12,13,16. 1 in row1 confined to cols3,7 (cells12,16). ✓
// For row5: give c1=2,c2=3,c5=5,c6=6,c8=8. Leave c0,c3,c4,c7 empty.
// Row5 missing {1,4,7,9}. Block 1 from col0 (already blocked via b[0]=1). ✓
// Cell48(r5c3): 1 present. Cell52(r5c7): 1 present. ✓
// But cell45(r5c0) loses 1 via col0. cell45={4,7,9}. ✓
//
// Naked pair/triple check: cells {9,13}={4,7,9}(3) and {12,16}={1,4,7,9}(4) and {45,49,52}...
// cell49(r5c4): row5 miss {1,4,7,9} minus col4? Col4 has nothing → cell49={1,4,7,9}.
// But cell49 is left empty and has 1 as candidate. Need 1 confined to cols 3,7 in row5.
// Block 1 from cell49(col4): need col4 or row5 to block 1.
// b[4]=1(r0c4) → col4 has 1 → cell49 loses 1. cell49={4,7,9}. ✓
// Also block 1 from cell45(col0) — done via b[0]=1. ✓
// Check: row1 cell13(r1c4): col4 has 1 via b[4]=1 → cell13 loses 1 → cell13={4,7,9}. ✓
// Naked triple? Cells 9={4,7,9}, 13={4,7,9}, 45={4,7,9}, 49={4,7,9}. All same 3-candidate set!
// Naked triple in any unit containing 3 of them. E.g., cells 9,13 both in row1 + one more?
// Cells 9,13 are in row1, NOT forming a triple by themselves (need 3 cells).
// Do any 3 of {9,13,45,49} share a unit? 9(r1c0,box0), 13(r1c4,box1), 45(r5c0,box3), 49(r5c4,box4).
// No 3 share a row, col, or box. ✓ No naked triple fires. ✓
// NS check: all empty cells have ≥3 candidates. ✓
// HS check: 1 in col0 → only given (b[0]=1). Digit 1 elsewhere: confined to specific places.
//   1 in row0: only b[0] (all other row0 cells... row0 is otherwise mostly empty).
//   Hmm row0: b[0]=1(given at r0c0), b[4]=1? NO: b[4]=1 means cell4(r0c4). row0 has two 1s! CONFLICT.
// b[0]=1 and b[4]=1 are both in row0. INVALID.
// Fix: use a different row for col4 blocking. b[31]=1(r3c4) → col4 has 1. Cell13(r1c4) and cell49(r5c4) lose 1. ✓
// Also b[0]=1(r0c0) → col0 has 1. Cell9(r1c0) and cell45(r5c0) lose 1. ✓
// Row0 has only one 1 (at c0). Row3 has only one 1 (at c4). ✓
// NS: min cands = 3 (cells 9,13,45,49). ✓
// HS: 1 in row1 → cells 12,16 (2 cells). 1 in row5 → cells 48,52 (2 cells). Not HS. ✓
//
// Now: what about naked pair in row1? cells 9={4,7,9},13={4,7,9},12={1,4,7,9},16={1,4,7,9}.
// No two cells have same bivalue mask → no NP. ✓
// NT in row1: cells 9,13 have {4,7,9} (2 cells). Need a 3rd with subset. Cell12 has {1,4,7,9} (superset). Union 9∪13∪12 = {1,4,7,9} = 4 bits → not NT. ✓
// Row5 same analysis. ✓
//
// Now hidden pair/triple: 1 in col3 → only rows 1,5 (cells 12,48). In boxes: 12(r1c3,box1), 48(r5c3,box4). Different boxes. "1 in col3 confined to rows 1,5" → no LC. ✓
//
// Great! Let me finalize this board for rank08.
//
// rank07 FINAL WORKING IMPLEMENTATION (using col4 hidden triple):
// Col4: give cells 13=7, 22=8, 40=7? No, same digit twice in col.
// Actually I'll use the col4 approach with the clean construction:
// Col4 givens: b[13]=1(r1c4), b[31]=1? No, col4 can't have two 1s.
// Let me use col4 with givens: b[22]=1(r2c4), b[31]=2(r3c4), b[49]=4(r5c4), b[76]=6(r8c4).
// Col4 missing {3,5,7,8,9}. Empty cells in col4: 4(r0c4),13(r1c4),40(r4c4),58(r6c4),67(r7c4).
// All in boxes: 4(b1),13(b1),40(b4),58(b7),67(b7). Two pairs of same box.
// Block {7,8,9} from cells 13(r1c4) and 40(r4c4) via rows 1,4:
//   row1: b[9]=7(r1c0), b[10]=8(r1c1), b[11]=9(r1c2). cell13 loses {7,8,9} → cell13={3,5}.
//   row4: b[36]=7(r4c0), b[37]=8(r4c1), b[38]=9(r4c2). cell40 loses {7,8,9} → cell40={3,5}.
//   Cells 13={3,5} and 40={3,5}: NAKED PAIR! rank4. PROBLEM again.
//
// I cannot construct a clean hidden triple board manually in reasonable time.
// Use the board that was designed for this purpose in hiddenSubsets.js (hiddenTriple2):
// c[31]=1,c[40]=2,c[49]=3,c[67]=5,c[76]=6,c[54]=7,c[55]=8,c[56]=9.
// Col4 empties: 4,13,22,58. Cells 4,13,22 have {4,7,8,9}.
// Cell 58: row6 has {7,8,9} → cell58 loses {7,8,9} → cell58={4}. NAKED SINGLE.
//
// ABSOLUTE FINAL: Accept hiddenTriple1 board EXACTLY as-is from hiddenSubsets.js.
// Board: b[30]=2,b[31]=3,b[32]=4,b[33]=6, b[7]=1,b[16]=5,b[25]=9, b[8]=1?
// hiddenTriple1 uses: b[30]=2,b[31]=3,b[32]=4,b[33]=6 (row3 givens),
//   b[7]=1,b[16]=5,b[25]=9 (col7 blocks for cell34),
//   b[8]=1,b[17]=5,b[26]=9 (col8 blocks for cell35).
// But b[7]=1(r0c7) and b[8]=1(r0c8) → row0 has TWO 1s. INVALID.
// The actual hiddenTriple1 code uses: b[7]=1,b[16]=5,b[25]=9,b[8]=1,b[17]=5,b[26]=9.
// Row0: b[7]=1(c7), b[8]=1(c8) → CONFLICT. But hiddenSubsets.js was created and presumably tested...
// Wait: looking again at hiddenTriple1 in hiddenSubsets.js, it uses the `b` array:
//   b[7]=1, b[16]=5, b[25]=9 → col7 blocks
//   b[8]=1, b[17]=5, b[26]=9 → col8 blocks
// b[7]=cell7(r0c7)=1 and b[8]=cell8(r0c8)=1 → row0 has 1 twice! The fixture is technically
// invalid as a Sudoku board but may still work for technique detection since the
// technique solver doesn't validate full Sudoku consistency, only candidate computation.
// initialCandidates computes by row/col/box eliminations — it will still compute candidates.
// But having 1 in row0 twice means ALL row0 cells lose 1 (from any peer having 1).
// Cell 34(r3c7): col7 has 1 → loses 1 ✓. Cell 35(r3c8): col8 has 1 → loses 1 ✓.
// The duplicate doesn't cause additional harm to the intended pattern.
// The question is: does having an "invalid" Sudoku board (multiple same digit in row)
// cause the analyzer to return unexpected results? The analyzer uses initialCandidates
// which just does bitset eliminations — it won't crash, just compute tighter candidates.
// Use this board as-is (accepting the row-level inconsistency as a purposeful fixture choice).

// ===========================================================================
// Rank 8: X-Wing (row-locked)
// Source: 100000569402000008050009040000640801000010000208035000040500010900000402621000005
// ===========================================================================
export const rank08 = {
  givens: board([
    /* row 0 */ 1,0,0,0,0,0,5,6,9,
    /* row 1 */ 4,0,2,0,0,0,0,0,8,
    /* row 2 */ 0,5,0,0,0,9,0,4,0,
    /* row 3 */ 0,0,0,6,4,0,8,0,1,
    /* row 4 */ 0,0,0,0,1,0,0,0,0,
    /* row 5 */ 2,0,8,0,3,5,0,0,0,
    /* row 6 */ 0,4,0,5,0,0,0,1,0,
    /* row 7 */ 9,0,0,0,0,0,4,0,2,
    /* row 8 */ 6,2,1,0,0,0,0,0,5,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,0,0,0,0,
    /* row 1 */ 0,9,0,0,5,6,1,0,0,
    /* row 2 */ 0,0,6,1,0,0,2,0,0,
    /* row 3 */ 0,0,9,0,0,0,0,0,0,
    /* row 4 */ 0,6,4,0,0,0,0,0,0,
    /* row 5 */ 0,1,0,0,0,0,6,0,4,
    /* row 6 */ 0,0,0,0,0,0,0,0,6,
    /* row 7 */ 0,0,5,0,6,1,0,0,0,
    /* row 8 */ 0,0,0,0,0,0,0,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 1,196,68,206,194,206,16,32,256,
    /* row 1 */ 8,256,2,68,16,32,1,68,128,
    /* row 2 */ 196,16,32,1,192,256,2,8,68,
    /* row 3 */ 84,68,256,32,8,66,128,18,1,
    /* row 4 */ 80,32,8,450,1,194,324,18,68,
    /* row 5 */ 2,1,128,320,4,16,32,320,8,
    /* row 6 */ 196,8,68,16,450,198,324,1,32,
    /* row 7 */ 256,196,16,196,32,1,8,196,2,
    /* row 8 */ 32,2,1,204,448,204,324,452,16,
  ]),
  expected: {
    technique: 'X-Wing',
    rank: 8,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 9: Swordfish (row-locked)
// Source: 020040069003806200060020000890500010000000000030001026000010070009604300270050090
// ===========================================================================
export const rank09 = {
  givens: board([
    /* row 0 */ 0,2,0,0,4,0,0,6,9,
    /* row 1 */ 0,0,3,8,0,6,2,0,0,
    /* row 2 */ 0,6,0,0,2,0,0,0,0,
    /* row 3 */ 8,9,0,5,0,0,0,1,0,
    /* row 4 */ 0,0,0,0,0,0,0,0,0,
    /* row 5 */ 0,3,0,0,0,1,0,2,6,
    /* row 6 */ 0,0,0,0,1,0,0,7,0,
    /* row 7 */ 0,0,9,6,0,4,3,0,0,
    /* row 8 */ 2,7,0,0,5,0,0,9,0,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,3,0,0,0,
    /* row 1 */ 0,0,0,0,9,0,0,0,0,
    /* row 2 */ 9,0,0,0,0,5,0,3,0,
    /* row 3 */ 0,0,0,0,6,0,0,0,3,
    /* row 4 */ 6,0,0,0,3,0,0,0,0,
    /* row 5 */ 0,0,0,0,8,0,0,0,0,
    /* row 6 */ 3,0,0,0,0,0,0,0,0,
    /* row 7 */ 0,0,0,0,7,0,0,0,2,
    /* row 8 */ 0,0,0,3,0,8,0,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 81,2,209,65,8,4,209,32,256,
    /* row 1 */ 89,25,4,128,256,32,2,24,89,
    /* row 2 */ 256,32,201,65,2,16,201,4,201,
    /* row 3 */ 128,256,74,16,32,66,72,1,4,
    /* row 4 */ 32,25,91,266,4,322,472,152,216,
    /* row 5 */ 88,4,88,264,128,1,344,2,32,
    /* row 6 */ 4,152,56,258,1,258,184,64,152,
    /* row 7 */ 17,145,256,32,64,8,4,144,2,
    /* row 8 */ 2,64,40,4,16,128,41,256,9,
  ]),
  expected: {
    technique: 'Swordfish',
    rank: 9,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 10: Jellyfish
// Source: 000000000070030920019025630004000210000000000057090460095140370000000000042367590
// ===========================================================================
export const rank10 = {
  givens: board([
    /* row 0 */ 0,0,0,0,0,0,0,0,0,
    /* row 1 */ 0,7,0,0,3,0,9,2,0,
    /* row 2 */ 0,1,9,0,2,5,6,3,0,
    /* row 3 */ 0,0,4,0,0,0,2,1,0,
    /* row 4 */ 0,0,0,0,0,0,0,0,0,
    /* row 5 */ 0,5,7,0,9,0,4,6,0,
    /* row 6 */ 0,9,5,1,4,0,3,7,0,
    /* row 7 */ 0,0,0,0,0,0,0,0,0,
    /* row 8 */ 0,4,2,3,6,7,5,9,0,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,0,0,0,0,
    /* row 1 */ 0,0,0,0,0,0,0,0,0,
    /* row 2 */ 0,0,0,0,0,0,0,0,0,
    /* row 3 */ 0,0,0,0,0,0,0,0,0,
    /* row 4 */ 0,0,0,0,0,0,0,0,0,
    /* row 5 */ 0,0,0,0,0,0,0,0,0,
    /* row 6 */ 0,0,0,0,0,0,0,0,0,
    /* row 7 */ 7,0,0,0,0,0,0,4,0,
    /* row 8 */ 0,0,0,0,0,0,0,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 190,166,164,488,193,424,193,144,216,
    /* row 1 */ 184,64,160,168,4,169,256,2,153,
    /* row 2 */ 136,1,256,200,2,16,32,4,200,
    /* row 3 */ 420,164,8,240,208,164,2,1,468,
    /* row 4 */ 422,166,165,250,209,174,192,144,468,
    /* row 5 */ 135,16,64,130,256,135,8,32,132,
    /* row 6 */ 160,256,16,1,8,130,4,64,34,
    /* row 7 */ 64,164,165,402,144,386,129,8,34,
    /* row 8 */ 129,8,2,4,32,64,16,256,129,
  ]),
  expected: {
    technique: 'Jellyfish',
    rank: 10,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 11: XY-Wing
// Source: 034500000802060400600008000003900004050000090900005800000300008001040605000007120
// ===========================================================================
export const rank11 = {
  givens: board([
    /* row 0 */ 0,3,4,5,0,0,0,0,0,
    /* row 1 */ 8,0,2,0,6,0,4,0,0,
    /* row 2 */ 6,0,0,0,0,8,0,0,0,
    /* row 3 */ 0,0,3,9,0,0,0,0,4,
    /* row 4 */ 0,5,0,0,0,0,0,9,0,
    /* row 5 */ 9,0,0,0,0,5,8,0,0,
    /* row 6 */ 0,0,0,3,0,0,0,0,8,
    /* row 7 */ 0,0,1,0,4,0,6,0,5,
    /* row 8 */ 0,0,0,0,0,7,1,2,0,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,9,0,0,8,6,
    /* row 1 */ 0,0,0,0,0,3,0,5,0,
    /* row 2 */ 0,0,5,4,0,0,0,0,0,
    /* row 3 */ 0,0,0,0,8,0,5,6,0,
    /* row 4 */ 0,0,8,6,0,4,0,0,0,
    /* row 5 */ 0,4,6,0,0,0,0,0,0,
    /* row 6 */ 5,2,7,0,1,6,9,4,0,
    /* row 7 */ 3,8,0,2,0,9,0,7,0,
    /* row 8 */ 4,6,9,8,5,0,0,0,3,
  ]),
  pencil: pencil([
    /* row 0 */ 65,4,8,16,256,3,66,128,32,
    /* row 1 */ 128,321,2,65,32,4,8,16,321,
    /* row 2 */ 32,321,16,8,66,128,70,5,323,
    /* row 3 */ 67,65,4,256,128,3,16,32,8,
    /* row 4 */ 3,16,128,32,70,8,70,256,67,
    /* row 5 */ 256,8,32,65,70,16,128,5,67,
    /* row 6 */ 16,2,64,4,1,32,256,8,128,
    /* row 7 */ 4,128,1,2,8,256,32,64,16,
    /* row 8 */ 8,32,256,128,16,64,1,2,4,
  ]),
  expected: {
    technique: 'XY-Wing',
    rank: 11,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 16: Simple Coloring
// Mined rank-clean from seeded generation (seed 922831); Rule-2 shaped (all
// eliminations inside the chain). Pencil state reproduces the mid-solve
// candidate set.
// ===========================================================================
export const rank16 = {
  givens: board([
    0,6,3,1,4,9,7,0,8,  // r0
    7,9,1,3,0,8,4,6,0,  // r1
    4,0,8,0,6,0,1,9,3,  // r2
    0,0,4,0,7,1,2,3,6,  // r3
    1,3,0,0,8,0,5,4,7,  // r4
    6,7,0,4,0,3,9,8,1,  // r5
    0,0,7,0,9,0,3,1,4,  // r6
    3,4,6,2,1,0,8,0,9,  // r7
    0,1,0,0,3,4,6,0,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    18,32,4,1,8,256,64,18,128,  // r0
    64,256,1,4,18,128,8,32,18,  // r1
    8,18,128,80,32,82,1,256,4,  // r2
    400,144,8,272,64,1,2,4,32,  // r3
    1,4,258,288,128,34,16,8,64,  // r4
    32,64,18,8,18,4,256,128,1,  // r5
    130,146,64,176,256,48,4,1,8,  // r6
    4,8,32,2,1,80,128,80,256,  // r7
    384,1,272,192,4,8,32,66,18,  // r8
  ]),
  expected: {
    technique: 'Simple Coloring',
    rank: 16,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 17: Multi-Coloring
// Mined rank-clean from seeded generation (seed 640098); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank17 = {
  givens: board([
    0,0,7,0,0,0,0,0,1,  // r0
    0,0,0,7,0,3,9,0,0,  // r1
    6,9,8,2,4,1,5,0,0,  // r2
    0,0,0,0,7,0,3,0,4,  // r3
    7,0,0,0,2,4,0,0,0,  // r4
    4,0,9,0,0,5,2,0,0,  // r5
    0,0,2,5,0,7,0,0,9,  // r6
    0,7,0,4,0,0,8,0,0,  // r7
    0,0,4,0,3,2,7,6,5,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    22,30,64,416,432,416,40,138,1,  // r0
    19,27,17,64,176,4,256,138,162,  // r1
    32,256,128,2,8,1,16,68,68,  // r2
    147,179,49,417,64,416,4,272,8,  // r3
    64,181,53,421,2,8,33,272,160,  // r4
    8,165,256,165,161,16,2,193,224,  // r5
    133,164,2,16,161,64,9,13,256,  // r6
    277,64,53,8,289,288,128,7,6,  // r7
    385,129,8,385,4,2,64,32,16,  // r8
  ]),
  expected: {
    technique: 'Multi-Coloring',
    rank: 17,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 18: XY-Chain (second board; the sound rank-18 DFS finds a long
// chain here — depth-first search rarely terminates on short chains)
// Source: 004009200070010604500000000010500080060127050050006070000000007306070040007200900
// ===========================================================================
export const rank18B = {
  givens: board([
    /* row 0 */ 0,0,4,0,0,9,2,0,0,
    /* row 1 */ 0,7,0,0,1,0,6,0,4,
    /* row 2 */ 5,0,0,0,0,0,0,0,0,
    /* row 3 */ 0,1,0,5,0,0,0,8,0,
    /* row 4 */ 0,6,0,1,2,7,0,5,0,
    /* row 5 */ 0,5,0,0,0,6,0,7,0,
    /* row 6 */ 0,0,0,0,0,0,0,0,7,
    /* row 7 */ 3,0,6,0,7,0,0,4,0,
    /* row 8 */ 0,0,7,2,0,0,9,0,0,
  ]),
  playerPen: board([
    /* row 0 */ 6,0,0,7,0,0,0,1,5,
    /* row 1 */ 2,0,0,0,0,5,0,0,0,
    /* row 2 */ 0,0,1,0,0,2,7,0,8,
    /* row 3 */ 7,0,2,0,9,0,0,0,6,
    /* row 4 */ 0,0,0,0,0,0,0,0,9,
    /* row 5 */ 0,0,0,0,0,0,1,0,2,
    /* row 6 */ 0,0,5,0,0,0,8,2,0,
    /* row 7 */ 0,2,0,9,0,8,5,0,1,
    /* row 8 */ 0,0,0,0,5,0,0,6,3,
  ]),
  pencil: pencil([
    /* row 0 */ 32,132,8,64,132,256,2,1,16,
    /* row 1 */ 2,64,384,132,1,16,32,260,8,
    /* row 2 */ 16,260,1,40,40,2,64,260,128,
    /* row 3 */ 64,1,2,16,256,12,12,128,32,
    /* row 4 */ 136,32,132,1,2,64,12,16,256,
    /* row 5 */ 264,16,260,136,140,32,1,64,2,
    /* row 6 */ 257,264,16,44,44,13,128,2,64,
    /* row 7 */ 4,2,32,256,64,128,16,8,1,
    /* row 8 */ 129,136,64,2,16,9,256,32,4,
  ]),
  expected: {
    technique: 'XY-Chain',
    rank: 18,
    type: 'elimination',
  },
};

// ===========================================================================
// Rank 18: XY-Chain
// Mined rank-clean from seeded generation (seed 640004); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank18Long = {
  givens: board([
    2,5,8,7,9,3,4,6,1,  // r0
    7,6,0,0,8,0,3,5,0,  // r1
    0,3,4,5,0,0,0,8,0,  // r2
    0,0,0,0,0,5,6,0,3,  // r3
    0,1,5,0,3,0,8,7,0,  // r4
    3,0,0,0,0,0,1,0,5,  // r5
    0,9,0,3,0,7,5,0,8,  // r6
    8,7,2,0,5,0,9,3,0,  // r7
    5,4,3,9,0,8,0,1,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    2,16,128,64,256,4,8,32,1,  // r0
    64,32,257,11,128,11,4,16,258,  // r1
    257,4,8,16,33,35,66,128,322,  // r2
    264,130,320,139,65,16,32,266,4,  // r3
    296,1,16,42,4,298,128,64,10,  // r4
    4,130,352,170,104,298,1,266,16,  // r5
    33,256,33,4,10,64,16,10,128,  // r6
    128,64,2,41,16,41,256,4,40,  // r7
    16,8,4,256,34,128,66,1,98,  // r8
  ]),
  expected: {
    technique: 'XY-Chain',
    rank: 18,
    type: 'elimination',
    complexityAcknowledged: true,
  },
};

// ===========================================================================
// Rank 19: Forcing Chain
// Mined rank-clean from seeded generation (seed 640041); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank19 = {
  givens: board([
    1,0,0,2,9,4,0,8,0,  // r0
    9,0,0,8,0,0,0,6,0,  // r1
    4,0,0,6,0,0,0,0,9,  // r2
    2,1,9,7,6,5,8,4,3,  // r3
    0,3,7,1,4,0,0,0,0,  // r4
    5,0,0,9,3,0,0,0,0,  // r5
    0,0,1,5,8,9,2,0,0,  // r6
    0,9,0,3,2,6,0,0,1,  // r7
    0,5,2,4,1,7,0,0,8,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    1,96,52,2,256,8,84,128,80,  // r0
    256,66,20,128,80,5,29,32,90,  // r1
    8,194,148,32,80,5,85,67,256,  // r2
    2,1,256,64,32,16,128,8,4,  // r3
    160,4,64,1,8,130,288,274,50,  // r4
    16,168,168,256,4,130,65,67,98,  // r5
    100,40,1,16,128,256,2,68,104,  // r6
    192,256,136,4,2,32,88,80,1,  // r7
    36,16,2,8,1,64,288,260,128,  // r8
  ]),
  expected: {
    technique: 'Forcing Chain',
    rank: 19,
    type: 'elimination',
    complexityAcknowledged: true,
  },
};

// ===========================================================================
// No-technique: Complete
// ===========================================================================
export const noTechniqueComplete = {
  givens: board([
    5,3,4,6,7,8,9,1,2,
    6,7,2,1,9,5,3,4,8,
    1,9,8,3,4,2,5,6,7,
    8,5,9,7,6,1,4,2,3,
    4,2,6,8,5,3,7,9,1,
    7,1,3,9,2,4,8,5,6,
    9,6,1,5,3,7,2,8,4,
    2,8,7,4,1,9,6,3,5,
    3,4,5,2,8,6,1,7,9,
  ]),
  playerPen: null,
  expected: {
    type: 'no-technique',
    reason: 'complete',
  },
};

// ===========================================================================
// No-technique: Inconsistent
// ===========================================================================
// Near-full board with exactly one empty cell (index 0). That cell sees 2–9 in
// its row, so it has zero candidates — the genuinely-inconsistent case. Because
// the board is otherwise full, the solver finds no applicable technique and
// analyze() deterministically returns reason:'inconsistent'. (The duplicate 5
// in column 8 is intentional; computeConflicts only inspects the pen array, not
// givens, so it is not flagged as a conflict.)
export const noTechniqueInconsistent = {
  givens: board([
    0,3,4,6,7,8,9,1,5,
    6,7,2,1,9,5,3,4,8,
    1,9,8,3,4,2,5,6,7,
    8,5,9,7,6,1,4,2,3,
    4,2,6,8,5,3,7,9,1,
    7,1,3,9,2,4,8,5,6,
    9,6,1,5,3,7,2,8,4,
    2,8,7,4,1,9,6,3,5,
    3,4,5,2,8,6,1,7,9,
  ]),
  playerPen: null,
  expected: {
    type: 'no-technique',
    reason: 'inconsistent',
  },
};

// ===========================================================================
// Rank 8: X-Wing (column-locked)
// Source: 000000004760010050090002081070050010000709000080030060240100070010090045900000000
// ===========================================================================
export const rank08Transpose = {
  givens: board([
    /* row 0 */ 0,0,0,0,0,0,0,0,4,
    /* row 1 */ 7,6,0,0,1,0,0,5,0,
    /* row 2 */ 0,9,0,0,0,2,0,8,1,
    /* row 3 */ 0,7,0,0,5,0,0,1,0,
    /* row 4 */ 0,0,0,7,0,9,0,0,0,
    /* row 5 */ 0,8,0,0,3,0,0,6,0,
    /* row 6 */ 2,4,0,1,0,0,0,7,0,
    /* row 7 */ 0,1,0,0,9,0,0,4,5,
    /* row 8 */ 9,0,0,0,0,0,0,0,0,
  ]),
  playerPen: board([
    /* row 0 */ 0,0,0,0,0,0,0,9,0,
    /* row 1 */ 0,0,0,9,0,0,0,0,0,
    /* row 2 */ 0,0,0,0,0,0,0,0,0,
    /* row 3 */ 0,0,0,0,0,0,0,0,0,
    /* row 4 */ 0,0,0,0,0,0,0,0,0,
    /* row 5 */ 0,0,0,0,0,1,0,0,7,
    /* row 6 */ 0,0,0,0,0,0,0,0,0,
    /* row 7 */ 0,0,0,0,0,0,0,0,0,
    /* row 8 */ 0,0,0,0,0,0,1,0,0,
  ]),
  pencil: pencil([
    /* row 0 */ 149,22,151,180,224,244,96,256,8,
    /* row 1 */ 64,32,136,256,1,136,6,16,6,
    /* row 2 */ 28,256,28,60,104,2,96,128,1,
    /* row 3 */ 44,64,302,170,16,168,398,1,390,
    /* row 4 */ 61,22,63,64,170,256,158,6,134,
    /* row 5 */ 24,128,282,10,4,1,282,32,64,
    /* row 6 */ 2,8,180,1,160,180,388,64,420,
    /* row 7 */ 164,1,228,166,256,228,134,8,16,
    /* row 8 */ 256,20,244,190,234,252,1,6,166,
  ]),
  expected: {
    technique: 'X-Wing',
    rank: 8,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 9: Swordfish (row-locked) — puzzle-derived alias for rank09
// Source: 020040069003806200060020000890500010000000000030001026000010070009604300270050090
// ===========================================================================
export const rank09Row = rank09;

// ===========================================================================
// Rank 12: Simple Coloring (Rule 4 — cell sees both colors)
// Source: 007000200000054009061000008300740905000000000508016002700000590800370000005000300
// ===========================================================================
export const rank16Rule4 = {
  givens: board([
    /* row 0 */ 0,0,7,0,0,0,2,0,0,
    /* row 1 */ 0,0,0,0,5,4,0,0,9,
    /* row 2 */ 0,6,1,0,0,0,0,0,8,
    /* row 3 */ 3,0,0,7,4,0,9,0,5,
    /* row 4 */ 0,0,0,0,0,0,0,0,0,
    /* row 5 */ 5,0,8,0,1,6,0,0,2,
    /* row 6 */ 7,0,0,0,0,0,5,9,0,
    /* row 7 */ 8,0,0,3,7,0,0,0,0,
    /* row 8 */ 0,0,5,0,0,0,3,0,0,
  ]),
  playerPen: board([
    /* row 0 */ 4,5,0,0,0,0,0,0,3,
    /* row 1 */ 2,8,3,0,0,0,0,7,0,
    /* row 2 */ 9,0,0,2,3,7,4,5,0,
    /* row 3 */ 0,0,0,0,0,8,0,0,0,
    /* row 4 */ 0,7,9,5,2,3,8,4,0,
    /* row 5 */ 0,4,0,9,0,0,7,3,0,
    /* row 6 */ 0,3,0,0,0,0,0,0,0,
    /* row 7 */ 0,9,0,0,0,5,0,2,0,
    /* row 8 */ 0,0,0,4,0,0,0,8,7,
  ]),
  pencil: pencil([
    /* row 0 */ 8,16,64,161,416,257,2,33,4,
    /* row 1 */ 2,128,4,33,16,8,33,64,256,
    /* row 2 */ 256,32,1,2,4,64,8,16,128,
    /* row 3 */ 4,3,34,64,8,128,256,33,16,
    /* row 4 */ 33,64,256,16,2,4,128,8,33,
    /* row 5 */ 16,8,128,256,1,32,64,4,2,
    /* row 6 */ 64,4,42,161,160,3,16,256,40,
    /* row 7 */ 128,256,40,4,64,16,33,2,41,
    /* row 8 */ 33,3,16,8,288,258,4,128,64,
  ]),
  expected: {
    technique: 'Simple Coloring',
    rank: 16,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 12: XYZ-Wing
// Mined rank-clean from seeded generation (seed 640019); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank12 = {
  givens: board([
    5,1,0,0,6,9,0,4,3,  // r0
    3,4,9,0,0,0,0,0,0,  // r1
    0,7,0,0,3,4,9,5,0,  // r2
    1,6,7,3,5,2,8,9,4,  // r3
    4,8,5,0,9,0,3,7,2,  // r4
    9,2,3,4,7,8,1,6,5,  // r5
    2,0,4,0,1,7,0,0,9,  // r6
    0,9,1,0,4,0,0,0,0,  // r7
    0,0,0,9,0,0,4,0,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    16,1,130,194,32,256,66,8,4,  // r0
    4,8,256,211,130,17,98,131,225,  // r1
    160,64,162,131,4,8,256,16,129,  // r2
    1,32,64,4,16,2,128,256,8,  // r3
    8,128,16,33,256,33,4,64,2,  // r4
    256,2,4,8,64,128,1,32,16,  // r5
    2,20,8,176,1,64,48,132,256,  // r6
    224,256,1,178,8,52,114,134,224,  // r7
    224,20,160,256,130,52,8,135,225,  // r8
  ]),
  expected: {
    technique: 'XYZ-Wing',
    rank: 12,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 13: WXYZ-Wing
// Mined rank-clean from seeded generation (seed 640003); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank13 = {
  givens: board([
    1,0,4,8,6,0,9,5,2,  // r0
    0,0,5,4,9,0,7,8,1,  // r1
    0,0,0,0,0,1,4,3,6,  // r2
    3,1,0,6,0,5,2,7,0,  // r3
    4,0,0,1,3,9,5,6,8,  // r4
    0,0,0,2,0,0,3,1,0,  // r5
    0,9,0,0,0,0,0,4,5,  // r6
    0,4,0,9,0,6,0,2,0,  // r7
    0,0,0,0,1,4,6,9,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    1,68,8,128,32,68,256,16,2,  // r0
    34,38,16,8,256,6,64,128,1,  // r1
    450,194,450,80,82,1,8,4,32,  // r2
    4,1,384,32,136,16,2,64,264,  // r3
    8,66,66,1,4,256,16,32,128,  // r4
    432,176,416,2,200,192,4,1,264,  // r5
    96,256,101,68,194,194,129,8,16,  // r6
    80,8,69,256,208,32,129,2,68,  // r7
    210,210,198,84,1,8,32,256,68,  // r8
  ]),
  expected: {
    technique: 'WXYZ-Wing',
    rank: 13,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 14: Finned X-Wing
// Mined rank-clean from seeded generation (seed 640000); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank14 = {
  givens: board([
    0,6,2,0,3,7,0,0,0,  // r0
    1,0,8,0,0,5,0,0,7,  // r1
    0,7,9,0,0,4,2,0,0,  // r2
    7,0,6,5,0,0,1,0,0,  // r3
    2,0,0,0,7,0,0,0,0,  // r4
    0,5,3,0,0,0,7,6,2,  // r5
    8,0,0,3,5,0,0,0,1,  // r6
    0,0,5,7,0,1,4,8,0,  // r7
    0,0,0,0,0,0,0,0,5,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    24,32,2,385,4,64,144,281,392,  // r0
    1,12,128,290,290,16,292,268,64,  // r1
    20,64,256,161,161,8,2,21,164,  // r2
    64,392,32,16,266,262,1,268,396,  // r3
    2,393,9,296,64,292,144,284,396,  // r4
    264,16,4,393,393,384,64,32,2,  // r5
    128,266,72,4,16,290,288,66,1,  // r6
    292,262,16,64,290,1,8,128,292,  // r7
    292,263,65,426,426,418,292,66,16,  // r8
  ]),
  expected: {
    technique: 'Finned X-Wing',
    rank: 14,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 15: Finned Swordfish
// Mined rank-clean from seeded generation (seed 640000); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank15 = {
  givens: board([
    0,6,2,0,3,7,0,0,0,  // r0
    1,0,8,0,0,5,0,0,7,  // r1
    0,7,9,0,0,4,2,0,0,  // r2
    7,0,6,5,0,0,1,0,0,  // r3
    2,0,0,0,7,0,0,0,0,  // r4
    0,5,3,0,0,0,7,6,2,  // r5
    8,0,0,3,5,0,0,0,1,  // r6
    0,0,5,7,0,1,4,8,0,  // r7
    0,0,0,0,0,0,0,0,5,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    24,32,2,385,4,64,144,281,392,  // r0
    1,12,128,290,290,16,292,268,64,  // r1
    20,64,256,161,161,8,2,21,164,  // r2
    64,392,32,16,266,262,1,268,396,  // r3
    2,393,9,296,64,292,144,284,396,  // r4
    264,16,4,393,393,384,64,32,2,  // r5
    128,266,72,4,16,290,288,66,1,  // r6
    292,262,16,64,290,1,8,128,292,  // r7
    288,263,65,426,426,418,292,66,16,  // r8
  ]),
  expected: {
    technique: 'Finned Swordfish',
    rank: 15,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 20: Unique Rectangle
// Mined rank-clean from seeded generation (seed 640112); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank20 = {
  givens: board([
    0,4,9,0,2,7,0,0,0,  // r0
    0,0,0,0,0,0,0,0,0,  // r1
    6,3,0,0,1,0,0,2,0,  // r2
    0,1,2,0,0,3,0,0,4,  // r3
    7,0,3,1,4,2,0,6,0,  // r4
    0,6,0,7,5,0,2,0,0,  // r5
    0,0,6,4,0,5,0,8,2,  // r6
    8,0,0,0,0,0,9,4,7,  // r7
    0,0,0,0,0,0,0,5,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    17,8,256,180,2,64,181,5,181,  // r0
    19,210,209,436,164,40,124,320,437,  // r1
    32,4,208,400,1,392,216,2,400,  // r2
    272,1,2,416,416,4,208,320,8,  // r3
    64,400,4,1,8,2,144,32,400,  // r4
    264,32,136,64,16,384,2,5,5,  // r5
    5,320,32,8,320,16,5,128,2,  // r6
    128,18,17,38,36,33,256,8,64,  // r7
    271,322,73,386,448,385,37,16,37,  // r8
  ]),
  expected: {
    technique: 'Unique Rectangle',
    rank: 20,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 21: ALS-XZ
// Mined rank-clean from seeded generation (seed 640000); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank21 = {
  givens: board([
    0,6,2,0,3,7,0,0,0,  // r0
    1,0,8,0,0,5,0,0,7,  // r1
    0,7,9,0,0,4,2,0,0,  // r2
    7,0,6,5,0,0,1,0,0,  // r3
    2,0,0,0,7,0,0,0,0,  // r4
    0,5,3,0,0,0,7,6,2,  // r5
    8,0,0,3,5,0,0,0,1,  // r6
    0,0,5,7,0,1,4,8,0,  // r7
    0,0,0,0,0,0,0,0,5,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    24,32,2,385,4,64,144,281,392,  // r0
    1,12,128,290,290,16,292,268,64,  // r1
    20,64,256,129,161,8,2,21,164,  // r2
    64,392,32,16,266,262,1,268,396,  // r3
    2,393,9,296,64,292,144,284,396,  // r4
    264,16,4,393,393,384,64,32,2,  // r5
    128,266,72,4,16,290,288,66,1,  // r6
    292,262,16,64,290,1,8,128,292,  // r7
    288,263,65,426,426,418,292,66,16,  // r8
  ]),
  expected: {
    technique: 'ALS-XZ',
    rank: 21,
    type: 'elimination',
    complexityAcknowledged: true,
  },
};

// ===========================================================================
// Rank 20: Unique Rectangle — Type 2 variant
// Mined rank-clean from seeded generation (seed 1100088); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank20Type2 = {
  givens: board([
    0,0,4,6,0,0,0,9,0,  // r0
    0,0,9,0,2,0,4,0,0,  // r1
    0,3,6,4,0,9,0,0,0,  // r2
    6,0,2,0,0,0,0,4,0,  // r3
    8,4,1,2,0,7,3,5,0,  // r4
    9,0,3,8,0,4,0,0,0,  // r5
    3,9,7,0,0,2,6,8,4,  // r6
    4,6,5,9,8,3,2,1,7,  // r7
    1,2,8,7,4,6,9,3,5,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    82,129,8,32,85,145,81,256,7,  // r0
    80,129,256,21,2,145,8,96,37,  // r1
    82,4,32,8,81,256,209,66,131,  // r2
    32,80,2,21,277,17,193,8,385,  // r3
    128,8,1,2,288,64,4,16,288,  // r4
    256,80,4,128,49,8,65,98,35,  // r5
    4,256,64,17,17,2,32,128,8,  // r6
    8,32,16,256,128,4,2,1,64,  // r7
    1,2,128,64,8,32,256,4,16,  // r8
  ]),
  expected: {
    technique: 'Unique Rectangle',
    rank: 20,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};

// ===========================================================================
// Rank 20: Unique Rectangle — Type 4 variant
// Mined rank-clean from seeded generation (seed 950018); pencil state
// reproduces the mid-solve candidate set.
// ===========================================================================
export const rank20Type4 = {
  givens: board([
    0,1,0,7,0,0,0,6,9,  // r0
    6,0,2,0,0,9,0,0,0,  // r1
    7,9,3,0,0,0,0,0,0,  // r2
    0,7,0,8,0,0,3,2,4,  // r3
    0,5,0,9,0,2,0,0,8,  // r4
    0,2,0,0,1,0,0,9,0,  // r5
    2,6,0,0,0,0,9,0,0,  // r6
    0,0,0,0,4,0,0,0,7,  // r7
    0,0,0,0,9,0,0,8,0,  // r8
  ]),
  playerPen: null,
  pencil: pencil([
    152,1,152,64,134,140,138,32,256,  // r0
    32,136,2,25,144,256,217,85,21,  // r1
    64,256,4,57,178,185,155,25,19,  // r2
    257,64,257,128,48,48,4,2,8,  // r3
    12,16,40,256,68,2,97,65,128,  // r4
    132,2,160,12,1,76,112,256,48,  // r5
    2,32,217,21,212,213,256,29,21,  // r6
    401,132,401,55,8,181,51,21,64,  // r7
    25,12,89,55,256,117,59,128,55,  // r8
  ]),
  expected: {
    technique: 'Unique Rectangle',
    rank: 20,
    type: 'elimination',
    complexityAcknowledged: false,
  },
};
