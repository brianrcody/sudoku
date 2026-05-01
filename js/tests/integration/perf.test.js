/**
 * @fileoverview Performance gate for v1 sign-off.
 *
 * Measures wall-clock duration for every user-facing action listed in
 * docs/misc/next-session.md against the CLAUDE.md / tspec §17 budgets:
 * - Non-generation actions: <1 s
 * - Death March cold-start generation: <5 s (per aspec §17 / SYS3)
 *
 * Each test logs the measured time so the perf report can be captured
 * even when assertions pass with margin.
 */

const NON_GEN_BUDGET_MS = 1000;
const DM_GEN_BUDGET_MS = 5000;
const TIERS = ['kiddie', 'easy', 'medium', 'hard', 'death-march'];

async function waitForPuzzle(iframe, timeoutMs = 15000) {
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

async function loadIframe(timeoutMs = 15000) {
  const iframe = createIframe();
  await waitForPuzzle(iframe, timeoutMs);
  return iframe;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('Timed out waiting for predicate');
}

async function waitForGameState(iframe, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (iframe.contentWindow.gameState?.getState().puzzle) return iframe.contentWindow.gameState;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for gameState');
}

describe('integration/perf', () => {
  let iframe;

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  /**
   * New Puzzle for each tier — clicks the New Puzzle button after setting
   * the difficulty to the target tier. Times wall-clock from click to
   * the new puzzle being installed (state.puzzle.id changes).
   *
   * Death March uses a 5 s budget per aspec §17 / SYS3; all other tiers
   * use the 1 s general action budget.
   */
  TIERS.forEach(tier => {
    it(`PERF-NEW-${tier}: New Puzzle (${tier}) within budget`, async function () {
      this.timeout(20000);
      iframe = await loadIframe();
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      const gs = await waitForGameState(iframe);

      const initialId = gs.getState().puzzle.id;
      const budget = tier === 'death-march' ? DM_GEN_BUDGET_MS : NON_GEN_BUDGET_MS;

      // Set the difficulty so _startNewPuzzle uses the requested tier.
      gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: tier });

      const btnNew = doc.getElementById('btn-new');
      if (!btnNew) return this.skip();

      const t0 = win.performance.now();
      btnNew.click();
      // No progress on fresh load → goes straight to _startNewPuzzle (no dialog).
      await waitFor(() => {
        const s = gs.getState();
        return s.puzzle && s.puzzle.id !== initialId && s.puzzle.difficulty === tier;
      }, budget + 500);
      const elapsed = win.performance.now() - t0;

      console.log(`[PERF] New Puzzle (${tier}): ${elapsed.toFixed(0)} ms (budget ${budget} ms)`);
      expect(elapsed).to.be.below(budget);
    });
  });

  it('PERF-RESET: Reset Puzzle within 1 s', async function () {
    this.timeout(15000);
    iframe = await loadIframe();
    const win = iframe.contentWindow;
    const gs = await waitForGameState(iframe);

    const state = gs.getState();
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit: 1 });

    const t0 = win.performance.now();
    gs.dispatch({ type: 'RESET_PUZZLE' });
    const elapsed = win.performance.now() - t0;

    console.log(`[PERF] Reset Puzzle: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(gs.getState().pen[idx]).to.equal(0);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });

  it('PERF-PEN-CONFLICT: Pen entry → conflict highlight within 1 s', async function () {
    this.timeout(15000);
    iframe = await loadIframe();
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    const gs = await waitForGameState(iframe);
    const state = gs.getState();

    let a = -1, b = -1;
    const digit = 1;
    for (let row = 0; row < 9 && a < 0; row++) {
      const empty = [];
      for (let c = 0; c < 9; c++) {
        const i = row * 9 + c;
        if (state.puzzle.givens[i] === 0) empty.push(i);
      }
      if (empty.length >= 2) { a = empty[0]; b = empty[1]; }
    }
    if (a < 0) return this.skip();

    gs.dispatch({ type: 'SELECT_CELL', index: a });
    gs.dispatch({ type: 'PEN_ENTER', digit });

    const t0 = win.performance.now();
    gs.dispatch({ type: 'SELECT_CELL', index: b });
    gs.dispatch({ type: 'PEN_ENTER', digit });
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + NON_GEN_BUDGET_MS + 200;
      function check() {
        const cells = doc.querySelectorAll('.cell');
        if (cells[a]?.classList.contains('conflict') && cells[b]?.classList.contains('conflict')) {
          return resolve();
        }
        if (Date.now() > deadline) return reject(new Error('Conflict class never applied'));
        win.requestAnimationFrame(check);
      }
      check();
    });
    const elapsed = win.performance.now() - t0;
    console.log(`[PERF] Pen entry → conflict highlight: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });

  it('PERF-HINT: Hint dispatch within 1 s', async function () {
    this.timeout(15000);
    iframe = await loadIframe();
    const win = iframe.contentWindow;
    const gs = await waitForGameState(iframe);

    const state = gs.getState();
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    const beforeRemaining = gs.getState().hintsRemaining;
    if (beforeRemaining === 0) return this.skip();

    const t0 = win.performance.now();
    gs.dispatch({ type: 'HINT' });
    const elapsed = win.performance.now() - t0;
    console.log(`[PERF] Hint: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });

  it('PERF-CHECK: Check dispatch within 1 s', async function () {
    this.timeout(15000);
    iframe = await loadIframe();
    const win = iframe.contentWindow;
    const gs = await waitForGameState(iframe);

    const state = gs.getState();
    const idx = [...Array(81).keys()].find(i => state.puzzle.givens[i] === 0);
    const wrong = state.puzzle.solution[idx] === 1 ? 2 : 1;
    gs.dispatch({ type: 'SELECT_CELL', index: idx });
    gs.dispatch({ type: 'PEN_ENTER', digit: wrong });

    const t0 = win.performance.now();
    gs.dispatch({ type: 'CHECK' });
    const elapsed = win.performance.now() - t0;
    console.log(`[PERF] Check: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });

  it('PERF-DIFFICULTY: Difficulty change dispatch within 1 s', async function () {
    this.timeout(15000);
    iframe = await loadIframe();
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    const gs = await waitForGameState(iframe);

    const select = doc.getElementById('difficulty-select');
    if (!select) return this.skip();
    const initial = gs.getState();
    const target = initial.puzzle.difficulty === 'easy' ? 'medium' : 'easy';

    const t0 = win.performance.now();
    select.value = target;
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    await waitFor(() => gs.getState().puzzle?.difficulty === target, NON_GEN_BUDGET_MS + 200);
    const elapsed = win.performance.now() - t0;
    console.log(`[PERF] Difficulty change to ${target}: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });
});
