/**
 * @fileoverview One-time data migration for the V3 tier-ID rename
 * (`death-march` → `expert`). Stateless and idempotent: every step is a
 * cheap key check that becomes a no-op once migrated, so no schema-version
 * marker is needed. The stats cookie migrates separately inside
 * `cookieStatsStore.load()`.
 */

import { getItem, setItem, removeItem } from './storage.js';

const DIFF_KEY = 'sudoku.currentDifficulty.v1';
const STATE_KEY = 'sudoku.state.v1';
const LEGACY_PREGEN_KEY = 'sudoku.pregen.v1.death-march';

/**
 * Migrate persisted localStorage data from the `death-march` tier ID to
 * `expert`, and discard the legacy pre-generated puzzle (it was rated by the
 * pre-V3 rater; see docs/misc/bugs-forcing-chains-soundness.md).
 */
export function migrateTierIds() {
  if (getItem(DIFF_KEY) === 'death-march') {
    setItem(DIFF_KEY, 'expert');
  }

  const blob = getItem(STATE_KEY);
  if (blob && blob.difficulty === 'death-march') {
    blob.difficulty = 'expert';
    setItem(STATE_KEY, blob);
  }

  removeItem(LEGACY_PREGEN_KEY);
}
