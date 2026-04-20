/**
 * @fileoverview Unit tests for js/game/conflicts.js (CF1–CF9).
 */

import { computeConflicts } from '../../game/conflicts.js';

describe('game/conflicts.js', () => {

  // CF1: No conflicts on empty board
  it('CF1: returns empty set for an all-zero board', () => {
    const board = new Uint8Array(81);
    const result = computeConflicts(board);
    expect(result.size).to.equal(0);
  });

  // CF2: Row duplicate detected
  it('CF2: detects duplicate digits in the same row', () => {
    const board = new Uint8Array(81);
    board[0] = 5; // row 0, col 0
    board[4] = 5; // row 0, col 4
    const result = computeConflicts(board);
    expect(result.has(0)).to.be.true;
    expect(result.has(4)).to.be.true;
    expect(result.size).to.equal(2);
  });

  // CF3: Column duplicate detected
  it('CF3: detects duplicate digits in the same column', () => {
    const board = new Uint8Array(81);
    board[1] = 3;  // row 0, col 1
    board[10] = 3; // row 1, col 1
    const result = computeConflicts(board);
    expect(result.has(1)).to.be.true;
    expect(result.has(10)).to.be.true;
    expect(result.size).to.equal(2);
  });

  // CF4: Box duplicate detected
  it('CF4: detects duplicate digits in the same box', () => {
    const board = new Uint8Array(81);
    board[0] = 7;  // row 0, col 0 — box 0
    board[20] = 7; // row 2, col 2 — box 0
    const result = computeConflicts(board);
    expect(result.has(0)).to.be.true;
    expect(result.has(20)).to.be.true;
    expect(result.size).to.equal(2);
  });

  // CF5: Triple conflict — all three flagged
  it('CF5: flags all three cells when three duplicates share a row', () => {
    const board = new Uint8Array(81);
    board[0] = 5; // row 0, col 0
    board[3] = 5; // row 0, col 3
    board[7] = 5; // row 0, col 7
    const result = computeConflicts(board);
    expect(result.has(0)).to.be.true;
    expect(result.has(3)).to.be.true;
    expect(result.has(7)).to.be.true;
    expect(result.size).to.equal(3);
  });

  // CF6: Pencil marks never flagged — board only contains pen digits
  it('CF6: returns empty set when board has no pen entries (all zeros)', () => {
    // computeConflicts operates on a board array; pencil marks are in a separate
    // data structure not passed here. Passing all-zero board (no pen digits) → no conflicts.
    const board = new Uint8Array(81);
    // Simulate pencil-only state by leaving board at all zeros.
    const result = computeConflicts(board);
    expect(result.size).to.equal(0);
  });

  // CF7: Mixed row + col conflict
  it('CF7: flags cells that conflict on both row and column axes', () => {
    const board = new Uint8Array(81);
    // cell 0 (row 0, col 0) conflicts with cell 5 (row 0, col 5) on row
    // and with cell 27 (row 3, col 0) on column
    board[0] = 4;
    board[5] = 4;  // same row
    board[27] = 4; // same column
    const result = computeConflicts(board);
    expect(result.has(0)).to.be.true;
    expect(result.has(5)).to.be.true;
    expect(result.has(27)).to.be.true;
  });

  // CF8: Conflict cleared on erase — re-eval on board without duplicate
  it('CF8: does not flag solo cell after duplicate is removed', () => {
    const board = new Uint8Array(81);
    board[0] = 5;
    board[4] = 5;
    // Both conflict.
    let result = computeConflicts(board);
    expect(result.has(0)).to.be.true;
    expect(result.has(4)).to.be.true;

    // Erase one of the duplicates.
    board[4] = 0;
    result = computeConflicts(board);
    expect(result.has(0)).to.be.false;
    expect(result.size).to.equal(0);
  });

  // CF9: Perf <5 ms on full board
  it('CF9: completes in <5 ms on a fully filled valid board', () => {
    // Build a valid full Sudoku board (no conflicts).
    const board = new Uint8Array(81);
    // Standard diagonally-shifted valid board.
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const shift = [0, 3, 6, 1, 4, 7, 2, 5, 8];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        board[r * 9 + c] = base[(c + shift[r]) % 9];
      }
    }
    const t0 = performance.now();
    computeConflicts(board);
    const elapsed = performance.now() - t0;
    expect(elapsed).to.be.below(5);
  });
});
