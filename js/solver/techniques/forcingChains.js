/**
 * @fileoverview XY-Chain (rank 14) and Forcing Chain / AIC (rank 15).
 *
 * XY-Chain: A chain of bivalue cells where adjacent cells share a digit.
 * The start and end of the chain both contain a common digit Z; any cell
 * seeing both endpoints can have Z eliminated.
 *
 * Forcing Chain (AIC): Alternating Inference Chain combining strong links
 * (only two candidates for a digit in a unit, or a bivalue cell) and weak
 * links (two cells in a unit both having a candidate). When the chain forms
 * a contradiction-loop or an elimination can be derived, apply it.
 *
 * Implementation: XY-Chain via DFS over bivalue cells.
 * AIC via a bounded DFS over strong/weak alternating links.
 *
 * References:
 *   sudokuwiki.org/XY_Chains
 *   sudokuwiki.org/Alternating_Inference_Chains
 */

import { PEERS, UNITS } from '../../util/grid.js';
import { count, iterate } from '../../util/bitset.js';

// ============================================================================
// XY-Chain
// ============================================================================

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function xyChain(state) {
  const { board, candidates } = state;

  // Collect all bivalue cells.
  const bivalue = [];
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0 && count(candidates[i]) === 2) bivalue.push(i);
  }

  // DFS from each bivalue cell. The chain tracks the "entry digit" at each step.
  // At a cell with candidates {A, B}, if we entered via A, we exit via B.
  for (const start of bivalue) {
    const startDigits = iterate(candidates[start]);
    for (const z of startDigits) {
      // z is the digit we want to eliminate from cells seeing both ends.
      // Start by "pinning" z at `start`, so we exit start via the other digit.
      const otherDigit = startDigits.find(d => d !== z);
      const result = xyChainDFS(board, candidates, bivalue, start, otherDigit, [start], z);
      if (result) return result;
    }
  }

  return null;
}

/**
 * DFS to extend the XY-Chain. `exitDigit` is the digit the chain leaves
 * the current endpoint with (the shared digit with the next cell).
 *
 * @param {Uint8Array} board
 * @param {Uint16Array} candidates
 * @param {number[]} bivalue
 * @param {number} current - Current end-of-chain cell.
 * @param {number} exitDigit - Digit we're looking for in the next cell.
 * @param {number[]} path - Cells visited so far (including `current`).
 * @param {number} z - The elimination digit (must appear at both endpoints).
 * @returns {{ placements: Array, eliminations: Array, technique: string }|null}
 */
function xyChainDFS(board, candidates, bivalue, current, exitDigit, path, z) {
  // Prevent excessively deep chains; practical puzzles rarely need > 12 cells.
  if (path.length > 12) return null;

  for (const next of bivalue) {
    if (path.includes(next)) continue;
    // next must contain `exitDigit` (the link digit between current and next).
    if (!(candidates[next] & (1 << (exitDigit - 1)))) continue;
    if (!PEERS[current].includes(next)) continue;

    const nextDigits = iterate(candidates[next]);
    const nextExit = nextDigits.find(d => d !== exitDigit);

    // If the chain end also has z, we have a valid XY-Chain.
    if (nextExit === z || candidates[next] & (1 << (z - 1))) {
      // The chain end is `next`. Both `path[0]` and `next` carry z.
      // Actually: path[0] has z (we chose z as the "pinned" digit at start),
      // and next has z (either nextExit === z, or z is one of next's two digits).
      if (candidates[next] & (1 << (z - 1))) {
        const zBit = 1 << (z - 1);
        const elims = [];
        const start = path[0];
        for (const peer of PEERS[start]) {
          if (peer === next || path.includes(peer)) continue;
          if (PEERS[next].includes(peer) && board[peer] === 0 && (candidates[peer] & zBit)) {
            elims.push({ cellIndex: peer, digit: z });
          }
        }
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'XY-Chain' };
        }
      }
    }

    // Extend the chain.
    if (nextExit !== undefined) {
      const result = xyChainDFS(board, candidates, bivalue, next, nextExit, [...path, next], z);
      if (result) return result;
    }
  }

  return null;
}

