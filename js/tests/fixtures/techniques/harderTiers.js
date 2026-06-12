/**
 * Fixtures for the V3 harder-tiers techniques (ranks 12–15, 20, 21):
 * XYZ-Wing, WXYZ-Wing, Finned X-Wing, Finned Swordfish, Unique Rectangle,
 * ALS-XZ.
 *
 * These are synthetic candidate states: every cell defaults to a filled 9
 * (inert single-bit candidates); pattern cells are opened with explicit
 * candidate sets. Techniques consume {board, candidates} directly, so the
 * states exercise exactly the targeted pattern. Real-board coverage comes
 * from the mined coach fixtures and the randomized soundness sweep.
 */

/**
 * Build a synthetic state. `cells` maps cellIndex → candidate digit array.
 *
 * @param {Object<number, number[]>} cells
 * @returns {{ board: Uint8Array, candidates: Uint16Array }}
 */
function synth(cells) {
  const board = new Uint8Array(81).fill(9);
  const candidates = new Uint16Array(81).fill(1 << 8);
  for (const [idx, digits] of Object.entries(cells)) {
    const i = Number(idx);
    board[i] = 0;
    let m = 0;
    for (const d of digits) m |= 1 << (d - 1);
    candidates[i] = m;
  }
  return { board, candidates };
}

const C = (r, c) => r * 9 + c;

// ---------------------------------------------------------------------------
// XYZ-Wing
// ---------------------------------------------------------------------------

// Pivot r0c0 {1,2,3}; wings r0c4 {1,3} (row peer) and r1c1 {2,3} (box peer).
// Z=3 → eliminated from r0c1, r0c2 (see pivot, both wings).
export const xyzPos1 = () => synth({
  [C(0, 0)]: [1, 2, 3],
  [C(0, 4)]: [1, 3],
  [C(1, 1)]: [2, 3],
  [C(0, 1)]: [3, 5],
  [C(0, 2)]: [3, 6],
});

// Column orientation: pivot r0c0 {4,5,6}; wings r4c0 {4,6} (col) and r2c2 {5,6} (box).
// Z=6 → eliminated from r1c0, r2c0 (col 0 ∩ box 0).
export const xyzPos2 = () => synth({
  [C(0, 0)]: [4, 5, 6],
  [C(4, 0)]: [4, 6],
  [C(2, 2)]: [5, 6],
  [C(1, 0)]: [6, 7],
  [C(2, 0)]: [6, 8],
});

// Both wings inside the pivot's box. Z=9 → eliminated from the remaining
// box cell that sees all three.
export const xyzPos3 = () => synth({
  [C(4, 4)]: [7, 8, 9],
  [C(3, 3)]: [7, 9],
  [C(5, 5)]: [8, 9],
  [C(3, 5)]: [9, 1],
  [C(5, 3)]: [9, 2],
});

// Null: wing2 lacks the shared Z — pattern incomplete.
export const xyzNull = () => synth({
  [C(0, 0)]: [1, 2, 3],
  [C(0, 4)]: [1, 3],
  [C(1, 1)]: [2, 5],
  [C(0, 1)]: [3, 5],
});

// ---------------------------------------------------------------------------
// WXYZ-Wing
// ---------------------------------------------------------------------------

// Bent set over box 0 + row 0: r0c0 {1,2}, r0c1 {1,3}, r1c0 {1,4} (box-only),
// r0c5 {2,3,4} (row-only). Z=4 (its cells r1c0/r0c5 do not see each other;
// every other digit is confined to mutually visible cells).
// Elimination: 4 from r0c2 (sees both Z cells).
export const wxyzPos1 = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 3],
  [C(1, 0)]: [1, 4],
  [C(0, 5)]: [2, 3, 4],
  [C(0, 2)]: [4, 5],
});

