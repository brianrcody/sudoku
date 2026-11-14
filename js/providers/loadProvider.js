/**
 * @fileoverview LoadProvider — validates and rates externally supplied givens
 * off the UI thread.
 *
 * Owns a dedicated instance of the generator worker script, created on first
 * use. It cannot share the generation worker: `generateForTier` is synchronous,
 * so a load would wait behind whatever generation is running — seconds, for a
 * top-tier background pre-generation.
 */

import { makeLoadRequest } from '../worker/protocol.js';
import { WORKER_URL } from '../config.js';

/**
 * @param {{ createWorker?: function(): Worker }} [deps]
 * @returns {{ rateGivens: function(Uint8Array): Promise<import('../generator/loadPuzzle.js').LoadResult> }}
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
      // This instance only ever receives LOAD_REQUESTs, so every message is a
      // LOAD_RESULT. A result can still arrive for a request already failed by
      // onerror.
      const msg = event.data;
      const cb = pending.get(msg.id);
      if (!cb) return;
      pending.delete(msg.id);
      cb.resolve(msg.result);
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

  return { rateGivens };
}
