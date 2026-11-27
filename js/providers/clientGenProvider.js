/**
 * @fileoverview ClientGenProvider — wraps the generator Worker, manages the
 * in-memory pre-gen cache, and serializes/deserializes the localStorage mirror.
 */

import { MSG, makeGenRequest, makeGenAbort } from '../worker/protocol.js';
import { WORKER_URL, DIFFICULTY_ORDER, UNRATED } from '../config.js';
import { randomSeed } from '../prng.js';
import { diagnostics } from '../util/events.js';

const STORAGE_PREFIX = 'sudoku.pregen.v1.';

/**
 * @typedef {{
 *   id: string,
 *   difficulty: string,
 *   givens: Uint8Array,
 *   solution: Uint8Array,
 *   solveTrace: Array,
 * }} Puzzle
 */

/**
 * Creates a ClientGenProvider that owns the Worker and pre-gen cache.
 *
 * @param {{ createWorker?: function(): Worker }} [deps]
 * @returns {{
 *   requestPuzzle: function({difficulty:string, signal?:AbortSignal, onProgress?:function({attempts:number,budget:number}):void, seed?:number, budget?:number}): Promise<{puzzle: Puzzle, fallback: boolean}>,
 *   peekReady: function(string): Puzzle|null,
 *   primeNext: function(string): void,
 * }}
 */
export function createClientGenProvider({
  createWorker = () => new Worker(WORKER_URL, { type: 'module' }),
} = {}) {
  const worker = createWorker();

  /** @type {Map<string, Puzzle>} In-memory cache keyed by difficulty. */
  const cache = new Map();

  /** @type {Map<string, {resolve:function, reject:function, signal?:AbortSignal}>} */
  const pending = new Map(); // requestId → Promise callbacks

  let requestCounter = 0;

  // The localStorage mirror is read on first use, not at construction: the
  // provider is built while main.js's imports are evaluated, before developer
  // mode subscribes to `diagnostics`, so a corrupt entry read then is never
  // logged (fspec-007 §8.1).
  let loaded = false;
  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    _loadFromStorage(cache);
  }

  worker.onmessage = function (event) {
    ensureLoaded();
    const msg = event.data;

    if (msg.type === MSG.GEN_RESULT) {
      const puzzle = _hydrateArrays(msg.puzzle);
      const { requestedTier, seed, attempts } = puzzle.gen ?? {};
      const tier = puzzle.difficulty;
      diagnostics.emit('generation', {
        event: 'result', requestedTier, tier, seed, attempts, elapsedMs: msg.elapsedMs,
      });
      if (msg.fallback) {
        diagnostics.emit('generation', { event: 'fallback', requestedTier, tier, seed });
      }
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        if (msg.fallback) {
          console.warn('[clientGenProvider] Generation fallback', {
            got: puzzle.difficulty,
          });
        }
        cb.resolve({ puzzle, fallback: msg.fallback === true });
      } else if (puzzle.difficulty === UNRATED) {
        // Nothing reads an `unrated` cache entry (fspec-007 §7.5).
        diagnostics.emit('generation', { event: 'discarded', requestedTier, seed });
      } else {
        // Background result — store in cache.
        cache.set(puzzle.difficulty, puzzle);
        _saveToStorage(puzzle.difficulty, puzzle);
      }
      return;
    }

    if (msg.type === MSG.GEN_ERROR) {
      diagnostics.emit('generation', { event: 'failed', message: msg.message });
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        cb.reject(new Error(msg.message));
      }
      return;
    }

    if (msg.type === MSG.GEN_PROGRESS) {
      diagnostics.emit('generation', { event: 'progress', attempts: msg.attempts, budget: msg.budget });
      const cb = pending.get(msg.id);
      if (cb && cb.onProgress) {
        cb.onProgress({ attempts: msg.attempts, budget: msg.budget });
      }
    }
  };

  worker.onerror = function (err) {
    const message = err.message || 'Worker error';
    diagnostics.emit('generation', { event: 'failed', message });
    // Reject all pending requests on unrecoverable worker error.
    for (const [id, cb] of pending) {
      pending.delete(id);
      cb.reject(new Error(message));
    }
  };

  /**
   * A request with a `seed` is a seeded run: it bypasses the pre-gen cache in
   * both directions, since its pending entry receives the result.
   *
   * @param {{
   *   difficulty: string,
   *   signal?: AbortSignal,
   *   onProgress?: function({attempts:number,budget:number}):void,
   *   seed?: number,
   *   budget?: number,
   * }} opts - `budget` overrides the tier's attempt budget.
   * @returns {Promise<{puzzle: Puzzle, fallback: boolean}>}
   */
  function requestPuzzle({ difficulty, signal, onProgress, seed: chosenSeed, budget }) {
    ensureLoaded();
    const seeded = chosenSeed !== undefined;
    if (!seeded) {
      const cached = peekReady(difficulty);
      if (cached) {
        cache.delete(difficulty);
        _clearFromStorage(difficulty);
        diagnostics.emit('generation', { event: 'cache-hit', tier: difficulty, seed: cached.gen?.seed });
        return Promise.resolve({ puzzle: cached, fallback: false });
      }
      diagnostics.emit('generation', { event: 'cache-miss', tier: difficulty });
    }

    const id = String(++requestCounter);
    const seed = seeded ? chosenSeed : randomSeed();

    const promise = new Promise((resolve, reject) => {
      const callbacks = { resolve, reject, signal, onProgress };

      if (signal) {
        signal.addEventListener('abort', () => {
          if (pending.has(id)) {
            pending.delete(id);
            worker.postMessage(makeGenAbort(id));
            diagnostics.emit('generation', { event: 'cancelled', tier: difficulty, reason: signal.reason });
            reject(new DOMException('aborted', 'AbortError'));
          }
        }, { once: true });
      }

      pending.set(id, callbacks);
    });

    worker.postMessage(makeGenRequest({ id, tier: difficulty, seed, background: false, budget, seeded }));
    diagnostics.emit('generation', {
      event: 'request', tier: difficulty, seed, kind: seeded ? 'seeded' : 'foreground',
    });
    return promise;
  }

  /**
   * @param {string} difficulty
   * @returns {Puzzle|null}
   */
  function peekReady(difficulty) {
    ensureLoaded();
    return cache.get(difficulty) ?? null;
  }

  /**
   * @param {string} difficulty
   */
  function primeNext(difficulty) {
    ensureLoaded();
    if (cache.has(difficulty)) return; // already cached

    const id = `bg-${++requestCounter}`;
    const seed = randomSeed();

    // Background result is handled in onmessage above (no pending entry).
    worker.postMessage(makeGenRequest({ id, tier: difficulty, seed, background: true }));
    diagnostics.emit('generation', { event: 'request', tier: difficulty, seed, kind: 'background' });
  }

  return { requestPuzzle, peekReady, primeNext };
}

