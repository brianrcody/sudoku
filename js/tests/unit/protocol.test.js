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
});
