/**
 * @fileoverview Record-then-replay fidelity (tspec-debug-instrumentation §6.2
 * PR2, §6.3 PR3, §9 PERF-D2u).
 *
 * A live game is built the way developer mode builds it: statistics
 * suppressed (and a statistics object that throws if reached), the hint
 * provider wrapped by `devBoot`, the recorder's tap, and `devBoot`'s capture of
 * listener errors. The real `ui/coach.js` is mounted once for the file, so its
 * focus follow-ups and recap timeout happen as in the app; a stand-in for
 * `main.js`'s difficulty listener issues the generation start synchronously.
 * A fake clock drives the check-highlight and recap timers, which fire only
 * when the driver advances it, as top-level recorded actions.
 *
 * At every checkpoint the exported document must validate, replay to the live
 * fingerprint in all eleven parts, and replay through the fixture helper to
 * the live `state()` with no divergence. A failure names the seed and the
 * action index and logs the exported document, so it can be saved as a
 * fixture.
 */

import { boot } from '../../dev/devBoot.js';
import { createGameState } from '../../game/state.js';
import { mount as mountCoach } from '../../ui/coach.js';
import { nextHint } from '../../providers/hintProvider.js';
import { prepare, run } from '../../dev/replay.js';
import { createMachine, applyEntry } from '../../dev/machine.js';
import { createRecorder } from '../../dev/recorder.js';
import { fingerprint, describeState, encodePosition, decodePosition } from '../../dev/sessionCodec.js';
import { runInspector, boardAtStep, pencilAtStep } from '../../dev/inspect.js';
import { checkGivens, validateGivens } from '../../generator/loadPuzzle.js';
import { mulberry32 } from '../../prng.js';
import { KIDDIE, MEDIUM, HARD, UNRATED, toGivens } from '../fixtures/puzzles/loadable.js';
import { replayFixture } from '../helpers/replayFixture.js';
import { createSessionDriver } from '../helpers/sessionDriver.js';
import { installFakeClock } from '../helpers/fakeClock.js';

const BUSY_CLEARED = 'Replay ended during a puzzle generation; the busy state was cleared.';
const CHECKPOINT_EVERY = 200;

const checkPuzzles = puzzles => puzzles.map(({ givens, solution }) => checkGivens(givens, solution));

function genOf(requestedTier, seed) {
  return {
    requestedTier, seed, seedBy: seed === null ? null : 'random', budget: 30, attempts: 3,
    rejected: { unsolved: 0, wrongTier: 2, byTier: { easy: 2 } }, fallback: false,
  };
}

function sweepPuzzle(id, givensText, difficulty, source, gen) {
  const givens = toGivens(givensText);
  const puzzle = { id, difficulty, givens, solution: validateGivens(givens).solution, solveTrace: [] };
  if (source !== undefined) puzzle.source = source;
  if (gen !== undefined) puzzle.gen = gen;
  return puzzle;
}

/**
 * Kiddie, Medium, Hard and an Unrated puzzle; generated with a numeric seed,
 * with `seed: null`, and with no `gen`; and from a link.
 */
let PUZZLES;

// ── coach.js, mounted once ──────────────────────────────────────────────────

/**
 * `coach.js` is a module singleton: it is mounted once on this host, which
 * forwards to the live game of the current run, and to an idle game between
 * runs so a stray "c" keypress after this file finds no puzzle.
 */
const coachHost = {
  idle: null,
  current: null,
  listeners: [],
  on(type, fn) {
    this.listeners.push(fn);
    return () => {};
  },
  getState() { return this.current.getState(); },
  dispatch(action) { this.current.dispatch(action); },
};

function mountCoachOnce() {
  coachHost.idle = createGameState({
    stats: { recordAttemptOnce() {}, recordWin() {} }, hintProvider: { nextHint: () => null }, statsSuppressed: () => true,
  });
  coachHost.current = coachHost.idle;
  const fixture = document.createElement('div');
  fixture.innerHTML = '<button id="btn-coach"></button><div id="coach-panel-wrap"></div><div id="coach-recap"></div>';
  document.body.appendChild(fixture);
  mountCoach(document.body, coachHost);
  // coach.js keeps its element references; detached, they cannot collide with later tests' ids.
  fixture.remove();
}

