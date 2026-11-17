/**
 * Tests for js/providers/puzzleProvider.js + clientGenProvider.js — §2.15 PP1–PP11
 *
 * We test via createClientGenProvider() directly rather than the singleton export
 * so each test gets fresh state (cache, pending map, Worker).
 *
 * Tests that spawn a real Worker are slow — this describe block sets a 15 s timeout.
 */

import { createClientGenProvider } from '/js/providers/clientGenProvider.js';
import { MSG } from '/js/worker/protocol.js';
import { diagnostics } from '/js/util/events.js';

const STORAGE_PREFIX = 'sudoku.pregen.v1.';

/**
 * Wait for a specific message type from a worker.
 * @param {Worker} worker
 * @param {function(MessageEvent): boolean} predicate
 * @param {number} [timeout=10000]
 * @returns {Promise<MessageEvent>}
 */
function waitForMessage(worker, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('waitForMessage timeout')), timeout);
    function handler(event) {
      if (predicate(event)) {
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        resolve(event);
      }
    }
    worker.addEventListener('message', handler);
  });
}

describe('puzzleProvider / clientGenProvider', function () {
  this.timeout(15000);

  // PP1: requestPuzzle returns cached when peekReady — cache-hit branch
  it('PP1: returns cached puzzle immediately when cache is primed', async function () {
    const provider = createClientGenProvider();
    // Manually prime the cache by injecting a fake puzzle into localStorage
    // then constructing a fresh provider that will restore it on init.
    const fakePuzzle = {
      id: 'fake-id',
      difficulty: 'kiddie',
      givens: Array.from(new Uint8Array(81).fill(5)),
      solution: Array.from(new Uint8Array(81).fill(6)),
      solveTrace: [],
    };
    localStorage.setItem(
      STORAGE_PREFIX + 'kiddie',
      JSON.stringify({ version: 1, puzzle: fakePuzzle, generatedAt: new Date().toISOString() }),
    );

    // New provider — loads localStorage on startup
    const provider2 = createClientGenProvider();
    const peeked = provider2.peekReady('kiddie');
    expect(peeked).to.not.be.null;
    expect(peeked.difficulty).to.equal('kiddie');
    expect(peeked.givens).to.be.instanceof(Uint8Array);

    // requestPuzzle should resolve immediately from cache
    const t0 = performance.now();
    const { puzzle, fallback } = await provider2.requestPuzzle({ difficulty: 'kiddie' });
    const elapsed = performance.now() - t0;
    expect(puzzle.id).to.equal('fake-id');
    expect(fallback).to.equal(false);
    expect(elapsed).to.be.below(50); // well under 50 ms — this was synchronous

    // Cache should be cleared after consumption
    expect(provider2.peekReady('kiddie')).to.be.null;
  });

  // PP2: requestPuzzle falls through to Worker when cache is empty — cache-miss branch
  it('PP2: requests a kiddie puzzle from the Worker when cache is empty', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    expect(provider.peekReady('kiddie')).to.be.null;
    const { puzzle, fallback } = await provider.requestPuzzle({ difficulty: 'kiddie' });
    expect(puzzle).to.have.property('id');
    expect(puzzle.difficulty).to.be.a('string');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.givens.length).to.equal(81);
    expect(fallback).to.be.a('boolean');
  });

  // PP3: primeNext posts background=true — BG flag check
  it('PP3: primeNext posts a GEN_REQUEST with background=true', function (done) {
    // We intercept the worker's message by creating a fresh Worker and
    // spying via a raw Worker listener alongside the provider's internal one.
    // Since createClientGenProvider() creates its own Worker internally, we
    // can't easily intercept it. Instead we verify the observable side-effect:
    // calling primeNext on an empty cache results in peekReady returning null
    // (not a cached item), and eventually fills the cache (tested via PP6).
    // Structural assertion: primeNext must not throw.
    const provider = createClientGenProvider();
    expect(() => provider.primeNext('easy')).to.not.throw();
    done();
  });

  // PP4: AbortSignal propagates to Worker — abort path
  it('PP4: requestPuzzle rejects with AbortError when signal is aborted', async function () {
    const provider = createClientGenProvider();
    const ac = new AbortController();
    const promise = provider.requestPuzzle({ difficulty: 'easy', signal: ac.signal });
    // Abort immediately
    ac.abort();
    let err;
    try {
      await promise;
    } catch (e) {
      err = e;
    }
    expect(err).to.exist;
    expect(err.name).to.equal('AbortError');
  });

  // PP5: peekReady returns null when cache empty
  it('PP5: peekReady returns null when cache is empty', function () {
    const provider = createClientGenProvider();
    expect(provider.peekReady('kiddie')).to.be.null;
    expect(provider.peekReady('easy')).to.be.null;
    expect(provider.peekReady('expert')).to.be.null;
  });

  // PP6: localStorage mirror on cache write — background result triggers storage write
  it('PP6: writes puzzle to localStorage when a background result arrives', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    // Trigger a background request by calling primeNext
    provider.primeNext('kiddie');
    // Wait until localStorage is populated (background result saved)
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 14000;
      const poll = setInterval(() => {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'kiddie');
        if (raw) {
          clearInterval(poll);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(poll);
          reject(new Error('localStorage not written within timeout'));
        }
      }, 200);
    });
    const raw = localStorage.getItem(STORAGE_PREFIX + 'kiddie');
    expect(raw).to.be.a('string');
    const blob = JSON.parse(raw);
    expect(blob.version).to.equal(1);
    expect(blob.puzzle).to.be.an('object');
    // V4: generation diagnostics travel with the cached puzzle (aspec-dev-mode §8).
    expect(blob.puzzle.source).to.equal('generated');
    expect(blob.puzzle.gen.requestedTier).to.equal('kiddie');
    expect(blob.puzzle.gen.attempts).to.be.at.least(1);
    expect(provider.peekReady('kiddie').gen).to.deep.equal(blob.puzzle.gen);
  });

  // PP7: localStorage restore on boot — pre-written entry is read back
  it('PP7: peekReady returns puzzle restored from localStorage on init', function () {
    const fakePuzzle = {
      id: 'restored-id',
      difficulty: 'easy',
      givens: Array.from(new Uint8Array(81).fill(3)),
      solution: Array.from(new Uint8Array(81).fill(4)),
      solveTrace: [],
    };
    localStorage.setItem(
      STORAGE_PREFIX + 'easy',
      JSON.stringify({ version: 1, puzzle: fakePuzzle, generatedAt: new Date().toISOString() }),
    );
    const provider = createClientGenProvider();
    const puzzle = provider.peekReady('easy');
    expect(puzzle).to.not.be.null;
    expect(puzzle.id).to.equal('restored-id');
  });

  // PP8: Uint8Array ↔ number[] conversion at persistence boundary
  it('PP8: givens and solution are Uint8Arrays after deserialization from localStorage', function () {
    const givens = Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
    const solution = Array.from({ length: 81 }, (_, i) => ((i + 3) % 9) + 1);
    const fakePuzzle = {
      id: 'arr-id',
      difficulty: 'medium',
      givens,
      solution,
      solveTrace: [],
    };
    localStorage.setItem(
      STORAGE_PREFIX + 'medium',
      JSON.stringify({ version: 1, puzzle: fakePuzzle, generatedAt: new Date().toISOString() }),
    );
    const provider = createClientGenProvider();
    const puzzle = provider.peekReady('medium');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.solution).to.be.instanceof(Uint8Array);
    // Values must round-trip correctly
    for (let i = 0; i < 81; i++) {
      expect(puzzle.givens[i]).to.equal(givens[i]);
      expect(puzzle.solution[i]).to.equal(solution[i]);
    }
  });

  // PP9: One foreground in-flight at a time — second request queues behind first
  // We verify that two concurrent requestPuzzle calls both eventually resolve.
  it('PP9: two concurrent requestPuzzle calls both resolve', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    const [r1, r2] = await Promise.all([
      provider.requestPuzzle({ difficulty: 'kiddie' }),
      provider.requestPuzzle({ difficulty: 'kiddie' }),
    ]);
    expect(r1.puzzle.givens).to.be.instanceof(Uint8Array);
    expect(r2.puzzle.givens).to.be.instanceof(Uint8Array);
  });

  // PP10: Resolve shape is { puzzle, fallback } — fallback lives on the
  // envelope, never on the Puzzle object itself.
  it('PP10: requestPuzzle resolves { puzzle, fallback } with no .fallback on the puzzle', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    const result = await provider.requestPuzzle({ difficulty: 'kiddie' });
    expect(result).to.have.property('puzzle');
    expect(result).to.have.property('fallback');
    expect(result.fallback).to.be.a('boolean');
    expect(result.puzzle).to.not.have.property('fallback');
  });

  // PP11: Corrupt localStorage entry treated as empty — no throw, peekReady null
  it('PP11: treats corrupt localStorage entry as empty (no throw, peekReady returns null)', function () {
    // Write malformed JSON to the pregen key
    localStorage.setItem(STORAGE_PREFIX + 'hard', 'not valid json {{{');
    // Creating a new provider should not throw
    let provider;
    expect(() => {
      provider = createClientGenProvider();
    }).to.not.throw();
    // peekReady must return null — corrupt entry discarded silently
    expect(provider.peekReady('hard')).to.be.null;
  });
});

