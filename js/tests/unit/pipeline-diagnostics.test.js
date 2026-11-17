/**
 * @fileoverview Unit tests for the generation diagnostics added to
 * js/generator/pipeline.js (PD1–PD8), including the regression pins that prove
 * the diagnostics did not change which puzzle a seed produces. Phase 2 of debug
 * instrumentation adds the seed fields, the Unrated fallback (PD9–PD12), and
 * seeded-generation determinism (PR4).
 */

import { generateForTier } from '../../generator/pipeline.js';
import { mulberry32 } from '../../prng.js';
import { rate } from '../../generator/rater.js';
import { tierForRank } from '../../solver/logical.js';
import { ATTEMPT_BUDGET, UNRATED } from '../../config.js';

const gen = (tier, seed, budget) => generateForTier(tier, { rng: mulberry32(seed), seed, budget });

/**
 * [tier, seed, budget, id, difficulty, givens, trace length] captured from the
 * pipeline BEFORE diagnostics were added (2026-11-13).
 */
const PINS = [
  ['kiddie', 1, undefined, '2fe4fb4f', 'kiddie', '854003009962010730137205060006109000508074210001002983010847300000906040049531070', 36],
  ['easy', 42, undefined, '4a35a7e6', 'easy', '007200000035709280291508734780931000900602000000800109500000060300090810100000950', 45],
  ['medium', 7, undefined, '46259922', 'medium', '900002801160009040800400000009000060020084000007050180038001005010090074700005010', 52],
  ['hard', 2024, undefined, '74bf42aa', 'hard', '400035007006040001000000000652000700100060000000500300000450000780601090091080006', 60],
  ['expert', 99, 40, 'bafff09d', 'expert', '007100003000900180000002006400001020000060000000807600960000000070050030501030400', 70],
  ['nightmare', 5, 3, 'd9b35545', 'easy', '005200000100007000024960000000000700700402310203100006500003000000600170010008030', 55],
];

describe('pipeline.js — generation diagnostics', function () {
  this.timeout(30000);

  let warn;
  beforeEach(() => { warn = console.warn; console.warn = () => {}; });
  afterEach(() => { console.warn = warn; });

  for (const [tier, seed, budget, id, difficulty, givens, traceLength] of PINS) {
    it(`PD1: seed ${seed} (${tier}) still produces the pre-diagnostics puzzle`, () => {
      const puzzle = gen(tier, seed, budget);
      expect(puzzle.id).to.equal(id);
      expect(puzzle.difficulty).to.equal(difficulty);
      expect(Array.from(puzzle.givens).join('')).to.equal(givens);
      expect(puzzle.solveTrace).to.have.length(traceLength);
    });
  }

  it('PD2: a generated puzzle is marked as generated and carries diagnostics', () => {
    const puzzle = gen('easy', 42);
    expect(puzzle.source).to.equal('generated');
    expect(puzzle.gen.requestedTier).to.equal('easy');
    expect(puzzle.gen.seed).to.equal(42);
    expect(puzzle.gen.seedBy).to.equal('random');
    expect(puzzle.gen.budget).to.equal(ATTEMPT_BUDGET.easy);
    expect(puzzle.gen.fallback).to.be.false;
  });

  it('PD3: on success, attempts = rejections + the accepted attempt', () => {
    const { gen: g } = gen('hard', 2024);
    expect(g.attempts).to.be.at.least(1);
    expect(g.rejected.unsolved + g.rejected.wrongTier + 1).to.equal(g.attempts);
  });

  it('PD4: the per-tier breakdown sums to the wrong-tier count and never names the requested tier', () => {
    const { gen: g } = gen('hard', 2024);
    const sum = Object.values(g.rejected.byTier).reduce((a, b) => a + b, 0);
    expect(sum).to.equal(g.rejected.wrongTier);
    expect(g.rejected.wrongTier).to.be.above(0);
    expect(g.rejected.byTier).to.not.have.property('hard');
  });

  it('PD5: an explicit budget is reported', () => {
    expect(gen('expert', 99, 40).gen.budget).to.equal(40);
  });

  it('PD6: budget exhaustion reports fallback with every attempt rejected', () => {
    const puzzle = gen('nightmare', 5, 3);
    expect(puzzle.difficulty).to.not.equal('nightmare');
    expect(puzzle.gen.requestedTier).to.equal('nightmare');
    expect(puzzle.gen.fallback).to.be.true;
    expect(puzzle.gen.attempts).to.equal(3);
    expect(puzzle.gen.rejected.unsolved + puzzle.gen.rejected.wrongTier).to.equal(3);
  });

  it('PD7: the degenerate no-candidate path counts its extra attempt and reports fallback', () => {
    const puzzle = gen('easy', 42, 0);
    expect(puzzle.source).to.equal('generated');
    expect(puzzle.gen.fallback).to.be.true;
    expect(puzzle.gen.attempts).to.equal(1);
    expect(puzzle.gen.budget).to.equal(0);
    expect(puzzle.gen.rejected).to.deep.equal({ unsolved: 0, wrongTier: 0, byTier: {} });
    expect(puzzle.difficulty).to.not.equal(UNRATED);
  });

  it('PD8: candidates the rater cannot solve are counted as unsolved', () => {
    // Top-tier targets strip to minimality, where roughly 1 in 15 candidates
    // is beyond the solver; 40 attempts at seed 12345 include several.
    const { gen: g } = gen('diabolical', 12345, 40);
    expect(g.rejected.unsolved).to.be.above(0);
  });
});

