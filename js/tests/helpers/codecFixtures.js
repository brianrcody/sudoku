/**
 * @fileoverview Shared builders for the session-codec and machine tests
 * (tspec-debug-instrumentation §2.4): puzzles, coach steps, position
 * documents, and a live store built the way developer mode builds it.
 *
 * Every puzzle is cut from the KIDDIE fixture's grid. In KIDDIE, cells 0, 1
 * and 4 are givens and cells 2, 3, 5, 6, 7 and 8 are empty; the solution's
 * first row is 5 3 4 6 7 8 9 1 2. Digit 2 fits cell 5 without a conflict.
 */

import { createGameState } from '../../game/state.js';
import { KIDDIE, KIDDIE_SOLUTION, toGivens } from '../fixtures/puzzles/loadable.js';

export { KIDDIE, KIDDIE_SOLUTION };

export const SOLUTION = toGivens(KIDDIE_SOLUTION);

/** A digit that is wrong in cell `i`. */
export const wrong = i => SOLUTION[i] % 9 + 1;

export const bit = d => 1 << (d - 1);

/** KIDDIE with only cells 2, 3 and 5 empty. */
export const NEARLY_SOLVED = KIDDIE_SOLUTION.slice(0, 2) + '00' + KIDDIE_SOLUTION[4] + '0'
  + KIDDIE_SOLUTION.slice(6);

/** @returns {object} The diagnostics of a seeded generated puzzle. */
export function makeGen(overrides = {}) {
  return {
    requestedTier: 'hard', seed: 3141592653, seedBy: 'random', budget: 150, attempts: 12,
    rejected: { unsolved: 0, wrongTier: 11, byTier: { medium: 11 } }, fallback: false,
    ...overrides,
  };
}

/**
 * A game puzzle object as the app holds it.
 *
 * @param {{id?: string, difficulty?: string, source?: string, givens?: string, gen?: object}} [opts]
 *   `source` defaults to `'string'`; passing it as `undefined` leaves it unset.
 */
export function makePuzzle(opts = {}) {
  const { id = 'p-easy', difficulty = 'easy', givens = KIDDIE, gen } = opts;
  const source = 'source' in opts ? opts.source : 'string';
  const puzzle = {
    id, difficulty, givens: toGivens(givens), solution: toGivens(KIDDIE_SOLUTION),
    solveTrace: [{ technique: 'Naked Single' }],
  };
  if (source !== undefined) puzzle.source = source;
  if (gen !== undefined) puzzle.gen = gen;
  return puzzle;
}

const noRoles = () => ({ target: null, cause: [], elimTarget: [], unitMember: [], scA: [], scB: [], fin: [] });

/** A placement CoachStep with its target in `target`. */
export function placementStep(target = 2, { technique = 'Naked Single', reveal = [] } = {}) {
  return {
    type: 'placement', technique, rank: 1, digits: [SOLUTION[target]],
    roles: { ...noRoles(), target }, unit: null, arrows: [], eliminations: [],
    autoReveal: { required: reveal.length > 0, cells: reveal },
    supportingText: 'Only one digit fits.', complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** Eliminates 9 from cell 2 and 2 from cell 3, revealing both cells' marks. */
export function eliminationStep() {
  return {
    type: 'elimination', technique: 'Naked Pair', rank: 4, digits: [9, 2],
    roles: { ...noRoles(), cause: [5, 6], elimTarget: [2, 3] },
    unit: { type: 'row', index: 0 }, arrows: [],
    eliminations: [{ cellIndex: 2, digit: 9 }, { cellIndex: 3, digit: 2 }],
    autoReveal: {
      required: true,
      cells: [{ cellIndex: 2, candidates: bit(4) | bit(9) }, { cellIndex: 3, candidates: bit(6) | bit(2) }],
    },
    supportingText: 'A pair.', complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

export const emptyMarks = () => Array.from({ length: 81 }, () => []);

/** Marks with `digits` in each listed cell. */
export function marksWith(cells) {
  const marks = emptyMarks();
  for (const [cell, digits] of Object.entries(cells)) marks[cell] = digits;
  return marks;
}

/** The PuzzleDoc of a seeded generated Easy puzzle. */
export function puzzleDoc(overrides = {}) {
  return {
    givens: KIDDIE, solution: KIDDIE_SOLUTION, tier: 'easy', origin: 'generated', id: 'p-gen',
    gen: makeGen(), ...overrides,
  };
}

/** A minimal valid PositionDoc: KIDDIE as Easy, nothing played. */
export function plainPositionDoc(overrides = {}) {
  return {
    puzzle: puzzleDoc(), board: KIDDIE, pencil: emptyMarks(), selected: null, mode: 'pen',
    hintsRemaining: 3, attemptRecorded: false, won: false, incorrect: [], highlightPending: false,
    completionMessage: '', undo: null, generating: null, coach: null, ...overrides,
  };
}

/**
 * A PositionDoc with every optional part present: pen digits, marks, an undo
 * step, a generation in progress, a pending check highlight, and an
 * elimination coach session focused on cell 2.
 */
export function richPositionDoc() {
  // Cell 5 holds a wrong digit (2; the solution has 8), flagged by a check.
  const board = KIDDIE.slice(0, 5) + '2' + KIDDIE.slice(6);
  return {
    puzzle: puzzleDoc(),
    board,
    pencil: marksWith({ 2: [4, 9], 3: [2, 6], 7: [1] }),
    selected: 2,
    mode: 'pencil',
    hintsRemaining: 2,
    attemptRecorded: true,
    won: false,
    incorrect: [5],
    highlightPending: true,
    completionMessage: '',
    undo: { board: KIDDIE, pencil: marksWith({ 7: [1] }), hintsRemaining: 3, attemptRecorded: false },
    generating: { message: 'Generating…', difficulty: 'hard', progress: { attempts: 4, budget: 50 } },
    coach: {
      step: eliminationStep(), recap: null, focused: 2,
      pencilSnapshot: marksWith({ 7: [1] }), revealed: marksWith({ 2: [4, 9], 3: [2, 6] }),
    },
  };
}

/** Timers that run nothing by themselves; `fireAll` runs every pending callback. */
export function manualTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    timers: {
      now: () => 1000,
      set: fn => { const id = nextId++; pending.set(id, fn); return id; },
      clear: id => { pending.delete(id); },
    },
    fireAll() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

/**
 * A live store as developer mode builds it: statistics suppressed, so no
 * puzzle records an attempt (main.js passes `statsSuppressed: isDevMode`).
 *
 * @param {{hint?: function, timers?: object}} [opts]
 */
export function devModeStore({ hint = () => null, timers = manualTimers().timers } = {}) {
  return createGameState({
    stats: {
      recordAttemptOnce() { throw new Error('statistics recorded in developer mode'); },
      recordWin() { throw new Error('statistics recorded in developer mode'); },
    },
    hintProvider: { nextHint: hint },
    statsSuppressed: () => true,
    timers,
  });
}

/** JSON round trip, as an exported and re-read document goes. */
export const viaJson = v => JSON.parse(JSON.stringify(v));
