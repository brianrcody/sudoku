/**
 * @fileoverview Developer tools panel (fspec-005). Imported lazily by main.js
 * only when developer mode is on; with the mode off this file, inspect.js, and
 * dev.css are never requested.
 *
 * Builds all of its own DOM: the DEV badge, the panel, and its stylesheet
 * link. Load-from-string goes through the shared loader injected by main.js.
 * The step inspector is the only tool that dispatches: it moves the board
 * cursor to a selected step's cell, and sets the board to a chosen step with
 * DEV_SET_BOARD. Grid drawing (step highlights and the candidate overlay) goes
 * through the grid's cell-decorator hook.
 */

import { announce } from '../ui/srLive.js';
import { setCellDecorator, refresh as refreshGrid } from '../ui/grid.js';
import { copyText } from '../util/clipboard.js';
import { rate } from '../generator/rater.js';
import {
  runInspector, summarize, boardAtStep, candidateDiff, overlayLabel, describeGeneration,
} from './inspect.js';

const STYLESHEET_URL = new URL('../../css/dev.css', import.meta.url);

const STALE_MESSAGE = 'Board changed — run the solver again.';
const NO_SESSION = 'No active coach session.';

/** Highlight roles in precedence order, with their class and label suffix. */
const HIGHLIGHT_ROLES = [
  ['place', 'dev-hl-place', 'placement'],
  ['elim', 'dev-hl-elim', 'elimination'],
  ['pattern', 'dev-hl-pattern', 'pattern'],
];

let _gameState = null;
let _panel = null;

let _overlayOn = false;
/** @type {ReturnType<typeof runInspector>|null} */
let _inspection = null;
/** @type {number|null} Index into `_inspection.steps`. */
let _selectedStep = null;
/** @type {Uint8Array|null} The board `_inspection` was run on. */
let _base = null;
/** @type {number|null} The step the board is currently set to, if any. */
let _appliedStep = null;

/**
 * Mount the developer tools.
 *
 * @param {object} deps
 * @param {{ getState: function, on: function, dispatch: function }} deps.gameState
 * @param {function(string): Promise<{status: string, message: string}>} deps.loadPuzzle
 *   The shared puzzle loader, bound to the `string` source.
 * @param {function(string): Promise<boolean>} [deps.copy]
 */
