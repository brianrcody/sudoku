/**
 * Tests for WXYZ-Wing (rank 13) — fixtures verified against the module.
 */

import wxyzWing from '/js/solver/techniques/wxyzWing.js';
import {
  wxyzPos1, wxyzPos2, wxyzPos3, wxyzNull, wxyzAllBox, wxyzAllLine,
} from '/js/tests/fixtures/techniques/harderTiers.js';

describe('wxyzWing', function () {

  it('WXYZ1: bent set over box and row eliminates the non-restricted digit', function () {
    const result = wxyzWing(wxyzPos1());
    expect(result).to.not.be.null;
    expect(result.technique).to.equal('WXYZ-Wing');
    expect(result.placements).to.deep.equal([]);
    expect(result.eliminations).to.deep.equal([{ cellIndex: 2, digit: 4 }]);
    expect(result.cells).to.have.length(4);
    expect(result.z).to.equal(4);
  });

  it('WXYZ2: bent set over box and column fires', function () {
    const result = wxyzWing(wxyzPos2());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 18, digit: 4 }]);
  });

  it('WXYZ3: bottom-right geometry fires', function () {
    const result = wxyzWing(wxyzPos3());
    expect(result).to.not.be.null;
    expect(result.eliminations).to.deep.equal([{ cellIndex: 78, digit: 8 }]);
  });

  it('WXYZ4: returns null when no digit satisfies the bent-ALS condition', function () {
    expect(wxyzWing(wxyzNull())).to.be.null;
  });

  it('WXYZ5: returns null when the set is not bent (box-only or line-only)', function () {
    expect(wxyzWing(wxyzAllBox())).to.be.null;
    expect(wxyzWing(wxyzAllLine())).to.be.null;
  });
});
