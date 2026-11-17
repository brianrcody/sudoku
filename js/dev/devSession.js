/**
 * @fileoverview The developer-session controller (aspec-debug-instrumentation
 * §11): one implementation of every developer operation, shared by the
 * Session recorder panel and `window.sudokuDev`.
 *
 * Every operation takes an `intent` saying how a confirmation is answered:
 * `{ ask: true }` (panel: open the dialog) or `{ ask: false, replace,
 * discardHistory, acceptFallback }` (API: the caller has stated it). Each
 * returns a plain result object, `{ ok, reason?, message, … }`. The controller
 * is the only place that announces an operation's outcome, and it never moves
 * focus except to put it back after a replay commit.
 */

import {
  prepare, run as runReplay, compare, buildReport, outcomeMessage, count,
} from './replay.js';
import { describeState } from './sessionCodec.js';
import { runInspector, summarize, cellRef, generationDiagnostics } from './inspect.js';
import { CATEGORIES } from './devLog.js';
import { createMachine } from './machine.js';
import { initialCandidates } from '../solver/candidates.js';
import { tierForRank } from '../solver/logical.js';
import { rate } from '../generator/rater.js';
import { analyze } from '../coach/analyzer.js';
import { nextHint } from '../providers/hintProvider.js';
import { hasProgress } from '../game/puzzleLoader.js';
import { announce, muted } from '../ui/srLive.js';
import { close as closeConfirmation } from '../ui/dialog.js';
import { copyText } from '../util/clipboard.js';
import { diagnostics } from '../util/events.js';
import { DIFFICULTY_ORDER, TIER_LABELS, UNRATED } from '../config.js';

// ── Wording (fspec-007 §4.2, §5, §6, §7, §10.1.1) ───────────────────────────

const PASS_REPLACE = 'Pass replace: true to replace a game with progress.';
const passDiscard = ({ actions, errors }) =>
  `Pass discardHistory: true to discard the recorded history (${historyCounts(actions, errors)}).`;
const historyCounts = (actions, errors) => `${count(actions, 'action')}, ${count(errors, 'error')}`;

const REPLAY_RUNNING = 'A replay is running.';
const NO_PUZZLE = 'No puzzle loaded.';
const NO_SESSION = 'No active coach session.';
const GAME_WON = 'The puzzle is complete; pencil marks can\'t be changed.';
const GENERATING = 'A puzzle is being generated.';
const INVALID_DIGITS = 'Pencil marks must be a list of digits 1–9.';
const INVALID_PUZZLE_ARGUMENT = 'The puzzle must be given as a string.';

const REPLAY_DECLINED = 'Session not replayed. Your game and recorded history are unchanged.';
const CHECKING = 'Checking session…';
const COMPARING = 'Comparing with current code…';

const HISTORY_CLEARED = 'History cleared.';
const HISTORY_NOT_CLEARED = 'History not cleared.';

const COPIED_FAILED = 'Couldn\'t copy automatically. The session document is shown for you to copy.';

const NOT_GENERATED = 'No puzzle generated. Your game continues.';
const INVALID_TIER = `Tier must be one of: ${DIFFICULTY_ORDER.join(', ')}.`;
const INVALID_SEED = 'Seed must be a whole number from 0 to 4294967295.';
const MAX_SEED = 4294967295;

const INVALID_CATEGORY = `Logging category must be one of: ${Object.keys(CATEGORIES).join(', ')}.`;
const INVALID_VALUE = 'Logging can only be set to true or false.';

const CELL_REF = /^r[1-9]c[1-9]$/;

/** Replay phases in which a panel replay is replaced by a newer panel replay (aspec §11.3). */
const SUPERSEDABLE = new Set(['waiting', 'checking', 'confirming']);

const fail = (reason, message) => ({ ok: false, reason, message });
const BUSY = () => fail('busy', REPLAY_RUNNING);
const DECLINED_REPLAY = () => fail('declined', REPLAY_DECLINED);

/** Digits 1–9 present in a bitmask, ascending. */
function digitsOf(mask) {
  const digits = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) digits.push(d);
  return digits;
}

