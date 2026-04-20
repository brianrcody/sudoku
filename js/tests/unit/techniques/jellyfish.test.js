/**
 * Tests for Jellyfish — §2.7 JF1–JF4
 */

import jellyfish from '/js/solver/techniques/jellyfish.js';
import { initialCandidates } from '/js/solver/candidates.js';
import fixtures from '/js/tests/fixtures/techniques/jellyfish.js';

const [rowFish, colFish, irregular, noFire] = fixtures;

describe('jellyfish', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // JF1: Row-based 4×4 Jellyfish
  it('JF1: row-based Jellyfish (4×4) produces column eliminations', function () {
    const result = jellyfish(stateOf(rowFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Jellyfish');
    expect(result.placements).to.deep.equal([]);
  });

  // JF2: Column-based 4×4 Jellyfish
  it('JF2: column-based Jellyfish (4×4) produces row eliminations', function () {
    const result = jellyfish(stateOf(colFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Jellyfish');
  });

  // JF3: Irregular Jellyfish (2-3-4-4 counts)
  it('JF3: irregular Jellyfish with mixed candidate counts', function () {
    const result = jellyfish(stateOf(irregular));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // JF4: Null — no Jellyfish
  it('JF4: returns null when no Jellyfish pattern exists', function () {
    const result = jellyfish(stateOf(noFire));
    expect(result).to.be.null;
  });
});
