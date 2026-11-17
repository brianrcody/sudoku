/**
 * @fileoverview Performance gate for v1 sign-off.
 *
 * Measures wall-clock duration for every user-facing action listed in
 * docs/misc/next-session.md against the CLAUDE.md / tspec §17 budgets:
 * - Non-generation actions: <1 s
 * - Expert cold-start generation: <5 s (per aspec §17 / SYS3)
 * - Nightmare cold-start generation: <15 s (fspec-003 §5.1 band)
 *
 * Each test logs the measured time so the perf report can be captured
 * even when assertions pass with margin.
 */

import {
  createApp, waitFor as waitUntil, waitForPuzzle as waitForAppPuzzle, waitForDevPanel, seedSavedGame,
} from './_app.js';
import { KIDDIE, KIDDIE_SOLUTION } from '../fixtures/puzzles/loadable.js';
import { longSessionDocument } from '../helpers/longSession.js';
import { readDb } from '../helpers/fakeIdb.js';
import { RECORDER_DB } from '../../dev/devMode.js';

const NON_GEN_BUDGET_MS = 1000;
const MEDIUM_GEN_BUDGET_MS = 1500;
const HARD_GEN_BUDGET_MS = 2000;
const EXPERT_GEN_BUDGET_MS = 5000;
const NIGHTMARE_GEN_BUDGET_MS = 15000;
// Diabolical's cold-start is seeded-validated at the pipeline level
// (PL12) and manually validated in-browser (PerformanceV3.md) — its accept
// rate (~0.8%/attempt) makes an unseeded UI-path assertion flaky.
const TIERS = ['kiddie', 'easy', 'medium', 'hard', 'expert', 'nightmare'];

async function waitForPuzzle(iframe, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for puzzle'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      // The grid renders 81 cells at mount, before the boot-time worker puzzle
      // lands. Wait for state.puzzle too, so the in-flight PUZZLE_LOADED can't
      // fire mid-test.
      const cellsReady = doc.querySelectorAll('.cell').length === 81;
      const gsObj = iframe.contentWindow?.gameState;
      const puzzleLoaded = gsObj && gsObj.getState().puzzle !== null;
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
      this.timeout(60000);
      iframe = await loadIframe();
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      const gs = await waitForGameState(iframe);

      const budget = tier === 'nightmare' ? NIGHTMARE_GEN_BUDGET_MS
        : tier === 'expert' ? EXPERT_GEN_BUDGET_MS
        : tier === 'hard' ? HARD_GEN_BUDGET_MS
        : tier === 'medium' ? MEDIUM_GEN_BUDGET_MS
        : NON_GEN_BUDGET_MS;

      // Choosing the tier generates a puzzle there (untimed); New Puzzle then
      // generates another at the current puzzle's tier, which is what is timed.
      // A run can fall back to another tier when its attempt budget runs out
      // (about 7% of Medium runs), so completion never waits on the achieved
      // tier: the untimed step is repeated until the current puzzle is at the
      // tier, so that New Puzzle requests that tier.
      for (let tries = 0; tries < 5; tries++) {
        const before = gs.getState().puzzle.id;
        gs.dispatch({ type: 'CHANGE_DIFFICULTY', difficulty: tier });
        await waitFor(() => {
          const s = gs.getState();
          return !s.generating && s.puzzle.id !== before;
        }, 25000);
        if (gs.getState().puzzle.difficulty === tier) break;
      }
      expect(gs.getState().puzzle.difficulty, 'puzzle at the tier before timing').to.equal(tier);
      const priorId = gs.getState().puzzle.id;

      const btnNew = doc.getElementById('btn-new');
      if (!btnNew) return this.skip();

      const t0 = win.performance.now();
      btnNew.click();
      // No progress on fresh load → goes straight to _startNewPuzzle (no dialog).
      // Any achieved tier completes the request, fallback included.
      await waitFor(() => {
        const s = gs.getState();
        return s.puzzle && !s.generating && s.puzzle.id !== priorId;
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
    // A difficulty change generates a puzzle; the two fastest tiers keep this
    // inside the non-generation budget.
    const target = initial.puzzle.difficulty === 'kiddie' ? 'easy' : 'kiddie';

    const t0 = win.performance.now();
    select.value = target;
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    await waitFor(() => gs.getState().puzzle?.difficulty === target, NON_GEN_BUDGET_MS + 200);
    const elapsed = win.performance.now() - t0;
    console.log(`[PERF] Difficulty change to ${target}: ${elapsed.toFixed(2)} ms (budget ${NON_GEN_BUDGET_MS} ms)`);
    expect(elapsed).to.be.below(NON_GEN_BUDGET_MS);
  });
});

// ---------------------------------------------------------------------------
// Debug instrumentation (tspec-debug-instrumentation §9): every bound is the
// 1-second action budget; the aspec's expected values are logged for trend.
// ---------------------------------------------------------------------------

