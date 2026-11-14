/**
 * @fileoverview Unit tests for js/util/clipboard.js (CB1–CB3).
 */

import { copyText } from '../../util/clipboard.js';

describe('util/clipboard.js', () => {
  it('CB1: copyText writes the text and resolves true', async () => {
    const written = [];
    const ok = await copyText('hello', { writeText: async t => { written.push(t); } });
    expect(ok).to.be.true;
    expect(written).to.deep.equal(['hello']);
  });

  it('CB2: copyText resolves false when the write is refused', async () => {
    const ok = await copyText('hello', { writeText: () => Promise.reject(new Error('denied')) });
    expect(ok).to.be.false;
  });

  it('CB3: copyText resolves false when there is no clipboard API', async () => {
    expect(await copyText('hello', null)).to.be.false;
  });
});