// ── The live rig ─────────────────────────────────────────────────────────────

const NO_STORAGE = { getItem: () => null, setItem: () => {} };
const SILENT = { log() {}, warn() {} };

/**
 * A live developer-mode game with one recorder per capacity, all observing the
 * same dispatches. Recorder times come from `time`, which only the driver moves.
 */
async function liveRig(capacities) {
  const time = { value: Date.UTC(2026, 10, 16, 9, 0, 0) };
  const boots = capacities.map(capacity => boot({
    win: new EventTarget(), idb: null, storage: NO_STORAGE, out: SILENT, now: () => time.value, fresh: true, capacity,
  }));
  const tap = {
    begin: action => boots.forEach(b => b.tap.begin(action)),
    end: action => boots.forEach(b => b.tap.end(action)),
  };
  const hintProvider = boots.reduce((provider, b) => b.wrapHintProvider(provider), { nextHint });
  const live = createGameState({
    stats: {
      recordAttemptOnce() { throw new Error('statistics recorded in developer mode'); },
      recordWin() { throw new Error('statistics recorded in developer mode'); },
    },
    hintProvider,
    statsSuppressed: () => true,
    tap,
  });

  // Listener order as in main.js: the coach before the persistence/difficulty listener.
  const offCoach = live.on('changed', payload => coachHost.listeners.forEach(fn => fn(payload)));
  const offDifficulty = live.on('changed', ({ action }) => {
    if (action.type === 'CHANGE_DIFFICULTY') {
      live.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…', difficulty: action.difficulty });
    }
  });
  coachHost.current = live;

  boots.forEach(b => b.bootComplete(live));
  await Promise.all(boots.map(b => b.recorder.ready));

  return {
    live,
    time,
    recorders: boots.map(b => b.recorder),
    dispose() {
      offCoach();
      offDifficulty();
      coachHost.current = coachHost.idle;
      boots.forEach(b => b.dispose());
    },
  };
}

// ── The driver ───────────────────────────────────────────────────────────────

/**
 * `sessionDriver` for player and application actions, plus the kinds it does
 * not issue: coached-cell selection, developer pencil and board tools,
 * restores of earlier positions, unlimited hints, clock advances, and
 * dispatches under a throwing listener.
 */
function sweepDriver(seed, rig, clock) {
  const driver = createSessionDriver(seed, { puzzles: PUZZLES });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const int = n => Math.floor(rng() * n);
  const pick = list => list[int(list.length)];
  const saved = [];
  const { live } = rig;

  function extra(state) {
    const roll = rng();
    if (roll < 0.3) {
      const coached = state.coachSession === null ? [] : [...state.coachSession.coachedCells];
      return coached.length > 0 ? { type: 'SELECT_CELL', index: pick(coached) } : null;
    }
    if (roll < 0.45) return { type: 'DEV_SET_PENCIL', index: int(81), mask: int(512) };
    if (roll < 0.55) return { type: 'DEV_FILL_PENCIL', pencil: Uint16Array.from({ length: 81 }, () => int(512)) };
    if (roll < 0.65) {
      if (state.puzzle === null) return null;
      const inspection = runInspector(state.pen);
      if (inspection.steps.length === 0) return null;
      const upTo = int(inspection.steps.length);
      return {
        type: 'DEV_SET_BOARD',
        pen: boardAtStep(state.pen, inspection.steps, upTo),
        pencil: pencilAtStep(state.pencil, state.pen, inspection.steps, upTo),
      };
    }
    if (roll < 0.8) {
      if (saved.length === 0) return null;
      return { type: 'DEV_RESTORE_POSITION', position: decodePosition(pick(saved)) };
    }
    if (roll < 0.88) return { type: 'RESTORE_SESSION', hintsRemaining: Infinity, attemptRecorded: rng() < 0.5 };
    return { type: 'SET_GENERATING', flag: rng() < 0.5 };
  }

  function dispatchUnderThrowingListener(action) {
    const off = live.on('changed', () => { throw new Error('sweep listener failure'); });
    const realError = console.error;
    console.error = () => {};
    try {
      live.dispatch(action);
    } finally {
      console.error = realError;
      off();
    }
  }

  /** One step: an action, or a clock advance of 100 ms to 3 s. */
  return function step() {
    rig.time.value += 1 + int(900);
    const roll = rng();
    if (roll < 0.04) {
      clock.advance(100 + int(2901));
      return;
    }
    if (roll < 0.06) saved.push(encodePosition(live.getState()));
    const state = live.getState();
    const action = (roll < 0.16 ? extra(state) : null) ?? driver.next(state);
    if (rng() < 0.05) dispatchUnderThrowingListener(action);
    else live.dispatch(action);
  };
}

