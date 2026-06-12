/**
 * Tests for XYZ-Wing (rank 12) — fixtures verified against the module.
 */

import xyzWing from '/js/solver/techniques/xyzWing.js';
import { xyzPos1, xyzPos2, xyzPos3, xyzNull } from '/js/tests/fixtures/techniques/harderTiers.js';

describe('xyzWing', function () {

  it('XYZ1: row-and-box wings produce Z eliminations from cells seeing all three', function () {
    const result = xyzWing(xyzPos1());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('XYZ-Wing');
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 1, digit: 3 },
      { cellIndex: 2, digit: 3 },
    ]);
    expect(result.pivot).to.equal(0);
    expect(result.wings).to.have.length(2);
    expect(result.z).to.equal(3);
  });

  it('XYZ2: column-and-box orientation fires', function () {
    const result = xyzWing(xyzPos2());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 9, digit: 6 },
      { cellIndex: 18, digit: 6 },
    ]);
    expect(result.z).to.equal(6);
  });

  it('XYZ3: both wings inside the pivot box fires', function () {
    const result = xyzWing(xyzPos3());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 32, digit: 9 },
      { cellIndex: 48, digit: 9 },
    ]);
  });

  it('XYZ4: returns null when the wings do not share a Z digit', function () {
    expect(xyzWing(xyzNull())).to.be.null;
  });
});
