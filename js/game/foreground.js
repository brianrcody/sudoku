/**
 * @fileoverview Foreground puzzle requests: the busy-card lifecycle, cancel,
 * supersession, the honest and Unrated fallbacks, seeded runs, and the
 * player's tier preference.
 *
 * Every collaborator is injected, so the module touches no DOM, storage, or
 * global beyond the `console.error` default of `logError`.
 */

import { TIER_LABELS, UNRATED, isRatedTier } from '../config.js';

/** Tiers whose budget-exhaustion fallback prompts the user (fspec-003 §5.4). */
const HONEST_FALLBACK_TIERS = new Set(['diabolical', 'nightmare']);

/**
 * How a request ended, as reported to its `onOutcome`.
 *
 * @typedef {{ status: 'loaded', puzzle: object, fallback: boolean }
 *   | { status: 'needs-accept-fallback', puzzle: object }
 *   | { status: 'fallback-declined' } | { status: 'cancelled' }
 *   | { status: 'replaced' } | { status: 'failed' }} SeededOutcome
 */

/**
 * Builds the foreground generator.
 *
 * @param {object} deps
 * @param {{ dispatch: function }} deps.gameState
 * @param {function} deps.requestPuzzle - `puzzleProvider.requestPuzzle`.
 * @param {function} deps.openDialog - `ui/dialog.js` `open`.
 * @param {function(string): void} deps.announce
 * @param {{ read: function(): *, write: function(string): void }} deps.preference
 *   The saved tier preference.
 * @param {{ emit: function }} deps.diagnostics
 * @param {function} [deps.logError]
 * @returns {{
 *   request: function(string, function(object): void, object=): void,
 *   abort: function(string): void,
 *   cancel: function(): void,
 *   startNew: function(string, function(object): void=): void,
 *   generateSeeded: function({tier: string, seed: number, fallback: string, budget?: number}): Promise<SeededOutcome>,
 *   chooseTier: function(string): void,
 *   preferredTier: function(): string,
 *   generationTier: function(object): string,
 * }}
 */
