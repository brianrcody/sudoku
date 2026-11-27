/**
 * @fileoverview The replay engine (aspec-debug-instrumentation §8.3–8.5):
 * checking a session document, applying its actions verbatim on a headless
 * machine, comparing its computed results with the current code, and the
 * report and message text of fspec-007 §5.8–5.9.
 *
 * No DOM, storage or game store. The analyzer, the hint provider and the
 * puzzle check are injected; they are used only to check puzzles and to
 * compare, never to apply an action.
 */

import {
  readDocument, validatePosition, validateActionItem, decodePuzzle, encodePosition,
  DETAIL_INVALID,
} from './sessionCodec.js';
import { createMachine, applyEntry, snapshot } from './machine.js';
import { UNRATED } from '../config.js';
import { rejectionDetail } from '../game/puzzleLoader.js';

// ── Wording (fspec-007 §5.3, §5.8, §5.9) ───────────────────────────────────

const REJECTED = 'This session can\'t be replayed.';
const NO_DOCUMENT = 'No session document was supplied.';
const NOT_JSON = 'The text is not valid JSON.';
const BAD_STOP = 'Stop after must be a whole number, 0 or greater.';
const ENDS_WITHOUT_PUZZLE = 'It would end before any puzzle is loaded. Choose a later stopping point.';
const NOT_CHECKED = 'The session couldn\'t be checked.';

/** Detail for a puzzle whose recorded solution is not its one solution (fspec §5.3). */
export const SOLUTION_MISMATCH = 'The recorded solution is not the puzzle\'s solution.';

const BUSY_CLEARED = 'Replay ended during a puzzle generation; the busy state was cleared.';

const NOT_COMPARED_UNRATED = 'hints and coach are unavailable on an Unrated puzzle';
const NOT_COMPARED_NO_CHANGE = 'the recorded action changed nothing';
const NOT_COMPARED_START = 'the position before it is not in the document';

const KIND_LABELS = { coach: 'coach step', hint: 'hint' };

const ERROR_KIND_LABELS = {
  uncaught: 'uncaught error',
  rejection: 'unhandled rejection',
  listener: 'listener exception',
};

/** Actions that carry a computed result, and the kind of result. */
const COMPARED_KINDS = { COACH_START: 'coach', COACH_NO_TECHNIQUE: 'coach', HINT: 'hint' };

const CANCEL_GENERATING = Object.freeze({ type: 'SET_GENERATING', flag: false });

// ── Typedefs ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ErrorItem
 * @property {'uncaught'|'rejection'|'listener'} kind
 * @property {number} afterAction - Action entries preceding the error; 0 before the first.
 * @property {string} message
 * @property {number} count - Repeat count.
 */

/**
 * @typedef {Object} Difference
 * @property {string} part - A coach part (aspec §8.4) or `cell`, `digit`, `technique`.
 * @property {*} recorded
 * @property {*} current
 */

/**
 * @typedef {Object} Divergence
 * @property {number} action - 1-based action number.
 * @property {'coach'|'hint'} kind
 * @property {string} time - The action's ISO time, from the document.
 * @property {Difference[]} differences
 * @property {string} [technique] - Coach only: the recorded technique, for the report line.
 * @property {number} [cell] - Hint only: the cell the hint was asked for, for the report line.
 */

/**
 * @typedef {Object} NotCompared
 * @property {number} action - 0 for a coach session in the starting position.
 * @property {'coach'|'hint'} kind
 * @property {string} reason
 */

/**
 * The replay report (aspec §5.7; fspec §6.8). Plain data: identical for the
 * same document and code in every time zone.
 *
 * @typedef {Object} Report
 * @property {number} applied - Actions applied.
 * @property {number} total - Actions in the document.
 * @property {number} compared - Computed results compared (*k*).
 * @property {{coach: number, hint: number}} counts - Compared, by kind.
 * @property {Divergence[]} divergences - In action order.
 * @property {NotCompared[]} notCompared - In action order.
 * @property {{recorded: ErrorItem[], raised: ErrorItem[]}} errors
 * @property {string[]} notes - Format upgrade, busy state cleared.
 * @property {null|{at: number, message: string}} stopped - The action that
 *   raised an error while being applied, and the error's message.
 */

