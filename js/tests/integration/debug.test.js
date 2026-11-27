/**
 * @fileoverview Integration tests for the debug instrumentation
 * (tspec-debug-instrumentation), grouped by implementation phase.
 */

import {
  createApp, gsOf, waitForPuzzle, waitFor, waitForDevPanel, seedSavedGame, appFrame, enter, readStats,
  STATE_KEY, DIFF_KEY, PREGEN_PREFIX,
} from './_app.js';
import { kiddie } from '../fixtures/puzzles/kiddie.js';
import { KIDDIE, KIDDIE_SOLUTION, MEDIUM } from '../fixtures/puzzles/loadable.js';
import { readDb, deleteDb } from '../helpers/fakeIdb.js';
import { loadSessionFixture } from '../helpers/replayFixture.js';
import { twoActionDoc } from '../helpers/devSessionRig.js';
import { RECORDER_DB } from '../../dev/devMode.js';
import { LOGGING_KEY } from '../../dev/devLog.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Phase 1 — seams
// ---------------------------------------------------------------------------

describe('integration/debug: Phase 1 — coach recap restart on restore', function () {
  this.timeout(30000);
  let iframe;

  beforeEach(async () => {
    iframe = createApp();
    await waitForPuzzle(iframe);
  });

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  const recapShown = () =>
    iframe.contentDocument.getElementById('coach-recap').classList.contains('visible');

  /** Starts a coach session on the Kiddie fixture and fills its target correctly. */
  async function reachRecap() {
    const gs = gsOf(iframe);
    gs.dispatch({
      type: 'PUZZLE_LOADED',
      puzzle: { id: 'co1', difficulty: 'kiddie', givens: kiddie.givens, solution: kiddie.solution, solveTrace: [] },
    });
    iframe.contentDocument.getElementById('btn-coach').click();
    const target = await waitFor(() => gs.getState().coachSession?.step.roles.target, 5000, 'coach session');
    gs.dispatch({ type: 'SELECT_CELL', index: target });
    gs.dispatch({ type: 'PEN_ENTER', digit: kiddie.solution[target] });
    await waitFor(recapShown, 2000, 'recap');
  }

  /** The current state as a DEV_RESTORE_POSITION payload, copied. */
  function currentPosition() {
    const s = gsOf(iframe).getState();
    return {
      puzzle: s.puzzle,
      pen: new Uint8Array(s.pen),
      pencil: new Uint16Array(s.pencil),
      selected: s.selected,
      activeMode: s.activeMode,
      incorrect: new Set(s.incorrect),
      highlightPending: false,
      hintsRemaining: s.hintsRemaining,
      attemptRecorded: s.attemptRecorded,
      won: s.won,
      generating: s.generating,
      generatingMessage: s.generatingMessage,
      generatingDifficulty: s.generatingDifficulty,
      genProgress: s.genProgress,
      completionMessage: s.completionMessage,
      coachSession: s.coachSession === null ? null : { ...s.coachSession },
      undoSnapshot: s.undoSnapshot,
    };
  }

  async function expectFullRecapPeriodFromNow() {
    await wait(2000);
    expect(recapShown(), 'recap 2.0 s after the restore').to.be.true;
    await wait(1000);
    expect(recapShown(), 'recap 3.0 s after the restore').to.be.false;
  }

  it('CO1a: restoring a recap while its timer is pending restarts the recap period', async () => {
    await reachRecap();
    const position = currentPosition();
    await wait(2000);

    gsOf(iframe).dispatch({ type: 'DEV_RESTORE_POSITION', position });

    await expectFullRecapPeriodFromNow();
  });

  it('CO1b: restoring a recap after COACH_END cleared its timer starts a full recap period', async () => {
    await reachRecap();
    const position = currentPosition();
    gsOf(iframe).dispatch({ type: 'COACH_END', reason: 'session-reset' });
    expect(recapShown()).to.be.false;
    await wait(2000);

    gsOf(iframe).dispatch({ type: 'DEV_RESTORE_POSITION', position });

    await expectFullRecapPeriodFromNow();
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — recording in the app (no UI: the history is read from IndexedDB)
// ---------------------------------------------------------------------------

describe('integration/debug: Phase 4 — recording', function () {
  this.timeout(40000);
  let iframe;

  const open = src => {
    iframe?.remove();
    iframe = createApp(src);
    return iframe;
  };

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  const readRecorderDb = () => readDb(RECORDER_DB);
  const types = list => list.map(e => e.a?.type);

  /** Wait until the stored history satisfies `predicate`; returns it. */
  const waitForHistory = (predicate, what, timeoutMs = 10000) => {
    let last = null;
    const poll = async () => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        last = await readRecorderDb();
        if (last !== null && last.meta?.start != null && predicate(last)) return last;
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for ${what}; history: ${JSON.stringify(last && types(last.entries))}`);
        }
        await wait(50);
      }
    };
    return poll();
  };

  /** A saved Easy game on KIDDIE, with three hints left. */
  function seedEasy(opts = {}) {
    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'easy', ...opts });
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...saved, hintsRemaining: 3 }));
  }

  async function openDev(src = '/index.html?dev=1') {
    open(src);
    await waitForPuzzle(iframe);
    return waitForHistory(() => true, 'the merged history');
  }

  const boardWith = (cell, digit) => KIDDIE.slice(0, cell) + digit + KIDDIE.slice(cell + 1);

  it('DBG-B1: a fresh boot with no saved game starts at the boot position and records the generation', async () => {
    open('/index.html?dev=1');
    await waitForPuzzle(iframe);

    const { meta, entries } = await waitForHistory(h => types(h.entries).includes('PUZZLE_LOADED'), 'PUZZLE_LOADED');

    expect(meta.start.puzzle).to.equal(null);
    const list = types(entries);
    const loaded = list.indexOf('PUZZLE_LOADED');
    expect(list[0]).to.equal('SET_GENERATING');
    expect(list.slice(1, loaded).every(t => t === 'GEN_PROGRESS')).to.equal(true);
  });

  it('DBG-B2: the restore burst is not recorded; the start holds the restored board', async () => {
    seedEasy({ entries: { 2: 4 }, pencil: { 3: (1 << 1) | (1 << 5) } });

    const { meta, entries } = await openDev();

    expect(types(entries)).to.not.include.oneOf(['SELECT_CELL', 'PEN_ENTER', 'PENCIL_TOGGLE', 'RESTORE_SESSION']);
    expect(meta.start.board).to.equal(boardWith(2, 4));
    expect(meta.start.pencil[3]).to.deep.equal([2, 6]);
    expect(meta.start.hintsRemaining).to.equal(3);
  });

  it('DBG-B3: a reload keeps the history and appends PAGE_RELOADED with the restored position', async () => {
    seedEasy();
    await openDev();
    const gs = gsOf(iframe);
    gs.dispatch({ type: 'SELECT_CELL', index: 2 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 4 });
    gs.dispatch({ type: 'SELECT_CELL', index: 3 });
    await waitForHistory(h => h.entries.length === 3, 'three entries');
    await waitFor(() => JSON.parse(localStorage.getItem(STATE_KEY)).pen[2] === 4, 2000, 'the saved game');

    open('/index.html');
    await waitForPuzzle(iframe);
    const { entries } = await waitForHistory(h => types(h.entries).includes('PAGE_RELOADED'), 'PAGE_RELOADED');

    expect(types(entries).slice(0, 4)).to.deep.equal(['SELECT_CELL', 'PEN_ENTER', 'SELECT_CELL', 'PAGE_RELOADED']);
    expect(entries[3].a.position.board).to.equal(boardWith(2, 4));
    const seqs = entries.map(e => e.seq);
    expect(seqs).to.deep.equal([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).to.equal(seqs.length);
  });

  it('DBG-B4: ?dev=0 deletes the history and ?dev=1 starts a new one', async () => {
    seedEasy();
    await openDev();
    gsOf(iframe).dispatch({ type: 'SELECT_CELL', index: 2 });
    await waitForHistory(h => h.entries.length === 1, 'one entry');

    open('/index.html?dev=0');
    await waitForPuzzle(iframe);
    const deadline = Date.now() + 5000;
    while ((await indexedDB.databases()).some(db => db.name === RECORDER_DB)) {
      if (Date.now() > deadline) throw new Error('the history database survived ?dev=0');
      await wait(50);
    }
    const { meta, entries } = await openDev('/index.html?dev=1');

    expect(entries).to.deep.equal([]);
    expect(meta.start.board).to.equal(KIDDIE);
    expect(meta.start.selected).to.equal(null);
  });

  it('DBG-B5: a hint from the Hint button carries the placed digit and its technique', async () => {
    seedEasy();
    await openDev();
    const gs = gsOf(iframe);
    gs.dispatch({ type: 'SELECT_CELL', index: 2 });

    iframe.contentDocument.getElementById('btn-hint').click();
    const { entries } = await waitForHistory(h => types(h.entries).includes('HINT'), 'HINT');

    const { hint } = entries.find(e => e.a?.type === 'HINT').a;
    expect(hint).to.have.all.keys('cellIndex', 'digit', 'technique');
    expect(hint.technique).to.be.a('string').and.not.equal('');
    expect(gs.getState().pen[hint.cellIndex]).to.equal(hint.digit);
    expect(hint.digit).to.equal(Number(KIDDIE_SOLUTION[hint.cellIndex]));
  });

  it('DBG-B6: a difficulty change is one entry with the generation start as its follow-up', async () => {
    seedEasy();
    await openDev();
    const select = iframe.contentDocument.getElementById('difficulty-select');

    select.value = 'medium';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const { entries } = await waitForHistory(h => types(h.entries).includes('CHANGE_DIFFICULTY'), 'CHANGE_DIFFICULTY');

    const changes = entries.filter(e => e.a?.type === 'CHANGE_DIFFICULTY');
    expect(changes).to.have.length(1);
    expect(changes[0].a).to.deep.equal({ type: 'CHANGE_DIFFICULTY', difficulty: 'medium' });
    expect(changes[0].f.map(a => a.type)).to.deep.equal(['SET_GENERATING']);
    expect(types(entries)).to.not.include('SET_GENERATING');
  });

  it('DBG-B7: the check highlight expiring is recorded as its own action', async function () {
    seedEasy();
    await openDev();
    const gs = gsOf(iframe);
    gs.dispatch({ type: 'SELECT_CELL', index: 2 });
    gs.dispatch({ type: 'PEN_ENTER', digit: 9 });
    iframe.contentDocument.getElementById('btn-check').click();
    expect(gs.getState().incorrect.has(2)).to.equal(true);

    await wait(3500);
    const { entries } = await waitForHistory(h => types(h.entries).includes('CLEAR_INCORRECT'), 'CLEAR_INCORRECT');

    expect(types(entries)).to.deep.equal(['SELECT_CELL', 'PEN_ENTER', 'CHECK', 'CLEAR_INCORRECT']);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — the controller and window.sudokuDev in the app
// ---------------------------------------------------------------------------

describe('integration/debug: Phase 6 — the developer API', function () {
  this.timeout(60000);
  let iframe;

  const open = src => {
    iframe?.remove();
    iframe = createApp(src);
    return iframe;
  };

  afterEach(() => {
    iframe?.remove();
    iframe = null;
  });

  const devApi = () => iframe.contentWindow.sudokuDev;
  /** A result from the app's realm as plain data. */
  const plain = value => JSON.parse(JSON.stringify(value));
  const $ = selector => iframe.contentDocument.querySelector(selector);
  const savedTier = () => JSON.parse(localStorage.getItem(DIFF_KEY));
  const pregenEntries = () => Object.keys(localStorage).filter(k => k.startsWith(PREGEN_PREFIX)).sort()
    .map(k => [k, localStorage.getItem(k)]);
  const board = () => Array.from(gsOf(iframe).getState().pen).join('');
  const devResources = () => iframe.contentWindow.performance.getEntriesByType('resource')
    .map(e => new URL(e.name).pathname).filter(p => p.startsWith('/js/dev/'));

  /** Boot with developer mode on over a saved Kiddie game without progress. */
  async function openDev({ tier } = {}) {
    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
    if (tier) localStorage.setItem(DIFF_KEY, JSON.stringify(tier));
    open('/index.html?dev=1');
    await waitForPuzzle(iframe);
    await waitFor(() => devApi(), 20000, 'window.sudokuDev');
    quietWarnings();
  }

  /**
   * Budget exhaustion and aborted runs are reported with console.warn by
   * design; keep the app frame's main-thread warnings out of the test output.
   */
  const quietWarnings = () => { iframe.contentWindow.console.warn = () => {}; };

  it('with developer mode off, the controller and API are never requested and window.sudokuDev does not exist', async () => {
    open('/index.html');
    await waitForPuzzle(iframe);
    await wait(400);

    expect('sudokuDev' in iframe.contentWindow).to.equal(false);
    expect(devResources()).to.not.include.members(['/js/dev/devSession.js']);
    expect(devResources()).to.not.include.members(['/js/dev/devApi.js']);
  });

  it('with developer mode on, window.sudokuDev is a frozen API over the live game', async () => {
    await openDev();

    expect(devResources()).to.include.members(['/js/dev/devSession.js', '/js/dev/devApi.js']);
    expect(iframe.contentWindow.Object.isFrozen(devApi())).to.equal(true);
    expect(plain(devApi().state()).puzzle.givens).to.equal(KIDDIE);
  });

  it('DBG-G1: a seeded Kiddie run loads the pinned puzzle as chosen by the developer, leaving the cache and preference alone', async () => {
    await openDev({ tier: 'medium' });
    await waitFor(() => localStorage.getItem(`${PREGEN_PREFIX}kiddie`) !== null, 20000, 'the background Kiddie puzzle');
    const pregen = pregenEntries();

    const result = plain(await devApi().generate('kiddie', 1, { replace: true }));

    expect(result).to.include({
      ok: true, requestedTier: 'kiddie', tier: 'kiddie', seed: 1, fallback: false, message: 'Generated from seed 1: Kiddie puzzle.',
    });
    const { puzzle } = gsOf(iframe).getState();
    expect(puzzle.id).to.equal('2fe4fb4f');
    expect(puzzle.gen.seedBy).to.equal('developer');
    expect(result.diagnostics).to.include({ seed: 1, seedBy: 'developer', requestedTier: 'kiddie', tier: 'kiddie' });
    expect(pregenEntries()).to.deep.equal(pregen);
    expect(savedTier()).to.equal('medium');
  });

  it('DBG-G2: the same tier and seed give the same puzzle and diagnostics through the worker across a reload', async () => {
    const run = async () => {
      await openDev();
      await devApi().generate('medium', 7, { replace: true });
      const { id, givens, solution, difficulty, gen } = gsOf(iframe).getState().puzzle;
      return plain({ id, givens: Array.from(givens), solution: Array.from(solution), difficulty, gen });
    };

    const first = await run();
    const second = await run();

    expect(first.id).to.equal('46259922');
    expect(second).to.deep.equal(first);
  });

  it('DBG-G3: an Easy run that exhausts its budget loads the Hard puzzle it found, without a dialog', async () => {
    await openDev();

    const result = plain(await devApi().generate('easy', 26, { budget: 30 }));

    expect(result).to.include({
      ok: true, requestedTier: 'easy', tier: 'hard', fallback: true,
      message: 'Generated from seed 26: Hard puzzle. No Easy puzzle was found within the budget.',
    });
    expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('hard');
    expect($('#modal-backdrop').classList.contains('open')).to.equal(false);
  });

  it('DBG-G4: a Nightmare fallback refused through the API loads nothing and ends the busy state', async () => {
    await openDev({ tier: 'medium' });

    const result = plain(await devApi().generate('nightmare', 1, { budget: 3 }));

    expect(result).to.include({
      ok: false, reason: 'needs-accept-fallback', requestedTier: 'nightmare', tier: 'easy', seed: 1,
      message: 'No Nightmare puzzle found. The best the generator found is rated Easy. Pass acceptFallback: true to play it.',
    });
    expect(gsOf(iframe).getState().generating).to.equal(false);
    expect(board()).to.equal(KIDDIE);
    expect($('#modal-backdrop').classList.contains('open')).to.equal(false);
    expect(savedTier()).to.equal('medium');
  });

  it('DBG-G4: a Nightmare fallback accepted through the API loads Easy and makes Easy the saved tier', async () => {
    await openDev({ tier: 'medium' });

    const result = plain(await devApi().generate('nightmare', 1, { budget: 3, acceptFallback: true }));

    expect(result).to.include({ ok: true, tier: 'easy', fallback: true });
    expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('easy');
    await waitFor(() => savedTier() === 'easy', 2000, 'the saved tier');
  });

  it('DBG-G5: an Expert run with no solvable candidate loads Unrated, with hints and coach unavailable', async () => {
    await openDev({ tier: 'medium' });

    const result = plain(await devApi().generate('expert', 223, { budget: 1, replace: true }));
    await appFrame(iframe);

    expect(result).to.include({ ok: true, tier: 'unrated', fallback: true });
    expect($('#difficulty-select').selectedOptions[0].textContent).to.equal('Unrated');
    expect($('#hint-count').textContent).to.equal('–');
    expect($('#btn-coach').disabled).to.equal(true);
    expect(savedTier()).to.equal('medium');
  });

  it('DBG-G5: a Nightmare run with no solvable candidate, refused, says it can\'t be rated', async () => {
    await openDev({ tier: 'medium' });

    const result = plain(await devApi().generate('nightmare', 223, { budget: 1 }));

    expect(result).to.include({
      ok: false, reason: 'needs-accept-fallback', tier: 'unrated',
      message: 'No Nightmare puzzle found. The best the generator found can\'t be rated. Pass acceptFallback: true to play it.',
    });
    expect(board()).to.equal(KIDDIE);
  });

  it('DBG-G5: the same run accepted loads Unrated and leaves the saved tier', async () => {
    await openDev({ tier: 'medium' });

    const result = plain(await devApi().generate('nightmare', 223, { budget: 1, acceptFallback: true }));
    await wait(200);

    expect(result).to.include({ ok: true, tier: 'unrated' });
    expect(gsOf(iframe).getState().puzzle.difficulty).to.equal('unrated');
    expect(savedTier()).to.equal('medium');
  });

  describe('DBG-G6: a long seeded run that is cancelled or replaced', () => {
    /** Starts a real-budget Nightmare run; it is still running when this returns. */
    async function startLongRun() {
      await openDev();
      const pending = devApi().generate('nightmare', 1, { replace: true });
      expect(gsOf(iframe).getState().generating, 'the run started').to.equal(true);
      return { pending };
    }

    it('Cancel on the busy card reports "Generation cancelled." and restores the prior state', async () => {
      const before = plain(await (async () => { await openDev(); return devApi().state(); })());
      const pending = devApi().generate('nightmare', 1, { replace: true });
      expect(gsOf(iframe).getState().generating).to.equal(true);

      $('#busy-root button').click();
      const result = plain(await pending);

      expect(result).to.deep.equal({ ok: false, reason: 'cancelled', message: 'Generation cancelled.' });
      expect({ ...plain(devApi().state()), recorder: null }).to.deep.equal({ ...before, recorder: null });
    });

    it('New Puzzle replaces it: "Generation replaced by another request."', async () => {
      const { pending } = await startLongRun();

      $('#btn-new').click();

      expect(plain(await pending)).to.deep.equal({ ok: false, reason: 'cancelled', message: 'Generation replaced by another request.' });
    });

    it('loading a puzzle string replaces it: "Generation replaced by another request."', async () => {
      const { pending } = await startLongRun();

      const loaded = plain(await devApi().load(MEDIUM, { replace: true }));

      expect(plain(await pending)).to.deep.equal({ ok: false, reason: 'cancelled', message: 'Generation replaced by another request.' });
      expect(loaded).to.include({ ok: true });
      expect(board()).to.equal(MEDIUM);
    });
  });

  it('DBG-G7: a seeded run during the first-ever boot replaces the boot generation, which never lands', async () => {
    localStorage.setItem(DIFF_KEY, JSON.stringify('diabolical'));
    open('/index.html?dev=1');
    await waitFor(() => devApi(), 20000, 'window.sudokuDev');
    quietWarnings();
    const atCall = gsOf(iframe).getState();
    expect(atCall.puzzle, 'the boot generation is still running').to.equal(null);
    expect(atCall.generating).to.equal(true);

    const result = plain(await devApi().generate('kiddie', 1));
    await wait(1500);

    expect(result).to.include({ ok: true, tier: 'kiddie' });
    expect(gsOf(iframe).getState().puzzle.id).to.equal('2fe4fb4f');
    expect(gsOf(iframe).getState().generating).to.equal(false);
  });

  it('DBG-G8: a seeded run through the API leaves keyboard focus where it was', async () => {
    await openDev();
    const cell = $('.cell[data-index="2"]');
    cell.focus();
    expect(iframe.contentDocument.activeElement).to.equal(cell);

    await devApi().generate('kiddie', 1, { replace: true });
    await appFrame(iframe);

    expect(iframe.contentDocument.activeElement).to.equal(cell);
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — end to end: the dev-off guarantee, record → export → replay, the
// replay's effect on the rest of the app, two tabs, logging and error capture
// ---------------------------------------------------------------------------

describe('integration/debug: Phase 8 — end to end', function () {
  this.timeout(60000);

  let frames = [];

  /** Opens an app frame; every frame is removed after the test. */
  const open = (src, size) => {
    const frame = createApp(src, size);
    frames.push(frame);
    return frame;
  };
  const close = frame => {
    frame.remove();
    frames = frames.filter(f => f !== frame);
  };

  afterEach(() => {
    for (const frame of frames) frame.remove();
    frames = [];
  });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const plain = value => JSON.parse(JSON.stringify(value));
  const $ = (frame, selector) => frame.contentDocument.querySelector(selector);
  const $$ = (frame, selector) => [...frame.contentDocument.querySelectorAll(selector)];
  const api = frame => frame.contentWindow.sudokuDev;
  const withoutRecorder = ({ recorder, ...rest }) => rest;
  const replayStatus = frame => $(frame, '#dev-rec-replay-status').textContent;
  const dialogOpen = frame => $(frame, '#modal-backdrop').classList.contains('open');
  const recorderDbExists = async () => (await indexedDB.databases()).some(db => db.name === RECORDER_DB);
  const devResources = frame => frame.contentWindow.performance.getEntriesByType('resource')
    .map(e => new URL(e.name).pathname).filter(p => p.startsWith('/js/dev/') || p.endsWith('/dev.css'));
  const firstEmpty = frame => gsOf(frame).getState().puzzle.givens.findIndex(d => d === 0);
  const emptyCells = frame => [...gsOf(frame).getState().puzzle.givens.keys()]
    .filter(i => gsOf(frame).getState().puzzle.givens[i] === 0);

  /**
   * Replaces the app frame's console before any app script runs (the frame
   * reuses its initial window when the same-origin page loads) and records
   * every call's arguments. Nothing reaches the real console.
   */
  function spyConsole(frame) {
    const calls = [];
    const console = frame.contentWindow.console;
    for (const method of ['log', 'warn', 'error', 'info']) {
      console[method] = (...args) => calls.push({ method, args });
    }
    return {
      calls,
      tagged: tag => calls.filter(c => c.args[0] === tag),
      devLines: () => calls.filter(c => typeof c.args[0] === 'string' && c.args[0].startsWith('[dev:')),
    };
  }

  /** Developer mode on, over a saved Kiddie game without progress; the API is ready. */
  async function openDev({ seed = true, src = '/index.html?dev=1', spy = false } = {}) {
    if (seed) seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
    const frame = open(src);
    const consoleSpy = spy ? spyConsole(frame) : null;
    await waitForPuzzle(frame);
    await waitForDevPanel(frame);
    await waitFor(() => api(frame), 20000, 'window.sudokuDev');
    if (!spy) frame.contentWindow.console.warn = () => {};
    return { frame, consoleSpy };
  }

  /**
   * Replays `text` through the panel, confirming the dialog if one opens,
   * and waits for the outcome in the replay status line.
   */
  async function panelReplay(frame, text, stop = '') {
    $(frame, '#dev-rec').open = true;
    $(frame, '#dev-rec-doc').value = text;
    $(frame, '#dev-rec-stop').value = stop;
    $(frame, '#dev-rec-replay').focus();
    $(frame, '#dev-rec-replay').click();
    await waitFor(() => {
      if (dialogOpen(frame)) $(frame, '#modal-confirm').click();
      return /^(Session replayed|Replay stopped|This session)/.test(replayStatus(frame));
    }, 20000, 'the replay outcome');
  }

  /** Resolves with the test-realm time at which the replay commits. */
  function commitTime(frame) {
    return new Promise(resolve => {
      const off = gsOf(frame).on('changed', ({ action }) => {
        if (action.type === 'DEV_RESTORE_POSITION') {
          off();
          resolve(performance.now());
        }
      });
    });
  }

  const untilAfter = (t0, ms) => wait(Math.max(0, t0 + ms - performance.now()));

  /** As `waitFor`, for a predicate that returns a promise. */
  async function waitForAsync(predicate, timeoutMs, what) {
    const deadline = Date.now() + timeoutMs;
    while (!(await predicate())) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
      await wait(50);
    }
  }

  // ── The dev-off guarantee (tspec §4) ─────────────────────────────────────

  describe('the dev-off guarantee', () => {
    /** Normal mode: a move, Hint, Check, and New Puzzle through its confirmation. */
    async function playNormally(frame) {
      enter(frame, firstEmpty(frame), 1);
      $(frame, '#btn-hint').click();
      $(frame, '#btn-check').click();
      const before = gsOf(frame).getState().puzzle.id;
      $(frame, '#btn-new').click();
      if (dialogOpen(frame)) $(frame, '#modal-confirm').click();
      await waitFor(() => !gsOf(frame).getState().generating && gsOf(frame).getState().puzzle.id !== before,
        20000, 'the new puzzle');
    }

    it('DBG-OFF1: nothing new is downloaded: the only developer resource is devMode.js, and no dev.css', async () => {
      const frame = open('/index.html');
      await waitForPuzzle(frame);

      await playNormally(frame);
      await wait(400);

      expect(devResources(frame)).to.deep.equal(['/js/dev/devMode.js']);
    });

    it('DBG-OFF2: there is no developer API; window.gameState is still there', async () => {
      const frame = open('/index.html');
      await waitForPuzzle(frame);

      expect('sudokuDev' in frame.contentWindow).to.equal(false);
      expect(frame.contentWindow.gameState).to.not.equal(undefined);
    });

    it('DBG-OFF3: no recorder database is created by boot, play, or a reload', async () => {
      await deleteDb(RECORDER_DB);
      const frame = open('/index.html');
      await waitForPuzzle(frame);
      const afterBoot = await recorderDbExists();
      await playNormally(frame);
      const afterPlay = await recorderDbExists();
      close(frame);

      const reloaded = open('/index.html');
      await waitForPuzzle(reloaded);
      await wait(400);

      expect([afterBoot, afterPlay, await recorderDbExists()]).to.deep.equal([false, false, false]);
    });

    it('DBG-OFF4: swallowed errors and a throwing listener write no [dev:…] line; events.js still logs the listener error', async () => {
      localStorage.setItem(`${PREGEN_PREFIX}easy`, '{ corrupt');
      const frame = open('/index.html');
      const spy = spyConsole(frame);
      await waitForPuzzle(frame);
      gsOf(frame).on('changed', () => { throw new frame.contentWindow.Error('normal-mode listener failure'); });

      gsOf(frame).dispatch({ type: 'TOGGLE_MODE' });
      await wait(200);

      expect(spy.devLines()).to.deep.equal([]);
      expect(spy.calls.some(c => c.method === 'error' && c.args[0]?.message === 'normal-mode listener failure')).to.equal(true);
    });

    it('DBG-OFF5 / A40: no developer element exists', async () => {
      const frame = open('/index.html');
      await waitForPuzzle(frame);
      await wait(400);

      expect($$(frame, '[id^="dev-"]').map(el => el.id)).to.deep.equal([]);
    });

    it('DBG-OFF6: ?dev=0 after use deletes the history, removes the API, keeps the logging choices, and logs nothing', async () => {
      const { frame } = await openDev();
      api(frame).setLogging('actions', true);
      gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 2 });
      await waitForAsync(async () => (await readDb(RECORDER_DB))?.entries.length > 0, 5000, 'a stored entry');
      close(frame);

      const off = open('/index.html?dev=0');
      const spy = spyConsole(off);
      await waitForPuzzle(off);
      const deadline = Date.now() + 5000;
      while (await recorderDbExists()) {
        if (Date.now() > deadline) throw new Error('the history database survived ?dev=0');
        await wait(50);
      }
      gsOf(off).dispatch({ type: 'SELECT_CELL', index: 3 });
      await wait(200);

      expect('sudokuDev' in off.contentWindow).to.equal(false);
      expect(JSON.parse(localStorage.getItem(LOGGING_KEY))).to.include({ actions: true });
      expect(spy.devLines()).to.deep.equal([]);
    });
  });

  // ── Record, export, replay elsewhere (DBG-SYS1, DBG-R1) ──────────────────

  /**
   * Tab A plays a seeded Hard game (digits, pencil marks, a coach start, a
   * hint, a wrong digit and Check) and exports it; tab B, a fresh load over a
   * different game with progress, replays the document through the panel.
   */
  async function recordThenReplayElsewhere() {
    const { frame: a } = await openDev();
    const generated = plain(await api(a).generate('hard', 2024, { replace: true }));
    expect(generated.ok, JSON.stringify(generated)).to.equal(true);
    const { solution } = gsOf(a).getState().puzzle;
    const [c1, c2, c3, c4] = emptyCells(a);
    enter(a, c1, solution[c1]);
    enter(a, c2, solution[c2]);
    const gs = gsOf(a);
    gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gs.dispatch({ type: 'SELECT_CELL', index: c3 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 1 });
    gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 2 });
    gs.dispatch({ type: 'SET_MODE', mode: 'pen' });
    // Hard allows no hints, so the Hint button is disabled; the request is made as the console would.
    gs.dispatch({ type: 'HINT' });
    $(a, '#btn-coach').click();
    await waitFor(() => api(a).exportSession().document.actions
      .some(item => ['COACH_START', 'COACH_NO_TECHNIQUE'].includes(item.action.type)), 5000, 'the coach start');
    enter(a, c4, solution[c4] % 9 + 1);
    $(a, '#btn-check').click();
    const expected = plain(api(a).state());
    const doc = plain(api(a).exportSession().document);
    close(a);

    seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie', entries: { 2: 4 } });
    const { frame: b } = await openDev({ seed: false });
    let body = null;
    const observer = new b.contentWindow.MutationObserver(() => { body ??= dialogOpen(b) ? $(b, '#modal-body').textContent : null; });
    observer.observe($(b, '#modal-backdrop'), { attributes: true });
    await panelReplay(b, JSON.stringify(doc));
    observer.disconnect();
    return { b, doc, expected, body };
  }

  const isComputed = item => ['COACH_START', 'COACH_NO_TECHNIQUE'].includes(item.action.type)
    || (item.action.type === 'HINT' && item.action.hint !== undefined);
  /** Computed results compared, and those not compared because the action changed nothing. */
  const computedResults = doc => ({
    k: doc.actions.filter(item => isComputed(item) && !item.noChange).length,
    u: doc.actions.filter(item => ['COACH_START', 'COACH_NO_TECHNIQUE', 'HINT'].includes(item.action.type) && item.noChange).length,
  });

  describe('DBG-SYS1: record → export → replay in another tab', () => {
    let run;
    before(async function () {
      this.timeout(90000);
      localStorage.clear();
      run = await recordThenReplayElsewhere();
      frames = frames.filter(f => f !== run.b);   // kept across this group's tests
      await appFrame(run.b);
    });
    after(() => run?.b.remove());

    it('asked once, naming both the progress and the recorded history', () => {
      expect(run.body).to.match(/^Your current progress will be lost, and the recorded history \(\d+ actions?, \d+ errors?\) will be discarded\.$/);
    });

    it('the board, marks, selection, mode, hints, coach and check state equal tab A\'s at export', () => {
      expect(withoutRecorder(plain(api(run.b).state()))).to.deep.equal(withoutRecorder(run.expected));
    });

    it('reports no divergences in every computed result the document carries', () => {
      const n = run.doc.actions.length;
      const { k, u } = computedResults(run.doc);
      const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

      // A Hard puzzle has no hints: its Hint is recorded as changing nothing and is not compared.
      expect(run.doc.actions.filter(item => item.action.type === 'HINT').map(item => item.noChange)).to.deep.equal([true]);
      expect(k).to.be.at.least(1);
      expect(replayStatus(run.b)).to.equal(`Session replayed: ${n} of ${n} actions. `
        + `No divergences in ${plural(k, 'computed result')}.${u > 0 ? ` ${u} not compared.` : ''}`);
    });

    it('replaces the history with the document\'s start and actions', () => {
      const { start, actions } = plain(api(run.b).exportSession().document);

      expect(start).to.deep.equal(run.doc.start);
      expect(actions).to.deep.equal(run.doc.actions);
    });

    it('leaves keyboard focus on Replay', () => {
      expect(run.b.contentDocument.activeElement).to.equal($(run.b, '#dev-rec-replay'));
    });
  });

  it('DBG-R1: the replayed game and its history survive a reload', async function () {
    this.timeout(90000);
    const { b, doc, expected } = await recordThenReplayElsewhere();
    await waitFor(() => JSON.parse(localStorage.getItem(STATE_KEY))?.pen.join('') === expected.board, 5000, 'the saved game');
    await waitForAsync(async () => (await readDb(RECORDER_DB))?.entries.length === doc.actions.length, 5000, 'the stored history');
    close(b);

    const reloaded = open('/index.html');
    await waitForPuzzle(reloaded);
    await waitFor(() => api(reloaded), 20000, 'window.sudokuDev');
    const state = plain(api(reloaded).state());
    const { actions } = plain(api(reloaded).exportSession().document);

    expect(state.board).to.equal(expected.board);
    expect(state.puzzle.givens).to.equal(expected.puzzle.givens);
    expect(actions.slice(0, -1)).to.deep.equal(doc.actions);
    expect(actions.at(-1).action.type).to.equal('PAGE_RELOADED');
  });

  // ── A replay's effect on the rest of the app (DBG-R2–R8, fspec D-36) ─────

  describe('a replay that ends on a won board', () => {
    it('DBG-R2: shows the banner, records no statistics, removes the saved game, and keeps focus on Replay', async () => {
      const { frame } = await openDev();
      const stats = readStats(frame);

      await panelReplay(frame, await loadSessionFixture('format-v1-baseline.json'));
      await appFrame(frame);

      expect($(frame, '#win-banner').classList.contains('show')).to.equal(true);
      expect(readStats(frame)).to.deep.equal(stats);
      await waitFor(() => localStorage.getItem(STATE_KEY) === null, 3000, 'the saved game to be removed');
      expect(frame.contentDocument.activeElement).to.equal($(frame, '#dev-rec-replay'));
    });

    it('D-36: through the API with nothing focused, focus moves to New Puzzle as on any win', async () => {
      const { frame } = await openDev();
      frame.contentDocument.activeElement?.blur();
      const doc = JSON.parse(await loadSessionFixture('format-v1-baseline.json'));

      await api(frame).replay(doc, { replace: true, discardHistory: true });
      await appFrame(frame);

      expect(frame.contentDocument.activeElement).to.equal($(frame, '#btn-new'));
    });

    it('D-36: through the API with an element focused, focus stays on that element', async () => {
      const { frame } = await openDev();
      const cell = $(frame, '.cell[data-index="2"]');
      cell.focus();
      const doc = JSON.parse(await loadSessionFixture('format-v1-baseline.json'));

      await api(frame).replay(doc, { replace: true, discardHistory: true });
      await appFrame(frame);

      expect(frame.contentDocument.activeElement).to.equal(cell);
    });
  });

  it('DBG-R3: a replay ending in a coach recap shows it for its full period from the end of the replay', async () => {
    const { frame } = await openDev();
    const text = await loadSessionFixture('coach-in-progress.json');
    const firstPlacement = JSON.parse(text).actions.findIndex(item => item.action.type === 'PEN_ENTER') + 1;
    const recapShown = () => $(frame, '#coach-recap').classList.contains('visible');
    const committed = commitTime(frame);

    await panelReplay(frame, text, String(firstPlacement));
    const t0 = await committed;

    await untilAfter(t0, 2000);
    expect(recapShown(), 'recap 2.0 s after the replay').to.equal(true);
    await untilAfter(t0, 3000);
    expect(recapShown(), 'recap 3.0 s after the replay').to.equal(false);
  });

  it('DBG-R4: a replay ending right after a Check keeps the highlight for its full period, then records its expiry', async () => {
    const { frame } = await openDev();
    const text = await loadSessionFixture('format-v1-baseline.json');
    const check = JSON.parse(text).actions.findIndex(item => item.action.type === 'CHECK') + 1;
    const flagged = () => $$(frame, '.cell.incorrect').map(el => Number(el.dataset.index));
    const committed = commitTime(frame);

    await panelReplay(frame, text, String(check));
    const t0 = await committed;

    await untilAfter(t0, 2500);
    expect(flagged(), 'highlight 2.5 s after the replay').to.deep.equal([1, 14]);
    await untilAfter(t0, 3600);
    expect(flagged(), 'highlight 3.6 s after the replay').to.deep.equal([]);
    expect(api(frame).exportSession().document.actions.at(-1).action.type).to.equal('CLEAR_INCORRECT');
  });

  it('DBG-R5: a replay during the first-ever boot\'s generation ends the busy state, and the generated puzzle never lands', async () => {
    localStorage.setItem(DIFF_KEY, JSON.stringify('diabolical'));
    const frame = open('/index.html?dev=1');
    await waitFor(() => api(frame), 20000, 'window.sudokuDev');
    frame.contentWindow.console.warn = () => {};
    expect(gsOf(frame).getState().generating, 'the boot generation is running').to.equal(true);

    const result = plain(await api(frame).replay(twoActionDoc(), { replace: true, discardHistory: true }));
    const replayed = gsOf(frame).getState().puzzle;
    await wait(2500);

    expect(result.ok).to.equal(true);
    expect(gsOf(frame).getState().generating).to.equal(false);
    expect($(frame, '#busy-root').hidden).to.equal(true);
    expect(gsOf(frame).getState().puzzle).to.equal(replayed);
  });

  it('DBG-R6: a replay ending during a generation clears the busy state and says so in the report', async () => {
    const { frame } = await openDev();
    const text = await loadSessionFixture('format-v1-baseline.json');
    const change = JSON.parse(text).actions.findIndex(item => item.action.type === 'CHANGE_DIFFICULTY') + 1;

    await panelReplay(frame, text, String(change));
    await wait(1000);

    expect(gsOf(frame).getState().generating).to.equal(false);
    expect($(frame, '#busy-root').hidden).to.equal(true);
    expect(gsOf(frame).getState().puzzle.difficulty, 'no generation was started').to.equal('unrated');
    expect($(frame, '.dev-report-scope').textContent)
      .to.equal(`Replayed ${change} of 480 actions. Replay ended during a puzzle generation; the busy state was cleared.`);
  });

  it('DBG-R7: after a replay the inspector is stale and released, the overlay shows basic candidates, and coach data and diagnostics follow the document', async () => {
    const { frame } = await openDev();
    for (const d of $$(frame, '#dev-root details')) d.open = true;
    $(frame, '#dev-inspect-run').click();
    $(frame, '#dev-inspect-list button').dispatchEvent(new frame.contentWindow.MouseEvent('dblclick', { bubbles: true }));
    expect($(frame, '#dev-inspect-restore').disabled, 'the board is set to a step').to.equal(false);
    $(frame, '#dev-overlay-toggle').click();
    const doc = JSON.parse(await loadSessionFixture('coach-in-progress.json'));

    await api(frame).replay(doc, { replace: true, discardHistory: true });
    await appFrame(frame);

    expect($(frame, '#dev-inspect-summary').textContent).to.equal('Board changed — run the solver again.');
    expect($(frame, '#dev-inspect-restore').disabled).to.equal(true);
    expect($$(frame, '#dev-inspect-list button[aria-pressed="true"]')).to.deep.equal([]);
    expect($(frame, '#dev-overlay-toggle').getAttribute('aria-checked')).to.equal('true');
    const { candidates } = plain(api(frame).candidates());
    const shown = $$(frame, '.cell').map(el => [...el.querySelectorAll('.dev-cand-agree, .dev-cand-missing')].map(s => Number(s.textContent)));
    const board = gsOf(frame).getState().pen;
    expect(shown.filter((_, i) => board[i] === 0)).to.deep.equal(candidates.filter((_, i) => board[i] === 0));
    expect(JSON.parse($(frame, '#dev-coach-json').textContent)).to.deep.equal(plain(api(frame).coachStep().step));
    expect(plain(api(frame).coachStep().step)).to.deep.equal(
      doc.actions.filter(item => item.action.type === 'COACH_START').at(-1).action.result);
    expect($(frame, '#dev-gen-info').textContent).to.include('This puzzle was loaded, not generated.');
  });

  it('DBG-R8: an open confirmation is closed by an API replay, and nothing else follows', async () => {
    const { frame } = await openDev();
    enter(frame, 2, 4);
    $(frame, '#btn-new').click();
    expect(dialogOpen(frame), 'the New Puzzle confirmation').to.equal(true);

    const result = plain(await api(frame).replay(twoActionDoc(), { replace: true, discardHistory: true }));
    const after = gsOf(frame).getState();
    await wait(1000);

    expect(result.ok).to.equal(true);
    expect(dialogOpen(frame)).to.equal(false);
    expect(gsOf(frame).getState().generating).to.equal(false);
    expect(gsOf(frame).getState().puzzle).to.equal(after.puzzle);
  });

  // ── Two tabs (DBG-M1) ────────────────────────────────────────────────────

  describe('two tabs', () => {
    const LOST = 'Another tab has taken over the saved history. This tab\'s history is kept until it is closed or reloaded.';

    it('DBG-M1: the earlier tab announces the takeover once, saves nothing more, and still exports everything', async () => {
      const { frame: a } = await openDev();
      const announced = [];
      new a.contentWindow.MutationObserver(() => {
        const text = $(a, '#sr-live').textContent;
        if (text) announced.push(text);
      }).observe($(a, '#sr-live'), { childList: true, characterData: true, subtree: true });
      const { frame: b } = await openDev({ seed: false });
      await waitForAsync(async () => (await readDb(RECORDER_DB))?.entries.some(e => e.a?.type === 'PAGE_RELOADED'), 5000, 'tab B\'s claim');

      gsOf(a).dispatch({ type: 'SELECT_CELL', index: 80 });
      gsOf(a).dispatch({ type: 'SELECT_CELL', index: 79 });
      await waitFor(() => $(a, '#dev-rec-storage').textContent === LOST, 5000, 'the takeover message');
      await wait(300);

      expect(announced.filter(t => t === LOST)).to.have.length(1);
      const stored = await readDb(RECORDER_DB);
      expect(stored.entries.filter(e => e.a?.type === 'SELECT_CELL' && e.a.index >= 79)).to.deep.equal([]);
      expect(plain(api(b).exportSession().document).actions.some(item => item.action.index >= 79)).to.equal(false);
      expect(plain(api(a).exportSession().document).actions.slice(-2).map(item => item.action))
        .to.deep.equal([{ type: 'SELECT_CELL', index: 80 }, { type: 'SELECT_CELL', index: 79 }]);
    });

    it('?dev=0 in a second tab deletes the history while the first keeps recording in memory', async () => {
      const { frame: a } = await openDev();
      gsOf(a).dispatch({ type: 'SELECT_CELL', index: 2 });
      await waitForAsync(async () => (await readDb(RECORDER_DB))?.entries.length > 0, 5000, 'a stored entry');

      const off = open('/index.html?dev=0');
      await waitForPuzzle(off);
      await waitForAsync(async () => !(await recorderDbExists()), 5000, 'the database to be deleted');
      gsOf(a).dispatch({ type: 'SELECT_CELL', index: 3 });

      expect(plain(api(a).exportSession().document).actions.map(item => item.action.index)).to.include.members([2, 3]);
      expect(await recorderDbExists()).to.equal(false);
    });
  });

  // ── Logging and error capture (DBG-L1–L3, DBG-E1) ────────────────────────

  describe('logging', () => {
    it('DBG-L1: a logging switch survives a reload and turning developer mode off and on', async () => {
      const { frame } = await openDev();
      $(frame, '#dev-rec').open = true;
      $(frame, '#dev-log-actions').click();
      close(frame);

      const reloaded = open('/index.html');
      await waitFor(() => api(reloaded), 20000, 'window.sudokuDev');
      const afterReload = api(reloaded).logging().logging.actions;
      close(reloaded);
      const off = open('/index.html?dev=0');
      await waitForPuzzle(off);
      close(off);
      const on = open('/index.html?dev=1');
      await waitFor(() => api(on) && $(on, '#dev-log-actions'), 20000, 'the panel');

      expect(afterReload).to.equal(true);
      expect(api(on).logging().logging.actions).to.equal(true);
      expect($(on, '#dev-log-actions').getAttribute('aria-checked')).to.equal('true');
    });

    it('DBG-L2: [dev:gen] for a generation, with a numeric elapsed time on the result', async () => {
      const { frame, consoleSpy } = await openDev({ spy: true });

      await api(frame).generate('kiddie', 1, { replace: true });

      const events = consoleSpy.tagged('[dev:gen]').map(c => c.args[2]);
      expect(events.find(e => e.event === 'request' && e.kind === 'seeded')).to.include({ tier: 'kiddie', seed: 1 });
      expect(events.find(e => e.event === 'result').elapsedMs).to.be.a('number');
    });

    it('DBG-L2: [dev:action] once per action while the action trace is on, and not at all while it is off', async () => {
      const { frame, consoleSpy } = await openDev({ spy: true });
      gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 2 });
      const whileOff = consoleSpy.tagged('[dev:action]').length;

      api(frame).setLogging('actions', true);
      gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 3 });
      gsOf(frame).dispatch({ type: 'PEN_ENTER', digit: 4 });

      expect(whileOff).to.equal(0);
      expect(consoleSpy.tagged('[dev:action]').map(c => c.args[1])).to.deep.equal(['SELECT_CELL', 'PEN_ENTER']);
    });

    it('DBG-L2: with the generation switch off a generation logs nothing', async () => {
      const { frame, consoleSpy } = await openDev({ spy: true });
      api(frame).setLogging('generation', false);
      const before = consoleSpy.tagged('[dev:gen]').length;

      await api(frame).generate('kiddie', 1, { replace: true });

      expect(consoleSpy.tagged('[dev:gen]')).to.have.length(before);
    });

    // Production defect: the pre-generation cache is read while puzzleProvider.js is
    // evaluated, before main.js boots the developer log, so this swallow is never logged.
    it('DBG-L3: a corrupt pre-generation entry at boot is logged as swallowed at pregen.load', async () => {
      localStorage.setItem(`${PREGEN_PREFIX}medium`, '{ corrupt');
      const { consoleSpy } = await openDev({ spy: true });

      expect(consoleSpy.tagged('[dev:swallowed]').map(c => c.args[1])).to.include('pregen.load');
    });

    it('DBG-L3: New Puzzle twice in one task logs the dropped request as swallowed at foreground.request', async () => {
      // A Nightmare game, so no pre-generated puzzle is ready yet and both requests reach the worker.
      seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'nightmare' });
      const { frame, consoleSpy } = await openDev({ seed: false, spy: true });

      $(frame, '#btn-new').click();
      $(frame, '#btn-new').click();
      await waitFor(() => consoleSpy.tagged('[dev:swallowed]').some(c => c.args[1] === 'foreground.request'),
        5000, 'the swallowed AbortError');

      const [entry] = consoleSpy.tagged('[dev:swallowed]').filter(c => c.args[1] === 'foreground.request');
      expect(entry.args[2].name).to.equal('AbortError');
    });
  });

  describe('DBG-E1: error capture in the app', () => {
    /** Errors captured since boot, and a check that play still works. */
    const errors = frame => plain(api(frame).exportSession().document).errors;
    const stillPlays = frame => {
      enter(frame, 3, 6);
      return gsOf(frame).getState().pen[3] === 6;
    };

    it('a throwing gameState listener is captured with the action being applied; the app keeps working', async () => {
      const { frame } = await openDev({ spy: true });
      const off = gsOf(frame).on('changed', () => { throw new frame.contentWindow.Error('E1 listener'); });

      gsOf(frame).dispatch({ type: 'TOGGLE_MODE' });
      off();

      expect(errors(frame).map(({ kind, message, action }) => ({ kind, message, action })))
        .to.deep.equal([{ kind: 'listener', message: 'E1 listener', action: 'TOGGLE_MODE' }]);
      gsOf(frame).dispatch({ type: 'SET_MODE', mode: 'pen' });
      expect(stillPlays(frame)).to.equal(true);
    });

    it('an uncaught error is captured with its source; the app keeps working', async () => {
      const { frame } = await openDev({ spy: true });
      frame.contentWindow.addEventListener('error', e => e.preventDefault());

      // A script with a URL, so the error has a source location.
      const win = frame.contentWindow;
      const script = frame.contentDocument.createElement('script');
      script.src = win.URL.createObjectURL(new win.Blob(['setTimeout(() => { throw new Error("E1 uncaught"); });']));
      frame.contentDocument.body.appendChild(script);
      await waitFor(() => errors(frame).length > 0, 3000, 'the captured error');

      const [entry] = errors(frame);
      expect(entry.kind).to.equal('uncaught');
      expect(entry.message).to.include('E1 uncaught');
      expect(entry.source).to.be.a('string').and.not.equal('');
      expect(stillPlays(frame)).to.equal(true);
    });

    it('an unhandled rejection is captured with its reason; the app keeps working', async () => {
      const { frame } = await openDev({ spy: true });
      frame.contentWindow.addEventListener('unhandledrejection', e => e.preventDefault());

      frame.contentWindow.eval('Promise.reject(new Error("E1 rejection"))');
      await waitFor(() => errors(frame).length > 0, 3000, 'the captured rejection');

      expect(errors(frame).map(({ kind, message }) => ({ kind, message })))
        .to.deep.equal([{ kind: 'rejection', message: 'E1 rejection' }]);
      expect(stillPlays(frame)).to.equal(true);
    });
  });

  it('DBG-A1: every API method answers with a plain object, and state() matches the board on screen', async () => {
    const { frame } = await openDev();
    const dev = api(frame);
    const isPlain = value => Object.getPrototypeOf(value) === frame.contentWindow.Object.prototype
      && JSON.stringify(plain(value)) === JSON.stringify(value);

    const results = {
      state: dev.state(),
      load: await dev.load(MEDIUM, { replace: true }),
      inspect: dev.inspect(),
      coachStep: dev.coachStep(),
      candidates: dev.candidates(),
      setPencilMarks: dev.setPencilMarks('r1c2', [1, 2]),
      fillPencilMarks: dev.fillPencilMarks(),
      exportSession: dev.exportSession(),
      replay: await dev.replay(twoActionDoc(), { replace: true, discardHistory: true }),
      generate: await dev.generate('kiddie', 1, { replace: true }),
      clearHistory: dev.clearHistory({ discardHistory: true }),
      logging: dev.logging(),
      setLogging: dev.setLogging('actions', false),
    };
    await appFrame(frame);

    expect(Object.entries(results).filter(([, r]) => !isPlain(r)).map(([name]) => name)).to.deep.equal([]);
    expect(Object.entries(results).filter(([, r]) => r.ok !== true).map(([name]) => name)).to.deep.equal([]);
    const screen = $$(frame, '.cell').map(el => (el.matches('.given, .pen') ? el.textContent : '0')).join('');
    expect(screen).to.equal(dev.state().board);
  });

  it('DBG-SYS2: a seed copied from the diagnostics in one tab regenerates the same puzzle and diagnostics in another', async () => {
    const a = open('/index.html?dev=1');
    await waitForPuzzle(a);
    await waitForDevPanel(a);
    let copied = null;
    Object.defineProperty(a.contentWindow.navigator, 'clipboard',
      { value: { writeText: text => { copied = text; return Promise.resolve(); } }, configurable: true });
    const diagnosticsRows = frame => $$(frame, '#dev-gen-info tr')
      .map(tr => [tr.querySelector('th').textContent, tr.querySelector('td').firstChild.textContent]);
    $(a, '#dev-gen').open = true;
    $(a, '#dev-gen-copy').click();
    await waitFor(() => copied !== null, 3000, 'the copied seed');
    const original = {
      givens: plain(api(a).state()).puzzle.givens,
      requestedTier: gsOf(a).getState().puzzle.gen.requestedTier,
      rows: diagnosticsRows(a),
    };
    close(a);

    const { frame: b } = await openDev();
    $(b, '#dev-gen').open = true;
    $(b, '#dev-gen-tier').value = original.requestedTier;
    $(b, '#dev-gen-seed').value = copied;
    $(b, '#dev-gen-run').click();
    await waitFor(() => $(b, '#dev-gen-status').textContent.startsWith(`Generated from seed ${copied}:`), 20000, 'the seeded run');

    const differing = diagnosticsRows(b).filter(([field, value]) =>
      value !== original.rows.find(([f]) => f === field)?.[1]).map(([field]) => field);
    expect(plain(api(b).state()).puzzle.givens).to.equal(original.givens);
    expect(diagnosticsRows(b).map(([field]) => field)).to.deep.equal(original.rows.map(([field]) => field));
    expect(differing).to.deep.equal(['Seed chosen by']);
  });

  it('round trip: a session exported through the API, reloaded and replayed, restores the position, the history and a clean report', async () => {
    const { frame } = await openDev();
    await api(frame).load(KIDDIE, { replace: true });   // loaded at its tier's hint limit
    enter(frame, 2, Number(KIDDIE_SOLUTION[2]));
    gsOf(frame).dispatch({ type: 'SET_MODE', mode: 'pencil' });
    gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 3 });
    gsOf(frame).dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });
    gsOf(frame).dispatch({ type: 'SET_MODE', mode: 'pen' });
    $(frame, '#btn-hint').click();
    $(frame, '#btn-coach').click();
    gsOf(frame).dispatch({ type: 'SELECT_CELL', index: 5 });
    const expected = plain(api(frame).state());
    const doc = plain(api(frame).exportSession().document);
    close(frame);

    const reloaded = open('/index.html');
    await waitForPuzzle(reloaded);
    await waitFor(() => api(reloaded), 20000, 'window.sudokuDev');
    const result = plain(await api(reloaded).replay(JSON.stringify(doc), { replace: true, discardHistory: true }));

    expect(result.ok).to.equal(true);
    expect(withoutRecorder(plain(api(reloaded).state()))).to.deep.equal(withoutRecorder(expected));
    expect(plain(api(reloaded).exportSession().document).actions).to.deep.equal(doc.actions);
    expect(result.report.divergences).to.deep.equal([]);
    expect(result.report.compared).to.be.at.least(2);
    expect([result.applied, result.total]).to.deep.equal([doc.actions.length, doc.actions.length]);
  });

  // ── fspec D-35 e: the developer panel never changes the board selection ──

  describe('D-35 e: the panel keeps the board selection; a click elsewhere still deselects', () => {
    /** Every developer control except the inspector's step list, whose selection moves the board cursor by design. */
    const panelControls = frame => [$(frame, '#dev-root'), ...$$(frame,
      '#dev-root summary, #dev-root button, #dev-root textarea, #dev-root input, #dev-root select, '
      + '#dev-root [tabindex="0"], #dev-root p, #dev-root h2, #dev-root h3')]
      .filter(el => !el.closest('#dev-inspect-list'));

    it('clicking every panel control and the panel background leaves the selected cell selected and records no DESELECT', async () => {
      const { frame } = await openDev();
      Object.defineProperty(frame.contentWindow.navigator, 'clipboard',
        { value: { writeText: () => Promise.resolve() }, configurable: true });
      for (const d of $$(frame, '#dev-root details')) d.open = true;
      const cell = KIDDIE.indexOf('0');
      gsOf(frame).dispatch({ type: 'SELECT_CELL', index: cell });
      const deselects = [];
      gsOf(frame).on('changed', ({ action }) => { if (action.type === 'DESELECT') deselects.push(action); });

      const clicked = [];
      for (const el of panelControls(frame)) {
        el.click();
        clicked.push(el.id || el.tagName);
        await wait(0);
        if (dialogOpen(frame)) $(frame, '#modal-cancel').click();
        gsOf(frame).getState().selected === cell || expect.fail(`clicking ${el.id || el.tagName} changed the selection`);
      }
      await wait(200);

      expect(clicked.length).to.be.above(30);
      expect(deselects).to.deep.equal([]);
      expect(gsOf(frame).getState().selected).to.equal(cell);
    });

    it('activating the DEV badge leaves the selected cell selected and records no DESELECT', async () => {
      const { frame } = await openDev();
      const cell = KIDDIE.indexOf('0');
      gsOf(frame).dispatch({ type: 'SELECT_CELL', index: cell });
      const deselects = [];
      gsOf(frame).on('changed', ({ action }) => { if (action.type === 'DESELECT') deselects.push(action); });

      $(frame, '#dev-badge').click();
      await wait(0);

      expect(deselects).to.deep.equal([]);
      expect(gsOf(frame).getState().selected).to.equal(cell);
    });

    for (const [mode, src] of [['developer mode', '/index.html?dev=1'], ['normal mode', '/index.html']]) {
      it(`a click on the page outside the panel, grid and number pad deselects in ${mode}`, async () => {
        seedSavedGame({ givens: KIDDIE, solution: KIDDIE_SOLUTION, difficulty: 'kiddie' });
        const frame = open(src);
        await waitForPuzzle(frame);
        gsOf(frame).dispatch({ type: 'SELECT_CELL', index: KIDDIE.indexOf('0') });

        frame.contentDocument.body.click();

        expect(gsOf(frame).getState().selected).to.equal(null);
      });
    }
  });
});
