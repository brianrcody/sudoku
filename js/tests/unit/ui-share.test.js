/**
 * @fileoverview Unit tests for js/ui/share.js (SH1–SH21; SH17–SH21 tspec-hamburger-menu §2.4).
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
    let trigger, noticeRoot, sr;

    beforeEach(() => {
      trigger = document.createElement('button');
      trigger.id = 'menu-button';
      noticeRoot = document.createElement('div');
      noticeRoot.id = 'notice-root';
      sr = document.createElement('div');
      sr.id = 'sr-live';
      document.body.append(trigger, noticeRoot, sr);
      mountNotice(noticeRoot);
      mountSrLive(document.body);
    });

    afterEach(() => {
      hideNotice();
      trigger.remove();
      noticeRoot.remove();
      sr.remove();
    });

    function mountShare({ puzzle = { givens: toGivens(KIDDIE) }, copyResult = true } = {}) {
      const gs = makeFakeGameState({ puzzle });
      const copied = [];
      const api = mount(gs, {
        returnFocus: () => trigger,
        copy: async text => { copied.push(text); return copyResult; },
        getHref: () => 'https://example.test/app/?dev=1',
      });
      return { gs, copied, share: api.share };
    }

    // The item's enabled state (formerly SH6–SH9) is owned by menu.js now.
    it('SH6: share() does nothing while no puzzle is loaded', async () => {
      const { copied, share } = mountShare({ puzzle: null });
      await share();
      expect(copied).to.deep.equal([]);
      expect(noticeRoot.hidden).to.be.true;
    });

    it('SH10: share() copies the share link for the current givens', async () => {
      const { copied, share } = mountShare();
      await share();
      expect(copied).to.deep.equal([`https://example.test/app/?p=${KIDDIE}`]);
    });

    it('SH11: a successful copy shows and announces the confirmation', async () => {
      const { share } = mountShare();
      await share();
      await settle();
      expect(noticeRoot.querySelector('.notice-info .notice-message').textContent)
        .to.equal('Link copied to clipboard.');
      expect(noticeRoot.querySelector('input')).to.be.null;
      expect(sr.textContent).to.equal('Link copied to clipboard.');
    });

    it('SH12: a failed copy shows the link in a selected field and announces the fallback', async () => {
      const { share } = mountShare({ copyResult: false });
      await share();
      await settle();
      const field = noticeRoot.querySelector('#share-link-field');
      expect(field.value).to.equal(`https://example.test/app/?p=${KIDDIE}`);
      expect(document.activeElement).to.equal(field);
      expect(sr.textContent).to.equal('Couldn\'t copy automatically. The link is shown for you to copy.');
    });

    it('SH13: dismissing the fallback returns focus to returnFocus (the menu button)', async () => {
      const { share } = mountShare({ copyResult: false });
      await share();
      await settle();
      noticeRoot.querySelector('.notice-dismiss').click();
      expect(document.activeElement).to.equal(trigger);
    });

    it('SH14: a newly generated puzzle clears the notice', async () => {
      const { gs, share } = mountShare({ copyResult: false });
      await share();
      await settle();
      gs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
      expect(noticeRoot.hidden).to.be.true;
    });

    it('SH15: other actions leave the notice in place', async () => {
      const { gs, share } = mountShare({ copyResult: false });
      await share();
      await settle();
      gs._emit('changed', { action: { type: 'PEN_ENTER' }, changed: new Set(['pen']) });
      expect(noticeRoot.hidden).to.be.false;
    });

    it('SH17: share() with no puzzle does nothing', async () => {
      const { copied, share } = mountShare({ puzzle: null });
      await share();
      await settle();
      expect(copied).to.be.empty;
      expect(noticeRoot.hidden).to.be.true;
      expect(sr.textContent).to.equal('');
    });

    it('SH18: a successful copy shows and announces the copied notice', async () => {
      const { copied, share } = mountShare();
      await share();
      await settle();
      expect(copied).to.deep.equal([buildShareUrl(toGivens(KIDDIE), 'https://example.test/app/?dev=1')]);
      expect(noticeRoot.querySelector('.notice-message').textContent).to.equal('Link copied to clipboard.');
      expect(sr.textContent).to.equal('Link copied to clipboard.');
    });

    it('SH19: a failed copy shows the link; Dismiss focuses returnFocus() resolved at dismiss time', async () => {
      const a = document.createElement('button');
      const b = document.createElement('button');
      document.body.append(a, b);
      try {
        let target = a;
        const gs = makeFakeGameState({ puzzle: { givens: toGivens(KIDDIE) } });
        const { share } = mount(gs, {
          returnFocus: () => target,
          copy: async () => false,
          getHref: () => 'https://example.test/app/',
        });
        await share();
        await settle();
        expect(noticeRoot.querySelector('#share-link-field')).to.exist;
        expect(sr.textContent).to.equal('Couldn\'t copy automatically. The link is shown for you to copy.');
        target = b;
        noticeRoot.querySelector('.notice-dismiss').click();
        expect(document.activeElement).to.equal(b);
      } finally {
        a.remove();
        b.remove();
      }
    });

    it('SH20: mount takes no button and owns no disabled state', () => {
      const before = document.querySelectorAll('[disabled]').length;
      const gs = makeFakeGameState({ puzzle: { givens: toGivens(KIDDIE) } });
      const api = mount(gs, { returnFocus: () => trigger });
      gs.getState().puzzle = null;
      gs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
      expect(document.querySelectorAll('[disabled]').length).to.equal(before);
      expect(Object.keys(api)).to.deep.equal(['share']);
      expect(api.share).to.be.a('function');
    });

    it('SH21: only NEW_PUZZLE hides the notice', async () => {
      const { gs, share } = mountShare({ copyResult: false });
      await share();
      await settle();
      gs._emit('changed', { action: { type: 'RESET_PUZZLE' }, changed: new Set(['pen', 'won']) });
      expect(noticeRoot.hidden).to.be.false;
      gs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
      expect(noticeRoot.hidden).to.be.true;
    });

    it('SH16: the default dependencies are the real clipboard helper and location', async () => {
      const gs = makeFakeGameState({ puzzle: { givens: toGivens(KIDDIE) } });
      const { share } = mount(gs, { returnFocus: () => trigger });
      share();
      await new Promise(r => setTimeout(r, 100));
      // Whether the headless clipboard accepts the write or not, one of the two
      // outcomes is shown, and a fallback link is built from the page's own URL.
      expect(noticeRoot.hidden).to.be.false;
      const field = noticeRoot.querySelector('#share-link-field');
      if (field) expect(field.value).to.equal(`${location.origin}${location.pathname}?p=${KIDDIE}`);
    });
  });
});