/**
 * One computed result to compare: the action that carries it and the
 * position immediately before that action.
 *
 * @typedef {Object} CompareJob
 * @property {number} action
 * @property {'coach'|'hint'} kind
 * @property {string} [reason] - Set for an item that is never compared.
 * @property {string} [at] - The action's ISO time.
 * @property {import('./sessionCodec.js').ActionDoc} [doc] - The action as recorded.
 * @property {boolean} [noChange]
 * @property {object|null} [puzzle]
 * @property {Uint8Array} [pen]
 * @property {Uint16Array} [pencil]
 * @property {Set<number>} [conflicts]
 * @property {number|null} [selected]
 */

/**
 * @typedef {Object} RunResult
 * @property {import('../game/state.js').InternalPosition} position - The position to restore.
 * @property {number} applied
 * @property {Array<{t: number, a: object, nc?: true, f?: object[]}>} entries
 *   The applied actions as recorder entries, for `replaceHistory`.
 * @property {null|{at: number, message: string}} stopped
 * @property {CompareJob[]} jobs
 * @property {string[]} notes
 */

// ── Counts ───────────────────────────────────────────────────────────────────

/**
 * A count as shown to a person: thousands separated by a comma whatever the
 * locale, with its noun, singular for 1 and plural otherwise (fspec §1, D-35 f).
 *
 * @param {number} n
 * @param {string} [noun] - Singular, e.g. `'computed result'`; omitted for the number alone.
 * @returns {string} e.g. "1 action", "5,000 actions", "1,234".
 */
export function count(n, noun) {
  const digits = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return noun === undefined ? digits : `${digits} ${noun}${n === 1 ? '' : 's'}`;
}

// ── prepare ──────────────────────────────────────────────────────────────────

const rejected = reason => ({ ok: false, message: `${REJECTED} ${reason}` });

/** "… is not valid: *detail*." without doubling a detail's own full stop. */
const invalid = (subject, detail) => `${subject} is not valid: ${detail}${detail.endsWith('.') ? '' : '.'}`;

const puzzleKey = p => p.givens + p.solution;

/**
 * The puzzle an action sets: a puzzle document, null for a position without
 * one, or undefined when the action sets no puzzle.
 */
function puzzleSetBy(action) {
  switch (action.type) {
    case 'PUZZLE_LOADED':
    case 'NEW_PUZZLE':
      return action.puzzle;
    case 'PAGE_RELOADED':
    case 'DEV_RESTORE_POSITION':
      return action.position.puzzle;
    default:
      return undefined;
  }
}

const actionsOf = item => [item.action, ...(item.then ?? [])];

/** @returns {number|null} Actions to apply (Infinity for all), or null when invalid. */
function stopValue(stopAfter) {
  if (stopAfter === undefined || stopAfter === null) return Infinity;
  if (typeof stopAfter === 'string') {
    const trimmed = stopAfter.trim();
    if (trimmed === '') return Infinity;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  }
  return Number.isInteger(stopAfter) && stopAfter >= 0 ? stopAfter : null;
}

/**
 * Parse and check a session document and a stop value (fspec §5.3, in its
 * order). Every puzzle the document carries is checked in one call.
 *
 * @param {string|object} input - JSON text or a parsed document. Not mutated.
 * @param {Object} opts
 * @param {number|string|null} [opts.stopAfter] - Empty, null or undefined means all.
 * @param {function(Array<{givens: Uint8Array, solution: Uint8Array}>):
 *   (Promise<Array<import('../generator/loadPuzzle.js').CheckResult>>|
 *   Array<import('../generator/loadPuzzle.js').CheckResult>)} opts.checkPuzzles
 *   One result per puzzle, in order: `loadProvider.checkPuzzles`, or `checkGivens` mapped.
 * @param {number} [opts.current] - Test seam; see `readDocument`.
 * @param {Object<number, function(object): object>} [opts.upgraders] - Test seam; see `readDocument`.
 * @returns {Promise<{ok: true, doc: import('./sessionCodec.js').SessionDocument,
 *   n: number, total: number, notes: string[]} | {ok: false, message: string, error?: *}>}
 *   `message` is the whole rejection message of fspec §5.9. `error` is present
 *   when checking raised an exception ("The session couldn't be checked.").
 */
