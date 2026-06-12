/**
 * @fileoverview Finned X-Wing (rank 14) and Finned Swordfish (rank 15).
 *
 * A fish whose base units fit the cover units except for surplus candidates
 * (fins) confined to a single box within a single base unit. Either the fins
 * are all false and the regular fish eliminations hold, or a fin is true and
 * the digit lies in the fin box — so the digit is eliminated where the two
 * cases agree: cover-unit cells inside the fin box (excluding the pattern).
 * Sashimi cases (a fin unit with a single cover-set candidate) are included.
 *
 * Reference: sudokuwiki.org/Finned_X_Wing, sudokuwiki.org/Finned_Swordfish
 */

import { UNITS, boxOf } from '../../util/grid.js';

const ROW_UNITS = UNITS.slice(0, 9);
const COL_UNITS = UNITS.slice(9, 18);

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {object|null}
 */
export function finnedXWing(state) {
  return finnedFish(state, 2, ROW_UNITS, COL_UNITS, 'Finned X-Wing') ||
         finnedFish(state, 2, COL_UNITS, ROW_UNITS, 'Finned X-Wing');
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {object|null}
 */
export function finnedSwordfish(state) {
  return finnedFish(state, 3, ROW_UNITS, COL_UNITS, 'Finned Swordfish') ||
         finnedFish(state, 3, COL_UNITS, ROW_UNITS, 'Finned Swordfish');
}

/**
 * Generic finned-fish finder.
 *
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @param {number} size
 * @param {number[][]} baseUnits
 * @param {number[][]} coverUnits
 * @param {string} technique
 * @returns {object|null}
 */
function finnedFish(state, size, baseUnits, coverUnits, technique) {
  const { board, candidates } = state;

  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);

    const basePositions = baseUnits.map(unit => {
      const pos = [];
      for (let idx = 0; idx < unit.length; idx++) {
        const i = unit[idx];
        if (board[i] === 0 && (candidates[i] & bit)) pos.push(idx);
      }
      return pos;
    });

    // Base units need at least one candidate; cap to keep fins per-box viable.
    const eligible = [];
    for (let b = 0; b < baseUnits.length; b++) {
      const len = basePositions[b].length;
      if (len >= 1 && len <= size + 2) eligible.push(b);
    }
    if (eligible.length < size) continue;

    for (const baseCombo of combinations(eligible, size)) {
      // Try each member as the fin-carrying unit.
      for (const finUnit of baseCombo) {
        // Cover set must contain every position of the non-fin units.
        const req = new Set();
        for (const b of baseCombo) {
          if (b === finUnit) continue;
          for (const p of basePositions[b]) req.add(p);
        }
        if (req.size > size) continue;

        const finPos = basePositions[finUnit];
        const extraSlots = size - req.size;
        const finChoices = finPos.filter(p => !req.has(p));

        // Choose which of the fin unit's out-of-req positions join the cover
        // set; the rest become fins.
        for (const chosen of combinations(finChoices, Math.min(extraSlots, finChoices.length))) {
          const coverSet = new Set(req);
          for (const p of chosen) coverSet.add(p);
          if (coverSet.size !== size) continue;

          // Fin unit must keep at least one candidate inside the cover set.
          if (!finPos.some(p => coverSet.has(p))) continue;

          // Map fin positions to cell indices within the fin unit.
          const finCells = finPos
            .filter(p => !coverSet.has(p))
            .map(p => baseUnits[finUnit][p]);
          if (finCells.length === 0) continue;

          // All fins must share one box.
          const finBox = boxOf(finCells[0]);
          if (!finCells.every(i => boxOf(i) === finBox)) continue;

          // Pattern (base) cells: candidates of the base units inside the cover set.
          const baseCells = [];
          const baseCellSet = new Set();
          for (const b of baseCombo) {
            for (const p of basePositions[b]) {
              if (coverSet.has(p)) {
                const i = baseUnits[b][p];
                baseCells.push(i);
                baseCellSet.add(i);
              }
            }
          }

          // Eliminations: cover-unit cells inside the fin box, excluding the
          // pattern and the fins.
          const finSet = new Set(finCells);
          const elims = [];
          for (const p of coverSet) {
            for (const i of coverUnits[p]) {
              if (boxOf(i) !== finBox) continue;
              if (baseCellSet.has(i) || finSet.has(i)) continue;
              if (board[i] !== 0 || !(candidates[i] & bit)) continue;
              elims.push({ cellIndex: i, digit: d });
            }
          }

          if (elims.length > 0) {
            return {
              placements: [],
              eliminations: elims,
              technique,
              baseCells,
              fins: finCells,
              digit: d,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * @param {number[]} arr
 * @param {number} k
 * @returns {number[][]}
 */
function combinations(arr, k) {
  if (k === 0) return [[]];
  const result = [];
  const combo = new Array(k);
  function recurse(start, depth) {
    if (depth === k) { result.push(combo.slice()); return; }
    for (let i = start; i <= arr.length - (k - depth); i++) {
      combo[depth] = arr[i];
      recurse(i + 1, depth + 1);
    }
  }
  recurse(0, 0);
  return result;
}
