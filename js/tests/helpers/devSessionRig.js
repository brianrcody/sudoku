/**
 * @fileoverview A developer-session controller over real collaborators, for
 * the controller and API tests (tspec-debug-instrumentation §2.7): a real game
 * store recorded by a real recorder (in-memory store), a real `devLog` with a
 * fake console and in-memory storage, the real puzzle loader over a fake
 * rater, and fakes for every other injected function. Nothing touches
 * IndexedDB, `localStorage`, a timer, or a worker.
 */

import { createDevSession } from '/js/dev/devSession.js';
import { createRecorder } from '/js/dev/recorder.js';
import { createDevLog } from '/js/dev/devLog.js';
import { describeState } from '/js/dev/sessionCodec.js';
import { createGameState } from '/js/game/state.js';
import { createPuzzleLoader } from '/js/game/puzzleLoader.js';
import { createForegroundGenerator } from '/js/game/foreground.js';
import { checkGivens } from '/js/generator/loadPuzzle.js';
import { generateForTier } from '/js/generator/pipeline.js';
import { mulberry32 } from '/js/prng.js';
import { createEmitter } from '/js/util/events.js';
import { mount as mountSrLive } from '/js/ui/srLive.js';
import { KIDDIE, KIDDIE_SOLUTION, toGivens } from '../fixtures/puzzles/loadable.js';
import { makePuzzle, plainPositionDoc, manualTimers, SOLUTION } from './codecFixtures.js';

/** The recorder's clock: every entry and export is stamped with this time. */
export const NOW = Date.UTC(2026, 10, 16, 10, 0, 0);

export const EXPORTED = '2026-11-16T09:00:00.000Z';

/** The recorded time of action `n` of a test document. */
export const at = n => new Date(Date.UTC(2026, 10, 16, 8, 0, n)).toISOString();

export const sel = index => ({ type: 'SELECT_CELL', index });
export const pen = digit => ({ type: 'PEN_ENTER', digit });
export const LOAD = (givens = KIDDIE, difficulty = 'easy') =>
  ({ type: 'PUZZLE_LOADED', puzzle: makePuzzle({ givens, difficulty }) });

/** Intents as the panel and the API pass them. */
export const PANEL = Object.freeze({ ask: true });
export const API = Object.freeze({ ask: false });
export const api = flags => ({ ask: false, ...flags });

/**
 * A session document over `start`; bare actions are stamped `at(1)`, `at(2)`, ….
 *
 * @param {{start?: object, actions?: object[], errors?: object[]}} [parts]
 */
export function sessionDoc({ start = plainPositionDoc(), actions = [], errors = [] } = {}) {
  return {
    format: 'sudoku-session',
    version: 1,
    exportedAt: EXPORTED,
    start,
    actions: actions.map((action, i) => ({ at: at(i + 1), action })),
    errors,
  };
}

/** KIDDIE as Easy: select r1c3, then enter its solution digit. */
export const twoActionDoc = () => sessionDoc({ actions: [sel(2), pen(SOLUTION[2])] });

/** The outcome message of `twoActionDoc` replayed in full. */
export const TWO_ACTIONS_REPLAYED = 'Session replayed: 2 of 2 actions. No computed results to compare.';

/** The worker's puzzle check, run in place. */
export const checkAll = puzzles => puzzles.map(({ givens, solution }) => checkGivens(givens, solution));

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * A confirmation dialog that behaves as `ui/dialog.js` does through main.js's
 * wrapper: opening one while another is open answers the earlier one with
 * `false`. With `auto` given, every dialog is answered with it at once;
 * otherwise `answer(value)` answers the open one.
 *
 * @param {boolean} [auto]
 */
export function fakeConfirm(auto) {
  const opened = [];
  let open = null;
  const confirm = opts => new Promise(resolve => {
    open?.resolve(false);
    opened.push(opts);
    if (auto !== undefined) {
      open = null;
      resolve(auto);
      return;
    }
    open = { resolve };
  });
  return Object.assign(confirm, {
    opened,
    isOpen: () => open !== null,
    answer(value) {
      const current = open;
      open = null;
      current.resolve(value);
    },
  });
}

/**
 * A foreground generator over the real pipeline, run in place as the worker
 * runs it (`seeded: true`), or over `requestPuzzle` when given.
 *
 * @param {object} gameState
 * @param {{saved?: string, requestPuzzle?: function}} [opts]
 */
export function realForeground(gameState, { saved = 'medium', requestPuzzle } = {}) {
  const written = [];
  const dialogs = [];
  const fg = createForegroundGenerator({
    gameState,
    requestPuzzle: requestPuzzle ?? (async ({ difficulty, seed, budget }) => {
      const puzzle = generateForTier(difficulty, { rng: mulberry32(seed), seed, seeded: true, budget });
      return { puzzle, fallback: puzzle.difficulty !== difficulty };
    }),
    openDialog: opts => dialogs.push(opts),
    announce: () => {},
    preference: { read: () => saved, write: tier => written.push(tier) },
    diagnostics: createEmitter(),
  });
  return { fg, written, dialogs };
}

