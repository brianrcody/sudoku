/**
 * @fileoverview LoadProvider — validates and rates externally supplied givens
 * off the UI thread.
 *
 * Owns a dedicated instance of the generator worker script, created on first
 * use. It cannot share the generation worker: `generateForTier` is synchronous,
 * so a load would wait behind whatever generation is running — seconds, for a
 * top-tier background pre-generation.
 */

import { MSG, makeLoadRequest, makeCheckRequest } from '../worker/protocol.js';
import { WORKER_URL } from '../config.js';

/**
 * @param {{ createWorker?: function(): Worker }} [deps]
 * @returns {{
 *   rateGivens: function(Uint8Array): Promise<import('../generator/loadPuzzle.js').LoadResult>,
 *   checkPuzzles: function(Array<{givens: Uint8Array, solution: Uint8Array}>):
 *     Promise<Array<import('../generator/loadPuzzle.js').CheckResult>>,
 * }}
 */
export function createLoadProvider({
  createWorker = () => new Worker(WORKER_URL, { type: 'module' }),
} = {}) {
  /** @type {Worker|null} */
  let worker = null;

  /** @type {Map<string, {resolve: function, reject: function}>} */
  const pending = new Map();

  let requestCounter = 0;

  function _ensureWorker() {
    if (worker !== null) return worker;
    worker = createWorker();

    worker.onmessage = function (event) {
      // This instance only ever receives LOAD_REQUESTs and CHECK_REQUESTs, so
      // every message is a LOAD_RESULT or a CHECK_RESULT. A result can still
      // arrive for a request already failed by onerror.
      const msg = event.data;
      const cb = pending.get(msg.id);
      if (!cb) return;
      pending.delete(msg.id);
      cb.resolve(msg.type === MSG.CHECK_RESULT ? msg.results : msg.result);
    };

    worker.onerror = function (err) {
      // The worker is in an unknown state: fail everything in flight and let
      // the next request start a fresh one.
      const failed = [...pending.values()];
      pending.clear();
      worker = null;
      for (const cb of failed) cb.reject(new Error(err.message || 'Worker error'));
    };

    return worker;
  }

  /**
   * @param {Uint8Array} givens
   * @returns {Promise<import('../generator/loadPuzzle.js').LoadResult>}
   */
  function rateGivens(givens) {
    const id = `load-${++requestCounter}`;
    const w = _ensureWorker();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(makeLoadRequest({ id, givens }));
    });
  }

  /**
   * Check puzzles against their recorded solutions in one request, without
   * rating them.
   *
   * @param {Array<{givens: Uint8Array, solution: Uint8Array}>} puzzles
   * @returns {Promise<Array<import('../generator/loadPuzzle.js').CheckResult>>}
   *   One result per puzzle, in order.
   */
  function checkPuzzles(puzzles) {
    const id = `check-${++requestCounter}`;
    const w = _ensureWorker();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(makeCheckRequest({ id, puzzles }));
    });
  }

  return { rateGivens, checkPuzzles };
}
