/**
 * @fileoverview Rates a puzzle by running the logical solver and mapping the
 * hardest technique rank to a difficulty tier.
 */

import { solveLogically, tierForRank } from '../solver/logical.js';

/**
 * Rate a puzzle.
 *
 * @param {Uint8Array} givens - 81-element array; 0 = empty.
 * @returns {{ tier: string, hardestRank: number, trace: import('../solver/logical.js').Step[], solved: boolean }}
 */
export function rate(givens) {
  const board = givens.slice();
  const { solved, trace, hardestRank } = solveLogically(board);
  const tier = solved ? (tierForRank(hardestRank) ?? 'kiddie') : 'beyond-death-march';
  return { tier, hardestRank, trace, solved };
}