/**
 * Build the controller.
 *
 * @param {Object} [opts]
 * @param {function} [opts.confirm] - Defaults to a dialog that always confirms.
 * @param {function(object): object} [opts.wrapRecorder] - Replaces the recorder the controller sees.
 * @param {{saved?: string, requestPuzzle?: function}} [opts.foreground]
 *   Wire `generateSeeded` and `beforeReplace` to a real foreground generator.
 * @param {Object} [opts.deps] - Overrides for `createDevSession`'s dependencies.
 * @returns {Promise<object>} The controller and everything around it. `dispose()` must be called.
 */
export async function devSessionRig({ confirm = fakeConfirm(true), wrapRecorder = r => r, foreground, deps = {} } = {}) {
  const saved = new Map();
  const storage = { getItem: key => (saved.has(key) ? saved.get(key) : null), setItem: (key, value) => saved.set(key, value) };
  const out = { lines: [], log(...args) { this.lines.push(args); }, warn(...args) { this.lines.push(args); } };
  const log = createDevLog({ out, storage });
  const recorder = createRecorder({
    store: { write() {}, replaceAll() {}, status: () => 'ok' },
    log,
    opened: Promise.resolve({ status: 'empty' }),
    now: () => NOW,
    clock: () => 0,
  });
  const gs = createGameState({
    stats: { recordAttemptOnce() {}, recordWin() {} },
    hintProvider: { nextHint: () => null },
    statsSuppressed: () => true,
    tap: recorder.tap,
    timers: manualTimers().timers,
  });
  recorder.bootComplete(gs);
  await recorder.ready;

  const calls = { dispatched: [], beforeReplace: 0, generated: [], loadOptions: [], perCallConfirms: 0, copied: [] };
  const loader = createPuzzleLoader({
    gameState: gs,
    rateGivens: async givens => ({
      ok: true,
      puzzle: { id: 'loaded', difficulty: 'medium', givens, solution: toGivens(KIDDIE_SOLUTION), solveTrace: [] },
    }),
    confirm,
    beforeReplace: () => {},
  });
  const fgRig = foreground ? realForeground(gs, foreground) : null;

  const rig = {
    gs, recorder, log, saved, out, confirm, calls, fg: fgRig?.fg, written: fgRig?.written, dialogs: fgRig?.dialogs,
    /** What the next `generateSeeded` resolves with, when no foreground is wired. */
    outcome: { status: 'cancelled' },
  };
  rig.session = createDevSession({
    gameState: {
      getState: gs.getState,
      on: gs.on,
      dispatch: action => { calls.dispatched.push(action); gs.dispatch(action); },
    },
    dev: { recorder: wrapRecorder(recorder), log },
    loadPuzzle: (text, opts) => {
      calls.loadOptions.push(opts);
      const once = opts.confirm && ((...args) => { calls.perCallConfirms++; return opts.confirm(...args); });
      return loader.load(text, { source: 'string', ...opts, ...(once ? { confirm: once } : {}) });
    },
    confirm,
    generateSeeded: fgRig
      ? args => { calls.generated.push(args); return fgRig.fg.generateSeeded(args); }
      : async args => { calls.generated.push(args); return rig.outcome; },
    beforeReplace: () => {
      calls.beforeReplace++;
      fgRig?.fg.abort('replaced');
    },
    checkPuzzles: checkAll,
    copy: async text => { calls.copied.push(text); return true; },
    pause: () => Promise.resolve(),
    ...deps,
  });
  rig.dispose = () => log.dispose();
  /** Everything a failed call must leave untouched, as text. */
  rig.snapshot = () => JSON.stringify({
    state: describeState(gs.getState(), recorder.counts()),
    history: recorder.exportDocument(),
    logging: log.get(),
  });
  return rig;
}

/** Load KIDDIE and enter r1c3's digit: the game has progress and the history 3 actions. */
export function withProgress(rig) {
  rig.gs.dispatch(LOAD());
  rig.gs.dispatch(sel(2));
  rig.gs.dispatch(pen(SOLUTION[2]));
}

/**
 * A live region for `ui/srLive.js` in its own container, mounted, and every
 * non-empty text written to it. `dispose()` waits two frames so pending writes and the
 * controller's focus restore land before the next test.
 */
export function liveRegion() {
  const container = document.createElement('div');
  const region = document.createElement('div');
  region.id = 'sr-live';
  container.appendChild(region);
  document.body.appendChild(container);
  mountSrLive(container);
  const texts = [];
  const observer = new MutationObserver(() => {
    if (region.textContent !== '') texts.push(region.textContent);
  });
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return {
    container,
    region,
    texts,
    async dispose() {
      await frames(2);
      observer.disconnect();
      container.remove();
    },
  };
}

export const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

export async function frames(n = 2) {
  for (let i = 0; i < n; i++) await frame();
}

/** Lets every pending promise reaction and zero-delay timer run. */
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));
