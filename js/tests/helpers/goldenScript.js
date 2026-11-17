/**
 * @fileoverview The golden-trace script (tspec-debug-instrumentation SG0/SG1).
 *
 * A fixed sequence of ~250 dispatches that drives every case of the reducer as
 * it was before the debug-instrumentation seams (commit a4defe6), and every
 * nested-dispatch site: completion evaluation in each correctness mode, each
 * COACH_END reason, each COACH_FILL_RECAP variant, and the check-highlight
 * expiry on a real timer.
 *
 * The script deliberately takes `createGameState` as a parameter and imports
 * nothing from the app except `config.js` (unchanged by the feature), so the
 * same script can be run against the pre-change reducer to capture the golden
 * file (js/tests/tools/captureGoldenTrace.js) and against the current reducer
 * to compare (unit/state-golden.test.js). It uses none of the actions the
 * feature added.
 */

import { CHECK_HIGHLIGHT_MS } from '/js/config.js';
import { createTracedStore } from './stateTrace.js';

/** The classic solved grid every golden puzzle is cut from. */
const SOLUTION = Uint8Array.from(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
  Number,
);

/** A wrong digit for cell `i`. */
const wrong = i => SOLUTION[i] % 9 + 1;
const bit = d => 1 << (d - 1);

function makePuzzle(id, difficulty, empties) {
  const givens = new Uint8Array(SOLUTION);
  for (const i of empties) givens[i] = 0;
  return { id, difficulty, givens, solution: new Uint8Array(SOLUTION), solveTrace: [] };
}

const KIDDIE_EMPTIES = [2, 4, 12, 22, 30, 40, 50, 58, 64, 80];
const EASY_EMPTIES = [1, 3, 11, 13, 21, 23, 31, 33, 41, 43, 51, 53, 61, 63, 71, 73];
const HARD_EMPTIES = [5, 15, 25, 35, 45, 55];
const EXPERT_EMPTIES = [6, 16];
const UNRATED_EMPTIES = [7, 17, 27];

export const GOLDEN_PUZZLES = {
  kiddie: makePuzzle('golden-kiddie', 'kiddie', KIDDIE_EMPTIES),
  easy: makePuzzle('golden-easy', 'easy', EASY_EMPTIES),
  hard: makePuzzle('golden-hard', 'hard', HARD_EMPTIES),
  expert: makePuzzle('golden-expert', 'expert', EXPERT_EMPTIES),
  unrated: makePuzzle('golden-unrated', 'unrated', UNRATED_EMPTIES),
};

/** The cell for which the scripted hint provider has no hint. */
const NO_HINT_CELL = 73;

/**
 * The scripted hint provider: the solution digit of the requested cell, or
 * nothing for NO_HINT_CELL on the Easy puzzle.
 */
export function goldenHint(puzzle, _playerState, { targetCell }) {
  if (puzzle.id === 'golden-easy' && targetCell === NO_HINT_CELL) return null;
  return { cellIndex: targetCell, digit: puzzle.solution[targetCell], technique: 'Golden' };
}

const NO_ROLES = { target: null, cause: [], elimTarget: [], unitMember: [], scA: [], scB: [] };

