/**
 * @fileoverview The replay engine (tspec-debug-instrumentation RP1–RP40):
 * `prepare` (parse, validate, puzzle check, stop value, rejection messages),
 * `run` (verbatim application on a headless machine, compare jobs, the
 * stopped and busy-cleared outcomes), `compare` (not-compared order, coach and
 * hint parts, pacing), `buildReport`, and every message and report line of
 * fspec-007 §5.8–5.9, asserted character for character.
 */

import {
  prepare, run, compare, buildReport, outcomeMessage, formatReportLines, formatTimeOfDay, count,
  SOLUTION_MISMATCH,
} from '../../dev/replay.js';
import { createMachine, applyEntry, snapshot } from '../../dev/machine.js';
import { decodePosition, decodePuzzle, fingerprint } from '../../dev/sessionCodec.js';
import { toGivens } from '../fixtures/puzzles/loadable.js';
import {
  KIDDIE, SOLUTION, wrong, placementStep, eliminationStep, puzzleDoc, plainPositionDoc, marksWith,
  devModeStore, viaJson, bit,
} from '../helpers/codecFixtures.js';

const REJECTED = 'This session can\'t be replayed.';
const NOT_A_DOCUMENT = `${REJECTED} The JSON is not a session document.`;
const BAD_STOP = `${REJECTED} Stop after must be a whole number, 0 or greater.`;
const ENDS_WITHOUT_PUZZLE = `${REJECTED} It would end before any puzzle is loaded. Choose a later stopping point.`;
const NOT_CHECKED = `${REJECTED} The session couldn't be checked.`;
const INVALID = 'its data is incomplete or invalid';
const UNRECOGNISED = 'it is not a recognised action';
const BUSY_CLEARED = 'Replay ended during a puzzle generation; the busy state was cleared.';
const UNRATED_REASON = 'hints and coach are unavailable on an Unrated puzzle';
const NO_CHANGE_REASON = 'the recorded action changed nothing';
const START_REASON = 'the position before it is not in the document';

const EXPORTED = '2026-11-15T14:03:22.118Z';
const at = i => new Date(Date.UTC(2026, 10, 15, 14, 1, 0) + i * 1000).toISOString();

const sel = index => ({ type: 'SELECT_CELL', index });
const pen = digit => ({ type: 'PEN_ENTER', digit });
const load = puzzle => ({ type: 'PUZZLE_LOADED', puzzle });
const restore = position => ({ type: 'DEV_RESTORE_POSITION', position });
const NO_PUZZLE_START = () => plainPositionDoc({ puzzle: null, board: '0'.repeat(81), hintsRemaining: 0 });

/** A second puzzle: KIDDIE with r1c1 emptied too. */
const OTHER_GIVENS = `0${KIDDIE.slice(1)}`;
const otherPuzzle = () => puzzleDoc({ givens: OTHER_GIVENS, id: 'p-other' });

/**
 * An action item: `{ at, action }` stamped with its 1-based number, plus any
 * `noChange` / `then`.
 */
const item = (n, action, extra = {}) => ({ at: at(n), action, ...extra });

/**
 * A session document. Bare actions are wrapped as items numbered by position.
 *
 * @param {{start?: object, actions?: Array, errors?: Array, version?: *}} [parts]
 */
function sessionDoc({ start = plainPositionDoc(), actions = [], errors = [] } = {}) {
  return {
    format: 'sudoku-session',
    version: 1,
    exportedAt: EXPORTED,
    start,
    actions: actions.map((a, i) => ('action' in a ? a : item(i + 1, a))),
    errors,
  };
}

const errorItem = (afterAction, extra = {}) => ({
  at: at(afterAction), afterAction, kind: 'listener', message: 'x is undefined', stack: null, source: null,
  action: 'PEN_ENTER', count: 1, ...extra,
});

/** Every puzzle passes. */
const allOk = puzzles => puzzles.map(() => ({ ok: true }));

/** Puzzles with `givens` fail with `reason`; others pass. */
const failing = (givens, reason) => puzzles =>
  puzzles.map(p => (p.givens.join('') === givens ? { ok: false, reason } : { ok: true }));

/** An action whose puzzle fails `failing(OTHER_GIVENS, 'multiple')`. */
const badLoad = () => load(otherPuzzle());
const MULTIPLE_DETAIL = 'The puzzle has more than one solution.';

const prep = (input, opts = {}) => prepare(input, { checkPuzzles: allOk, ...opts });

/** A machine factory whose machines throw `thrown` when they dispatch an action of `type`. */
function throwingOn(type, thrown) {
  return position => {
    const machine = createMachine(position);
    return {
      getState: machine.getState,
      dispatch(action) {
        if (action.type === type) throw thrown;
        machine.dispatch(action);
      },
    };
  };
}

/** The position reached by applying `actions` verbatim to `start`. */
function positionAfter(start, actions) {
  const machine = createMachine(start);
  for (const a of actions) applyEntry(machine, { a: a.action ?? a, f: a.then });
  return snapshot(machine);
}

// ── prepare: rejections ─────────────────────────────────────────────────────

