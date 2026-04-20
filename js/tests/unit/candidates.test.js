/**
 * Tests for js/solver/candidates.js — §2.6 (C1–C5)
 */

import { initialCandidates, applyPlacement } from '/js/solver/candidates.js';
import { ALL, has } from '/js/util/bitset.js';

// A known valid complete grid for testing filled-cell behaviour.
const FULL_GRID = (() => {
  const b = new Uint8Array(81);
  const grid = [
    5,3,4, 6,7,8, 9,1,2,
    6,7,2, 1,9,5, 3,4,8,
    1,9,8, 3,4,2, 5,6,7,
    8,5,9, 7,6,1, 4,2,3,
    4,2,6, 8,5,3, 7,9,1,
    7,1,3, 9,2,4, 8,5,6,
    9,6,1, 5,3,7, 2,8,4,
    2,8,7, 4,1,9, 6,3,5,
    3,4,5, 2,8,6, 1,7,9,
  ];
  for (let i = 0; i < 81; i++) b[i] = grid[i];
  return b;
})();

describe('candidates.js', function () {

  // C1: initialCandidates on empty cell sets ALL
  it('C1: empty cell starts with ALL candidates (511)', function () {
    const board = new Uint8Array(81); // all zeros
    const cands = initialCandidates(board);
    for (let i = 0; i < 81; i++) {
      expect(cands[i]).to.equal(ALL);
    }
  });

  // C2: initialCandidates on filled cell sets single-bit mask
  it('C2: filled cell carries its digit as a single-bit mask', function () {
    const board = new Uint8Array(81);
    board[0] = 5;
    const cands = initialCandidates(board);
    expect(cands[0]).to.equal(1 << 4); // bit for digit 5 (0-indexed)
  });

  // C3: initialCandidates eliminates peer digits from candidate sets
  it('C3: digit in a filled peer is removed from empty-cell candidates', function () {
    const board = new Uint8Array(81);
    board[0] = 5; // row 0, col 0
    const cands = initialCandidates(board);
    // All peers of cell 0 must not have digit 5 as a candidate.
    // Peers of cell 0 include all of row 0 (cells 1-8), col 0 (cells 9,18,...72), box 0.
    for (const peer of [1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 27, 36, 45, 54, 63, 72, 10, 11, 19, 20]) {
      expect(has(cands[peer], 5)).to.be.false;
    }
  });

  // C4: applyPlacement updates candidate sets
  it('C4: applyPlacement sets cell to single-bit mask and removes digit from peers', function () {
    const board = new Uint8Array(81);
    const cands = initialCandidates(board);

    applyPlacement(cands, 0, 5);

    expect(cands[0]).to.equal(1 << 4);
    // Peers of cell 0 must not have digit 5
    for (const peer of [1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 27, 36, 45, 54, 63, 72]) {
      expect(has(cands[peer], 5)).to.be.false;
    }
  });

  // C5: applyPlacement is idempotent on already-solved cell
  it('C5: applyPlacement applied twice does not change state further', function () {
    const board = new Uint8Array(81);
    const cands = initialCandidates(board);

    applyPlacement(cands, 40, 5);
    const snapAfterFirst = cands.slice();

    applyPlacement(cands, 40, 5); // second application
    for (let i = 0; i < 81; i++) {
      expect(cands[i]).to.equal(snapAfterFirst[i]);
    }
  });
});
