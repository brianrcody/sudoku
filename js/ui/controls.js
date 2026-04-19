/**
 * @fileoverview Controls UI — Difficulty selector.
 *
 * Owns the `#controls-root` subtree. Manages the difficulty selector, including
 * the abandonment-confirmation dialog when changing difficulty mid-game.
 */

import { open as openDialog } from './dialog.js';

const RELEVANT_KEYS = new Set(['puzzle']);

let _root = null;
let _gameState = null;

/**
 * @param {HTMLElement} root - The `#controls-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _root = root;
  _gameState = gameState;

  _root.innerHTML = `
    <div class="difficulty-row">
      <label for="difficulty-select">Difficulty</label>
      <select id="difficulty-select" aria-label="Select difficulty level">
        <option value="kiddie">Kiddie</option>
        <option value="easy">Easy</option>
        <option value="medium" selected>Medium</option>
        <option value="hard">Hard</option>
        <option value="death-march">Death March</option>
      </select>
    </div>
  `;

  const diffSelect = _root.querySelector('#difficulty-select');
  diffSelect.addEventListener('change', () => _onDifficultyChange(diffSelect));

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _update(gameState.getState());
    }
  });

  _update(gameState.getState());
}

function _onDifficultyChange(diffSelect) {
  const newDiff = diffSelect.value;
  const state = _gameState.getState();
  const prevDiff = state.puzzle?.difficulty ?? 'medium';

  if (_isInProgress(state)) {
    // Revert the select immediately; only commit on confirm.
    diffSelect.value = prevDiff;

    openDialog({
      title: 'Change difficulty?',
      body: 'Your current progress will be lost.',
      confirmLabel: 'Change Difficulty',
      onConfirm: () => {
        _gameState.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: newDiff });
        diffSelect.value = newDiff;
      },
    });
  } else {
    _gameState.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: newDiff });
  }
}

function _isInProgress(state) {
  if (!state.puzzle) return false;
  if (state.won) return false;
  for (let i = 0; i < 81; i++) {
    if (state.puzzle.givens[i] === 0 && state.pen[i] !== 0) return true;
  }
  return false;
}

function _update(state) {
  const diffSelect = _root.querySelector('#difficulty-select');
  if (diffSelect && state.puzzle?.difficulty) {
    diffSelect.value = state.puzzle.difficulty;
  }
}
