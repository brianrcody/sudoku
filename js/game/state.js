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
 */

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
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'puzzle', 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'attemptRecorded',
              'won', 'winHandled', 'generating', 'generatingMessage', 'completionMessage');
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

        if (state.hintsRemaining !== Infinity) {
          state.hintsRemaining -= 1;
        }

        _autoClearPencil(hint.cellIndex, hint.digit);
        state.conflicts = computeConflicts(state.pen);

        // Realtime correctness.
        if (CORRECTNESS_MODE[state.puzzle.difficulty] === 'realtime') {
          state.incorrect.delete(hint.cellIndex);
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
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'puzzle', 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'attemptRecorded',
              'won', 'winHandled', 'generating', 'generatingMessage', 'completionMessage');
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
        if (clearIncorrectTimer !== null) { clearTimeout(clearIncorrectTimer); clearIncorrectTimer = null; }
        _emit(action, 'pen', 'pencil', 'selected', 'activeMode', 'conflicts',
              'incorrect', 'incorrectShownUntil', 'hintsRemaining', 'won', 'winHandled',
              'completionMessage');
        break;
      }

      case 'CHANGE_DIFFICULTY': {
        const { difficulty } = action;
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