// ---------------------------------------------------------------------------
// localStorage serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize stored cache into `cache` map on the provider's first use.
 *
 * @param {Map<string, Puzzle>} cache
 */
function _loadFromStorage(cache) {
  for (const diff of DIFFICULTY_ORDER) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + diff);
      if (!raw) continue;
      const blob = JSON.parse(raw);
      if (blob.version !== 1 || !blob.puzzle) continue;
      cache.set(diff, _hydrateArrays(blob.puzzle));
    } catch (error) {
      // Discard corrupt entries silently.
      diagnostics.emit('swallowed', { where: 'pregen.load', error });
    }
  }
}

/**
 * Persist a puzzle to localStorage under its difficulty key.
 *
 * @param {string} difficulty
 * @param {Puzzle} puzzle
 */
function _saveToStorage(difficulty, puzzle) {
  try {
    const serializable = {
      version: 1,
      puzzle: {
        id: puzzle.id,
        difficulty: puzzle.difficulty,
        givens: Array.from(puzzle.givens),
        solution: Array.from(puzzle.solution),
        solveTrace: puzzle.solveTrace,
        source: puzzle.source,
        gen: puzzle.gen,
      },
      generatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_PREFIX + difficulty, JSON.stringify(serializable));
  } catch (error) {
    // Fail silently — pre-gen cache is best-effort.
    diagnostics.emit('swallowed', { where: 'pregen.save', error });
  }
}

/**
 * Remove a difficulty entry from localStorage.
 *
 * @param {string} difficulty
 */
function _clearFromStorage(difficulty) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + difficulty);
  } catch (error) {
    // Ignore.
    diagnostics.emit('swallowed', { where: 'pregen.clear', error });
  }
}

/**
 * Convert plain arrays back to Uint8Array for givens and solution.
 *
 * @param {object} puzzle
 * @returns {Puzzle}
 */
function _hydrateArrays(puzzle) {
  return {
    ...puzzle,
    givens: puzzle.givens instanceof Uint8Array
      ? puzzle.givens
      : new Uint8Array(puzzle.givens),
    solution: puzzle.solution instanceof Uint8Array
      ? puzzle.solution
      : new Uint8Array(puzzle.solution),
  };
}
