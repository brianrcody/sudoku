/**
 * @fileoverview Statistics dialog.
 *
 * Owns the `#stats-dialog-root` subtree: a modal holding the table of
 * per-difficulty attempt and win counts, opened from the menu. The table is
 * re-rendered on `statistics.on('stats-changed', ...)` and when the current
 * puzzle changes, whether or not the dialog is open, so it is always current.
 */

import { DIFFICULTY_ORDER, TIER_LABELS } from '../config.js';

const RELEVANT_KEYS = new Set(['puzzle']);

let _root = null;
let _statistics = null;
let _backdrop = null;
let _closeBtn = null;
let _returnFocus = null;

/**
 * Builds the Statistics dialog (closed) inside `root` and keeps its table current.
 *
 * @param {HTMLElement} root - `#stats-dialog-root`.
 * @param {{ getState: function, on: function }} gameState
 * @param {{ get: function, on: function }} statistics
 */
export function mount(root, gameState, statistics) {
  _root = root;
  _statistics = statistics;

  _buildDialog();

  statistics.on('stats-changed', () => {
    _render(gameState.getState());
  });

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _render(gameState.getState());
    }
  });

  _render(gameState.getState());
}

/**
 * Opens the dialog and moves focus to Close.
 *
 * @param {HTMLElement} returnFocus - Receives focus when the dialog closes.
 */
export function open(returnFocus) {
  _returnFocus = returnFocus;
  _backdrop.classList.add('open');
  _closeBtn.focus();
}

/** Closes the dialog, if open, and focuses the `returnFocus` given to `open`. */
export function close() {
  if (!isOpen()) return;
  _backdrop.classList.remove('open');
  const target = _returnFocus;
  _returnFocus = null;
  target.focus();
}

/** @returns {boolean} */
export function isOpen() {
  return _backdrop !== null && _backdrop.classList.contains('open');
}

function _buildDialog() {
  _root.innerHTML = `
    <div class="modal-backdrop" id="stats-backdrop" role="dialog" aria-modal="true"
         aria-labelledby="stats-dialog-title">
      <div class="modal modal-stats">
        <h2 id="stats-dialog-title">Statistics</h2>
        <div class="stats-panel">
          <table class="stats-table" aria-label="Game statistics by difficulty">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Tried</th>
                <th scope="col">Won</th>
              </tr>
            </thead>
            <tbody id="stats-tbody"></tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="stats-close">Close</button>
        </div>
      </div>
    </div>
  `;

  _backdrop = _root.querySelector('#stats-backdrop');
  _closeBtn = _root.querySelector('#stats-close');

  _closeBtn.addEventListener('click', close);

  _backdrop.addEventListener('keydown', e => {
    // The page behind is inert to game shortcuts while the dialog is open.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // Close is the only focusable element, so focus stays on it.
      e.preventDefault();
    }
  });
}

function _render(state) {
  const tbody = _root.querySelector('#stats-tbody');
  const statsMap = _statistics.get();
  const activeDiff = state.puzzle?.difficulty ?? null;

  tbody.innerHTML = '';
  for (const diff of DIFFICULTY_ORDER) {
    const s = statsMap ? statsMap[diff] : { attempted: 0, won: 0 };
    const label = TIER_LABELS[diff];
    const tr = document.createElement('tr');
    const counts = `${s.attempted} attempted, ${s.won} won`;
    if (diff === activeDiff) {
      tr.classList.add('active-diff');
      tr.setAttribute('aria-label', `${label}, current level: ${counts}`);
    } else {
      tr.setAttribute('aria-label', `${label}: ${counts}`);
    }
    tr.innerHTML = `
      <td>${label}</td>
      <td>${s.attempted}</td>
      <td>${s.won}</td>
    `;
    tbody.appendChild(tr);
  }
}
