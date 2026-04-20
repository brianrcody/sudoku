/**
 * Tests for lockedCandidates — §2.7 LC1–LC5
 */

import lockedCandidates from '/js/solver/techniques/lockedCandidates.js';
import { initialCandidates } from '/js/solver/candidates.js';
import {
  position1,
  position2,
  position3,
  positionNoFire,
  position5,
} from '/js/tests/fixtures/techniques/lockedCandidates.js';

describe('lockedCandidates', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // LC1: Pointing pair eliminates from row
  it('LC1: pointing pair eliminates digit from rest of row', function () {
    const result = lockedCandidates(stateOf(position1));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    // Verify at least one expected elimination is present.
    const elim = result.eliminations[0];
    expect(elim).to.have.property('cellIndex');
    expect(elim).to.have.property('digit');
  });

  // LC2: Pointing pair eliminates from column
  it('LC2: pointing pair eliminates digit from rest of column', function () {
    const result = lockedCandidates(stateOf(position2));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // LC3: Claiming eliminates from box
  it('LC3: claiming eliminates digit from rest of box', function () {
    const result = lockedCandidates(stateOf(position3));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // LC4: Non-fire when technique does not apply
  it('LC4: returns null when locked candidates pattern does not apply', function () {
    const result = lockedCandidates(stateOf(positionNoFire));
    expect(result).to.be.null;
  });

  // LC5: Result is elimination-only (no placements)
  it('LC5: result contains only eliminations — placements array is empty', function () {
    const result = lockedCandidates(stateOf(position5));
    expect(result).to.not.be.null;
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.have.length.above(0);
  });
});
