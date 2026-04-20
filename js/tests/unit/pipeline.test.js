/**
 * Tests for js/generator/pipeline.js — §2.12 PL1–PL11
 */

import { generateForTier, toPuzzle } from '/js/generator/pipeline.js';
import { rate } from '/js/generator/rater.js';
import { mulberry32 } from '/js/prng.js';
import { ATTEMPT_BUDGET } from '/js/config.js';

/**
 * Build opts for generateForTier with an explicit seed.
 * @param {number} seed
 * @param {object} overrides
 */
function makeOpts(seed, overrides = {}) {
  return { rng: mulberry32(seed), seed, ...overrides };
}

describe('pipeline.js', function () {

  // PL1: Produces correctly-tiered puzzle for each tier
  // We test kiddie only in PL1 for speed; higher tiers are covered by PL11 / system tests.
  it('PL1: generates a kiddie puzzle that rates at the kiddie tier', function () {
    // Use budget=50 to avoid long runs in test
    const puzzle = generateForTier('kiddie', makeOpts(1, { budget: 50 }));
    expect(puzzle).to.have.property('id');
    expect(puzzle).to.have.property('givens');
    expect(puzzle).to.have.property('solution');
    expect(puzzle).to.have.property('difficulty');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.solution).to.be.instanceof(Uint8Array);
    // Rate the returned givens — should match the reported tier
    const rated = rate(puzzle.givens);
    expect(rated.tier).to.equal(puzzle.difficulty);
  });

  // PL2: Honors onProgress callback
  it('PL2: calls onProgress at least once during generation', function () {
    const calls = [];
    generateForTier('kiddie', makeOpts(2, {
      budget: 20,
      onProgress(info) { calls.push(info); },
    }));
    // With a budget of 20 there will be at least one attempt, and the
    // first attempt triggers a progress callback (now - 0 >= 100ms).
    expect(calls.length).to.be.at.least(1);
    for (const c of calls) {
      expect(c).to.have.property('attempts');
      expect(c).to.have.property('budget');
      expect(c.attempts).to.be.a('number');
      expect(c.budget).to.be.a('number');
    }
  });

  // PL3: Respects abortSignal — pre-aborted signal throws immediately
  it('PL3: throws AbortError when abortSignal is already aborted', function () {
    const ac = new AbortController();
    ac.abort();
    let threw = false;
    try {
      generateForTier('kiddie', makeOpts(3, { abortSignal: ac.signal, budget: 10 }));
    } catch (err) {
      threw = true;
      expect(err.name).to.equal('AbortError');
    }
    expect(threw).to.be.true;
  });

  // PL4: Abort between attempts — abort signal fires after 1 progress callback
  it('PL4: throws AbortError when aborted during generation', function () {
    const ac = new AbortController();
    let threw = false;
    try {
      generateForTier('kiddie', makeOpts(4, {
        budget: 1000,
        abortSignal: ac.signal,
        onProgress() {
          // Abort after the first progress callback — fires between attempts
          ac.abort();
        },
      }));
    } catch (err) {
      threw = true;
      expect(err.name).to.equal('AbortError');
    }
    expect(threw).to.be.true;
  });

  // PL5: Attempt-budget fallback returns hardest-so-far
  it('PL5: returns hardest-so-far when budget exhausted (fallback branch)', function () {
    // budget=1 for kiddie — very likely to miss; we get a fallback puzzle
    const puzzle = generateForTier('kiddie', makeOpts(5, { budget: 1 }));
    // Should still return a valid puzzle shape
    expect(puzzle).to.have.property('id');
    expect(puzzle).to.have.property('givens');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.givens.length).to.equal(81);
    // Difficulty is whatever was found (may differ from 'kiddie')
    expect(puzzle.difficulty).to.be.a('string');
  });

  // PL6: Skips unsolved candidates — the `if (!result.solved) continue` branch
  // We can't force an unsolved intermediate directly, but we verify the function
  // runs to completion without throwing regardless of encountered intermediate states.
  it('PL6: handles puzzles that fail internal solve check without crashing', function () {
    // Run with a small budget and verify no throw
    let threw = false;
    try {
      generateForTier('easy', makeOpts(6, { budget: 5 }));
    } catch (err) {
      threw = true;
    }
    expect(threw).to.be.false;
  });

  // PL7: toPuzzle id is FNV-1a hex
  it('PL7: toPuzzle produces a stable 8-character FNV-1a hex id', function () {
    const givens = new Uint8Array(81).fill(1);
    const solution = new Uint8Array(81).fill(2);
    const trace = [];
    const seed = 42;
    const p1 = toPuzzle(givens, solution, 'kiddie', trace, seed);
    const p2 = toPuzzle(givens, solution, 'kiddie', trace, seed);
    // Deterministic
    expect(p1.id).to.equal(p2.id);
    // 8 hex chars = 32-bit FNV
    expect(p1.id).to.match(/^[0-9a-f]{8}$/);
    // Different input → different id
    const givensDiff = new Uint8Array(81).fill(3);
    const p3 = toPuzzle(givensDiff, solution, 'kiddie', trace, seed);
    expect(p3.id).to.not.equal(p1.id);
  });

  // PL8: Death March short-circuit reject — low-rank candidates are skipped
  // This is exercised implicitly when budget > 1 since most kiddie/easy
  // candidates are rejected when targeting death-march. We verify the pipeline
  // runs through its budget rather than crashing on a short-circuit.
  it('PL8: death-march short-circuit branch does not crash with budget=3', function () {
    const puzzle = generateForTier('death-march', makeOpts(8, { budget: 3 }));
    expect(puzzle).to.have.property('id');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
  });

  // PL9: Budget default is ATTEMPT_BUDGET[tier] when opts.budget absent
  it('PL9: uses ATTEMPT_BUDGET[tier] as default when budget is not provided', function () {
    // We spy on the progress callback's budget field to infer what budget was used.
    const seenBudgets = new Set();
    // Use a small tier budget tier to keep the test fast; abort after 1 progress
    const ac = new AbortController();
    try {
      generateForTier('kiddie', {
        rng: mulberry32(9),
        seed: 9,
        abortSignal: ac.signal,
        onProgress({ budget }) {
          seenBudgets.add(budget);
          ac.abort();
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
    // The reported budget should match the config default for 'kiddie'
    expect(seenBudgets.has(ATTEMPT_BUDGET.kiddie)).to.be.true;
  });

  // PL10: Puzzle shape conforms to aspec §4.16
  it('PL10: returned puzzle has all required keys', function () {
    const puzzle = generateForTier('kiddie', makeOpts(10, { budget: 20 }));
    expect(puzzle).to.have.property('id');
    expect(puzzle).to.have.property('difficulty');
    expect(puzzle).to.have.property('givens');
    expect(puzzle).to.have.property('solution');
    expect(puzzle).to.have.property('solveTrace');
    expect(puzzle.id).to.be.a('string');
    expect(puzzle.difficulty).to.be.a('string');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.solution).to.be.instanceof(Uint8Array);
    expect(puzzle.solveTrace).to.be.an('array');
    // No 'fallback' key on the Puzzle object itself (it's on the worker message)
    expect(puzzle).to.not.have.property('fallback');
  });

  // PL11: Perf — DM generation within 30 s hard cap; warn above 5 s
  it('PL11: [perf] death-march generation completes within 30 s', function () {
    this.timeout(35000);
    const t0 = performance.now();
    generateForTier('death-march', makeOpts(11));
    const elapsed = performance.now() - t0;
    if (elapsed > 5000) {
      console.warn(`[perf] death-march generation: ${(elapsed / 1000).toFixed(2)}s`);
    }
    expect(elapsed).to.be.below(30000);
  });
});
