/**
 * @fileoverview Coach Mode UI module.
 *
 * Owns the Coach button (#btn-coach), explanation panel (#coach-panel-wrap),
 * recap/error toast (#coach-recap), and the hidden description span
 * (#sr-coached-desc). Coordinates session lifecycle via dispatch and live-region
 * announcements.
 *
 * This is one of two UI modules with cross-root DOM access by design (see
 * aspec-coach-ui.md §6.1). It must not be replicated as a pattern for new modules.
 */

import { announce } from './srLive.js';
import { analyze } from '../coach/analyzer.js';
import { deriveCoachedCells } from '../game/state.js';
import { rowOf, colOf } from '../util/grid.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _gameState = null;
let _btn = null;          // #btn-coach
let _panelWrap = null;    // #coach-panel-wrap
let _recap = null;        // #coach-recap

let _recapTimer = null;   // setTimeout handle for 2.5s recap auto-dismiss
let _errorTimer = null;   // setTimeout handle for 3s error toast auto-dismiss

let _prevSelected = null; // last seen state.selected for focus tracking
let _renderedStep = null; // last step reference passed to _renderPanelContent

// Set when an 'error' recap fires; enables context-aware error toast on the next press.
let _lastSessionHadErrorRecap = false;

const RELEVANT_KEYS = new Set(['coachSession', 'selected', 'puzzle', 'won']);

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the coach UI. `root` is `document.body` or any ancestor that contains
 * all coach-related DOM. The module queries its elements by ID.
 *
 * @param {HTMLElement} root
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _gameState = gameState;
  _btn = document.getElementById('btn-coach');
  _panelWrap = document.getElementById('coach-panel-wrap');
  _recap = document.getElementById('coach-recap');

  _wireButton();

  gameState.on('changed', ({ changed }) => {
    if (changed.has('puzzle')) _lastSessionHadErrorRecap = false;
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _render(gameState.getState());
    }
  });

  _render(gameState.getState());
}

// ---------------------------------------------------------------------------
// Button wiring
// ---------------------------------------------------------------------------

function _wireButton() {
  // mousedown preventDefault is applied by numpad.js's button loop (§10.2).
  _btn.addEventListener('click', _onCoachPressed);
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName ?? '';
    if ((e.key === 'c' || e.key === 'C') &&
        !['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
      e.preventDefault();
      _onCoachPressed();
    }
  });
}

function _onCoachPressed() {
  const state = _gameState.getState();
  if (!state.puzzle || state.won) return;

  // If a session is active, end it first (clean event ordering).
  if (state.coachSession !== null) {
    _gameState.dispatch({ type: 'COACH_END', reason: 'session-reset' });
  }

  // If an error toast is showing, clear it.
  if (_errorTimer !== null) {
    clearTimeout(_errorTimer);
    _errorTimer = null;
    _hideRecap();
  }

  const result = analyze(
    state.puzzle,
    { pen: state.pen, conflicts: state.conflicts, pencil: state.pencil }
  );

  if (result.type === 'no-technique') {
    _gameState.dispatch({ type: 'COACH_NO_TECHNIQUE', reason: result.reason });
    _showErrorToast(result.reason);
    return;
  }

  _lastSessionHadErrorRecap = false;
  _gameState.dispatch({ type: 'COACH_START', result });

  // Announce after dispatch so we can read the derived coachedCells count.
  const n = deriveCoachedCells(result).size;
  announce(`Coach: ${result.technique} identified. ${n} cells highlighted.`);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function _render(state) {
  _renderButton(state);
  _renderPanel(state);
  _renderRecap(state);
  _trackFocus(state);
}

function _renderButton(state) {
  if (!_btn) return;
  const active = state.coachSession !== null && state.coachSession.recap === null;
  _btn.disabled = !state.puzzle || state.won;

  if (active) {
    _btn.classList.add('coaching');
    _btn.setAttribute('aria-label', 'Coach (active)');
  } else {
    _btn.classList.remove('coaching');
    _btn.setAttribute('aria-label', 'Coach');
  }
}

function _renderPanel(state) {
  const session = state.coachSession;
  const focused = session && session.focusedCoachedCell !== null;

  if (focused) {
    _renderPanelContent(session.step);
    _panelWrap.classList.add('open');
    _panelWrap.dispatchEvent(new CustomEvent('coach:panel-opened', {
      bubbles: true,
      detail: { step: session.step },
    }));
  } else {
    _panelWrap.classList.remove('open');
    _panelWrap.dispatchEvent(new CustomEvent('coach:panel-closed', { bubbles: true }));
  }
}

function _renderPanelContent(step) {
  if (step === _renderedStep) return;  // same session step — already rendered
  _renderedStep = step;

  const panel = document.createElement('div');
  panel.className = 'coach-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Coach explanation');

  const techEl = document.createElement('div');
  techEl.className = 'coach-panel-technique';
  techEl.textContent = step.technique;
  panel.appendChild(techEl);

  const textEl = document.createElement('p');
  textEl.className = 'coach-panel-text';
  textEl.appendChild(_renderSupportingText(step.supportingText));
  panel.appendChild(textEl);

  if (step.complexity.acknowledged && step.complexity.note) {
    const noteEl = document.createElement('p');
    noteEl.className = 'coach-panel-text coach-panel-note';
    noteEl.textContent = step.complexity.note;
    panel.appendChild(noteEl);
  }

  _panelWrap.innerHTML = '';
  _panelWrap.appendChild(panel);
}

