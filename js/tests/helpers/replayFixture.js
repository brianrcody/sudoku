/**
 * @fileoverview Regression-fixture helper (aspec-debug-instrumentation §13,
 * fspec-007 §9): replays a session document against the current code with the
 * same functions the app uses, and returns what a test can assert on.
 *
 * Deterministic by construction: the machine has an inert clock and timers,
 * recorded times are carried and never read, and nothing touches storage, the
 * DOM, a dialog, statistics, the generator or a live game store.
 */

import { prepare, run, compare, buildReport } from '/js/dev/replay.js';
import { describeState } from '/js/dev/sessionCodec.js';
import { RECORDER_CAPACITY } from '/js/dev/recorder.js';
import { checkGivens } from '/js/generator/loadPuzzle.js';
import { analyze } from '/js/coach/analyzer.js';
import { nextHint } from '/js/providers/hintProvider.js';

/** The worker's puzzle check, run in place. */
const checkPuzzles = puzzles => puzzles.map(({ givens, solution }) => checkGivens(givens, solution));

/**
 * Replay a session document against the current code.
 *
 * @param {object|string} document
 * @param {{ stopAfter?: number|string, makeMachine?: function,
 *           current?: number, upgraders?: object }} [opts]
 *   The last three are for the helper's own tests: `makeMachine` reaches the
 *   stopped outcome, `current` / `upgraders` the format-upgrade note.
 * @returns {Promise<{ state: object, report: import('/js/dev/replay.js').Report,
 *   applied: number, total: number }>} `state` has the shape of the API's
 *   `state()`; a stopped replay resolves with `report.stopped` set and `state`
 *   at the position reached.
 * @throws {Error} With the fspec §5.9 rejection message when the document is rejected.
 */
export async function replayFixture(document, { stopAfter, makeMachine, current, upgraders } = {}) {
  const prepared = await prepare(document, { stopAfter, checkPuzzles, current, upgraders });
  if (!prepared.ok) throw new Error(prepared.message);

  const result = run(prepared.doc, prepared.n, { makeMachine });
  const comparison = await compare(result.jobs, { analyze, nextHint, pause: () => Promise.resolve() });
  // In the app the recorder captures the error that stopped the replay (fspec §5.5).
  const raised = result.stopped === null
    ? []
    : [{ kind: 'uncaught', afterAction: result.applied, message: result.stopped.message, count: 1 }];
  const report = buildReport({ doc: prepared.doc, notes: prepared.notes, run: result, comparison, raised });

  const state = describeState(result.position,
    { actions: result.applied, errors: 0, capacity: RECORDER_CAPACITY });
  return { state, report, applied: report.applied, total: report.total };
}

/**
 * Fetch a fixture from js/tests/fixtures/sessions/.
 *
 * @param {string} name - File name, e.g. `'format-v1-baseline.json'`.
 * @returns {Promise<string>} The document's JSON text.
 */
export async function loadSessionFixture(name) {
  const response = await fetch(`/js/tests/fixtures/sessions/${name}`);
  if (!response.ok) throw new Error(`No session fixture ${name}.`);
  return response.text();
}
