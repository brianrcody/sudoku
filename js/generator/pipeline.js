/**
 * @fileoverview Generation pipeline. Orchestrates fillGrid → removeCells →
 * rate in a loop until a puzzle of the target tier is found or the attempt
 * budget is exhausted.
 */

import { fillGrid } from './fillGrid.js';
import { buildMinimalPuzzle } from './removeCells.js';
import { rate } from './rater.js';
import { tierForRank } from '../solver/logical.js';
import { ATTEMPT_BUDGET, GIVEN_COUNT_TARGET, UNRATED } from '../config.js';

/**
 * FNV-1a 32-bit hash of a sequence of bytes.
 *
 * @param {Uint8Array[]} arrays
 * @returns {string} Lowercase hex string.
 */
function fnv1a(arrays) {
  let h = 0x811c9dc5 >>> 0;
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      h ^= arr[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Pack a seed number into a Uint8Array (4 bytes, big-endian).
 *
 * @param {number} seed
 * @returns {Uint8Array}
 */
function seedBytes(seed) {
  return new Uint8Array([
    (seed >>> 24) & 0xff,
    (seed >>> 16) & 0xff,
    (seed >>> 8)  & 0xff,
     seed         & 0xff,
  ]);
}

/**
 * Build a Puzzle object from generation results.
 *
 * @param {Uint8Array} givens
 * @param {Uint8Array} solution
 * @param {string} tier
 * @param {import('../solver/logical.js').Step[]} trace
 * @param {number} seed
 * @returns {import('../worker/protocol.js').Puzzle}
 */
export function toPuzzle(givens, solution, tier, trace, seed) {
  const id = fnv1a([givens, solution, seedBytes(seed)]);
  return { id, difficulty: tier, givens, solution, solveTrace: trace };
}

/**
 * @typedef {Object} GenDiagnostics
 * @property {string} requestedTier
 * @property {number} seed - The seed of the run that produced the puzzle.
 * @property {'random'|'developer'} seedBy - Who chose the seed.
 * @property {number} budget
 * @property {number} attempts - Attempts made, including the degenerate extra one.
 * @property {{unsolved: number, wrongTier: number, byTier: Object<string, number>}} rejected
 *   `unsolved`: the rater could not solve the candidate. `wrongTier`: solved,
 *   but at another tier (`byTier` breaks that count down).
 * @property {boolean} fallback - True when the budget ran out.
 */

/**
 * Generate a puzzle of the given tier, retrying up to `budget` times.
 * On budget exhaustion, returns the hardest candidate found so far (silent
 * fallback — the returned puzzle's `difficulty` may differ from `tier`), or
 * an Unrated puzzle when no candidate in the run was solvable.
 *
 * The returned puzzle carries `source: 'generated'` and a `gen` diagnostics
 * record. The counters only observe the loop: they never touch `opts.rng`, so
 * a seed yields the same puzzle with or without them.
 *
 * @param {string} tier - Target difficulty tier.
 * @param {{
 *   rng: function(): number,
 *   seed: number,
 *   seeded?: boolean,
 *   budget?: number,
 *   onProgress?: function({attempts: number, budget: number}): void,
 *   abortSignal?: AbortSignal,
 * }} opts
 * @returns {import('../worker/protocol.js').Puzzle & {source: 'generated', gen: GenDiagnostics}}
 */
export function generateForTier(tier, opts) {
  const budget = opts.budget ?? ATTEMPT_BUDGET[tier];
  const target = GIVEN_COUNT_TARGET[tier];

  let best = null;
  let attempts = 0;
  const rejected = { unsolved: 0, wrongTier: 0, byTier: {} };

  const finish = (puzzle, fallback) => ({
    ...puzzle,
    source: 'generated',
    gen: {
      requestedTier: tier,
      seed: opts.seed,
      seedBy: opts.seeded ? 'developer' : 'random',
      budget, attempts, rejected, fallback,
    },
  });

  // Track last progress-post time for throttling (§10.3).
  let lastProgressMs = 0;

  while (attempts < budget) {
    opts.abortSignal?.throwIfAborted();
    attempts++;

    const now = Date.now();
    if (opts.onProgress && now - lastProgressMs >= 100) {
      opts.onProgress({ attempts, budget });
      lastProgressMs = now;
      opts.abortSignal?.throwIfAborted();
    }

    const solution = fillGrid(opts.rng);
    const givens   = buildMinimalPuzzle(solution, opts.rng, target);
    const result   = rate(givens);

    if (!result.solved) {
      rejected.unsolved++;
      continue;
    }

    const achievedTier = tierForRank(result.hardestRank);

    if (achievedTier === tier) {
      return finish(toPuzzle(givens, solution, tier, result.trace, opts.seed), false);
    }

    rejected.wrongTier++;
    rejected.byTier[achievedTier] = (rejected.byTier[achievedTier] ?? 0) + 1;

    if (!best || result.hardestRank > best.result.hardestRank) {
      best = { givens, solution, result };
    }
  }

  // Budget exhausted — return best found.
  console.warn('[dev] Generation budget exhausted', {
    tier,
    attempts,
    bestRank: best ? best.result.hardestRank : 0,
  });

  if (!best) {
    // Degenerate: no valid puzzle was produced at all — generate one last time
    // without a tier constraint.
    attempts++;
    const solution = fillGrid(opts.rng);
    const givens   = buildMinimalPuzzle(solution, opts.rng, target);
    const result   = rate(givens);
    // A candidate the rater cannot finish has no true tier (fspec-007 §7.5).
    const fallbackTier = result.solved ? tierForRank(result.hardestRank) : UNRATED;
    return finish(toPuzzle(givens, solution, fallbackTier, result.trace, opts.seed), true);
  }

  return finish(toPuzzle(
    best.givens,
    best.solution,
    tierForRank(best.result.hardestRank) ?? tier,
    best.result.trace,
    opts.seed,
  ), true);
}
