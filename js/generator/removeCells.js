/**
 * @fileoverview Removes cells from a filled solution to create a puzzle with
 * a unique solution, targeting a given-count range.
 */

import { countSolutions } from '../solver/uniqueness.js';
import { shuffle } from '../prng.js';

/**
 * Iteratively remove cells from `solution` while preserving uniqueness.
 *
 * Cells are tried in shuffled order. A cell is removed if the resulting puzzle
 * still has exactly one solution. Removal stops when no further cells can be
 * removed or the number of givens reaches `targetGivens.min`.
 *
 * @param {Uint8Array} solution - 81-element filled grid. Not mutated.
 * @param {function(): number} rng - RNG for shuffling.
 * @param {{ min: number, max: number }} targetGivens - Target given-count range.
 * @returns {Uint8Array} Puzzle with givens; empty cells are 0.
 */
export function buildMinimalPuzzle(solution, rng, targetGivens) {
  const givens = solution.slice(); // working copy
  const indices = Array.from({ length: 81 }, (_, i) => i);
  shuffle(indices, rng);

  for (const i of indices) {
    const current = countGivens(givens);
    if (current <= targetGivens.min) break;

    const saved = givens[i];
    givens[i] = 0;

    const { count } = countSolutions(givens, 2);
    if (count !== 1) {
      givens[i] = saved; // restore — removal breaks uniqueness
    }
    // else: removal accepted, cell stays at 0
  }

  return givens;
}

/**
 * @param {Uint8Array} givens
 * @returns {number}
 */
function countGivens(givens) {
  let n = 0;
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== 0) n++;
  }
  return n;
}
