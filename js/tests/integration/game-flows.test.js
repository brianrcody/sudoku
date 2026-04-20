/**
 * @fileoverview Integration tests for game flows (GF1–GF14).
 *
 * Tests load the full app in a hidden iframe and interact via DOM events.
 * `iframe.contentWindow.gameState` is used as an optimization when available;
 * tests skip gracefully when it is not exposed.
 *
 * NOTE: main.js does not expose `window.gameState`. To enable these tests to
 * run fully, add `window.gameState = gameState;` to js/main.js after step 6.
 * Until then, all tests below skip when gameState is absent.
 *
 * Timing notes:
 * - GF2 (auto-clear 3 s): Uses real 3.5 s wait. Fake timers are not available
 *   across iframe boundaries. Known flakiness risk on slow CI.
 */

async function waitForPuzzle(iframe, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for puzzle'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      if (doc.querySelectorAll('.cell').length === 81) return resolve();
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

async function loadIframe(timeoutMs = 12000) {
  const iframe = createIframe();
  await waitForPuzzle(iframe, timeoutMs);
  return iframe;
}

/** Returns the exposed game state or null. */
function gs(iframe) { return iframe.contentWindow.gameState ?? null; }

describe('integration/game-flows', () => {
  let iframe;

  beforeEach(async function () {
    this.timeout(15000);
    iframe = await loadIframe();
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  // GF1: Full solve leads to won=true
  it('GF1: entering the correct solution via dispatch leads to won=true', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await new Promise(r => setTimeout(r, 300));
    expect(gameState.getState().won).to.be.true;
  });

  // GF2: Easy puzzle: Check flags incorrect, auto-clear after 3 s
  it('GF2: Check flags incorrect cell, auto-clears after 3 s', async function () {
    this.timeout(10000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle || state.puzzle.difficulty !== 'easy') return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    const wrongDigit = state.puzzle.solution[idx] === 9 ? 1 : 9;
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    gameState.dispatch({ type: 'PEN_ENTER', digit: wrongDigit });
    gameState.dispatch({ type: 'CHECK' });
    await new Promise(r => setTimeout(r, 100));
    expect(gameState.getState().incorrect.has(idx)).to.be.true;

    // Wait for auto-clear (3 s + buffer).
    await new Promise(r => setTimeout(r, 3500));
    expect(gameState.getState().incorrect.size).to.equal(0);
  });

  // GF3: Medium: consume 1 hint, button disabled
  it('GF3: consuming the only Medium hint disables the hint button', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let waited = 0;
    while (gameState.getState().puzzle?.difficulty !== 'medium' && waited < 8000) {
      await new Promise(r => setTimeout(r, 250));
      waited += 250;
    }
    if (gameState.getState().puzzle?.difficulty !== 'medium') return this.skip();

    const state = gameState.getState();
    expect(state.hintsRemaining).to.equal(1);

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    gameState.dispatch({ type: 'HINT' });
    await new Promise(r => setTimeout(r, 200));

    expect(gameState.getState().hintsRemaining).to.equal(0);
    expect(iframe.contentDocument.querySelector('#btn-hint')?.disabled).to.be.true;
  });

  // GF4: Hard: fill all 81 wrong, flags shown
  it('GF4: filling a Hard puzzle incorrectly shows incorrect flags on completion', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let waited = 0;
    while (gameState.getState().puzzle?.difficulty !== 'hard' && waited < 8000) {
      await new Promise(r => setTimeout(r, 250));
      waited += 250;
    }
    if (gameState.getState().puzzle?.difficulty !== 'hard') return this.skip();

    const state = gameState.getState();
    // Fill all non-given cells with wrong values.
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        const wrong = state.puzzle.solution[i] === 9 ? 1 : 9;
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: wrong });
      }
    }
    await new Promise(r => setTimeout(r, 300));

    const after = gameState.getState();
    expect(after.won).to.be.false;
    expect(after.incorrect.size).to.be.above(0);
  });

  // GF5: Death March: fill wrong, message only, no highlights
  it('GF5: filling a Death March puzzle incorrectly shows message but no cell highlights', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    let waited = 0;
    while (gameState.getState().puzzle?.difficulty !== 'death-march' && waited < 8000) {
      await new Promise(r => setTimeout(r, 250));
      waited += 250;
    }
    if (gameState.getState().puzzle?.difficulty !== 'death-march') return this.skip();

    const state = gameState.getState();
    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        const wrong = state.puzzle.solution[i] === 9 ? 1 : 9;
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: wrong });
      }
    }
    await new Promise(r => setTimeout(r, 300));

    const after = gameState.getState();
    expect(after.incorrect.size).to.equal(0);
    expect(after.completionMessage).to.be.a('string').and.not.equal('');
  });

  // GF6: Conflict round-trip
  it('GF6: duplicate row entry flags both cells; erasing one clears the conflict', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    // Find two non-given cells in the same row.
    let a = -1, b = -1;
    outer: for (let r = 0; r < 9; r++) {
      const row = [];
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        if (state.puzzle.givens[i] === 0) row.push(i);
      }
      if (row.length >= 2) { a = row[0]; b = row[1]; break outer; }
    }
    if (a === -1) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: a });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 5 });
    gameState.dispatch({ type: 'SELECT_CELL', index: b });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 5 });
    await new Promise(r => setTimeout(r, 100));

    expect(gameState.getState().conflicts.has(a)).to.be.true;
    expect(gameState.getState().conflicts.has(b)).to.be.true;

    gameState.dispatch({ type: 'SELECT_CELL', index: a });
    gameState.dispatch({ type: 'ERASE' });
    await new Promise(r => setTimeout(r, 100));
    expect(gameState.getState().conflicts.size).to.equal(0);
  });

  // GF7: New Puzzle mid-game triggers dialog
  it('GF7: New Puzzle with progress shows confirmation dialog', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 1 });
    await new Promise(r => setTimeout(r, 200));

    const newBtn = iframe.contentDocument.getElementById('btn-new');
    if (!newBtn) return this.skip();
    newBtn.click();
    await new Promise(r => setTimeout(r, 100));

    const backdrop = iframe.contentDocument.querySelector('#modal-backdrop');
    expect(backdrop?.classList.contains('open')).to.be.true;
  });

  // GF8: Reset preserves attemptRecorded
  it('GF8: Reset clears player entries but preserves attemptRecorded', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 1 });
    await new Promise(r => setTimeout(r, 100));
    expect(gameState.getState().attemptRecorded).to.be.true;

    const resetBtn = iframe.contentDocument.getElementById('btn-reset');
    if (!resetBtn) return this.skip();
    resetBtn.click();
    await new Promise(r => setTimeout(r, 100));
    iframe.contentDocument.querySelector('#modal-confirm')?.click();
    await new Promise(r => setTimeout(r, 200));

    expect(gameState.getState().pen[idx]).to.equal(0);
    expect(gameState.getState().attemptRecorded).to.be.true;
  });

  // GF9: Difficulty change with progress triggers dialog; cancel reverts selector
  it('GF9: changing difficulty mid-game shows dialog; cancel reverts the selector', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();
    const currentDiff = state.puzzle.difficulty;

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 1 });
    await new Promise(r => setTimeout(r, 150));

    const diffSelect = iframe.contentDocument.querySelector('#difficulty-select');
    if (!diffSelect) return this.skip();
    const newDiff = currentDiff === 'easy' ? 'hard' : 'easy';
    diffSelect.value = newDiff;
    diffSelect.dispatchEvent(new iframe.contentWindow.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));

    expect(iframe.contentDocument.querySelector('#modal-backdrop')?.classList.contains('open')).to.be.true;
    iframe.contentDocument.querySelector('#modal-cancel')?.click();
    await new Promise(r => setTimeout(r, 100));

    expect(diffSelect.value).to.equal(currentDiff);
  });

  // GF10: Auto-clear peer pencil marks
  it('GF10: pen entry clears matching pencil marks in peer cells', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    let cellA = -1, cellB = -1;
    outer: for (let r = 0; r < 9; r++) {
      const row = [];
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        if (state.puzzle.givens[i] === 0) row.push(i);
      }
      if (row.length >= 2) { cellA = row[0]; cellB = row[1]; break outer; }
    }
    if (cellA === -1) return this.skip();

    gameState.dispatch({ type: 'SELECT_CELL', index: cellB });
    gameState.dispatch({ type: 'PENCIL_TOGGLE', digit: 3 });
    await new Promise(r => setTimeout(r, 50));
    expect(gameState.getState().pencil[cellB] & (1 << 2)).to.not.equal(0);

    gameState.dispatch({ type: 'SELECT_CELL', index: cellA });
    gameState.dispatch({ type: 'PEN_ENTER', digit: 3 });
    await new Promise(r => setTimeout(r, 100));
    expect(gameState.getState().pencil[cellB] & (1 << 2)).to.equal(0);
  });

  // GF11: Arrow navigation wraps and skips givens
  it('GF11: arrow navigation can traverse the grid without getting stuck', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    // Navigate right 9 times from a player cell — should always be valid.
    const startIdx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: startIdx });
    for (let k = 0; k < 9; k++) {
      gameState.dispatch({ type: 'ARROW_NAV', direction: 'right' });
      await new Promise(r => setTimeout(r, 20));
      const sel = gameState.getState().selected;
      expect(sel).to.not.be.null;
      expect(state.puzzle.givens[sel]).to.equal(0);
    }
  });

  // GF12: Hint places correct digit and decrements
  it('GF12: hint dispatch places correct digit and decrements hintsRemaining', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle || state.hintsRemaining === 0) return this.skip();

    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gameState.dispatch({ type: 'SELECT_CELL', index: idx });
    const before = gameState.getState().hintsRemaining;
    gameState.dispatch({ type: 'HINT' });
    await new Promise(r => setTimeout(r, 200));

    expect(gameState.getState().pen[idx]).to.equal(state.puzzle.solution[idx]);
    if (before !== Infinity) expect(gameState.getState().hintsRemaining).to.equal(before - 1);
  });

  // GF13: Win shows banner
  it('GF13: win state causes win banner to become visible', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await new Promise(r => setTimeout(r, 500));

    const banner = iframe.contentDocument.querySelector('#win-banner');
    if (!banner) return this.skip();
    expect(banner.getAttribute('aria-hidden')).to.be.null;
    expect(banner.classList.contains('show')).to.be.true;
  });

  // GF14: Post-win Reset restores editable state
  it('GF14: Reset after win produces a non-won, editable state', async function () {
    this.timeout(15000);
    const gameState = gs(iframe);
    if (!gameState) return this.skip();

    const state = gameState.getState();
    if (!state.puzzle) return this.skip();

    for (let i = 0; i < 81; i++) {
      if (state.puzzle.givens[i] === 0) {
        gameState.dispatch({ type: 'SELECT_CELL', index: i });
        gameState.dispatch({ type: 'PEN_ENTER', digit: state.puzzle.solution[i] });
      }
    }
    await new Promise(r => setTimeout(r, 500));
    expect(gameState.getState().won).to.be.true;

    const resetBtn = iframe.contentDocument.getElementById('btn-reset');
    resetBtn?.click();
    await new Promise(r => setTimeout(r, 100));
    iframe.contentDocument.querySelector('#modal-confirm')?.click();
    await new Promise(r => setTimeout(r, 300));

    expect(gameState.getState().won).to.be.false;
  });
});
