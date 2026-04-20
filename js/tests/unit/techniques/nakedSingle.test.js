/**
 * Tests for nakedSingle — §2.7 NS1–NS5
 */

import nakedSingle from '/js/solver/techniques/nakedSingle.js';
import { initialCandidates } from '/js/solver/candidates.js';
import { position1, position2, position3, positionNoFire } from '/js/tests/fixtures/techniques/nakedSingle.js';

describe('nakedSingle', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // NS1: fires on a single-candidate cell
  it('NS1: fires on single-candidate cell', function () {
    const result = nakedSingle(stateOf(position1));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
  });

  // NS2: multiple naked singles present — returns first by index
  it('NS2: multiple naked singles — returns first placement', function () {
    const result = nakedSingle(stateOf(position2));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
    // Should return exactly the first single found by index.
    expect(result.placements[0].cellIndex).to.equal(position2.expected.placements[0].cellIndex);
    expect(result.placements[0].digit).to.equal(position2.expected.placements[0].digit);
  });

  // NS3: naked single on a centered cell
  it('NS3: naked single discovered at center cell (index 40)', function () {
    const result = nakedSingle(stateOf(position3));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
    expect(result.placements[0].cellIndex).to.equal(position3.expected.placements[0].cellIndex);
    expect(result.placements[0].digit).to.equal(position3.expected.placements[0].digit);
  });

  // NS4: returns null when no naked singles exist
  it('NS4: returns null when no naked singles exist', function () {
    const result = nakedSingle(stateOf(positionNoFire));
    expect(result).to.be.null;
  });

  // NS5: result includes technique name field
  it('NS5: result includes technique: "Naked Single" metadata field', function () {
    const result = nakedSingle(stateOf(position1));
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('Naked Single');
  });
});
