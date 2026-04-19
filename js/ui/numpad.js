/**
 * @fileoverview Number pad renderer and input router.
 *
 * Owns the `#numpad-root` subtree. Renders digit buttons (1–9), Erase, mode
 * toggle, Hint, and Check.
 */

import { announce } from './srLive.js';
import { HINT_LIMITS, CHECK_VISIBLE } from '../config.js';
import { rowOf, colOf } from '../util/grid.js';

const RELEVANT_KEYS = new Set([
  'puzzle', 'selected', 'activeMode', 'hintsRemaining', 'won', 'completionMessage',
]);

let _root = null;
let _gameState = null;

/**
 * @param {HTMLElement} root - The `#numpad-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _root = root;
  _gameState = gameState;

  _buildNumpad();

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _update(gameState.getState());
    }
  });

  _update(gameState.getState());
}

function _buildNumpad() {
  _root.innerHTML = `
    <div class="numpad" role="group" aria-label="Number pad">
      <div class="numpad-digits" id="numpad-digits"></div>
      <div class="numpad-utils">
        <button class="btn" id="btn-erase" aria-label="Erase selected cell">Erase</button>
        <button class="btn btn-mode mode-pen" id="btn-mode"
                aria-label="Switch to Pencil mode" aria-pressed="false">
          <span class="mode-label">
            <span class="mode-main" id="mode-label-main">Pen</span>
            <span class="mode-sub" id="mode-label-sub">tap for pencil</span>
          </span>
        </button>
      </div>
      <div class="numpad-bottom">
        <button class="btn btn-hint" id="btn-hint" aria-label="Hint">
          Hint <span class="hint-badge" id="hint-count">0</span>
        </button>
        <button class="btn btn-check" id="btn-check" aria-label="Check answers">Check</button>
      </div>
      <div class="completion-msg" id="completion-msg" aria-live="polite" hidden></div>
    </div>
  `;

  // Digit buttons.
  const digitsEl = _root.querySelector('#numpad-digits');
  for (let d = 1; d <= 9; d++) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-digit';
    btn.textContent = d;
    btn.setAttribute('aria-label', `Enter ${d}`);
    btn.addEventListener('click', () => _onDigit(d));
    digitsEl.appendChild(btn);
  }

  _root.querySelector('#btn-erase').addEventListener('click', () => {
    _gameState.dispatch({ type: 'ERASE' });
    const state = _gameState.getState();
    if (state.selected !== null) {
      const r = rowOf(state.selected) + 1;
      const c = colOf(state.selected) + 1;
      announce(`Cell row ${r}, column ${c} cleared`);
    }
  });

  _root.querySelector('#btn-mode').addEventListener('click', () => {
    _gameState.dispatch({ type: 'TOGGLE_MODE' });
    const mode = _gameState.getState().activeMode;
    announce(`Mode: ${mode === 'pen' ? 'Pen' : 'Pencil'}`);
  });

  _root.querySelector('#btn-hint').addEventListener('click', () => {
    const state = _gameState.getState();
    if (state.selected === null) return;
    if (!state.puzzle) return;
    if (state.puzzle.givens[state.selected] !== 0) return;
    if (state.pen[state.selected] !== 0) return;
    const prevHints = state.hintsRemaining;
    if (prevHints !== Infinity && prevHints <= 0) return;

    _gameState.dispatch({ type: 'HINT' });

    const newState = _gameState.getState();
    const placed = newState.pen[state.selected];
    const r = rowOf(state.selected) + 1;
    const c = colOf(state.selected) + 1;
    const remaining = newState.hintsRemaining;
    const remText = remaining === Infinity ? 'unlimited' : `${remaining}`;
    announce(`Hint used: ${placed} placed in cell row ${r}, column ${c}. ${remText} hints remaining.`);
    if (remaining === 0) announce('No hints remaining');
  });

  _root.querySelector('#btn-check').addEventListener('click', () => {
    _gameState.dispatch({ type: 'CHECK' });
    const state = _gameState.getState();
    const count = state.incorrect.size;
    if (count === 0) {
      announce('All filled cells are correct.');
    } else {
      announce(`${count} cell${count > 1 ? 's' : ''} incorrect.`);
    }
  });
}

function _onDigit(d) {
  const state = _gameState.getState();
  if (state.selected === null) return;
  if (state.won) return;

  if (state.activeMode === 'pen') {
    const prevConflicts = state.conflicts;
    _gameState.dispatch({ type: 'PEN_ENTER', digit: d });
    const newState = _gameState.getState();
    const r = rowOf(state.selected) + 1;
    const c = colOf(state.selected) + 1;
    announce(`Cell row ${r}, column ${c}: ${d}`);
    if (newState.conflicts.has(state.selected)) {
      announce(`Conflict: ${d} appears more than once`);
    } else if (prevConflicts.size > 0 && newState.conflicts.size < prevConflicts.size) {
      announce('Conflict resolved');
    }
    if (newState.incorrect.has(state.selected)) {
      announce('Incorrect');
    }
  } else {
    _gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: d });
  }
}

function _update(state) {
  const difficulty = state.puzzle?.difficulty ?? 'easy';

  // Mode button.
  const modeBtn = _root.querySelector('#btn-mode');
  const modeMain = _root.querySelector('#mode-label-main');
  const modeSub = _root.querySelector('#mode-label-sub');
  if (modeBtn) {
    if (state.activeMode === 'pen') {
      modeBtn.className = 'btn btn-mode mode-pen';
      modeMain.textContent = 'Pen';
      modeSub.textContent = 'tap for pencil';
      modeBtn.setAttribute('aria-label', 'Switch to Pencil mode');
      modeBtn.setAttribute('aria-pressed', 'false');
    } else {
      modeBtn.className = 'btn btn-mode mode-pencil';
      modeMain.textContent = 'Pencil';
      modeSub.textContent = 'tap for pen';
      modeBtn.setAttribute('aria-label', 'Switch to Pen mode');
      modeBtn.setAttribute('aria-pressed', 'true');
    }
  }

  // Hint button.
  const hintBtn = _root.querySelector('#btn-hint');
  const hintBadge = _root.querySelector('#hint-count');
  if (hintBtn && hintBadge) {
    const remaining = state.hintsRemaining;
    const exhausted = remaining !== Infinity && remaining <= 0;
    const selectedHasPen = state.selected !== null &&
      state.pen[state.selected] !== 0 &&
      (!state.puzzle || state.puzzle.givens[state.selected] === 0);

    hintBtn.disabled = exhausted || selectedHasPen || state.won;

    if (exhausted) {
      hintBadge.textContent = '0';
      hintBtn.setAttribute('aria-label', 'Hint — no hints remaining');
    } else if (remaining === Infinity) {
      hintBadge.textContent = '∞';
      hintBtn.setAttribute('aria-label', 'Hint, unlimited');
    } else {
      hintBadge.textContent = remaining;
      hintBtn.setAttribute('aria-label', `Hint, ${remaining} remaining`);
    }
  }

  // Check button visibility.
  const checkBtn = _root.querySelector('#btn-check');
  if (checkBtn) {
    checkBtn.style.display = CHECK_VISIBLE[difficulty] ? '' : 'none';
  }

  // Hard/Death March on-completion incorrect message.
  const msgEl = _root.querySelector('#completion-msg');
  if (msgEl) {
    const msg = state.completionMessage ?? '';
    if (msg) {
      msgEl.textContent = msg;
      msgEl.removeAttribute('hidden');
      announce(msg);
    } else {
      msgEl.textContent = '';
      msgEl.setAttribute('hidden', '');
    }
  }
}
