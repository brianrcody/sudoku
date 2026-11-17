/**
 * @fileoverview `window.sudokuDev`, the developer API (fspec-007 §6;
 * aspec-debug-instrumentation §11.5). A thin layer over the controller: every
 * method states its intent instead of asking, and returns one plain object.
 * No method throws or rejects, opens a dialog, or moves focus.
 */

import { validateGenerateArgs } from './devSession.js';

const INVALID_BUDGET = 'Budget must be a whole number of 1 or more.';

/** The options argument, or no options when it is not an object. */
const optionsOf = value => (value !== null && typeof value === 'object' ? value : {});

const unexpected = err => ({ ok: false, reason: 'failed', message: String(err?.message ?? err) });

/** A read or synchronous operation whose unexpected exception becomes a result. */
const guarded = fn => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return unexpected(err);
  }
};

/** An async operation whose unexpected exception or rejection becomes a result. */
const guardedAsync = fn => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    return unexpected(err);
  }
};

/**
 * Assign `window.sudokuDev`.
 *
 * @param {import('./devSession.js').DevSession} session
 */
export function install(session) {
  window.sudokuDev = Object.freeze({
    state: guarded(() => session.state()),

    load: guardedAsync((puzzleString, options) =>
      session.load(puzzleString, { ask: false, replace: optionsOf(options).replace })),

    inspect: guarded(() => session.inspect()),

    coachStep: guarded(() => session.coachStep()),

    candidates: guarded(() => session.candidates()),

    setPencilMarks: guarded((cell, digits) => session.setPencilMarks(cell, digits)),

    fillPencilMarks: guarded(() => session.fillPencilMarks()),

    exportSession: guarded(() => session.exportSession()),

    replay: guardedAsync((document, options) => {
      const { stopAfter, replace, discardHistory } = optionsOf(options);
      return session.replay(document, { stopAfter }, { ask: false, replace, discardHistory }, 'api');
    }),

    generate: guardedAsync((tier, seed, options) => {
      const { replace, acceptFallback, budget } = optionsOf(options);
      const intent = { ask: false, replace, acceptFallback, budget };
      // During a replay commit the controller fails with busy before any other check (fspec D-34).
      if (session.applying) return session.generate(tier, seed, intent);
      // Checked in the order tier, seed, budget (fspec §6.9).
      const args = validateGenerateArgs(tier, seed);
      if (!args.ok) return args;
      if (budget !== undefined && !(Number.isInteger(budget) && budget >= 1)) {
        return { ok: false, reason: 'invalid-budget', message: INVALID_BUDGET };
      }
      return session.generate(tier, seed, intent);
    }),

    clearHistory: guarded(options =>
      session.clearHistory({ ask: false, discardHistory: optionsOf(options).discardHistory })),

    logging: guarded(() => session.logging()),

    setLogging: guarded((category, on) => session.setLogging(category, on)),
  });
}
