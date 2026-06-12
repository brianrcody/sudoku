/**
 * @fileoverview Application-wide constants and difficulty configuration.
 */

/** @type {string[]} Difficulty levels in ascending order. */
export const DIFFICULTY_ORDER = [
  'kiddie', 'easy', 'medium', 'hard', 'expert', 'diabolical', 'nightmare',
];

/**
 * User-visible display name per tier ID.
 * @type {Object<string, string>}
 */
export const TIER_LABELS = {
  kiddie: 'Kiddie',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  diabolical: 'Diabolical',
  nightmare: 'Nightmare',
};

/**
 * Maximum hints available per difficulty.
 * @type {Object<string, number>}
 */
export const HINT_LIMITS = {
  kiddie: Infinity,
  easy: 3,
  medium: 1,
  hard: 0,
  expert: 0,
  diabolical: 0,
  nightmare: 0,
};

/**
 * Whether the Check button is visible for a given difficulty.
 * @type {Object<string, boolean>}
 */
export const CHECK_VISIBLE = {
  kiddie: false,
  easy: true,
  medium: true,
  hard: false,
  expert: false,
  diabolical: false,
  nightmare: false,
};

/**
 * Correctness evaluation mode per difficulty.
 * @type {Object<string, string>}
 */
export const CORRECTNESS_MODE = {
  kiddie: 'realtime',
  easy: 'on-demand',
  medium: 'on-demand',
  hard: 'on-complete',
  expert: 'on-complete-silent',
  diabolical: 'on-complete-silent',
  nightmare: 'on-complete-silent',
};

/**
 * Soft target given-count ranges per tier. The rater decides the final tier;
 * these guide the removal loop. The top tiers' min is rarely reachable, which
 * makes removal strip to minimality — matching the spike sampling that sized
 * their budgets (docs/misc/v3-harder-tiers-spike.md).
 * @type {Object<string, {min: number, max: number}>}
 */
export const GIVEN_COUNT_TARGET = {
  kiddie: { min: 45, max: 50 },
  easy: { min: 36, max: 42 },
  medium: { min: 30, max: 34 },
  hard: { min: 26, max: 30 },
  expert: { min: 22, max: 26 },
  diabolical: { min: 20, max: 27 },
  nightmare: { min: 20, max: 27 },
};

/**
 * Max puzzle attempts before the honest-fallback path (see fspec-003 §5.4).
 * Diabolical's accept rate is ~0.49%/attempt; 2000 attempts puts the miss
 * probability below 0.01%.
 * @type {Object<string, number>}
 */
export const ATTEMPT_BUDGET = {
  kiddie: 20,
  easy: 30,
  medium: 60,
  hard: 150,
  expert: 300,
  diabolical: 2000,
  nightmare: 300,
};

/**
 * URL of the generator worker, resolved relative to this module's own URL so
 * the path works regardless of whether the site is hosted at the host root
 * or under a subpath.
 * @type {URL}
 */
export const WORKER_URL = new URL('./worker/generator.worker.js', import.meta.url);

/** @type {number} Duration in ms that Check/incorrect highlights are shown. */
export const CHECK_HIGHLIGHT_MS = 3000;

/** @type {string[]} All valid theme class names. */
export const THEME_CLASSES = [
  'theme-minimalist',
  'theme-coffee',
  'theme-school',
  'theme-terminal',
  'theme-mountain',
];

/** @type {string} Default theme class applied on first visit. */
export const DEFAULT_THEME = 'theme-minimalist';
