/**
 * Tests for ALS-XZ (rank 21) — fixtures verified against the module.
 */

import alsXz from '/js/solver/techniques/alsXz.js';
import { alsPos1, alsPos2, alsPos3, alsNull } from '/js/tests/fixtures/techniques/harderTiers.js';

describe('alsXz', function () {

  it('ALS1: single-cell A and two-cell B share a restricted common — Z eliminated', function () {
    const result = alsXz(alsPos1());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('ALS-XZ');
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.deep.equal([{ cellIndex: 7, digit: 1 }]);
    expect(result.alsA.length).to.be.above(0);
    expect(result.alsB.length).to.be.above(0);
    expect(result.x).to.be.within(1, 9);
    expect(result.z).to.be.within(1, 9);
    expect(result.x).to.not.equal(result.z);
  });

  it('ALS2: column-shaped B fires with the elimination seeing every Z in both sets', function () {
    const result = alsXz(alsPos2());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 9, digit: 1 }]);
  });

  it('ALS3: two-cell A and two-cell B in a column fire', function () {
    const result = alsXz(alsPos3());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 72, digit: 6 }]);
  });

  it('ALS4: returns null when the common digits never see each other', function () {
    expect(alsXz(alsNull())).to.be.null;
  });
});
