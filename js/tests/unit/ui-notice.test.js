/**
 * @fileoverview Unit tests for js/ui/notice.js (NT1–NT13).
 */

import { mount, show, showLink, hide } from '../../ui/notice.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

describe('ui/notice.js', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'notice-root';
    document.body.appendChild(root);
    mount(root);
  });

  afterEach(() => {
    hide();
    root.remove();
  });

  it('NT1: mount leaves the root empty and hidden', () => {
    expect(root.hidden).to.be.true;
    expect(root.children).to.have.length(0);
  });

  it('NT2: show renders the message in an info card and unhides the root', () => {
    show('Hello');
    expect(root.hidden).to.be.false;
    expect(root.querySelector('.notice.notice-info .notice-message').textContent).to.equal('Hello');
  });

  it('NT3: show renders the requested variant class', () => {
    show('Bad', { variant: 'error' });
    expect(root.querySelector('.notice').classList.contains('notice-error')).to.be.true;
  });

  it('NT4: non-progress notices have a labelled Dismiss button', () => {
    show('Hello');
    const dismiss = root.querySelector('.notice-dismiss');
    expect(dismiss).to.not.be.null;
    expect(dismiss.getAttribute('aria-label')).to.equal('Dismiss message');
  });

  it('NT5: a progress notice has no Dismiss button', () => {
    show('Checking…', { variant: 'progress' });
    expect(root.querySelector('.notice-dismiss')).to.be.null;
  });

  it('NT6: the Dismiss button hides the notice and calls onDismiss once', () => {
    let dismissed = 0;
    show('Hello', { onDismiss: () => { dismissed++; } });
    root.querySelector('.notice-dismiss').click();
    expect(root.hidden).to.be.true;
    expect(root.children).to.have.length(0);
    expect(dismissed).to.equal(1);
  });

  it('NT7: the Dismiss button works without an onDismiss callback', () => {
    show('Hello');
    root.querySelector('.notice-dismiss').click();
    expect(root.hidden).to.be.true;
  });

  it('NT8: a notice with timeoutMs dismisses itself', async () => {
    show('Brief', { timeoutMs: 30 });
    expect(root.hidden).to.be.false;
    await wait(80);
    expect(root.hidden).to.be.true;
  });

  it('NT9: a notice without timeoutMs stays', async () => {
    show('Sticky');
    await wait(80);
    expect(root.hidden).to.be.false;
  });

  it('NT10: a new notice replaces the old one and cancels its timer', async () => {
    show('First', { timeoutMs: 30 });
    show('Second');
    expect(root.querySelectorAll('.notice')).to.have.length(1);
    await wait(80);
    expect(root.hidden).to.be.false;
    expect(root.querySelector('.notice-message').textContent).to.equal('Second');
  });

  it('NT11: hide does not call onDismiss', () => {
    let dismissed = 0;
    show('Hello', { onDismiss: () => { dismissed++; } });
    hide();
    expect(dismissed).to.equal(0);
    expect(root.hidden).to.be.true;
  });

  it('NT12: showLink adds a labelled read-only field, focused with its content selected', () => {
    const field = showLink('Copy this:', 'https://example.test/?p=123');
    expect(root.querySelector('.notice').classList.contains('notice-link')).to.be.true;
    expect(root.querySelector('.notice-message').textContent).to.equal('Copy this:');
    expect(field.readOnly).to.be.true;
    expect(field.value).to.equal('https://example.test/?p=123');
    expect(field.getAttribute('aria-label')).to.equal('Shareable puzzle link');
    expect(document.activeElement).to.equal(field);
    expect(field.selectionStart).to.equal(0);
    expect(field.selectionEnd).to.equal(field.value.length);
  });

  it('NT13: showLink passes onDismiss through to the Dismiss button', () => {
    let dismissed = 0;
    showLink('Copy this:', 'https://example.test/', { onDismiss: () => { dismissed++; } });
    root.querySelector('.notice-dismiss').click();
    expect(dismissed).to.equal(1);
  });
});
