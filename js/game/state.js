/**
 * @fileoverview Central game-state reducer. All state transitions go through
 * `dispatch(action)`. Emits `'changed'` after each mutation.
 */

import { createEmitter } from '../util/events.js';
import { computeConflicts } from './conflicts.js';
import { checkRealtime, checkAll, checkOnComplete } from './correctness.js';
import { HINT_LIMITS, CHECK_VISIBLE, CORRECTNESS_MODE, CHECK_HIGHLIGHT_MS } from '../config.js';
import { rowOf, colOf } from '../util/grid.js';

/**
 * @typedef {Object} CoachSession
 * @property {object} step - The CoachStep returned by analyze(); never mutated.
 * @property {Set<number>} coachedCells - Union of all role-cell indices (derived once).
 * @property {number|null} focusedCoachedCell - Currently selected coached cell, or null.
 * @property {Uint16Array} pencilSnapshot - Copy of pencil[] at COACH_START time.
 * @property {Uint16Array} coachRevealedBits - Bits the coach auto-reveal added per cell.
 * @property {Map<number, number>|null} eliminationTargets - For elimination techniques:
 *   maps each elimTarget cell index to the bitmask of digits that must be cleared from
 *   pencil. null for placement techniques (ranks 1–2). Never mutated after COACH_START.
 * @property {'normal'|'error'|'elim'|null} recap - Active recap variant; null during highlights.
 */

/**
 * @typedef {Object} GameState
 * @property {object|null} puzzle
 * @property {Uint8Array} pen
 * @property {Uint16Array} pencil
 * @property {number|null} selected
 * @property {'pen'|'pencil'} activeMode
 * @property {Set<number>} conflicts
 * @property {Set<number>} incorrect
 * @property {number} incorrectShownUntil
 * @property {number} hintsRemaining
 * @property {boolean} attemptRecorded
 * @property {boolean} won
 * @property {boolean} winHandled
 * @property {boolean} generating
 * @property {string} generatingMessage
 * @property {CoachSession|null} coachSession
 */

/**
 * Derive the set of coached cell indices from a CoachStep's roles.
 *
 * This is the canonical union used for highlight tracking and panel logic. It
 * is computed once on COACH_START and never recomputed during the session.
 *
 * @param {object} step - A CoachStep object.
 * @returns {Set<number>}
 */
export function deriveCoachedCells(step) {
  const set = new Set();
  if (step.roles.target !== null) set.add(step.roles.target);
  for (const c of step.roles.cause)       set.add(c);
  for (const c of step.roles.elimTarget)  set.add(c);
  for (const c of step.roles.unitMember)  set.add(c);
  for (const c of step.roles.scA)         set.add(c);
  for (const c of step.roles.scB)         set.add(c);
  return set;
}

/**
 * @param {{ stats: object, hintProvider: object }} deps
 * @returns {{ dispatch: function, getState: function, on: function }}
 */
