/**
 * @fileoverview Sudoku grid renderer and cell event handler.
 *
 * Owns the `#grid-root` subtree. Renders all 81 cells and drives updates from
 * state `'changed'` events.
 */

import { rowOf, colOf } from '../util/grid.js';
import { iterate } from '../util/bitset.js';

const RELEVANT_KEYS = new Set([
  'puzzle', 'pen', 'pencil', 'selected', 'conflicts', 'incorrect', 'won',
  'coachSession',
]);

let _root = null;
let _gameState = null;
let _gridEl = null;

/**
 * @param {HTMLElement} root - The `#grid-root` element.
 * @param {{ dispatch: function, getState: function, on: function }} gameState
 */
export function mount(root, gameState) {
  _root = root;
  _gameState = gameState;

  _gridEl = root.querySelector('.sudoku-grid');

  gameState.on('changed', ({ changed }) => {
    if ([...changed].some(k => RELEVANT_KEYS.has(k))) {
      _render(gameState.getState());
    }
  });

  _render(gameState.getState());
}

function _render(state) {
  if (!_gridEl) return;

  const existing = _gridEl.querySelectorAll('.cell');

  if (existing.length !== 81) {
    _buildGrid(state);
    return;
  }

  // Incremental update.
  for (let i = 0; i < 81; i++) {
    _updateCell(existing[i], i, state);
  }
}

function _buildGrid(state) {
  _gridEl.innerHTML = '';

  for (let i = 0; i < 81; i++) {
    const r = rowOf(i) + 1;
    const c = colOf(i) + 1;

    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.index = i;
    el.dataset.row = r;
    el.dataset.col = c;
    el.setAttribute('role', 'gridcell');
    el.setAttribute('tabindex', '0');

    el.addEventListener('click', () => _handleClick(i));
    el.addEventListener('focus', () => _gameState.dispatch({ type: 'SELECT_CELL', index: i }));
    el.addEventListener('keydown', (e) => _handleCellKeydown(e, i));

    _gridEl.appendChild(el);
    _updateCell(el, i, state);
  }

  // Deselect when clicking outside grid (but not when interacting with the
  // numpad — those clicks must preserve cell selection so successive taps apply
  // to the same cell).
  document.addEventListener('click', (e) => {
    if (
      !_gridEl.contains(e.target) &&
      !e.target.closest('#dialog-root') &&
      !e.target.closest('#numpad-root')
    ) {
      _gameState.dispatch({ type: 'DESELECT' });
    }
  });
}

function _updateCell(el, i, state) {
  const { puzzle, pen, pencil, selected, conflicts, incorrect, won, coachSession } = state;

  const isGiven = puzzle && puzzle.givens[i] !== 0;
  const penVal = pen[i];
  const isSelected = selected === i;
  const isConflict = conflicts.has(i);
  const isIncorrect = incorrect.has(i);

  // Class management.
  el.className = 'cell';
  if (isGiven) {
    el.classList.add('given');
    el.setAttribute('aria-readonly', 'true');
    el.removeAttribute('aria-selected');
  } else {
    el.removeAttribute('aria-readonly');
    el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  }

  if (!isGiven && penVal !== 0) el.classList.add('pen');
  if (isSelected) el.classList.add('selected');
  if (isConflict) el.classList.add('conflict');
  if (isIncorrect && !isConflict) el.classList.add('incorrect');
  if (won && !isGiven) el.style.pointerEvents = 'none';
  if (!won) el.style.pointerEvents = '';

  // Coached cell classes and aria-describedby.
  if (coachSession && coachSession.recap === null) {
    const roles = coachSession.step.roles;
    if (roles.target === i)              el.classList.add('coached-target');
    if (roles.cause.includes(i))         el.classList.add('coached-cause');
    if (roles.elimTarget.includes(i))    el.classList.add('coached-elim-target');
    if (roles.unitMember.includes(i))    el.classList.add('coached-unit-member');
    if (roles.scA.includes(i))           el.classList.add('coached-sc-a');
    if (roles.scB.includes(i))           el.classList.add('coached-sc-b');
  }

  const isCoached = coachSession?.coachedCells.has(i) === true;
  if (isCoached) {
    el.setAttribute('aria-describedby', 'sr-coached-desc');
  } else {
    el.removeAttribute('aria-describedby');
  }

  el.setAttribute('aria-label', _cellLabel(i, state));

  // Content.
  if (penVal !== 0) {
    el.textContent = penVal;
  } else if (pencil[i] !== 0) {
    _renderPencilMarks(el, i, state);
  } else {
    el.textContent = '';
  }
}