// ============================================================================
// Forcing Chain (AIC)
// ============================================================================

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export function forcingChain(state) {
  const { board, candidates } = state;

  // Build strong links for each digit: pairs of cells where d has exactly 2
  // candidates in some unit (bilocation), or a bivalue cell (bivalueness).
  for (let d = 1; d <= 9; d++) {
    const bit = 1 << (d - 1);

    // Start nodes: cells that are part of a strong link for d.
    for (let startCell = 0; startCell < 81; startCell++) {
      if (board[startCell] !== 0 || !(candidates[startCell] & bit)) continue;

      // Try assuming d is FALSE at startCell. If we can derive a contradiction,
      // then d must be TRUE there (forcing placement).
      // Try assuming d is TRUE at startCell. If a specific cell must have d
      // removed in both branches, eliminate it.
      // For AIC: build an alternating chain starting with strong link from startCell.

      const result = aicSearch(board, candidates, startCell, d, 0, [{ cell: startCell, digit: d, strong: true }]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * AIC DFS. Alternates between strong and weak links.
 * Strong link (even steps): d must be in one of exactly two cells in a unit,
 *   or a cell has exactly two candidates.
 * Weak link (odd steps): both cells can see each other and both have d.
 *
 * Termination condition (nice loop): the chain end can weakly link back to
 * the start in a way that produces an elimination.
 *
 * @param {Uint8Array} board
 * @param {Uint16Array} candidates
 * @param {number} startCell
 * @param {number} startDigit
 * @param {number} depth
 * @param {Array<{cell:number, digit:number, strong:boolean}>} path
 * @returns {{ placements: Array, eliminations: Array, technique: string }|null}
 */
function aicSearch(board, candidates, startCell, startDigit, depth, path) {
  if (depth > 8) return null; // bound to keep runtime manageable
  const last = path[path.length - 1];
  const needStrong = !last.strong;

  if (needStrong) {
    // Find strong links from last.cell with last.digit.
    for (const unit of UNITS) {
      if (!unit.includes(last.cell)) continue;
      const cells = unit.filter(i => i !== last.cell && board[i] === 0 && (candidates[i] & (1 << (last.digit - 1))));
      if (cells.length !== 1) continue; // not a strong link (bilocation requires exactly 1 other)
      const next = cells[0];
      if (path.some(p => p.cell === next && p.digit === last.digit)) continue;

      // Check if this completes a nice loop with the start.
      if (path.length >= 3 && next === startCell && last.digit === startDigit) {
        // Closed AIC: cells seeing the start can have startDigit eliminated if
        // the chain alternates consistently. For simplicity here, report as
        // a loop — any cell seeing both the cell before start and the start
        // via the same digit can be eliminated.
        // Actually for a type-1 nice loop (start/end same cell, same digit),
        // all other candidates in startCell can be eliminated.
        const elims = [];
        const keepBit = 1 << (startDigit - 1);
        const extra = candidates[startCell] & ~keepBit;
        for (let dd = 1; dd <= 9; dd++) {
          if (extra & (1 << (dd - 1))) {
            elims.push({ cellIndex: startCell, digit: dd });
          }
        }
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'Forcing Chain' };
        }
      }

      const result = aicSearch(board, candidates, startCell, startDigit, depth + 1, [
        ...path,
        { cell: next, digit: last.digit, strong: true },
      ]);
      if (result) return result;
    }

    // Also: strong link via bivalue (different digit).
    if (count(candidates[last.cell]) === 2) {
      const [d1, d2] = iterate(candidates[last.cell]);
      const nextDigit = d1 === last.digit ? d2 : d1;
      // Weak-link continuation with new digit (bivalue implies strong on other digit).
      const newNode = { cell: last.cell, digit: nextDigit, strong: true };
      if (!path.some(p => p.cell === last.cell && p.digit === nextDigit)) {
        const result = aicSearch(board, candidates, startCell, startDigit, depth + 1, [...path, newNode]);
        if (result) return result;
      }
    }
  } else {
    // Weak link: any cell that sees last.cell and has last.digit.
    const bit = 1 << (last.digit - 1);
    for (const peer of PEERS[last.cell]) {
      if (board[peer] !== 0 || !(candidates[peer] & bit)) continue;
      if (path.some(p => p.cell === peer && p.digit === last.digit)) continue;

      // Check if this closes a loop: the peer sees the start cell with startDigit.
      if (peer === startCell && last.digit === startDigit && path.length >= 3) {
        // Type-2 nice loop: cells seeing both the discontinuity endpoints
        // can have the digit eliminated.
        const firstNode = path[0];
        const elims = [];
        const elimBit = 1 << (last.digit - 1);
        for (let i = 0; i < 81; i++) {
          if (i === startCell || path.some(p => p.cell === i)) continue;
          if (board[i] !== 0 || !(candidates[i] & elimBit)) continue;
          if (PEERS[i].includes(startCell) && PEERS[i].includes(peer)) {
            elims.push({ cellIndex: i, digit: last.digit });
          }
        }
        if (elims.length > 0) {
          return { placements: [], eliminations: elims, technique: 'Forcing Chain' };
        }
      }

      const result = aicSearch(board, candidates, startCell, startDigit, depth + 1, [
        ...path,
        { cell: peer, digit: last.digit, strong: false },
      ]);
      if (result) return result;
    }
  }

  return null;
}