export async function prepare(input, { stopAfter, checkPuzzles, current, upgraders } = {}) {
  let value = input;
  if (typeof input === 'string') {
    if (input.trim() === '') return rejected(NO_DOCUMENT);
    try {
      value = JSON.parse(input);
    } catch {
      return rejected(NOT_JSON);
    }
  }

  try {
    const read = readDocument(value, { current, upgraders });
    if (!read.ok) return rejected(read.reason);
    const { doc } = read;
    if (!validatePosition(doc.start).ok) return rejected(invalid('Its starting position', DETAIL_INVALID));

    const structure = doc.actions.map(validateActionItem);
    const puzzles = new Map();
    const collect = puzzle => {
      if (puzzle) puzzles.set(puzzleKey(puzzle), puzzle);
    };
    collect(doc.start.puzzle);
    doc.actions.forEach((item, i) => {
      if (structure[i].ok) actionsOf(item).forEach(action => collect(puzzleSetBy(action)));
    });

    const list = [...puzzles.values()];
    const results = await checkPuzzles(list.map(p => {
      const { givens, solution } = decodePuzzle(p);
      return { givens, solution };
    }));
    const failures = new Map();
    list.forEach((p, i) => {
      if (!results[i].ok) failures.set(puzzleKey(p), results[i].reason);
    });
    const failureOf = puzzle => {
      const reason = puzzle ? failures.get(puzzleKey(puzzle)) : undefined;
      if (reason === undefined) return null;
      return reason === 'solution-mismatch' ? SOLUTION_MISMATCH : rejectionDetail(reason);
    };

    const startFailure = failureOf(doc.start.puzzle);
    if (startFailure !== null) return rejected(invalid('Its starting position', startFailure));
    for (let i = 0; i < doc.actions.length; i++) {
      if (!structure[i].ok) return rejected(invalid(`Action ${i + 1}`, structure[i].detail));
      for (const action of actionsOf(doc.actions[i])) {
        const failure = failureOf(puzzleSetBy(action));
        if (failure !== null) return rejected(invalid(`Action ${i + 1}`, failure));
      }
    }

    const stop = stopValue(stopAfter);
    if (stop === null) return rejected(BAD_STOP);
    const total = doc.actions.length;
    const n = Math.min(stop, total);

    // Decided statically: the last puzzle set among the start and the applied actions.
    let finalPuzzle = doc.start.puzzle;
    for (const item of doc.actions.slice(0, n)) {
      for (const action of actionsOf(item)) {
        const puzzle = puzzleSetBy(action);
        if (puzzle !== undefined) finalPuzzle = puzzle;
      }
    }
    if (finalPuzzle === null) return rejected(ENDS_WITHOUT_PUZZLE);

    const notes = read.writtenAs === read.readAs
      ? []
      : [`Document format version ${read.writtenAs} was read as version ${read.readAs}.`];
    return { ok: true, doc, n, total, notes };
  } catch (error) {
    // Surfaced for the caller to log; this module has no diagnostics channel.
    return { ...rejected(NOT_CHECKED), error };
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

const messageOf = err => String(err?.message ?? err);

function entryOf(item) {
  const entry = { t: Date.parse(item.at), a: item.action };
  if (item.noChange === true) entry.nc = true;
  if (item.then !== undefined) entry.f = item.then;
  return entry;
}

/**
 * Apply the first `n` actions of a prepared document verbatim on a headless
 * machine (fspec §5.5). Synchronous. An action that throws stops the run at
 * the position before it and is neither applied nor compared.
 *
 * @param {import('./sessionCodec.js').SessionDocument} doc - From `prepare`.
 * @param {number} n - From `prepare`.
 * @param {{makeMachine?: function(import('./sessionCodec.js').PositionDoc):
 *   import('./machine.js').Machine}} [opts] - Test seam for the stopped outcome.
 * @returns {RunResult}
 */
export function run(doc, n, { makeMachine = createMachine } = {}) {
  const machine = makeMachine(doc.start);
  const jobs = [];
  const entries = [];
  const notes = [];
  if (doc.start.coach !== null) jobs.push({ action: 0, kind: 'coach', reason: NOT_COMPARED_START });

  let stopped = null;
  let position = null;
  let applied = 0;
  for (; applied < n; applied++) {
    const item = doc.actions[applied];
    const before = snapshot(machine);
    try {
      applyEntry(machine, { a: item.action, f: item.then });
    } catch (err) {
      stopped = { at: applied + 1, message: messageOf(err) };
      position = before;
      break;
    }
    const kind = COMPARED_KINDS[item.action.type];
    if (kind !== undefined) {
      jobs.push({
        action: applied + 1,
        kind,
        at: item.at,
        doc: item.action,
        noChange: item.noChange === true,
        puzzle: before.puzzle,
        pen: before.pen,
        pencil: before.pencil,
        conflicts: before.conflicts,
        selected: before.selected,
      });
    }
    entries.push(entryOf(item));
  }
  if (stopped === null) position = snapshot(machine);

  // The live game would otherwise wait for a generation that is not running
  // (fspec §5.6). After a stop the machine is in an unknown state, so the
  // cancel is applied to a fresh one at the position reached.
  if (position.generating) {
    const end = stopped === null ? machine : makeMachine(encodePosition(position));
    applyEntry(end, { a: CANCEL_GENERATING });
    position = snapshot(end);
    const at = applied > 0 ? doc.actions[applied - 1].at : doc.exportedAt;
    entries.push({ t: Date.parse(at), a: { ...CANCEL_GENERATING } });
    notes.push(BUSY_CLEARED);
  }

  return { position, applied, entries, stopped, jobs, notes };
}

// ── compare ──────────────────────────────────────────────────────────────────

/** JSON with object keys sorted at every level. */
function canonical(value) {
  return JSON.stringify(value, (key, v) => (v !== null && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]))
    : v));
}