export function createForegroundGenerator({
  gameState, requestPuzzle, openDialog, announce, preference, diagnostics,
  logError = (...a) => console.error(...a),
}) {
  /** @type {{ controller: AbortController, onOutcome: function(object): void }|null} */
  let _gen = null;

  // The tier the player last chose. Distinct from the current puzzle's
  // difficulty, which a loaded puzzle can set to another tier or to Unrated.
  const saved = preference.read();
  let _preferred = isRatedTier(saved) ? saved : 'easy';

  /**
   * Requests a puzzle in the foreground. `onLoaded(puzzle)` runs only when a
   * puzzle should actually load; `onOutcome` hears how the request ended.
   *
   * @param {string} difficulty
   * @param {function(object): void} onLoaded
   * @param {{
   *   seed?: number,
   *   budget?: number,
   *   fallback?: 'ask'|'accept'|'refuse',
   *   onOutcome?: function(SeededOutcome): void,
   * }} [opts] - `seed` makes this a seeded run; `budget` overrides the tier's
   *   attempt budget; `fallback` decides an honest fallback: ask with the
   *   dialog, accept it silently, or refuse it and load nothing.
   */
  function request(difficulty, onLoaded, {
    seed, budget, fallback: policy = 'ask', onOutcome = () => {},
  } = {}) {
    abort('replaced');
    const gen = { controller: new AbortController(), onOutcome };
    _gen = gen;
    let delivered = false;

    gameState.dispatch({
      type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…', difficulty,
    });

    requestPuzzle({
      difficulty,
      signal: gen.controller.signal,
      seed,
      budget,
      onProgress({ attempts, budget }) {
        if (_gen === gen) {
          gameState.dispatch({ type: 'GEN_PROGRESS', attempts, budget });
        }
      },
    }).then(({ puzzle, fallback }) => {
      if (_gen !== gen) return; // superseded by a newer request
      _gen = null;
      delivered = true;

      const unrated = puzzle.difficulty === UNRATED;
      let busy = true;

      // Both load paths end here, including the dialog's confirm, which runs
      // outside this promise chain. A throwing load ends the request as failed;
      // a newer request started meanwhile keeps its busy state.
      const load = loadedFallback => {
        try {
          onLoaded(puzzle);
        } catch (err) {
          logError('[main] Failed to generate puzzle:', err);
          diagnostics.emit('generation', { event: 'failed', message: err?.message });
          if (busy && _gen === null) gameState.dispatch({ type: 'SET_GENERATING', flag: false });
          onOutcome({ status: 'failed' });
          return;
        }
        onOutcome({ status: 'loaded', puzzle, fallback: loadedFallback });
      };

      // The saved preference never becomes Unrated (fspec-007 §7.5). A failed
      // preference write loses only the preference; the puzzle still loads.
      const accept = () => {
        if (!unrated) {
          try {
            chooseTier(puzzle.difficulty);
          } catch (error) {
            diagnostics.emit('swallowed', { where: 'foreground.chooseTier', error });
          }
        }
        load(true);
      };

      if (fallback && HONEST_FALLBACK_TIERS.has(difficulty)) {
        if (policy === 'accept') {
          accept();
          return;
        }
        gameState.dispatch({ type: 'SET_GENERATING', flag: false });
        busy = false;
        if (policy === 'refuse') {
          onOutcome({ status: 'needs-accept-fallback', puzzle });
          return;
        }
        const requested = TIER_LABELS[difficulty];
        const actual = TIER_LABELS[puzzle.difficulty] ?? puzzle.difficulty;
        const verdict = unrated
          ? "can't be rated, so hints and coach are unavailable"
          : `is rated ${actual}`;
        // The busy state is already cleared, so a dialog that cannot open
        // ends the request as failed.
        try {
          openDialog({
            title: `No ${requested} puzzle found`,
            body: `The generator couldn't find a ${requested} puzzle this time. ` +
                  `The best it found ${verdict}. Play it?`,
            confirmLabel: `Play ${actual}`,
            onConfirm: accept,
            onCancel: () => onOutcome({ status: 'fallback-declined' }),
          });
        } catch (err) {
          logError('[main] Failed to generate puzzle:', err);
          diagnostics.emit('generation', { event: 'failed', message: err?.message });
          onOutcome({ status: 'failed' });
        }
        return;
      }

      load(fallback);
    }).catch(err => {
      if (err && err.name === 'AbortError') { // the outcome was reported by abort()
        diagnostics.emit('swallowed', { where: 'foreground.request', error: err });
        return;
      }
      logError('[main] Failed to generate puzzle:', err);
      // The provider reports a worker failure itself (aspec §10.1); only a
      // failure to load the delivered puzzle is reported here.
      if (delivered) diagnostics.emit('generation', { event: 'failed', message: err?.message });
      if (_gen === gen) {
        _gen = null;
        gameState.dispatch({ type: 'SET_GENERATING', flag: false });
        onOutcome({ status: 'failed' });
      }
    });
  }

  /**
   * Drops the in-flight request, if any; its late result is ignored.
   *
   * @param {'replaced'|'cancelled'} reason - Reported to the request's `onOutcome`.
   */
  function abort(reason) {
    if (_gen === null) return;
    const gen = _gen;
    _gen = null;
    gen.controller.abort(reason);
    gen.onOutcome({ status: reason });
  }

  /** The busy card's Cancel: drop the request and restore the prior state. */
  function cancel() {
    if (_gen === null) return;
    abort('cancelled');
    gameState.dispatch({ type: 'SET_GENERATING', flag: false });
    announce('Puzzle search cancelled.');
  }

  /**
   * Requests a puzzle and starts it as a new game.
   *
   * @param {string} difficulty
   * @param {function(object): void} [afterLoad] - Runs after the puzzle starts.
   */
  function startNew(difficulty, afterLoad = () => {}) {
    request(difficulty, puzzle => {
      gameState.dispatch({ type: 'NEW_PUZZLE', difficulty: puzzle.difficulty, puzzle });
      announce(puzzle.difficulty === UNRATED
        ? 'New puzzle started. It could not be rated, so hints and coach are unavailable.'
        : 'New puzzle started.');
      afterLoad(puzzle);
    });
  }

  /**
   * Runs a seeded generation and starts its puzzle as a new game. Announces
   * nothing and moves no focus: the caller reports the outcome.
   *
   * @param {{ tier: string, seed: number, fallback: 'ask'|'accept'|'refuse', budget?: number }} opts
   * @returns {Promise<SeededOutcome>}
   */
  function generateSeeded({ tier, seed, fallback, budget }) {
    return new Promise(resolve => {
      request(tier, puzzle => {
        gameState.dispatch({ type: 'NEW_PUZZLE', difficulty: puzzle.difficulty, puzzle });
      }, { seed, budget, fallback, onOutcome: resolve });
    });
  }

  /**
   * Persists and remembers the player's tier choice.
   *
   * @param {string} tier
   */
  function chooseTier(tier) {
    _preferred = tier;
    preference.write(tier);
  }

  /** @returns {string} The tier the player last chose. */
  function preferredTier() {
    return _preferred;
  }

  /**
   * The tier New Puzzle and pre-generation use: the tier being generated if a
   * generation is pending, else the current puzzle's tier when it has one, else
   * the player's last choice.
   *
   * @param {object} state - GameState
   * @returns {string}
   */
  function generationTier(state) {
    if (state.generatingDifficulty) return state.generatingDifficulty;
    const difficulty = state.puzzle?.difficulty;
    return isRatedTier(difficulty) ? difficulty : _preferred;
  }

  return {
    request, abort, cancel, startNew, generateSeeded, chooseTier, preferredTier, generationTier,
  };
}