/**
 * Check a seeded run's tier and seed (fspec §6.9, §7.2), in that order. The
 * tier is matched in any letter case; a seed string is trimmed.
 *
 * @param {*} tier
 * @param {*} seed
 * @returns {{ok: true, tier: string, seed: number} | {ok: false, reason: string, message: string}}
 */
export function validateGenerateArgs(tier, seed) {
  const id = typeof tier === 'string' ? tier.toLowerCase() : null;
  if (!DIFFICULTY_ORDER.includes(id)) return fail('invalid-tier', INVALID_TIER);
  let value = null;
  if (typeof seed === 'string') {
    const trimmed = seed.trim();
    if (/^\d{1,10}$/.test(trimmed)) value = Number(trimmed);
  } else if (Number.isInteger(seed)) {
    value = seed;
  }
  if (value === null || value < 0 || value > MAX_SEED) return fail('invalid-seed', INVALID_SEED);
  return { ok: true, tier: id, seed: value };
}

/**
 * @typedef {{ask: true, onStart?: function(): void}
 *   | {ask: false, replace?: boolean, discardHistory?: boolean, acceptFallback?: boolean,
 *      budget?: number}} Intent
 *   How confirmations are answered: the panel asks, the API states its intent.
 *   `onStart` (panel) runs just before a seeded generation starts; `budget`
 *   (API, already validated) overrides the tier's attempt budget.
 */

/**
 * @typedef {Object} DevSession
 * @property {function(): object} state
 * @property {function(*, Intent): Promise<object>} load
 * @property {function(): object} inspect
 * @property {function(): object} coachStep
 * @property {function(): object} candidates
 * @property {function(*, *): object} setPencilMarks
 * @property {function(): object} fillPencilMarks
 * @property {function(): object} exportSession
 * @property {function(): Promise<object>} copySession - Panel only.
 * @property {function(*, {stopAfter?: *}, Intent, 'panel'|'api'): Promise<object>} replay
 * @property {function(Intent): (object|Promise<object>)} clearHistory
 *   Synchronous unless it has to ask.
 * @property {function(*, *, Intent): Promise<object>} generate
 * @property {function(): object} logging
 * @property {function(*, *): object} setLogging
 * @property {boolean} applying - A replay is committing (fspec §6.1 `busy`).
 * @property {function(string, function): function} on - `'replay-status'`
 *   (`{text, error}`), `'replay-report'` (a report, or null to empty the area),
 *   `'cleared'` (`{discarded}`), `'cleared-fallback'`. Returns an unsubscribe.
 */

/**
 * Build the controller.
 *
 * @param {Object} deps
 * @param {{getState: function, dispatch: function}} deps.gameState
 * @param {{recorder: import('./recorder.js').Recorder, log: import('./devLog.js').DevLog}} deps.dev
 *   The developer boot object.
 * @param {function(string, object=): Promise<import('../game/puzzleLoader.js').LoadOutcome>} deps.loadPuzzle
 *   The shared loader, bound to the `string` source; options pass through.
 * @param {function({title: string, body: string, confirmLabel: string}): Promise<boolean>} deps.confirm
 * @param {function({tier: string, seed: number, fallback: string, budget?: number}):
 *   Promise<import('../game/foreground.js').SeededOutcome>} deps.generateSeeded
 * @param {function(): void} deps.beforeReplace - Cancels a generation and closes any dialog.
 * @param {function(Array<{givens: Uint8Array, solution: Uint8Array}>): Promise<Array<{ok: boolean}>>} deps.checkPuzzles
 * @param {function(string): Promise<boolean>} [deps.copy]
 * @param {function} [deps.analyzeStep] - The coach analyzer, for comparison.
 * @param {function} [deps.hint] - The hint provider, for comparison.
 * @param {function} [deps.makeMachine] - Test seam, passed to `run`.
 * @param {function(): Promise<void>} [deps.pause] - Test seam, passed to `compare`.
 * @param {number} [deps.yieldEvery] - Test seam, passed to `compare`.
 * @param {number} [deps.current] - Test seam, passed to `prepare`.
 * @param {Object<number, function>} [deps.upgraders] - Test seam, passed to `prepare`.
 * @param {function(): void} [deps.closeDialog] - Closes the open confirmation
 *   dialog, as declined; defaults to `ui/dialog.js` `close`.
 * @returns {DevSession}
 */
