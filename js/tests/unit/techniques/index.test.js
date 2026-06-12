/**
 * Tests for js/solver/techniques/index.js — §2.7 TI1–TI2
 * (Ladder extended to 21 ranks by aspec-harder-tiers.md §2.)
 */

import { TECHNIQUES } from '/js/solver/techniques/index.js';

describe('techniques/index.js', function () {

  // TI1: TECHNIQUES has exactly 21 entries
  it('TI1: TECHNIQUES has exactly 21 entries', function () {
    expect(TECHNIQUES).to.have.length(21);
  });

  // TI2: Ordering matches aspec-harder-tiers.md §2
  it('TI2: each entry is a function (technique callable)', function () {
    for (let i = 0; i < TECHNIQUES.length; i++) {
      expect(typeof TECHNIQUES[i]).to.equal('function',
        `TECHNIQUES[${i}] should be a function`);
    }
  });

  it('TI2: technique function names match the expected aspec order', function () {
    const expectedNames = [
      'nakedSingle',      // rank 1
      'hiddenSingle',     // rank 2
      'lockedCandidates', // rank 3
      'nakedPair',        // rank 4
      'hiddenPair',       // rank 5
      'nakedTriple',      // rank 6
      'hiddenTriple',     // rank 7
      'xWing',            // rank 8
      'swordfish',        // rank 9
      'jellyfish',        // rank 10
      'xyWing',           // rank 11
      'xyzWing',          // rank 12
      'wxyzWing',         // rank 13
      'finnedXWing',      // rank 14
      'finnedSwordfish',  // rank 15
      'simpleColoring',   // rank 16
      'multiColoring',    // rank 17
      'xyChain',          // rank 18
      'forcingChain',     // rank 19
      'uniqueRectangle',  // rank 20
      'alsXz',            // rank 21
    ];
    const actualNames = TECHNIQUES.map(fn => fn.name);
    expect(actualNames).to.deep.equal(expectedNames);
  });
});
