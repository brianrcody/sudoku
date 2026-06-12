/**
 * @fileoverview WXYZ-Wing technique (rank 13).
 *
 * Bent almost-locked set of four cells spanning an intersecting line/box pair,
 * with exactly four candidate digits in total. For a digit Z of the set: if
 * every *other* digit's cells within the set are mutually visible, then the
 * set cannot do without Z (the remaining three digits cannot fill four cells),
 * so some set cell holds Z — eliminate Z from outside cells that see every
 * Z-bearing set cell.
 *
 * Reference: sudokuwiki.org/WXYZ_Wing
 */

import { PEERS, UNITS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

const LINE_UNITS = UNITS.slice(0, 18);
const BOX_UNITS = UNITS.slice(18, 27);

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function wxyzWing(state) {
  const { board, candidates } = state;

  for (const box of BOX_UNITS) {
    const boxSet = new Set(box);

    for (const line of LINE_UNITS) {
      if (!line.some(i => boxSet.has(i))) continue;

      const lineSet = new Set(line);
      const cells = [...new Set([...box, ...line])].filter(i => board[i] === 0);
      if (cells.length < 4) continue;

      const result = searchCombos(board, candidates, cells, boxSet, lineSet);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Enumerate 4-cell subsets of `cells` and test the bent-ALS rule.
 */
function searchCombos(board, candidates, cells, boxSet, lineSet) {
  const n = cells.length;
  const combo = new Array(4);

  function rec(start, depth, mask) {
    if (depth === 4) {
      if (count(mask) !== 4) return null;
      return testSet(board, candidates, combo, mask, boxSet, lineSet);
    }
    for (let k = start; k < n; k++) {
      // Prune: union must not exceed 4 digits.
      const m = mask | candidates[cells[k]];
      if (count(m) > 4) continue;
      combo[depth] = cells[k];
      const r = rec(k + 1, depth + 1, m);
      if (r) return r;
    }
    return null;
  }

  return rec(0, 0, 0);
}

/**
 * Apply the bent-ALS elimination rule to a candidate 4-cell set.
 */
function testSet(board, candidates, set, mask, boxSet, lineSet) {
  // Must be genuinely bent: at least one cell exclusive to each region.
  // (A box-only and a line-only cell can never see each other, so a bent set
  // is never fully mutually visible — naked-quad degenerates are excluded
  // here by construction.)
  let hasBoxOnly = false;
  let hasLineOnly = false;
  for (let a = 0; a < 4; a++) {
    if (boxSet.has(set[a]) && !lineSet.has(set[a])) hasBoxOnly = true;
    if (lineSet.has(set[a]) && !boxSet.has(set[a])) hasLineOnly = true;
  }
  if (!hasBoxOnly || !hasLineOnly) return null;

  for (const z of iterate(mask)) {
    const zBit = 1 << (z - 1);

    // Every non-Z digit must be confined to mutually visible set cells, so
    // the set minus Z behaves as a locked set.
    let restricted = true;
    for (const d of iterate(mask)) {
      if (d === z) continue;
      const dBit = 1 << (d - 1);
      const dCells = set.filter(i => candidates[i] & dBit);
      for (let a = 0; a < dCells.length && restricted; a++) {
        for (let b = a + 1; b < dCells.length; b++) {
          if (!PEERS[dCells[a]].includes(dCells[b])) { restricted = false; break; }
        }
      }
      if (!restricted) break;
    }
    if (!restricted) continue;

    // z comes from the set's candidate union, so at least one set cell
    // carries it.
    const zCells = set.filter(i => candidates[i] & zBit);

    const elims = [];
    for (let i = 0; i < 81; i++) {
      if (board[i] !== 0 || set.includes(i) || !(candidates[i] & zBit)) continue;
      if (zCells.every(c => PEERS[i].includes(c))) {
        elims.push({ cellIndex: i, digit: z });
      }
    }
    if (elims.length > 0) {
      return {
        placements: [],
        eliminations: elims,
        technique: 'WXYZ-Wing',
        cells: [...set],
        z,
      };
    }
  }

  return null;
}
