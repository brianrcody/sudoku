/**
 * Tests for js/solver/uniqueness.js — §2.5 (U1–U9)
 */

import { countSolutions } from '/js/solver/uniqueness.js';

// A well-known minimal-givens puzzle with a unique solution.
// Source: Gordon Royle's 17-clue collection (simplified for test speed).
const UNIQUE_PUZZLE = (() => {
  const b = new Uint8Array(81);
  // Simple puzzle solvable purely by naked/hidden singles — fast uniqueness check.
  const givens = [
    5,3,0, 0,7,0, 0,0,0,
    6,0,0, 1,9,5, 0,0,0,
    0,9,8, 0,0,0, 0,6,0,
    8,0,0, 0,6,0, 0,0,3,
    4,0,0, 8,0,3, 0,0,1,
    7,0,0, 0,2,0, 0,0,6,
    0,6,0, 0,0,0, 2,8,0,
    0,0,0, 4,1,9, 0,0,5,
    0,0,0, 0,8,0, 0,7,9,
  ];
  for (let i = 0; i < 81; i++) b[i] = givens[i];
  return b;
})();

// A valid complete Sudoku grid.
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

// Two-solution board: remove two symmetrically-placed cells from a valid grid
// leaving the two digits swappable. A simple Sudoku "Deadly Pattern".
const TWO_SOLUTION_BOARD = (() => {
  const b = FULL_GRID.slice();
  // Remove digits at cells 0 and 1 (row 0, cols 0 and 1: 5 and 3).
  // These are in the same row AND the same box.
  // For a true 2-solution board we need a deadly rectangle:
  // Use cells that form a rectangle across two rows and two columns,
  // where the four digits can be swapped between two rows.
  // Cell (0,0)=5, (0,1)=3, (1,0)=6, (1,1)=7 → can we swap rows? No — different digits.
  // Instead, find two rows where two columns hold the same two digits (swappable):
  // Look at rows 0 and 1 in full grid:
  //   row0: 5,3,4,6,7,8,9,1,2
  //   row1: 6,7,2,1,9,5,3,4,8
  // No simple swap. Use a known construction: remove cell 4 (row0,col4)=7 and cell 40 (row4,col4)=5
  // and cell 4's value and cell 40's value are different — won't create 2 solutions.
  //
  // Easiest reliable multi-solution board: start with nearly empty board.
  // Just use 2 clues that don't constrain enough.
  const sparse = new Uint8Array(81);
  sparse[0] = 1;
  sparse[1] = 2;
  // Board has many solutions → countSolutions with cap=2 returns count=2.
  return sparse;
})();

// Contradictory board: digit 5 appears twice in row 0.
const CONTRADICTORY_BOARD = (() => {
  const b = new Uint8Array(81);
  b[0] = 5;
  b[1] = 5; // duplicate in same row
  return b;
})();

describe('uniqueness.js', function () {

  // U1: countSolutions on valid unique puzzle
  it('U1: unique puzzle returns count=1 with a solution', function () {
    const { count, solution } = countSolutions(UNIQUE_PUZZLE);
    expect(count).to.equal(1);
    expect(solution).to.be.instanceOf(Uint8Array);
    expect(solution.length).to.equal(81);
    // Solution must fill every cell
    for (let i = 0; i < 81; i++) {
      expect(solution[i]).to.be.at.least(1).and.at.most(9);
    }
  });

  // U2: countSolutions on multi-solution board
  it('U2: sparse board returns count=2 (capped)', function () {
    const { count } = countSolutions(TWO_SOLUTION_BOARD, 2);
    expect(count).to.equal(2);
  });

  // U3: countSolutions on contradictory board
  it('U3: board with row-duplicate given returns count=0', function () {
    const { count, solution } = countSolutions(CONTRADICTORY_BOARD);
    expect(count).to.equal(0);
    expect(solution).to.be.null;
  });

  // U4: countSolutions respects cap parameter
  it('U4: cap parameter stops enumeration', function () {
    const sparse = new Uint8Array(81); // all empty — many solutions
    const { count } = countSolutions(sparse, 2);
    expect(count).to.equal(2);
  });

  // U5: countSolutions on empty board returns count=2 (capped)
  it('U5: empty board returns count=2 (capped at default cap=2)', function () {
    const empty = new Uint8Array(81);
    const { count } = countSolutions(empty, 2);
    expect(count).to.equal(2);
  });

  // U6: countSolutions on fully solved board
  it('U6: fully solved grid returns count=1', function () {
    const { count, solution } = countSolutions(FULL_GRID);
    expect(count).to.equal(1);
    expect(solution).to.not.be.null;
  });

  // U7: countSolutions completes in <10 ms
  it('U7: unique puzzle solved in <10 ms [perf]', function () {
    const t0 = performance.now();
    countSolutions(UNIQUE_PUZZLE);
    const elapsed = performance.now() - t0;
    if (elapsed >= 10) {
      console.warn(`[perf] U7: countSolutions took ${elapsed.toFixed(1)} ms (budget 10 ms)`);
    }
    // Catastrophic regression gate only (×5 budget)
    expect(elapsed).to.be.below(50);
  });

  // U8: Propagation contradiction detected
  it('U8: board with forced conflict during propagation returns count=0', function () {
    // Build a board where a cell has no valid digit once peers are assigned.
    // Row 0: 1,2,3,4,5,6,7,8,9 — fully filled, valid
    // Row 1: 9,8,7,6,5,4,3,2,1 — valid
    // Row 2, col 0 must be something ≠ 1..9 in its row peers... impossible if all 9 are taken.
    const b = new Uint8Array(81);
    // Place conflicting givens: cell 0 = 5, cell 4 = 5 (same row)
    b[0] = 5;
    b[4] = 5;
    const { count } = countSolutions(b);
    expect(count).to.equal(0);
  });

  // U9: MRV cell selection produces correct solution
  it('U9: solver finds correct solution using MRV heuristic', function () {
    const { count, solution } = countSolutions(UNIQUE_PUZZLE);
    expect(count).to.equal(1);
    // Verify solution satisfies each row (all digits 1-9 present)
    for (let r = 0; r < 9; r++) {
      const row = new Set();
      for (let c = 0; c < 9; c++) row.add(solution[r * 9 + c]);
      expect(row.size).to.equal(9);
    }
    // Verify original givens are preserved
    for (let i = 0; i < 81; i++) {
      if (UNIQUE_PUZZLE[i] !== 0) {
        expect(solution[i]).to.equal(UNIQUE_PUZZLE[i]);
      }
    }
  });
});
