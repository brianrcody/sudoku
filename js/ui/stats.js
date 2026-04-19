/**
 * @fileoverview Statistics panel renderer.
 *
 * Owns the `#stats-root` subtree. Renders a table of per-difficulty attempt
 * and win counts. Subscribes to `statistics.on('stats-changed', ...)` for data
 * updates and to the game state `'changed'` event to update the active-row marker
 * when the current difficulty changes.
 */

import { DIFFICULTY_ORDER } from '../config.js';

const DIFFICULTY_LABELS = {
  kiddie: 'Kiddie',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  'death-march': 'Death March',
};

const RELEVANT_KEYS = new Set(['puzzle']);

let _root = null;
let _gameState = null;
let _statistics = null;

/**
 * @param {HTMLElement} root - The `#stats-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 * @param {{ get: function, on: function }} statistics
 */
export function mount(root, gameState, statistics) {
  _root = root;
  _gameState = gameState;
  _statistics = statistics;

  _buildPanel();

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

function _buildPanel() {
  _root.innerHTML = `
    <div class="stats-panel">
      <div class="stats-heading">Statistics</div>
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
  `;
}

function _render(state) {
  const tbody = _root.querySelector('#stats-tbody');
  if (!tbody) return;

  const statsMap = _statistics.get();
  const activeDiff = state.puzzle?.difficulty ?? null;

  tbody.innerHTML = '';
  for (const diff of DIFFICULTY_ORDER) {
    const s = statsMap ? statsMap[diff] : { attempted: 0, won: 0 };
    const label = DIFFICULTY_LABELS[diff];
    const tr = document.createElement('tr');
    if (diff === activeDiff) tr.classList.add('active-diff');
    tr.setAttribute('aria-label', `${label}: ${s.attempted} attempted, ${s.won} won`);
    tr.innerHTML = `
      <td>${label}</td>
      <td>${s.attempted}</td>
      <td>${s.won}</td>
    `;
    tbody.appendChild(tr);
  }
}
