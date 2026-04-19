/**
 * @fileoverview Simple Coloring (rank 12) and Multi-Coloring (rank 13).
 *
 * Simple Coloring: For a digit D, build chains of cells connected by
 * bilocation links (two cells in a unit where D has exactly 2 candidates).
 * Alternately color each chain true/false. Two elimination rules:
 *   Rule 2 (same color sees each other): if two same-color cells see each
 *     other, that color must be false — eliminate D from all cells of that color.
 *   Rule 4 (both colors see a cell): any uncolored cell that sees both a
 *     true and a false cell can have D eliminated.
 *
 * Multi-Coloring: Apply coloring across multiple separate chains. If a cell
 * in one chain sees a cell of a different chain's color, the interacting
 * colors are linked — cells seeing both linked-color cells can be eliminated.
 *
 * Reference: sudokuwiki.org/Singles_Chains, sudokuwiki.org/Colors_Strategies
 */

import { UNITS, PEERS } from '../../util/grid.js';

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function simpleColoring(state) {
  const { board, candidates } = state;

  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    const chains = buildChains(board, candidates, d);

    for (const chain of chains) {
      // Rule 2: two same-color cells that see each other → that color is false.
      for (const color of [0, 1]) {
        const colored = chain.filter(c => c.color === color).map(c => c.cell);
        let conflict = false;
        outer: for (let i = 0; i < colored.length; i++) {
          for (let j = i + 1; j < colored.length; j++) {
            if (PEERS[colored[i]].includes(colored[j])) { conflict = true; break outer; }
          }
        }
        if (conflict) {
          // Eliminate D from all cells of the conflicting color.
          const elims = colored
            .filter(i => candidates[i] & bit)
            .map(i => ({ cellIndex: i, digit: d }));
          if (elims.length > 0) {
            return { placements: [], eliminations: elims, technique: 'Simple Coloring' };
          }
        }
      }

      // Rule 4: uncolored cell sees both colors.
      const c0 = chain.filter(c => c.color === 0).map(c => c.cell);
      const c1 = chain.filter(c => c.color === 1).map(c => c.cell);
      const chainCells = new Set(chain.map(c => c.cell));

      const elims = [];
      for (let i = 0; i < 81; i++) {
        if (chainCells.has(i) || board[i] !== 0 || !(candidates[i] & bit)) continue;
        const seesColor0 = c0.some(j => PEERS[i].includes(j));
        const seesColor1 = c1.some(j => PEERS[i].includes(j));
        if (seesColor0 && seesColor1) {
          elims.push({ cellIndex: i, digit: d });
        }
      }
      if (elims.length > 0) {
        return { placements: [], eliminations: elims, technique: 'Simple Coloring' };
      }
    }
  }

  return null;
}

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function multiColoring(state) {
  const { board, candidates } = state;

  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);
    const chains = buildChains(board, candidates, d);
    if (chains.length < 2) continue;

    // For each pair of chains, look for color interactions.
    for (let ci = 0; ci < chains.length; ci++) {
      for (let cj = ci + 1; cj < chains.length; cj++) {
        const chainA = chains[ci];
        const chainB = chains[cj];

        // For each pair of colors between the two chains:
        for (const colorA of [0, 1]) {
          for (const colorB of [0, 1]) {
            const setA = chainA.filter(c => c.color === colorA).map(c => c.cell);
            const setB = chainB.filter(c => c.color === colorB).map(c => c.cell);

            // Check if any cell in setA sees any cell in setB.
            let linked = false;
            for (const a of setA) {
              if (setB.some(b => PEERS[a].includes(b))) { linked = true; break; }
            }
            if (!linked) continue;

            // Colors A(colorA) and B(colorB) are linked — they can't both be true.
            // Cells that see both the other colors (A(1-colorA) and B(1-colorB))
            // cannot have D.
            const otherA = chainA.filter(c => c.color === 1 - colorA).map(c => c.cell);
            const otherB = chainB.filter(c => c.color === 1 - colorB).map(c => c.cell);

            const chainCells = new Set([
              ...chainA.map(c => c.cell),
              ...chainB.map(c => c.cell),
            ]);

            const elims = [];
            for (let i = 0; i < 81; i++) {
              if (chainCells.has(i) || board[i] !== 0 || !(candidates[i] & bit)) continue;
              const seesOtherA = otherA.some(j => PEERS[i].includes(j));
              const seesOtherB = otherB.some(j => PEERS[i].includes(j));
              if (seesOtherA && seesOtherB) {
                elims.push({ cellIndex: i, digit: d });
              }
            }
            if (elims.length > 0) {
              return { placements: [], eliminations: elims, technique: 'Multi-Coloring' };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Build all bilocation chains for digit `d`.
 * Returns an array of chains, each chain being an array of {cell, color} objects.
 *
 * @param {Uint8Array} board
 * @param {Uint16Array} candidates
 * @param {number} d
 * @returns {Array<Array<{cell:number, color:number}>>}
 */
function buildChains(board, candidates, d) {
  const bit = 1 << (d - 1);

  // Build bilocation links: pairs of cells in a unit where d has exactly 2 candidates.
  const links = new Map(); // cell → Set of linked cells
  for (const unit of UNITS) {
    const cells = unit.filter(i => board[i] === 0 && (candidates[i] & bit));
    if (cells.length === 2) {
      const [a, b] = cells;
      if (!links.has(a)) links.set(a, new Set());
      if (!links.has(b)) links.set(b, new Set());
      links.get(a).add(b);
      links.get(b).add(a);
    }
  }

  // BFS-color connected components.
  const colored = new Map(); // cell → color
  const chains = [];

  for (const start of links.keys()) {
    if (colored.has(start)) continue;

    const chain = [];
    const queue = [{ cell: start, color: 0 }];
    while (queue.length > 0) {
      const { cell, color } = queue.shift();
      if (colored.has(cell)) continue;
      colored.set(cell, color);
      chain.push({ cell, color });
      for (const neighbor of (links.get(cell) || [])) {
        if (!colored.has(neighbor)) queue.push({ cell: neighbor, color: 1 - color });
      }
    }
    chains.push(chain);
  }

  return chains;
}
