/**
 * @fileoverview Fills an empty grid with a valid, randomly-ordered Sudoku
 * solution via backtracking.
 */

import { PEERS } from '../util/grid.js';
import { shuffle } from '../prng.js';

/**
 * Generate a random, fully-filled valid Sudoku solution.
 *
 * Algorithm: iterate cells in order; for each empty cell compute the set of
 * digits not present in any peer, shuffle with the supplied rng, try each in
 * order, and backtrack on failure.
 *
 * @param {function(): number} rng - RNG returning floats in [0,1).
 * @returns {Uint8Array} 81-element filled solution.
 */
export function fillGrid(rng) {
  const board = new Uint8Array(81);
  if (!fill(board, 0, rng)) {
    // Should never fail for a valid Sudoku grid, but guard anyway.
    throw new Error('fillGrid: backtracking exhausted — should be impossible');
  }
  return board;
}

/**
 * @param {Uint8Array} board
 * @param {number} pos - Starting cell index.
 * @param {function(): number} rng
 * @returns {boolean}
 */
function fill(board, pos, rng) {
  // Find next empty cell at or after `pos`.
  while (pos < 81 && board[pos] !== 0) pos++;
  if (pos === 81) return true; // all cells filled

  // Compute available digits.
  const used = new Set();
  for (const peer of PEERS[pos]) {
    if (board[peer] !== 0) used.add(board[peer]);
  }
  const available = [];
  for (let d = 1; d <= 9; d++) {
    if (!used.has(d)) available.push(d);
  }
  shuffle(available, rng);

  for (const d of available) {
    board[pos] = d;
    if (fill(board, pos + 1, rng)) return true;
    board[pos] = 0;
  }

  return false; // backtrack
}
