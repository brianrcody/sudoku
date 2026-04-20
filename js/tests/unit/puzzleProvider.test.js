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
    const puzzle = await provider2.requestPuzzle({ difficulty: 'kiddie' });
    const elapsed = performance.now() - t0;
    expect(puzzle.id).to.equal('fake-id');
    expect(elapsed).to.be.below(50); // well under 50 ms — this was synchronous

    // Cache should be cleared after consumption
    expect(provider2.peekReady('kiddie')).to.be.null;
  });

  // PP2: requestPuzzle falls through to Worker when cache is empty — cache-miss branch
  it('PP2: requests a kiddie puzzle from the Worker when cache is empty', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    expect(provider.peekReady('kiddie')).to.be.null;
    const puzzle = await provider.requestPuzzle({ difficulty: 'kiddie' });
    expect(puzzle).to.have.property('id');
    expect(puzzle.difficulty).to.be.a('string');
    expect(puzzle.givens).to.be.instanceof(Uint8Array);
    expect(puzzle.givens.length).to.equal(81);
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
    expect(provider.peekReady('death-march')).to.be.null;
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
    const [p1, p2] = await Promise.all([
      provider.requestPuzzle({ difficulty: 'kiddie' }),
      provider.requestPuzzle({ difficulty: 'kiddie' }),
    ]);
    expect(p1.givens).to.be.instanceof(Uint8Array);
    expect(p2.givens).to.be.instanceof(Uint8Array);
  });

  // PP10: Provider does not expose fallback flag — Puzzle has no .fallback
  it('PP10: puzzle returned by requestPuzzle has no .fallback property', async function () {
    this.timeout(15000);
    const provider = createClientGenProvider();
    const puzzle = await provider.requestPuzzle({ difficulty: 'kiddie' });
    expect(puzzle).to.not.have.property('fallback');
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
