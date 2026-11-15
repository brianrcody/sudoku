/**
 * @fileoverview Unit tests for js/ui/controls.js (UC1–UC10).
 *
 * controls.js only manages the difficulty selector. The New Puzzle / Reset
 * buttons are wired in main.js (not in controls.js), so UC1–UC6 that reference
 * those buttons are noted as out-of-scope for this module. The tests below cover
 * all branches actually present in controls.js.
 *
 * DEVIATION from tspec UC1–UC6: controls.js does not own the New Puzzle or Reset
 * buttons; they are wired in main.js. UC1–UC6 cannot be tested at the unit level
 * against controls.js. UC7–UC10 (difficulty change) are fully covered below.
 * UC1–UC6 are covered by the integration tests in game-flows.test.js (GF7, GF8).
 */

import { mount } from '../../ui/controls.js';
import { mount as mountDialog } from '../../ui/dialog.js';

const { makeFakeGameState } = window;

function makePuzzle({ difficulty = 'medium' } = {}) {
  return {
    id: 'test',
    difficulty,
    givens: new Uint8Array(81),
    solution: new Uint8Array(81).fill(1),
    solveTrace: [],
  };
}

function setupDialog() {
  let dialogRoot = document.getElementById('dialog-root');
  if (!dialogRoot) {
    dialogRoot = document.createElement('div');
    dialogRoot.id = 'dialog-root';
    document.body.appendChild(dialogRoot);
  }
  mountDialog(dialogRoot);
  return dialogRoot;
}

