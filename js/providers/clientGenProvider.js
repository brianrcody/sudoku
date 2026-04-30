/**
 * @fileoverview ClientGenProvider — wraps the generator Worker, manages the
 * in-memory pre-gen cache, and serializes/deserializes the localStorage mirror.
 */

import { MSG, makeGenRequest, makeGenAbort } from '../worker/protocol.js';
import { WORKER_URL } from '../config.js';
import { randomSeed } from '../prng.js';

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
 * @returns {{
 *   requestPuzzle: function({difficulty:string, signal?:AbortSignal}): Promise<Puzzle>,
 *   peekReady: function(string): Puzzle|null,
 *   primeNext: function(string): void,
 * }}
 */
export function createClientGenProvider() {
  const worker = new Worker(WORKER_URL, { type: 'module' });

  /** @type {Map<string, Puzzle>} In-memory cache keyed by difficulty. */
  const cache = new Map();

  /** @type {Map<string, {resolve:function, reject:function, signal?:AbortSignal}>} */
  const pending = new Map(); // requestId → Promise callbacks

  let requestCounter = 0;

  // Load pre-gen cache from localStorage on startup.
  _loadFromStorage(cache);

  worker.onmessage = function (event) {
    const msg = event.data;

    if (msg.type === MSG.GEN_RESULT) {
      const puzzle = _hydrateArrays(msg.puzzle);
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        if (msg.fallback) {
          console.warn('[clientGenProvider] Generation fallback', {
            requested: msg.tier,
            got: puzzle.difficulty,
          });
        }
        cb.resolve(puzzle);
      } else {
        // Background result — store in cache.
        cache.set(puzzle.difficulty, puzzle);
        _saveToStorage(puzzle.difficulty, puzzle);
      }
      return;
    }

    if (msg.type === MSG.GEN_ERROR) {
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        cb.reject(new Error(msg.message));
      }
      return;
    }
    // GEN_PROGRESS messages are available for future progress indicators.
    // Nothing to handle here in the provider layer.
  };

  worker.onerror = function (err) {
    // Reject all pending requests on unrecoverable worker error.
    for (const [id, cb] of pending) {
      pending.delete(id);
      cb.reject(new Error(err.message || 'Worker error'));
    }
  };

  /**
   * @param {{ difficulty: string, signal?: AbortSignal }} opts
   * @returns {Promise<Puzzle>}
   */
  function requestPuzzle({ difficulty, signal }) {
    const cached = peekReady(difficulty);
    if (cached) {
      cache.delete(difficulty);
      _clearFromStorage(difficulty);
      return Promise.resolve(cached);
    }

    const id = String(++requestCounter);
    const seed = randomSeed();

    const promise = new Promise((resolve, reject) => {
      const callbacks = { resolve, reject, signal };

      if (signal) {
        signal.addEventListener('abort', () => {
          if (pending.has(id)) {
            pending.delete(id);
            worker.postMessage(makeGenAbort(id));
            reject(new DOMException('aborted', 'AbortError'));
          }
        }, { once: true });
      }

      pending.set(id, callbacks);
    });

    worker.postMessage(makeGenRequest({ id, tier: difficulty, seed, background: false }));
    return promise;
  }

  /**
   * @param {string} difficulty
   * @returns {Puzzle|null}
   */
  function peekReady(difficulty) {
    return cache.get(difficulty) ?? null;
  }

  /**
   * @param {string} difficulty
   */
  function primeNext(difficulty) {
    if (cache.has(difficulty)) return; // already cached

    const id = `bg-${++requestCounter}`;
    const seed = randomSeed();

    // Background result is handled in onmessage above (no pending entry).
    worker.postMessage(makeGenRequest({ id, tier: difficulty, seed, background: true }));
  }

  return { requestPuzzle, peekReady, primeNext };
}

// ---------------------------------------------------------------------------
// localStorage serialization helpers
// ---------------------------------------------------------------------------

/**
 * Deserialize stored cache into `cache` map at startup.
 *
 * @param {Map<string, Puzzle>} cache
 */
function _loadFromStorage(cache) {
  const difficulties = ['kiddie', 'easy', 'medium', 'hard', 'death-march'];
  for (const diff of difficulties) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + diff);
      if (!raw) continue;
      const blob = JSON.parse(raw);
      if (blob.version !== 1 || !blob.puzzle) continue;
      cache.set(diff, _hydrateArrays(blob.puzzle));
    } catch {
      // Discard corrupt entries silently.
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
      },
      generatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_PREFIX + difficulty, JSON.stringify(serializable));
  } catch {
    // Fail silently — pre-gen cache is best-effort.
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
  } catch {
    // Ignore.
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
