/**
 * @fileoverview Seeded random action generator for property and sweep tests
 * (tspec-debug-instrumentation §1.3).
 *
 * Given a seed and the live state, `next(state)` returns the next action. All
 * randomness comes from `mulberry32(seed)`, so a seed reproduces a session
 * exactly when it is replayed against the same reducer. Actions are the ones a
 * player (or the app's own wiring) can dispatch in normal mode; coach starts
 * use the real analyzer, as the Coach button does.
 */

import { mulberry32 } from '/js/prng.js';
import { analyze } from '/js/coach/analyzer.js';

const DIRECTIONS = ['left', 'right', 'up', 'down'];

/**
 * @param {number} seed
 * @param {{ puzzles: object[] }} opts - Puzzles to load and switch between.
 * @returns {{ next: function(object): object, rng: function(): number }}
 */
export function createSessionDriver(seed, { puzzles }) {
  const rng = mulberry32(seed);
  const int = n => Math.floor(rng() * n);
  const pick = list => list[int(list.length)];
  const digit = () => 1 + int(9);

  function emptyCell(state) {
    const empties = [];
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0 && state.pen[i] === 0) empties.push(i);
    }
    return empties.length > 0 ? pick(empties) : int(81);
  }

  function coachStart(state) {
    const result = analyze(state.puzzle,
      { pen: state.pen, conflicts: state.conflicts, pencil: state.pencil });
    return result.type === 'no-technique'
      ? { type: 'COACH_NO_TECHNIQUE', reason: result.reason }
      : { type: 'COACH_START', result };
  }

  function penEnter(state) {
    const sel = state.selected;
    const right = state.puzzle && sel !== null ? state.puzzle.solution[sel] : 0;
    return { type: 'PEN_ENTER', digit: right && rng() < 0.7 ? right : digit() };
  }

  /** [weight, generator] — generators that need a puzzle return null without one. */
  const TABLE = [
    [14, s => ({ type: 'SELECT_CELL', index: s.puzzle && rng() < 0.7 ? emptyCell(s) : int(81) })],
    [20, s => penEnter(s)],
    [10, () => ({ type: 'PENCIL_TOGGLE', digit: digit() })],
    [4, () => ({ type: 'ERASE' })],
    [2, () => ({ type: 'ERASE_ALL_PENCIL' })],
    [5, () => ({ type: 'UNDO' })],
    [4, () => ({ type: 'HINT' })],
    [4, () => ({ type: 'CHECK' })],
    [5, () => ({ type: 'ARROW_NAV', direction: pick(DIRECTIONS) })],
    [1, () => ({ type: 'SET_MODE', mode: pick(['pen', 'pencil']) })],
    [1, () => ({ type: 'TOGGLE_MODE' })],
    [1, () => ({ type: 'DESELECT' })],
    [1, () => ({ type: 'SELECT_FIRST_CELL' })],
    [5, s => (s.puzzle && !s.won ? coachStart(s) : null)],
    [1, () => ({ type: 'COACH_END', reason: 'recap-timeout' })],
    [2, s => ({ type: 'COACH_FOCUS_COACHED_CELL', index: s.selected ?? int(81) })],
    [1, () => ({ type: 'COACH_FOCUS_OFF' })],
    [1, () => ({ type: 'CHANGE_DIFFICULTY', difficulty: pick(puzzles).difficulty })],
    [1, () => ({ type: 'PUZZLE_LOADED', puzzle: pick(puzzles) })],
    [1, () => {
      const puzzle = pick(puzzles);
      return { type: 'NEW_PUZZLE', difficulty: puzzle.difficulty, puzzle };
    }],
    [1, () => ({ type: 'RESET_PUZZLE' })],
    [1, () => ({ type: 'SET_GENERATING', flag: rng() < 0.5, message: 'Generating…', difficulty: 'easy' })],
    [1, () => ({ type: 'GEN_PROGRESS', attempts: int(50), budget: 50 })],
    [1, () => ({ type: 'RESTORE_SESSION', attemptRecorded: rng() < 0.5, hintsRemaining: int(4) })],
    [1, s => (s.puzzle ? { type: 'DEV_SET_BOARD', pen: Uint8Array.from(s.puzzle.solution, d => (rng() < 0.5 ? d : 0)) } : null)],
    [1, () => ({ type: 'CLEAR_INCORRECT' })],
  ];
  const TOTAL = TABLE.reduce((sum, [w]) => sum + w, 0);

  function next(state) {
    if (state.puzzle === null) return { type: 'PUZZLE_LOADED', puzzle: pick(puzzles) };
    for (;;) {
      let roll = rng() * TOTAL;
      for (const [weight, make] of TABLE) {
        roll -= weight;
        if (roll < 0) {
          const action = make(state);
          if (action) return action;
          break;
        }
      }
    }
  }

  return { next, rng };
}