function placementStep(target, { cause = [], reveal = [] } = {}) {
  return {
    type: 'placement',
    technique: `Placement@${target}`,
    rank: 1,
    digits: [SOLUTION[target]],
    roles: { ...NO_ROLES, target, cause },
    unit: null,
    arrows: [],
    eliminations: [],
    autoReveal: { required: reveal.length > 0, cells: reveal },
    supportingText: '',
    complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/**
 * @param {Array<[number, number]>} eliminations - [cell, digit] pairs.
 * @param {number[]} cause
 */
function eliminationStep(eliminations, cause) {
  const reveal = eliminations.map(([cellIndex, digit]) => ({
    cellIndex, candidates: bit(digit) | bit(SOLUTION[cellIndex]),
  }));
  return {
    type: 'elimination',
    technique: `Elimination@${eliminations.map(([c]) => c).join('-')}`,
    rank: 4,
    digits: eliminations.map(([, d]) => d),
    roles: { ...NO_ROLES, cause, elimTarget: eliminations.map(([c]) => c) },
    unit: { type: 'row', index: 0 },
    arrows: [],
    eliminations: eliminations.map(([cellIndex, digit]) => ({ cellIndex, digit })),
    autoReveal: { required: true, cells: reveal },
    supportingText: '',
    complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

const NO_TECHNIQUE = { type: 'no-technique', reason: 'error' };

const sel = index => ({ type: 'SELECT_CELL', index });
const pen = (digit, extra = {}) => ({ type: 'PEN_ENTER', digit, ...extra });
const mark = digit => ({ type: 'PENCIL_TOGGLE', digit });
const coach = result => ({ type: 'COACH_START', result });
const at = (index, ...actions) => [sel(index), ...actions];
const fillCorrect = cells => cells.flatMap(i => at(i, pen(SOLUTION[i])));
const WAIT_PAST_HIGHLIGHT = { wait: CHECK_HIGHLIGHT_MS + 200 };

/** @returns {Array<object>} The script: actions, and `{ wait }` pauses. */
export function goldenSteps() {
  const P = GOLDEN_PUZZLES;
  const K = KIDDIE_EMPTIES;
  const E = EASY_EMPTIES;
  const H = HARD_EMPTIES;
  const X = EXPERT_EMPTIES;
  const U = UNRATED_EMPTIES;
  const easyElim = eliminationStep([[1, 9], [3, 2]], [11, 13]);

  return [
    // ── No puzzle: every guard that needs one ──────────────────────────────
    { type: 'SELECT_FIRST_CELL' },
    { type: 'ARROW_NAV', direction: 'right' },      // no selection → cell 0
    { type: 'DESELECT' },
    pen(3),                                          // no selection
    sel(5), pen(3),                                  // no puzzle: emits, changes nothing
    mark(3), { type: 'ERASE' }, { type: 'ERASE_ALL_PENCIL' }, { type: 'UNDO' },
    { type: 'HINT' }, { type: 'CHECK' }, { type: 'ON_COMPLETION_EVALUATE' },
    { type: 'RESET_PUZZLE' }, { type: 'DEV_SET_BOARD', pen: new Uint8Array(81) },
    coach(placementStep(2)), { type: 'COACH_END', reason: 'session-reset' },
    { type: 'COACH_FILL_RECAP', variant: 'normal' },
    { type: 'COACH_FOCUS_COACHED_CELL', index: 2 }, { type: 'COACH_FOCUS_OFF' },
    { type: 'COACH_NO_TECHNIQUE', reason: 'error' },
    { type: 'CHANGE_DIFFICULTY', difficulty: 'easy' },
    { type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'kiddie' },
    { type: 'GEN_PROGRESS', attempts: 3, budget: 50 },
    { type: 'SET_GENERATING', flag: false },
    { type: 'GEN_PROGRESS', attempts: 4, budget: 50 },  // stale
    { type: 'SET_GENERATING', flag: true },
    { type: 'NOT_AN_ACTION' },

    // ── Kiddie: realtime correctness, unlimited hints ──────────────────────
    { type: 'PUZZLE_LOADED', puzzle: P.kiddie },
    { type: 'SELECT_FIRST_CELL' },
    { type: 'ARROW_NAV', direction: 'left' },
    { type: 'ARROW_NAV', direction: 'up' },
    { type: 'ARROW_NAV', direction: 'down' },
    { type: 'ARROW_NAV', direction: 'right' },
    { type: 'ARROW_NAV', direction: 'diagonal' },
    { type: 'SET_MODE', mode: 'pencil' }, { type: 'TOGGLE_MODE' }, { type: 'TOGGLE_MODE' },
    ...at(K[0], mark(3), mark(5), mark(3)),
    { type: 'UNDO' },
    { type: 'UNDO' },                                // snapshot consumed
    pen(wrong(K[0])),                                // realtime incorrect; attempt recorded
    pen(wrong(K[0])),                                // same digit: no-op
    pen(SOLUTION[K[0]]),
    { type: 'ERASE' },                               // pen digit
    { type: 'ERASE' },                               // nothing to erase
    mark(7), { type: 'ERASE' },                      // pencil only
    ...at(0, pen(9), mark(9), { type: 'ERASE' }, { type: 'HINT' }),  // given cell
    ...at(K[1], { type: 'HINT' }),                   // unlimited hints
    { type: 'CHECK' },                               // not visible on Kiddie
    ...at(K[2], pen(SOLUTION[K[2]], { fromHint: true })),

    // Placement session: focus, correct fill → normal recap.
    sel(K[3]),
    coach(placementStep(K[3], { cause: [K[3] - 1] })),
    { type: 'COACH_FOCUS_OFF' },
    { type: 'COACH_FOCUS_OFF' },
    { type: 'COACH_FOCUS_COACHED_CELL', index: 79 },
    { type: 'COACH_FOCUS_COACHED_CELL', index: K[3] },
    pen(SOLUTION[K[3]]),
    { type: 'COACH_FOCUS_COACHED_CELL', index: K[3] }, // in recap
    { type: 'COACH_FILL_RECAP', variant: 'normal' },  // already in recap
    { type: 'PEN_ENTER', digit: SOLUTION[K[3]] },      // same digit: no-op in recap
    { type: 'COACH_END', reason: 'recap-timeout' },

    // Placement session with auto-reveal: wrong fill → error recap.
    coach(placementStep(K[4], { reveal: [{ cellIndex: K[4], candidates: bit(SOLUTION[K[4]]) | bit(wrong(K[4])) },
                                         { cellIndex: K[5], candidates: bit(SOLUTION[K[5]]) }] })),
    ...at(K[4], pen(wrong(K[4]))),
    { type: 'COACH_END', reason: 'recap-timeout' },
    { type: 'ERASE' },

    // Fill outside the coached cells → fill-non-coached.
    coach(placementStep(K[4])),
    ...at(K[5], pen(SOLUTION[K[5]])),

    coach(NO_TECHNIQUE),
    coach(eliminationStep([[K[6], wrong(K[6])]], [K[7]])),
    coach(placementStep(K[6], { reveal: [{ cellIndex: K[7], candidates: bit(SOLUTION[K[7]]) }] })), // replaces
    { type: 'COACH_END', reason: 'session-reset' },
    ...fillCorrect([K[0], K[4], K[6], K[7], K[8]]),
    ...at(K[1], mark(1), mark(2)),
    sel(K[9]),
    coach(placementStep(K[9])),
    pen(SOLUTION[K[9]]),                             // last cell: win ends the session

    // Won: every move is refused.
    pen(1), { type: 'ERASE' }, mark(4), { type: 'HINT' }, { type: 'UNDO' },
    { type: 'ERASE_ALL_PENCIL' }, coach(placementStep(K[1])),
    { type: 'DEV_SET_BOARD', pen: new Uint8Array(81) },
    { type: 'ON_COMPLETION_EVALUATE' },
    sel(40),
    { type: 'RESET_PUZZLE' },
    ...fillCorrect(K.slice(0, 9)),
    ...at(K[9], { type: 'HINT' }),                   // a hint that completes the board wins

    // ── Easy: on-demand correctness, Check, three hints ────────────────────
    { type: 'NEW_PUZZLE', difficulty: 'easy', puzzle: P.easy },
    ...at(E[0], pen(SOLUTION[E[0]], { fromHint: true })),   // a hint fill records no attempt
    ...at(E[1], pen(wrong(E[1]))),                         // first attempt
    { type: 'CHECK' },
    ...at(E[2], { type: 'HINT' }),
    WAIT_PAST_HIGHLIGHT,                                    // CLEAR_INCORRECT from the timer
    { type: 'CHECK' }, { type: 'CHECK' },                   // reschedules
    { type: 'UNDO' },                                       // undoes the hint, clears the timer
    ...at(NO_HINT_CELL, { type: 'HINT' }),                  // provider has nothing
    { type: 'CHECK' },
    { type: 'DEV_SET_BOARD', pen: Uint8Array.from(SOLUTION, (d, i) => (i === E[3] ? d : 0)),
      pencil: Uint16Array.from({ length: 81 }, (_, i) => (i === E[4] ? bit(1) | bit(2) : 0)) },
    { type: 'CHECK' },
    { type: 'DEV_SET_BOARD', pen: new Uint8Array(81) },
    { type: 'CLEAR_INCORRECT' },
    { type: 'ERASE_ALL_PENCIL' },                           // nothing to erase
    ...at(E[5], mark(4), mark(8)),
    { type: 'ERASE_ALL_PENCIL' },

    // Elimination session: clear the indicated candidates → elim recap.
    coach(easyElim),
    ...at(1, mark(9)),
    ...at(3, mark(9)),                                      // not an indicated candidate
    mark(2),                                                // last indicated candidate
    mark(2),                                                // in recap: no check
    { type: 'COACH_END', reason: 'recap-timeout' },

    // Each coach-ending path.
    ...at(E[6], mark(5)),
    coach(easyElim), { type: 'ERASE_ALL_PENCIL' },          // erase (all pencil)
    ...at(E[6], pen(wrong(E[6]))),
    coach(easyElim), { type: 'ERASE' },                     // erase (pen digit)
    coach(easyElim), { type: 'ERASE' },                     // erase (nothing to erase)
    coach(easyElim), ...at(1, pen(SOLUTION[1])),            // fill-coached-elim
    coach(easyElim), ...at(E[7], { type: 'HINT' }),          // hint
    coach(placementStep(E[8])), ...at(E[8], pen(SOLUTION[E[8]], { fromHint: true })), // fromHint: no coach block
    { type: 'CHANGE_DIFFICULTY', difficulty: 'hard' },      // puzzle-replaced
    { type: 'CHANGE_DIFFICULTY', difficulty: 'hard' },      // no session
    coach(placementStep(E[9])), ...at(E[9], pen(SOLUTION[E[9]])),
    coach(placementStep(E[10])), { type: 'UNDO' },          // undo ends the session directly
    ...at(E[10], mark(1)),
    { type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'hard' },
    { type: 'UNDO' }, { type: 'ERASE_ALL_PENCIL' },
    { type: 'GEN_PROGRESS', attempts: 1, budget: 10 },
    { type: 'SET_GENERATING', flag: false },
    { type: 'RESTORE_SESSION', attemptRecorded: true, hintsRemaining: 1 },
    { type: 'RESTORE_SESSION' },
    ...at(E[11], { type: 'HINT' }),                          // last hint
    ...at(E[12], { type: 'HINT' }),                          // none left
    coach(placementStep(E[12], { reveal: [{ cellIndex: E[13], candidates: bit(SOLUTION[E[13]]) }] })),
    { type: 'DEV_SET_BOARD', pen: Uint8Array.from(SOLUTION, (d, i) => (i === E[0] ? d : 0)),
      pencil: new Uint16Array(81) },                        // ends the session by revert
    { type: 'COACH_NO_TECHNIQUE', reason: 'none' },
    ...E.flatMap(i => at(i, pen(i === E[14] ? wrong(i) : SOLUTION[i]))), // full but wrong: no reaction
    { type: 'ON_COMPLETION_EVALUATE' },
    ...at(E[14], { type: 'ERASE' }, pen(SOLUTION[E[14]])),  // win

    // ── Hard: on-complete correctness ──────────────────────────────────────
    { type: 'NEW_PUZZLE', difficulty: 'hard', puzzle: P.hard },
    { type: 'CHECK' },                                       // not visible
    ...at(H[0], { type: 'HINT' }),                           // no hints on Hard
    ...fillCorrect(H.slice(0, 5)),
    sel(H[5]),
    coach(placementStep(H[5])),
    pen(wrong(H[5])),                                        // completes wrong: highlight, message, error recap
    { type: 'UNDO' },                                        // clears the highlight timer
    pen(SOLUTION[H[5]]),                                     // win, no session
    { type: 'RESET_PUZZLE' },
    ...H.flatMap(i => at(i, pen(i === H[0] ? wrong(i) : SOLUTION[i]))),
    { type: 'RESET_PUZZLE' },                                // clears the highlight timer
    ...H.flatMap(i => at(i, pen(i === H[1] ? wrong(i) : SOLUTION[i]))),
    { type: 'PUZZLE_LOADED', puzzle: P.hard },              // clears the highlight timer
    ...H.flatMap(i => at(i, pen(i === H[2] ? wrong(i) : SOLUTION[i]))),

    // ── Expert: on-complete-silent ─────────────────────────────────────────
    { type: 'NEW_PUZZLE', difficulty: 'expert', puzzle: P.expert },  // clears the highlight timer
    ...at(X[0], pen(SOLUTION[X[0]])),
    ...at(X[1], pen(wrong(X[1]))),                           // message only
    { type: 'ERASE' },
    coach(placementStep(X[1])),
    pen(SOLUTION[X[1]]),                                     // win ends the session
    { type: 'CLEAR_INCORRECT' },

    // ── Unrated: no statistics, no coach, no hints ─────────────────────────
    { type: 'PUZZLE_LOADED', puzzle: P.unrated },
    ...at(U[0], pen(wrong(U[0]))),                           // no attempt recorded
    coach(placementStep(U[1])),
    ...at(U[1], { type: 'HINT' }),
    { type: 'CHECK' },
    { type: 'ERASE' },
    ...at(U[0], pen(SOLUTION[U[0]])),
    ...fillCorrect([U[1], U[2]]),                            // win, no statistics
    { type: 'PUZZLE_LOADED', puzzle: P.kiddie },             // clears the highlight timer
  ];
}

/**
 * Runs the golden script against `createGameState`.
 *
 * @param {function} createGameState
 * @param {object} [extraDeps] - Passed to `createGameState` (e.g. `tap`, `timers`).
 * @returns {Promise<object[]>} The trace (see stateTrace.js).
 */
export async function runGoldenScript(createGameState, extraDeps = {}) {
  const { store, trace } = createTracedStore(createGameState, { hint: goldenHint, extraDeps });
  let n = 0;
  for (const step of goldenSteps()) {
    if ('wait' in step) {
      await new Promise(resolve => setTimeout(resolve, step.wait));
      continue;
    }
    trace.push({ e: 'dispatch', n: n++, type: step.type });
    store.dispatch(step);
  }
  return trace;
}
