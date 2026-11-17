/**
 * Tests for js/worker/protocol.js — §2.13 WP1–WP2
 */

import {
  MSG,
  makeGenRequest,
  makeGenAbort,
  makeGenProgress,
  makeGenResult,
  makeGenError,
  makeLoadRequest,
  makeLoadResult,
  makeCheckRequest,
  makeCheckResult,
} from '/js/worker/protocol.js';

describe('protocol.js', function () {

  // WP1: MSG constants exported as strings
  it('WP1: MSG exports the required string constants', function () {
    expect(MSG).to.be.an('object');
    // Required constants
    expect(MSG.GEN_REQUEST).to.equal('GEN_REQUEST');
    expect(MSG.GEN_PROGRESS).to.equal('GEN_PROGRESS');
    expect(MSG.GEN_RESULT).to.equal('GEN_RESULT');
    expect(MSG.GEN_ERROR).to.equal('GEN_ERROR');
    expect(MSG.GEN_ABORT).to.equal('GEN_ABORT');
    // All values are non-empty strings
    for (const [key, val] of Object.entries(MSG)) {
      expect(val, key).to.be.a('string').that.is.not.empty;
    }
  });

  // MSG is frozen
  it('WP1b: MSG is frozen (immutable)', function () {
    expect(Object.isFrozen(MSG)).to.be.true;
  });

  // WP2: Envelope helpers round-trip
  it('WP2: makeGenRequest produces a GEN_REQUEST envelope with correct fields', function () {
    const env = makeGenRequest({ id: 'r1', tier: 'kiddie', seed: 42, background: false });
    expect(env.type).to.equal(MSG.GEN_REQUEST);
    expect(env.id).to.equal('r1');
    expect(env.tier).to.equal('kiddie');
    expect(env.seed).to.equal(42);
    expect(env.background).to.equal(false);
    expect(env.seeded).to.equal(false);
  });

  it('WP2: makeGenRequest defaults background to false when omitted', function () {
    const env = makeGenRequest({ id: 'r2', tier: 'easy', seed: 1 });
    expect(env.background).to.equal(false);
  });

  it('WP2: makeGenRequest accepts background=true', function () {
    const env = makeGenRequest({ id: 'r3', tier: 'medium', seed: 7, background: true });
    expect(env.background).to.equal(true);
  });

  it('WP2: makeGenAbort produces a GEN_ABORT envelope', function () {
    const env = makeGenAbort('r4');
    expect(env.type).to.equal(MSG.GEN_ABORT);
    expect(env.id).to.equal('r4');
  });

  it('WP2: makeGenProgress produces a GEN_PROGRESS envelope', function () {
    const env = makeGenProgress({ id: 'r5', attempts: 3, budget: 10 });
    expect(env.type).to.equal(MSG.GEN_PROGRESS);
    expect(env.id).to.equal('r5');
    expect(env.attempts).to.equal(3);
    expect(env.budget).to.equal(10);
  });

  it('WP2: makeGenResult produces a GEN_RESULT envelope with fallback defaulting to false', function () {
    const fakePuzzle = { id: 'abc', difficulty: 'easy', givens: new Uint8Array(81), solution: new Uint8Array(81), solveTrace: [] };
    const env = makeGenResult({ id: 'r6', puzzle: fakePuzzle });
    expect(env.type).to.equal(MSG.GEN_RESULT);
    expect(env.id).to.equal('r6');
    expect(env.puzzle).to.equal(fakePuzzle);
    expect(env.fallback).to.equal(false);
  });

  it('WP2: makeGenResult accepts fallback=true', function () {
    const fakePuzzle = { id: 'xyz', difficulty: 'hard', givens: new Uint8Array(81), solution: new Uint8Array(81), solveTrace: [] };
    const env = makeGenResult({ id: 'r7', puzzle: fakePuzzle, fallback: true });
    expect(env.fallback).to.equal(true);
  });

  it('WP2: makeGenError produces a GEN_ERROR envelope', function () {
    const env = makeGenError({ id: 'r8', message: 'something went wrong' });
    expect(env.type).to.equal(MSG.GEN_ERROR);
    expect(env.id).to.equal('r8');
    expect(env.message).to.equal('something went wrong');
  });

  // WP3: load messages (V4 — puzzle loading)
  it('WP3: MSG exports the load message types', function () {
    expect(MSG.LOAD_REQUEST).to.equal('LOAD_REQUEST');
    expect(MSG.LOAD_RESULT).to.equal('LOAD_RESULT');
  });

  it('WP3: makeLoadRequest produces a LOAD_REQUEST envelope carrying the givens', function () {
    const givens = new Uint8Array(81);
    expect(makeLoadRequest({ id: 'load-1', givens }))
      .to.deep.equal({ type: 'LOAD_REQUEST', id: 'load-1', givens });
  });

  it('WP3: makeLoadResult produces a LOAD_RESULT envelope carrying the result', function () {
    const result = { ok: false, reason: 'multiple' };
    expect(makeLoadResult({ id: 'load-1', result }))
      .to.deep.equal({ type: 'LOAD_RESULT', id: 'load-1', result });
  });

  // WP4–WP6: seed plumbing and puzzle checks (debug instrumentation, Phase 2)
  it('WP4: makeGenRequest marks a request as not seeded when seeded is omitted', function () {
    expect(makeGenRequest({ id: 'r9', tier: 'hard', seed: 5, budget: 3 })).to.deep.equal({
      type: MSG.GEN_REQUEST, id: 'r9', tier: 'hard', seed: 5, background: false, budget: 3, seeded: false,
    });
  });

  it('WP4: makeGenRequest carries seeded=true', function () {
    expect(makeGenRequest({ id: 'r10', tier: 'hard', seed: 5, seeded: true })).to.deep.equal({
      type: MSG.GEN_REQUEST, id: 'r10', tier: 'hard', seed: 5, background: false, budget: undefined, seeded: true,
    });
  });

  it('WP5: makeGenResult carries elapsedMs on the envelope, not on the puzzle', function () {
    const fakePuzzle = { id: 'e1', difficulty: 'easy', givens: new Uint8Array(81), solution: new Uint8Array(81), solveTrace: [] };
    const env = makeGenResult({ id: 'r11', puzzle: fakePuzzle, elapsedMs: 12 });
    expect(env.elapsedMs).to.equal(12);
    expect(env.puzzle).to.not.have.property('elapsedMs');
  });

  it('WP6: MSG exports the check message types', function () {
    expect(MSG.CHECK_REQUEST).to.equal('CHECK_REQUEST');
    expect(MSG.CHECK_RESULT).to.equal('CHECK_RESULT');
  });

  it('WP6: makeCheckRequest produces a CHECK_REQUEST envelope carrying the puzzle list', function () {
    const puzzles = [{ givens: new Uint8Array(81), solution: new Uint8Array(81) }];
    expect(makeCheckRequest({ id: 'check-1', puzzles }))
      .to.deep.equal({ type: 'CHECK_REQUEST', id: 'check-1', puzzles });
  });

  it('WP6: makeCheckResult produces a CHECK_RESULT envelope carrying one result per puzzle', function () {
    const results = [{ ok: true }, { ok: false, reason: 'solution-mismatch' }];
    expect(makeCheckResult({ id: 'check-1', results }))
      .to.deep.equal({ type: 'CHECK_RESULT', id: 'check-1', results });
  });
});
