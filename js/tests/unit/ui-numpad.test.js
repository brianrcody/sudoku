/**
 * @fileoverview Unit tests for js/ui/numpad.js (UN1–UN11).
 */

import { mount } from '../../ui/numpad.js';
import { mount as mountSrLive } from '../../ui/srLive.js';

const { makeFakeGameState } = window;

function makePuzzle({ difficulty = 'easy', givens } = {}) {
  return {
    id: 'test',
    difficulty,
    givens: givens ?? new Uint8Array(81),
    solution: new Uint8Array(81).fill(1),
    solveTrace: [],
  };
}

function setupSrLive() {
  let sr = document.getElementById('sr-live');
  if (!sr) {
    sr = document.createElement('div');
    sr.id = 'sr-live';
    document.body.appendChild(sr);
  }
  mountSrLive(document.body);
  return sr;
}

describe('ui/numpad.js', () => {
  let root;

  beforeEach(() => {
    setupSrLive();
  });

  afterEach(() => {
    root?.remove();
    root = null;
    // Remove any stray sr-live elements to avoid bleed.
    document.getElementById('sr-live')?.remove();
  });

  function mountNumpad(stateOverrides = {}) {
    const defaults = {
      puzzle: makePuzzle(),
      selected: 5,
      activeMode: 'pen',
      hintsRemaining: 3,
      pen: new Uint8Array(81),
      pencil: new Uint16Array(81),
    };
    const fakeGs = makeFakeGameState({ ...defaults, ...stateOverrides });
    root = document.createElement('div');
    root.id = 'numpad-root';
    document.body.appendChild(root);
    mount(root, fakeGs);
    return fakeGs;
  }

  // UN1: Digit button dispatches PEN_ENTER in pen mode
  it('UN1: clicking digit 5 in pen mode dispatches PEN_ENTER {digit:5}', () => {
    const fakeGs = mountNumpad({ activeMode: 'pen' });
    const btns = root.querySelectorAll('.btn-digit');
    // Buttons are 1–9; index 4 = digit 5.
    btns[4].click();
    const call = fakeGs.dispatch.calls.find(a => a.type === 'PEN_ENTER' && a.digit === 5);
    expect(call).to.exist;
  });

  // UN2: Digit button dispatches PENCIL_TOGGLE in pencil mode
  it('UN2: clicking digit 5 in pencil mode dispatches PENCIL_TOGGLE {digit:5}', () => {
    const fakeGs = mountNumpad({ activeMode: 'pencil' });
    // Update internal mode via state.
    fakeGs.getState().activeMode = 'pencil';
    const btns = root.querySelectorAll('.btn-digit');
    btns[4].click();
    const call = fakeGs.dispatch.calls.find(a => a.type === 'PENCIL_TOGGLE' && a.digit === 5);
    expect(call).to.exist;
  });

  // UN3: Erase button dispatches ERASE
  it('UN3: clicking Erase dispatches ERASE', () => {
    const fakeGs = mountNumpad();
    root.querySelector('#btn-erase').click();
    const call = fakeGs.dispatch.calls.find(a => a.type === 'ERASE');
    expect(call).to.exist;
  });

  // UN4: Mode toggle dispatches TOGGLE_MODE
  it('UN4: clicking mode toggle button dispatches TOGGLE_MODE', () => {
    const fakeGs = mountNumpad();
    root.querySelector('#btn-mode').click();
    const call = fakeGs.dispatch.calls.find(a => a.type === 'TOGGLE_MODE');
    expect(call).to.exist;
  });

  // UN5: aria-pressed reflects current mode
  it('UN5: mode button has aria-pressed=true when mode is pencil', () => {
    mountNumpad({ activeMode: 'pencil' });
    const modeBtn = root.querySelector('#btn-mode');
    expect(modeBtn.getAttribute('aria-pressed')).to.equal('true');
  });

  it('UN5b: mode button has aria-pressed=false when mode is pen', () => {
    mountNumpad({ activeMode: 'pen' });
    const modeBtn = root.querySelector('#btn-mode');
    expect(modeBtn.getAttribute('aria-pressed')).to.equal('false');
  });

  // UN6: Check button hidden for Kiddie/Hard/DM; visible for Easy/Medium
  it('UN6: Check button is hidden for kiddie difficulty', () => {
    mountNumpad({ puzzle: makePuzzle({ difficulty: 'kiddie' }) });
    const btn = root.querySelector('#btn-check');
    expect(btn.style.display).to.equal('none');
  });

  it('UN6b: Check button is visible for easy difficulty', () => {
    mountNumpad({ puzzle: makePuzzle({ difficulty: 'easy' }) });
    const btn = root.querySelector('#btn-check');
    expect(btn.style.display).to.not.equal('none');
  });

  it('UN6c: Check button is hidden for hard difficulty', () => {
    mountNumpad({ puzzle: makePuzzle({ difficulty: 'hard' }) });
    const btn = root.querySelector('#btn-check');
    expect(btn.style.display).to.equal('none');
  });

  // UN7: Hint button shows remaining count
  it('UN7: hint badge shows the remaining hint count', () => {
    mountNumpad({ hintsRemaining: 3 });
    const badge = root.querySelector('#hint-count');
    expect(badge.textContent).to.equal('3');
  });

  // UN8: Hint button shows ∞ for Kiddie (Infinity)
  it('UN8: hint badge shows ∞ when hintsRemaining is Infinity', () => {
    mountNumpad({ hintsRemaining: Infinity, puzzle: makePuzzle({ difficulty: 'kiddie' }) });
    const badge = root.querySelector('#hint-count');
    expect(badge.textContent).to.equal('∞');
  });

  // UN9: Hint button disabled when hints=0
  it('UN9: hint button is disabled when hintsRemaining is 0', () => {
    mountNumpad({ hintsRemaining: 0 });
    const btn = root.querySelector('#btn-hint');
    expect(btn.disabled).to.be.true;
  });

  // UN10: Hint button disabled when selected cell has pen digit
  it('UN10: hint button is disabled when selected cell already has a pen digit', () => {
    const pen = new Uint8Array(81);
    pen[5] = 7; // selected=5 has pen digit
    mountNumpad({ selected: 5, pen, hintsRemaining: 3 });
    const btn = root.querySelector('#btn-hint');
    expect(btn.disabled).to.be.true;
  });

  // UN11: Button accessible label includes remaining count
  it('UN11: hint button aria-label includes the remaining count', () => {
    mountNumpad({ hintsRemaining: 2 });
    const btn = root.querySelector('#btn-hint');
    expect(btn.getAttribute('aria-label')).to.include('2');
  });
});
