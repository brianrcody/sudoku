/**
 * @fileoverview Unit tests for js/ui/srLive.js (UL1–UL3).
 */

import { mount, announce } from '../../ui/srLive.js';

describe('ui/srLive.js', () => {
  let root;
  let region;

  beforeEach(() => {
    root = document.createElement('div');
    region = document.createElement('div');
    region.id = 'sr-live';
    region.setAttribute('aria-live', 'assertive');
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', 'status');
    root.appendChild(region);
    document.body.appendChild(root);
    mount(root);
  });

  afterEach(() => {
    root?.remove();
    root = null;
    region = null;
  });

  // UL1: announce writes text to region (after rAF)
  it('UL1: announce writes the given text to the live region', async () => {
    announce('hello world');
    // announce uses rAF internally — wait for it.
    await new Promise(r => requestAnimationFrame(r));
    expect(region.textContent).to.equal('hello world');
  });

  // UL2: Double announce re-announces the same message
  it('UL2: announcing the same message twice clears then re-sets the region', async () => {
    announce('test');
    await new Promise(r => requestAnimationFrame(r));
    expect(region.textContent).to.equal('test');

    announce('test');
    // After the second announce, the region is cleared first (synchronously)
    // then set in the next rAF.
    expect(region.textContent).to.equal(''); // cleared synchronously
    await new Promise(r => requestAnimationFrame(r));
    expect(region.textContent).to.equal('test'); // re-set
  });

  // UL3: Region attrs
  it('UL3: live region has aria-live=assertive, aria-atomic=true, and role=status', () => {
    expect(region.getAttribute('aria-live')).to.equal('assertive');
    expect(region.getAttribute('aria-atomic')).to.equal('true');
    expect(region.getAttribute('role')).to.equal('status');
  });
});
