/**
 * Tests for X-Wing — §2.7 XW1–XW5
 */

import xWing from '/js/solver/techniques/xWing.js';
import { initialCandidates } from '/js/solver/candidates.js';
import fixtures from '/js/tests/fixtures/techniques/xWing.js';

const [rowFish, colFish, bivalueFish, nearMiss, noFire] = fixtures;

describe('xWing', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // XW1: Row-based X-Wing
  it('XW1: row-based X-Wing produces column eliminations', function () {
    const result = xWing(stateOf(rowFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('X-Wing');
    expect(result.placements).to.deep.equal([]);
  });

  // XW2: Column-based X-Wing
  it('XW2: column-based X-Wing produces row eliminations', function () {
    const result = xWing(stateOf(colFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // XW3: X-Wing where four corners are bivalue
  it('XW3: X-Wing with bivalue corner cells produces eliminations', function () {
    const result = xWing(stateOf(bivalueFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // XW4: Non-fire when only 3 corners match
  it('XW4: near-miss (mismatched columns) returns null', function () {
    const result = xWing(stateOf(nearMiss));
    expect(result).to.be.null;
  });

  // XW5: Null case — no X-Wing
  it('XW5: returns null when no X-Wing pattern exists', function () {
    const result = xWing(stateOf(noFire));
    expect(result).to.be.null;
  });
});
