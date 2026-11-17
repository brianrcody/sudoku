/**
 * @fileoverview The single givens → Puzzle path for puzzles that bypass the
 * generator (share links, developer load-from-string). Pure; runs in the worker.
 */

import { computeConflicts } from '../game/conflicts.js';
import { countSolutions } from '../solver/uniqueness.js';
import { tierForRank } from '../solver/logical.js';
import { rate } from './rater.js';
import { toPuzzle } from './pipeline.js';
import { UNRATED } from '../config.js';

/**
 * @typedef {{ok: true, puzzle: import('../worker/protocol.js').Puzzle}
 *          | {ok: false, reason: 'contradiction'|'complete'|'no-solution'|'multiple'}} LoadResult
 */

/**
 * Check givens for conflicts and emptiness, and require a unique solution.
 * No rating.
 *
 * @param {Uint8Array} givens - 81 cells; 0 = empty.
 * @returns {{ok: true, solution: Uint8Array}
 *          | {ok: false, reason: 'contradiction'|'complete'|'no-solution'|'multiple'}}
 */
export function validateGivens(givens) {
  if (computeConflicts(givens).size > 0) return { ok: false, reason: 'contradiction' };
  if (!givens.includes(0)) return { ok: false, reason: 'complete' };

  const { count, solution } = countSolutions(givens, 2);
  if (count === 0) return { ok: false, reason: 'no-solution' };
  if (count > 1) return { ok: false, reason: 'multiple' };
  return { ok: true, solution };
}

/**
 * @typedef {{ok: true}
 *          | {ok: false, reason: 'contradiction'|'complete'|'no-solution'|'multiple'|'solution-mismatch'}} CheckResult
 */

/**
 * Check givens as `validateGivens` does, and require that their unique
 * solution is `solution`. No rating.
 *
 * @param {Uint8Array} givens - 81 cells; 0 = empty.
 * @param {Uint8Array} solution - The solution recorded with the givens.
 * @returns {CheckResult}
 */
export function checkGivens(givens, solution) {
  const validation = validateGivens(givens);
  if (!validation.ok) return validation;
  for (let i = 0; i < 81; i++) {
    if (validation.solution[i] !== solution[i]) return { ok: false, reason: 'solution-mismatch' };
  }
  return { ok: true };
}

/**
 * Validate givens, require a unique solution, rate, and build the Puzzle.
 * A puzzle the solver cannot finish is returned with difficulty `UNRATED`.
 *
 * @param {Uint8Array} givens - 81 cells; 0 = empty.
 * @returns {LoadResult}
 */
export function loadFromGivens(givens) {
  const validation = validateGivens(givens);
  if (!validation.ok) return validation;
  const { solution } = validation;

  // A uniquely solvable board with an empty cell needs at least one technique,
  // so hardestRank ≥ 1 and tierForRank never returns null when solved.
  const { solved, hardestRank, trace } = rate(givens);
  const difficulty = solved ? tierForRank(hardestRank) : UNRATED;

  // Seed 0: the id of a loaded puzzle depends only on its givens and solution.
  const puzzle = toPuzzle(givens, solution, difficulty, solved ? trace : [], 0);
  return { ok: true, puzzle: { ...puzzle, source: 'loaded' } };
}