// ── The invariant ────────────────────────────────────────────────────────────

/** A replay ends any generation in progress (fspec §5.6), so the expectation does too. */
const expectedOf = state => (state.generating ? { ...state, generating: false } : state);

function withoutRecorder(state) {
  const { recorder, ...rest } = state;
  return rest;
}

function differingParts(actual, expected) {
  return Object.keys(expected).filter(part => actual[part] !== expected[part])
    .map(part => `${part}\n    live:   ${expected[part]}\n    replay: ${actual[part]}`);
}

/** Fails with the seed, the action index and what differs; logs the document. */
function fail(where, doc, detail) {
  console.warn(`[fidelity] ${where}: exported document follows\n${JSON.stringify(doc)}`);
  expect.fail(`${where}: ${detail}`);
}

/** The PR2 invariant for one recorder's export against the live game. */
async function checkFidelity(live, recorder, where) {
  const doc = recorder.exportDocument();
  const liveState = live.getState();
  const expected = expectedOf(liveState);

  const prepared = await prepare(doc, { checkPuzzles });
  if (!prepared.ok) fail(where, doc, `the export does not validate: ${prepared.message}`);

  const replayed = run(prepared.doc, prepared.n);
  const parts = differingParts(fingerprint(replayed.position), fingerprint(expected));
  if (parts.length > 0) fail(where, doc, `fingerprint differs in\n  ${parts.join('\n  ')}`);

  const helper = await replayFixture(JSON.stringify(doc));
  const counts = { actions: 0, errors: 0, capacity: 0 };
  const liveDescribed = withoutRecorder(describeState(expected, counts));
  const replayDescribed = withoutRecorder(helper.state);
  if (JSON.stringify(replayDescribed) !== JSON.stringify(liveDescribed)) {
    fail(where, doc, `state() differs\n  live:   ${JSON.stringify(liveDescribed)}\n  replay: ${JSON.stringify(replayDescribed)}`);
  }
  if (helper.report.divergences.length > 0) {
    fail(where, doc, `divergences ${JSON.stringify(helper.report.divergences)}`);
  }
  if (helper.report.stopped !== null) fail(where, doc, `stopped ${JSON.stringify(helper.report.stopped)}`);
  expect(helper.report.notes, `${where}: notes`).to.deep.equal(liveState.generating ? [BUSY_CLEARED] : []);
  return doc;
}

/**
 * Plays `actions` steps on a fresh rig, calling `check` every
 * CHECKPOINT_EVERY steps and at the end, then drains pending timers.
 */
async function sweep(seed, actions, capacities, check) {
  const clock = installFakeClock();
  let rig = null;
  try {
    rig = await liveRig(capacities);
    const step = sweepDriver(seed, rig, clock);
    for (let i = 1; i <= actions; i++) {
      step();
      if (i % CHECKPOINT_EVERY === 0 || i === actions) await check(rig, `seed ${seed}, action ${i}`);
    }
    clock.advance(10000);
  } finally {
    rig?.dispose();
    clock.uninstall();
  }
  return rig;
}

