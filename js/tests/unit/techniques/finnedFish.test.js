/**
 * Tests for Finned X-Wing (rank 14) and Finned Swordfish (rank 15) —
 * fixtures verified against the module.
 */

import { finnedXWing, finnedSwordfish } from '/js/solver/techniques/finnedFish.js';
import {
  finnedXPos1, finnedXPos2, finnedXSashimi, finnedSwordfishPos1, finnedNull,
} from '/js/tests/fixtures/techniques/harderTiers.js';

describe('finnedFish', function () {

  it('FXW1: row-based finned X-Wing eliminates inside the fin box only', function () {
    const result = finnedXWing(finnedXPos1());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('Finned X-Wing');
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 62, digit: 4 },
      { cellIndex: 80, digit: 4 },
    ]);
    expect(result.fins).to.deep.equal([70]); // r7c7
    expect(result.baseCells).to.have.length(4);
    expect(result.digit).to.equal(4);
  });

  it('FXW2: a two-fin pattern in one box fires', function () {
    const result = finnedXWing(finnedXPos2());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 64, digit: 2 }]);
    expect(result.fins).to.have.length(2);
  });

  it('FXW3: sashimi variant (fin unit with one cover candidate) fires', function () {
    const result = finnedXWing(finnedXSashimi());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 62, digit: 4 }]);
  });

  it('FSF1: finned Swordfish eliminates inside the fin box only', function () {
    const result = finnedSwordfish(finnedSwordfishPos1());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('Finned Swordfish');
    expect(result.eliminations).to.deep.equal([
      { cellIndex: 62, digit: 5 },
      { cellIndex: 80, digit: 5 },
    ]);
    expect(result.fins).to.deep.equal([70]);
  });

  it('FN1: returns null when the digit lives in a single unit (no fish)', function () {
    expect(finnedXWing(finnedNull())).to.be.null;
    expect(finnedSwordfish(finnedNull())).to.be.null;
  });
});
