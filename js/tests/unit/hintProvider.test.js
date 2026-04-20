/**
 * @fileoverview Unit tests for js/providers/hintProvider.js (HP1–HP8).
 *
 * Tests run in real Chromium via Playwright/Mocha. No jsdom.
 */

import { nextHint } from '../../providers/hintProvider.js';

// Minimal valid puzzle fixture: a near-complete board with one empty cell.
// Row 0: [5,3,4,6,7,8,9,1,2] — no givens at index 2 (the solution digit is 4).
// We use an almost-solved board so solveLogically can find placements quickly.
function makeSimplePuzzle() {
  const givens = new Uint8Array(81);
  const solution = new Uint8Array(81);

  // Fill the solution with a known valid grid.
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
  for (let i = 0; i < 81; i++) solution[i] = grid[i];

  // Leave only cell 2 empty in givens — naked single scenario.
  for (let i = 0; i < 81; i++) givens[i] = (i === 2) ? 0 : grid[i];

  return { id: 'test', difficulty: 'easy', givens, solution, solveTrace: [] };
}

// A puzzle with two empty cells: index 2 and index 11.
function makeTwoCellPuzzle() {
  const givens = new Uint8Array(81);
  const solution = new Uint8Array(81);

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
  for (let i = 0; i < 81; i++) solution[i] = grid[i];
  for (let i = 0; i < 81; i++) givens[i] = (i === 2 || i === 11) ? 0 : grid[i];

  return { id: 'test-two', difficulty: 'easy', givens, solution, solveTrace: [] };
}

describe('hintProvider', () => {
  // HP1: targetCell provided → returns placement for that cell
  it('HP1: targetCell provided → returns placement for that cell', () => {
    const puzzle = makeSimplePuzzle();
    const pen = puzzle.givens.slice();
    const playerState = { pen, conflicts: new Set() };

    const result = nextHint(puzzle, playerState, { targetCell: 2 });

    expect(result).to.not.be.null;
    expect(result.cellIndex).to.equal(2);
    expect(result.digit).to.equal(puzzle.solution[2]); // 4
    expect(result.technique).to.be.a('string');
  });

  // HP2: targetCell absent → returns first placement in trace
  it('HP2: targetCell absent → returns first placement in trace', () => {
    const puzzle = makeSimplePuzzle();
    const pen = puzzle.givens.slice();
    const playerState = { pen, conflicts: new Set() };

    const result = nextHint(puzzle, playerState, {});

    expect(result).to.not.be.null;
    expect(result.cellIndex).to.be.a('number');
    expect(result.digit).to.be.a('number').and.to.be.within(1, 9);
    expect(result.technique).to.be.a('string');
  });

  // HP3: Filters out conflict-flagged pen entries
  it('HP3: Filters out conflict-flagged pen entries', () => {
    const puzzle = makeSimplePuzzle();
    // Place a wrong digit (conflict) at cell 0 (which is normally a given of 5).
    // Use a puzzle where we can freely mark a pen cell as conflicted.
    const pen = new Uint8Array(81);
    for (let i = 0; i < 81; i++) pen[i] = puzzle.givens[i];
    // Index 2 is empty. Put a wrong digit there.
    pen[2] = 9; // wrong digit at index 2
    // Mark it as conflicted.
    const conflicts = new Set([2]);

    const result = nextHint(puzzle, playerState2(), { targetCell: 2 });

    function playerState2() {
      return { pen, conflicts };
    }

    // The working board should exclude the conflicted cell 2 (pen[2]=9 filtered out).
    // So the solver sees cell 2 as empty and can solve it.
    expect(result).to.not.be.null;
    expect(result.cellIndex).to.equal(2);
    expect(result.digit).to.equal(puzzle.solution[2]); // 4
  });

  // HP4: Includes non-conflict pen entries in working board
  it('HP4: Includes non-conflict pen entries in working board', () => {
    const puzzle = makeTwoCellPuzzle();
    // Pre-fill cell 11 correctly in pen (no conflict).
    const pen = new Uint8Array(81);
    for (let i = 0; i < 81; i++) pen[i] = puzzle.givens[i];
    pen[11] = puzzle.solution[11]; // correct value, no conflict

    const playerState = { pen, conflicts: new Set() };
    const result = nextHint(puzzle, playerState, { targetCell: 2 });

    expect(result).to.not.be.null;
    expect(result.cellIndex).to.equal(2);
    expect(result.digit).to.equal(puzzle.solution[2]);
  });

  // HP5: Pencil marks ignored — result independent of pencil
  it('HP5: Pencil marks ignored — result independent of pencil', () => {
    const puzzle = makeSimplePuzzle();
    const pen = puzzle.givens.slice();
    const playerState = { pen, conflicts: new Set() };

    // Get result without pencil context (hintProvider doesn't take pencil).
    const result1 = nextHint(puzzle, playerState, { targetCell: 2 });

    // The pencil argument is not part of hintProvider's interface, so we just
    // confirm the result is stable regardless.
    const result2 = nextHint(puzzle, playerState, { targetCell: 2 });

    expect(result1).to.deep.equal(result2);
  });

  // HP6: technique falls back to 'solution-lookup' when target not in placement trace
  it('HP6: technique falls back to solution-lookup when not in placement trace', () => {
    // Create a puzzle where solveLogically cannot solve cell 2 (e.g., many empty cells).
    // We make most cells empty so the solver won't produce a placement trace reaching index 40.
    const givens = new Uint8Array(81); // all empty
    const solution = new Uint8Array(81);
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
    for (let i = 0; i < 81; i++) solution[i] = grid[i];
    // Leave all cells empty — solver can't make progress via naked singles on empty board.
    const puzzle = { id: 'empty', difficulty: 'easy', givens, solution, solveTrace: [] };
    const pen = new Uint8Array(81);
    const playerState = { pen, conflicts: new Set() };

    // targetCell=40 — in an all-empty board the solver can't produce a trace for it.
    const result = nextHint(puzzle, playerState, { targetCell: 40 });

    expect(result).to.not.be.null;
    expect(result.cellIndex).to.equal(40);
    expect(result.digit).to.equal(solution[40]);
    expect(result.technique).to.equal('solution-lookup');
  });

  // HP7: Returns null when puzzle is already solved
  it('HP7: Returns null when puzzle is already solved (no unfilled cells)', () => {
    const puzzle = makeSimplePuzzle();
    // Fully fill pen with the solution.
    const pen = puzzle.solution.slice();
    const playerState = { pen, conflicts: new Set() };

    // With no targetCell and board fully solved, should return null.
    const result = nextHint(puzzle, playerState, {});

    expect(result).to.be.null;
  });

  // HP8: Performance — <500 ms on a near-solved board
  it('HP8: nextHint completes in <500 ms', () => {
    const puzzle = makeSimplePuzzle();
    const pen = puzzle.givens.slice();
    const playerState = { pen, conflicts: new Set() };

    const start = performance.now();
    nextHint(puzzle, playerState, { targetCell: 2 });
    const elapsed = performance.now() - start;

    expect(elapsed).to.be.below(500, `nextHint took ${elapsed.toFixed(1)} ms, expected <500 ms`);
  });
});
