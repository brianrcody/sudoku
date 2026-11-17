/**
 * @fileoverview The headless game machine (aspec-debug-instrumentation §8.1):
 * a real game store with no listeners, no statistics, no timers and no
 * solver, driven by recorded actions. Replay, the recorder's base position
 * and the fixture helper all apply actions through it. Pure.
 */

import { createGameState } from '../game/state.js';
import { decodePosition, decodeAction } from './sessionCodec.js';

const NULL_STATS = Object.freeze({ recordAttemptOnce() {}, recordWin() {} });

/** Recorded hints carry their answer; a HINT without one finds nothing. */
const NULL_HINTS = Object.freeze({ nextHint: () => null });

/**
 * The clock reads 0 and nothing is ever scheduled, so time-dependent state
 * reduces to the `highlightPending` flag.
 */
const INERT_TIMERS = Object.freeze({ now: () => 0, set: () => 0, clear: () => {} });

/**
 * @typedef {Object} Machine
 * @property {function(): import('../game/state.js').GameState} getState
 * @property {function(object): void} dispatch
 */

/**
 * A game store with no listeners, no statistics, no timers and no solver, set
 * to `position`. Nothing ever subscribes to it.
 *
 * @param {import('./sessionCodec.js').PositionDoc} position - A valid position document.
 * @returns {Machine}
 */
export function createMachine(position) {
  const store = createGameState({
    stats: NULL_STATS,
    hintProvider: NULL_HINTS,
    statsSuppressed: () => true,
    tap: null,
    timers: INERT_TIMERS,
  });
  store.dispatch({ type: 'DEV_RESTORE_POSITION', position: decodePosition(position) });
  return { getState: store.getState, dispatch: store.dispatch };
}

/**
 * Apply one history entry verbatim: its action, then each follow-up in order.
 *
 * @param {Machine} machine
 * @param {{a: import('./sessionCodec.js').ActionDoc,
 *   f?: import('./sessionCodec.js').ActionDoc[]}} entry - Valid action documents.
 * @throws {*} Whatever the reducer throws; the caller decides what a failure means.
 */
export function applyEntry(machine, entry) {
  machine.dispatch(decodeAction(entry.a));
  for (const followUp of entry.f ?? []) machine.dispatch(decodeAction(followUp));
}

/**
 * The machine's current position, deep enough to restore: every mutable part
 * is copied; the puzzle and the coach step are shared, being immutable by
 * contract. It also carries `conflicts`, which a restore ignores and the
 * replay comparison reads (aspec §8.3).
 *
 * @param {Machine} machine
 * @returns {import('../game/state.js').InternalPosition & {conflicts: Set<number>}}
 */
export function snapshot(machine) {
  const s = machine.getState();
  const coach = s.coachSession;
  const undo = s.undoSnapshot;
  return {
    puzzle: s.puzzle,
    pen: new Uint8Array(s.pen),
    pencil: new Uint16Array(s.pencil),
    selected: s.selected,
    activeMode: s.activeMode,
    incorrect: new Set(s.incorrect),
    highlightPending: s.incorrectShownUntil > 0,
    hintsRemaining: s.hintsRemaining,
    attemptRecorded: s.attemptRecorded,
    won: s.won,
    generating: s.generating,
    generatingMessage: s.generatingMessage,
    generatingDifficulty: s.generatingDifficulty,
    genProgress: s.genProgress === null ? null : { ...s.genProgress },
    completionMessage: s.completionMessage,
    coachSession: coach === null ? null : {
      ...coach,
      coachedCells: new Set(coach.coachedCells),
      pencilSnapshot: new Uint16Array(coach.pencilSnapshot),
      coachRevealedBits: new Uint16Array(coach.coachRevealedBits),
      eliminationTargets: coach.eliminationTargets === null ? null : new Map(coach.eliminationTargets),
    },
    undoSnapshot: undo === null ? null : {
      ...undo,
      pen: new Uint8Array(undo.pen),
      pencil: new Uint16Array(undo.pencil),
    },
    conflicts: new Set(s.conflicts),
  };
}
