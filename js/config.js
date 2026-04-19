/**
 * @fileoverview Application-wide constants and difficulty configuration.
 */

/** @type {string[]} Difficulty levels in ascending order. */
export const DIFFICULTY_ORDER = ['kiddie', 'easy', 'medium', 'hard', 'death-march'];

/**
 * Maximum hints available per difficulty.
 * @type {Object<string, number>}
 */
export const HINT_LIMITS = {
  kiddie: Infinity,
  easy: 3,
  medium: 1,
  hard: 0,
  'death-march': 0,
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
  'death-march': false,
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
  'death-march': 'on-complete-silent',
};

/**
 * Soft target given-count ranges per tier. The rater decides the final tier;
 * these guide the removal loop.
 * @type {Object<string, {min: number, max: number}>}
 */
export const GIVEN_COUNT_TARGET = {
  kiddie: { min: 45, max: 50 },
  easy: { min: 36, max: 42 },
  medium: { min: 30, max: 34 },
  hard: { min: 26, max: 30 },
  'death-march': { min: 22, max: 26 },
};

/**
 * Max puzzle attempts before returning the hardest-so-far candidate.
 * @type {Object<string, number>}
 */
export const ATTEMPT_BUDGET = {
  kiddie: 20,
  easy: 30,
  medium: 60,
  hard: 150,
  'death-march': 300,
};

/** @type {string} URL of the generator worker, relative to index.html. */
export const WORKER_URL = './js/worker/generator.worker.js';

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
