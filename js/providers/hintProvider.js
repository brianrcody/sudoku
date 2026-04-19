/**
 * @fileoverview SolverHintProvider — derives hints from the logical solver.
 *
 * Builds a working board from givens + non-conflicting pen entries, runs the
 * logical solver on that board, and returns the appropriate placement step.
 */

import { solveLogically } from '../solver/logical.js';

/**
 * @typedef {{ cellIndex: number, digit: number, technique: string }} HintResult
 */

/**
 * Returns a hint for the given puzzle and player state.
 *
 * When `targetCell` is provided, the hint always fills that specific cell with
 * the solution digit; the technique name is taken from the solver trace for
 * that cell, or falls back to `'solution-lookup'` if the solver trace does not
 * reach that cell with a placement step.
 *
 * When `targetCell` is absent, returns the first placement step from the
 * solver trace (forward-looking, for future coach/explanation mode).
 *
 * @param {object} puzzle
 * @param {Uint8Array} puzzle.givens
 * @param {Uint8Array} puzzle.solution
 * @param {object} playerState
 * @param {Uint8Array} playerState.pen
 * @param {Set<number>} playerState.conflicts
 * @param {object} [opts]
 * @param {number} [opts.targetCell]
 * @returns {HintResult|null}
 */
export function nextHint(puzzle, playerState, { targetCell } = {}) {
  // Build working board: givens + pen values that are not conflict-flagged.
  const board = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] !== 0) {
      board[i] = puzzle.givens[i];
    } else if (playerState.pen[i] !== 0 && !playerState.conflicts.has(i)) {
      board[i] = playerState.pen[i];
    }
  }

  const { trace } = solveLogically(board);

  if (targetCell !== undefined) {
    const digit = puzzle.solution[targetCell];
    // Scan the trace for the first placement step that places targetCell.
    const step = trace.find(s => s.cellIndex === targetCell && s.digit !== null);
    const technique = step ? step.technique : 'solution-lookup';
    return { cellIndex: targetCell, digit, technique };
  }

  // No target — return the first placement from the solver trace.
  const first = trace.find(s => s.digit !== null);
  if (first) {
    return { cellIndex: first.cellIndex, digit: first.digit, technique: first.technique };
  }

  // Fallback: find any unfilled cell and return solution value.
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0) {
      return { cellIndex: i, digit: puzzle.solution[i], technique: 'solution-lookup' };
    }
  }
  return null;
}
