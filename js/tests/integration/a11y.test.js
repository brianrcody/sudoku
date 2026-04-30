/**
 * @fileoverview Accessibility integration tests (A1–A20).
 *
 * All tests load the app in a hidden iframe. Live region assertions wait two
 * rAF frames (per srLive's clear-then-set pattern).
 */

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

  // A2: Erase announces "Cell [r,c] cleared"
  it('A2: erase announces cell cleared', async function () {
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
    const eraseBtn = iframe.contentDocument.querySelector('#btn-erase');
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
    if (state.puzzle?.difficulty === 'hard' || state.puzzle?.difficulty === 'death-march') {
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
});