export function mount({ gameState, loadPuzzle, copy = copyText }) {
  _gameState = gameState;
  _overlayOn = false;
  _inspection = null;
  _selectedStep = null;
  _base = null;
  _appliedStep = null;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = 'dev-stylesheet';
  link.href = STYLESHEET_URL.href;
  document.head.appendChild(link);

  const badge = document.createElement('a');
  badge.id = 'dev-badge';
  badge.className = 'dev-badge';
  badge.href = '#dev-root';
  badge.textContent = 'DEV';
  badge.setAttribute('aria-label', 'Developer mode on — skip to developer tools');
  document.body.appendChild(badge);

  _panel = document.createElement('section');
  _panel.id = 'dev-root';
  _panel.className = 'dev-panel';
  _panel.tabIndex = -1;
  _panel.setAttribute('aria-labelledby', 'dev-title');
  _panel.innerHTML = `
    <h2 id="dev-title">Developer tools</h2>
    <p class="dev-note">Statistics are not recorded while developer mode is on.
      Load the app with ?dev=0 to turn it off.</p>

    <details class="dev-tool" id="dev-load">
      <summary>Load puzzle from string</summary>
      <div class="dev-tool-body">
        <label for="dev-load-input">Puzzle string — 81 cells, 0 or . for empty</label>
        <textarea id="dev-load-input" rows="3" spellcheck="false" autocomplete="off"></textarea>
        <div class="dev-buttons">
          <button type="button" class="btn" id="dev-load-btn">Load</button>
        </div>
        <p class="dev-status" id="dev-load-status" role="status"></p>
      </div>
    </details>

    <details class="dev-tool" id="dev-inspector">
      <summary>Solver step inspector</summary>
      <div class="dev-tool-body">
        <div class="dev-buttons">
          <button type="button" class="btn" id="dev-inspect-run">Run solver</button>
          <button type="button" class="btn" id="dev-inspect-clear">Clear</button>
          <button type="button" class="btn" id="dev-inspect-restore" disabled>Restore board</button>
        </div>
        <p class="dev-note">Click a step, or use the arrow keys, to show it on the board.
          Double-click it, or press Enter or Space, to set the board to that step.</p>
        <p class="dev-status" id="dev-inspect-summary" role="status"></p>
        <p class="dev-status" id="dev-inspect-board"></p>
        <ol class="dev-steps" id="dev-inspect-list" aria-label="Solver steps" data-keep-selection></ol>
      </div>
    </details>

    <details class="dev-tool" id="dev-overlay">
      <summary>Candidate overlay</summary>
      <div class="dev-tool-body">
        <button type="button" class="dev-switch" id="dev-overlay-toggle" role="switch" aria-checked="false">
          <span class="dev-switch-track" aria-hidden="true"><span class="dev-switch-thumb"></span></span>
          <span>Show computed candidates</span>
        </button>
        <p class="dev-legend">
          <span class="dev-cand-agree">5</span> agrees with your marks ·
          <span class="dev-cand-missing">5</span> computed, not marked ·
          <span class="dev-cand-extra">5</span> marked, not a candidate
        </p>
      </div>
    </details>

    <details class="dev-tool" id="dev-coach">
      <summary>Coach step data</summary>
      <div class="dev-tool-body">
        <div class="dev-buttons">
          <button type="button" class="btn" id="dev-coach-copy">Copy JSON</button>
        </div>
        <p class="dev-status" id="dev-coach-status" role="status"></p>
        <pre class="dev-json" id="dev-coach-json" tabindex="0" role="region" aria-label="Coach step JSON"></pre>
      </div>
    </details>

    <details class="dev-tool" id="dev-gen">
      <summary>Generation diagnostics</summary>
      <div class="dev-tool-body" id="dev-gen-body"></div>
    </details>
  `;
  const main = document.querySelector('main');
  main.classList.add('dev-host');
  main.appendChild(_panel);

  // The badge is an in-page link; make the jump land keyboard focus too.
  badge.addEventListener('click', () => _panel.focus());

  _wireLoad(loadPuzzle);
  _wireInspector();
  _wireOverlay();
  _wireCoach(copy);

  gameState.on('changed', ({ action, changed }) => {
    // The inspector's own board writes do not make its results stale.
    const ownWrite = action.type === 'DEV_SET_BOARD';
    if (_inspection !== null && !ownWrite && (changed.has('pen') || changed.has('puzzle'))) {
      _clearInspection(STALE_MESSAGE);
    }
    if (changed.has('coachSession')) _renderCoach();
    if (changed.has('puzzle')) _renderGeneration();
  });

  _renderCoach();
  _renderGeneration();
  setCellDecorator(_decorate);
}

const _el = id => _panel.querySelector(`#${id}`);

// ---------------------------------------------------------------------------
// Load puzzle from string
// ---------------------------------------------------------------------------

function _wireLoad(loadPuzzle) {
  const status = _el('dev-load-status');
  _el('dev-load-btn').addEventListener('click', async () => {
    status.classList.remove('dev-error');
    status.textContent = 'Checking puzzle…';
    const outcome = await loadPuzzle(_el('dev-load-input').value);
    status.classList.toggle('dev-error', outcome.status === 'rejected');
    status.textContent = outcome.message;
    announce(outcome.message);
  });
}

// ---------------------------------------------------------------------------
// Solver step inspector
// ---------------------------------------------------------------------------

