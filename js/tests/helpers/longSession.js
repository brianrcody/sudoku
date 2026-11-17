/**
 * @fileoverview A long recorded session for the performance tests
 * (tspec-debug-instrumentation §9 PERF-D2, PERF-D4): `sessionDriver` play on a
 * developer-mode game store recorded by a real recorder, exported as a
 * session document. Coach starts carry real analyzer results and hints real
 * hint-provider results, so the document is as costly to compare as a real
 * one. Nothing touches IndexedDB, storage, a timer, or the DOM.
 */

import { boot } from '/js/dev/devBoot.js';
import { createGameState } from '/js/game/state.js';
import { nextHint } from '/js/providers/hintProvider.js';
import { validateGivens } from '/js/generator/loadPuzzle.js';
import { KIDDIE, MEDIUM, HARD, toGivens } from '../fixtures/puzzles/loadable.js';
import { createSessionDriver } from './sessionDriver.js';
import { manualTimers } from './codecFixtures.js';

function puzzle(id, givensText, difficulty) {
  const givens = toGivens(givensText);
  return { id, difficulty, givens, solution: validateGivens(givens).solution, solveTrace: [], source: 'string' };
}

/**
 * @param {{actions?: number, seed?: number}} [opts]
 * @returns {Promise<object>} A session document with exactly `actions` actions.
 */
export async function longSessionDocument({ actions = 5000, seed = 0x5000 } = {}) {
  const time = { value: Date.UTC(2026, 10, 16, 9, 0, 0) };
  const dev = boot({
    win: new EventTarget(), idb: null, storage: { getItem: () => null, setItem() {} },
    out: { log() {}, warn() {} }, now: () => time.value, fresh: true, capacity: actions,
  });
  const live = createGameState({
    stats: { recordAttemptOnce() {}, recordWin() {} },
    hintProvider: dev.wrapHintProvider({ nextHint }),
    statsSuppressed: () => true,
    tap: dev.tap,
    timers: manualTimers().timers,
  });
  dev.bootComplete(live);
  await dev.recorder.ready;
  const driver = createSessionDriver(seed, {
    puzzles: [puzzle('long-kiddie', KIDDIE, 'kiddie'), puzzle('long-medium', MEDIUM, 'medium'), puzzle('long-hard', HARD, 'hard')],
  });
  try {
    while (dev.recorder.counts().actions < actions) {
      time.value += 250;
      live.dispatch(driver.next(live.getState()));
    }
    return dev.recorder.exportDocument();
  } finally {
    dev.dispose();
  }
}