describe('replay — prepare', () => {
  it('RP1: an empty field is rejected as no document', async () => {
    const result = await prep('');

    expect(result).to.deep.equal({ ok: false, message: `${REJECTED} No session document was supplied.` });
  });

  it('RP2: text that is not JSON is rejected', async () => {
    const result = await prep('{');

    expect(result).to.deep.equal({ ok: false, message: `${REJECTED} The text is not valid JSON.` });
  });

  describe('RP3: JSON that is not a session document', () => {
    for (const [label, input] of [['[]', '[]'], ['3', '3'], ['null', 'null'], ['{ format: "x" }', { format: 'x' }]]) {
      it(`${label} is rejected as not a session document`, async () => {
        expect((await prep(input)).message).to.equal(NOT_A_DOCUMENT);
      });
    }
  });

  describe('a value that is not text is never treated as empty or as unparsed JSON', () => {
    for (const [label, input] of [['null', null], ['the number 3', 3], ['an array', []], ['undefined', undefined]]) {
      it(`${label} is rejected as not a session document`, async () => {
        expect((await prep(input)).message).to.equal(NOT_A_DOCUMENT);
      });
    }
  });

  describe('RP4: an unreadable format version', () => {
    const cases = [
      ['missing', undefined, 'unknown'],
      ['the string "1"', '1', 'unknown'],
      ['0', 0, 'unknown'],
      ['1.5', 1.5, 'unknown'],
      ['2', 2, '2'],
    ];
    for (const [label, version, shown] of cases) {
      it(`${label} is reported as version ${shown}`, async () => {
        const doc = sessionDoc();
        if (version === undefined) delete doc.version;
        else doc.version = version;

        const result = await prep(doc);

        expect(result.message).to.equal(`${REJECTED} It is format version ${shown}; this build reads versions 1 to 1.`);
      });
    }
  });

  it('RP5: a malformed starting position is rejected with the invalid-data detail', async () => {
    const result = await prep(sessionDoc({ start: plainPositionDoc({ board: 'x' }) }));

    expect(result.message).to.equal(`${REJECTED} Its starting position is not valid: its data is incomplete or invalid.`);
  });

  describe('RP6: a starting puzzle that fails checking', () => {
    const cases = [
      ['contradiction', 'A digit repeats in a row, column, or box.'],
      ['complete', 'The puzzle has no empty cells.'],
      ['no-solution', 'The puzzle has no solution.'],
      ['multiple', 'The puzzle has more than one solution.'],
      ['solution-mismatch', 'The recorded solution is not the puzzle\'s solution.'],
    ];
    for (const [reason, detail] of cases) {
      it(`${reason} gives "${detail}" without a doubled full stop`, async () => {
        const result = await prep(sessionDoc(), { checkPuzzles: failing(KIDDIE, reason) });

        expect(result.message).to.equal(`${REJECTED} Its starting position is not valid: ${detail}`);
      });
    }

    it('the mismatch detail is exported as SOLUTION_MISMATCH', () => {
      expect(SOLUTION_MISMATCH).to.equal('The recorded solution is not the puzzle\'s solution.');
    });
  });

  describe('RP7: the lowest-numbered invalid action is reported', () => {
    it('a puzzle failure at 3 is reported before a structural failure at 5', async () => {
      const doc = sessionDoc({ actions: [sel(2), sel(3), badLoad(), sel(4), sel(99)] });

      const result = await prep(doc, { checkPuzzles: failing(OTHER_GIVENS, 'multiple') });

      expect(result.message).to.equal(`${REJECTED} Action 3 is not valid: ${MULTIPLE_DETAIL}`);
    });

    it('a structural failure at 2 is reported before a puzzle failure at 7', async () => {
      const doc = sessionDoc({ actions: [sel(2), sel(99), sel(3), sel(4), sel(5), sel(6), badLoad()] });

      const result = await prep(doc, { checkPuzzles: failing(OTHER_GIVENS, 'multiple') });

      expect(result.message).to.equal(`${REJECTED} Action 2 is not valid: ${INVALID}.`);
    });
  });

  it('RP8: validation covers actions beyond the stop value', async () => {
    const actions = [sel(1), sel(2), sel(3), sel(4), sel(5), sel(6), sel(7), sel(8), { type: 'NOPE' }];

    const result = await prep(sessionDoc({ actions }), { stopAfter: 2 });

    expect(result.message).to.equal(`${REJECTED} Action 9 is not valid: ${UNRECOGNISED}.`);
  });

  it('a puzzle carried by a follow-up is checked and reported against its action', async () => {
    const doc = sessionDoc({ actions: [sel(2), item(2, sel(3), { then: [badLoad()] })] });

    const result = await prep(doc, { checkPuzzles: failing(OTHER_GIVENS, 'multiple') });

    expect(result.message).to.equal(`${REJECTED} Action 2 is not valid: ${MULTIPLE_DETAIL}`);
  });

  describe('RP9: checks are made in fspec order', () => {
    it('the starting position is reported before an invalid action and stop value', async () => {
      const doc = sessionDoc({ start: plainPositionDoc({ mode: 'ink' }), actions: [sel(99)] });

      const result = await prep(doc, { stopAfter: 'x' });

      expect(result.message).to.equal(`${REJECTED} Its starting position is not valid: ${INVALID}.`);
    });

    it('an invalid action is reported before an invalid stop value', async () => {
      const result = await prep(sessionDoc({ actions: [sel(99)] }), { stopAfter: 'x' });

      expect(result.message).to.equal(`${REJECTED} Action 1 is not valid: ${INVALID}.`);
    });

    it('an invalid stop value is reported before the no-puzzle rule', async () => {
      const result = await prep(sessionDoc({ start: NO_PUZZLE_START() }), { stopAfter: 'x' });

      expect(result.message).to.equal(BAD_STOP);
    });
  });

  describe('RP10: the stop value', () => {
    const tenActions = () => sessionDoc({ actions: Array.from({ length: 10 }, (_, i) => sel(i)) });
    const accepted = [
      ['undefined', undefined, 10], ['null', null, 10], ['\'\'', '', 10], ['\'  \' (whitespace)', '  ', 10],
      ['\'0\'', '0', 0], ['\'007\'', '007', 7], ['\' 4 \' (trimmed)', ' 4 ', 4], ['3', 3, 3],
    ];
    for (const [label, stopAfter, n] of accepted) {
      it(`${label} applies ${n} of 10 actions`, async () => {
        const result = await prep(tenActions(), { stopAfter });

        expect(result.ok).to.equal(true);
        expect(result.n).to.equal(n);
        expect(result.total).to.equal(10);
      });
    }

    const refused = [
      ['\'3.0\'', '3.0'], ['\'-1\'', '-1'], ['\'1e2\'', '1e2'], ['\'abc\'', 'abc'],
      ['3.5', 3.5], ['-1', -1], ['NaN', NaN], ['Infinity', Infinity],
    ];
    for (const [label, stopAfter] of refused) {
      it(`${label} is rejected`, async () => {
        expect(await prep(tenActions(), { stopAfter })).to.deep.equal({ ok: false, message: BAD_STOP });
      });
    }
  });

  it('RP11: a stop value beyond the end applies every action', async () => {
    const result = await prep(sessionDoc({ actions: [sel(1), sel(2), sel(3), sel(4), sel(5)] }), { stopAfter: 99 });

    expect(result).to.include({ ok: true, n: 5, total: 5 });
  });

  describe('RP12: a replay that would end with no puzzle', () => {
    const nullPosition = () => NO_PUZZLE_START();
    const cases = [
      ['a start with no puzzle and no actions', NO_PUZZLE_START(), [], undefined, false],
      ['a puzzle loaded at 1 but stopped at 0', NO_PUZZLE_START(), [load(puzzleDoc())], 0, false],
      ['a puzzle loaded at 1 and stopped at 1', NO_PUZZLE_START(), [load(puzzleDoc())], 1, true],
      ['a reload to no puzzle as the last applied action', plainPositionDoc(),
        [sel(2), { type: 'PAGE_RELOADED', position: nullPosition() }], undefined, false],
      ['a reload to no puzzle followed by a new puzzle', plainPositionDoc(),
        [{ type: 'PAGE_RELOADED', position: nullPosition() }, { type: 'NEW_PUZZLE', difficulty: 'easy', puzzle: puzzleDoc() }],
        undefined, true],
      ['a restore to no puzzle as the last applied action', plainPositionDoc(), [restore(nullPosition())], undefined, false],
      ['a puzzle loaded by a follow-up', NO_PUZZLE_START(),
        [item(1, sel(2), { then: [load(puzzleDoc())] })], undefined, true],
    ];
    for (const [label, start, actions, stopAfter, ok] of cases) {
      it(`${label} is ${ok ? 'accepted' : 'rejected'}`, async () => {
        const result = await prep(sessionDoc({ start, actions }), { stopAfter });

        if (ok) expect(result.ok).to.equal(true);
        else expect(result).to.deep.equal({ ok: false, message: ENDS_WITHOUT_PUZZLE });
      });
    }
  });

  it('RP13: every distinct puzzle is checked in one call; structurally invalid actions contribute none', async () => {
    const calls = [];
    const p1 = puzzleDoc();
    const p2 = otherPuzzle();
    const malformed = puzzleDoc({ givens: `00${KIDDIE.slice(2)}`, tier: 'impossible' });
    const doc = sessionDoc({
      start: plainPositionDoc({ puzzle: p1 }),
      actions: [
        load(p1),
        { type: 'PAGE_RELOADED', position: plainPositionDoc({ puzzle: p1 }) },
        { type: 'NEW_PUZZLE', difficulty: 'easy', puzzle: p2 },
        restore(plainPositionDoc({ puzzle: p2, board: OTHER_GIVENS })),
        load(malformed),
      ],
    });

    await prep(doc, { checkPuzzles: puzzles => { calls.push(puzzles); return allOk(puzzles); } });

    expect(calls).to.have.length(1);
    expect(calls[0].map(p => [p.givens.join(''), p.solution.join('')])).to.deep.equal([
      [KIDDIE, p1.solution], [OTHER_GIVENS, p2.solution],
    ]);
    expect(calls[0][0].givens).to.be.instanceOf(Uint8Array);
    expect(calls[0][0].solution).to.be.instanceOf(Uint8Array);
  });

  it('RP14: a document with no puzzle anywhere checks nothing and is rejected for ending with no puzzle', async () => {
    const calls = [];
    const doc = sessionDoc({ start: NO_PUZZLE_START(), actions: [sel(2)] });

    const result = await prep(doc, { checkPuzzles: puzzles => { calls.push(puzzles); return []; } });

    expect(calls.every(c => c.length === 0)).to.equal(true);
    expect(result.message).to.equal(ENDS_WITHOUT_PUZZLE);
  });

  describe('RP15: an internal failure while checking', () => {
    it('a check that rejects gives "The session couldn\'t be checked."', async () => {
      const error = new Error('worker gone');
      const result = await prep(sessionDoc(), { checkPuzzles: () => Promise.reject(error) });

      expect(result).to.deep.equal({ ok: false, message: NOT_CHECKED, error });
    });

    it('a check that throws synchronously gives the same message', async () => {
      const error = new Error('boom');
      const result = await prep(sessionDoc(), { checkPuzzles: () => { throw error; } });

      expect(result).to.deep.equal({ ok: false, message: NOT_CHECKED, error });
    });

    it('a check that throws outranks a structurally invalid later action', async () => {
      const doc = sessionDoc({ actions: [sel(2), sel(99)] });

      const result = await prep(doc, { checkPuzzles: () => { throw new Error('boom'); } });

      expect(result.message).to.equal(NOT_CHECKED);
    });
  });

  it('RP16: an object document is copied: prepare and run leave the caller\'s object unchanged', async () => {
    const input = sessionDoc({ actions: [sel(2), pen(4), { type: 'CHECK' }, item(4, sel(3), { then: [{ type: 'TOGGLE_MODE' }] })] });
    const original = structuredClone(input);

    const result = await prep(input);
    run(result.doc, result.n);

    expect(input).to.deep.equal(original);
    expect(result.doc).to.not.equal(input);
    expect(result.doc.start).to.not.equal(input.start);
  });

  it('RP17: a valid document is accepted with its copy, the action counts and no notes', async () => {
    const input = sessionDoc({ actions: [sel(2), pen(4)] });

    const result = await prep(JSON.stringify(input), { stopAfter: 1 });

    expect(result).to.deep.equal({ ok: true, doc: input, n: 1, total: 2, notes: [] });
  });

  it('RP18: an older document read through an upgrader carries the upgrade note', async () => {
    const upgraders = { 1: doc => ({ ...doc, version: 2 }) };

    const result = await prep(sessionDoc(), { current: 2, upgraders });

    expect(result.ok).to.equal(true);
    expect(result.notes).to.deep.equal(['Document format version 1 was read as version 2.']);
  });
});