function _wireInspector() {
  const list = _el('dev-inspect-list');

  _el('dev-inspect-run').addEventListener('click', () => {
    _base = _gameState.getState().pen.slice();
    _inspection = runInspector(_base);
    _selectedStep = null;
    _appliedStep = null;
    _renderSteps();
    _setBoardStatus('');
    const summary = summarize(_inspection);
    _el('dev-inspect-summary').textContent = summary;
    announce(summary);
    refreshGrid();
  });

  _el('dev-inspect-clear').addEventListener('click', () => _clearInspection(''));

  _el('dev-inspect-restore').addEventListener('click', () => {
    _appliedStep = null;
    _gameState.dispatch({ type: 'DEV_SET_BOARD', pen: _base.slice() });
    _markSteps();
    _setBoardStatus('Board restored to where the solver started.');
  });

  const stepOf = e => {
    const button = e.target.closest('button[data-step]');
    return button ? Number(button.dataset.step) : null;
  };

  list.addEventListener('click', (e) => {
    const index = stepOf(e);
    if (index !== null) _selectStep(index);
  });

  list.addEventListener('dblclick', (e) => {
    const index = stepOf(e);
    if (index !== null) _applyStep(index);
  });

  // Keys are handled here and stopped, so the global handler does not also
  // move the board cursor (arrows, Home) underneath the list.
  list.addEventListener('keydown', (e) => {
    const index = stepOf(e);
    if (index === null) return;
    const last = _inspection.steps.length - 1;
    const target = {
      ArrowDown: Math.min(index + 1, last),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: last,
    }[e.key];

    if (target !== undefined) {
      list.querySelector(`button[data-step="${target}"]`).focus();
      _selectStep(target);
    } else if (e.key === 'Enter' || e.key === ' ') {
      _selectStep(index);
      _applyStep(index);
    } else if (e.key === 'Escape') {
      _selectedStep = null;
      _markSteps();
      refreshGrid();
      return;   // let Escape reach the global handler too
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  });
}

/**
 * Select a step: highlight its cells, move the board cursor to the cell it
 * acts on, and announce it. Click and keyboard navigation both come here.
 */
function _selectStep(index) {
  const step = _inspection.steps[index];
  _selectedStep = index;
  _markSteps();
  refreshGrid();
  _gameState.dispatch({
    type: 'SELECT_CELL',
    index: step.placement ? step.placement.cellIndex : step.cells.elim[0],
  });

  const k = step.cells.place.length + step.cells.elim.length + step.cells.pattern.length;
  announce(`Step ${index + 1}: ${step.text}. ${k} cell${k === 1 ? '' : 's'} highlighted.`);
}

/**
 * Set the board to the solver's position after step `index`: the board the
 * solver started from plus every digit placed up to and including that step.
 * Works in both directions, so an earlier step undoes later ones.
 */
function _applyStep(index) {
  _appliedStep = index;
  _gameState.dispatch({
    type: 'DEV_SET_BOARD',
    pen: boardAtStep(_base, _inspection.steps, index),
  });
  _markSteps();
  _setBoardStatus(`Board set to step ${index + 1} of ${_inspection.steps.length}.`);
}

function _setBoardStatus(message) {
  _el('dev-inspect-board').textContent = message;
  _el('dev-inspect-restore').disabled = _appliedStep === null;
  if (message) announce(message);
}

/** Sync each step button with the selected and applied steps. */
function _markSteps() {
  for (const button of _el('dev-inspect-list').querySelectorAll('button')) {
    const index = Number(button.dataset.step);
    button.setAttribute('aria-pressed', String(index === _selectedStep));
    button.toggleAttribute('data-applied', _appliedStep !== null && index <= _appliedStep);
    if (index === _appliedStep) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
}

function _renderSteps() {
  const list = _el('dev-inspect-list');
  list.innerHTML = '';
  for (const step of _inspection.steps) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.step = step.index;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = step.text;
    li.appendChild(button);
    list.appendChild(li);
  }
}

function _clearInspection(message) {
  _inspection = null;
  _selectedStep = null;
  _base = null;
  _appliedStep = null;
  _el('dev-inspect-list').innerHTML = '';
  _el('dev-inspect-summary').textContent = message;
  _setBoardStatus('');
  refreshGrid();
}

// ---------------------------------------------------------------------------
// Candidate overlay
// ---------------------------------------------------------------------------

function _wireOverlay() {
  const toggle = _el('dev-overlay-toggle');
  toggle.addEventListener('click', () => {
    _overlayOn = !_overlayOn;
    toggle.setAttribute('aria-checked', String(_overlayOn));
    announce(`Candidate overlay ${_overlayOn ? 'on' : 'off'}.`);
    refreshGrid();
  });
}

// ---------------------------------------------------------------------------
// Grid decorator — step highlight and candidate overlay
// ---------------------------------------------------------------------------

// The diff for all 81 cells is computed once per render pass. Every grid
// render — including the one forced when the overlay is switched on — calls
// the decorator for cells 0…80 in order, so cell 0 marks the start of a pass.
let _diff = null;

/**
 * Cell-decorator hook (see ui/grid.js setCellDecorator). Runs after the grid
 * has rebuilt the cell, so it only ever adds to a clean slate.
 *
 * @param {HTMLElement} el
 * @param {number} i
 * @param {object} state - GameState
 */
function _decorate(el, i, state) {
  if (_overlayOn && i === 0) _diff = candidateDiff(state.pen, state.pencil);

  if (_overlayOn && state.pen[i] === 0) {
    _renderOverlayCell(el, i, _diff[i], state.selected === i);
  }

  if (_selectedStep !== null) {
    const cells = _inspection.steps[_selectedStep].cells;
    const role = HIGHLIGHT_ROLES.find(([key]) => cells[key].includes(i));
    if (role) {
      el.classList.add(role[1]);
      el.setAttribute('aria-label', `${el.getAttribute('aria-label')} — solver step: ${role[2]}`);
    }
  }
}

function _renderOverlayCell(el, i, diff, isSelected) {
  const marks = document.createElement('div');
  marks.className = 'pencil-marks';
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    const span = document.createElement('span');
    span.className = 'pencil-mark ' + (
      diff.agree & bit ? 'dev-cand-agree'
        : diff.missing & bit ? 'dev-cand-missing'
          : diff.extra & bit ? 'dev-cand-extra'
            : 'empty');
    span.textContent = d;
    marks.appendChild(span);
  }
  el.innerHTML = '';
  el.appendChild(marks);
  el.setAttribute('aria-label', overlayLabel(i, diff) + (isSelected ? ' (selected)' : ''));
}

