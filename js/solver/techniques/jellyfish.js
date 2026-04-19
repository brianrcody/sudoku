/**
 * @fileoverview Jellyfish technique (rank 10) — 4×4 fish.
 *
 * Reference: sudokuwiki.org/Jelly_Fish_Strategy
 */

import { UNITS } from '../../util/grid.js';
import { fish } from './xWing.js';

const ROW_UNITS = UNITS.slice(0, 9);
const COL_UNITS = UNITS.slice(9, 18);

/**
 * @param {{ board: Uint8Array, candidates: Uint16Array }} state
 * @returns {{ placements: Array, eliminations: Array<{cellIndex:number,digit:number}>, technique: string }|null}
 */
export default function jellyfish(state) {
  const result = fish(state, 4, ROW_UNITS, COL_UNITS) ||
                 fish(state, 4, COL_UNITS, ROW_UNITS);
  if (!result) return null;
  return { ...result, technique: 'Jellyfish' };
}