// ── run ──────────────────────────────────────────────────────────────────────

describe('replay — run', () => {
  it('RP19: with n = 0 the position is the start and nothing is applied', () => {
    const start = plainPositionDoc({ selected: 4, pencil: marksWith({ 2: [4, 9] }) });

    const result = run(sessionDoc({ start, actions: [sel(2)] }), 0);

    expect(fingerprint(result.position)).to.deep.equal(fingerprint(decodePosition(start)));
    expect(result).to.include({ applied: 0, stopped: null });
    expect(result.entries).to.deep.equal([]);
    expect(result.jobs).to.deep.equal([]);
    expect(result.notes).to.deep.equal([]);
  });

  it('RP20: actions apply in order, follow-ups after their parent, and entries carry the recorded times', () => {
    const actions = [
      item(1, sel(2)),
      item(2, { type: 'SET_MODE', mode: 'pencil' }),
      item(3, sel(3), { then: [{ type: 'PENCIL_TOGGLE', digit: 2 }, { type: 'PENCIL_TOGGLE', digit: 6 }] }),
      item(4, { type: 'SET_MODE', mode: 'pen' }),
      item(5, { type: 'UNDO' }),
      item(6, { type: 'UNDO' }, { noChange: true }),
    ];
    const doc = sessionDoc({ actions });

    const result = run(doc, 6);

    expect(result.applied).to.equal(6);
    expect(fingerprint(result.position)).to.deep.equal(fingerprint(positionAfter(doc.start, actions)));
    expect(Array.from(result.position.pencil.slice(2, 4))).to.deep.equal([0, bit(2)]);
    expect(result.entries).to.deep.equal(actions.map(a => {
      const entry = { t: Date.parse(a.at), a: a.action };
      if (a.noChange) entry.nc = true;
      if (a.then) entry.f = a.then;
      return entry;
    }));
  });

  it('RP21: only coach starts, no-technique answers and hints become jobs, with the position before them', () => {
    const step = placementStep(2);
    const hint = { cellIndex: 3, digit: SOLUTION[3], technique: 'Naked Single' };
    const actions = [
      item(1, sel(2)),
      item(2, { type: 'DEV_SET_PENCIL', index: 2, digits: [4, 9] }),
      item(3, { type: 'COACH_START', result: step }),
      item(4, { type: 'COACH_END', reason: 'hint' }),
      item(5, { type: 'COACH_NO_TECHNIQUE', reason: 'error' }),
      item(6, sel(3)),
      item(7, { type: 'HINT', hint }, { noChange: true }),
      item(8, pen(1)),
    ];
    const doc = sessionDoc({ actions });

    const { jobs } = run(doc, 8);

    expect(jobs.map(j => [j.action, j.kind, j.at, j.noChange])).to.deep.equal([
      [3, 'coach', at(3), false], [5, 'coach', at(5), false], [7, 'hint', at(7), true],
    ]);
    expect(jobs.map(j => j.doc)).to.deep.equal([actions[2].action, actions[4].action, actions[6].action]);
    for (const job of jobs) {
      const before = positionAfter(doc.start, actions.slice(0, job.action - 1));
      expect(job.puzzle.id).to.equal('p-gen');
      expect(Array.from(job.pen)).to.deep.equal(Array.from(before.pen));
      expect(Array.from(job.pencil)).to.deep.equal(Array.from(before.pencil));
      expect([...job.conflicts]).to.deep.equal([...before.conflicts]);
      expect(job.selected).to.equal(before.selected);
    }
    expect(jobs[2].selected).to.equal(3);
    expect(jobs[0].pencil[2]).to.equal(bit(4) | bit(9));
  });

  it('RP22: a coach session in the starting position is listed as not compared, as action 0', async () => {
    const start = plainPositionDoc({
      coach: { step: placementStep(2), recap: null, focused: null, pencilSnapshot: marksWith({}), revealed: marksWith({}) },
    });
    const { jobs } = run(sessionDoc({ start }), 0);

    const comparison = await compare(jobs, { analyze: () => { throw new Error('not called'); }, nextHint: () => null });

    expect(comparison.notCompared).to.deep.equal([{ action: 0, kind: 'coach', reason: START_REASON }]);
    expect(comparison.compared).to.equal(0);
  });

  describe('RP23: a replay that ends with a generation in progress', () => {
    const generating = { type: 'SET_GENERATING', flag: true, message: 'Generating puzzle…', difficulty: 'hard' };

    it('appends a cancelling entry stamped with the last applied action\'s time and notes it', () => {
      const doc = sessionDoc({ actions: [sel(2), generating, sel(5)] });

      const result = run(doc, 2);

      expect(result.position.generating).to.equal(false);
      expect(result.entries).to.have.length(3);
      expect(result.entries[2]).to.deep.equal({ t: Date.parse(at(2)), a: { type: 'SET_GENERATING', flag: false } });
      expect(result.notes).to.deep.equal([BUSY_CLEARED]);
      expect(result.applied).to.equal(2);
    });

    it('with n = 0 on a generating start the cancelling entry has the export time', () => {
      const start = plainPositionDoc({ generating: { message: 'Generating…', difficulty: 'hard', progress: { attempts: 4, budget: 50 } } });

      const result = run(sessionDoc({ start, actions: [sel(2)] }), 0);

      expect(result.position.generating).to.equal(false);
      expect(result.position.genProgress).to.equal(null);
      expect(result.entries).to.deep.equal([{ t: Date.parse(EXPORTED), a: { type: 'SET_GENERATING', flag: false } }]);
      expect(result.notes).to.deep.equal([BUSY_CLEARED]);
    });

    it('after a stop, the generation is cancelled on a machine rebuilt at the position reached', () => {
      const doc = sessionDoc({ actions: [sel(2), generating, { type: 'HINT' }] });
      const built = [];
      const makeMachine = position => { built.push(position); return throwingOn('HINT', new Error('boom'))(position); };

      const result = run(doc, 3, { makeMachine });

      expect(result.stopped).to.deep.equal({ at: 3, message: 'boom' });
      expect(built).to.have.length(2);
      expect(built[1].generating).to.deep.equal({ message: 'Generating puzzle…', difficulty: 'hard', progress: null });
      expect(result.position.generating).to.equal(false);
      expect(result.position.selected).to.equal(2);
      expect(result.entries.at(-1)).to.deep.equal({ t: Date.parse(at(2)), a: { type: 'SET_GENERATING', flag: false } });
      expect(result.notes).to.deep.equal([BUSY_CLEARED]);
    });
  });

  describe('RP24: an action that throws stops the replay at the position before it', () => {
    const actions = [sel(2), pen(SOLUTION[2]), sel(3), { type: 'HINT', hint: { cellIndex: 3, digit: SOLUTION[3], technique: 'Naked Single' } }, sel(4)];

    for (const [label, thrown, message] of [['an Error', new Error('boom'), 'boom'], ['a thrown string', 'plain failure', 'plain failure']]) {
      it(`${label}: stopped at 4 with its message, 3 applied, the failing hint not a job`, () => {
        const doc = sessionDoc({ actions });

        const result = run(doc, 5, { makeMachine: throwingOn('HINT', thrown) });

        expect(result.stopped).to.deep.equal({ at: 4, message });
        expect(result.applied).to.equal(3);
        expect(fingerprint(result.position)).to.deep.equal(fingerprint(positionAfter(doc.start, actions.slice(0, 3))));
        expect(result.entries.map(e => e.a.type)).to.deep.equal(['SELECT_CELL', 'PEN_ENTER', 'SELECT_CELL']);
        expect(result.jobs).to.deep.equal([]);
      });
    }
  });

  it('RP25: an action recorded as changing nothing is applied, and the reducer decides its effect', () => {
    const actions = [item(1, sel(2)), item(2, pen(4)), item(3, { type: 'UNDO' }, { noChange: true })];

    const result = run(sessionDoc({ actions }), 3);

    expect(result.position.pen[2]).to.equal(0);
    expect(result.entries[2]).to.deep.equal({ t: Date.parse(at(3)), a: { type: 'UNDO' }, nc: true });
  });

  it('RP26: preparing and running touch no storage, no timer and no live store', async () => {
    const calls = [];
    const restores = [];
    for (const name of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) { calls.push(name); return original.apply(this, args); };
      restores.push(() => { Storage.prototype[name] = original; });
    }
    const realSetTimeout = window.setTimeout;
    window.setTimeout = (...args) => { calls.push('setTimeout'); return realSetTimeout(...args); };
    restores.push(() => { window.setTimeout = realSetTimeout; });
    const live = devModeStore();
    let emits = 0;
    live.on('changed', () => { emits++; });
    const doc = sessionDoc({
      actions: [sel(5), pen(wrong(5)), { type: 'CHECK' }, { type: 'COACH_START', result: placementStep(2) }, sel(2), pen(SOLUTION[2])],
    });

    try {
      const prepared = await prep(JSON.stringify(doc));
      run(prepared.doc, prepared.n);
    } finally {
      restores.forEach(r => r());
    }

    expect(calls).to.deep.equal([]);
    expect(emits).to.equal(0);
    expect(live.getState().puzzle).to.equal(null);
  });
});

