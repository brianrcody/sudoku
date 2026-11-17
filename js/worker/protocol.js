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
  /** Main → Worker: validate and rate givens supplied from outside the generator. */
  LOAD_REQUEST: 'LOAD_REQUEST',
  /** Worker → Main: outcome of a LOAD_REQUEST. */
  LOAD_RESULT:  'LOAD_RESULT',
  /** Main → Worker: check puzzles against their recorded solutions, without rating. */
  CHECK_REQUEST: 'CHECK_REQUEST',
  /** Worker → Main: outcome of a CHECK_REQUEST, one result per puzzle. */
  CHECK_RESULT:  'CHECK_RESULT',
});

/**
 * @typedef {{
 *   id: string,
 *   difficulty: string,
 *   givens: Uint8Array,
 *   solution: Uint8Array,
 *   solveTrace: Array,
 *   source?: 'generated'|'loaded'|'link'|'string',
 *   gen?: import('../generator/pipeline.js').GenDiagnostics,
 * }} Puzzle
 */

/**
 * Build a GEN_REQUEST envelope.
 *
 * @param {{ id: string, tier: string, seed: number, background?: boolean, budget?: number, seeded?: boolean }} opts
 *   `seeded`: the seed was chosen by the developer rather than at random.
 * @returns {object}
 */
export function makeGenRequest({ id, tier, seed, background = false, budget, seeded = false }) {
  return { type: MSG.GEN_REQUEST, id, tier, seed, background, budget, seeded };
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
 * @param {{ id: string, puzzle: Puzzle, fallback?: boolean, elapsedMs?: number }} opts
 *   `elapsedMs`: time spent generating, carried on the envelope rather than
 *   the puzzle so that it cannot affect reproducibility.
 * @returns {object}
 */
export function makeGenResult({ id, puzzle, fallback = false, elapsedMs }) {
  return { type: MSG.GEN_RESULT, id, puzzle, fallback, elapsedMs };
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

/**
 * Build a LOAD_REQUEST envelope.
 *
 * @param {{ id: string, givens: Uint8Array }} opts
 * @returns {object}
 */
export function makeLoadRequest({ id, givens }) {
  return { type: MSG.LOAD_REQUEST, id, givens };
}

/**
 * Build a LOAD_RESULT envelope.
 *
 * @param {{ id: string, result: import('../generator/loadPuzzle.js').LoadResult }} opts
 * @returns {object}
 */
export function makeLoadResult({ id, result }) {
  return { type: MSG.LOAD_RESULT, id, result };
}

/**
 * Build a CHECK_REQUEST envelope.
 *
 * @param {{ id: string, puzzles: Array<{givens: Uint8Array, solution: Uint8Array}> }} opts
 * @returns {object}
 */
export function makeCheckRequest({ id, puzzles }) {
  return { type: MSG.CHECK_REQUEST, id, puzzles };
}

/**
 * Build a CHECK_RESULT envelope.
 *
 * @param {{ id: string, results: Array<import('../generator/loadPuzzle.js').CheckResult> }} opts
 * @returns {object}
 */
export function makeCheckResult({ id, results }) {
  return { type: MSG.CHECK_RESULT, id, results };
}