/**
 * Convert `*single-asterisk*` runs to `<em>` elements.
 * Even-indexed segments are plain text; odd-indexed are emphasis.
 *
 * @param {string} text
 * @returns {DocumentFragment}
 */
function _renderSupportingText(text) {
  const parts = text.split('*');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      frag.appendChild(document.createTextNode(parts[i]));
    } else {
      const em = document.createElement('em');
      em.textContent = parts[i];
      frag.appendChild(em);
    }
  }
  return frag;
}

function _renderRecap(state) {
  const session = state.coachSession;

  // Reducer-driven recap (placement fill outcome).
  if (session && session.recap !== null) {
    const variant = session.recap;
    _showRecap(session.step, variant);
    if (_recapTimer === null) {
      _recapTimer = setTimeout(() => {
        _recapTimer = null;
        _gameState.dispatch({ type: 'COACH_END', reason: 'recap-timeout' });
      }, 2500);
    }
    return;
  }

  // No reducer recap — ensure recap element is hidden unless error toast is active.
  if (_recapTimer !== null) {
    clearTimeout(_recapTimer);
    _recapTimer = null;
  }
  if (_errorTimer === null) {
    _hideRecap();
  }
}

// ---------------------------------------------------------------------------
// Toast / recap display
// ---------------------------------------------------------------------------

/**
 * Show the no-technique error toast.
 *
 * @param {'complete'|'inconsistent'|'error'} reason
 */
function _showErrorToast(reason) {
  const useContextMessage = reason === 'error' && _lastSessionHadErrorRecap;
  _lastSessionHadErrorRecap = false;

  const text = reason === 'complete'
    ? 'The puzzle is already solved.'
    : useContextMessage
      ? 'That suggestion didn\'t work out. A mistaken pencil erasure elsewhere on the board may have led the coach astray. Try using Erase All Pencil and asking the coach again.'
      : reason === 'error'
        ? 'The board has an error. Use Check or Erase to fix it before coaching.'
        : 'The board has a contradiction. Use Erase to fix it.';

  _recap.classList.add('error', 'visible');
  _recap.innerHTML = `
    <div class="coach-recap-line1">${text}</div>
    <div class="coach-recap-line2"></div>
  `;
  announce(`Coach: ${text}`);

  _errorTimer = setTimeout(() => {
    _errorTimer = null;
    _hideRecap();
  }, 5000);
}

/**
 * Show placement-fill or elimination-completion recap toast.
 *
 * @param {object} step - CoachStep
 * @param {'normal'|'error'|'elim'} variant
 */
