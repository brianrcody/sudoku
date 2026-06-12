/**
 * @fileoverview Busy UI — generation progress card (fspec-003 §5.2–§5.3).
 *
 * Renders the "Generating puzzle…" card inside `#busy-root` while
 * `state.generating` is true. For the Diabolical and Nightmare tiers, once the
 * wait passes PROGRESS_DELAY_MS the card additionally shows a live progress
 * line and a Cancel button. Cancel is delegated to the `onCancel` callback
 * wired by main.js. Screen-reader announcements are throttled.
 */

import { announce } from './srLive.js';
import { TIER_LABELS } from '../config.js';

const PROGRESS_DELAY_MS = 3000;
const SR_THROTTLE_MS = 10000;

/** Tiers that get the progress line + Cancel treatment. */
const PROGRESS_TIERS = new Set(['diabolical', 'nightmare']);

const RELEVANT_KEYS = new Set(['generating', 'generatingMessage', 'generatingDifficulty', 'genProgress']);

let _root = null;
let _gameState = null;
let _onCancel = null;
let _delayTimer = null;
let _delayElapsed = false;
let _lastAnnounceMs = 0;

/**
 * @param {HTMLElement} root - The `#busy-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 * @param {{ onCancel: function }} hooks
 */
export function mount(root, gameState, { onCancel }) {
  _root = root;
  _gameState = gameState;
  _onCancel = onCancel;

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _update(gameState.getState());
    }
  });

  _update(gameState.getState());
}

function _update(state) {
  if (!state.generating) {
    if (_delayTimer !== null) { clearTimeout(_delayTimer); _delayTimer = null; }
    _delayElapsed = false;
    _root.innerHTML = '';
    _root.hidden = true;
    return;
  }

  const tier = state.generatingDifficulty;
  const showProgressUi = tier !== null && PROGRESS_TIERS.has(tier);

  if (_root.hidden) {
    // Card is appearing: render the skeleton and arm the delay timer.
    _root.hidden = false;
    _root.innerHTML = `
      <div class="busy-card" role="status">
        <div class="busy-spinner" aria-hidden="true"></div>
        <div class="busy-title"></div>
        <div class="busy-progress" hidden></div>
        <button type="button" class="btn busy-cancel" aria-label="Cancel puzzle search" hidden>Cancel</button>
      </div>
    `;
    _root.querySelector('.busy-cancel').addEventListener('click', () => _onCancel());

    _delayElapsed = false;
    if (showProgressUi) {
      _delayTimer = setTimeout(() => {
        _delayTimer = null;
        _delayElapsed = true;
        _update(_gameState.getState());
      }, PROGRESS_DELAY_MS);
    }
  }

  _root.querySelector('.busy-title').textContent = state.generatingMessage || 'Generating puzzle…';

  const progressEl = _root.querySelector('.busy-progress');
  const cancelBtn = _root.querySelector('.busy-cancel');
  const showProgressNow = showProgressUi && _delayElapsed;

  // Move focus to Cancel when it first appears, but only if focus is still on
  // the control that triggered generation (fspec-003 §9.3).
  if (showProgressNow && cancelBtn.hidden &&
      document.activeElement && document.activeElement.id === 'btn-new') {
    cancelBtn.hidden = false;
    cancelBtn.focus();
  }

  progressEl.hidden = !showProgressNow;
  cancelBtn.hidden = !showProgressNow;

  if (showProgressNow) {
    const p = state.genProgress;
    progressEl.textContent = p
      ? `Searching for a worthy puzzle… (attempt ${p.attempts} of ${p.budget})`
      : 'Searching for a worthy puzzle…';

    const now = Date.now();
    if (now - _lastAnnounceMs >= SR_THROTTLE_MS) {
      _lastAnnounceMs = now;
      announce(`Still searching for a ${TIER_LABELS[tier]} puzzle.`);
    }
  }
}
