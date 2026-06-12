/**
 * Tests for Unique Rectangle Types 1/2/4 (rank 20) — fixtures verified
 * against the module.
 */

import uniqueRectangle from '/js/solver/techniques/uniqueRectangle.js';
import {
  urType1Pos, urType2Pos, urType4Pos, urNull, urIncomplete, urDeadly,
} from '/js/tests/fixtures/techniques/harderTiers.js';

describe('uniqueRectangle', function () {

  it('UR1: Type 1 removes the floor pair from the roof corner', function () {
    const result = uniqueRectangle(urType1Pos());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('Unique Rectangle');
    expect(result.urType).to.equal(1);
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 37, digit: 1 },
      { cellIndex: 37, digit: 2 },
    ]);
    expect(result.urCells).to.have.length(4);
    expect(result.urDigits).to.deep.equal([1, 2]);
    expect(result.urExtra).to.equal(null);
  });

  it('UR2: Type 2 removes the shared extra digit from cells seeing both roofs', function () {
    const result = uniqueRectangle(urType2Pos());
    expect(result).to.not.be.null;
    expect(result.urType).to.equal(2);
    expect(result.eliminations).to.deep.equal([{ cellIndex: 38, digit: 5 }]);
    expect(result.urExtra).to.equal(5);
  });

  it('UR4: Type 4 removes the unlocked pair digit from both roof cells', function () {
    const result = uniqueRectangle(urType4Pos());
    expect(result).to.not.be.null;
    expect(result.urType).to.equal(4);
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 36, digit: 2 },
      { cellIndex: 37, digit: 2 },
    ]);
    expect(result.urExtra).to.equal(2);
  });

  it('UR5: returns null when the rectangle spans four boxes', function () {
    expect(uniqueRectangle(urNull())).to.be.null;
  });

  it('UR6: returns null when the roof is missing a floor digit (incomplete pattern)', function () {
    expect(uniqueRectangle(urIncomplete())).to.be.null;
  });

  it('UR7: returns null on a degenerate all-bivalue rectangle (no extras anywhere)', function () {
    expect(uniqueRectangle(urDeadly())).to.be.null;
  });
});