function _renderPencilMarks(el, cellIndex, state) {
  const bitset = state.pencil[cellIndex];
  const marks = new Set(iterate(bitset));
  const revealedBits = state.coachSession?.coachRevealedBits[cellIndex] ?? 0;

  const frag = document.createElement('div');
  frag.className = 'pencil-marks';
  for (let d = 1; d <= 9; d++) {
    const span = document.createElement('span');
    const isSet = marks.has(d);
    const isRevealed = isSet && (revealedBits & (1 << (d - 1))) !== 0;
    if (!isSet) {
      span.className = 'pencil-mark empty';
    } else if (isRevealed) {
      span.className = 'pencil-mark coach-reveal';
    } else {
      span.className = 'pencil-mark';
    }
    span.textContent = d;
    frag.appendChild(span);
  }
  el.innerHTML = '';
  el.appendChild(frag);
}

function _cellLabel(i, state) {
  const r = rowOf(i) + 1;
  const c = colOf(i) + 1;
  const { puzzle, pen, pencil, selected, conflicts, incorrect, coachSession } = state;
  const isGiven = puzzle && puzzle.givens[i] !== 0;
  const penVal = pen[i];

  let label = `Row ${r}, column ${c}`;
  if (isGiven) {
    label += `: ${penVal} (given)`;
  } else if (penVal !== 0) {
    label += `: ${penVal}`;
    if (conflicts.has(i)) label += ' — conflict';
    else if (incorrect.has(i)) label += ' — incorrect';
  } else if (pencil[i] !== 0) {
    const revealed = coachSession?.coachRevealedBits[i] ?? 0;
    const userBits = pencil[i] & ~revealed;
    const coachBits = pencil[i] & revealed;
    const userMarks = iterate(userBits);
    const coachMarks = iterate(coachBits);
    if (coachMarks.length > 0 && userMarks.length > 0) {
      label += `: Coach candidates: ${coachMarks.join(', ')}. Your marks: ${userMarks.join(', ')}.`;
    } else if (coachMarks.length > 0) {
      label += `: Coach candidates: ${coachMarks.join(', ')}.`;
    } else {
      label += `: pencil marks ${userMarks.join(', ')}`;
    }
  } else {
    label += ': empty';
  }
  if (selected === i) label += ' (selected)';
  return label;
}

function _handleClick(i) {
  const state = _gameState.getState();
  if (state.puzzle && state.puzzle.givens[i] !== 0) return;
  if (state.won) return;
  _gameState.dispatch({ type: 'SELECT_CELL', index: i });

  // Move DOM focus to the cell element.
  const el = _gridEl.querySelector(`.cell[data-index="${i}"]`);
  el?.focus();
}

function _handleCellKeydown(e, i) {
  // Arrow navigation is handled globally in keyboard.js, but we also handle
  // it here so focus visually follows selection within the grid.
  const arrowDir = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  }[e.key];

  if (arrowDir) {
    e.preventDefault();
    _gameState.dispatch({ type: 'ARROW_NAV', direction: arrowDir });
    // Sync DOM focus with new selection.
    requestAnimationFrame(() => {
      const sel = _gameState.getState().selected;
      if (sel !== null) {
        const next = _gridEl.querySelector(`.cell[data-index="${sel}"]`);
        next?.focus();
      }
    });
  }
}
