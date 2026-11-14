/**
 * @fileoverview Unit tests for js/util/puzzleString.js (PS1–PS10).
 */

import { parsePuzzleString, encodeGivens } from '../../util/puzzleString.js';
import { KIDDIE, toGivens } from '../fixtures/puzzles/loadable.js';

describe('util/puzzleString.js', () => {
  it('PS1: parsePuzzleString accepts 81 digits and returns the givens', () => {
    const result = parsePuzzleString(KIDDIE);
    expect(result.ok).to.be.true;
    expect(result.givens).to.be.instanceof(Uint8Array);
    expect(Array.from(result.givens)).to.deep.equal(Array.from(toGivens(KIDDIE)));
  });

  it('PS2: parsePuzzleString treats . as an empty cell', () => {
    const result = parsePuzzleString(KIDDIE.replace(/0/g, '.'));
    expect(Array.from(result.givens)).to.deep.equal(Array.from(toGivens(KIDDIE)));
  });

  it('PS3: parsePuzzleString ignores surrounding and embedded whitespace', () => {
    const rows = KIDDIE.match(/.{9}/g).join('\n');
    const result = parsePuzzleString(`  \t${rows} \n`);
    expect(result.ok).to.be.true;
    expect(Array.from(result.givens)).to.deep.equal(Array.from(toGivens(KIDDIE)));
  });

  it('PS4: parsePuzzleString rejects a letter with reason chars', () => {
    expect(parsePuzzleString(KIDDIE.slice(0, 80) + 'x')).to.deep.equal({ ok: false, reason: 'chars' });
  });

  it('PS5: parsePuzzleString reports chars, not length, when both are wrong', () => {
    expect(parsePuzzleString('12x')).to.deep.equal({ ok: false, reason: 'chars' });
  });

  it('PS6: parsePuzzleString rejects a short string with its cell count', () => {
    expect(parsePuzzleString('123')).to.deep.equal({ ok: false, reason: 'length', length: 3 });
  });

  it('PS7: parsePuzzleString rejects a long string with its cell count', () => {
    expect(parsePuzzleString(KIDDIE + '0')).to.deep.equal({ ok: false, reason: 'length', length: 82 });
  });

  it('PS8: parsePuzzleString rejects an empty string as length 0', () => {
    expect(parsePuzzleString('')).to.deep.equal({ ok: false, reason: 'length', length: 0 });
  });

  it('PS9: encodeGivens writes 81 digits with 0 for empty', () => {
    expect(encodeGivens(toGivens(KIDDIE))).to.equal(KIDDIE);
  });

  it('PS10: encodeGivens output round-trips through parsePuzzleString', () => {
    const givens = parsePuzzleString(KIDDIE.replace(/0/g, '.')).givens;
    expect(encodeGivens(givens)).to.match(/^[0-9]{81}$/).and.to.equal(KIDDIE);
  });
});
