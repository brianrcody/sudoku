/**
 * @fileoverview Unit tests for js/ui/handedness.js (UH1–UH19, tspec-left-hand §2.1).
 */

import {
  getHandedness,
  applyHandedness,
  initHandedness,
  bindHandToggle,
} from '../../ui/handedness.js';
import { mount as mountSrLive } from '../../ui/srLive.js';
import * as cookies from '../../persist/cookies.js';

const HAND_COOKIE = 'sudoku.hand';
const ON_TEXT = 'Left-handed layout on. Controls are left of the puzzle.';
const OFF_TEXT = 'Left-handed layout off. Controls are right of the puzzle.';

const root = document.documentElement;
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

describe('ui/handedness.js', () => {
  let srLive;
  let button;

  beforeEach(() => {
    // setup.js clears cookies and data-hand before each test.
    srLive = document.createElement('div');
    srLive.id = 'sr-live';
    document.body.appendChild(srLive);
    mountSrLive(document.body);

    button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', 'false');
    document.body.appendChild(button);
  });

  afterEach(() => {
    srLive.remove();
    button.remove();
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

  describe('bindHandToggle', () => {
    it('UH15: bindHandToggle marks the switch checked when left is applied', () => {
      root.setAttribute('data-hand', 'left');
      bindHandToggle(button);
      expect(button.getAttribute('aria-checked')).to.equal('true');
    });

    it('UH16: bindHandToggle marks the switch unchecked when right is applied', () => {
      button.setAttribute('aria-checked', 'true');
      bindHandToggle(button);
      expect(button.getAttribute('aria-checked')).to.equal('false');
    });

    it('UH17: clicking the switch from right turns left-hand mode on', async () => {
      bindHandToggle(button);
      button.click();
      await nextFrame();
      expect(root.getAttribute('data-hand')).to.equal('left');
      expect(button.getAttribute('aria-checked')).to.equal('true');
      expect(cookies.get(HAND_COOKIE)).to.equal('left');
      expect(srLive.textContent).to.equal(ON_TEXT);
    });

    it('UH18: clicking the switch from left turns left-hand mode off', async () => {
      root.setAttribute('data-hand', 'left');
      bindHandToggle(button);
      button.click();
      await nextFrame();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(button.getAttribute('aria-checked')).to.equal('false');
      expect(cookies.get(HAND_COOKIE)).to.equal('right');
      expect(srLive.textContent).to.equal(OFF_TEXT);
    });

    it('UH19: clicking the switch twice restores the original state', () => {
      bindHandToggle(button);
      button.click();
      button.click();
      expect(root.hasAttribute('data-hand')).to.be.false;
      expect(button.getAttribute('aria-checked')).to.equal('false');
    });
  });
});