describe('record-then-replay fidelity', function () {
  this.timeout(60000);

  let started;
  before(() => {
    started = performance.now();
    PUZZLES = [
      sweepPuzzle('sweep-kiddie', KIDDIE, 'kiddie', 'generated', genOf('kiddie', 2718281828)),
      sweepPuzzle('sweep-medium', MEDIUM, 'medium', 'generated', genOf('medium', null)),
      sweepPuzzle('sweep-hard', HARD, 'hard', 'generated'),
      sweepPuzzle('sweep-unrated', UNRATED, 'unrated', 'link'),
    ];
    mountCoachOnce();
  });

  after(() => {
    console.log(`[PERF] Fidelity sweep (PR2, PR3, PERF-D2u): ${Math.round(performance.now() - started)} ms`);
  });

  describe('PR2: a recorded session replays to the live game', () => {
    const runs = [
      [1, 1500, undefined], [2, 1500, undefined], [3, 1500, undefined], [4, 3000, 50], [5, 300, 1],
    ];
    for (const [seed, actions, capacity] of runs) {
      const label = capacity === undefined ? 'the default capacity' : `capacity ${capacity}`;
      it(`seed ${seed}: ${actions} actions at ${label}`, async () => {
        let checkpoints = 0;

        const rig = await sweep(seed, actions, [capacity], async ({ live, recorders }, where) => {
          await checkFidelity(live, recorders[0], where);
          checkpoints++;
        });

        expect(checkpoints).to.equal(Math.ceil(actions / CHECKPOINT_EVERY));
        expect(rig.recorders[0].counts().actions).to.be.above(0);
      });
    }
  });

  describe('PR3: trimming at capacity is equivalent to keeping everything', () => {
    for (const [seed, capacity] of [[11, 1], [12, 2], [13, 7], [14, 50]]) {
      it(`seed ${seed}: capacity ${capacity} keeps the tail of the full history from an equivalent start`, async () => {
        await sweep(seed, 600, [1e6, capacity], async ({ live, recorders: [full, trimmed] }, where) => {
          const u = full.exportDocument();
          const c = trimmed.exportDocument();
          const removed = u.actions.length - c.actions.length;

          expect(c.actions, `${where}: kept actions`).to.deep.equal(u.actions.slice(removed));
          // Applied directly rather than through run(), which would end a generation in progress.
          const base = createMachine(u.start);
          for (const item of u.actions.slice(0, removed)) applyEntry(base, { a: item.action, f: item.then });
          expect(fingerprint(base.getState()), `${where}: start`).to.deep.equal(fingerprint(createMachine(c.start).getState()));
          await checkFidelity(live, full, `${where} (full history)`);
          await checkFidelity(live, trimmed, `${where} (capacity ${capacity})`);
        });
      });
    }
  });

  it('PERF-D2u: run and replaceHistory for a 5,000-action document take under 500 ms', async () => {
    const clock = installFakeClock();
    let doc;
    try {
      const rig = await liveRig([5000]);
      const driver = createSessionDriver(0x5000, { puzzles: PUZZLES });
      const [recorder] = rig.recorders;
      while (recorder.counts().actions < 5000) {
        rig.time.value += 250;
        rig.live.dispatch(driver.next(rig.live.getState()));
      }
      doc = recorder.exportDocument();
      rig.dispose();
    } finally {
      clock.uninstall();
    }
    const kinds = doc.actions.map(a => a.action.type);
    const target = createRecorder({
      store: { write() {}, replaceAll() {}, status: () => 'ok' }, log: { action() {} },
      opened: Promise.resolve({ status: 'empty' }),
    });
    target.bootComplete(createGameState({ stats: {}, hintProvider: { nextHint: () => null } }));
    await target.ready;
    const prepared = await prepare(doc, { checkPuzzles });

    const t0 = performance.now();
    const result = run(prepared.doc, prepared.n);
    target.replaceHistory(prepared.doc.start, result.entries);
    const ms = performance.now() - t0;

    console.log(`[PERF] PERF-D2u run + replaceHistory, ${doc.actions.length} actions `
      + `(${kinds.filter(k => k === 'COACH_START').length} coach starts, ${kinds.filter(k => k === 'HINT').length} hints): `
      + `${ms.toFixed(1)} ms (bound 500 ms)`);
    expect(result.applied).to.equal(5000);
    expect(target.counts().actions).to.equal(Math.min(result.entries.length, 5000));
    expect(ms).to.be.below(500);
  });
});
