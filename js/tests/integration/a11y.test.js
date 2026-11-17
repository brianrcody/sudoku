/**
 * @fileoverview Accessibility integration tests (A1–A22), and the debug
 * instrumentation's accessibility in the app (tspec-debug-instrumentation §8).
 *
 * All tests load the app in a hidden iframe. Live region assertions wait two
 * rAF frames (per srLive's clear-then-set pattern).
 */

import {
  createApp, waitFor, waitForPuzzle as waitForAppPuzzle, waitForDevPanel, appFrame, gsOf, seedSavedGame,
} from './_app.js';
import { KIDDIE, KIDDIE_SOLUTION } from '../fixtures/puzzles/loadable.js';
import { loadSessionFixture } from '../helpers/replayFixture.js';
import { twoActionDoc } from '../helpers/devSessionRig.js';

async function waitForPuzzle(iframe, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      const cellsReady = doc.querySelectorAll('.cell').length === 81;
      const gs = iframe.contentWindow?.gameState;
      const puzzleLoaded = gs && gs.getState().puzzle !== null;
      if (cellsReady && puzzleLoaded) return resolve();
      setTimeout(check, 100);
    }
    setTimeout(check, 300);
  });
}

function createIframe() {
  const iframe = document.createElement('iframe');
  iframe.src = '/index.html';
  iframe.style.cssText = 'width:1px;height:1px;position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(iframe);
  return iframe;
}

/** Waits two rAF cycles in the iframe's window to allow srLive to settle. */
async function waitTwoFrames(iframe) {
  await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
  await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
}

