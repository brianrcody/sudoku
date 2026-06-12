/**
 * @fileoverview SPIKE (throwaway) — harder-tiers yield/cost measurement.
 *
 * Samples random minimal puzzles and measures:
 *   - tier distribution under the current rank 1-15 ladder
 *   - % unsolvable by ranks 1-15 (rated beyond-death-march today)
 *   - of those, how many become solvable with +UR1, +ALS-XZ, +both
 *   - hardest-rank split for the combined ladder (16 = UR fired hardest,
 *     17 = ALS needed) → yield per prospective tier
 *   - per-attempt timing (strip, base rate, extended rate)
 *
 * Usage: node scripts/spike-harder-tiers/run.js [N] [seedBase]
 */

import { mulberry32 } from '../../js/prng.js';
import { fillGrid } from '../../js/generator/fillGrid.js';
import { buildMinimalPuzzle } from '../../js/generator/removeCells.js';
import { TECHNIQUES } from '../../js/solver/techniques/index.js';
import { initialCandidates, applyPlacement, applyElimination } from '../../js/solver/candidates.js';
import { tierForRank } from '../../js/solver/logical.js';
import urType1 from './urType1.js';
import alsXz from './alsXz.js';
import { writeFileSync } from 'node:fs';

const N = parseInt(process.argv[2] ?? '1000', 10);
const SEED_BASE = parseInt(process.argv[3] ?? '424242', 10);

const LADDER_BASE = TECHNIQUES;
const LADDER_UR = [...TECHNIQUES, urType1];
const LADDER_ALS = [...TECHNIQUES, alsXz];
const LADDER_BOTH = [...TECHNIQUES, urType1, alsXz];

function isFull(board) {
  for (let i = 0; i < 81; i++) if (board[i] === 0) return false;
  return true;
}

/** Mirror of solveLogically's loop with an arbitrary ladder; tracks used ranks. */
function solveWithLadder(board, ladder) {
  const candidates = initialCandidates(board);
  let hardestRank = 0;
  const ranksUsed = new Set();

  while (!isFull(board)) {
    let progressed = false;
    for (let rank = 0; rank < ladder.length; rank++) {
      const result = ladder[rank]({ board, candidates });
      if (!result) continue;
      for (const { cellIndex, digit } of result.placements) {
        board[cellIndex] = digit;
        applyPlacement(candidates, cellIndex, digit);
      }
      for (const { cellIndex, digit } of result.eliminations) {
        applyElimination(candidates, cellIndex, digit);
      }
      hardestRank = Math.max(hardestRank, rank + 1);
      ranksUsed.add(rank + 1);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  return { solved: isFull(board), hardestRank, ranksUsed };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  return {
    n: arr.length,
    mean: +mean.toFixed(3),
    p50: +percentile(sorted, 50).toFixed(3),
    p90: +percentile(sorted, 90).toFixed(3),
    p99: +percentile(sorted, 99).toFixed(3),
    max: +(sorted[sorted.length - 1] ?? 0).toFixed(3),
  };
}

const tally = {
  n: N,
  seedBase: SEED_BASE,
  tiers: {},               // tier distribution under base ladder
  givenCounts: [],
  unsolvedBase: 0,         // beyond-death-march today
  solvedWithUrOnly: 0,     // unsolved base, solved by +UR1
  solvedWithAlsOnly: 0,    // unsolved base, solved by +ALS-XZ
  solvedWithBoth: 0,       // unsolved base, solved by +both
  stillUnsolved: 0,        // unsolved even with both (curated band)
  combinedHardest16: 0,    // UR was the ceiling (prospective Diabolical)
  combinedHardest17: 0,    // ALS needed (prospective Nightmare)
  urFiredInCombined: 0,    // UR used at least once in combined ladder
  timing: { stripMs: [], baseRateMs: [], extendedRateMs: [] },
};

const t0 = Date.now();

for (let k = 0; k < N; k++) {
  const rng = mulberry32(SEED_BASE + k);

  let t = performance.now();
  const solution = fillGrid(rng);
  const givens = buildMinimalPuzzle(solution, rng, { min: 0, max: 81 });
  tally.timing.stripMs.push(performance.now() - t);

  let g = 0;
  for (let i = 0; i < 81; i++) if (givens[i] !== 0) g++;
  tally.givenCounts.push(g);

  t = performance.now();
  const base = solveWithLadder(givens.slice(), LADDER_BASE);
  tally.timing.baseRateMs.push(performance.now() - t);

  if (base.solved) {
    const tier = tierForRank(base.hardestRank) ?? 'kiddie';
    tally.tiers[tier] = (tally.tiers[tier] ?? 0) + 1;
  } else {
    tally.unsolvedBase++;

    const ur = solveWithLadder(givens.slice(), LADDER_UR);
    if (ur.solved) tally.solvedWithUrOnly++;

    const als = solveWithLadder(givens.slice(), LADDER_ALS);
    if (als.solved) tally.solvedWithAlsOnly++;

    t = performance.now();
    const both = solveWithLadder(givens.slice(), LADDER_BOTH);
    tally.timing.extendedRateMs.push(performance.now() - t);

    if (both.solved) {
      tally.solvedWithBoth++;
      if (both.hardestRank === 16) tally.combinedHardest16++;
      if (both.hardestRank === 17) tally.combinedHardest17++;
      if (both.ranksUsed.has(16)) tally.urFiredInCombined++;
    } else {
      tally.stillUnsolved++;
    }
  }

  if ((k + 1) % 100 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.error(`[${elapsed}s] ${k + 1}/${N} — unsolved-base so far: ${tally.unsolvedBase}`);
  }
}

const result = {
  ...tally,
  givenCounts: stats(tally.givenCounts),
  timing: {
    stripMs: stats(tally.timing.stripMs),
    baseRateMs: stats(tally.timing.baseRateMs),
    extendedRateMs: stats(tally.timing.extendedRateMs),
  },
  totalRuntimeS: +((Date.now() - t0) / 1000).toFixed(1),
};

writeFileSync(
  new URL(`./results-${N}-${SEED_BASE}.json`, import.meta.url),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