export function createDevSession({
  gameState, dev, loadPuzzle, confirm, generateSeeded, beforeReplace, checkPuzzles,
  copy = copyText, analyzeStep = analyze, hint = nextHint, makeMachine = createMachine,
  pause, yieldEvery, current, upgraders, closeDialog = closeConfirmation,
}) {
  const { recorder, log } = dev;

  /** @type {Map<string, Set<function>>} */
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }

  function emit(event, payload) {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(payload);
  }

  /** Set while a replay is committing; synchronous, so seen only re-entrantly. */
  let applying = false;

  /** Replays in flight, any phase. */
  const replays = new Set();

  // ── Reads ─────────────────────────────────────────────────────────────────

  function state() {
    return { ok: true, ...describeState(gameState.getState(), recorder.counts()) };
  }

  function inspect() {
    const s = gameState.getState();
    if (s.puzzle === null) return fail('no-puzzle', NO_PUZZLE);
    const r = runInspector(s.pen);
    return {
      ok: true,
      summary: summarize(r),
      solved: r.solved,
      unsolvedCells: r.remaining,
      hardestRank: r.solved ? r.hardest : null,
      tier: r.solved ? tierForRank(r.hardest) : null,
      steps: r.steps.map(step => ({
        number: step.index + 1,
        technique: step.technique,
        text: step.text,
        placement: step.placement === null
          ? null
          : { cell: cellRef(step.placement.cellIndex), digit: step.placement.digit },
        eliminations: step.eliminations.map(({ cellIndex, digit }) => ({ cell: cellRef(cellIndex), digit })),
        pattern: step.cells.pattern.map(cellRef),
      })),
    };
  }

  function coachStep() {
    const session = gameState.getState().coachSession;
    if (session === null) return { ok: true, active: false, step: null, message: NO_SESSION };
    // The same JSON the Coach step data tool shows, detached from the live step.
    return { ok: true, active: true, step: JSON.parse(JSON.stringify(session.step)) };
  }

  function candidates() {
    const { puzzle, pen } = gameState.getState();
    if (puzzle === null) return fail('no-puzzle', NO_PUZZLE);
    const computed = initialCandidates(pen);
    return { ok: true, candidates: Array.from(computed, (mask, i) => (pen[i] === 0 ? digitsOf(mask) : [])) };
  }

  function exportSession() {
    return { ok: true, document: recorder.exportDocument() };
  }

  function logging() {
    return { ok: true, logging: log.get() };
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  async function load(text, intent) {
    if (applying) return BUSY();
    if (typeof text !== 'string') return fail('invalid-argument', INVALID_PUZZLE_ARGUMENT);
    const outcome = await loadPuzzle(text, intent.ask ? {} : { confirm: async () => intent.replace === true });
    let result;
    if (outcome.status === 'loaded') {
      result = { ok: true, tier: outcome.puzzle.difficulty, message: outcome.message };
    } else if (outcome.status === 'rejected') {
      result = fail('rejected', outcome.message);
    } else {
      result = intent.ask
        ? fail('declined', outcome.message)
        : fail('needs-replace', `${outcome.message} ${PASS_REPLACE}`);
    }
    // The API announces only a change to the game (fspec §6.1).
    if (result.ok || intent.ask) announce(result.message);
    return result;
  }

  // ── Pencil marks ──────────────────────────────────────────────────────────

  /** The shared preconditions of fspec §6.7, in table order. */
  function pencilBlocked(s) {
    if (applying) return BUSY();
    if (s.puzzle === null) return fail('no-puzzle', NO_PUZZLE);
    if (s.won) return fail('game-won', GAME_WON);
    if (s.generating) return fail('busy', GENERATING);
    return null;
  }

  function setPencilMarks(cell, digits) {
    const s = gameState.getState();
    const blocked = pencilBlocked(s);
    if (blocked !== null) return blocked;
    if (typeof cell !== 'string' || !CELL_REF.test(cell)) {
      return fail('invalid-cell', `${String(cell)} is not a cell reference such as r4c7.`);
    }
    const index = (Number(cell[1]) - 1) * 9 + (Number(cell[3]) - 1);
    if (s.pen[index] !== 0) return fail('cell-filled', `${cell} holds a digit; it can't take pencil marks.`);
    if (!Array.isArray(digits) || !digits.every(d => Number.isInteger(d) && d >= 1 && d <= 9)) {
      return fail('invalid-digits', INVALID_DIGITS);
    }
    const mask = digits.reduce((m, d) => m | (1 << (d - 1)), 0);
    const changed = s.pencil[index] !== mask;
    // Dispatched even when unchanged, so the call is recorded as having changed nothing.
    gameState.dispatch({ type: 'DEV_SET_PENCIL', index, mask });
    const message = `Pencil marks set in ${cell}.`;
    if (changed) announce(message);
    return { ok: true, cell, digits: digitsOf(mask), message };
  }

  function fillPencilMarks() {
    const s = gameState.getState();
    const blocked = pencilBlocked(s);
    if (blocked !== null) return blocked;
    // Counted across all 81 cells after the dispatch: ending a coach session
    // can restore marks to a cell that now holds a digit (fspec D-34).
    const before = s.pencil.slice();
    gameState.dispatch({ type: 'DEV_FILL_PENCIL', pencil: initialCandidates(s.pen) });
    const after = gameState.getState().pencil;
    let cellsChanged = 0;
    for (let i = 0; i < 81; i++) {
      if (before[i] !== after[i]) cellsChanged++;
    }
    const message = `Pencil marks filled in ${count(cellsChanged, 'cell')}.`;
    if (cellsChanged > 0) announce(message);
    return { ok: true, cellsChanged, message };
  }

  // ── History ───────────────────────────────────────────────────────────────

  async function copySession() {
    const doc = recorder.exportDocument();
    const text = JSON.stringify(doc, null, 2);
    const copied = await copy(text);
    const result = copied
      ? { ok: true, message: `Session copied: ${historyCounts(doc.actions.length, doc.errors.length)}.` }
      : { ...fail('copy-failed', COPIED_FAILED), document: text };
    announce(result.message);
    return result;
  }

  function clearNow() {
    const discarded = recorder.clear();
    emit('cleared', { discarded });
    announce(HISTORY_CLEARED);
    return { ok: true, message: HISTORY_CLEARED, discarded };
  }

  function clearHistory(intent) {
    if (applying) return BUSY();
    const counts = recorder.counts();
    if (counts.actions + counts.errors === 0 || (!intent.ask && intent.discardHistory === true)) {
      return clearNow();
    }
    if (!intent.ask) return fail('needs-discard-history', `${HISTORY_NOT_CLEARED} ${passDiscard(counts)}`);
    return confirm({
      title: 'Clear recorded history?',
      body: `The recorded history (${historyCounts(counts.actions, counts.errors)}) will be discarded. `
        + 'Your game is not affected.',
      confirmLabel: 'Clear History',
    }).then(confirmed => {
      if (confirmed) return clearNow();
      announce(HISTORY_NOT_CLEARED);
      return fail('declined', HISTORY_NOT_CLEARED);
    });
  }

  // ── Replay (aspec §11.3) ──────────────────────────────────────────────────

  /** The dialog body of fspec §5.4 for what the replay would discard. */
  function replayBody(progress, history, { actions, errors }) {
    const recorded = `recorded history (${historyCounts(actions, errors)}) will be discarded`;
    if (!history) return 'Your current progress will be lost.';
    if (!progress) return `The ${recorded}.`;
    return `Your current progress will be lost, and the ${recorded}.`;
  }

  function needsIntent(missing, counts) {
    const sentences = [REPLAY_DECLINED];
    if (missing.includes('replace')) sentences.push(PASS_REPLACE);
    if (missing.includes('discardHistory')) sentences.push(passDiscard(counts));
    return {
      ok: false,
      reason: missing[0] === 'replace' ? 'needs-replace' : 'needs-discard-history',
      missing,
      message: sentences.join(' '),
    };
  }

  function status(text, error = false) {
    emit('replay-status', { text, error });
  }

  /**
   * Replace the game and the history with the replayed session, in one
   * synchronous block: no other input is handled until it ends.
   */
  function commit(doc, n) {
    applying = true;
    try {
      beforeReplace();
      emit('replay-report', null);
      emit('cleared-fallback');
      const mark = recorder.mark();
      const result = runReplay(doc, n, { makeMachine });
      recorder.replaceHistory(doc.start, result.entries);
      if (result.stopped !== null) {
        recorder.captureError({ kind: 'uncaught', message: result.stopped.message, stack: null, source: null });
      }
      // The win banner moves focus on the next frame; put it back where it was.
      const focused = document.activeElement;
      muted(() => recorder.silently(() => gameState.dispatch({ type: 'DEV_RESTORE_POSITION', position: result.position })));
      requestAnimationFrame(() => {
        if (document.activeElement !== focused) focused.focus();
      });
      return { result, mark };
    } finally {
      applying = false;
    }
  }

  async function replaySteps(input, stopAfter, intent, run) {
    if (run.superseded) return DECLINED_REPLAY();
    run.phase = 'checking';
    status(CHECKING);
    const prepared = await prepare(input, { stopAfter, checkPuzzles, current, upgraders });
    if ('error' in prepared) diagnostics.emit('swallowed', { where: 'replay.prepare', error: prepared.error });
    if (run.superseded) return DECLINED_REPLAY();
    if (!prepared.ok) {
      emit('replay-report', null);
      status(prepared.message, true);
      announce(prepared.message);
      return fail('rejected', prepared.message);
    }

    run.phase = 'confirming';
    const progress = hasProgress(gameState.getState());
    const counts = recorder.counts();
    const history = counts.actions + counts.errors > 0;
    if (intent.ask) {
      if (progress || history) {
        const confirmed = await confirm({
          title: 'Replay this session?',
          body: replayBody(progress, history, counts),
          confirmLabel: 'Replay',
        });
        if (run.superseded) return DECLINED_REPLAY();
        if (!confirmed) {
          status(REPLAY_DECLINED);
          announce(REPLAY_DECLINED);
          return DECLINED_REPLAY();
        }
      }
    } else {
      const missing = [];
      if (progress && intent.replace !== true) missing.push('replace');
      if (history && intent.discardHistory !== true) missing.push('discardHistory');
      if (missing.length > 0) {
        status(REPLAY_DECLINED);
        return needsIntent(missing, counts);
      }
    }

    run.phase = 'applying';
    const { result, mark } = commit(prepared.doc, prepared.n);

    run.phase = 'comparing';
    status(COMPARING);
    const comparison = await compare(result.jobs, { analyze: analyzeStep, nextHint: hint, pause, yieldEvery });
    const report = buildReport({
      doc: prepared.doc, notes: prepared.notes, run: result, comparison, raised: recorder.errorsSince(mark),
    });
    const outcome = outcomeMessage(report);
    emit('replay-report', report);
    status(outcome.text, outcome.error);
    announce(outcome.text);
    const counted = { applied: report.applied, total: report.total };
    return report.stopped === null
      ? { ok: true, ...counted, message: outcome.text, report }
      : { ok: false, reason: 'stopped', ...counted, stoppedAt: report.stopped.at, message: outcome.text, report };
  }

  /**
   * Replay a session document (fspec §5, §6.8). A panel replay supersedes an
   * earlier panel replay that has not reached the commit, and waits for any
   * other; an API replay is refused while any replay is in flight.
   *
   * @param {string|object} input
   * @param {{stopAfter?: *}} opts
   * @param {Intent} intent
   * @param {'panel'|'api'} via
   * @returns {Promise<object>}
   */
  function replay(input, { stopAfter } = {}, intent, via) {
    const live = [...replays].filter(r => !r.superseded);
    if (via === 'api' && live.length > 0) return Promise.resolve(BUSY());

    for (const other of live) {
      if (other.via === 'panel' && SUPERSEDABLE.has(other.phase)) other.supersede();
    }
    const waitFor = live.filter(r => !r.superseded).map(r => r.finished);

    let supersede;
    const superseded = new Promise(resolve => { supersede = resolve; });
    const run = { via, phase: 'waiting', superseded: false, finished: null };
    run.supersede = () => {
      run.superseded = true;
      // Its confirmation is open; close it now, as declined, rather than
      // leave it for a newer replay that may never open one (fspec §5.4).
      if (run.phase === 'confirming') closeDialog();
      supersede(DECLINED_REPLAY());
    };
    replays.add(run);

    const work = Promise.all(waitFor)
      .then(() => replaySteps(input, stopAfter, intent, run))
      .finally(() => replays.delete(run));
    // Waiters need only to know it ended, never how.
    run.finished = work.catch(() => {});
    return Promise.race([work, superseded]);
  }

  // ── Seeded generation (aspec §11.4) ───────────────────────────────────────

  function generatedResult(outcome, tier, seed) {
    const diagnosticsOf = puzzle => generationDiagnostics(puzzle, givens => rate(givens).trace);
    switch (outcome.status) {
      case 'loaded': {
        const { puzzle, fallback } = outcome;
        const actual = `Generated from seed ${seed}: ${TIER_LABELS[puzzle.difficulty]} puzzle.`;
        return {
          ok: true,
          requestedTier: tier,
          tier: puzzle.difficulty,
          seed,
          fallback,
          diagnostics: diagnosticsOf(puzzle),
          message: fallback ? `${actual} No ${TIER_LABELS[tier]} puzzle was found within the budget.` : actual,
        };
      }
      case 'needs-accept-fallback': {
        const { puzzle } = outcome;
        const verdict = puzzle.difficulty === UNRATED
          ? 'can\'t be rated'
          : `is rated ${TIER_LABELS[puzzle.difficulty]}`;
        return {
          ok: false,
          reason: 'needs-accept-fallback',
          requestedTier: tier,
          tier: puzzle.difficulty,
          seed,
          diagnostics: diagnosticsOf(puzzle),
          message: `No ${TIER_LABELS[tier]} puzzle found. The best the generator found ${verdict}. `
            + 'Pass acceptFallback: true to play it.',
        };
      }
      case 'fallback-declined':
        return fail('declined', NOT_GENERATED);
      case 'cancelled':
        return fail('cancelled', 'Generation cancelled.');
      case 'replaced':
        return fail('cancelled', 'Generation replaced by another request.');
      default:
        return fail('failed', 'The puzzle couldn\'t be generated.');
    }
  }

  /**
   * Generate from a tier and seed (fspec §6.9, §7.2). Every outcome of a run
   * that started is announced; a result returned before the run starts is
   * announced for the panel only.
   */
  async function generate(tier, seed, intent) {
    if (applying) return BUSY();
    const args = validateGenerateArgs(tier, seed);
    if (!args.ok) {
      if (intent.ask) announce(args.message);
      return args;
    }
    if (hasProgress(gameState.getState())) {
      if (!intent.ask) {
        if (intent.replace !== true) return fail('needs-replace', `${NOT_GENERATED} ${PASS_REPLACE}`);
      } else if (!await confirm({
        title: 'Generate from this seed?',
        body: 'Your current progress will be lost.',
        confirmLabel: 'Generate',
      })) {
        announce(NOT_GENERATED);
        return fail('declined', NOT_GENERATED);
      }
    }
    intent.onStart?.();
    const policy = intent.ask ? 'ask' : intent.acceptFallback === true ? 'accept' : 'refuse';
    const outcome = await generateSeeded({ tier: args.tier, seed: args.seed, fallback: policy, budget: intent.budget });
    const result = generatedResult(outcome, args.tier, args.seed);
    announce(result.message);
    return result;
  }

  // ── Logging switches ──────────────────────────────────────────────────────

  function setLogging(category, on) {
    if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) {
      return fail('invalid-category', INVALID_CATEGORY);
    }
    if (on !== true && on !== false) return fail('invalid-value', INVALID_VALUE);
    const message = `${CATEGORIES[category].label} logging ${on ? 'on' : 'off'}.`;
    if (log.set(category, on)) announce(message);
    return { ok: true, category, on, logging: log.get(), message };
  }

  return {
    state, load, inspect, coachStep, candidates, setPencilMarks, fillPencilMarks,
    exportSession, copySession, replay, clearHistory, generate, logging, setLogging, on,
    get applying() { return applying; },
  };
}
