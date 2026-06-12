/**
 * @fileoverview Ordered technique ladder. Each entry is a function conforming
 * to the technique signature: `(state) → result | null`.
 *
 * Import order matches rank (1–21). The logical solver iterates this array in
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
import xyzWing from './xyzWing.js';
import wxyzWing from './wxyzWing.js';
import { finnedXWing, finnedSwordfish } from './finnedFish.js';
import { simpleColoring } from './coloring.js';
import { multiColoring } from './coloring.js';
import { xyChain } from './forcingChains.js';
import { forcingChain } from './forcingChains.js';
import uniqueRectangle from './uniqueRectangle.js';
import alsXz from './alsXz.js';

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
  xyzWing,           // rank 12
  wxyzWing,          // rank 13
  finnedXWing,       // rank 14
  finnedSwordfish,   // rank 15
  simpleColoring,    // rank 16
  multiColoring,     // rank 17
  xyChain,           // rank 18
  forcingChain,      // rank 19
  uniqueRectangle,   // rank 20
  alsXz,             // rank 21
];