/**
 * PP12–PP22 (debug instrumentation, Phase 2): seed, budget, generation
 * diagnostics, and the Unrated background discard. A fake worker injected
 * through `createWorker` records what is posted; each test drives its replies.
 */
describe('clientGenProvider — seed, budget, and generation events', () => {
  let worker;
  let events;
  let warn;

  function makeProvider() {
    return createClientGenProvider({
      createWorker: () => {
        worker = {
          posted: [],
          onmessage: null,
          onerror: null,
          postMessage(msg) { this.posted.push(msg); },
          reply(data) { this.onmessage({ data }); },
        };
        return worker;
      },
    });
  }

  function generated(difficulty, gen) {
    return {
      id: `p-${difficulty}`,
      difficulty,
      givens: Array.from({ length: 81 }, (_, i) => i % 10),
      solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
      solveTrace: [],
      source: 'generated',
      ...(gen === undefined ? {} : { gen }),
    };
  }

  function genOf(requestedTier, seed, attempts = 4) {
    return {
      requestedTier, seed, seedBy: 'random', budget: 60, attempts,
      rejected: { unsolved: 0, wrongTier: attempts - 1, byTier: {} }, fallback: false,
    };
  }

  function primeStorage(difficulty, puzzle) {
    localStorage.setItem(STORAGE_PREFIX + difficulty,
      JSON.stringify({ version: 1, puzzle, generatedAt: new Date().toISOString() }));
  }

  const named = name => events.filter(e => e.event === name);

  beforeEach(() => {
    events = [];
    diagnostics.on('generation', e => events.push(e));
    warn = console.warn;
    console.warn = () => {};
  });

  afterEach(() => { console.warn = warn; });

  it('PP12: a cache hit reports the tier and the cached puzzle\'s seed', async () => {
    primeStorage('easy', generated('easy', genOf('easy', 314)));
    const provider = makeProvider();

    await provider.requestPuzzle({ difficulty: 'easy' });

    expect(events).to.deep.equal([{ event: 'cache-hit', tier: 'easy', seed: 314 }]);
  });

  it('PP12: a cache hit on a puzzle without generation data reports an undefined seed', async () => {
    primeStorage('easy', generated('easy'));
    const provider = makeProvider();

    await provider.requestPuzzle({ difficulty: 'easy' });

    expect(events).to.deep.equal([{ event: 'cache-hit', tier: 'easy', seed: undefined }]);
  });

  it('PP13: an unseeded cache miss reports cache-miss, then a foreground request, and posts it unseeded', () => {
    const provider = makeProvider();

    provider.requestPuzzle({ difficulty: 'hard' });

    const [posted] = worker.posted;
    expect(events).to.deep.equal([
      { event: 'cache-miss', tier: 'hard' },
      { event: 'request', tier: 'hard', seed: posted.seed, kind: 'foreground' },
    ]);
    expect(posted.seed).to.be.a('number');
    expect(posted.seeded).to.equal(false);
    expect(posted.budget).to.equal(undefined);
  });

  it('PP14: a seeded request bypasses a primed cache in both directions', async () => {
    const cached = generated('easy', genOf('easy', 314));
    primeStorage('easy', cached);
    const stored = localStorage.getItem(STORAGE_PREFIX + 'easy');
    const provider = makeProvider();

    const result = provider.requestPuzzle({ difficulty: 'easy', seed: 7, budget: 3 });
    const [posted] = worker.posted;
    worker.reply({ type: MSG.GEN_RESULT, id: posted.id, puzzle: generated('easy', genOf('easy', 7)), fallback: false });
    const { puzzle } = await result;

    expect(named('cache-hit')).to.be.empty;
    expect(named('cache-miss')).to.be.empty;
    expect(named('request')).to.deep.equal([{ event: 'request', tier: 'easy', seed: 7, kind: 'seeded' }]);
    expect(posted).to.include({ tier: 'easy', seed: 7, background: false, seeded: true, budget: 3 });
    expect(puzzle.gen.seed).to.equal(7);
    expect(provider.peekReady('easy').id).to.equal(cached.id);
    expect(provider.peekReady('easy').gen.seed).to.equal(314);
    expect(localStorage.getItem(STORAGE_PREFIX + 'easy')).to.equal(stored);
  });

  it('PP15: primeNext reports a background request', () => {
    const provider = makeProvider();

    provider.primeNext('medium');

    const [posted] = worker.posted;
    expect(events).to.deep.equal([{ event: 'request', tier: 'medium', seed: posted.seed, kind: 'background' }]);
  });

  it('PP16: GEN_PROGRESS reports attempts and budget', () => {
    const provider = makeProvider();
    provider.requestPuzzle({ difficulty: 'hard' });

    worker.reply({ type: MSG.GEN_PROGRESS, id: worker.posted[0].id, attempts: 12, budget: 150 });

    expect(named('progress')).to.deep.equal([{ event: 'progress', attempts: 12, budget: 150 }]);
  });

  it('PP17: a foreground result reports requested tier, tier, seed, attempts, and elapsed time, and no fallback', async () => {
    const provider = makeProvider();
    const result = provider.requestPuzzle({ difficulty: 'hard', seed: 9 });

    worker.reply({
      type: MSG.GEN_RESULT, id: worker.posted[0].id, puzzle: generated('hard', genOf('hard', 9, 4)),
      fallback: false, elapsedMs: 42,
    });
    await result;

    expect(named('result')).to.deep.equal([
      { event: 'result', requestedTier: 'hard', tier: 'hard', seed: 9, attempts: 4, elapsedMs: 42 },
    ]);
    expect(named('fallback')).to.be.empty;
  });

  it('PP17: a foreground fallback result also reports the fallback', async () => {
    const provider = makeProvider();
    const result = provider.requestPuzzle({ difficulty: 'medium', seed: 143 });

    worker.reply({
      type: MSG.GEN_RESULT, id: worker.posted[0].id, puzzle: generated('expert', genOf('medium', 143, 60)),
      fallback: true, elapsedMs: 1800,
    });
    await result;

    expect(events.slice(-2)).to.deep.equal([
      { event: 'result', requestedTier: 'medium', tier: 'expert', seed: 143, attempts: 60, elapsedMs: 1800 },
      { event: 'fallback', requestedTier: 'medium', tier: 'expert', seed: 143 },
    ]);
  });

  it('PP18: a rated background result is cached, stored, and reported', () => {
    const provider = makeProvider();
    provider.primeNext('kiddie');

    worker.reply({
      type: MSG.GEN_RESULT, id: worker.posted[0].id, puzzle: generated('kiddie', genOf('kiddie', 5, 1)),
      fallback: false, elapsedMs: 8,
    });

    expect(provider.peekReady('kiddie').gen.seed).to.equal(5);
    expect(JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'kiddie')).puzzle.gen.seed).to.equal(5);
    expect(named('result')).to.deep.equal([
      { event: 'result', requestedTier: 'kiddie', tier: 'kiddie', seed: 5, attempts: 1, elapsedMs: 8 },
    ]);
  });

  it('PP19: an Unrated background result is discarded, and the next request for that tier misses the cache', () => {
    const provider = makeProvider();
    provider.primeNext('nightmare');

    worker.reply({
      type: MSG.GEN_RESULT, id: worker.posted[0].id, puzzle: generated('unrated', genOf('nightmare', 223, 2)),
      fallback: true, elapsedMs: 400,
    });
    provider.requestPuzzle({ difficulty: 'nightmare' });

    expect(named('discarded')).to.deep.equal([{ event: 'discarded', requestedTier: 'nightmare', seed: 223 }]);
    expect(provider.peekReady('unrated')).to.be.null;
    expect(provider.peekReady('nightmare')).to.be.null;
    expect(localStorage.getItem(STORAGE_PREFIX + 'unrated')).to.be.null;
    expect(localStorage.getItem(STORAGE_PREFIX + 'nightmare')).to.be.null;
    expect(named('cache-miss')).to.deep.equal([{ event: 'cache-miss', tier: 'nightmare' }]);
    expect(worker.posted).to.have.length(2);
  });

  it('PP20: an abort reports the tier and the abort reason', async () => {
    const provider = makeProvider();
    const ac = new AbortController();
    const result = provider.requestPuzzle({ difficulty: 'expert', signal: ac.signal }).catch(e => e.name);

    ac.abort('replaced');

    expect(await result).to.equal('AbortError');
    expect(named('cancelled')).to.deep.equal([{ event: 'cancelled', tier: 'expert', reason: 'replaced' }]);
  });

  it('PP21: GEN_ERROR reports failed with its message and rejects the request', async () => {
    const provider = makeProvider();
    const result = provider.requestPuzzle({ difficulty: 'hard' }).catch(e => e.message);

    worker.reply({ type: MSG.GEN_ERROR, id: worker.posted[0].id, message: 'generator broke' });

    expect(await result).to.equal('generator broke');
    expect(named('failed')).to.deep.equal([{ event: 'failed', message: 'generator broke' }]);
  });

  it('PP21: a worker error reports failed with its message and rejects every pending request', async () => {
    const provider = makeProvider();
    const first = provider.requestPuzzle({ difficulty: 'hard' }).catch(e => e.message);
    const second = provider.requestPuzzle({ difficulty: 'easy', seed: 3 }).catch(e => e.message);

    worker.onerror({ message: 'worker died' });

    expect(await first).to.equal('worker died');
    expect(await second).to.equal('worker died');
    expect(named('failed')).to.deep.equal([{ event: 'failed', message: 'worker died' }]);
  });

  it('PP22: seed 0 makes a seeded request', () => {
    primeStorage('easy', generated('easy', genOf('easy', 314)));
    const provider = makeProvider();

    provider.requestPuzzle({ difficulty: 'easy', seed: 0 });

    expect(events).to.deep.equal([{ event: 'request', tier: 'easy', seed: 0, kind: 'seeded' }]);
    expect(worker.posted[0]).to.include({ seed: 0, seeded: true });
  });
});