describe('integration/perf: debug instrumentation', function () {
  this.timeout(90000);

  const CAPACITY = 5000;
  const DEV_FLAG_KEY = 'sudoku.dev.v1';
  let frame;

  afterEach(() => {
    frame?.remove();
    frame = null;
  });

  const $ = selector => frame.contentDocument.querySelector(selector);
  const api = () => frame.contentWindow.sudokuDev;
  const gs = () => frame.contentWindow.gameState;
  const now = () => frame.contentWindow.performance.now();
  const nextFrame = () => new Promise(r => frame.contentWindow.requestAnimationFrame(() => r()));

  /** Developer mode over a saved Kiddie game; the app's console is silenced. */
  async function openDev(src = '/index.html?dev=1') {
    frame = createApp(src);
    for (const method of ['log', 'warn']) frame.contentWindow.console[method] = () => {};
    await waitForAppPuzzle(frame);
    await waitForDevPanel(frame);
    await waitUntil(() => api(), 20000, 'window.sudokuDev');
    for (const method of ['log', 'warn']) frame.contentWindow.console[method] = () => {};
  }

  /** Records selections until the history is at capacity. */
  function fillHistory() {
    for (let i = 0; gs() && api().state().recorder.actions < CAPACITY; i++) {
      gs().dispatch({ type: 'SELECT_CELL', index: i % 2 === 0 ? 2 : 3 });
    }
  }

  /** A digit typed on the keyboard into an empty cell; resolves with the time until it is drawn. */
  async function timeDigitEntry(cell, digit) {
    gs().dispatch({ type: 'SET_MODE', mode: 'pen' });
    gs().dispatch({ type: 'SELECT_CELL', index: cell });
    const el = $(`.cell[data-index="${cell}"]`);
    const t0 = now();
    frame.contentDocument.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: String(digit), bubbles: true }));
    while (el.textContent !== String(digit)) {
      if (now() - t0 > 2000) throw new Error('the digit was never drawn');
      await nextFrame();
    }
    return now() - t0;
  }

  const report = (label, ms, expected) =>
    console.log(`[PERF] ${label}: ${ms.toFixed(1)} ms (bound 1000 ms${expected ? `, expected ${expected}` : ''})`);

  beforeEach(() => {
    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
  });

  it('PERF-D1: a digit typed with every logging switch on and the history at capacity is drawn within 1 s', async () => {
    await openDev();
    fillHistory();
    for (const category of ['generation', 'swallowed', 'actions']) api().setLogging(category, true);

    const ms = await timeDigitEntry(KIDDIE.indexOf('0'), 5);

    report('PERF-D1 digit entry, logging on, history at capacity', ms, 'a few ms');
    expect(api().state().recorder.actions).to.equal(CAPACITY);
    expect(ms).to.be.below(1000);
  });

  describe('replaying a 5,000-action document', () => {
    let doc;
    before(async function () {
      this.timeout(60000);
      doc = await longSessionDocument({ actions: CAPACITY });
    });

    it('PERF-D2: steps 5–6 (replace and apply) take under 1 s', async () => {
      await openDev();
      const reportArea = $('#dev-rec-report');
      // The commit's first visible step empties the report area (fspec §5.2 step 5).
      let t0 = null;
      const replaceChildren = reportArea.replaceChildren;
      reportArea.replaceChildren = function (...nodes) {
        t0 ??= now();
        return replaceChildren.apply(this, nodes);
      };
      let applied = null;
      gs().on('changed', ({ action }) => {
        if (applied === null && action.type === 'DEV_RESTORE_POSITION') {
          frame.contentWindow.requestAnimationFrame(() => { applied = now(); });
        }
      });
      const started = now();

      const result = await api().replay(doc, { replace: true, discardHistory: true });
      await waitUntil(() => applied !== null, 5000, 'the frame after the commit');

      const ms = applied - t0;
      const coach = doc.actions.filter(item => item.action.type === 'COACH_START').length;
      const hints = doc.actions.filter(item => item.action.type === 'HINT').length;
      report(`PERF-D2 replay steps 5–6, ${doc.actions.length} actions (${coach} coach starts, ${hints} hints); `
        + `whole replay ${(now() - started).toFixed(0)} ms`, ms, '< 150 ms');
      expect(result.ok).to.equal(true);
      expect(result.applied).to.equal(CAPACITY);
      expect(ms).to.be.below(1000);
    });

    it('PERF-D4: the board answers a digit within 1 s while the replay is comparing', async () => {
      await openDev();
      const win = frame.contentWindow;
      const status = $('#dev-rec-replay-status');
      const COMPARING = 'Comparing with current code…';
      let measured = null;
      const gaps = [];
      new win.MutationObserver((records, observer) => {
        if (status.textContent !== COMPARING) return;
        observer.disconnect();
        // Between comparison slices: time a digit, and the longest slice the event loop waited for.
        let last = now();
        const tick = () => {
          gaps.push(now() - last);
          last = now();
          if (status.textContent === COMPARING) win.setTimeout(tick, 0);
        };
        win.setTimeout(tick, 0);
        win.setTimeout(() => {
          const { pen, puzzle } = gs().getState();
          const cell = pen.findIndex((d, i) => d === 0 && puzzle.givens[i] === 0);
          measured = { during: status.textContent === COMPARING, promise: timeDigitEntry(cell, 9) };
        }, 0);
      }).observe(status, { childList: true, characterData: true, subtree: true });

      await api().replay(doc, { replace: true, discardHistory: true });
      await waitUntil(() => measured !== null, 5000, 'the digit entry');
      const ms = await measured.promise;

      console.log(`[PERF] PERF-D4 longest comparison slice: ${Math.max(...gaps).toFixed(1)} ms over ${gaps.length} slices (expected < 100 ms)`);
      report('PERF-D4 digit entry while comparing', ms);
      expect(measured.during, 'the digit was typed while comparing').to.equal(true);
      expect(ms).to.be.below(1000);
    });
  });

  describe('at capacity', () => {
    it('PERF-D5: Copy session completes within 1 s', async () => {
      await openDev();
      fillHistory();
      Object.defineProperty(frame.contentWindow.navigator, 'clipboard',
        { value: { writeText: () => Promise.resolve() }, configurable: true });
      $('#dev-rec').open = true;
      const statusLine = $('#dev-rec-history-status');

      const t0 = now();
      $('#dev-rec-copy').click();
      await waitUntil(() => statusLine.textContent.startsWith('Session copied'), 5000, 'the copy outcome');
      const ms = now() - t0;

      report('PERF-D5 Copy session at capacity', ms);
      expect(statusLine.textContent).to.equal('Session copied: 5,000 actions, 0 errors.');
      expect(ms).to.be.below(1000);
    });

    it('PERF-D6: export and Clear history each complete within 1 s', async () => {
      await openDev();
      fillHistory();

      let t0 = now();
      const exported = api().exportSession();
      const exportMs = now() - t0;
      t0 = now();
      const cleared = api().clearHistory({ discardHistory: true });
      const clearMs = now() - t0;

      report('PERF-D6 export at capacity', exportMs);
      report('PERF-D6 Clear history at capacity', clearMs);
      expect(exported.document.actions).to.have.length(CAPACITY);
      expect(cleared.discarded.actions).to.equal(CAPACITY);
      expect(exportMs).to.be.below(1000);
      expect(clearMs).to.be.below(1000);
    });

    it('PERF-D7: a boot over a full stored history has the panel ready within 1 s of a normal boot', async () => {
      await openDev();
      fillHistory();
      await waitForStored(CAPACITY);
      frame.remove();
      const flag = localStorage.getItem(DEV_FLAG_KEY);

      localStorage.removeItem(DEV_FLAG_KEY);
      let t0 = performance.now();
      frame = createApp('/index.html');
      await waitForAppPuzzle(frame);
      const normal = performance.now() - t0;
      frame.remove();
      localStorage.setItem(DEV_FLAG_KEY, flag);
      t0 = performance.now();
      frame = createApp('/index.html');
      for (const method of ['log', 'warn']) frame.contentWindow.console[method] = () => {};
      await waitUntil(() => $('#dev-rec-counts')?.textContent.startsWith('5,000 actions'), 20000, 'the panel with the stored history');
      const dev = performance.now() - t0;

      console.log(`[PERF] PERF-D7 boot over ${CAPACITY} stored entries: panel ready ${dev.toFixed(0)} ms, `
        + `normal boot ${normal.toFixed(0)} ms, difference ${(dev - normal).toFixed(0)} ms (bound 1000 ms)`);
      expect(dev - normal).to.be.below(1000);
    });
  });

  for (const tier of ['kiddie', 'easy']) {
    it(`PERF-D8: a seeded ${tier} generation through the API completes within 1 s`, async () => {
      await openDev();

      const t0 = now();
      const result = await api().generate(tier, 7, { replace: true });
      const ms = now() - t0;

      report(`PERF-D8 seeded ${tier} generation`, ms);
      expect(result.ok).to.equal(true);
      expect(ms).to.be.below(1000);
    });
  }

  /** Waits until the recorder database holds `n` entries. */
  async function waitForStored(n) {
    const deadline = Date.now() + 20000;
    while ((await readDb(RECORDER_DB))?.entries.length !== n) {
      if (Date.now() > deadline) throw new Error(`the stored history never reached ${n} entries`);
      await new Promise(r => setTimeout(r, 100));
    }
  }
});
