/**
 * @fileoverview Global keyboard shortcut handler.
 *
 * Handles: digits 1–9, Backspace/Delete, arrow keys, P (pen/pencil toggle),
 * Escape (close dialogs). All dispatched via GameState.
 */

import { close as closeDialog } from './dialog.js';

/**
 * @param {HTMLElement} root - Unused; here for API consistency with other
 *   UI modules that use the root element.
 * @param {{ dispatch: function, getState: function }} gameState
 */
export function mount(root, gameState) {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName ?? '';
    const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);

    if (e.key === 'Escape') {
      closeDialog();
      return;
    }

    // P toggles pen/pencil only when focus is not on a form control or button.
    if ((e.key === 'p' || e.key === 'P') && !inInput && tag !== 'BUTTON') {
      e.preventDefault();
      gameState.dispatch({ type: 'TOGGLE_MODE' });
      return;
    }

    // Digit keys 1–9.
    if (e.key >= '1' && e.key <= '9') {
      const state = gameState.getState();
      if (state.selected === null) return;
      e.preventDefault();
      const digit = parseInt(e.key, 10);
      if (state.activeMode === 'pen') {
        gameState.dispatch({ type: 'PEN_ENTER', digit });
      } else {
        gameState.dispatch({ type: 'PENCIL_TOGGLE', digit });
      }
      return;
    }

    // Erase.
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const state = gameState.getState();
      if (state.selected === null) return;
      e.preventDefault();
      gameState.dispatch({ type: 'ERASE' });
      return;
    }

    // Arrow navigation.
    const arrowDir = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }[e.key];

    if (arrowDir) {
      // Only intercept when focus is in the grid or there is a selected cell.
      const grid = document.getElementById('grid-root')?.querySelector('.sudoku-grid');
      if (grid && (grid.contains(document.activeElement) || gameState.getState().selected !== null)) {
        e.preventDefault();
        gameState.dispatch({ type: 'ARROW_NAV', direction: arrowDir });
      }
    }
  });
}
