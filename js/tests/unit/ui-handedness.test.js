/**
 * @fileoverview Unit tests for js/ui/handedness.js (UH1–UH14, tspec-left-hand §2.1; UH17–UH23,
 * tspec-hamburger-menu §2.6).
 *
 * ID alignment: the Implementor's repair kept UH17–UH19 for the toggle tests;
 * the tspec numbers them UH20–UH22. Both are kept (no ID clash): UH17–UH19 stay
 * as written and UH20–UH23 implement the tspec rows.
 */

import {
  getHandedness,
  applyHandedness,
  initHandedness,
  toggleHandedness,
} from '../../ui/handedness.js';
import { mount as mountSrLive } from '../../ui/srLive.js';
import * as cookies from '../../persist/cookies.js';
import * as handednessModule from '../../ui/handedness.js';

const HAND_COOKIE = 'sudoku.hand';
const ON_TEXT = 'Left-handed layout on. Controls are left of the puzzle.';
const OFF_TEXT = 'Left-handed layout off. Controls are right of the puzzle.';

const root = document.documentElement;
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

describe('ui/handedness.js', () => {
  let srLive;

  beforeEach(() => {
    // setup.js clears cookies and data-hand before each test.
    srLive = document.createElement('div');
    srLive.id = 'sr-live';
    document.body.appendChild(srLive);
    mountSrLive(document.body);
  });

  afterEach(() => {
    srLive.remove();
  });

  describe('getHandedness', () => {
    it('UH1: getHandedness returns right when data-hand is absent', () => {
      expect(getHandedness()).to.equal('right');
    });

    it('UH2: getHandedness returns left when data-hand is left', () => {
      root.setAttribute('data-hand', 'left');
      expect(getHandedness()).to.equal('left');
    });

    it('UH3: getHandedness returns right for an unrecognized data-hand value', () => {
      root.setAttribute('data-hand', 'up');
      expect(getHandedness()).to.equal('right');
    });
  });

  describe('applyHandedness', () => {
    it('UH4: applyHandedness left sets data-hand on the root element', () => {
      applyHandedness('left', false);
      expect(root.getAttribute('data-hand')).to.equal('left');
    });

    it('UH5: applyHandedness right removes data-hand', () => {
      root.setAttribute('data-hand', 'left');
      applyHandedness('right', false);
      expect(root.hasAttribute('data-hand')).to.be.false;
    });

    it('UH6: applyHandedness left writes the left cookie', () => {
      applyHandedness('left', false);
      expect(cookies.get(HAND_COOKIE)).to.equal('left');
    });

    it('UH7: applyHandedness right writes the right cookie', () => {
      applyHandedness('right', false);
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
    });

    it('UH8: applyHandedness treats an unrecognized value as right', () => {
      root.setAttribute('data-hand', 'left');
      applyHandedness('up', false);
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
    });

    it('UH9: applyHandedness left announces the on message', async () => {
      applyHandedness('left');
      await nextFrame();
      expect(srLive.textContent).to.equal(ON_TEXT);
    });

    it('UH10: applyHandedness right announces the off message', async () => {
      applyHandedness('right');
      await nextFrame();
      expect(srLive.textContent).to.equal(OFF_TEXT);
    });

    it('UH11: applyHandedness with shouldAnnounce false is silent', async () => {
      applyHandedness('left', false);
      await nextFrame();
      expect(srLive.textContent).to.equal('');
    });
  });

  describe('initHandedness', () => {
    it('UH12: initHandedness applies a saved left preference silently', async () => {
      cookies.set(HAND_COOKIE, 'left');
      initHandedness();
      await nextFrame();
      expect(root.getAttribute('data-hand')).to.equal('left');
      expect(srLive.textContent).to.equal('');
    });

    it('UH13: initHandedness defaults to right and clears a stale attribute when no cookie', () => {
      root.setAttribute('data-hand', 'left');
      initHandedness();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
    });

    it('UH14: initHandedness normalizes an unrecognized cookie to right', () => {
      cookies.set(HAND_COOKIE, 'sideways');
      initHandedness();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
    });
  });

  // The menu item's aria-checked state (formerly UH15–UH16) is owned by menu.js.
  describe('toggleHandedness', () => {
    it('UH17: toggling from right turns left-hand mode on', async () => {
      toggleHandedness();
      await nextFrame();
      expect(root.getAttribute('data-hand')).to.equal('left');
      expect(getHandedness()).to.equal('left');
      expect(cookies.get(HAND_COOKIE)).to.equal('left');
      expect(srLive.textContent).to.equal(ON_TEXT);
    });

    it('UH18: toggling from left turns left-hand mode off', async () => {
      root.setAttribute('data-hand', 'left');
      toggleHandedness();
      await nextFrame();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
      expect(srLive.textContent).to.equal(OFF_TEXT);
    });

    it('UH19: toggling twice restores the original state', () => {
      toggleHandedness();
      toggleHandedness();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
    });
  });

  describe('toggleHandedness (tspec-hamburger-menu §2.6)', () => {
    it('UH20: toggleHandedness from right turns left-hand mode on', async () => {
      toggleHandedness();
      await nextFrame();
      expect(root.getAttribute('data-hand')).to.equal('left');
      expect(cookies.get(HAND_COOKIE)).to.equal('left');
      expect(srLive.textContent).to.equal(ON_TEXT);
    });

    it('UH21: toggleHandedness from left turns it off', async () => {
      applyHandedness('left', false);
      toggleHandedness();
      await nextFrame();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
      expect(srLive.textContent).to.equal(OFF_TEXT);
    });

    it('UH22: two toggles restore the original state', () => {
      toggleHandedness();
      toggleHandedness();
      expect(root.hasAttribute('data-hand')).to.be.false;
    });

    it('UH23: bindHandToggle is gone', () => {
      expect('bindHandToggle' in handednessModule).to.be.false;
    });
  });
});