// Column orientation: box 0 + col 0.
export const wxyzPos2 = () => synth({
  [C(0, 0)]: [1, 2],
  [C(1, 0)]: [1, 3],
  [C(0, 1)]: [1, 4],
  [C(5, 0)]: [2, 3, 4],
  [C(2, 0)]: [4, 5],
});

// Box 8 + row 8 geometry.
export const wxyzPos3 = () => synth({
  [C(8, 8)]: [5, 6],
  [C(8, 7)]: [5, 7],
  [C(7, 8)]: [5, 8],
  [C(8, 2)]: [6, 7, 8],
  [C(8, 6)]: [8, 9],
});

// Null: the would-be Z cells all see each other AND a second digit's cells
// don't — no digit satisfies the bent-ALS condition with an elimination.
export const wxyzNull = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 3],
  [C(1, 0)]: [1, 4],
  [C(0, 5)]: [2, 3],
});

// ---------------------------------------------------------------------------
// Finned fish
// ---------------------------------------------------------------------------

// Finned X-Wing on digit 4: base rows 2 and 7, cover cols 3 and 8;
// fin at r7c7 (same box as r7c8). Eliminations: 4 from r6c8 and r8c8.
export const finnedXPos1 = () => synth({
  [C(2, 3)]: [4, 1],
  [C(2, 8)]: [4, 6],
  [C(7, 3)]: [4, 9],
  [C(7, 8)]: [4, 2],
  [C(7, 7)]: [4, 5],
  [C(6, 8)]: [4, 3, 8],
  [C(8, 8)]: [4, 7],
});

// Column-based finned X-Wing on digit 2: base cols 1 and 6, cover rows 1 and 6;
// fin at r7c1... (transpose of the row case). Base cells (1,1),(6,1),(1,6),(6,6);
// fin (7,1) shares box 6 with (6,1)? boxOf(6,1)=6, boxOf(7,1)=6 ✓.
// Eliminations: 2 from row 6 ∩ box 6: r6c0, r6c2.
export const finnedXPos2 = () => synth({
  [C(1, 1)]: [2, 5],
  [C(6, 1)]: [2, 7],
  [C(1, 6)]: [2, 8],
  [C(6, 6)]: [2, 9],
  [C(7, 1)]: [2, 3],
  [C(6, 0)]: [2, 6],
  [C(6, 2)]: [2, 4],
});

// Sashimi: fin row has only ONE candidate in the cover set plus the fin.
export const finnedXSashimi = () => synth({
  [C(2, 3)]: [4, 1],
  [C(2, 8)]: [4, 6],
  [C(7, 8)]: [4, 2],
  [C(7, 7)]: [4, 5],
  [C(7, 3)]: [4, 9],
  [C(6, 8)]: [4, 3],
});

// Finned Swordfish on digit 5: base rows 1, 4, 7; cover cols 0, 4, 8;
// fin at r7c7 (box 8). Eliminations: 5 from col 8 ∩ box 8: r6c8, r8c8.
export const finnedSwordfishPos1 = () => synth({
  [C(1, 0)]: [5, 1],
  [C(1, 4)]: [5, 2],
  [C(4, 0)]: [5, 3],
  [C(4, 4)]: [5, 6],
  [C(4, 8)]: [5, 7],
  [C(7, 0)]: [5, 8],
  [C(7, 8)]: [5, 9],
  [C(7, 7)]: [5, 4],
  [C(6, 8)]: [5, 2],
  [C(8, 8)]: [5, 3],
});

// Null for both finned sizes: only one unit carries the digit — no fish of
// any size or orientation can form.
export const finnedNull = () => synth({
  [C(2, 3)]: [4, 1],
  [C(2, 8)]: [4, 6],
});

// ---------------------------------------------------------------------------
// Unique Rectangle
// ---------------------------------------------------------------------------

// Type 1: rectangle r0c0/r0c1/r4c0/r4c1 (boxes 0 and 3); three floor corners
// exactly {1,2}; roof r4c1 {1,2,3} → eliminate 1 and 2 from the roof.
export const urType1Pos = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 2],
  [C(4, 0)]: [1, 2],
  [C(4, 1)]: [1, 2, 3],
});

