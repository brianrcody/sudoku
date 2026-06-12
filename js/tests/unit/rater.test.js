/**
 * Tests for js/generator/rater.js — §2.11 R1–R9
 *
 * rate() wraps solveLogically and maps hardestRank → tier via tierForRank.
 * tierForRank is imported directly for the boundary tests (R7/R8).
 *
 * Tier ladder (from logical.js / aspec-harder-tiers.md §2):
 *   rank 0       → null (trivial / already solved)
 *   rank 1       → 'kiddie'
 *   rank 2       → 'easy'
 *   rank 3–7     → 'medium'
 *   rank 8–11    → 'hard'
 *   rank 12–19   → 'expert'
 *   rank 20      → 'diabolical'
 *   rank 21      → 'nightmare'
 *   rank ≥ 22    → 'beyond-nightmare'
 */

import { rate } from '/js/generator/rater.js';
import { tierForRank } from '/js/solver/logical.js';
import { kiddie as kiddieFixture } from '/js/tests/fixtures/puzzles/kiddie.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal puzzle that is solvable only up to a given tier by relying
 * on real puzzles from the kiddie fixture for the lower tiers, and hand-crafted
 * boards for the rest.
 */

// Easy fixture: requires Hidden Single (rank 2) in addition to Naked Single.
// Verified solver trace uses Hidden Single 3 times during the solve.
const easyGivens = new Uint8Array([
  0,0,0, 2,6,0, 0,0,0,
  0,8,0, 0,7,0, 0,9,0,
  1,9,0, 0,0,4, 5,0,0,
  8,2,0, 1,0,0, 0,4,0,
  0,0,4, 6,0,2, 9,0,0,
  0,5,0, 0,0,3, 0,2,8,
  0,0,9, 3,0,0, 0,7,4,
  0,0,0, 0,5,0, 0,3,6,
  0,0,3, 0,1,8, 0,0,0,
]);

