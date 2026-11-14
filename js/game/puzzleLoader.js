/**
 * @fileoverview The one entry point for putting an externally supplied puzzle
 * into the game: share links and developer load-from-string both call
 * `load()`. Parsing happens here; validation and rating are delegated to
 * `rateGivens` (a worker); the replace confirmation and the final
 * PUZZLE_LOADED dispatch happen here.
 */

import { parsePuzzleString } from '../util/puzzleString.js';
import { TIER_LABELS, UNRATED } from '../config.js';

/**
 * @typedef {{status: 'loaded', puzzle: object, message: string}
 *          | {status: 'declined', message: string}
 *          | {status: 'rejected', reason: string, message: string}} LoadOutcome
 */

const REJECTIONS = {
  chars: 'Puzzles can contain only the digits 1–9, with 0 or . for empty cells.',
  contradiction: 'A digit repeats in a row, column, or box.',
  complete: 'The puzzle has no empty cells.',
  'no-solution': 'The puzzle has no solution.',
  multiple: 'The puzzle has more than one solution.',
  error: 'The puzzle couldn\'t be checked.',
};

const DIALOG_TITLES = {
  link: 'Load shared puzzle?',
  string: 'Load this puzzle?',
};

/**
 * Whether replacing the current game would lose anything: a player-entered
 * digit or a pencil mark on a board that is not won.
 *
 * @param {{puzzle: object|null, pen: Uint8Array, pencil: Uint16Array, won: boolean}} state
 * @returns {boolean}
 */
export function hasProgress(state) {
  if (!state.puzzle || state.won) return false;
  for (let i = 0; i < 81; i++) {
    if (state.pencil[i] !== 0) return true;
    if (state.puzzle.givens[i] === 0 && state.pen[i] !== 0) return true;
  }
  return false;
}

/**
 * @param {string} reason - A parse or validation failure code.
 * @param {number} [length] - Cell count, for the `length` reason.
 * @returns {string} The full user-facing rejection message.
 */
export function rejectionMessage(reason, length) {
  const detail = reason === 'length'
    ? `A puzzle needs exactly 81 cells; this one has ${length}.`
    : REJECTIONS[reason];
  return `This puzzle can't be loaded. ${detail}`;
}

/**
 * @param {string} difficulty - A tier ID or `UNRATED`.
 * @returns {string}
 */
export function loadedMessage(difficulty) {
  return difficulty === UNRATED
    ? 'Puzzle loaded as Unrated. The solver can\'t rate it, so hints and coach are unavailable.'
    : `Puzzle loaded. Difficulty: ${TIER_LABELS[difficulty]}.`;
}

/**
 * @param {{
 *   gameState: { dispatch: function, getState: function },
 *   rateGivens: function(Uint8Array): Promise<import('../generator/loadPuzzle.js').LoadResult>,
 *   confirm: function({title: string, body: string, confirmLabel: string}): Promise<boolean>,
 *   beforeReplace: function(): void,
 * }} deps
 *   `beforeReplace` runs immediately before the puzzle is swapped in; the app
 *   uses it to cancel in-flight generation so the loaded puzzle wins.
 * @returns {{ load: function(string, {source: 'link'|'string', onChecking?: function(): void}): Promise<LoadOutcome> }}
 */
export function createPuzzleLoader({ gameState, rateGivens, confirm, beforeReplace }) {
  function _rejected(reason, length) {
    return { status: 'rejected', reason, message: rejectionMessage(reason, length) };
  }

  /**
   * Parse, validate, rate, confirm if there is progress, and load. Never
   * rejects; the current game is untouched unless the status is `loaded`.
   * Overlapping loads are independent: the last to finish is the current puzzle.
   *
   * @param {string} text - Puzzle string.
   * @param {{source: 'link'|'string', onChecking?: function(): void}} opts
   *   `onChecking` fires once parsing has passed and worker validation begins.
   * @returns {Promise<LoadOutcome>}
   */
  async function load(text, { source, onChecking }) {
    const parsed = parsePuzzleString(text);
    if (!parsed.ok) return _rejected(parsed.reason, parsed.length);

    if (onChecking) onChecking();

    let result;
    try {
      result = await rateGivens(parsed.givens);
    } catch {
      result = { ok: false, reason: 'error' };
    }
    if (!result.ok) return _rejected(result.reason);

    // Progress is judged now, not when the load started: the player may have
    // moved while the puzzle was being checked.
    if (hasProgress(gameState.getState())) {
      const confirmed = await confirm({
        title: DIALOG_TITLES[source],
        body: 'Your current progress will be lost.',
        confirmLabel: 'Load Puzzle',
      });
      if (!confirmed) return { status: 'declined', message: 'Puzzle not loaded. Your game continues.' };
    }

    const puzzle = { ...result.puzzle, source };
    beforeReplace();
    gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle });
    return { status: 'loaded', puzzle, message: loadedMessage(puzzle.difficulty) };
  }

  return { load };
}
