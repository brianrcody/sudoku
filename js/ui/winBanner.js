/**
 * @fileoverview Win banner overlay.
 *
 * Owns the `#win-banner-root` subtree. Renders an overlay over the grid when
 * `state.won` becomes true, with a "Puzzle Complete!" message. On show, moves
 * focus to the New Puzzle button per aspec §14.
 */

import { announce } from './srLive.js';

const RELEVANT_KEYS = new Set(['won']);

let _root = null;
let _gameState = null;

/**
 * @param {HTMLElement} root - The `#win-banner-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _root = root;
  _gameState = gameState;

  _root.innerHTML = `
    <div class="win-banner" id="win-banner" aria-hidden="true">
      <div class="win-title">Puzzle Complete!</div>
      <div class="win-sub">Well done.</div>
    </div>
  `;

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _render(gameState.getState());
    }
  });

  _render(gameState.getState());
}

function _render(state) {
  const banner = _root.querySelector('#win-banner');
  if (!banner) return;

  if (state.won) {
    banner.classList.add('show');
    banner.removeAttribute('aria-hidden');
    announce('Puzzle complete! Well done.');
    // Move focus to New Puzzle button so keyboard users can continue.
    requestAnimationFrame(() => {
      const newBtn = document.getElementById('btn-new');
      newBtn?.focus();
    });
  } else {
    banner.classList.remove('show');
    banner.setAttribute('aria-hidden', 'true');
  }
}
