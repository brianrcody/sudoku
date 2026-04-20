/**
 * Tests for nakedPair and nakedTriple — §2.7 NP1–NP3, NT1–NT2, null case
 */

import { nakedPair, nakedTriple } from '/js/solver/techniques/nakedSubsets.js';
import { initialCandidates } from '/js/solver/candidates.js';
import {
  nakedPairRow,
  nakedPairCol,
  nakedPairBox,
  nakedTriple as nakedTripleFixture,
  nakedTriple223,
  positionNoFire,
} from '/js/tests/fixtures/techniques/nakedSubsets.js';

describe('nakedSubsets', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // NP1: Naked pair in row eliminates
  it('NP1: naked pair in row produces eliminations', function () {
    const result = nakedPair(stateOf(nakedPairRow));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Naked Pair');
  });

  // NP2: Naked pair in column eliminates
  it('NP2: naked pair in column produces eliminations', function () {
    const result = nakedPair(stateOf(nakedPairCol));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // NP3: Naked pair in box eliminates
  it('NP3: naked pair in box produces eliminations', function () {
    const result = nakedPair(stateOf(nakedPairBox));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // NT1: Naked triple in a unit
  it('NT1: naked triple in unit produces eliminations', function () {
    const result = nakedTriple(stateOf(nakedTripleFixture));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Naked Triple');
  });

  // NT2: Naked triple 2-2-3 pattern variant
  it('NT2: naked triple with 2-2-3 candidate pattern variant', function () {
    const result = nakedTriple(stateOf(nakedTriple223));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // Null case: no subset → null
  it('no naked subset → returns null', function () {
    const result = nakedPair(stateOf(positionNoFire));
    expect(result).to.be.null;
    const result2 = nakedTriple(stateOf(positionNoFire));
    expect(result2).to.be.null;
  });
});
