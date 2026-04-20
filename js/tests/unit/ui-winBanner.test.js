/**
 * @fileoverview Unit tests for js/ui/winBanner.js (UW1–UW3).
 */

import { mount } from '../../ui/winBanner.js';
import { mount as mountSrLive } from '../../ui/srLive.js';

const { makeFakeGameState } = window;

describe('ui/winBanner.js', () => {
  let root;
  let srLive;
  let newBtn;

  beforeEach(() => {
    srLive = document.createElement('div');
    srLive.id = 'sr-live';
    document.body.appendChild(srLive);
    mountSrLive(document.body);

    newBtn = document.createElement('button');
    newBtn.id = 'btn-new';
    document.body.appendChild(newBtn);
  });

  afterEach(() => {
    root?.remove();
    srLive?.remove();
    newBtn?.remove();
    root = null;
    srLive = null;
    newBtn = null;
  });

  // UW1: Banner hidden initially
  it('UW1: win banner is aria-hidden=true on mount when won=false', () => {
    const fakeGs = makeFakeGameState({ won: false });
    root = document.createElement('div');
    root.id = 'win-banner-root';
    document.body.appendChild(root);
    mount(root, fakeGs);

    const banner = root.querySelector('#win-banner');
    expect(banner.getAttribute('aria-hidden')).to.equal('true');
  });

  // UW2: Banner shown on won=true
  it('UW2: win banner removes aria-hidden and adds .show when state.won becomes true', async () => {
    const fakeGs = makeFakeGameState({ won: false });
    root = document.createElement('div');
    root.id = 'win-banner-root';
    document.body.appendChild(root);
    mount(root, fakeGs);

    fakeGs.getState().won = true;
    fakeGs._emit('changed', { action: { type: 'ON_COMPLETION_EVALUATE' }, changed: new Set(['won']) });

    const banner = root.querySelector('#win-banner');
    expect(banner.getAttribute('aria-hidden')).to.be.null;
    expect(banner.classList.contains('show')).to.be.true;
  });

  // UW3: Focus moves to New Puzzle button after win
  it('UW3: focus moves to #btn-new after win is set', async () => {
    const fakeGs = makeFakeGameState({ won: false });
    root = document.createElement('div');
    root.id = 'win-banner-root';
    document.body.appendChild(root);
    mount(root, fakeGs);

    fakeGs.getState().won = true;
    fakeGs._emit('changed', { action: { type: 'ON_COMPLETION_EVALUATE' }, changed: new Set(['won']) });

    // Focus happens in a requestAnimationFrame callback.
    await new Promise(r => requestAnimationFrame(r));

    expect(document.activeElement).to.equal(newBtn);
  });
});