const isNoTechnique = result => result.type === 'no-technique';

const byCellThenDigit = (a, b) => a.cellIndex - b.cellIndex || a.digit - b.digit;

/** The compared parts of a coach step (aspec §8.4), in report order. */
const COACH_PARTS = [
  ['technique', s => s.technique],
  ['type', s => s.type],
  ['rank', s => s.rank],
  ['digits', s => s.digits],
  ['unit', s => s.unit],
  ['placement', s => (s.type === 'placement' ? { cell: s.roles.target, digit: s.digits[0] } : null)],
  ['eliminations', s => [...s.eliminations].sort(byCellThenDigit)],
  ['roles', s => s.roles],
  ['arrows', s => s.arrows],
  ['text', s => ({ supportingText: s.supportingText, note: s.complexity.note })],
  ['complexity', s => ({ acknowledged: s.complexity.acknowledged, endpoints: s.complexity.endpoints })],
  ['autoReveal', s => s.autoReveal],
];

const techniqueOf = result => (isNoTechnique(result) ? `none (${result.reason})` : result.technique);

/** @returns {Difference[]} */
function coachDifferences(recorded, current) {
  // A step against a no-technique answer differs in kind; only the technique is reported.
  const parts = isNoTechnique(recorded) || isNoTechnique(current)
    ? [['technique', techniqueOf]]
    : COACH_PARTS;
  const differences = [];
  for (const [part, valueOf] of parts) {
    const r = valueOf(recorded);
    const c = valueOf(current);
    if (canonical(r) !== canonical(c)) differences.push({ part, recorded: r, current: c });
  }
  return differences;
}

const NO_HINT = Object.freeze({ cellIndex: null, digit: null, technique: null });

/** @returns {Difference[]} */
function hintDifferences(recorded, current) {
  const r = recorded ?? NO_HINT;
  const c = current ?? NO_HINT;
  return [['cell', 'cellIndex'], ['digit', 'digit'], ['technique', 'technique']]
    .filter(([, field]) => r[field] !== c[field])
    .map(([part, field]) => ({ part, recorded: r[field], current: c[field] }));
}

function recordedCoach(doc) {
  return doc.type === 'COACH_START' ? doc.result : { type: 'no-technique', reason: doc.reason };
}

/**
 * @returns {{reason: string} | {differences: Difference[]}}
 */
function compareJob(job, analyze, nextHint) {
  if (job.reason !== undefined) return { reason: job.reason };
  if (job.puzzle?.difficulty === UNRATED) return { reason: NOT_COMPARED_UNRATED };
  if (job.noChange) return { reason: NOT_COMPARED_NO_CHANGE };
  try {
    if (job.kind === 'coach') {
      const current = analyze(job.puzzle, { pen: job.pen, conflicts: job.conflicts, pencil: job.pencil });
      return { differences: coachDifferences(recordedCoach(job.doc), current) };
    }
    const current = nextHint(job.puzzle, { pen: job.pen, conflicts: job.conflicts }, { targetCell: job.selected });
    return { differences: hintDifferences(job.doc.hint, current) };
  } catch (err) {
    return { reason: `the current code raised an error: ${messageOf(err)}` };
  }
}

