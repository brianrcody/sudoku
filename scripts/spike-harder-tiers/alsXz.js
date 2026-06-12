/**
 * @fileoverview SPIKE (throwaway) — ALS-XZ.
 *
 * An Almost Locked Set (ALS) is a set of N unsolved cells within one unit
 * whose candidates union to exactly N+1 digits. Given two cell-disjoint ALSs
 * A and B sharing a restricted common digit X (every X-cell of A sees every
 * X-cell of B, so X can be placed in at most one of the two sets) and another
 * common digit Z: whichever set loses X becomes locked and must contain Z, so
 * Z can be eliminated from any outside cell that sees all Z-cells of both sets.
 *
 * Reference: sudokuwiki.org/ALS_XZ
 */

import { UNITS, PEERS } from '../../js/util/grid.js';
import { count, iterate } from '../../js/util/bitset.js';

const MAX_ALS_SIZE = 4;

// O(1) peer lookup matrix.
const PEER_MATRIX = (() => {
  const m = new Uint8Array(81 * 81);
  for (let i = 0; i < 81; i++) {
    for (const p of PEERS[i]) m[i * 81 + p] = 1;
  }
  return m;
})();

function isPeer(a, b) {
  return PEER_MATRIX[a * 81 + b] === 1;
}

/**
 * Enumerate all ALSs of size 1..MAX_ALS_SIZE, deduplicated across units.
 *
 * @param {Uint8Array} board
 * @param {Uint16Array} candidates
 * @returns {Array<{cells:number[], mask:number, cellsWith:number[][]}>}
 */
function collectAlses(board, candidates) {
  const alses = [];
  const seen = new Set();

  for (const unit of UNITS) {
    const empty = unit.filter(i => board[i] === 0);
    const buf = [];

    function rec(start, mask) {
      if (buf.length >= 1 && count(mask) === buf.length + 1) {
        const key = buf.join(',');
        if (!seen.has(key)) {
          seen.add(key);
          // cellsWith[d] = cells of this ALS holding digit d (1-9).
          const cellsWith = Array.from({ length: 10 }, () => []);
          for (const c of buf) {
            for (const d of iterate(candidates[c])) cellsWith[d].push(c);
          }
          alses.push({ cells: buf.slice(), mask, cellsWith });
        }
      }
      if (buf.length === MAX_ALS_SIZE) return;
      for (let k = start; k < empty.length; k++) {
        buf.push(empty[k]);
        rec(k + 1, mask | candidates[empty[k]]);
        buf.pop();
      }
    }

    rec(0, 0);
  }

  return alses;
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function alsXz(state) {
  const { board, candidates } = state;
  const alses = collectAlses(board, candidates);

  for (let ai = 0; ai < alses.length; ai++) {
    const A = alses[ai];
    for (let bi = ai + 1; bi < alses.length; bi++) {
      const B = alses[bi];

      const common = A.mask & B.mask;
      if (count(common) < 2) continue;

      // Require cell-disjoint sets.
      let disjoint = true;
      for (const c of A.cells) {
        if (B.cells.includes(c)) { disjoint = false; break; }
      }
      if (!disjoint) continue;

      for (const x of iterate(common)) {
        // X is restricted common iff every X-cell of A sees every X-cell of B.
        let restricted = true;
        outer:
        for (const ca of A.cellsWith[x]) {
          for (const cb of B.cellsWith[x]) {
            if (!isPeer(ca, cb)) { restricted = false; break outer; }
          }
        }
        if (!restricted) continue;

        for (const z of iterate(common)) {
          if (z === x) continue;
          const zCells = [...A.cellsWith[z], ...B.cellsWith[z]];
          const zBit = 1 << (z - 1);
          const inSets = new Set([...A.cells, ...B.cells]);

          const elims = [];
          for (let i = 0; i < 81; i++) {
            if (board[i] !== 0 || inSets.has(i) || !(candidates[i] & zBit)) continue;
            if (zCells.every(c => isPeer(i, c))) {
              elims.push({ cellIndex: i, digit: z });
            }
          }
          if (elims.length > 0) {
            return {
              placements: [],
              eliminations: elims,
              technique: 'ALS-XZ',
              alsA: A.cells,
              alsB: B.cells,
              digits: { x, z },
            };
          }
        }
      }
    }
  }

  return null;
}
