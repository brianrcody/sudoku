/**
 * @fileoverview Normal-mode behaviour of js/game/state.js is unchanged by the
 * debug-instrumentation seams (tspec-debug-instrumentation SG1–SG3, PR5).
 *
 * The golden file is captured by js/tests/tools/captureGoldenTrace.js running
 * the same script (js/tests/helpers/goldenScript.js). Its first capture came
 * from a4defe6, before the seams, and proved they change nothing in normal
 * mode; it is now re-captured from the working tree, after review, whenever
 * reducer behaviour changes deliberately. Each test replays the script against
 * the current reducer and requires identical emits, state snapshots,
 * statistics calls, and hint-provider calls.
 */

import { createGameState } from '../../game/state.js';
import { nextHint } from '../../providers/hintProvider.js';
import { loadFromGivens } from '../../generator/loadPuzzle.js';
import { runGoldenScript, GOLDEN_PUZZLES } from '../helpers/goldenScript.js';
import { createTracedStore, firstDivergence } from '../helpers/stateTrace.js';
import { createSessionDriver } from '../helpers/sessionDriver.js';
import { MEDIUM, HARD, toGivens } from '../fixtures/puzzles/loadable.js';

/** Real-timer script: one check highlight is left to expire (CHECK_HIGHLIGHT_MS). */
const SCRIPT_TIMEOUT_MS = 15000;

let golden;

async function goldenTrace() {
  if (!golden) {
    const doc = await (await fetch('/js/tests/fixtures/state/golden-trace.json')).json();
    golden = doc.trace;
  }
  return golden;
}

function manualTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    timers: {
      now: () => 1000,
      set: fn => { const id = nextId++; pending.set(id, fn); return id; },
      clear: id => { pending.delete(id); },
    },
    fireAll() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

describe('state.js normal mode matches the pre-change reducer (golden trace)', function () {
  this.timeout(SCRIPT_TIMEOUT_MS);

  it('SG1: the golden script with no tap and default timers reproduces the golden trace', async () => {
    const expected = await goldenTrace();

    const actual = await runGoldenScript(createGameState);

    expect(firstDivergence(actual, expected)).to.equal(null);
  });

  it('SG2: a no-op tap leaves the golden trace unchanged', async () => {
    const expected = await goldenTrace();

    const actual = await runGoldenScript(createGameState, { tap: { begin() {}, end() {} } });

    expect(firstDivergence(actual, expected)).to.equal(null);
  });

  it('SG3: explicit real timers leave the golden trace unchanged', async () => {
    const expected = await goldenTrace();
    // Bound: the reducer calls them as methods, and the window timer functions
    // throw "Illegal invocation" with any other receiver.
    const timers = { now: Date.now, set: setTimeout.bind(window), clear: clearTimeout.bind(window) };

    const actual = await runGoldenScript(createGameState, { timers });

    expect(firstDivergence(actual, expected)).to.equal(null);
  });

  it('PR5: 2,000 random actions emit identically with a null tap and a no-op tap', function () {
    this.timeout(30000);
    const SEED = 0x5eed05;
    const puzzles = [
      GOLDEN_PUZZLES.kiddie, GOLDEN_PUZZLES.easy, GOLDEN_PUZZLES.hard,
      { ...loadFromGivens(toGivens(MEDIUM)).puzzle, id: 'medium' },
      { ...loadFromGivens(toGivens(HARD)).puzzle, id: 'hard' },
    ];
    const clockA = manualTimers();
    const clockB = manualTimers();
    const a = createTracedStore(createGameState, { hint: nextHint, extraDeps: { timers: clockA.timers } });
    const b = createTracedStore(createGameState, {
      hint: nextHint, extraDeps: { timers: clockB.timers, tap: { begin() {}, end() {} } },
    });
    const driver = createSessionDriver(SEED, { puzzles });

    for (let i = 0; i < 2000; i++) {
      if (driver.rng() < 0.03) {
        clockA.fireAll();
        clockB.fireAll();
      }
      const action = driver.next(a.store.getState());
      a.trace.push({ e: 'dispatch', n: i, type: action.type });
      b.trace.push({ e: 'dispatch', n: i, type: action.type });
      a.store.dispatch(action);
      b.store.dispatch(action);
    }

    expect(a.trace.filter(r => r.e === 'emit').length).to.be.greaterThan(1000);
    expect(firstDivergence(b.trace, a.trace), `seed ${SEED}`).to.equal(null);
  });
});

describe('DBG-OFF7: the dispatch tap costs nothing measurable when developer mode is off', function () {
  this.timeout(30000);

  const DISPATCHES = 10000;
  const ROUNDS = 15;

  function store(tap) {
    const gs = createGameState({
      stats: { recordAttemptOnce() {}, recordWin() {} },
      hintProvider: { nextHint: () => null },
      tap,
    });
    gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: loadFromGivens(toGivens(MEDIUM)).puzzle });
    return gs;
  }

  function timeSelections(gs) {
    const t0 = performance.now();
    for (let i = 0; i < DISPATCHES; i++) gs.dispatch({ type: 'SELECT_CELL', index: i % 81 });
    return performance.now() - t0;
  }

  it('10,000 SELECT_CELL dispatches with a null tap are not slower than with a no-op tap beyond noise (×1.5)', () => {
    const plain = store(null);
    const tapped = store({ begin() {}, end() {} });
    timeSelections(plain);
    timeSelections(tapped);

    // Interleaved rounds; the fastest of each resists GC pauses and scheduling noise.
    const nullTimes = [];
    const noopTimes = [];
    for (let round = 0; round < ROUNDS; round++) {
      nullTimes.push(timeSelections(plain));
      noopTimes.push(timeSelections(tapped));
    }
    const nullBest = Math.min(...nullTimes);
    const noopBest = Math.min(...noopTimes);

    console.log(`[PERF] DBG-OFF7 ${DISPATCHES} SELECT_CELL: tap null ${nullBest.toFixed(1)} ms, `
      + `no-op tap ${noopBest.toFixed(1)} ms (best of ${ROUNDS})`);
    expect(nullBest).to.be.below(noopBest * 1.5);
  });
});