// ---------------------------------------------------------------------------
// Coach step data
// ---------------------------------------------------------------------------

function _wireCoach(copy) {
  _el('dev-coach-copy').addEventListener('click', async () => {
    const ok = await copy(_el('dev-coach-json').textContent);
    const message = ok ? 'Copied.' : 'Couldn\'t copy — select the text and copy it manually.';
    const status = _el('dev-coach-status');
    status.classList.toggle('dev-error', !ok);
    status.textContent = message;
    announce(message);
  });
}

function _renderCoach() {
  const session = _gameState.getState().coachSession;
  _el('dev-coach-json').textContent = session
    ? JSON.stringify(session.step, null, 2)
    : NO_SESSION;
  _el('dev-coach-copy').disabled = !session;
  _el('dev-coach-status').textContent = '';
  _el('dev-coach-status').classList.remove('dev-error');
}

// ---------------------------------------------------------------------------
// Generation diagnostics
// ---------------------------------------------------------------------------

function _renderGeneration() {
  const body = _el('dev-gen-body');
  const info = describeGeneration(_gameState.getState().puzzle, givens => rate(givens).trace);
  body.innerHTML = '';

  if (info.message) {
    const p = document.createElement('p');
    p.className = 'dev-status';
    p.textContent = info.message;
    body.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'dev-table';
  for (const [label, value] of info.rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(th, td);
    table.appendChild(tr);
  }
  body.appendChild(table);
}