export function createGameState({ stats, hintProvider }) {
  const emitter = createEmitter();

  /** @type {GameState} */
  const state = {
    puzzle: null,
    pen: new Uint8Array(81),
    pencil: new Uint16Array(81),
    selected: null,
    activeMode: 'pen',
    conflicts: new Set(),
    incorrect: new Set(),
    incorrectShownUntil: 0,
    hintsRemaining: 0,
    attemptRecorded: false,
    won: false,
    winHandled: false,
    generating: false,
    generatingMessage: '',
    completionMessage: '',
    coachSession: null,
  };

  // Timer handle for auto-clearing incorrect highlights.
  let clearIncorrectTimer = null;

  function _emit(action, ...changedKeys) {
    emitter.emit('changed', { action, changed: new Set(changedKeys) });
  }

  function _scheduleClearIncorrect() {
    if (clearIncorrectTimer !== null) clearTimeout(clearIncorrectTimer);
    clearIncorrectTimer = setTimeout(() => {
      clearIncorrectTimer = null;
      dispatch({ type: 'CLEAR_INCORRECT' });
    }, CHECK_HIGHLIGHT_MS);
  }

  /** Auto-clear pencil mark digit D from peers of a committed pen cell. */
  function _autoClearPencil(cellIndex, digit) {
    const bitMask = 1 << (digit - 1);
    // Clear from same row.
    const row = rowOf(cellIndex);
    const col = colOf(cellIndex);
    const boxRow = (row / 3 | 0) * 3;
    const boxCol = (col / 3 | 0) * 3;

    for (let c = 0; c < 9; c++) {
      const peer = row * 9 + c;
      if (peer !== cellIndex) state.pencil[peer] &= ~bitMask;
    }
    for (let r = 0; r < 9; r++) {
      const peer = r * 9 + col;
      if (peer !== cellIndex) state.pencil[peer] &= ~bitMask;
    }
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const peer = (boxRow + dr) * 9 + (boxCol + dc);
        if (peer !== cellIndex) state.pencil[peer] &= ~bitMask;
      }
    }
  }

  /** Reverts coach-auto-revealed pencil bits while preserving user changes. */
  function _revertPencil(session) {
    for (let i = 0; i < 81; i++) {
      const revealed = session.coachRevealedBits[i];
      if (revealed === 0) continue;
      const snapshot = session.pencilSnapshot[i];
      const current = state.pencil[i];
      state.pencil[i] = (snapshot & ~revealed) | (current & ~revealed);
    }
  }

  /** Returns true if all 81 cells have a non-zero pen value. */
  function _isBoardFull() {
    for (let i = 0; i < 81; i++) {
      if (state.pen[i] === 0) return false;
    }
    return true;
  }

  function _applyPenEnter(cellIndex, digit, fromHint) {
    if (!state.puzzle) return;
    if (state.puzzle.givens[cellIndex] !== 0) return;
    if (state.won) return;

    const prevValue = state.pen[cellIndex];
    if (prevValue === digit) return; // no-op per fspec §6.2

    state.pen[cellIndex] = digit;
    state.pencil[cellIndex] = 0; // clear pencil marks

    // Stats: record first pen entry (not from hint).
    if (!fromHint && prevValue === 0 && !state.attemptRecorded) {
      state.attemptRecorded = true;
      stats.recordAttemptOnce(state.puzzle.difficulty);
    }

    _autoClearPencil(cellIndex, digit);
    state.conflicts = computeConflicts(state.pen);

    // Realtime correctness (Kiddie).
    if (CORRECTNESS_MODE[state.puzzle.difficulty] === 'realtime') {
      if (checkRealtime(state, cellIndex)) {
        state.incorrect = new Set([cellIndex]);
      } else {
        state.incorrect.delete(cellIndex);
      }
    }

    // Check for win condition after any pen entry.
    if (_isBoardFull()) {
      dispatch({ type: 'ON_COMPLETION_EVALUATE' });
      return;
    }
  }

  function dispatch(action) {
    switch (action.type) {
      case 'PUZZLE_LOADED': {
        const puzzle = action.puzzle;
        state.puzzle = puzzle;
        state.pen = new Uint8Array(81);
        // Copy givens into pen so grid renders them.
        for (let i = 0; i < 81; i++) {
          state.pen[i] = puzzle.givens[i];
        }
        state.pencil = new Uint16Array(81);
        state.selected = null;
        state.activeMode = 'pen';
        state.conflicts = new Set();
        state.incorrect = new Set();
        state.incorrectShownUntil = 0;
        state.hintsRemaining = HINT_LIMITS[puzzle.difficulty];
        state.attemptRecorded = false;
        state.won = false;
        state.winHandled = false;
        state.generating = false;
        state.generatingMessage = '';
        state.completionMessage = '';
        state.coachSession = null;
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'puzzle', 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'attemptRecorded',
              'won', 'winHandled', 'generating', 'generatingMessage', 'completionMessage',
              'coachSession');
        break;
      }

      case 'SELECT_CELL': {
        const { index } = action;
        if (state.puzzle && state.puzzle.givens[index] !== 0) break; // givens unselectable
        if (state.won) {
          // Allow selection after win for visual feedback but no editing.
        }
        state.selected = index;
        _emit(action, 'selected');
        break;
      }

      case 'DESELECT': {
        state.selected = null;
        _emit(action, 'selected');
        break;
      }

      case 'ARROW_NAV': {
        const { direction } = action;
        // Find starting position: if no cell selected, begin at 0 and pick first player cell.
        let row, col;
        if (state.selected === null) {
          // First arrow press: pick first available player cell in reading order.
          for (let i = 0; i < 81; i++) {
            if (!state.puzzle || state.puzzle.givens[i] === 0) {
              state.selected = i;
              _emit(action, 'selected');
              return;
            }
          }
          return;
        }
        row = rowOf(state.selected);
        col = colOf(state.selected);

        const deltas = {
          left:  [0, -1],
          right: [0,  1],
          up:    [-1, 0],
          down:  [1,  0],
        };
        const [dr, dc] = deltas[direction] ?? [0, 0];

        let attempts = 0;
        do {
          row = (row + dr + 9) % 9;
          col = (col + dc + 9) % 9;
          attempts++;
        } while (state.puzzle && state.puzzle.givens[row * 9 + col] !== 0 && attempts < 81);

        state.selected = row * 9 + col;
        _emit(action, 'selected');
        break;
      }

      case 'SET_MODE': {
        state.activeMode = action.mode;
        _emit(action, 'activeMode');
        break;
      }

      case 'TOGGLE_MODE': {
        state.activeMode = state.activeMode === 'pen' ? 'pencil' : 'pen';
        _emit(action, 'activeMode');
        break;
      }

      case 'PEN_ENTER': {
        if (state.selected === null) break;
        _applyPenEnter(state.selected, action.digit, action.fromHint ?? false);

        // Coach block — runs before _emit so coachSession changes emit separately.
        if (state.coachSession !== null && !(action.fromHint ?? false)) {
          const session = state.coachSession;
          const filledCell = state.selected;
          const isCoached = session.coachedCells.has(filledCell);
          const techType = session.step.type;

          if (!isCoached) {
            dispatch({ type: 'COACH_END', reason: 'fill-non-coached' });
          } else if (techType === 'elimination') {
            dispatch({ type: 'COACH_END', reason: 'fill-coached-elim' });
          } else {
            const correct = state.puzzle.solution[filledCell] === action.digit;
            dispatch({
              type: 'COACH_FILL_RECAP',
              variant: correct ? 'normal' : 'error',
            });
          }
        }

        _emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'hintsRemaining',
              'attemptRecorded', 'won', 'winHandled');
        break;
      }

      case 'PENCIL_TOGGLE': {
        if (state.selected === null) break;
        if (!state.puzzle) break;
        if (state.puzzle.givens[state.selected] !== 0) break;
        if (state.pen[state.selected] !== 0) break; // cell has pen digit — ignore
        if (state.won) break;

        const bit = 1 << (action.digit - 1);
        if (state.pencil[state.selected] & bit) {
          state.pencil[state.selected] &= ~bit;
        } else {
          state.pencil[state.selected] |= bit;
        }

        // Elimination-completion check: if all elimination targets have had their
        // indicated candidates cleared from pencil, trigger the elim recap.
        if (state.coachSession !== null
            && state.coachSession.eliminationTargets !== null
            && state.coachSession.recap === null) {
          const targets = state.coachSession.eliminationTargets;
          const allCleared = [...targets.entries()].every(
            ([cellIndex, bits]) => (state.pencil[cellIndex] & bits) === 0
          );
          if (allCleared) {
            dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });
          }
        }

        _emit(action, 'pencil');
        break;
      }

      case 'ERASE': {
        if (state.selected === null) break;
        if (!state.puzzle) break;
        if (state.puzzle.givens[state.selected] !== 0) break;
        if (state.won) break;

        const cellIdx = state.selected;
        if (state.pen[cellIdx] !== 0) {
          state.pen[cellIdx] = 0;
          state.conflicts = computeConflicts(state.pen);
          // Clear realtime incorrect flag if erasing an incorrect cell.
          state.incorrect.delete(cellIdx);
          _emit(action, 'pen', 'conflicts', 'incorrect');
        } else if (state.pencil[cellIdx] !== 0) {
          state.pencil[cellIdx] = 0;
          _emit(action, 'pencil');
        }

        if (state.coachSession !== null) {
          dispatch({ type: 'COACH_END', reason: 'erase' });
        }
        break;
      }

      case 'HINT': {
        if (state.selected === null) break;
        if (!state.puzzle) break;
        if (state.hintsRemaining <= 0 && state.hintsRemaining !== Infinity) break;

        const cellIdx = state.selected;
        if (state.puzzle.givens[cellIdx] !== 0) break;
        if (state.pen[cellIdx] !== 0) break;
        if (state.won) break;

        const hint = hintProvider.nextHint(
          state.puzzle,
          { pen: state.pen, conflicts: state.conflicts },
          { targetCell: cellIdx }
        );
        if (!hint) break;

        state.pen[hint.cellIndex] = hint.digit;
        state.pencil[hint.cellIndex] = 0;

        if (!state.attemptRecorded) {
          state.attemptRecorded = true;
          stats.recordAttemptOnce(state.puzzle.difficulty);
        }

        if (state.hintsRemaining !== Infinity) {
          state.hintsRemaining -= 1;
        }

        _autoClearPencil(hint.cellIndex, hint.digit);
        state.conflicts = computeConflicts(state.pen);

        // Realtime correctness.
        if (CORRECTNESS_MODE[state.puzzle.difficulty] === 'realtime') {
          state.incorrect.delete(hint.cellIndex);
        }

        if (state.coachSession !== null) {
          dispatch({ type: 'COACH_END', reason: 'hint' });
        }

        _emit(action, 'pen', 'pencil', 'conflicts', 'incorrect', 'hintsRemaining');

        // Check completion.
        if (_isBoardFull()) {
          dispatch({ type: 'ON_COMPLETION_EVALUATE' });
        }
        break;
      }

      case 'CHECK': {
        if (!state.puzzle) break;
        if (!CHECK_VISIBLE[state.puzzle.difficulty]) break;

        state.incorrect = checkAll(state);
        state.incorrectShownUntil = Date.now() + CHECK_HIGHLIGHT_MS;
        _scheduleClearIncorrect();
        _emit(action, 'incorrect', 'incorrectShownUntil');
        break;
      }

      case 'ON_COMPLETION_EVALUATE': {
        if (!state.puzzle) break;
        const mode = CORRECTNESS_MODE[state.puzzle.difficulty];

        if (mode === 'realtime' || mode === 'on-demand') {
          // Realtime/on-demand: check if board is full and all correct.
          const { correct } = checkOnComplete(state);
          if (correct && !state.winHandled) {
            state.won = true;
            state.winHandled = true;
            stats.recordWin(state.puzzle.difficulty);
            _emit(action, 'won', 'winHandled');
          }
        } else if (mode === 'on-complete') {
          const { correct, wrong } = checkOnComplete(state);
          if (correct && !state.winHandled) {
            state.won = true;
            state.winHandled = true;
            stats.recordWin(state.puzzle.difficulty);
            _emit(action, 'won', 'winHandled');
          } else if (!correct) {
            state.incorrect = wrong;
            state.incorrectShownUntil = Date.now() + CHECK_HIGHLIGHT_MS;
            state.completionMessage = "Not quite — some cells are incorrect. Keep going!";
            _scheduleClearIncorrect();
            _emit(action, 'incorrect', 'incorrectShownUntil', 'completionMessage');
          }
        } else if (mode === 'on-complete-silent') {
          const { correct } = checkOnComplete(state);
          if (correct && !state.winHandled) {
            state.won = true;
            state.winHandled = true;
            stats.recordWin(state.puzzle.difficulty);
            _emit(action, 'won', 'winHandled');
          } else if (!correct) {
            // Death March: no cell highlighting, but show a message briefly.
            state.completionMessage = "Not quite. Keep going!";
            state.incorrectShownUntil = Date.now() + CHECK_HIGHLIGHT_MS;
            _scheduleClearIncorrect();
            _emit(action, 'completionMessage', 'incorrectShownUntil');
          }
        }

        // Win takes precedence over any active coach session.
        if (state.won && state.winHandled && state.coachSession !== null) {
          dispatch({ type: 'COACH_END', reason: 'won' });
        }
        break;
      }

      case 'CLEAR_INCORRECT': {
        state.incorrect = new Set();
        state.incorrectShownUntil = 0;
        state.completionMessage = '';
        _emit(action, 'incorrect', 'incorrectShownUntil', 'completionMessage');
        break;
      }

      case 'NEW_PUZZLE': {
        const { difficulty, puzzle } = action;
        state.puzzle = puzzle;
        state.pen = new Uint8Array(81);
        for (let i = 0; i < 81; i++) {
          state.pen[i] = puzzle.givens[i];
        }
        state.pencil = new Uint16Array(81);
        state.selected = null;
        state.activeMode = 'pen';
        state.conflicts = new Set();
        state.incorrect = new Set();
        state.incorrectShownUntil = 0;
        state.hintsRemaining = HINT_LIMITS[difficulty];
        state.attemptRecorded = false;
        state.won = false;
        state.winHandled = false;
        state.generating = false;
        state.generatingMessage = '';
        state.completionMessage = '';
        state.coachSession = null;
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'puzzle', 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'attemptRecorded',
              'won', 'winHandled', 'generating', 'generatingMessage', 'completionMessage',
              'coachSession');
        break;
      }

      case 'RESET_PUZZLE': {
        if (!state.puzzle) break;
        // Restore pen to givens only.
        for (let i = 0; i < 81; i++) {
          state.pen[i] = state.puzzle.givens[i];
        }
        state.pencil = new Uint16Array(81);
        state.selected = null;
        state.activeMode = 'pen';
        state.conflicts = new Set();
        state.incorrect = new Set();
        state.incorrectShownUntil = 0;
        state.hintsRemaining = HINT_LIMITS[state.puzzle.difficulty];
        state.won = false;
        state.winHandled = false;
        // attemptRecorded is intentionally not reset (fspec §10.3).
        state.completionMessage = '';
        state.coachSession = null;
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'won', 'winHandled',
              'completionMessage', 'coachSession');
        break;
      }

      case 'CHANGE_DIFFICULTY': {
        const { difficulty } = action;
        if (state.coachSession !== null) {
          dispatch({ type: 'COACH_END', reason: 'puzzle-replaced' });
        }
        if (state.puzzle) {
          state.puzzle = { ...state.puzzle, difficulty };
        }
        state.hintsRemaining = HINT_LIMITS[difficulty];
        _emit(action, 'puzzle', 'hintsRemaining');
        break;
      }

      case 'RESTORE_SESSION': {
        // Applied once after restoring persisted pen/pencil entries. Avoids
        // treating a resumed puzzle as unattempted and restores the exact hint
        // count that was saved rather than resetting to the tier maximum.
        state.attemptRecorded = action.attemptRecorded ?? state.attemptRecorded;
        state.hintsRemaining = action.hintsRemaining ?? state.hintsRemaining;
        _emit(action, 'attemptRecorded', 'hintsRemaining');
        break;
      }

      case 'SET_GENERATING': {
        state.generating = action.flag;
        state.generatingMessage = action.message ?? '';
        _emit(action, 'generating', 'generatingMessage');
        break;
      }

      // ── Coach actions ────────────────────────────────────────────────────

      case 'COACH_START': {
        if (state.puzzle === null) break;
        if (state.won === true) break;

        const result = action.result;

        if (result.type === 'no-technique') {
          // Informational emit only; coachSession stays null.
          _emit(action, 'coachSession');
          break;
        }

        // Defensive: if a previous session is active, revert it first.
        if (state.coachSession !== null) {
          _revertPencil(state.coachSession);
          state.coachSession = null;
        }

        // 1. Snapshot pencil before auto-reveal.
        const snapshot = new Uint16Array(state.pencil);

        // 2. Apply auto-reveal.
        const coachRevealedBits = new Uint16Array(81);
        if (result.autoReveal.required) {
          for (const { cellIndex, candidates } of result.autoReveal.cells) {
            const before = state.pencil[cellIndex];
            const after = before | candidates;
            coachRevealedBits[cellIndex] = after & ~before;
            state.pencil[cellIndex] = after;
          }
        }

        // 3. Compute eliminationTargets for elimination techniques.
        const eliminationTargets = (result.type === 'elimination')
          ? (() => {
              const m = new Map();
              if (result.roles.elimTarget.length > 0) {
                const digitBits = result.digits.reduce((b, d) => b | (1 << (d - 1)), 0);
                for (const c of result.roles.elimTarget) m.set(c, digitBits);
              } else {
                // Hidden Pair / Hidden Triple: eliminations happen within cause cells,
                // so roles.elimTarget is empty. Build per-cell bitmasks from the
                // individual elimination entries instead.
                for (const { cellIndex, digit } of result.eliminations) {
                  m.set(cellIndex, (m.get(cellIndex) ?? 0) | (1 << (digit - 1)));
                }
              }
              return m;
            })()
          : null;

        // 4. Build the session slice.
        const coachedCells = deriveCoachedCells(result);
        state.coachSession = {
          step: result,
          coachedCells,
          focusedCoachedCell:
            state.selected !== null && coachedCells.has(state.selected)
              ? state.selected
              : null,
          pencilSnapshot: snapshot,
          coachRevealedBits,
          eliminationTargets,
          recap: null,
        };

        _emit(action, 'coachSession', 'pencil');
        break;
      }

      case 'COACH_END': {
        if (state.coachSession === null) break;

        _revertPencil(state.coachSession);
        state.coachSession = null;
        _emit(action, 'coachSession', 'pencil');
        break;
      }

      case 'COACH_FILL_RECAP': {
        if (state.coachSession === null) break;
        if (state.coachSession.recap !== null) break;

        if (action.variant === 'elim') {
          // Elimination recap: adopt coach-revealed marks (no revert).
          // Zeroing coachRevealedBits makes subsequent COACH_END revert a no-op.
          state.coachSession.coachRevealedBits = new Uint16Array(81);
          state.coachSession.coachedCells = new Set();
          state.coachSession.recap = 'elim';
          state.coachSession.focusedCoachedCell = null;
          _emit(action, 'coachSession');
        } else {
          // Placement recap (normal/error): revert pencil marks.
          _revertPencil(state.coachSession);

          // Clear coachedCells so grid.js removes all coached-* classes.
          state.coachSession.coachedCells = new Set();
          state.coachSession.recap = action.variant;
          state.coachSession.focusedCoachedCell = null;
          state.coachSession.coachRevealedBits = new Uint16Array(81);

          _emit(action, 'coachSession', 'pencil');
        }
        break;
      }

      case 'COACH_FOCUS_COACHED_CELL': {
        if (state.coachSession === null) break;
        if (state.coachSession.recap !== null) break;
        if (!state.coachSession.coachedCells.has(action.index)) break;

        state.coachSession.focusedCoachedCell = action.index;
        _emit(action, 'coachSession');
        break;
      }

      case 'COACH_FOCUS_OFF': {
        if (state.coachSession === null) break;
        if (state.coachSession.focusedCoachedCell === null) break;

        state.coachSession.focusedCoachedCell = null;
        _emit(action, 'coachSession');
        break;
      }

      case 'COACH_NO_TECHNIQUE': {
        // Informational only; coachSession stays null.
        _emit(action, 'coachSession');
        break;
      }
    }
  }

  function getState() {
    return state;
  }

  return {
    dispatch,
    getState,
    on: emitter.on,
    off: emitter.off,
  };
}
