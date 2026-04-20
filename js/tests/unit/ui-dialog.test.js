/**
 * @fileoverview Unit tests for js/ui/dialog.js (UD1–UD6).
 */

import { mount, open, close } from '../../ui/dialog.js';

describe('ui/dialog.js', () => {
  let root;
  let triggerBtn;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'dialog-root';
    document.body.appendChild(root);
    mount(root);

    triggerBtn = document.createElement('button');
    triggerBtn.id = 'test-trigger';
    document.body.appendChild(triggerBtn);
  });

  afterEach(() => {
    close(); // ensure closed state
    root?.remove();
    triggerBtn?.remove();
    root = null;
    triggerBtn = null;
  });

  function openTestDialog({ onConfirm = () => {} } = {}) {
    triggerBtn.focus();
    open({
      title: 'Test Dialog',
      body: 'Are you sure?',
      confirmLabel: 'OK',
      onConfirm,
    });
  }

  // UD1: open sets role, aria-modal, aria-labelledby
  it('UD1: open sets role=dialog, aria-modal=true, aria-labelledby on the backdrop', () => {
    openTestDialog();
    const backdrop = root.querySelector('#modal-backdrop');
    expect(backdrop.getAttribute('role')).to.equal('dialog');
    expect(backdrop.getAttribute('aria-modal')).to.equal('true');
    expect(backdrop.getAttribute('aria-labelledby')).to.equal('modal-title');
  });

  // UD2: Focus traps inside dialog — Tab from last focusable wraps to first
  it('UD2: Tab from confirm button wraps focus to cancel button', () => {
    openTestDialog();
    const cancelBtn = root.querySelector('#modal-cancel');
    const confirmBtn = root.querySelector('#modal-confirm');
    confirmBtn.focus();

    const backdrop = root.querySelector('#modal-backdrop');
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    expect(document.activeElement).to.equal(cancelBtn);
  });

  it('UD2b: Shift+Tab from cancel button wraps focus to confirm button', () => {
    openTestDialog();
    const cancelBtn = root.querySelector('#modal-cancel');
    const confirmBtn = root.querySelector('#modal-confirm');
    cancelBtn.focus();

    const backdrop = root.querySelector('#modal-backdrop');
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));

    expect(document.activeElement).to.equal(confirmBtn);
  });

  // UD3: Escape dismisses dialog without calling onConfirm
  it('UD3: pressing Escape closes the dialog without calling onConfirm', () => {
    let confirmed = false;
    openTestDialog({ onConfirm: () => { confirmed = true; } });

    const backdrop = root.querySelector('#modal-backdrop');
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(confirmed).to.be.false;
    expect(backdrop.classList.contains('open')).to.be.false;
  });

  // UD4: Clicking confirm button calls onConfirm
  it('UD4: clicking the confirm button calls onConfirm', () => {
    let confirmed = false;
    openTestDialog({ onConfirm: () => { confirmed = true; } });

    root.querySelector('#modal-confirm').click();

    expect(confirmed).to.be.true;
  });

  // UD5: Dialog returns focus to trigger element on close
  it('UD5: focus is returned to the triggering element when dialog closes', () => {
    openTestDialog();
    close();
    expect(document.activeElement).to.equal(triggerBtn);
  });

  // UD6: Cancel button receives default focus on open
  it('UD6: Cancel button is focused by default when dialog opens', () => {
    openTestDialog();
    expect(document.activeElement).to.equal(root.querySelector('#modal-cancel'));
  });
});
