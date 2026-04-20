/**
 * Tests for XY-Wing — §2.7 XYW1–XYW5
 */

import xyWing from '/js/solver/techniques/xyWing.js';
import { initialCandidates } from '/js/solver/candidates.js';
import fixtures from '/js/tests/fixtures/techniques/xyWing.js';

const [pos1, pos2, pos3, notBivalue, noFire] = fixtures;

describe('xyWing', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // XYW1: Hinge in row, wings in row and box
  it('XYW1: XY-Wing with hinge in row produces eliminations', function () {
    const result = xyWing(stateOf(pos1));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('XY-Wing');
    expect(result.placements).to.deep.equal([]);
  });

  // XYW2: Hinge in column (uses verified position from fixture)
  it('XYW2: XY-Wing with hinge in column configuration fires', function () {
    const result = xyWing(stateOf(pos2));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // XYW3: Hinge in box, wings share row and column
  it('XYW3: XY-Wing with hinge in box configuration fires', function () {
    const result = xyWing(stateOf(pos3));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // XYW4: Non-fire when cells are not all bivalue
  it('XYW4: does not fire when no bivalue pattern exists', function () {
    const result = xyWing(stateOf(notBivalue));
    expect(result).to.be.null;
  });

  // XYW5: Null guard
  it('XYW5: returns null on sparse board with no XY-Wing', function () {
    const result = xyWing(stateOf(noFire));
    expect(result).to.be.null;
  });
});