// ── compare ──────────────────────────────────────────────────────────────────

/** A compare job at a KIDDIE position with cell 2 selected. */
function job(overrides = {}) {
  return {
    action: 1,
    kind: 'coach',
    at: at(1),
    doc: { type: 'COACH_START', result: placementStep(2) },
    noChange: false,
    puzzle: decodePuzzle(puzzleDoc()),
    pen: toGivens(KIDDIE),
    pencil: new Uint16Array(81),
    conflicts: new Set(),
    selected: 2,
    ...overrides,
  };
}

const coachJob = (recorded, overrides = {}) => job({ doc: { type: 'COACH_START', result: recorded }, ...overrides });
const hintJob = (hint, overrides = {}) => job({ kind: 'hint', doc: { type: 'HINT', hint }, ...overrides });
const HINT = { cellIndex: 2, digit: 4, technique: 'Naked Single' };

const never = () => { throw new Error('not expected to be called'); };

/** `compare` with `analyze` returning `current` for every job. */
const compareCoach = (jobs, current) => compare(jobs, { analyze: () => current, nextHint: never });
const compareHint = (jobs, current) => compare(jobs, { analyze: never, nextHint: () => current });

describe('replay — compare', () => {
  describe('RP27: not-compared items and their order of precedence', () => {
    it('a job on an Unrated puzzle is not compared', async () => {
      const unrated = decodePuzzle(puzzleDoc({ tier: 'unrated' }));

      const result = await compareCoach([job({ puzzle: unrated })], placementStep(2));

      expect(result.notCompared).to.deep.equal([{ action: 1, kind: 'coach', reason: UNRATED_REASON }]);
    });

    it('a job whose action changed nothing is not compared', async () => {
      const result = await compareHint([hintJob(null, { action: 4, noChange: true })], HINT);

      expect(result.notCompared).to.deep.equal([{ action: 4, kind: 'hint', reason: NO_CHANGE_REASON }]);
    });

    it('a job the current code fails on is not compared, with the error message', async () => {
      const result = await compare([job()], { analyze: () => { throw new Error('boom'); }, nextHint: never });

      expect(result.notCompared).to.deep.equal([{ action: 1, kind: 'coach', reason: 'the current code raised an error: boom' }]);
      expect(result.compared).to.equal(0);
    });

    it('Unrated takes precedence over changed nothing', async () => {
      const unrated = decodePuzzle(puzzleDoc({ tier: 'unrated' }));

      const result = await compareHint([hintJob(null, { puzzle: unrated, noChange: true })], HINT);

      expect(result.notCompared[0].reason).to.equal(UNRATED_REASON);
    });
  });

  it('RP28: a recorded step equal to the current one is compared and does not diverge', async () => {
    const result = await compareCoach([job()], placementStep(2));

    expect(result).to.deep.equal({ divergences: [], notCompared: [], compared: 1, counts: { coach: 1, hint: 0 } });
  });

  describe('RP29: each coach part is compared', () => {
    const elim = eliminationStep;
    const place = () => placementStep(2);
    // [label, base step, change to the current step, expected differences].
    // A placement is derived from the type, target and first digit, so a
    // change of type or target also changes it.
    const cases = [
      ['technique', place, s => { s.technique = 'Hidden Single'; },
        [{ part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' }]],
      ['type', elim, s => { s.type = 'placement'; },
        [{ part: 'type', recorded: 'elimination', current: 'placement' },
          { part: 'placement', recorded: null, current: { cell: null, digit: 9 } }]],
      ['rank', place, s => { s.rank = 9; }, [{ part: 'rank', recorded: 1, current: 9 }]],
      ['digits', elim, s => { s.digits = [9, 6]; }, [{ part: 'digits', recorded: [9, 2], current: [9, 6] }]],
      ['unit', place, s => { s.unit = { type: 'box', index: 0 }; },
        [{ part: 'unit', recorded: null, current: { type: 'box', index: 0 } }]],
      ['placement', place, s => { s.roles.target = 3; },
        [{ part: 'placement', recorded: { cell: 2, digit: 4 }, current: { cell: 3, digit: 4 } },
          { part: 'roles', recorded: placementStep(2).roles, current: { ...placementStep(2).roles, target: 3 } }]],
      ['eliminations', elim, s => { s.eliminations = [{ cellIndex: 3, digit: 2 }]; },
        [{ part: 'eliminations', recorded: [{ cellIndex: 2, digit: 9 }, { cellIndex: 3, digit: 2 }], current: [{ cellIndex: 3, digit: 2 }] }]],
      ['roles', place, s => { s.roles.cause = [7]; },
        [{ part: 'roles', recorded: placementStep(2).roles, current: { ...placementStep(2).roles, cause: [7] } }]],
      ['arrows', place, s => { s.arrows = [{ from: 1, to: 2 }]; }, [{ part: 'arrows', recorded: [], current: [{ from: 1, to: 2 }] }]],
      ['text (supportingText)', place, s => { s.supportingText = 'Look here.'; },
        [{ part: 'text', recorded: { supportingText: 'Only one digit fits.', note: null }, current: { supportingText: 'Look here.', note: null } }]],
      ['text (complexity.note)', place, s => { s.complexity.note = 'Long chain.'; },
        [{ part: 'text', recorded: { supportingText: 'Only one digit fits.', note: null }, current: { supportingText: 'Only one digit fits.', note: 'Long chain.' } }]],
      ['complexity', place, s => { s.complexity.acknowledged = true; s.complexity.endpoints = [1, 2]; },
        [{ part: 'complexity', recorded: { acknowledged: false, endpoints: null }, current: { acknowledged: true, endpoints: [1, 2] } }]],
      ['autoReveal', place, s => { s.autoReveal = { required: true, cells: [{ cellIndex: 3, candidates: bit(6) }] }; },
        [{ part: 'autoReveal', recorded: { required: false, cells: [] }, current: { required: true, cells: [{ cellIndex: 3, candidates: bit(6) }] } }]],
    ];
    for (const [label, base, change, differences] of cases) {
      it(`${label}: a change is reported with the recorded and current values`, async () => {
        const recorded = base();
        const current = viaJson(recorded);
        change(current);

        const result = await compareCoach([coachJob(recorded, { action: 7 })], current);

        expect(result.compared).to.equal(1);
        expect(result.divergences).to.deep.equal([{
          action: 7, kind: 'coach', time: at(1), technique: recorded.technique, differences,
        }]);
      });
    }
  });

  describe('RP30: a step against a no-technique answer differs only in technique', () => {
    it('a recorded step against a current no-technique answer', async () => {
      const result = await compareCoach([job()], { type: 'no-technique', reason: 'error' });

      expect(result.divergences[0].differences).to.deep.equal([
        { part: 'technique', recorded: 'Naked Single', current: 'none (error)' },
      ]);
    });

    it('a recorded no-technique answer against a current step', async () => {
      const recorded = job({ doc: { type: 'COACH_NO_TECHNIQUE', reason: 'inconsistent' } });

      const result = await compareCoach([recorded], placementStep(2));

      expect(result.divergences[0]).to.deep.include({ technique: 'none (inconsistent)' });
      expect(result.divergences[0].differences).to.deep.equal([
        { part: 'technique', recorded: 'none (inconsistent)', current: 'Naked Single' },
      ]);
    });
  });

  describe('RP31: no-technique answers on both sides', () => {
    it('the same reason matches', async () => {
      const result = await compareCoach([coachJob({ type: 'no-technique', reason: 'error' })], { type: 'no-technique', reason: 'error' });

      expect(result).to.include({ compared: 1 });
      expect(result.divergences).to.deep.equal([]);
    });

    it('a different reason differs in technique', async () => {
      const result = await compareCoach([coachJob({ type: 'no-technique', reason: 'error' })], { type: 'no-technique', reason: 'complete' });

      expect(result.divergences[0].differences).to.deep.equal([
        { part: 'technique', recorded: 'none (error)', current: 'none (complete)' },
      ]);
    });
  });

  describe('RP32: comparison is canonical', () => {
    it('eliminations in another order do not diverge', async () => {
      const current = eliminationStep();
      current.eliminations.reverse();

      const result = await compareCoach([coachJob(eliminationStep())], current);

      expect(result.divergences).to.deep.equal([]);
    });

    it('eliminations of two digits in one cell in another order do not diverge', async () => {
      const recorded = eliminationStep();
      recorded.eliminations = [{ cellIndex: 2, digit: 4 }, { cellIndex: 2, digit: 9 }, { cellIndex: 3, digit: 2 }];
      const current = viaJson(recorded);
      current.eliminations = [{ cellIndex: 3, digit: 2 }, { cellIndex: 2, digit: 9 }, { cellIndex: 2, digit: 4 }];

      const result = await compareCoach([coachJob(recorded)], current);

      expect(result.divergences).to.deep.equal([]);
    });

    it('object keys in another order do not diverge', async () => {
      const recorded = placementStep(2);
      const current = Object.fromEntries(Object.entries(viaJson(recorded)).reverse());
      current.roles = Object.fromEntries(Object.entries(current.roles).reverse());
      current.complexity = { endpoints: null, note: null, acknowledged: false };

      const result = await compareCoach([coachJob(recorded)], current);

      expect(result.divergences).to.deep.equal([]);
    });
  });

  describe('RP33: hint parts', () => {
    const cases = [
      ['cell', { ...HINT, cellIndex: 3 }, [{ part: 'cell', recorded: 2, current: 3 }]],
      ['digit', { ...HINT, digit: 5 }, [{ part: 'digit', recorded: 4, current: 5 }]],
      ['technique', { ...HINT, technique: 'Hidden Single' }, [{ part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' }]],
      ['no current hint', null, [
        { part: 'cell', recorded: 2, current: null },
        { part: 'digit', recorded: 4, current: null },
        { part: 'technique', recorded: 'Naked Single', current: null },
      ]],
    ];
    for (const [label, current, differences] of cases) {
      it(`${label}: one difference per differing part`, async () => {
        const result = await compareHint([hintJob(HINT, { action: 5, selected: 2 })], current);

        expect(result.divergences).to.deep.equal([{ action: 5, kind: 'hint', time: at(1), cell: 2, differences }]);
        expect(result.counts).to.deep.equal({ coach: 0, hint: 1 });
      });
    }

    it('a recorded "no hint" against a current hint reports null as the recorded value', async () => {
      const result = await compareHint([hintJob(null)], HINT);

      expect(result.divergences[0].differences).to.deep.equal([
        { part: 'cell', recorded: null, current: 2 },
        { part: 'digit', recorded: null, current: 4 },
        { part: 'technique', recorded: null, current: 'Naked Single' },
      ]);
    });

    it('an equal hint does not diverge', async () => {
      const result = await compareHint([hintJob(HINT)], { ...HINT });

      expect(result).to.deep.include({ compared: 1, divergences: [] });
    });
  });

  it('RP34: compared counts exclude not-compared items, by kind', async () => {
    const jobs = [job({ action: 1 }), job({ action: 2 }), hintJob(HINT, { action: 3 }), hintJob(HINT, { action: 4, noChange: true })];

    const result = await compare(jobs, { analyze: () => placementStep(2), nextHint: () => HINT });

    expect(result.compared).to.equal(3);
    expect(result.counts).to.deep.equal({ coach: 2, hint: 1 });
    expect(result.notCompared).to.have.length(1);
  });

  describe('RP35: pacing', () => {
    const three = () => [job({ action: 1 }), job({ action: 2 }), job({ action: 3 })];

    it('with yieldEvery 0 it pauses after every job', async () => {
      const log = [];
      const analyze = () => { log.push('job'); return placementStep(2); };

      await compare(three(), { analyze, nextHint: never, yieldEvery: 0, pause: async () => { log.push('pause'); } });

      expect(log).to.deep.equal(['job', 'pause', 'job', 'pause', 'job', 'pause']);
    });

    it('with a very long slice it never pauses', async () => {
      let pauses = 0;

      await compare(three(), { analyze: () => placementStep(2), nextHint: never, yieldEvery: 1e9, pause: async () => { pauses++; } });

      expect(pauses).to.equal(0);
    });

    it('the default pause resolves', async () => {
      const result = await compare(three(), { analyze: () => placementStep(2), nextHint: never, yieldEvery: 0 });

      expect(result.compared).to.equal(3);
    });

    it('a pause that rejects cancels the comparison with its reason and computes no further job', async () => {
      let jobs = 0;
      const cancelled = new Error('cancelled');

      let caught = null;
      try {
        await compare(three(), {
          analyze: () => { jobs++; return placementStep(2); }, nextHint: never, yieldEvery: 0, pause: () => Promise.reject(cancelled),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).to.equal(cancelled);
      expect(jobs).to.equal(1);
    });

    it('the result does not depend on the pacing', async () => {
      const opts = { analyze: () => eliminationStep(), nextHint: () => null };
      const jobs = () => [job({ action: 1 }), hintJob(HINT, { action: 2 })];

      const sliced = await compare(jobs(), { ...opts, yieldEvery: 0, pause: async () => {} });
      const unsliced = await compare(jobs(), { ...opts, yieldEvery: 1e9 });

      expect(sliced).to.deep.equal(unsliced);
    });
  });

  it('RP36: analyze and nextHint receive the position before the action', async () => {
    const calls = [];
    const coach = job();
    const hint = hintJob(HINT, { selected: 3 });

    await compare([coach, hint], {
      analyze: (...args) => { calls.push(['analyze', ...args]); return placementStep(2); },
      nextHint: (...args) => { calls.push(['nextHint', ...args]); return HINT; },
    });

    expect(calls).to.have.length(2);
    const [, aPuzzle, aState] = calls[0];
    expect(aPuzzle).to.equal(coach.puzzle);
    expect(aState).to.deep.equal({ pen: coach.pen, conflicts: coach.conflicts, pencil: coach.pencil });
    expect(aState.pen).to.equal(coach.pen);
    expect(aState.pencil).to.equal(coach.pencil);
    expect(aState.conflicts).to.equal(coach.conflicts);
    const [, hPuzzle, hState, hOpts] = calls[1];
    expect(hPuzzle).to.equal(hint.puzzle);
    expect(Object.keys(hState)).to.deep.equal(['pen', 'conflicts']);
    expect(hState.pen).to.equal(hint.pen);
    expect(hState.conflicts).to.equal(hint.conflicts);
    expect(hOpts).to.deep.equal({ targetCell: 3 });
  });
});

// ── Report ───────────────────────────────────────────────────────────────────

/** A report with the given parts; everything else empty. */
function report(overrides = {}) {
  return {
    applied: 5, total: 5, compared: 0, counts: { coach: 0, hint: 0 },
    divergences: [], notCompared: [], errors: { recorded: [], raised: [] }, notes: [], stopped: null,
    ...overrides,
  };
}

const divergence = (action, kind = 'coach') => ({
  action, kind, time: at(action), technique: 'Naked Single',
  differences: [{ part: 'rank', recorded: 1, current: 2 }],
});
const notCompared = action => ({ action, kind: 'hint', reason: NO_CHANGE_REASON });

describe('replay — buildReport', () => {
  const comparison = { divergences: [divergence(3)], notCompared: [notCompared(4)], compared: 2, counts: { coach: 1, hint: 1 } };

  it('assembles the report from the run, the comparison, the notes and the raised errors', () => {
    const doc = sessionDoc({ actions: [sel(1), sel(2), sel(3), sel(4), sel(5)] });
    const runResult = { applied: 4, stopped: null, notes: [BUSY_CLEARED] };
    const raised = [{ kind: 'uncaught', afterAction: 4, message: 'late', count: 1 }];

    const result = buildReport({ doc, notes: ['Document format version 1 was read as version 2.'], run: runResult, comparison, raised });

    expect(result).to.deep.equal({
      applied: 4, total: 5, compared: 2, counts: { coach: 1, hint: 1 },
      divergences: comparison.divergences, notCompared: comparison.notCompared,
      errors: { recorded: [], raised },
      notes: ['Document format version 1 was read as version 2.', BUSY_CLEARED],
      stopped: null,
    });
  });

  it('defaults to no notes and no raised errors, and carries the stop', () => {
    const doc = sessionDoc({ actions: [sel(1), sel(2)] });

    const result = buildReport({ doc, run: { applied: 1, stopped: { at: 2, message: 'boom' }, notes: [] }, comparison });

    expect(result.errors.raised).to.deep.equal([]);
    expect(result.notes).to.deep.equal([]);
    expect(result.stopped).to.deep.equal({ at: 2, message: 'boom' });
  });

  describe('RP38: recorded errors are those in the replayed range', () => {
    const doc = sessionDoc({
      actions: [sel(1), sel(2), sel(3)],
      errors: [errorItem(0), errorItem(2, { count: 3, kind: 'rejection', action: null }), errorItem(3)],
    });

    it('an error after the last applied action is included', () => {
      const result = buildReport({ doc, run: { applied: 2, stopped: null, notes: [] }, comparison });

      expect(result.errors.recorded).to.deep.equal([
        { kind: 'listener', afterAction: 0, message: 'x is undefined', count: 1 },
        { kind: 'rejection', afterAction: 2, message: 'x is undefined', count: 3 },
      ]);
    });

    it('an error after a later action is excluded', () => {
      const result = buildReport({ doc, run: { applied: 1, stopped: null, notes: [] }, comparison });

      expect(result.errors.recorded.map(e => e.afterAction)).to.deep.equal([0]);
    });
  });

  it('RP40: a divergence keeps the document\'s ISO time', async () => {
    const doc = sessionDoc({ actions: [sel(2), item(2, { type: 'COACH_START', result: placementStep(2) })] });
    const result = run(doc, 2);

    const comparison2 = await compareCoach(result.jobs, { ...placementStep(2), rank: 3 });

    expect(comparison2.divergences[0].time).to.equal(at(2));
  });
});

describe('replay — outcomeMessage (RP37)', () => {
  const cases = [
    ['one computed result, no divergences', report({ compared: 1 }),
      'Session replayed: 5 of 5 actions. No divergences in 1 computed result.'],
    ['several computed results, no divergences', report({ applied: 3, total: 9, compared: 7 }),
      'Session replayed: 3 of 9 actions. No divergences in 7 computed results.'],
    ['one divergence', report({ compared: 40, divergences: [divergence(3)] }),
      'Session replayed: 5 of 5 actions. 1 divergence in 40 computed results.'],
    ['several divergences', report({ compared: 40, divergences: [divergence(3), divergence(4)] }),
      'Session replayed: 5 of 5 actions. 2 divergences in 40 computed results.'],
    ['nothing to compare', report(), 'Session replayed: 5 of 5 actions. No computed results to compare.'],
    ['one action', report({ applied: 1, total: 1 }), 'Session replayed: 1 of 1 action. No computed results to compare.'],
    ['no divergences with not-compared items', report({ compared: 3, notCompared: [notCompared(1), notCompared(2)] }),
      'Session replayed: 5 of 5 actions. No divergences in 3 computed results. 2 not compared.'],
    ['divergences with a not-compared item', report({ compared: 2, divergences: [divergence(3)], notCompared: [notCompared(1)] }),
      'Session replayed: 5 of 5 actions. 1 divergence in 2 computed results. 1 not compared.'],
    ['nothing could be compared', report({ notCompared: [notCompared(1), notCompared(2)] }),
      'Session replayed: 5 of 5 actions. No computed results could be compared. 2 not compared.'],
  ];
  for (const [label, r, text] of cases) {
    it(`${label}: "${text}"`, () => {
      expect(outcomeMessage(r)).to.deep.equal({ text, error: false });
    });
  }

  it('stopped: the stop sentence with no comparison tail, styled as an error', () => {
    const r = report({ applied: 3, total: 9, compared: 2, notCompared: [notCompared(1)], stopped: { at: 4, message: 'boom' } });

    expect(outcomeMessage(r)).to.deep.equal({
      text: 'Replay stopped at action 4 of 9: boom. The board shows the position before that action.',
      error: true,
    });
  });

  it('rejected: the rejection message is "This session can\'t be replayed." and the reason', async () => {
    const result = await prep('{');

    expect(result.message).to.equal('This session can\'t be replayed. The text is not valid JSON.');
  });
});

describe('replay — formatReportLines (RP39)', () => {
  const time = iso => `<${iso}>`;
  const lines = r => formatReportLines(r, time);

  describe('scope line', () => {
    const cases = [
      ['no notes', report({ applied: 5, total: 9 }), 'Replayed 5 of 9 actions.'],
      ['one action', report({ applied: 1, total: 1 }), 'Replayed 1 of 1 action.'],
      ['the upgrade note', report({ notes: ['Document format version 1 was read as version 2.'] }),
        'Replayed 5 of 5 actions. Document format version 1 was read as version 2.'],
      ['the busy-cleared note', report({ notes: [BUSY_CLEARED] }), `Replayed 5 of 5 actions. ${BUSY_CLEARED}`],
      ['both notes', report({ notes: ['Document format version 1 was read as version 2.', BUSY_CLEARED] }),
        `Replayed 5 of 5 actions. Document format version 1 was read as version 2. ${BUSY_CLEARED}`],
    ];
    for (const [label, r, text] of cases) {
      it(`${label}: "${text}"`, () => {
        expect(lines(r).scope).to.equal(text);
      });
    }
  });

  describe('divergence summary', () => {
    const cases = [
      ['none to compare', report(),
        'No computed results to compare: the replayed actions contain no coach steps or hints.'],
      ['none could be compared', report({ notCompared: [notCompared(1)] }), 'No computed results could be compared.'],
      ['one result matches', report({ compared: 1, counts: { coach: 1, hint: 0 } }),
        'No divergences: the 1 computed result matches the current code (1 coach step, 0 hints).'],
      ['all results match, with not-compared items left out', report({ compared: 7, counts: { coach: 4, hint: 3 }, notCompared: [notCompared(1)] }),
        'No divergences: all 7 computed results match the current code (4 coach steps, 3 hints).'],
      ['one result matches as a hint', report({ compared: 2, counts: { coach: 1, hint: 1 } }),
        'No divergences: all 2 computed results match the current code (1 coach step, 1 hint).'],
      ['1 of 1 differs', report({ compared: 1, divergences: [divergence(1)] }),
        '1 of 1 computed result differs from the current code:'],
      ['1 of 40 differs', report({ compared: 40, divergences: [divergence(1)] }),
        '1 of 40 computed results differs from the current code:'],
      ['2 of 40 differ', report({ compared: 40, divergences: [divergence(1), divergence(2)], notCompared: [notCompared(3)] }),
        '2 of 40 computed results differ from the current code:'],
    ];
    for (const [label, r, text] of cases) {
      it(`${label}: "${text}"`, () => {
        expect(lines(r).summary).to.equal(text);
      });
    }
  });

  describe('divergence items', () => {
    const coachDivergence = (differences, technique = 'Naked Single') => ({ action: 7, kind: 'coach', time: at(7), technique, differences });
    const T = `<${at(7)}>`;
    const cases = [
      ['technique differs, with other parts',
        coachDivergence([
          { part: 'technique', recorded: 'Naked Single', current: 'Hidden Single' },
          { part: 'roles', recorded: { target: 2 }, current: { target: 3 } },
          { part: 'text', recorded: { supportingText: 'a', note: null }, current: { supportingText: 'b', note: null } },
        ]),
        `Action 7 — coach step at ${T}: technique — recorded Naked Single, current Hidden Single. Also differs: roles, text.`],
      ['technique differs alone',
        coachDivergence([{ part: 'technique', recorded: 'Naked Single', current: 'none (error)' }]),
        `Action 7 — coach step at ${T}: technique — recorded Naked Single, current none (error).`],
      ['same technique',
        coachDivergence([{ part: 'rank', recorded: 1, current: 2 }, { part: 'eliminations', recorded: [], current: [] }], 'X-Wing'),
        `Action 7 — coach step (X-Wing) at ${T}: differs in rank, eliminations.`],
      ['hint digit',
        { action: 3, kind: 'hint', time: at(7), cell: 2, differences: [{ part: 'digit', recorded: 4, current: 5 }] },
        `Action 3 — hint on r1c3 at ${T}: digit — recorded 4, current 5.`],
      ['hint cell',
        { action: 3, kind: 'hint', time: at(7), cell: 2, differences: [{ part: 'cell', recorded: 2, current: 9 }] },
        `Action 3 — hint on r1c3 at ${T}: cell — recorded r1c3, current r2c1.`],
      ['hint with several parts, one sentence each',
        {
          action: 3, kind: 'hint', time: at(7), cell: 80, differences: [
            { part: 'cell', recorded: 80, current: null },
            { part: 'digit', recorded: 9, current: null },
            { part: 'technique', recorded: 'Hidden Single', current: null },
          ],
        },
        `Action 3 — hint on r9c9 at ${T}: cell — recorded r9c9, current null. `
          + `Action 3 — hint on r9c9 at ${T}: digit — recorded 9, current null. `
          + `Action 3 — hint on r9c9 at ${T}: technique — recorded Hidden Single, current null.`],
    ];
    for (const [label, d, text] of cases) {
      it(`${label}: "${text}"`, () => {
        expect(lines(report({ compared: 1, divergences: [d] })).divergences[0].text).to.equal(text);
      });
    }

    it('each item carries the recorded and current values of the differing parts as JSON', () => {
      const d = coachDivergence([
        { part: 'rank', recorded: 1, current: 2 },
        { part: 'unit', recorded: null, current: { type: 'row', index: 0 } },
      ]);

      const [entry] = lines(report({ compared: 1, divergences: [d] })).divergences;

      expect(entry.recorded).to.equal(JSON.stringify({ rank: 1, unit: null }, null, 2));
      expect(entry.current).to.equal(JSON.stringify({ rank: 2, unit: { type: 'row', index: 0 } }, null, 2));
    });

    it('the time is the recorded time through the injected formatter', () => {
      const seen = [];

      formatReportLines(report({ compared: 1, divergences: [divergence(4)] }), iso => { seen.push(iso); return ''; });

      expect(seen).to.deep.equal([at(4)]);
    });
  });

  it('not-compared items, the starting position included', () => {
    const r = report({
      notCompared: [
        { action: 0, kind: 'coach', reason: START_REASON },
        { action: 4, kind: 'hint', reason: NO_CHANGE_REASON },
        { action: 9, kind: 'coach', reason: 'the current code raised an error: boom' },
      ],
    });

    expect(lines(r).notCompared).to.deep.equal([
      'Starting position — coach step: not compared — the position before it is not in the document.',
      'Action 4 — hint: not compared — the recorded action changed nothing.',
      'Action 9 — coach step: not compared — the current code raised an error: boom.',
    ]);
  });

  it('errors: the counts sentence and one item each, the repeat count only when above 1', () => {
    const r = report({
      errors: {
        recorded: [
          { kind: 'listener', afterAction: 2, message: 'x is undefined', count: 1 },
          { kind: 'rejection', afterAction: 0, message: 'no network', count: 4 },
        ],
        raised: [{ kind: 'uncaught', afterAction: 5, message: 'boom', count: 1 }],
      },
    });

    expect(lines(r).errors).to.deep.equal({
      summary: 'Errors: 2 recorded in the replayed range, 1 raised during this replay.',
      items: [
        'Recorded — listener exception after action 2: x is undefined',
        'Recorded — unhandled rejection after action 0: no network (×4)',
        'Raised during this replay — uncaught error after action 5: boom',
      ],
    });
  });

  it('errors: only raised errors still give the sentence with 0 recorded', () => {
    const r = report({ errors: { recorded: [], raised: [{ kind: 'uncaught', afterAction: 0, message: 'boom', count: 2 }] } });

    expect(lines(r).errors).to.deep.equal({
      summary: 'Errors: 0 recorded in the replayed range, 1 raised during this replay.',
      items: ['Raised during this replay — uncaught error after action 0: boom (×2)'],
    });
  });

  it('parts with nothing to show are empty', () => {
    const result = lines(report());

    expect(result.divergences).to.deep.equal([]);
    expect(result.notCompared).to.deep.equal([]);
    expect(result.errors).to.equal(null);
  });

  it('the default formatter shows the local time of day', () => {
    const local = new Date(2026, 10, 15, 9, 5, 7, 42).toISOString();

    const [entry] = formatReportLines(report({ compared: 1, divergences: [{ ...divergence(1), time: local }] })).divergences;

    expect(entry.text).to.equal('Action 1 — coach step (Naked Single) at 09:05:07.042: differs in rank.');
  });
});

describe('replay — formatTimeOfDay and count', () => {
  it('formats an ISO time as the local time of day, HH:MM:SS.mmm on a 24-hour clock', () => {
    const iso = new Date(2026, 10, 15, 21, 4, 3, 9).toISOString();

    expect(formatTimeOfDay(iso)).to.equal('21:04:03.009');
  });

  describe('count takes the singular noun for 1 and the plural otherwise', () => {
    for (const [n, noun, text] of [[0, 'action', '0 actions'], [1, 'action', '1 action'], [2, 'computed result', '2 computed results'], [1, 'hint', '1 hint']]) {
      it(`${n} ${noun} → "${text}"`, () => {
        expect(count(n, noun)).to.equal(text);
      });
    }
  });

  describe('D-35 f: count writes 1,000 and above with a comma as thousands separator', () => {
    const cases = [
      [999, undefined, '999'], [1000, undefined, '1,000'], [5000, 'action', '5,000 actions'],
      [1234567, 'error', '1,234,567 errors'], [10000, 'computed result', '10,000 computed results'],
    ];
    for (const [n, noun, text] of cases) {
      it(`${n}${noun ? ` ${noun}` : ''} → "${text}"`, () => {
        expect(count(n, noun)).to.equal(text);
      });
    }

    it('is independent of the locale: Number.prototype.toLocaleString is not consulted', () => {
      const original = Number.prototype.toLocaleString;
      Number.prototype.toLocaleString = function () { return 'LOCALE'; };
      try {
        expect(count(4321, 'hint')).to.equal('4,321 hints');
      } finally {
        Number.prototype.toLocaleString = original;
      }
    });
  });
});

describe('replay — thousands separators in messages and report lines (D-35 f)', () => {
  const big = { applied: 1234, total: 5000, compared: 2345, counts: { coach: 1345, hint: 1000 } };

  it('the outcome message separates the applied, total and computed-result counts', () => {
    expect(outcomeMessage(report(big)).text)
      .to.equal('Session replayed: 1,234 of 5,000 actions. No divergences in 2,345 computed results.');
  });

  it('the outcome message separates the not-compared count', () => {
    const items = Array.from({ length: 1001 }, (_, i) => notCompared(i + 1));

    expect(outcomeMessage(report({ ...big, notCompared: items })).text).to.match(/ 1,001 not compared\.$/);
  });

  it('the report scope line separates both counts', () => {
    expect(formatReportLines(report(big)).scope).to.equal('Replayed 1,234 of 5,000 actions.');
  });

  it('the report summary separates the computed, coach and hint counts', () => {
    expect(formatReportLines(report(big)).summary)
      .to.equal('No divergences: all 2,345 computed results match the current code (1,345 coach steps, 1,000 hints).');
  });

  it('action positions stay plain: "Action 1234 —" in divergence and not-compared items', () => {
    const r = report({
      ...big,
      divergences: [divergence(1234)],
      notCompared: [{ action: 1234, kind: 'hint', reason: NO_CHANGE_REASON }],
    });

    const lines = formatReportLines(r, () => 'T');

    expect(lines.divergences[0].text).to.match(/^Action 1234 — /);
    expect(lines.notCompared[0]).to.match(/^Action 1234 — /);
  });

  it('error items keep "after action 1234" plain and separate the repeat count', () => {
    const r = report({ errors: { recorded: [{ kind: 'uncaught', afterAction: 1234, message: 'boom', count: 1500 }], raised: [] } });

    expect(formatReportLines(r).errors.items).to.deep.equal(['Recorded — uncaught error after action 1234: boom (×1,500)']);
  });
});