const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Compare each job's recorded result with what the current code computes
 * from the position before the action (fspec §5.8). Time-sliced: after
 * `yieldEvery` milliseconds of work it awaits `pause()`. The result depends
 * only on the jobs and the injected functions, never on the pacing.
 *
 * A `pause` that rejects cancels the comparison: the returned promise
 * rejects with its reason and no further job is computed.
 *
 * @param {CompareJob[]} jobs - From `run`.
 * @param {Object} opts
 * @param {function} opts.analyze - `coach/analyzer.js` `analyze`.
 * @param {function} opts.nextHint - `providers/hintProvider.js` `nextHint`.
 * @param {number} [opts.yieldEvery] - Milliseconds of work between pauses.
 * @param {function(): Promise<void>} [opts.pause] - Defaults to a zero-delay timeout.
 * @returns {Promise<{divergences: Divergence[], notCompared: NotCompared[],
 *   compared: number, counts: {coach: number, hint: number}}>}
 */
export async function compare(jobs, { analyze, nextHint, yieldEvery = 12, pause = nextTask } = {}) {
  const divergences = [];
  const notCompared = [];
  const counts = { coach: 0, hint: 0 };
  let sliceStart = performance.now();
  for (const job of jobs) {
    const outcome = compareJob(job, analyze, nextHint);
    if (outcome.reason !== undefined) {
      notCompared.push({ action: job.action, kind: job.kind, reason: outcome.reason });
    } else {
      counts[job.kind]++;
      if (outcome.differences.length > 0) {
        const divergence = { action: job.action, kind: job.kind, time: job.at, differences: outcome.differences };
        if (job.kind === 'coach') divergence.technique = techniqueOf(recordedCoach(job.doc));
        else divergence.cell = job.selected;
        divergences.push(divergence);
      }
    }
    if (performance.now() - sliceStart >= yieldEvery) {
      await pause();
      sliceStart = performance.now();
    }
  }
  return { divergences, notCompared, compared: counts.coach + counts.hint, counts };
}

// ── Report ───────────────────────────────────────────────────────────────────

/**
 * @param {Object} parts
 * @param {import('./sessionCodec.js').SessionDocument} parts.doc - From `prepare`.
 * @param {string[]} [parts.notes] - From `prepare`.
 * @param {RunResult} parts.run
 * @param {Awaited<ReturnType<typeof compare>>} parts.comparison
 * @param {ErrorItem[]} [parts.raised] - Errors captured while this replay was
 *   applied or compared (`recorder.errorsSince`).
 * @returns {Report}
 */
export function buildReport({ doc, notes = [], run: result, comparison, raised = [] }) {
  return {
    applied: result.applied,
    total: doc.actions.length,
    compared: comparison.compared,
    counts: { ...comparison.counts },
    divergences: comparison.divergences,
    notCompared: comparison.notCompared,
    errors: {
      recorded: doc.errors
        .filter(e => e.afterAction <= result.applied)
        .map(({ kind, afterAction, message, count: n }) => ({ kind, afterAction, message, count: n })),
      raised,
    },
    notes: [...notes, ...result.notes],
    stopped: result.stopped,
  };
}

const notComparedTail = report => (report.notCompared.length > 0 ? ` ${count(report.notCompared.length)} not compared.` : '');

/** The status line's comparison sentence (aspec §8.4), without the not-compared tail. */
function statusTail({ compared: k, divergences, notCompared }) {
  if (k === 0) return notCompared.length === 0 ? 'No computed results to compare.' : 'No computed results could be compared.';
  if (divergences.length === 0) return `No divergences in ${count(k, 'computed result')}.`;
  return `${count(divergences.length, 'divergence')} in ${count(k, 'computed result')}.`;
}

/**
 * The report's divergence summary (fspec §5.8 item 2). It never carries the
 * not-compared tail: the report lists those items in a part of their own.
 */
function reportSummary({ compared: k, counts, divergences, notCompared }) {
  if (k === 0) {
    return notCompared.length === 0
      ? 'No computed results to compare: the replayed actions contain no coach steps or hints.'
      : 'No computed results could be compared.';
  }
  if (divergences.length === 0) {
    const subject = k === 1 ? 'the 1 computed result matches' : `all ${count(k)} computed results match`;
    return `No divergences: ${subject} the current code `
      + `(${count(counts.coach, 'coach step')}, ${count(counts.hint, 'hint')}).`;
  }
  const d = divergences.length;
  return `${count(d)} of ${count(k, 'computed result')} ${d === 1 ? 'differs' : 'differ'} from the current code:`;
}

