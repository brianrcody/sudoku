/**
 * @fileoverview Shared Worker message-type constants and envelope helpers.
 * Imported by both the main thread and the Worker.
 */

/**
 * Message type constants for the generator Worker protocol.
 * @enum {string}
 */
export const MSG = Object.freeze({
  /** Main → Worker: request a puzzle. */
  GEN_REQUEST:  'GEN_REQUEST',
  /** Worker → Main: incremental progress during generation. */
  GEN_PROGRESS: 'GEN_PROGRESS',
  /** Worker → Main: generation complete. */
  GEN_RESULT:   'GEN_RESULT',
  /** Worker → Main: unrecoverable error. */
  GEN_ERROR:    'GEN_ERROR',
  /** Main → Worker: cancel an in-flight request. */
  GEN_ABORT:    'GEN_ABORT',
});

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
 * Build a GEN_REQUEST envelope.
 *
 * @param {{ id: string, tier: string, seed: number, background?: boolean, budget?: number }} opts
 * @returns {object}
 */
export function makeGenRequest({ id, tier, seed, background = false, budget }) {
  return { type: MSG.GEN_REQUEST, id, tier, seed, background, budget };
}

/**
 * Build a GEN_ABORT envelope.
 *
 * @param {string} id
 * @returns {object}
 */
export function makeGenAbort(id) {
  return { type: MSG.GEN_ABORT, id };
}

/**
 * Build a GEN_PROGRESS envelope.
 *
 * @param {{ id: string, attempts: number, budget: number }} opts
 * @returns {object}
 */
export function makeGenProgress({ id, attempts, budget }) {
  return { type: MSG.GEN_PROGRESS, id, attempts, budget };
}

/**
 * Build a GEN_RESULT envelope.
 *
 * @param {{ id: string, puzzle: Puzzle, fallback?: boolean }} opts
 * @returns {object}
 */
export function makeGenResult({ id, puzzle, fallback = false }) {
  return { type: MSG.GEN_RESULT, id, puzzle, fallback };
}

/**
 * Build a GEN_ERROR envelope.
 *
 * @param {{ id: string, message: string }} opts
 * @returns {object}
 */
export function makeGenError({ id, message }) {
  return { type: MSG.GEN_ERROR, id, message };
}
