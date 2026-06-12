/**
 * @fileoverview Dev-only miner for rank-clean coach fixtures (V3 ladder).
 *
 * For each target technique, samples seeded random minimal puzzles, advances
 * them with the production ladder, and snapshots the first state whose
 * first-firing technique is the target. Each snapshot is verified through the
 * real analyze() before being emitted as a paste-ready fixture block.
 *
 * Usage: node scripts/mine-coach-fixtures.js [TechniqueName ...]
 */

import { mulberry32 } from '../js/prng.js';
import { fillGrid } from '../js/generator/fillGrid.js';
import { buildMinimalPuzzle } from '../js/generator/removeCells.js';
import { TECHNIQUES } from '../js/solver/techniques/index.js';
import { initialCandidates, applyPlacement, applyElimination } from '../js/solver/candidates.js';
import { analyze } from '../js/coach/analyzer.js';

const RANKS = {
  'XYZ-Wing': 12, 'WXYZ-Wing': 13, 'Finned X-Wing': 14, 'Finned Swordfish': 15,
  'Simple Coloring': 16, 'Multi-Coloring': 17, 'XY-Chain': 18, 'Forcing Chain': 19,
  'Unique Rectangle': 20, 'ALS-XZ': 21,
};

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(RANKS);

function firstFire(board, candidates) {
  for (let rank = 0; rank < TECHNIQUES.length; rank++) {
    const result = TECHNIQUES[rank]({ board, candidates });
    if (result) return { rank: rank + 1, result };
  }
  return null;
}

function fmtArray(arr, per = 9) {
  let out = '';
  for (let r = 0; r < 9; r++) {
    out += '    ' + Array.from(arr.slice(r * per, r * per + per)).join(',') + ',' + `  // r${r}\n`;
  }
  return out;
}

function verify(board, candidates, target, wantLong) {
  const ok = step => step.technique === target &&
    (!wantLong || step.complexity.acknowledged === true);

  // Try pencil-free first (preferred — simpler fixture).
  const noPencil = analyze({ givens: board }, { pen: new Uint8Array(81), conflicts: new Set(), pencil: null });
  if (ok(noPencil)) return { mode: 'no-pencil', step: noPencil };

  const withPencil = analyze({ givens: board }, { pen: new Uint8Array(81), conflicts: new Set(), pencil: candidates });
  if (ok(withPencil)) return { mode: 'pencil', step: withPencil };

  return null;
}

for (const target of targets) {
  const wantLong = target === 'XY-Chain'; // mine the long variant
  let found = false;

  for (let k = 0; k < 30000 && !found; k++) {
    const rng = mulberry32(640000 + k);
    const solution = fillGrid(rng);
    const board = buildMinimalPuzzle(solution, rng, { min: 0, max: 81 });
    const candidates = initialCandidates(board);

    let safety = 2000;
    while (safety-- > 0) {
      let full = true;
      for (let i = 0; i < 81; i++) if (board[i] === 0) { full = false; break; }
      if (full) break;

      const fire = firstFire(board, candidates);
      if (!fire) break;

      if (fire.result.technique === target) {
        const v = verify(board.slice(), candidates.slice(), target, wantLong);
        if (v) {
          console.log(`// ── ${target} (rank ${RANKS[target]}) — seed ${640000 + k}, mode ${v.mode} ──`);
          console.log('givens:');
          console.log(fmtArray(board));
          if (v.mode === 'pencil') {
            console.log('pencil:');
            console.log(fmtArray(candidates));
          }
          console.log('');
          found = true;
        }
        break; // move to next seed either way
      }

      for (const { cellIndex, digit } of fire.result.placements) {
        board[cellIndex] = digit;
        applyPlacement(candidates, cellIndex, digit);
      }
      for (const { cellIndex, digit } of fire.result.eliminations) {
        applyElimination(candidates, cellIndex, digit);
      }
    }
  }

  if (!found) console.log(`// ${target}: NOT FOUND in scan`);
}
