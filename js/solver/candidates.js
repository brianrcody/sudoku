/**
 * @fileoverview Initial candidate computation and incremental maintenance.
 */

import { PEERS } from '../util/grid.js';
import { ALL, remove, has } from '../util/bitset.js';

/**
 * Compute initial candidate bitsets for all cells.
 *
 * Each cell starts with ALL (digits 1–9); then the digits already present in
 * each peer are eliminated. Filled cells carry their single digit as a
 * single-bit mask (not ALL) so that techniques can read both the board and
 * candidates uniformly.
 *
 * @param {Uint8Array} board - 81 cells; 0 = empty, 1–9 = placed digit.
 * @returns {Uint16Array} 81-element candidate bitset array.
 */
export function initialCandidates(board) {
  const candidates = new Uint16Array(81);

  for (let i = 0; i < 81; i++) {
    const d = board[i];
    if (d !== 0) {
      candidates[i] = 1 << (d - 1);
    } else {
      let mask = ALL;
      for (const peer of PEERS[i]) {
        const pd = board[peer];
        if (pd !== 0) mask = remove(mask, pd);
      }
      candidates[i] = mask;
    }
  }

  return candidates;
}

/**
 * Apply a digit placement to the candidate arrays in place.
 *
 * Sets `candidates[cellIndex]` to the single-bit mask for `digit`, then
 * removes `digit` from every peer's candidate set.
 *
 * @param {Uint16Array} candidates - Mutated in place.
 * @param {number} cellIndex - 0–80.
 * @param {number} digit - 1–9.
 */
export function applyPlacement(candidates, cellIndex, digit) {
  candidates[cellIndex] = 1 << (digit - 1);
  for (const peer of PEERS[cellIndex]) {
    if (has(candidates[peer], digit)) {
      candidates[peer] = remove(candidates[peer], digit);
    }
  }
}

/**
 * Apply an elimination to the candidate arrays in place.
 *
 * @param {Uint16Array} candidates - Mutated in place.
 * @param {number} cellIndex - 0–80.
 * @param {number} digit - 1–9.
 */
export function applyElimination(candidates, cellIndex, digit) {
  candidates[cellIndex] = remove(candidates[cellIndex], digit);
}