describe('ui/controls.js', () => {
  let root;
  let dialogRoot;

  beforeEach(() => {
    dialogRoot = setupDialog();
  });

  afterEach(() => {
    root?.remove();
    dialogRoot?.remove();
    root = null;
    dialogRoot = null;
  });

  function mountControls(stateOverrides = {}) {
    const defaults = {
      puzzle: makePuzzle(),
      pen: new Uint8Array(81),
    };
    const fakeGs = makeFakeGameState({ ...defaults, ...stateOverrides });
    root = document.createElement('div');
    root.id = 'controls-root';
    document.body.appendChild(root);
    mount(root, fakeGs);
    return fakeGs;
  }

  // UC7: Difficulty change with no progress applies directly (no dialog)
  it('UC7: difficulty change with no progress dispatches CHANGE_DIFFICULTY without dialog', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'easy' }) });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const call = fakeGs.dispatch.calls.find(a => a.type === 'CHANGE_DIFFICULTY');
    expect(call).to.exist;
    expect(call.difficulty).to.equal('hard');

    // Dialog should not be open.
    const backdrop = dialogRoot.querySelector('#modal-backdrop');
    expect(backdrop.classList.contains('open')).to.be.false;
  });

  // UC8: Difficulty change with progress opens dialog
  it('UC8: difficulty change with progress opens the confirmation dialog', () => {
    const pen = new Uint8Array(81);
    const givens = new Uint8Array(81);
    pen[1] = 3; // player entry in a non-given cell
    const puzzle = makePuzzle({ difficulty: 'medium' });
    puzzle.givens = givens;

    const fakeGs = mountControls({ puzzle, pen });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const backdrop = dialogRoot.querySelector('#modal-backdrop');
    expect(backdrop.classList.contains('open')).to.be.true;
    expect(dialogRoot.querySelector('#modal-title').textContent).to.equal('Start a new Hard puzzle?');
    expect(dialogRoot.querySelector('#modal-confirm').textContent).to.equal('New Puzzle');
  });

  it('UC8b: while a puzzle is already being generated, a further change is not confirmed again', () => {
    const pen = new Uint8Array(81);
    pen[1] = 3;
    const puzzle = makePuzzle({ difficulty: 'medium' });
    puzzle.givens = new Uint8Array(81);

    const fakeGs = mountControls({ puzzle, pen, generating: true });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(dialogRoot.querySelector('#modal-backdrop').classList.contains('open')).to.be.false;
    expect(fakeGs.dispatch.calls).to.deep.equal([{ type: 'CHANGE_DIFFICULTY', difficulty: 'hard' }]);
    expect(select.value).to.equal('hard');
  });

  // UC9: Difficulty dialog cancel reverts selector
  it('UC9: cancelling the difficulty dialog restores the original selector value', () => {
    const pen = new Uint8Array(81);
    pen[1] = 3;
    const puzzle = makePuzzle({ difficulty: 'medium' });

    const fakeGs = mountControls({ puzzle, pen });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Cancel the dialog.
    dialogRoot.querySelector('#modal-cancel').click();

    // Selector should be back to 'medium'.
    expect(select.value).to.equal('medium');
    // CHANGE_DIFFICULTY should not have been dispatched.
    const call = fakeGs.dispatch.calls.find(a => a.type === 'CHANGE_DIFFICULTY');
    expect(call).to.not.exist;
  });

  // UC10: Theme select triggers applyTheme (handled by themes.js / main.js binding)
  // DEVIATION: controls.js does not own the theme selector; that is wired by
  // bindThemeSelect in themes.js (called from main.js). UC10 is covered by
  // ui-themes.test.js (UT2/UT3). Recording this deviation here for traceability.
  it('UC10: controls.js does not own the theme selector — covered by ui-themes.test.js', () => {
    // Structural invariant: controls root contains the difficulty selector.
    mountControls();
    expect(root.querySelector('#difficulty-select')).to.exist;
  });

  // UC3: Dialog confirm dispatches CHANGE_DIFFICULTY
  it('UC3-analog: confirming difficulty dialog dispatches CHANGE_DIFFICULTY', () => {
    const pen = new Uint8Array(81);
    pen[1] = 3;
    const puzzle = makePuzzle({ difficulty: 'medium' });

    const fakeGs = mountControls({ puzzle, pen });
    const select = root.querySelector('#difficulty-select');
    select.value = 'kiddie';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    dialogRoot.querySelector('#modal-confirm').click();

    const call = fakeGs.dispatch.calls.find(a => a.type === 'CHANGE_DIFFICULTY');
    expect(call).to.exist;
    expect(call.difficulty).to.equal('kiddie');
  });

  // State change event updates selector
  it('controls reacts to puzzle state change by updating the difficulty selector', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'easy' }) });
    const select = root.querySelector('#difficulty-select');
    expect(select.value).to.equal('easy');

    // Mutate state and emit changed event with 'puzzle' key.
    fakeGs.getState().puzzle.difficulty = 'hard';
    fakeGs._emit('changed', { action: { type: 'CHANGE_DIFFICULTY' }, changed: new Set(['puzzle']) });

    expect(select.value).to.equal('hard');
  });

  // ── Unrated puzzles and generation resync (V4 — puzzle loading) ─────────

  const unratedOption = () => root.querySelector('#difficulty-select option[value="unrated"]');

  it('UC11: a rated puzzle has no Unrated option', () => {
    mountControls();
    expect(unratedOption()).to.be.null;
    expect(root.querySelectorAll('#difficulty-select option')).to.have.length(7);
  });

  it('UC12: an Unrated puzzle adds an Unrated option and selects it', () => {
    mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    expect(unratedOption().textContent).to.equal('Unrated');
    expect(root.querySelector('#difficulty-select').value).to.equal('unrated');
  });

  it('UC13: the Unrated option is not duplicated by later updates', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    fakeGs._emit('changed', { action: { type: 'X' }, changed: new Set(['puzzle']) });
    expect(root.querySelectorAll('#difficulty-select option[value="unrated"]')).to.have.length(1);
  });

  it('UC14: the Unrated option is removed when a rated puzzle replaces it', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    fakeGs.getState().puzzle = makePuzzle({ difficulty: 'hard' });
    fakeGs._emit('changed', { action: { type: 'NEW_PUZZLE' }, changed: new Set(['puzzle']) });
    expect(unratedOption()).to.be.null;
    expect(root.querySelector('#difficulty-select').value).to.equal('hard');
  });

  it('UC15: choosing a tier on an untouched Unrated puzzle dispatches CHANGE_DIFFICULTY', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    const select = root.querySelector('#difficulty-select');
    select.value = 'easy';
    select.dispatchEvent(new Event('change'));
    expect(fakeGs.dispatch.calls).to.deep.equal([{ type: 'CHANGE_DIFFICULTY', difficulty: 'easy' }]);
  });

  it('UC16: with progress on an Unrated puzzle the selector reverts to Unrated pending confirmation', () => {
    const pen = new Uint8Array(81);
    pen[3] = 4;
    mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }), pen });
    const select = root.querySelector('#difficulty-select');
    select.value = 'easy';
    select.dispatchEvent(new Event('change'));
    expect(select.value).to.equal('unrated');
    expect(dialogRoot.querySelector('#modal-backdrop').classList.contains('open')).to.be.true;
  });

  it('UC17: while generating, the selector keeps the player\'s choice', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    fakeGs.getState().generating = true;
    fakeGs._emit('changed', { action: { type: 'SET_GENERATING' }, changed: new Set(['generating']) });
    expect(select.value).to.equal('hard');
  });

  it('UC18: when generation ends without a new puzzle, the selector returns to the current puzzle', () => {
    const fakeGs = mountControls({ puzzle: makePuzzle({ difficulty: 'unrated' }) });
    const select = root.querySelector('#difficulty-select');
    select.value = 'hard';
    fakeGs.getState().generating = false;
    fakeGs._emit('changed', { action: { type: 'SET_GENERATING' }, changed: new Set(['generating']) });
    expect(select.value).to.equal('unrated');
  });

  it('UC19: with no puzzle the selector is left as it is', () => {
    mountControls({ puzzle: null });
    expect(root.querySelector('#difficulty-select').value).to.equal('medium');
    expect(unratedOption()).to.be.null;
  });
});
