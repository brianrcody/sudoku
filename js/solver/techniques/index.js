/**
 * @fileoverview Ordered technique ladder. Each entry is a function conforming
 * to the technique signature: `(state) → result | null`.
 *
 * Import order matches rank (1–15). The logical solver iterates this array in
 * order, restarting from rank 0 on every progress step.
 */

import nakedSingle from './nakedSingle.js';
import hiddenSingle from './hiddenSingle.js';
import lockedCandidates from './lockedCandidates.js';
import { nakedPair } from './nakedSubsets.js';
import { hiddenPair } from './hiddenSubsets.js';
import { nakedTriple } from './nakedSubsets.js';
import { hiddenTriple } from './hiddenSubsets.js';
import xWing from './xWing.js';
import swordfish from './swordfish.js';
import jellyfish from './jellyfish.js';
import xyWing from './xyWing.js';
import { simpleColoring } from './coloring.js';
import { multiColoring } from './coloring.js';
import { xyChain } from './forcingChains.js';
import { forcingChain } from './forcingChains.js';

/**
 * Ordered array of technique functions, rank 1 first.
 *
 * @type {Array<function({board: Uint8Array, candidates: Uint16Array}): object|null>}
 */
export const TECHNIQUES = [
  nakedSingle,       // rank 1
  hiddenSingle,      // rank 2
  lockedCandidates,  // rank 3
  nakedPair,         // rank 4
  hiddenPair,        // rank 5
  nakedTriple,       // rank 6
  hiddenTriple,      // rank 7
  xWing,             // rank 8
  swordfish,         // rank 9
  jellyfish,         // rank 10
  xyWing,            // rank 11
  simpleColoring,    // rank 12
  multiColoring,     // rank 13
  xyChain,           // rank 14
  forcingChain,      // rank 15
];
