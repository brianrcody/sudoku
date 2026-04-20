/**
 * Tests for js/solver/techniques/index.js — §2.7 TI1–TI2
 */

import { TECHNIQUES } from '/js/solver/techniques/index.js';

const EXPECTED_ORDER = [
  'nakedSingle',
  'hiddenSingle',
  'lockedCandidates',
  'nakedPair',
  'hiddenPair',
  'nakedTriple',
  'hiddenTriple',
  'xWing',
  'swordfish',
  'jellyfish',
  'xyWing',
  'simpleColoring',
  'multiColoring',
  'xyChain',
  'forcingChain',
];

describe('techniques/index.js', function () {

  // TI1: TECHNIQUES has exactly 15 entries
  it('TI1: TECHNIQUES has exactly 15 entries', function () {
    expect(TECHNIQUES).to.have.length(15);
  });

  // TI2: Ordering matches aspec §4.8
  it('TI2: each entry is a function (technique callable)', function () {
    for (let i = 0; i < TECHNIQUES.length; i++) {
      expect(typeof TECHNIQUES[i]).to.equal('function',
        `TECHNIQUES[${i}] should be a function`);
    }
  });

  it('TI2: technique function names match the expected aspec order', function () {
    const actualNames = TECHNIQUES.map(fn => fn.name);
    // Map exported function names to rank labels used in the spec.
    const nameToRank = {
      nakedSingle: 0,
      hiddenSingle: 1,
      lockedCandidates: 2,
      nakedPair: 3,
      hiddenPair: 4,
      nakedTriple: 5,
      hiddenTriple: 6,
      xWing: 7,
      swordfish: 8,
      jellyfish: 9,
      xyWing: 10,
      simpleColoring: 11,
      multiColoring: 12,
      xyChain: 13,
      forcingChain: 14,
    };
    for (let i = 0; i < actualNames.length; i++) {
      const name = actualNames[i];
      expect(nameToRank).to.have.property(name,
        i, `TECHNIQUES[${i}] has name "${name}" which maps to rank ${nameToRank[name]}, expected ${i}`);
    }
  });
});
