/**
 * Tests for Swordfish — §2.7 SF1–SF5
 */

import swordfish from '/js/solver/techniques/swordfish.js';
import { initialCandidates } from '/js/solver/candidates.js';
import fixtures from '/js/tests/fixtures/techniques/swordfish.js';

const [rowFish, colFish, irregular, nonFire, noFire] = fixtures;

describe('swordfish', function () {

  function stateOf(fixture) {
    return { board: fixture.board, candidates: initialCandidates(fixture.board) };
  }

  // SF1: Row-based 3×3 Swordfish
  it('SF1: row-based Swordfish (3×3) produces column eliminations', function () {
    const result = swordfish(stateOf(rowFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Swordfish');
    expect(result.placements).to.deep.equal([]);
  });

  // SF2: Column-based 3×3 Swordfish
  it('SF2: column-based Swordfish (3×3) produces row eliminations', function () {
    const result = swordfish(stateOf(colFish));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
    expect(result.technique).to.equal('Swordfish');
  });

  // SF3: Irregular Swordfish (2-3-3 row counts)
  it('SF3: irregular Swordfish (2-3-3 candidate counts) produces eliminations', function () {
    const result = swordfish(stateOf(irregular));
    expect(result).to.not.be.null;
    expect(result.eliminations).to.have.length.above(0);
  });

  // SF4: Non-fire — only 2 base rows available (X-Wing territory, not Swordfish)
  it('SF4: non-fire when fewer than 3 eligible base units', function () {
    const result = swordfish(stateOf(nonFire));
    expect(result).to.be.null;
  });

  // SF5: Null — no Swordfish
  it('SF5: returns null when no Swordfish pattern exists', function () {
    const result = swordfish(stateOf(noFire));
    expect(result).to.be.null;
  });
});
