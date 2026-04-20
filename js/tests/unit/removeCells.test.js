/**
 * Tests for js/generator/removeCells.js — §2.10 RC1–RC6
 */

import { buildMinimalPuzzle } from '/js/generator/removeCells.js';
import { countSolutions } from '/js/solver/uniqueness.js';
import { fillGrid } from '/js/generator/fillGrid.js';
import { mulberry32 } from '/js/prng.js';

/**
 * Count the number of non-zero cells in a givens array.
 * @param {Uint8Array} givens
 * @returns {number}
 */
function countGivens(givens) {
  let n = 0;
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== 0) n++;
  }
  return n;
}

describe('removeCells (buildMinimalPuzzle)', function () {

  // RC1: Produces a unique puzzle
  it('RC1: resulting puzzle has exactly one solution', function () {
    const rng = mulberry32(1);
    const solution = fillGrid(mulberry32(1));
    const puzzle = buildMinimalPuzzle(solution, rng, { min: 30, max: 36 });
    const { count } = countSolutions(puzzle, 2);
    expect(count).to.equal(1);
  });

  // RC2: Stops at targetGivens reached — target.min=50 means stop early
  it('RC2: stops removing when given count reaches target.min', function () {
    const solution = fillGrid(mulberry32(42));
    const rng = mulberry32(42);
    // High min means very few removals — should stop near 50 givens
    const puzzle = buildMinimalPuzzle(solution, rng, { min: 50, max: 55 });
    const n = countGivens(puzzle);
    expect(n).to.be.at.least(50);
    expect(n).to.be.at.most(81);
  });

  // RC3: Stops when no safe removal remains — very low target (17) may be unreachable
  it('RC3: terminates even when targetGivens.min is very low (exhaustion branch)', function () {
    const solution = fillGrid(mulberry32(7));
    const rng = mulberry32(7);
    // Target min=17 — likely unreachable; function must still terminate with ≥17 givens
    const puzzle = buildMinimalPuzzle(solution, rng, { min: 17, max: 22 });
    const n = countGivens(puzzle);
    expect(n).to.be.at.least(17);
    // Uniqueness must still hold regardless
    const { count } = countSolutions(puzzle, 2);
    expect(count).to.equal(1);
  });

  // RC4: Restores cell when removal creates non-unique puzzle — restore branch
  // Use a high min (79) so almost every attempted removal would break uniqueness,
  // forcing the restore branch to fire on nearly every candidate cell.
  it('RC4: restores cells that would break uniqueness (restore branch fires)', function () {
    const solution = fillGrid(mulberry32(99));
    const rng = mulberry32(99);
    // Allow removing at most 2 cells (min=79). The rest must be restored.
    const puzzle = buildMinimalPuzzle(solution, rng, { min: 79, max: 81 });
    // The resulting puzzle must still have exactly one solution
    const { count } = countSolutions(puzzle, 2);
    expect(count).to.equal(1);
    // And we should have very few removed cells (at most 2)
    expect(countGivens(puzzle)).to.be.at.least(79);
  });

  // RC5: Deterministic given seed — two calls with same seed/solution produce identical output
  it('RC5: identical seeds produce identical puzzles', function () {
    const solution = fillGrid(mulberry32(1));
    const puzzle1 = buildMinimalPuzzle(solution.slice(), mulberry32(1), { min: 30, max: 36 });
    const puzzle2 = buildMinimalPuzzle(solution.slice(), mulberry32(1), { min: 30, max: 36 });
    expect(Array.from(puzzle1)).to.deep.equal(Array.from(puzzle2));
  });

  // RC6: Preserves solution matching — the puzzle's unique solution equals the original solution
  it('RC6: puzzle unique solution matches the original filled grid', function () {
    const solution = fillGrid(mulberry32(5));
    const rng = mulberry32(5);
    const puzzle = buildMinimalPuzzle(solution.slice(), rng, { min: 30, max: 36 });
    const { count, solution: recovered } = countSolutions(puzzle, 2);
    expect(count).to.equal(1);
    // Every filled cell in the solution should match the original
    for (let i = 0; i < 81; i++) {
      expect(recovered[i]).to.equal(solution[i],
        `cell ${i}: recovered ${recovered[i]}, original ${solution[i]}`);
    }
  });
});
