/**
 * @fileoverview SPIKE (throwaway) — sanity checks for the spike technique
 * detectors, plus a soundness sweep (no elimination may remove the true
 * solution digit).
 *
 * Usage: node scripts/spike-harder-tiers/sanity.js
 */

import { fromDigits } from '../../js/util/bitset.js';
import { mulberry32 } from '../../js/prng.js';
import { fillGrid } from '../../js/generator/fillGrid.js';
import { buildMinimalPuzzle } from '../../js/generator/removeCells.js';
import { TECHNIQUES } from '../../js/solver/techniques/index.js';
import { initialCandidates, applyPlacement, applyElimination } from '../../js/solver/candidates.js';
import urType1 from './urType1.js';
import alsXz from './alsXz.js';

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

// --- Fixture 1: hand-built UR Type 1 -------------------------------------
// Rectangle r0c0/r0c1/r4c0/r4c1 (boxes 0 and 3). Floor = {1,2} three times,
// roof r4c1 = {1,2,3}. All other cells filled (single-bit) so they're inert.
{
  const board = new Uint8Array(81).fill(9);
  const candidates = new Uint16Array(81).fill(fromDigits([9]));
  for (const i of [0, 1, 36, 37]) board[i] = 0;
  candidates[0] = fromDigits([1, 2]);
  candidates[1] = fromDigits([1, 2]);
  candidates[36] = fromDigits([1, 2]);
  candidates[37] = fromDigits([1, 2, 3]);

  const r = urType1({ board, candidates });
  check('UR1 fixture: fires', r !== null);
  check('UR1 fixture: eliminates 1 and 2 from roof (cell 37)',
    r !== null &&
    r.eliminations.length === 2 &&
    r.eliminations.every(e => e.cellIndex === 37) &&
    r.eliminations.map(e => e.digit).sort().join() === '1,2');
}

// --- Fixture 2: UR spanning 4 boxes must NOT fire -------------------------
{
  const board = new Uint8Array(81).fill(9);
  const candidates = new Uint16Array(81).fill(fromDigits([9]));
  // r0c0, r0c4, r4c0, r4c4 — four distinct boxes.
  for (const i of [0, 4, 36, 40]) board[i] = 0;
  candidates[0] = fromDigits([1, 2]);
  candidates[4] = fromDigits([1, 2]);
  candidates[36] = fromDigits([1, 2]);
  candidates[40] = fromDigits([1, 2, 3]);

  check('UR1 fixture: 4-box rectangle rejected', urType1({ board, candidates }) === null);
}

// --- Fixture 3: hand-built ALS-XZ ------------------------------------------
// Classic minimal shape: A = single cell r0c0 {1,2} (size-1 ALS), B = single
// cell r0c8 {2,3}... that's just an XY-chain-ish pair; X=2 restricted (same
// row), Z must be common to both — only digit 2 is common, so no Z. Use:
// A = {r0c0:{1,2}}, B = {r0c4:{2,3}, r0c5:{1,3}} wait B must be in one unit
// with |union|=3 for 2 cells: union {1,2,3}. X=2 (in A and B's r0c4): r0c0
// sees r0c4 — restricted. Z=1: in A (r0c0) and B (r0c5). Eliminate 1 from
// outside cells seeing r0c0 and r0c5 → any other row-0 cell with candidate 1.
{
  const board = new Uint8Array(81).fill(9);
  const candidates = new Uint16Array(81).fill(fromDigits([9]));
  for (const i of [0, 4, 5, 7]) board[i] = 0;
  candidates[0] = fromDigits([1, 2]);     // A
  candidates[4] = fromDigits([2, 3]);     // B
  candidates[5] = fromDigits([1, 3]);     // B
  candidates[7] = fromDigits([1, 9]);     // outside cell, sees all of row 0

  const r = alsXz({ board, candidates });
  check('ALS-XZ fixture: fires', r !== null);
  check('ALS-XZ fixture: eliminates 1 from cell 7',
    r !== null && r.eliminations.some(e => e.cellIndex === 7 && e.digit === 1));
}

// --- Soundness sweep --------------------------------------------------------
// Run the combined ladder over random minimal puzzles; at every step assert
// no elimination removes the solution digit and no placement contradicts it.
{
  const NBOARDS = 300;
  let urFires = 0;
  let alsFires = 0;
  let unsound = 0;

  for (let k = 0; k < NBOARDS; k++) {
    const rng = mulberry32(900000 + k);
    const solution = fillGrid(rng);
    const board = buildMinimalPuzzle(solution, rng, { min: 0, max: 81 });
    const candidates = initialCandidates(board);
    const ladder = [...TECHNIQUES, urType1, alsXz];

    let safety = 2000;
    while (safety-- > 0) {
      let full = true;
      for (let i = 0; i < 81; i++) if (board[i] === 0) { full = false; break; }
      if (full) break;

      let progressed = false;
      for (let rank = 0; rank < ladder.length; rank++) {
        const result = ladder[rank]({ board, candidates });
        if (!result) continue;
        if (rank === 15) urFires++;
        if (rank === 16) alsFires++;
        for (const { cellIndex, digit } of result.placements) {
          if (solution[cellIndex] !== digit) unsound++;
          board[cellIndex] = digit;
          applyPlacement(candidates, cellIndex, digit);
        }
        for (const { cellIndex, digit } of result.eliminations) {
          if (solution[cellIndex] === digit) {
            unsound++;
            console.log(`  UNSOUND elim by ${result.technique}: cell ${cellIndex} digit ${digit}`);
          }
          applyElimination(candidates, cellIndex, digit);
        }
        progressed = true;
        break;
      }
      if (!progressed) break;
    }
  }

  console.log(`soundness sweep: UR fired ${urFires}x, ALS fired ${alsFires}x across ${NBOARDS} boards`);
  check('soundness sweep: zero unsound steps', unsound === 0);
}

process.exit(failures === 0 ? 0 : 1);