describe('integration/a11y', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(15000);
    localStorage.removeItem('sudoku.state.v1');
    iframe = createIframe();
    await waitForPuzzle(iframe);
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  function srLiveRegion() {
    return iframe.contentDocument.getElementById('sr-live');
  }

  function gameState() {
    return iframe.contentWindow.gameState;
  }

  // A1: Pen digit entry announces "Cell [row, col]: [digit]"
  it('A1: entering a pen digit announces the cell and digit', async function () {
    this.timeout(10000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });

    // Use the correct solution digit so no conflict announce overrides the
    // position announce.
    const correct = state.puzzle.solution[idx];
    const btns = iframe.contentDocument.querySelectorAll('.btn-digit');
    if (btns.length < 9) return this.skip();
    btns[correct - 1].click();

    await waitTwoFrames(iframe);
    const region = srLiveRegion();
    expect(region.textContent).to.not.equal('');
    // Should contain cell position info.
    expect(region.textContent.toLowerCase()).to.include('row');
  });

  // A2: Clear announces "Cell [r,c] cleared"
  it('A2: clear announces cell cleared', async function () {
    this.timeout(10000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit: 1 });
    await waitTwoFrames(iframe);

    // Click erase button.
    const eraseBtn = iframe.contentDocument.querySelector('#btn-clear');
    if (!eraseBtn) return this.skip();
    eraseBtn.click();
    await waitTwoFrames(iframe);

    expect(srLiveRegion().textContent.toLowerCase()).to.include('clear');
  });

  // A9: Win announces "Puzzle complete! Well done."
  it('A9: win state announces puzzle complete', async function () {
    this.timeout(15000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gs.dispatch({ type: 'SELECT_CELL', index: i });
        gs.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await waitTwoFrames(iframe);
    await waitTwoFrames(iframe);

    const text = srLiveRegion().textContent.toLowerCase();
    expect(text).to.satisfy(t => t.includes('complete') || t.includes('well done'));
  });

  // A10: Grid role="grid", cells role="gridcell"
  it('A10: grid has role=grid; cells have role=gridcell', async function () {
    const grid = iframe.contentDocument.querySelector('.sudoku-grid');
    expect(grid.getAttribute('role')).to.equal('grid');
    const cells = iframe.contentDocument.querySelectorAll('[role="gridcell"]');
    expect(cells.length).to.equal(81);
  });

  // A11: Given cells aria-readonly=true
  it('A11: given cells have aria-readonly=true', async function () {
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const cells = iframe.contentDocument.querySelectorAll('.cell');
    let foundGiven = false;
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] !== 0) {
        expect(cells[i].getAttribute('aria-readonly')).to.equal('true');
        foundGiven = true;
      }
    }
    if (!foundGiven) return this.skip(); // no givens in this puzzle (unlikely)
  });

  // A12: Selected cell aria-selected=true; others aria-selected=false
  it('A12: only the selected cell has aria-selected=true', async function () {
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    await new Promise(r => setTimeout(r, 100));

    const cells = iframe.contentDocument.querySelectorAll('.cell');
    let selectedCount = 0;
    for (const cell of cells) {
      if (cell.getAttribute('aria-selected') === 'true') selectedCount++;
    }
    expect(selectedCount).to.equal(1);
    expect(cells[idx].getAttribute('aria-selected')).to.equal('true');
  });

  // A13: Hint button label includes remaining count
  it('A13: hint button aria-label contains the remaining hint count', async function () {
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (state.puzzle?.difficulty === 'hard' || state.puzzle?.difficulty === 'expert') {
      return this.skip();
    }

    const hintBtn = iframe.contentDocument.querySelector('#btn-hint');
    if (!hintBtn) return this.skip();
    const label = hintBtn.getAttribute('aria-label');
    expect(label).to.not.be.null;
    // Should contain a number or 'unlimited'.
    expect(label.toLowerCase()).to.satisfy(l => /\d/.test(l) || l.includes('unlimited'));
  });

  // A14: Hint button label says "unlimited" for Kiddie
  it('A14: hint button aria-label says "unlimited" for Kiddie difficulty', async function () {
    const gs = gameState();
    if (!gs) return this.skip();

    // Skip if not kiddie — we can't change difficulty reliably here without full page context.
    const state = gs.getState();
    if (state.puzzle?.difficulty !== 'kiddie') return this.skip();

    const hintBtn = iframe.contentDocument.querySelector('#btn-hint');
    expect(hintBtn.getAttribute('aria-label').toLowerCase()).to.include('unlimited');
  });

  // A15: Pen/Pencil toggle label reflects current mode
  it('A15: mode button aria-label reflects current mode', async function () {
    const gs = gameState();
    if (!gs) return this.skip();

    const modeBtn = iframe.contentDocument.querySelector('#btn-mode');
    if (!modeBtn) return this.skip();

    // Default mode is pen — label should say "Switch to Pencil".
    expect(modeBtn.getAttribute('aria-label').toLowerCase()).to.include('pencil');

    gs.dispatch({ type: 'TOGGLE_MODE' });
    await new Promise(r => setTimeout(r, 100));

    expect(modeBtn.getAttribute('aria-label').toLowerCase()).to.include('pen');
  });

  // A16: Dialog role=dialog, aria-modal=true, aria-labelledby
  it('A16: confirmation dialog has correct ARIA attributes', async function () {
    const backdrop = iframe.contentDocument.querySelector('#modal-backdrop');
    if (!backdrop) return this.skip();
    expect(backdrop.getAttribute('role')).to.equal('dialog');
    expect(backdrop.getAttribute('aria-modal')).to.equal('true');
    expect(backdrop.getAttribute('aria-labelledby')).to.equal('modal-title');
  });

  // A17: Dialog open moves focus; close returns focus
  it('A17: opening the dialog moves focus; closing it returns focus to trigger', async function () {
    this.timeout(10000);
    const resetBtn = iframe.contentDocument.getElementById('btn-reset');
    if (!resetBtn) return this.skip();
    resetBtn.focus();

    resetBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const backdrop = iframe.contentDocument.querySelector('#modal-backdrop');
    expect(backdrop.classList.contains('open')).to.be.true;
    // Focus should be on cancel button.
    expect(iframe.contentDocument.activeElement.id).to.equal('modal-cancel');

    iframe.contentDocument.querySelector('#modal-cancel').click();
    await new Promise(r => setTimeout(r, 100));

    expect(iframe.contentDocument.activeElement).to.equal(resetBtn);
  });

  // A18: Win moves focus to New Puzzle button
  it('A18: focus moves to New Puzzle button on win', async function () {
    this.timeout(15000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gs.dispatch({ type: 'SELECT_CELL', index: i });
        gs.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));

    const newBtn = iframe.contentDocument.getElementById('btn-new');
    expect(iframe.contentDocument.activeElement).to.equal(newBtn);
  });

  // A19: Resume does not auto-focus a cell
  it('A19: on resume, activeElement is not a cell (body or wrapper is focused)', async function () {
    this.timeout(15000);
    // The active element on page load should be the body or a top-level element,
    // not a grid cell.
    const active = iframe.contentDocument.activeElement;
    const isCell = active?.classList.contains('cell');
    expect(isCell).to.be.false;
  });

  // A21: Undo button aria-label + disabled toggles with undoSnapshot
  it('A21: undo button has correct aria-label and disabled toggles with undoSnapshot', async function () {
    this.timeout(15000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const undoBtn = iframe.contentDocument.getElementById('btn-undo');
    if (!undoBtn) return this.skip();

    // aria-label must be exactly "Undo last move".
    expect(undoBtn.getAttribute('aria-label')).to.equal('Undo last move');

    // Disabled at load (no undoSnapshot).
    expect(undoBtn.disabled).to.be.true;

    // After pen entry — button should enable.
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    const digit = state.puzzle.solution[idx] === 9 ? 1 : 9;
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit });
    await new Promise(r => setTimeout(r, 100));
    expect(undoBtn.disabled).to.be.false;

    // After clicking Undo — button re-disables.
    undoBtn.click();
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
    expect(undoBtn.disabled).to.be.true;
  });

  // A20: Double-frame re-announce fires live region
  it('A20: announcing the same text twice clears then re-sets the live region', async function () {
    this.timeout(10000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    // Select a non-given cell and click the correct digit (no conflict announce).
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });

    const correct = state.puzzle.solution[idx];
    const btns = iframe.contentDocument.querySelectorAll('.btn-digit');
    if (btns.length < 9) return this.skip();
    const btn = btns[correct - 1];

    btn.click();
    await waitTwoFrames(iframe);
    const firstText = srLiveRegion().textContent;
    expect(firstText).to.not.equal('');

    // Numpad clicks bubble to a "click outside grid" handler that DESELECTs.
    // Re-select before each subsequent dispatch/click that depends on selected.
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'ERASE' });
    await waitTwoFrames(iframe);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    btn.click();
    // After synchronous clear — region should be '' before rAF fires.
    expect(srLiveRegion().textContent).to.equal('');
    await waitTwoFrames(iframe);
    // After rAF — text is re-set.
    expect(srLiveRegion().textContent).to.not.equal('');
  });

  // A22: #btn-erase-all aria-label, visible text, and disabled coupling
  it('A22: #btn-erase-all has correct aria-label and text; disabled at load, enabled after pencil mark, disabled after erase', async function () {
    this.timeout(15000);
    const gs = gameState();
    if (!gs) return this.skip();

    const state = gs.getState();
    if (!state.puzzle) return this.skip();

    const eraseAllBtn = iframe.contentDocument.getElementById('btn-erase-all');
    if (!eraseAllBtn) return this.skip();

    // aria-label and visible text.
    expect(eraseAllBtn.getAttribute('aria-label')).to.equal('Erase all pencil marks');
    expect(eraseAllBtn.textContent.trim()).to.equal('Erase all pencil');

    // Disabled at load (no pencil marks).
    expect(eraseAllBtn.disabled).to.be.true;

    // After adding a pencil mark — button enables.
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 4 });
    await new Promise(r => setTimeout(r, 100));
    expect(eraseAllBtn.disabled).to.be.false;

    // After ERASE_ALL_PENCIL fires — button re-disables.
    gs.dispatch({ type: 'ERASE_ALL_PENCIL' });
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
    await new Promise(r => iframe.contentWindow.requestAnimationFrame(r));
    expect(eraseAllBtn.disabled).to.be.true;
  });
});

