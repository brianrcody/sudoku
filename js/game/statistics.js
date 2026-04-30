/**
 * @fileoverview Statistics manager. Holds an in-memory cache of attempt/win
 * counts and delegates persistence to a StatsProvider.
 */

import { createEmitter } from '../util/events.js';

/**
 * @typedef {{ attempted: number, won: number }} DiffStat
 * @typedef {Record<string, DiffStat>} StatsMap
 * @typedef {{ load(): Promise<StatsMap>, save(StatsMap): Promise<void> }} StatsProvider
 */

/**
 * @typedef {Object} Statistics
 * @property {function(): Promise<void>} init
 * @property {function(): StatsMap} get
 * @property {function(string): Promise<void>} recordAttemptOnce
 * @property {function(string): Promise<void>} recordWin
 * @property {function(string, function): function} on
 */

/**
 * @param {StatsProvider} provider
 * @returns {Statistics}
 */
export function createStatistics(provider) {
  const emitter = createEmitter();
  /** @type {StatsMap|null} */
  let cache = null;

  async function init() {
    cache = await provider.load();
    emitter.emit('stats-changed', cache);
  }

  function get() {
    return cache;
  }

  async function recordAttemptOnce(difficulty) {
    cache[difficulty].attempted += 1;
    emitter.emit('stats-changed', cache);
    await provider.save(cache).catch(() => {});
  }

  async function recordWin(difficulty) {
    cache[difficulty].won += 1;
    emitter.emit('stats-changed', cache);
    await provider.save(cache).catch(() => {});
  }

  return {
    init,
    get,
    recordAttemptOnce,
    recordWin,
    on: emitter.on,
  };
}
