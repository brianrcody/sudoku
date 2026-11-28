/**
 * @fileoverview Focus policy for the end of a foreground puzzle request
 * (fspec-008 §3.4, §8.1).
 *
 * DOM-only: it reads `document.activeElement` when the request's outcome is
 * reported and moves focus to the control the request came from, or to the
 * grid on a New Puzzle load. A player who moved focus elsewhere while the
 * puzzle was generating keeps it, except on a Difficulty-path load, which
 * always focuses the selector (fspec-001 §9.3).
 */

/**
 * Builds the focus policy for the end of a foreground puzzle request.
 *
 * @param {object} targets
 * @param {function(): (HTMLElement|null)} targets.newPuzzle - `#btn-new`.
 * @param {function(): (HTMLElement|null)} targets.difficulty - `#difficulty-select`.
 * @param {function(): (HTMLElement|null)} targets.grid - `.sudoku-grid`.
 * @param {Document} [targets.doc=document]
 * @returns {function('new-puzzle'|'difficulty', {status: string}): void}
 *   Call with the request's origin and its `onOutcome` value.
 */
export function createRequestFocus({ newPuzzle, difficulty, grid, doc = document }) {
  return (origin, { status }) => {
    const active = doc.activeElement;
    const nowhere = active === null || active === doc.body;
    const onCancel = !nowhere && active.classList.contains('busy-cancel');
    const onNewPuzzle = !nowhere && active === newPuzzle();

    let target = null;
    if (origin === 'new-puzzle') {
      if (status === 'loaded') {
        if (onNewPuzzle || onCancel || nowhere) target = grid();
      } else if (status === 'cancelled') {
        target = newPuzzle();
      } else if (status === 'fallback-declined') {
        if (onNewPuzzle || nowhere) target = newPuzzle();
      } else if (status === 'failed') {
        if (onCancel || nowhere) target = newPuzzle();
      }
    } else if (status === 'loaded') {
      target = difficulty();
    } else if (status === 'cancelled' || status === 'fallback-declined' || status === 'failed') {
      if (onCancel || nowhere) target = difficulty();
    }

    target?.focus();
  };
}
