/**
 * @fileoverview Unit tests for js/ui/busy.js (UB1–UB7) — generation busy
 * card with progress line and Cancel (fspec-003 §5.2–§5.3).
 */

import { mount } from '../../ui/busy.js';

const { makeFakeGameState } = window;

describe('ui/busy.js', () => {
  let root;
  let gs;
  let cancelCalls;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'busy-root';
    root.hidden = true;
    document.body.appendChild(root);
    cancelCalls = 0;
  });

  afterEach(() => {
    root?.remove();
    root = null;
  });

  function mountBusy(stateOverrides = {}) {
    gs = makeFakeGameState({
      generating: false,
      generatingMessage: '',
      generatingDifficulty: null,
      genProgress: null,
      ...stateOverrides,
    });
    mount(root, gs, { onCancel: () => { cancelCalls++; } });
    return gs;
  }

  function emit(keys) {
    gs._emit('changed', { action: { type: 'TEST' }, changed: new Set(keys) });
  }

  it('UB1: hidden and empty when not generating', () => {
    mountBusy();
    expect(root.hidden).to.equal(true);
    expect(root.innerHTML).to.equal('');
  });

  it('UB2: shows the busy card with the generating message', () => {
    mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'easy' });
    expect(root.hidden).to.equal(false);
    expect(root.querySelector('.busy-title').textContent).to.equal('Generating puzzle…');
    expect(root.querySelector('.busy-spinner')).to.not.equal(null);
  });

  it('UB2a: falls back to the default title when the message is empty', () => {
    mountBusy({ generating: true, generatingMessage: '', generatingDifficulty: 'easy' });
    expect(root.querySelector('.busy-title').textContent).to.equal('Generating puzzle…');
  });

  it('UB3: progress line and Cancel stay hidden for non-top tiers', () => {
    mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'expert' });
    expect(root.querySelector('.busy-progress').hidden).to.equal(true);
    expect(root.querySelector('.busy-cancel').hidden).to.equal(true);
  });

  it('UB4: progress line and Cancel appear for diabolical after the delay', function (done) {
    this.timeout(6000);
    mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'diabolical' });
    expect(root.querySelector('.busy-progress').hidden).to.equal(true);
    setTimeout(() => {
      try {
        expect(root.querySelector('.busy-progress').hidden).to.equal(false);
        expect(root.querySelector('.busy-cancel').hidden).to.equal(false);
        expect(root.querySelector('.busy-progress').textContent).to.include('Searching for a worthy puzzle');
        done();
      } catch (err) { done(err); }
    }, 3300);
  });

  it('UB5: progress line renders attempt counts from genProgress', function (done) {
    this.timeout(6000);
    const state = mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'nightmare' }).getState();
    setTimeout(() => {
      try {
        state.genProgress = { attempts: 42, budget: 300 };
        emit(['genProgress']);
        expect(root.querySelector('.busy-progress').textContent)
          .to.equal('Searching for a worthy puzzle… (attempt 42 of 300)');
        done();
      } catch (err) { done(err); }
    }, 3300);
  });

  it('UB6: Cancel invokes the onCancel hook', function (done) {
    this.timeout(6000);
    mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'diabolical' });
    setTimeout(() => {
      try {
        root.querySelector('.busy-cancel').click();
        expect(cancelCalls).to.equal(1);
        done();
      } catch (err) { done(err); }
    }, 3300);
  });

  it('UB8: moves focus to Cancel when it appears while focus is on the trigger', function (done) {
    this.timeout(6000);
    const btnNew = document.createElement('button');
    btnNew.id = 'btn-new';
    document.body.appendChild(btnNew);
    btnNew.focus();
    mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'diabolical' });
    setTimeout(() => {
      try {
        expect(document.activeElement).to.equal(root.querySelector('.busy-cancel'));
        btnNew.remove();
        done();
      } catch (err) { btnNew.remove(); done(err); }
    }, 3300);
  });

  it('UB7: clears and hides when generating becomes false', () => {
    const state = mountBusy({ generating: true, generatingMessage: 'Generating puzzle…', generatingDifficulty: 'easy' }).getState();
    expect(root.hidden).to.equal(false);
    state.generating = false;
    emit(['generating']);
    expect(root.hidden).to.equal(true);
    expect(root.innerHTML).to.equal('');
  });
});
