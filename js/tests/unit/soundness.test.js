/**
 * Randomized soundness sweep (rspec-003 R24).
 *
 * Generates seeded random minimal puzzles (known unique solutions), runs the
 * full technique ladder, and asserts that no technique ever eliminates the
 * true solution digit from a cell or places a digit that contradicts the
 * solution. Fixture tests prove techniques fire correctly on known patterns;
 * this sweep guards against techniques firing *incorrectly* on arbitrary
 * states — the failure mode that fixture suites structurally miss (see
 * docs/misc/bugs-forcing-chains-soundness.md).
 */

import { mulberry32 } from '/js/prng.js';
import { fillGrid } from '/js/generator/fillGrid.js';
import { buildMinimalPuzzle } from '/js/generator/removeCells.js';
import { TECHNIQUES } from '/js/solver/techniques/index.js';
import { initialCandidates, applyPlacement, applyElimination } from '/js/solver/candidates.js';

const SWEEP_SEED = 424242;
const SWEEP_BOARDS = 40;

describe('soundness sweep (full ladder, seeded random minimal puzzles)', function () {

  it(`SND1: no unsound step across ${SWEEP_BOARDS} seeded minimal puzzles`, function () {
    this.timeout(30000);

    const firesByTechnique = {};
    const unsound = [];

    for (let k = 0; k < SWEEP_BOARDS; k++) {
      const rng = mulberry32(SWEEP_SEED + k);
      const solution = fillGrid(rng);
      const board = buildMinimalPuzzle(solution, rng, { min: 0, max: 81 });
      const candidates = initialCandidates(board);

      let safety = 3000;
      while (safety-- > 0) {
        let full = true;
        for (let i = 0; i < 81; i++) if (board[i] === 0) { full = false; break; }
        if (full) break;

        let progressed = false;
        for (let rank = 0; rank < TECHNIQUES.length; rank++) {
          const result = TECHNIQUES[rank]({ board, candidates });
          if (!result) continue;
          firesByTechnique[result.technique] = (firesByTechnique[result.technique] ?? 0) + 1;

          for (const { cellIndex, digit } of result.placements) {
            if (solution[cellIndex] !== digit) {
              unsound.push(`${result.technique} placed ${digit} at ${cellIndex} (seed ${SWEEP_SEED + k})`);
            }
            board[cellIndex] = digit;
            applyPlacement(candidates, cellIndex, digit);
          }
          for (const { cellIndex, digit } of result.eliminations) {
            if (solution[cellIndex] === digit) {
              unsound.push(`${result.technique} eliminated solution digit ${digit} at ${cellIndex} (seed ${SWEEP_SEED + k})`);
            }
            applyElimination(candidates, cellIndex, digit);
          }
          progressed = true;
          break;
        }
        if (!progressed) break;
        if (unsound.length > 0) break;
      }
      if (unsound.length > 0) break;
    }

    expect(unsound, unsound.join('; ')).to.have.length(0);
    // Anti-dead-code guard: the workhorse techniques must actually fire in a
    // sweep of this size (each fired 10+ times in the 1500-board calibration).
    expect(firesByTechnique['Naked Single']).to.be.above(0);
    expect(firesByTechnique['XY-Chain'] ?? 0).to.be.above(0);
  });
});
