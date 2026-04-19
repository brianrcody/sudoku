/**
 * @fileoverview StatsProvider factory. Thin pass-through over a StatsStore;
 * serves as a stable seam for future server-backed implementations.
 */

/**
 * @typedef {{ attempted: number, won: number }} DiffStat
 * @typedef {Record<string, DiffStat>} StatsMap
 * @typedef {{ load(): Promise<StatsMap>, save(StatsMap): Promise<void> }} StatsStore
 * @typedef {{ load(): Promise<StatsMap>, save(StatsMap): Promise<void> }} StatsProvider
 */

/**
 * Creates a StatsProvider that delegates to the given store.
 *
 * @param {StatsStore} store
 * @returns {StatsProvider}
 */
export function createStatsProvider(store) {
  return {
    load: () => store.load(),
    save: (stats) => store.save(stats),
  };
}
