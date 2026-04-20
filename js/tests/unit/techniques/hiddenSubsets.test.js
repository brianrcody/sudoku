/**
 * Tests for hiddenPair and hiddenTriple — §2.7 HP1–HP3, HT1–HT2, null case
 */

import { hiddenPair, hiddenTriple } from '/js/solver/techniques/hiddenSubsets.js';
import { initialCandidates } from '/js/solver/candidates.js';
import {
  hiddenPairRow,
  hiddenPairCol,
  hiddenPairBox,
  hiddenTriple1,
  hiddenTriple2,
  positionNoFire,
} from '/js/tests/fixtures/techniques/hiddenSubsets.js';

describe('hiddenSubsets', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // HP1: Hidden pair in a row
  it('HP1: hidden pair in row produces eliminations', function () {
    const result = hiddenPair(stateOf(hiddenPairRow));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Hidden Pair');
  });

  // HP2: Hidden pair in a column
  it('HP2: hidden pair in column produces eliminations', function () {
    const result = hiddenPair(stateOf(hiddenPairCol));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // HP3: Hidden pair in a box
  it('HP3: hidden pair in box produces eliminations', function () {
    const result = hiddenPair(stateOf(hiddenPairBox));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // HT1: Hidden triple in a unit
  it('HT1: hidden triple in unit produces eliminations', function () {
    const result = hiddenTriple(stateOf(hiddenTriple1));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Hidden Triple');
  });

  // HT2: Hidden triple variant
  it('HT2: hidden triple variant produces correct eliminations', function () {
    const result = hiddenTriple(stateOf(hiddenTriple2));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // Null case
  it('no hidden subset → returns null', function () {
    const result = hiddenPair(stateOf(positionNoFire));
    expect(result).to.be.null;
    const result2 = hiddenTriple(stateOf(positionNoFire));
    expect(result2).to.be.null;
  });
});