function _showRecap(step, variant) {
  _recap.classList.add('visible');
  _recap.classList.toggle('error', variant === 'error');

  if (variant === 'error') _lastSessionHadErrorRecap = true;

  if (variant === 'elim') {
    const detail = _composeElimRecapDetail(step);
    _recap.innerHTML = `
      <div class="coach-recap-line1">Candidates eliminated.</div>
      <div class="coach-recap-line2">${detail}</div>
    `;
    announce(`Candidates eliminated. ${detail}`);
    return;
  }

  const techName = step.technique;
  const detailSentence = _composeRecapDetail(step);

  if (variant === 'normal') {
    _recap.innerHTML = `
      <div class="coach-recap-line1">You used ${techName}.</div>
      <div class="coach-recap-line2">${detailSentence}</div>
    `;
    announce(`You used ${techName}. ${detailSentence}`);
  } else {
    _recap.innerHTML = `
      <div class="coach-recap-line1">That's not the right digit — the ${techName} suggestion still stands.</div>
      <div class="coach-recap-line2">Press Coach to try again.</div>
    `;
    announce(`That's not the right digit — ${techName} suggestion still stands. Press Coach to try again.`);
  }
}

function _hideRecap() {
  _recap.classList.remove('visible', 'error');
  _recap.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Recap detail sentence composition
// ---------------------------------------------------------------------------

/**
 * Compose the detail sentence for the elimination recap (line 2).
 *
 * @param {object} step - CoachStep (elimination technique)
 * @returns {string}
 */
function _composeElimRecapDetail(step) {
  const D = step.digits[0];
  const n = step.roles.elimTarget.length > 0
    ? step.roles.elimTarget.length
    : new Set(step.eliminations.map(e => e.cellIndex)).size;
  const unitLabel = step.unit ? _formatUnitLabel(step.unit) : 'the grid';
  return `${step.technique} in ${unitLabel}: digit ${D} removed from ${n} cell${n === 1 ? '' : 's'}.`;
}

/**
 * Compose the detail sentence for the placement recap (line 2).
 *
 * @param {object} step - CoachStep
 * @returns {string}
 */
function _composeRecapDetail(step) {
  const D = step.digits[0];
  if (step.technique === 'Naked Single') {
    const r = rowOf(step.roles.target) + 1;
    const c = colOf(step.roles.target) + 1;
    return `Naked Single in row ${r}, column ${c}: only ${D} could go here.`;
  }
  if (step.technique === 'Hidden Single') {
    const u = step.unit;
    const label = _formatUnitLabel(u);
    return `Hidden Single in ${label}: ${D} was the only position for that digit.`;
  }
  // Elimination techniques never produce a recap (§4.1).
  return '';
}

/**
 * @param {{ type: 'row'|'col'|'box', index: number }} u
 * @returns {string}
 */
function _formatUnitLabel(u) {
  if (u.type === 'row') return `row ${u.index + 1}`;
  if (u.type === 'col') return `column ${u.index + 1}`;
  return `box ${u.index + 1}`;
}

// ---------------------------------------------------------------------------
// Focus tracking
// ---------------------------------------------------------------------------

/**
 * Dispatch COACH_FOCUS_COACHED_CELL / COACH_FOCUS_OFF when focus moves
 * to/from a coached cell.
 *
 * @param {object} state - GameState
 */
function _trackFocus(state) {
  const session = state.coachSession;
  if (!session) {
    _prevSelected = state.selected;
    return;
  }

  const sel = state.selected;
  const isCoached = sel !== null && session.coachedCells.has(sel);
  const wasCoached = session.focusedCoachedCell !== null;

  if (isCoached && session.focusedCoachedCell !== sel) {
    _gameState.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: sel });
    // Announce after dispatch.
    const text = _stripEmphasis(session.step.supportingText);
    let msg = `Coached cell. ${session.step.technique}. ${text}.`;
    if (session.step.complexity.acknowledged && session.step.complexity.note) {
      msg += ` ${session.step.complexity.note}`;
    }
    announce(msg);
  } else if (!isCoached && wasCoached) {
    _gameState.dispatch({ type: 'COACH_FOCUS_OFF' });
  }

  _prevSelected = sel;
}

/**
 * Strip `*…*` emphasis markers from text for plain-text announcements.
 *
 * @param {string} text
 * @returns {string}
 */
function _stripEmphasis(text) {
  return text.replace(/\*/g, '');
}
