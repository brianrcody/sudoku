/**
 * @fileoverview Logical solver — drives the technique ladder to solve a board
 * as far as logic allows, recording the solve trace.
 */

import { TECHNIQUES } from './techniques/index.js';
import { initialCandidates, applyPlacement, applyElimination } from './candidates.js';

/**
 * @typedef {{ cellIndex: number, digit: number|null, technique: string, eliminations?: Array<{cellIndex:number,digit:number}> }} Step
 */

/**
 * Technique-result fields copied onto elimination steps for the coach
 * analyzer: chain shapes (coloring/chains) and the pattern fields of the
 * rank 12–21 techniques.
 * @type {string[]}
 */
const PASSTHROUGH_FIELDS = [
  'colorChain', 'colorChains', 'chain',
  'pivot', 'wings', 'z', 'cells',
  'baseCells', 'fins', 'digit',
  'urType', 'urCells', 'urDigits', 'urExtra',
  'alsA', 'alsB', 'x',
];

/**
 * Attempt to solve `board` using the technique ladder up to `techniqueLimit`.
 *
 * @param {Uint8Array} board - 81 cells; 0 = empty. Mutated in place.
 * @param {{ techniqueLimit?: number, candidates?: Uint16Array }} [opts]
 *   `techniqueLimit` — only techniques with rank ≤ this value are used (1-based).
 *   Defaults to Infinity (all techniques).
 *   `candidates` — pre-computed candidate bitsets to use instead of recomputing.
 *   When provided, the caller is responsible for ensuring the array is consistent with
 *   `board`. The array is used as-is (not copied); callers that pass this must ensure
 *   it can be mutated by the solver.
 * @returns {{ solved: boolean, board: Uint8Array, candidates: Uint16Array, trace: Step[], hardestRank: number }}
 */
export function solveLogically(board, { techniqueLimit = Infinity, candidates: precomputedCandidates } = {}) {
  const candidates = precomputedCandidates ?? initialCandidates(board);
  const trace = [];
  let hardestRank = 0;
  const limit = Math.min(techniqueLimit, TECHNIQUES.length);

  while (true) {
    if (isFull(board)) break;

    let progressed = false;
    for (let rank = 0; rank < limit; rank++) {
      const result = TECHNIQUES[rank]({ board, candidates });
      if (!result) continue;

      // Apply placements.
      for (const { cellIndex, digit } of result.placements) {
        board[cellIndex] = digit;
        applyPlacement(candidates, cellIndex, digit);
        trace.push({ cellIndex, digit, technique: result.technique, eliminations: [] });
      }

      // Apply eliminations.
      for (const { cellIndex, digit } of result.eliminations) {
        applyElimination(candidates, cellIndex, digit);
      }

      // Record elimination-only steps (no placement) with digit: null.
      if (result.placements.length === 0 && result.eliminations.length > 0) {
        const step = {
          cellIndex: result.eliminations[0].cellIndex,
          digit: null,
          technique: result.technique,
          eliminations: result.eliminations,
        };
        // Pass technique pattern fields through for coach analyzer consumption.
        for (const key of PASSTHROUGH_FIELDS) {
          if (result[key] !== undefined) step[key] = result[key];
        }
        trace.push(step);
      }

      // Rank is 1-based in the spec; array index is 0-based.
      hardestRank = Math.max(hardestRank, rank + 1);
      progressed = true;
      break; // restart from rank 0
    }

    if (!progressed) break;
  }

  return { solved: isFull(board), board, candidates, trace, hardestRank };
}

/**
 * Map a hardest-rank value to its difficulty tier.
 *
 * @param {number} rank - 1-based hardest rank (0 = no technique needed / trivial).
 * @returns {string|null}
 */
export function tierForRank(rank) {
  if (rank === 0)  return null;
  if (rank <= 1)   return 'kiddie';
  if (rank <= 2)   return 'easy';
  if (rank <= 7)   return 'medium';
  if (rank <= 11)  return 'hard';
  if (rank <= 19)  return 'expert';
  if (rank <= 20)  return 'diabolical';
  if (rank <= 21)  return 'nightmare';
  return 'beyond-nightmare';
}

/**
 * @param {Uint8Array} board
 * @returns {boolean}
 */
function isFull(board) {
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0) return false;
  }
  return true;
}