// ---------------------------------------------------------------------------
// Debug instrumentation in the app (tspec-debug-instrumentation §8, Phase 8):
// keyboard reach, focus rings, the confirmation dialogs, and the
// single-announcement rule end to end.
// ---------------------------------------------------------------------------

describe('integration/a11y: debug instrumentation', function () {
  this.timeout(40000);

  let frame;

  afterEach(() => {
    frame?.remove();
    frame = null;
  });

  const $ = selector => frame.contentDocument.querySelector(selector);
  const $$ = selector => [...frame.contentDocument.querySelectorAll(selector)];
  const api = () => frame.contentWindow.sudokuDev;
  const active = () => frame.contentDocument.activeElement;
  const dialogOpen = () => $('#modal-backdrop').classList.contains('open');

  /** Developer mode over a saved Kiddie game; both new tool bodies open. */
  async function openDev({ entries } = {}) {
    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie', ...(entries ? { entries } : {}) });
    frame = createApp('/index.html?dev=1');
    await waitForAppPuzzle(frame);
    await waitForDevPanel(frame);
    await waitFor(() => api(), 20000, 'window.sudokuDev');
    frame.contentWindow.console.warn = () => {};
    $('#dev-rec').open = true;
    $('#dev-gen').open = true;
    await waitFor(() => frame.contentWindow.getComputedStyle($('#dev-badge')).position === 'fixed', 5000, 'dev.css');
  }

  /** Every non-empty text written to the live region while `fn` and its effects run, until `settled()` plus 1 s. */
  async function announcementsDuring(fn, settled) {
    const region = $('#sr-live');
    const texts = [];
    const observer = new frame.contentWindow.MutationObserver(() => {
      if (region.textContent !== '') texts.push(region.textContent);
    });
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    try {
      await fn();
      await waitFor(settled, 20000, 'the outcome');
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      observer.disconnect();
    }
    return texts;
  }

  /** The new controls of fspec-007 §11, in document order. */
  const NEW_CONTROLS = [
    '#dev-gen-copy', '#dev-gen-tier', '#dev-gen-seed', '#dev-gen-run',
    '#dev-rec > summary', '#dev-rec-copy', '#dev-rec-clear',
    '#dev-log-generation', '#dev-log-swallowed', '#dev-log-actions',
    '#dev-rec-doc', '#dev-rec-stop', '#dev-rec-replay',
  ];

  it('Tab reaches every new control in document order: all are focusable and none has a positive tabindex', async () => {
    await openDev();
    await api().generate('kiddie', 1, { replace: true });   // a recorded seed enables Copy seed
    const controls = NEW_CONTROLS.map(selector => $(selector));
    const inTabOrder = $$('#dev-root *').filter(el => el.tabIndex >= 0 && controls.includes(el));

    expect(inTabOrder).to.deep.equal(controls);
    expect($$('#dev-root [tabindex]').filter(el => el.tabIndex > 0)).to.deep.equal([]);
    for (const el of controls) {
      el.focus();
      expect(active(), el.id || el.tagName).to.equal(el);
    }
  });

  it('every new button, switch and disclosure is a native element, and Enter and Space on it reach neither the board nor a handler that blocks activation', async () => {
    await openDev();
    await api().generate('kiddie', 1, { replace: true });   // a seed row, so Copy seed exists
    gsOf(frame).dispatch({ type: 'SELECT_CELL', index: gsOf(frame).getState().puzzle.givens.indexOf(0) });
    const actions = [];
    gsOf(frame).on('changed', ({ action }) => actions.push(action.type));
    const activatable = NEW_CONTROLS.map(s => $(s)).filter(el => el.matches('button, summary'));

    const blocked = [];
    for (const el of activatable) {
      for (const key of ['Enter', ' ']) {
        el.focus();
        const event = new frame.contentWindow.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        if (event.defaultPrevented) blocked.push(`${el.id || 'summary'} ${key === ' ' ? 'Space' : key}`);
      }
    }

    expect(activatable.map(el => el.tagName)).to.deep.equal(
      ['BUTTON', 'BUTTON', 'SUMMARY', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']);
    expect(activatable.filter(el => el.tagName === 'BUTTON').every(el => el.type === 'button')).to.equal(true);
    expect(blocked).to.deep.equal([]);
    expect(actions).to.deep.equal([]);
  });

  describe('A39: :focus-visible rings on the new controls (vspec §7)', () => {
    /** A report with one divergence, so its summary and value blocks exist. */
    async function withDivergenceReport() {
      const doc = JSON.parse(await loadSessionFixture('coach-in-progress.json'));
      doc.actions.find(item => item.action.type === 'COACH_START').action.result.technique = 'Edited Technique';
      await api().replay(doc, { replace: true, discardHistory: true });
      $('.dev-diverge details').open = true;
    }

    const rings = [
      ['Copy session', '#dev-rec-copy', '2px'], ['Clear history', '#dev-rec-clear', '2px'],
      ['Replay', '#dev-rec-replay', '2px'], ['Generate', '#dev-gen-run', '2px'],
      ['Copy seed', '#dev-gen-copy', '2px'], ['the Session recorder summary', '#dev-rec > summary', '2px'],
      ['a logging switch', '#dev-log-actions', '2px'], ['the report region', '#dev-rec-report', '1px'],
      ['a divergence summary', '.dev-diverge summary', '1px'], ['a JSON value block', '.dev-diverge .dev-json', '1px'],
    ];
    for (const [label, selector, offset] of rings) {
      it(`${label} shows a 2px solid ring offset ${offset} when focused from the keyboard`, async () => {
        await openDev();
        await api().generate('kiddie', 1, { replace: true });
        // The replay puts a loaded puzzle on the board, which has no seed row; only report rings need it.
        if (/report|diverge/.test(selector)) await withDivergenceReport();
        const el = $(selector);

        el.focus();

        const style = frame.contentWindow.getComputedStyle(el);
        expect(el.matches(':focus-visible'), 'matches :focus-visible').to.equal(true);
        expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).to.deep.equal(['solid', '2px', offset]);
      });
    }
  });

  describe('A33 / A35 / A38: the new confirmation dialogs', () => {
    const dialogs = [
      ['Replay', '#dev-rec-replay', 'Replay this session?', () => { $('#dev-rec-doc').value = JSON.stringify(twoActionDoc()); }],
      ['Clear history', '#dev-rec-clear', 'Clear recorded history?', () => {}],
      ['Generate', '#dev-gen-run', 'Generate from this seed?', () => { $('#dev-gen-seed').value = '1'; }],
    ];
    for (const [label, trigger, title, prepare] of dialogs) {
      it(`${label}: a labelled, described modal dialog with Cancel focused; Escape cancels and focus returns to ${label}`, async () => {
        await openDev({ entries: { 2: 4 } });
        gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 3 });   // a recorded history
        prepare();
        $(trigger).focus();
        $(trigger).click();
        await waitFor(dialogOpen, 5000, 'the dialog');
        const dialog = $('[role="dialog"]');

        expect(dialog.getAttribute('aria-modal')).to.equal('true');
        expect($(`#${dialog.getAttribute('aria-labelledby')}`).textContent).to.equal(title);
        expect(dialog.getAttribute('aria-describedby')).to.equal('modal-body');
        expect(active()).to.equal($('#modal-cancel'));

        active().dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await waitFor(() => !dialogOpen(), 5000, 'the dialog to close');
        await waitFor(() => active() === $(trigger), 5000, `focus back on ${label}`);
      });
    }
  });

  describe('A42: one announcement per replay, end to end', () => {
    const outcome = () => $('#dev-rec-replay-status').textContent;
    const EXPECTED = 'Session replayed: 480 of 480 actions. No divergences in 41 computed results. 1 not compared.';

    it('a panel replay of a won game full of announcing actions announces only its outcome', async () => {
      await openDev();
      $('#dev-rec-doc').value = await loadSessionFixture('format-v1-baseline.json');

      const texts = await announcementsDuring(() => $('#dev-rec-replay').click(), () => outcome().startsWith('Session replayed'));

      expect(texts).to.deep.equal([EXPECTED]);
    });

    it('A42b: the same replay through the API announces only its outcome', async () => {
      await openDev();
      const doc = JSON.parse(await loadSessionFixture('format-v1-baseline.json'));

      const texts = await announcementsDuring(
        () => { api().replay(doc, { replace: true, discardHistory: true }); }, () => outcome().startsWith('Session replayed'));

      expect(texts).to.deep.equal([EXPECTED]);
    });
  });

  it('A31: focus stays on Replay after a rejection', async () => {
    await openDev();
    $('#dev-rec-doc').value = '{';
    $('#dev-rec-replay').focus();

    $('#dev-rec-replay').click();
    await waitFor(() => $('#dev-rec-replay-status').textContent.startsWith('This session'), 5000, 'the rejection');
    await appFrame(frame);

    expect(active()).to.equal($('#dev-rec-replay'));
  });

  it('A41: API calls that change something announce it, reads announce nothing, and focus never moves', async () => {
    await openDev();
    const cell = $('.cell[data-index="2"]');
    cell.focus();

    const reads = await announcementsDuring(() => { api().state(); api().logging(); api().exportSession(); }, () => true);
    const changes = await announcementsDuring(async () => {
      api().setLogging('actions', true);
      await appFrame(frame);
      api().clearHistory({ discardHistory: true });
    }, () => true);

    expect(reads).to.deep.equal([]);
    expect(changes).to.include.members(['Action trace logging on.', 'History cleared.']);
    expect($('#dev-log-actions').getAttribute('aria-checked')).to.equal('true');
    expect(active()).to.equal(cell);
  });
});