/** Everything a seeded run promises to reproduce (fspec-007 §7.4). */
const reproducible = puzzle => ({
  id: puzzle.id,
  difficulty: puzzle.difficulty,
  givens: Array.from(puzzle.givens),
  solution: Array.from(puzzle.solution),
  solveTrace: puzzle.solveTrace,
  gen: puzzle.gen,
});

const seeded = (tier, seed, budget) =>
  generateForTier(tier, { rng: mulberry32(seed), seed, seeded: true, budget });

describe('pipeline.js — seed plumbing and the Unrated fallback (Phase 2)', function () {
  this.timeout(30000);

  let warn;
  beforeEach(() => { warn = console.warn; console.warn = () => {}; });
  afterEach(() => { console.warn = warn; });

  it('PD9: an unseeded run records its seed as chosen by the generator', () => {
    const { gen: g } = generateForTier('easy', { rng: mulberry32(42), seed: 42 });
    expect(g.seed).to.equal(42);
    expect(g.seedBy).to.equal('random');
  });

  it('PD9: a seeded run records its seed as chosen by the developer', () => {
    const { gen: g } = seeded('easy', 42);
    expect(g.seed).to.equal(42);
    expect(g.seedBy).to.equal('developer');
  });

  it('PD10: the seeded flag changes nothing but seedBy', () => {
    const random = reproducible(gen('easy', 42));
    const developer = reproducible(seeded('easy', 42));

    expect(developer.gen.seedBy).to.equal('developer');
    expect({ ...developer, gen: { ...developer.gen, seedBy: 'random' } }).to.deep.equal(random);
  });

  for (const tier of ['expert', 'nightmare']) {
    it(`PD11: ${tier} seed 223 with budget 1, never solvable, is delivered as Unrated`, () => {
      const puzzle = gen(tier, 223, 1);

      expect(puzzle.difficulty).to.equal(UNRATED);
      expect(puzzle.gen.fallback).to.be.true;
      expect(puzzle.gen.attempts).to.equal(2);
      expect(puzzle.gen.rejected.unsolved).to.equal(1);
      const rating = rate(puzzle.givens);
      expect(rating.solved).to.be.false;
      expect(puzzle.solveTrace).to.deep.equal(rating.trace);
    });
  }

  it('PD12: a degenerate run whose candidate solves keeps its true tier', () => {
    const puzzle = gen('easy', 42, 0);

    expect(puzzle.difficulty).to.equal(tierForRank(rate(puzzle.givens).hardestRank));
    expect(puzzle.difficulty).to.not.equal(UNRATED);
  });
});

describe('pipeline.js — seeded-generation determinism (PR4)', function () {
  this.timeout(30000);

  let warn;
  beforeEach(() => { warn = console.warn; console.warn = () => {}; });
  afterEach(() => { console.warn = warn; });

  for (const [tier, seed, budget] of [
    ['kiddie', 1], ['easy', 42], ['medium', 7], ['hard', 2024],
    ['expert', 99, 40], ['diabolical', 1, 3], ['nightmare', 5, 3],
  ]) {
    it(`PR4: ${tier} seed ${seed}${budget ? ` budget ${budget}` : ''} reproduces the same puzzle and diagnostics`, () => {
      expect(reproducible(seeded(tier, seed, budget))).to.deep.equal(reproducible(seeded(tier, seed, budget)));
    });
  }

  it('PR4: easy seed 26 exhausts the real budget and falls back to Hard, identically twice', () => {
    const first = seeded('easy', 26);
    const second = seeded('easy', 26);

    expect(first.difficulty).to.equal('hard');
    expect(first.gen.fallback).to.be.true;
    expect(reproducible(second)).to.deep.equal(reproducible(first));
  });

  for (const tier of ['nightmare', 'diabolical']) {
    it(`PR4: ${tier} seed 1 with budget 3 falls back to Easy, identically twice`, () => {
      const first = seeded(tier, 1, 3);
      const second = seeded(tier, 1, 3);

      expect(first.difficulty).to.equal('easy');
      expect(reproducible(second)).to.deep.equal(reproducible(first));
    });
  }

  it('PR4: expert seed 223 with budget 1 is Unrated, identically twice', () => {
    const first = seeded('expert', 223, 1);
    const second = seeded('expert', 223, 1);

    expect(first.difficulty).to.equal(UNRATED);
    expect(reproducible(second)).to.deep.equal(reproducible(first));
  });

  it('PR4: a random run and its seeded reproduction differ only in seedBy', () => {
    const random = reproducible(gen('medium', 7));
    const developer = reproducible(seeded('medium', 7));

    expect({ ...developer, gen: { ...developer.gen, seedBy: 'random' } }).to.deep.equal(random);
  });
});
