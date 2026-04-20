/**
 * Tests for js/prng.js — §2.1
 */

import { mulberry32, randomSeed, shuffle } from '/js/prng.js';

describe('prng.js', function () {

  // P1: Same seed → same sequence
  it('P1: mulberry32 is deterministic', function () {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const seq1 = Array.from({ length: 1000 }, () => rng1());
    const seq2 = Array.from({ length: 1000 }, () => rng2());
    expect(seq1).to.deep.equal(seq2);
  });

  // P2: Values in [0, 1)
  it('P2: mulberry32 returns values in [0, 1)', function () {
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).to.be.at.least(0);
      expect(v).to.be.below(1);
    }
  });

  // P3: Bad seed type — mulberry32 coerces via >>>0
  it('P3: mulberry32 coerces bad seed type via >>>0', function () {
    // 'abc' >>> 0 === 0; should not throw
    const rng = mulberry32('abc');
    const v = rng();
    expect(v).to.be.a('number');
    expect(v).to.be.at.least(0);
    expect(v).to.be.below(1);
  });

  // P4: randomSeed returns a uint32
  it('P4: randomSeed returns a uint32', function () {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed();
      expect(s).to.be.a('number');
      expect(Number.isInteger(s)).to.be.true;
      expect(s).to.be.at.least(0);
      expect(s).to.be.below(Math.pow(2, 32));
    }
  });

  // P5: shuffle is deterministic given rng
  it('P5: shuffle is deterministic given the same rng seed', function () {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    shuffle(arr1, mulberry32(7));
    shuffle(arr2, mulberry32(7));
    expect(arr1).to.deep.equal(arr2);
  });

  // P6: shuffle handles empty array
  it('P6: shuffle handles empty array', function () {
    const arr = [];
    const result = shuffle(arr, mulberry32(1));
    expect(result).to.deep.equal([]);
  });

  // P7: shuffle handles length-1 array
  it('P7: shuffle handles length-1 array', function () {
    const arr = [5];
    const result = shuffle(arr, mulberry32(1));
    expect(result).to.deep.equal([5]);
  });

  // P8: shuffle preserves multiset
  it('P8: shuffle preserves all elements (no loss or duplication)', function () {
    const seeds = [1, 42, 99, 2026];
    for (const seed of seeds) {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const arr = [...original];
      shuffle(arr, mulberry32(seed));
      expect(arr.slice().sort((a, b) => a - b)).to.deep.equal(original);
    }
  });
});
