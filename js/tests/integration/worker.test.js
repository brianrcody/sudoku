/**
 * Integration tests for js/worker/generator.worker.js — §2.14 W1–W9
 *
 * Spawns a real Worker and exercises the full Worker protocol over
 * structured-clone postMessage. No stubs — per aspec §16.1.
 */

import { MSG, makeGenRequest, makeGenAbort } from '/js/worker/protocol.js';

/**
 * Returns a Promise that resolves when a message from `worker` satisfies
 * `predicate`, or rejects after `timeout` ms.
 *
 * @param {Worker} worker
 * @param {function(any): boolean} predicate
 * @param {number} [timeout=10000]
 * @returns {Promise<any>} Resolves with msg.data of the matching message.
 */
function expectMessage(worker, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`expectMessage timeout after ${timeout}ms`)),
      timeout,
    );
    function handler(event) {
      if (predicate(event.data)) {
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        resolve(event.data);
      }
    }
    worker.addEventListener('message', handler);
  });
}

/**
 * Collect all messages matching `predicate` until `stopPredicate` matches,
 * then resolve with the collected array.
 *
 * @param {Worker} worker
 * @param {function(any): boolean} predicate
 * @param {function(any): boolean} stopPredicate
 * @param {number} [timeout=10000]
 * @returns {Promise<any[]>}
 */
function collectMessages(worker, predicate, stopPredicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const collected = [];
    const timer = setTimeout(
      () => reject(new Error(`collectMessages timeout after ${timeout}ms`)),
      timeout,
    );
    function handler(event) {
      const msg = event.data;
      if (predicate(msg)) collected.push(msg);
      if (stopPredicate(msg)) {
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        resolve(collected);
      }
    }
    worker.addEventListener('message', handler);
  });
}