/**
 * The status line and announcement (fspec §5.9) for a replay that was applied.
 *
 * @param {Report} report
 * @returns {{text: string, error: boolean}} `error` selects the error style.
 */
export function outcomeMessage(report) {
  if (report.stopped !== null) {
    const { at, message } = report.stopped;
    return {
      text: `Replay stopped at action ${at} of ${count(report.total)}: ${message}. The board shows the position before that action.`,
      error: true,
    };
  }
  return {
    text: `Session replayed: ${count(report.applied)} of ${count(report.total, 'action')}. ${statusTail(report)}${notComparedTail(report)}`,
    error: false,
  };
}

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * @param {string} iso - An ISO time from the document.
 * @returns {string} Local time of day, `HH:MM:SS.mmm` (24-hour).
 */
export function formatTimeOfDay(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
}

const cellName = index => `r${Math.floor(index / 9) + 1}c${(index % 9) + 1}`;

const shown = value => (typeof value === 'string' ? value : JSON.stringify(value));

function divergenceText(d, time) {
  const head = `Action ${d.action} — `;
  if (d.kind === 'hint') {
    return d.differences.map(({ part, recorded, current }) => {
      const show = v => (part === 'cell' && v !== null ? cellName(v) : shown(v));
      return `${head}hint on ${cellName(d.cell)} at ${time}: ${part} — recorded ${show(recorded)}, current ${show(current)}.`;
    }).join(' ');
  }
  const technique = d.differences.find(x => x.part === 'technique');
  if (technique === undefined) {
    return `${head}coach step (${d.technique}) at ${time}: differs in ${d.differences.map(x => x.part).join(', ')}.`;
  }
  const others = d.differences.filter(x => x !== technique).map(x => x.part);
  const also = others.length > 0 ? ` Also differs: ${others.join(', ')}.` : '';
  return `${head}coach step at ${time}: technique — recorded ${shown(technique.recorded)}, `
    + `current ${shown(technique.current)}.${also}`;
}

const valuesBlock = (differences, side) =>
  JSON.stringify(Object.fromEntries(differences.map(x => [x.part, x[side]])), null, 2);

function notComparedText({ action, kind, reason }) {
  const subject = action === 0 ? 'Starting position' : `Action ${action}`;
  return `${subject} — ${KIND_LABELS[kind]}: not compared — ${reason}.`;
}

function errorText(prefix, { kind, afterAction, message, count: n }) {
  const repeat = n > 1 ? ` (×${count(n)})` : '';
  return `${prefix} — ${ERROR_KIND_LABELS[kind]} after action ${afterAction}: ${message}${repeat}`;
}

/**
 * @typedef {Object} ReportLines
 * @property {string} scope - "Replayed *N* of *M* actions." and any notes.
 * @property {string} summary - The divergence summary.
 * @property {Array<{text: string, recorded: string, current: string}>} divergences
 *   One item per divergence; `recorded` and `current` are the differing parts as JSON.
 * @property {string[]} notCompared - Shown under the sub-heading "Not compared".
 * @property {null|{summary: string, items: string[]}} errors - null when there are none.
 */

/**
 * The report area's text (fspec §5.8), in display order.
 *
 * @param {Report} report
 * @param {function(string): string} [formatTime] - ISO time to display time.
 * @returns {ReportLines}
 */
export function formatReportLines(report, formatTime = formatTimeOfDay) {
  const { recorded, raised } = report.errors;
  const errors = recorded.length + raised.length === 0 ? null : {
    summary: `Errors: ${count(recorded.length)} recorded in the replayed range, ${count(raised.length)} raised during this replay.`,
    items: [
      ...recorded.map(e => errorText('Recorded', e)),
      ...raised.map(e => errorText('Raised during this replay', e)),
    ],
  };
  return {
    scope: [`Replayed ${count(report.applied)} of ${count(report.total, 'action')}.`, ...report.notes].join(' '),
    summary: reportSummary(report),
    divergences: report.divergences.map(d => ({
      text: divergenceText(d, formatTime(d.time)),
      recorded: valuesBlock(d.differences, 'recorded'),
      current: valuesBlock(d.differences, 'current'),
    })),
    notCompared: report.notCompared.map(notComparedText),
    errors,
  };
}