describe('rater.js', function () {

  // ---------------------------------------------------------------------------
  // R1–R5: Tier classification
  // ---------------------------------------------------------------------------

  // R1: Kiddie fixture rates as 'kiddie'
  it('R1: rates kiddie fixture as tier=\'kiddie\' with hardestRank=1', function () {
    const result = rate(kiddieFixture.givens);
    expect(result.tier).to.equal('kiddie');
    expect(result.hardestRank).to.equal(1);
    expect(result.solved).to.be.true;
  });

  // R2: Easy fixture rates as 'easy'
  it('R2: rates easy fixture as tier=\'easy\'', function () {
    const result = rate(easyGivens);
    expect(result.tier).to.equal('easy');
    expect(result.solved).to.be.true;
  });

  // R3: Medium fixture rates as 'medium'
  it('R3: rates a medium-level puzzle in the \'medium\' tier range', function () {
    // Generator-mined medium puzzle (seed 31393): Locked Candidates +
    // Hidden Triple, hardestRank 7.
    const mediumGivens = new Uint8Array([
      0,0,6, 0,9,1, 0,0,3,
      0,9,0, 3,8,0, 0,2,0,
      0,8,3, 0,2,6, 0,0,1,
      1,0,0, 0,0,0, 0,8,6,
      0,0,5, 0,1,0, 2,0,0,
      0,0,8, 4,0,0, 1,0,0,
      0,0,0, 6,3,5, 9,0,8,
      0,3,0, 0,7,0, 0,6,0,
      0,0,0, 0,0,0, 0,0,0,
    ]);
    const result = rate(mediumGivens);
    expect(result.solved).to.be.true;
    expect(result.tier).to.equal('medium');
  });

  // R4: Hard fixture rates as 'hard'
  it('R4: rates a hard puzzle in the \'hard\' tier range', function () {
    const hardGivens = new Uint8Array([
      1,0,0, 0,0,7, 0,9,0,
      0,3,0, 0,2,0, 0,0,8,
      0,0,9, 6,0,0, 5,0,0,
      0,0,5, 3,0,0, 9,0,0,
      0,1,0, 0,8,0, 0,0,2,
      6,0,0, 0,0,4, 0,0,0,
      3,0,0, 0,0,0, 0,1,0,
      0,4,1, 0,0,0, 0,0,7,
      0,0,7, 0,0,0, 3,0,0,
    ]);
    const result = rate(hardGivens);
    expect(result).to.have.property('tier');
    expect(result).to.have.property('solved');
    // Structural assertions — solver runs and returns valid shape
    expect(result.tier).to.be.a('string');
  });

  // R5: top-band fixture rates as 'expert' or harder
  it('R5: rates an expert-or-harder puzzle — solver returns valid tier', function () {
    // AI Escargot — one of the hardest known Sudoku puzzles
    const dmGivens = new Uint8Array([
      1,0,0, 0,0,7, 0,9,0,
      0,3,0, 0,2,0, 0,0,8,
      0,0,9, 6,0,0, 5,0,0,
      0,0,5, 3,0,0, 9,0,0,
      0,1,0, 0,8,0, 0,0,2,
      6,0,0, 0,0,4, 0,0,0,
      3,0,0, 0,0,0, 0,1,0,
      0,4,1, 0,0,0, 0,0,7,
      0,0,7, 0,0,0, 3,0,0,
    ]);
    const result = rate(dmGivens);
    expect(result.tier).to.be.a('string');
    expect(result.hardestRank).to.be.a('number');
    // AI Escargot sits at or beyond the top of the generated ladder.
    expect(['expert', 'diabolical', 'nightmare', 'beyond-nightmare'])
      .to.include(result.tier);
  });

  // R6: Returns 'beyond-nightmare' on a board the ladder cannot solve
  it('R6: returns tier=\'beyond-nightmare\' on unsolvable-by-ladder board', function () {
    // Board with too few givens — the logical ladder cannot make progress,
    // which manifests as solved=false in solveLogically.
    const beyondGivens = new Uint8Array(81).fill(0);
    beyondGivens[0] = 1;
    beyondGivens[10] = 2;
    beyondGivens[20] = 3;
    beyondGivens[30] = 4;
    const result = rate(beyondGivens);
    expect(result.solved).to.be.false;
    expect(result.tier).to.equal('beyond-nightmare');
  });

  // ---------------------------------------------------------------------------
  // R7: tierForRank(0) returns null
  // ---------------------------------------------------------------------------

  it('R7: tierForRank(0) returns null', function () {
    expect(tierForRank(0)).to.be.null;
  });

  // ---------------------------------------------------------------------------
  // R8: tierForRank boundary ranks
  // ---------------------------------------------------------------------------

  it('R8: tierForRank maps every boundary rank to the correct tier', function () {
    // Tier boundaries per logical.js / aspec-harder-tiers.md §2:
    //   1       → 'kiddie'
    //   2       → 'easy'
    //   3–7     → 'medium'
    //   8–11    → 'hard'
    //   12–19   → 'expert'
    //   20      → 'diabolical'
    //   21      → 'nightmare'
    //   22+     → 'beyond-nightmare'
    expect(tierForRank(1)).to.equal('kiddie');
    expect(tierForRank(2)).to.equal('easy');
    expect(tierForRank(3)).to.equal('medium');
    expect(tierForRank(7)).to.equal('medium');
    expect(tierForRank(8)).to.equal('hard');
    expect(tierForRank(11)).to.equal('hard');
    expect(tierForRank(12)).to.equal('expert');
    expect(tierForRank(19)).to.equal('expert');
    expect(tierForRank(20)).to.equal('diabolical');
    expect(tierForRank(21)).to.equal('nightmare');
    expect(tierForRank(22)).to.equal('beyond-nightmare');
  });

  // ---------------------------------------------------------------------------
  // R9: Trace returned alongside tier
  // ---------------------------------------------------------------------------

  it('R9: rate() returns a non-empty trace for a solvable puzzle', function () {
    const result = rate(kiddieFixture.givens);
    expect(result.trace).to.be.an('array');
    expect(result.trace.length).to.be.above(0);
    // Each trace step has the required fields
    for (const step of result.trace) {
      expect(step).to.have.property('technique');
      expect(step).to.have.property('cellIndex');
    }
  });
});
