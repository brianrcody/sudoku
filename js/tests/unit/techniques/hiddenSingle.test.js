/**
 * Tests for hiddenSingle — §2.7 HS1–HS4
 */

import hiddenSingle from '/js/solver/techniques/hiddenSingle.js';
import { initialCandidates } from '/js/solver/candidates.js';
import { position1, position2, position3, positionNoFire } from '/js/tests/fixtures/techniques/hiddenSingle.js';

describe('hiddenSingle', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // HS1: hidden single in a row
  it('HS1: detects hidden single in a row', function () {
    const result = hiddenSingle(stateOf(position1));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
    expect(result.placements[0].cellIndex).to.equal(position1.expected.placements[0].cellIndex);
    expect(result.placements[0].digit).to.equal(position1.expected.placements[0].digit);
  });

  // HS2: hidden single in a column
  it('HS2: detects hidden single in a column', function () {
    const result = hiddenSingle(stateOf(position2));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
    expect(result.placements[0].cellIndex).to.equal(position2.expected.placements[0].cellIndex);
    expect(result.placements[0].digit).to.equal(position2.expected.placements[0].digit);
  });

  // HS3: hidden single in a box
  it('HS3: detects hidden single in a box', function () {
    const result = hiddenSingle(stateOf(position3));
    expect(result).to.not.be.null;
    expect(result.placements).to.have.length.above(0);
    expect(result.placements[0].cellIndex).to.equal(position3.expected.placements[0].cellIndex);
    expect(result.placements[0].digit).to.equal(position3.expected.placements[0].digit);
  });

  // HS4: returns null when no hidden singles exist
  it('HS4: returns null when no hidden singles exist', function () {
    const result = hiddenSingle(stateOf(positionNoFire));
    expect(result).to.be.null;
  });
});