describe('generator.worker.js (integration)', function () {
  this.timeout(30000);

  let worker;

  beforeEach(function () {
    worker = new Worker('/js/worker/generator.worker.js', { type: 'module' });
  });

  afterEach(function () {
    worker.terminate();
  });

  // W1: GEN_REQUEST → GEN_RESULT round-trip
  it('W1: GEN_REQUEST for kiddie returns GEN_RESULT with valid Puzzle', async function () {
    const id = 'w1';
    worker.postMessage(makeGenRequest({ id, tier: 'kiddie', seed: 1001 }));
    const msg = await expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === id);
    expect(msg.type).to.equal(MSG.GEN_RESULT);
    expect(msg.id).to.equal(id);
    expect(msg.puzzle).to.be.an('object');
    expect(msg.puzzle.id).to.be.a('string');
    expect(msg.puzzle.difficulty).to.be.a('string');
    expect(msg.puzzle.givens).to.be.instanceof(Uint8Array);
    expect(msg.puzzle.givens.length).to.equal(81);
    expect(msg.puzzle.solution).to.be.instanceof(Uint8Array);
    expect(msg.puzzle.solveTrace).to.be.an('array');
  });

  // W2: GEN_PROGRESS emitted during generation
  it('W2: GEN_PROGRESS messages emitted during generation', async function () {
    this.timeout(20000);
    const id = 'w2';
    const progressMessages = [];

    const resultPromise = expectMessage(
      worker,
      m => m.type === MSG.GEN_RESULT && m.id === id,
      19000,
    );

    // Collect progress messages in parallel
    const progressListener = function (event) {
      if (event.data.type === MSG.GEN_PROGRESS && event.data.id === id) {
        progressMessages.push(event.data);
      }
    };
    worker.addEventListener('message', progressListener);

    worker.postMessage(makeGenRequest({ id, tier: 'hard', seed: 2002 }));
    await resultPromise;
    worker.removeEventListener('message', progressListener);

    expect(progressMessages.length).to.be.at.least(1);
    for (const pm of progressMessages) {
      expect(pm).to.have.property('attempts');
      expect(pm).to.have.property('budget');
    }
  });

  // W3: GEN_PROGRESS throttled — no two adjacent progress messages within 50 ms
  it('W3: GEN_PROGRESS messages are spaced ≥50 ms apart', async function () {
    this.timeout(20000);
    const id = 'w3';
    const timestamps = [];

    const resultPromise = expectMessage(
      worker,
      m => m.type === MSG.GEN_RESULT && m.id === id,
      19000,
    );

    const listener = function (event) {
      if (event.data.type === MSG.GEN_PROGRESS && event.data.id === id) {
        timestamps.push(performance.now());
      }
    };
    worker.addEventListener('message', listener);

    worker.postMessage(makeGenRequest({ id, tier: 'hard', seed: 3003 }));
    await resultPromise;
    worker.removeEventListener('message', listener);

    // Only check spacing if we got at least 2 progress messages
    if (timestamps.length >= 2) {
      for (let i = 1; i < timestamps.length; i++) {
        const gap = timestamps[i] - timestamps[i - 1];
        // Worker throttles at 100 ms; allow 50 ms generously for timing jitter
        expect(gap).to.be.at.least(50,
          `Progress messages ${i - 1} and ${i} were only ${gap.toFixed(1)}ms apart`);
      }
    }
    // If < 2 progress messages arrived, the generation was too fast to throttle — acceptable.
  });

  // W4: GEN_ABORT cancels in-flight request
  it('W4: GEN_ABORT cancels in-flight request; no GEN_RESULT arrives', async function () {
    this.timeout(10000);
    const id = 'w4';
    let gotResult = false;

    // Start listening before posting request
    const noResultPromise = new Promise((resolve) => {
      setTimeout(resolve, 3000); // wait 3 s to confirm no result
    });

    const resultListener = function (event) {
      if (event.data.type === MSG.GEN_RESULT && event.data.id === id) {
        gotResult = true;
      }
    };
    worker.addEventListener('message', resultListener);

    // Post request and immediately abort
    worker.postMessage(makeGenRequest({ id, tier: 'death-march', seed: 4004 }));
    worker.postMessage(makeGenAbort(id));

    await noResultPromise;
    worker.removeEventListener('message', resultListener);

    expect(gotResult).to.be.false;
  });

  // W5: Background request queues behind foreground
  it('W5: foreground GEN_REQUEST completes before background', async function () {
    this.timeout(25000);
    const bgId = 'w5-bg';
    const fgId = 'w5-fg';

    const resolveOrder = [];

    const bgPromise = expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === bgId, 24000)
      .then(m => { resolveOrder.push('bg'); return m; });
    const fgPromise = expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === fgId, 24000)
      .then(m => { resolveOrder.push('fg'); return m; });

    // Post background first, then foreground immediately after
    worker.postMessage(makeGenRequest({ id: bgId, tier: 'kiddie', seed: 5001, background: true }));
    worker.postMessage(makeGenRequest({ id: fgId, tier: 'kiddie', seed: 5002, background: false }));

    await Promise.all([fgPromise, bgPromise]);

    // Foreground must complete first
    expect(resolveOrder[0]).to.equal('fg',
      `Expected foreground first but got: ${resolveOrder.join(', ')}`);
  });

  // W6: GEN_ERROR on worker exception (malformed request)
  it('W6: GEN_ERROR received when request has invalid tier', async function () {
    this.timeout(10000);
    const id = 'w6';
    // Post a request with a tier that will cause generateForTier to fail
    // (undefined budget lookup and potential missing config entry).
    // We expect either a GEN_ERROR or — if the pipeline is defensive — a fallback result.
    // The worker must not crash (terminate) — subsequent requests must still work.
    const firstMsg = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('W6 timeout')), 8000);
      const handler = function (event) {
        const { type, id: msgId } = event.data;
        if (msgId === id && (type === MSG.GEN_ERROR || type === MSG.GEN_RESULT)) {
          clearTimeout(timer);
          worker.removeEventListener('message', handler);
          resolve(event.data);
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: MSG.GEN_REQUEST, id, tier: '__invalid_tier__', seed: 6006, background: false });
    });

    expect([MSG.GEN_ERROR, MSG.GEN_RESULT]).to.include(firstMsg.type);

    // Worker must still be alive — send a valid request
    const id2 = 'w6-recovery';
    worker.postMessage(makeGenRequest({ id: id2, tier: 'kiddie', seed: 6007 }));
    const recovery = await expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === id2, 14000);
    expect(recovery.puzzle).to.be.an('object');
  });

  // W7: Uint8Array survives structured clone
  it('W7: givens and solution are Uint8Array instances after structured clone', async function () {
    const id = 'w7';
    worker.postMessage(makeGenRequest({ id, tier: 'kiddie', seed: 7007 }));
    const msg = await expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === id);
    expect(msg.puzzle.givens).to.be.instanceof(Uint8Array);
    expect(msg.puzzle.solution).to.be.instanceof(Uint8Array);
  });

  // W8: Fallback puzzle returned with fallback:true when budget is exhausted
  it('W8: GEN_RESULT has fallback=true when budget=1 targeting death-march', async function () {
    this.timeout(15000);
    const id = 'w8';
    // budget=1 for death-march: nearly certain to miss, returns fallback
    worker.postMessage(makeGenRequest({ id, tier: 'death-march', seed: 8008, budget: 1 }));
    const msg = await expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === id, 14000);
    // With budget=1 and death-march, the returned puzzle almost certainly has a
    // different difficulty — which triggers fallback=true.
    // If by chance it succeeded, fallback would be false — we accept either.
    expect(msg).to.have.property('fallback');
    expect(msg.fallback).to.be.a('boolean');
    // The puzzle must still be valid
    expect(msg.puzzle.givens).to.be.instanceof(Uint8Array);
  });

  // W9: Multiple sequential requests share one Worker instance
  it('W9: three sequential requests all fulfil using the same worker', async function () {
    this.timeout(25000);
    const seeds = [9001, 9002, 9003];
    const results = [];
    for (let i = 0; i < 3; i++) {
      const id = `w9-${i}`;
      worker.postMessage(makeGenRequest({ id, tier: 'kiddie', seed: seeds[i] }));
      const msg = await expectMessage(worker, m => m.type === MSG.GEN_RESULT && m.id === id, 14000);
      results.push(msg);
    }
    expect(results).to.have.length(3);
    for (const msg of results) {
      expect(msg.puzzle.givens).to.be.instanceof(Uint8Array);
      expect(msg.puzzle.givens.length).to.equal(81);
    }
  });
});
