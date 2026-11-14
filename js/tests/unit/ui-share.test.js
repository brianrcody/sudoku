/**
 * @fileoverview Unit tests for js/ui/share.js (SH1–SH13).
 */

import { mount, buildShareUrl } from '../../ui/share.js';
import { mount as mountNotice, hide as hideNotice } from '../../ui/notice.js';
import { mount as mountSrLive } from '../../ui/srLive.js';
import { KIDDIE, toGivens } from '../fixtures/puzzles/loadable.js';

const { makeFakeGameState } = window;

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await frame(); };

describe('ui/share.js', () => {
  describe('buildShareUrl', () => {
    it('SH1: appends the givens as the p parameter', () => {
      expect(buildShareUrl(toGivens(KIDDIE), 'https://example.test/sudoku/'))
        .to.equal(`https://example.test/sudoku/?p=${KIDDIE}`);
    });

    it('SH2: drops the existing query string, including dev and a previous p', () => {
      const url = buildShareUrl(toGivens(KIDDIE), 'https://example.test/index.html?dev=1&p=999&x=y');
      expect(url).to.equal(`https://example.test/index.html?p=${KIDDIE}`);
    });

    it('SH3: drops the fragment', () => {
      expect(buildShareUrl(toGivens(KIDDIE), 'https://example.test/#dev-root'))
        .to.equal(`https://example.test/?p=${KIDDIE}`);
    });

    it('SH4: works for file: URLs', () => {
      expect(buildShareUrl(toGivens(KIDDIE), 'file:///home/me/sudoku/index.html'))
        .to.equal(`file:///home/me/sudoku/index.html?p=${KIDDIE}`);
    });

    it('SH5: encodes only givens — 81 digits and nothing else', () => {
      const p = new URL(buildShareUrl(toGivens(KIDDIE), 'https://example.test/')).searchParams;
      expect([...p.keys()]).to.deep.equal(['p']);
      expect(p.get('p')).to.match(/^[0-9]{81}$/);
    });
  });

  describe('mount', () => {
    let button, noticeRoot, sr;

    beforeEach(() => {
      button = document.createElement('button');
      button.id = 'btn-share';
      noticeRoot = document.createElement('div');
      noticeRoot.id = 'notice-root';
      sr = document.createElement('div');
      sr.id = 'sr-live';
      document.body.append(button, noticeRoot, sr);
      mountNotice(noticeRoot);
      mountSrLive(document.body);
    });

    afterEach(() => {
      hideNotice();
      button.remove();
      noticeRoot.remove();
      sr.remove();
    });

    function mountShare({ puzzle = { givens: toGivens(KIDDIE) }, copyResult = true } = {}) {
      const gs = makeFakeGameState({ puzzle });
      const copied = [];
      mount(button, gs, {
        copy: async text => { copied.push(text); return copyResult; },
        getHref: () => 'https://example.test/app/?dev=1',
      });
      return { gs, copied };
    }

    it('SH6: the button is disabled while no puzzle is loaded', () => {
      mountShare({ puzzle: null });
      expect(button.disabled).to.be.true;
    });

    it('SH7: the button is enabled when a puzzle is loaded', () => {
      mountShare();
      expect(button.disabled).to.be.false;
    });

    it('SH8: the button enables when a puzzle arrives', () => {
      const { gs } = mountShare({ puzzle: null });
      gs.getState().puzzle = { givens: toGivens(KIDDIE) };
      gs._emit('changed', { action: { type: 'PUZZLE_LOADED' }, changed: new Set(['puzzle']) });
      expect(button.disabled).to.be.false;
    });

    it('SH9: a change that does not touch the puzzle leaves the button alone', () => {
      const { gs } = mountShare();
      gs.getState().puzzle = null;
      gs._emit('changed', { action: { type: 'SELECT_CELL' }, changed: new Set(['selected']) });
      expect(button.disabled).to.be.false;
    });

    it('SH10: clicking copies the share link for the current givens', async () => {
      const { copied } = mountShare();
      button.click();
      await settle();
      expect(copied).to.deep.equal([`https://example.test/app/?p=${KIDDIE}`]);
    });

    it('SH11: a successful copy shows and announces the confirmation', async () => {
      mountShare();
      button.click();
      await settle();
      expect(noticeRoot.querySelector('.notice-info .notice-message').textContent)
        .to.equal('Link copied to clipboard.');
      expect(noticeRoot.querySelector('input')).to.be.null;
      expect(sr.textContent).to.equal('Link copied to clipboard.');
    });

    it('SH12: a failed copy shows the link in a selected field and announces the fallback', async () => {
      mountShare({ copyResult: false });
      button.click();
      await settle();
      const field = noticeRoot.querySelector('#share-link-field');
      expect(field.value).to.equal(`https://example.test/app/?p=${KIDDIE}`);
      expect(document.activeElement).to.equal(field);
      expect(sr.textContent).to.equal('Couldn\'t copy automatically. The link is shown for you to copy.');
    });

    it('SH13: dismissing the fallback returns focus to the Share button', async () => {
      mountShare({ copyResult: false });
      button.click();
      await settle();
      noticeRoot.querySelector('.notice-dismiss').click();
      expect(document.activeElement).to.equal(button);
    });

    it('SH14: a newly generated puzzle clears the notice', async () => {
      const { gs } = mountShare({ copyResult: false });
      button.click();
      await settle();
      gs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
      expect(noticeRoot.hidden).to.be.true;
    });

    it('SH15: other actions leave the notice in place', async () => {
      const { gs } = mountShare({ copyResult: false });
      button.click();
      await settle();
      gs._emit('changed', { action: { type: 'PEN_ENTER' }, changed: new Set(['pen']) });
      expect(noticeRoot.hidden).to.be.false;
    });

    it('SH16: the default dependencies are the real clipboard helper and location', async () => {
      const gs = makeFakeGameState({ puzzle: { givens: toGivens(KIDDIE) } });
      mount(button, gs);
      button.click();
      await new Promise(r => setTimeout(r, 100));
      // Whether the headless clipboard accepts the write or not, one of the two
      // outcomes is shown, and a fallback link is built from the page's own URL.
      expect(noticeRoot.hidden).to.be.false;
      const field = noticeRoot.querySelector('#share-link-field');
      if (field) expect(field.value).to.equal(`${location.origin}${location.pathname}?p=${KIDDIE}`);
    });
  });
});
