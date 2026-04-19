/**
 * @fileoverview v1 StatsStore implementation backed by a cookie.
 *
 * Cookie name: `sudoku.stats`
 * Wire format: JSON-encoded, URL-encoded `{ version: 1, stats: StatsMap }`.
 */

import * as cookies from '../persist/cookies.js';

const COOKIE_NAME = 'sudoku.stats';
const VERSION = 1;

/** @returns {StatsMap} Zero-initialized map for all five difficulties. */
function defaultStats() {
  return {
    kiddie: { attempted: 0, won: 0 },
    easy: { attempted: 0, won: 0 },
    medium: { attempted: 0, won: 0 },
    hard: { attempted: 0, won: 0 },
    'death-march': { attempted: 0, won: 0 },
  };
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
    // Merge to guarantee all five keys exist even if the stored blob is older.
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