// Type 2: floor r0c0/r0c1 exactly {1,2}; roof r4c0/r4c1 both exactly {1,2,5}
// → eliminate 5 from cells seeing both roof cells (r4c2 here).
export const urType2Pos = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 2],
  [C(4, 0)]: [1, 2, 5],
  [C(4, 1)]: [1, 2, 5],
  [C(4, 2)]: [5, 6],
});

// Type 4: floor r0c0/r0c1 exactly {1,2}; roof r4c0 {1,2,7}, r4c1 {1,2,8}.
// Digit 1 is confined to the roof pair within their shared units → remove 2
// from both roof cells.
export const urType4Pos = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 2],
  [C(4, 0)]: [1, 2, 7],
  [C(4, 1)]: [1, 2, 8],
});

// Null: rectangle spans four boxes — the deadly pattern does not apply.
export const urNull = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 4)]: [1, 2],
  [C(4, 0)]: [1, 2],
  [C(4, 4)]: [1, 2, 3],
});

// ---------------------------------------------------------------------------
// ALS-XZ
// ---------------------------------------------------------------------------

// A = {r0c0} ({1,2}); B = {r0c4, r0c5} (union {1,2,3}). X=2 restricted
// (row 0); Z=1 → eliminate 1 from r0c7 (sees every 1 in both sets).
export const alsPos1 = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 4)]: [2, 3],
  [C(0, 5)]: [1, 3],
  [C(0, 7)]: [1, 9],
});

// Column-shaped B: A = {r0c0}; B = {r0c4, r1c4} in col 4. X=2 restricted via
// row 0; Z=1 eliminated from r1c0 (sees r0c0 via box/col and r1c4 via row).
export const alsPos2 = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 4)]: [2, 3],
  [C(1, 4)]: [1, 3],
  [C(1, 0)]: [1, 5],
});

// Larger A: two cells. A = {r3c0, r4c0} (union {4,5,6});
// B = {r6c0, r7c0} (union {4,6,7}). X=4 restricted (col 0); Z=6 →
// eliminate 6 from r8c0.
export const alsPos3 = () => synth({
  [C(3, 0)]: [4, 5],
  [C(4, 0)]: [5, 6],
  [C(6, 0)]: [4, 7],
  [C(7, 0)]: [6, 7],
  [C(8, 0)]: [6, 9],
});

// Null: the two sets' common digits' cells never see each other.
export const alsNull = () => synth({
  [C(0, 0)]: [1, 2],
  [C(5, 4)]: [2, 3],
  [C(5, 5)]: [1, 3],
});

// All open cells confined to one box (no line-only cell) — bent condition
// fails in every box/line pairing.
export const wxyzAllBox = () => synth({
  [C(1, 1)]: [1, 2],
  [C(1, 2)]: [2, 3],
  [C(2, 1)]: [3, 4],
  [C(2, 2)]: [4, 1],
});

// All open cells on one row spanning boxes (no box-only cell).
export const wxyzAllLine = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [2, 3],
  [C(0, 4)]: [3, 4],
  [C(0, 5)]: [4, 1],
});

// Incomplete UR: three floor corners {1,2} but the roof is missing digit 2 —
// no type applies (also exercises the Type-4 roof guards).
export const urIncomplete = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 2],
  [C(4, 0)]: [1, 2],
  [C(4, 1)]: [1, 3],
});

// Degenerate deadly pattern: all four corners exactly {1,2}. Impossible in a
// valid unique-solution puzzle; the scanner must skip every type cleanly.
export const urDeadly = () => synth({
  [C(0, 0)]: [1, 2],
  [C(0, 1)]: [1, 2],
  [C(4, 0)]: [1, 2],
  [C(4, 1)]: [1, 2],
});
