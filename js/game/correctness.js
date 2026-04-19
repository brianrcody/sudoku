/**
 * @fileoverview Correctness-checking functions for all difficulty modes.
 */

/**
 * Real-time check for a single cell (Kiddie mode). Returns whether the cell
 * is incorrect. A cell with no pen digit is never flagged.
 *
 * @param {{ puzzle: { solution: Uint8Array }, pen: Uint8Array }} state
 * @param {number} cellIndex
 * @returns {boolean} true if the cell has a wrong pen digit.
 */
export function checkRealtime(state, cellIndex) {
  const digit = state.pen[cellIndex];
  if (digit === 0) return false;
  return digit !== state.puzzle.solution[cellIndex];
}

/**
 * Check all filled player cells against the solution (Easy/Medium on-demand).
 *
 * @param {{ puzzle: { givens: Uint8Array, solution: Uint8Array }, pen: Uint8Array }} state
 * @returns {Set<number>} Indices of cells with wrong pen digits.
 */
export function checkAll(state) {
  const wrong = new Set();
  for (let i = 0; i < 81; i++) {
    const digit = state.pen[i];
    if (digit === 0) continue;
    if (state.puzzle.givens[i] !== 0) continue; // givens are not player entries
    if (digit !== state.puzzle.solution[i]) wrong.add(i);
  }
  return wrong;
}

/**
 * Full-grid evaluation used when the board is completely filled (Hard/Death
 * March). Returns whether the solution is correct and which cells are wrong.
 *
 * @param {{ puzzle: { solution: Uint8Array }, pen: Uint8Array }} state
 * @returns {{ correct: boolean, wrong: Set<number> }}
 */
export function checkOnComplete(state) {
  const wrong = new Set();
  for (let i = 0; i < 81; i++) {
    if (state.pen[i] !== state.puzzle.solution[i]) wrong.add(i);
  }
  return { correct: wrong.size === 0, wrong };
}
