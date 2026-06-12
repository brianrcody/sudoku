/**
 * @fileoverview v1 StatsStore implementation backed by a cookie.
 *
 * Cookie name: `sudoku.stats`
 * Wire format: JSON-encoded, URL-encoded `{ version: 1, stats: StatsMap }`.
 */

import * as cookies from '../persist/cookies.js';
import { DIFFICULTY_ORDER } from '../config.js';

const COOKIE_NAME = 'sudoku.stats';
const VERSION = 1;

/** @returns {StatsMap} Zero-initialized map for all seven difficulties. */
function defaultStats() {
  const stats = {};
  for (const tier of DIFFICULTY_ORDER) {
    stats[tier] = { attempted: 0, won: 0 };
  }
  return stats;
}

/**
 * @typedef {{ attempted: number, won: number }} DiffStat
 * @typedef {Record<string, DiffStat>} StatsMap
 */

/**
 * Reads the stats cookie, validates it, and returns the inner stats map.
 * Falls back to default zero-counts if missing, malformed, or wrong version.
 *
 * @returns {Promise<StatsMap>}
 */
async function load() {
  const raw = cookies.get(COOKIE_NAME);
  if (!raw) return defaultStats();
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed.version !== VERSION || !parsed.stats) return defaultStats();
    // V3 tier-ID migration: fold legacy death-march counters into expert.
    const legacy = parsed.stats['death-march'];
    if (legacy) {
      const expert = parsed.stats.expert ?? { attempted: 0, won: 0 };
      parsed.stats.expert = {
        attempted: expert.attempted + legacy.attempted,
        won: expert.won + legacy.won,
      };
      delete parsed.stats['death-march'];
    }
    // Merge to guarantee all seven keys exist even if the stored blob is older.
    const defaults = defaultStats();
    for (const key of Object.keys(defaults)) {
      if (!parsed.stats[key]) parsed.stats[key] = defaults[key];
    }
    return parsed.stats;
  } catch {
    return defaultStats();
  }
}

/**
 * Persists the stats map to the cookie.
 *
 * @param {StatsMap} stats
 * @returns {Promise<void>}
 */
async function save(stats) {
  try {
    const encoded = encodeURIComponent(JSON.stringify({ version: VERSION, stats }));
    cookies.set(COOKIE_NAME, encoded, { maxAge: 60 * 60 * 24 * 365 * 2, path: '/', sameSite: 'Lax' });
  } catch {
    // Best-effort; swallow I/O errors per persist-layer policy.
  }
}

/** @type {{ load: function(): Promise<StatsMap>, save: function(StatsMap): Promise<void> }} */
export const cookieStatsStore = { load, save };
