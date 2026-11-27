/**
 * @fileoverview The developer-session controller (tspec-debug-instrumentation
 * DS1–DS37; fspec-007 §5, §6, §7, §10.1.1; aspec §11): every operation and
 * result row, the panel (`{ ask: true }`) and API intents, replay against a
 * live game store with its phases, supersession, waiting and `busy`, seeded
 * generation and its outcome mapping, the logging switches, and which
 * outcomes are announced.
 *
 * The controller runs over a real game store, recorder and `devLog`
 * (helpers/devSessionRig.js). Announcements are read from a mounted live
 * region; results, messages and dialog wording are asserted exactly.
 */

import { validateGenerateArgs } from '../../dev/devSession.js';
import { createMachine } from '../../dev/machine.js';
import { describeState } from '../../dev/sessionCodec.js';
import { runInspector, generationDiagnostics } from '../../dev/inspect.js';
import { tierForRank } from '../../solver/logical.js';
import { initialCandidates } from '../../solver/candidates.js';
import { rate } from '../../generator/rater.js';
import { announce } from '../../ui/srLive.js';
import { diagnostics } from '../../util/events.js';
import { KIDDIE, HARD, UNRATED as UNRATEABLE, toGivens } from '../fixtures/puzzles/loadable.js';
import {
  SOLUTION, NEARLY_SOLVED, bit, makePuzzle, placementStep, eliminationStep, plainPositionDoc, puzzleDoc,
} from '../helpers/codecFixtures.js';
import {
  devSessionRig, withProgress, liveRegion, frames, settle, deferred, fakeConfirm, sessionDoc, twoActionDoc,
  TWO_ACTIONS_REPLAYED, checkAll, sel, pen, LOAD, PANEL, API, api, NOW, at,
} from '../helpers/devSessionRig.js';

const NO_PUZZLE = { ok: false, reason: 'no-puzzle', message: 'No puzzle loaded.' };
const BUSY = { ok: false, reason: 'busy', message: 'A replay is running.' };
const DECLINED = 'Session not replayed. Your game and recorded history are unchanged.';
const CHECKING = 'Checking session…';
const COMPARING = 'Comparing with current code…';
const NOT_GENERATED = 'No puzzle generated. Your game continues.';
const PASS_REPLACE = 'Pass replace: true to replace a game with progress.';
const NOT_JSON = 'This session can\'t be replayed. The text is not valid JSON.';

/** Independent of the code under test: a cell reference from an index. */
const ref = i => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`;

/** KIDDIE solved except r1c3, r1c4 and r1c6, so it can be won in three moves. */
const loadNearlySolved = r => r.gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: makePuzzle({ givens: NEARLY_SOLVED }) });
const win = r => {
  loadNearlySolved(r);
  for (const i of [2, 3, 5]) {
    r.gs.dispatch(sel(i));
    r.gs.dispatch(pen(SOLUTION[i]));
  }
};

/** Collects every payload of each controller event. */
function recordEvents(session) {
  const events = { status: [], report: [], cleared: [], fallback: 0, order: [] };
  session.on('replay-status', s => { events.status.push(s); events.order.push(`status:${s.text}`); });
  session.on('replay-report', rep => { events.report.push(rep); events.order.push(rep === null ? 'report:empty' : 'report'); });
  session.on('cleared', c => { events.cleared.push(c); events.order.push('cleared'); });
  session.on('cleared-fallback', () => { events.fallback++; events.order.push('cleared-fallback'); });
  return events;
}

/** Runs `fn` from a `changed` listener on the first DEV_RESTORE_POSITION. */
function duringCommit(gs, fn) {
  let done = false;
  gs.on('changed', ({ action }) => {
    if (!done && action.type === 'DEV_RESTORE_POSITION') {
      done = true;
      fn();
    }
  });
}

/** A machine factory whose machines throw on the `nth` dispatch of `type`. */
function throwingOnNth(type, nth, message = 'boom') {
  let seen = 0;
  return position => {
    const machine = createMachine(position);
    return {
      getState: machine.getState,
      dispatch(action) {
        if (action.type === type && ++seen === nth) throw new Error(message);
        machine.dispatch(action);
      },
    };
  };
}

describe('dev/devSession.js', function () {
  this.timeout(20000);

  let live;
  let rigs;

  beforeEach(() => {
    live = liveRegion();
    rigs = [];
  });

  afterEach(async () => {
    await live.dispose();
    for (const r of rigs) r.dispose();
  });

  async function rig(opts) {
    const r = await devSessionRig(opts);
    rigs.push(r);
    return r;
  }

  /** Announcements made by `fn`, after their frame. */
  async function announcedBy(fn) {
    await frames(2);
    live.texts.length = 0;
    const result = await fn();
    await frames(2);
    return { result, announced: [...live.texts] };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  describe('reads', () => {
    it('DS1: state() is ok with the description of the live game and the recorder counts', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));

      const result = r.session.state();

      expect(result).to.deep.equal({ ok: true, ...describeState(r.gs.getState(), r.recorder.counts()) });
      expect(result.recorder).to.deep.equal({ actions: 2, errors: 0, capacity: 5000 });
    });

    it('DS1: state() before any puzzle has puzzle null', async () => {
      const r = await rig();

      expect(r.session.state()).to.include({ ok: true, puzzle: null });
    });

    it('DS4: inspect() without a puzzle fails with no-puzzle', async () => {
      const r = await rig();

      expect(r.session.inspect()).to.deep.equal(NO_PUZZLE);
    });

    it('DS4: inspect() on a solvable board reports the summary, the hardest rank and its tier', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      const expected = runInspector(r.gs.getState().pen);

      const result = r.session.inspect();

      expect(result).to.include({
        ok: true, summary: `Solved in ${expected.steps.length} steps. Hardest rank ${expected.hardest} (Kiddie).`,
        solved: true, unsolvedCells: 0, hardestRank: expected.hardest, tier: tierForRank(expected.hardest),
      });
      expect(result.tier).to.equal('kiddie');
      expect(result.steps).to.have.length(expected.steps.length);
    });

    it('DS4: inspect() on a board the solver cannot finish reports null rank and tier', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD(UNRATEABLE, 'unrated'));
      const expected = runInspector(toGivens(UNRATEABLE));

      const result = r.session.inspect();

      expect(result).to.include({ ok: true, solved: false, hardestRank: null, tier: null });
      expect(result.unsolvedCells).to.equal(expected.remaining).and.be.above(0);
      expect(result.summary).to.match(/^Stalled after \d+ steps? with \d+ cells? unsolved\.$/);
    });

    it('DS4: inspect() maps placement and elimination steps to cell references and touches nothing', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD(HARD, 'hard'));
      const before = r.snapshot();
      const steps = runInspector(toGivens(HARD)).steps;
      const placing = steps.findIndex(s => s.placement !== null);
      const eliminating = steps.findIndex(s => s.placement === null && s.eliminations.length > 0);
      expect(eliminating, 'HARD has an elimination step').to.be.at.least(0);

      const result = r.session.inspect();

      const p = steps[placing];
      expect(result.steps[placing]).to.deep.equal({
        number: placing + 1, technique: p.technique, text: p.text,
        placement: { cell: ref(p.placement.cellIndex), digit: p.placement.digit },
        eliminations: p.eliminations.map(e => ({ cell: ref(e.cellIndex), digit: e.digit })),
        pattern: p.cells.pattern.map(ref),
      });
      const e = steps[eliminating];
      expect(result.steps[eliminating]).to.deep.equal({
        number: eliminating + 1, technique: e.technique, text: e.text, placement: null,
        eliminations: e.eliminations.map(x => ({ cell: ref(x.cellIndex), digit: x.digit })),
        pattern: e.cells.pattern.map(ref),
      });
      expect(r.calls.dispatched).to.deep.equal([]);
      expect(r.snapshot()).to.equal(before);
    });

    it('DS5: coachStep() during a session returns the live step, detached', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch({ type: 'COACH_START', result: placementStep(2) });

      const result = r.session.coachStep();
      result.step.technique = 'changed';

      expect(r.session.coachStep()).to.deep.equal({ ok: true, active: true, step: placementStep(2) });
    });

    it('DS5: coachStep() without a session is inactive with the panel message', async () => {
      const r = await rig();

      expect(r.session.coachStep()).to.deep.equal({
        ok: true, active: false, step: null, message: 'No active coach session.',
      });
    });

    it('DS6: candidates() without a puzzle fails with no-puzzle', async () => {
      const r = await rig();

      expect(r.session.candidates()).to.deep.equal(NO_PUZZLE);
    });

    it('DS6: candidates() gives the basic candidates of each empty cell, whatever the marks', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));
      r.gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 9 });

      const { ok, candidates } = r.session.candidates();

      expect(ok).to.equal(true);
      expect(candidates).to.have.length(81);
      expect(candidates[2]).to.deep.equal([1, 2, 4]);
    });

    it('DS6: candidates() gives an empty list for every filled cell', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));
      r.gs.dispatch(pen(SOLUTION[2]));

      const { candidates } = r.session.candidates();

      expect(candidates[0], 'a given').to.deep.equal([]);
      expect(candidates[2], 'a pen digit').to.deep.equal([]);
    });

    it('DS10: exportSession() is ok with the recorder\'s document', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());

      expect(r.session.exportSession()).to.deep.equal({ ok: true, document: r.recorder.exportDocument() });
    });

    it('DS37: logging() is ok with the three switches', async () => {
      const r = await rig();

      expect(r.session.logging()).to.deep.equal({ ok: true, logging: { generation: true, swallowed: true, actions: false } });
    });

    it('read operations announce nothing', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());

      const { announced } = await announcedBy(() => {
        r.session.state();
        r.session.inspect();
        r.session.coachStep();
        r.session.candidates();
        r.session.exportSession();
        r.session.logging();
      });

      expect(announced).to.deep.equal([]);
    });
  });

  // ── load ─────────────────────────────────────────────────────────────────

  describe('load', () => {
    for (const [label, value] of [['a number', 42], ['undefined', undefined], ['an object', { givens: KIDDIE }]]) {
      it(`DS2: ${label} fails with invalid-argument and is not announced`, async () => {
        const r = await rig();

        const { result, announced } = await announcedBy(() => r.session.load(value, API));

        expect(result).to.deep.equal({ ok: false, reason: 'invalid-argument', message: 'The puzzle must be given as a string.' });
        expect(r.calls.loadOptions).to.deep.equal([]);
        expect(announced).to.deep.equal([]);
      });
    }

    it('DS3: a loaded puzzle is ok with its tier and the loader\'s message, announced', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.load(KIDDIE, PANEL));

      expect(result).to.deep.equal({ ok: true, tier: 'medium', message: 'Puzzle loaded. Difficulty: Medium.' });
      expect(r.gs.getState().puzzle.id).to.equal('loaded');
      expect(announced).to.deep.equal(['Puzzle loaded. Difficulty: Medium.']);
    });

    it('DS3: a rejected string from the panel fails with rejected and is announced', async () => {
      const r = await rig();
      const message = 'This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 3.';

      const { result, announced } = await announcedBy(() => r.session.load('123', PANEL));

      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message });
      expect(announced).to.deep.equal([message]);
    });

    it('DS3: a rejected string from the API fails with rejected and is not announced', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.load('123', API));

      expect(result).to.deep.equal({
        ok: false, reason: 'rejected', message: 'This puzzle can\'t be loaded. A puzzle needs exactly 81 cells; this one has 3.',
      });
      expect(announced).to.deep.equal([]);
    });

    it('DS3: a panel load declined at the confirmation fails with declined, announced', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withProgress(r);

      const { result, announced } = await announcedBy(() => r.session.load(KIDDIE, PANEL));

      expect(confirm.opened).to.deep.equal([
        { title: 'Load this puzzle?', body: 'Your current progress will be lost.', confirmLabel: 'Load Puzzle' },
      ]);
      expect(result).to.deep.equal({ ok: false, reason: 'declined', message: 'Puzzle not loaded. Your game continues.' });
      expect(announced).to.deep.equal(['Puzzle not loaded. Your game continues.']);
    });

    it('DS3: an API load over progress without replace fails with needs-replace and changes nothing', async () => {
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm });
      withProgress(r);
      const before = r.snapshot();

      const { result, announced } = await announcedBy(() => r.session.load(KIDDIE, API));

      expect(result).to.deep.equal({
        ok: false, reason: 'needs-replace', message: `Puzzle not loaded. Your game continues. ${PASS_REPLACE}`,
      });
      expect(confirm.opened).to.deep.equal([]);
      expect(r.snapshot()).to.equal(before);
      expect(announced).to.deep.equal([]);
    });

    it('DS3: an API load over progress with replace: true loads through a per-call confirmation that agrees', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withProgress(r);

      const result = await r.session.load(KIDDIE, api({ replace: true }));

      expect(result).to.deep.equal({ ok: true, tier: 'medium', message: 'Puzzle loaded. Difficulty: Medium.' });
      expect(r.calls.perCallConfirms).to.equal(1);
      expect(confirm.opened).to.deep.equal([]);
    });

    it('DS3: an API load without progress loads without asking anyone', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });

      const result = await r.session.load(KIDDIE, API);

      expect(result.ok).to.equal(true);
      expect(r.calls.perCallConfirms).to.equal(0);
      expect(confirm.opened).to.deep.equal([]);
    });

    for (const value of ['true', 1, {}]) {
      it(`replace: ${JSON.stringify(value)} is not replace: true`, async () => {
        const r = await rig();
        withProgress(r);

        const result = await r.session.load(KIDDIE, api({ replace: value }));

        expect(result.reason).to.equal('needs-replace');
      });
    }
  });

  // ── Pencil marks ─────────────────────────────────────────────────────────

  describe('setPencilMarks', () => {
    const CELL_MESSAGE = v => `${v} is not a cell reference such as r4c7.`;
    const INVALID_DIGITS = { ok: false, reason: 'invalid-digits', message: 'Pencil marks must be a list of digits 1–9.' };
    const loaded = r => r.gs.dispatch(LOAD());

    const failures = [
      ['no puzzle', () => {}, 'r1c3', [1], NO_PUZZLE],
      ['a won puzzle', win, 'r1c3', [1],
        { ok: false, reason: 'game-won', message: 'The puzzle is complete; pencil marks can\'t be changed.' }],
      ['a running generation', r => { loaded(r); r.gs.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'easy' }); },
        'r1c3', [1], { ok: false, reason: 'busy', message: 'A puzzle is being generated.' }],
      ...['R4C7', 'r0c1', 'r10c1', 4, null].map(cell =>
        [`cell ${JSON.stringify(cell)}`, loaded, cell, [1], { ok: false, reason: 'invalid-cell', message: CELL_MESSAGE(cell) }]),
      ['a given', loaded, 'r1c1', [1], { ok: false, reason: 'cell-filled', message: 'r1c1 holds a digit; it can\'t take pencil marks.' }],
      ['a pen digit', r => { loaded(r); r.gs.dispatch(sel(2)); r.gs.dispatch(pen(SOLUTION[2])); }, 'r1c3', [1],
        { ok: false, reason: 'cell-filled', message: 'r1c3 holds a digit; it can\'t take pencil marks.' }],
      ...[[0], [10], [1.5], '123', ['1'], null].map(digits =>
        [`digits ${JSON.stringify(digits)}`, loaded, 'r1c3', digits, INVALID_DIGITS]),
      ['no puzzle and a bad cell', () => {}, 'bogus', [1], NO_PUZZLE],
      ['a bad cell and bad digits', loaded, 'bogus', 'x', { ok: false, reason: 'invalid-cell', message: CELL_MESSAGE('bogus') }],
    ];
    for (const [label, arrange, cell, digits, expected] of failures) {
      it(`DS7: ${label} fails with ${expected.reason} and dispatches nothing`, async () => {
        const r = await rig();
        arrange(r);

        const result = r.session.setPencilMarks(cell, digits);

        expect(result).to.deep.equal(expected);
        expect(r.calls.dispatched).to.deep.equal([]);
      });
    }

    it('DS8: repeated digits in any order set the mask once, return them ascending, and are announced', async () => {
      const r = await rig();
      loaded(r);

      const { result, announced } = await announcedBy(() => r.session.setPencilMarks('r1c3', [3, 1, 3]));

      expect(r.calls.dispatched).to.deep.equal([{ type: 'DEV_SET_PENCIL', index: 2, mask: bit(1) | bit(3) }]);
      expect(result).to.deep.equal({ ok: true, cell: 'r1c3', digits: [1, 3], message: 'Pencil marks set in r1c3.' });
      expect(r.gs.getState().pencil[2]).to.equal(bit(1) | bit(3));
      expect(announced).to.deep.equal(['Pencil marks set in r1c3.']);
    });

    it('DS8: an empty list clears the cell\'s marks', async () => {
      const r = await rig();
      loaded(r);
      r.session.setPencilMarks('r1c3', [4]);

      const result = r.session.setPencilMarks('r1c3', []);

      expect(result).to.deep.equal({ ok: true, cell: 'r1c3', digits: [], message: 'Pencil marks set in r1c3.' });
      expect(r.gs.getState().pencil[2]).to.equal(0);
    });

    it('DS8: marks already as requested succeed, are still dispatched and recorded as no change, and are not announced', async () => {
      const r = await rig();
      loaded(r);
      r.session.setPencilMarks('r1c3', [4]);
      r.calls.dispatched.length = 0;

      const { result, announced } = await announcedBy(() => r.session.setPencilMarks('r1c3', [4]));

      expect(result).to.deep.equal({ ok: true, cell: 'r1c3', digits: [4], message: 'Pencil marks set in r1c3.' });
      expect(r.calls.dispatched).to.deep.equal([{ type: 'DEV_SET_PENCIL', index: 2, mask: bit(4) }]);
      expect(r.recorder.exportDocument().actions.at(-1)).to.include({ noChange: true });
      expect(announced).to.deep.equal([]);
    });
  });

  describe('fillPencilMarks', () => {
    for (const [label, arrange, expected] of [
      ['no puzzle', () => {}, NO_PUZZLE],
      ['a won puzzle', win, { ok: false, reason: 'game-won', message: 'The puzzle is complete; pencil marks can\'t be changed.' }],
      ['a running generation',
        r => { r.gs.dispatch(LOAD()); r.gs.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'easy' }); },
        { ok: false, reason: 'busy', message: 'A puzzle is being generated.' }],
    ]) {
      it(`DS9: ${label} fails with ${expected.reason} and dispatches nothing`, async () => {
        const r = await rig();
        arrange(r);

        expect(r.session.fillPencilMarks()).to.deep.equal(expected);
        expect(r.calls.dispatched).to.deep.equal([]);
      });
    }

    it('DS9: fills every empty cell with its candidates in one dispatch, counting cells against the marks before', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      const pen0 = r.gs.getState().pen;
      const computed = initialCandidates(pen0);
      r.session.setPencilMarks('r1c3', [1, 2, 4]);
      r.calls.dispatched.length = 0;
      const empty = Array.from(pen0).filter(d => d === 0).length;

      const { result, announced } = await announcedBy(() => r.session.fillPencilMarks());

      expect(result).to.deep.equal({ ok: true, cellsChanged: empty - 1, message: `Pencil marks filled in ${empty - 1} cells.` });
      expect(r.calls.dispatched).to.have.length(1);
      expect(r.calls.dispatched[0].type).to.equal('DEV_FILL_PENCIL');
      expect(Array.from(r.gs.getState().pencil)).to.deep.equal(Array.from(computed, (m, i) => (pen0[i] === 0 ? m : 0)));
      expect(announced).to.deep.equal([result.message]);
    });

    it('DS9: a second fill changes no cell and is not announced', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.session.fillPencilMarks();

      const { result, announced } = await announcedBy(() => r.session.fillPencilMarks());

      expect(result).to.deep.equal({ ok: true, cellsChanged: 0, message: 'Pencil marks filled in 0 cells.' });
      expect(announced).to.deep.equal([]);
    });

    it('DS9: one changed cell is counted in the singular', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.session.fillPencilMarks();
      r.session.setPencilMarks('r1c3', []);

      expect(r.session.fillPencilMarks()).to.deep.equal({ ok: true, cellsChanged: 1, message: 'Pencil marks filled in 1 cell.' });
    });

    /** Cells whose marks differ between two pencil arrays. */
    const differing = (a, b) => a.reduce((n, m, i) => n + (m !== b[i] ? 1 : 0), 0);

    it('D-34: during a coach session, cellsChanged counts the cells whose marks the call changed, revealed marks included', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));
      r.gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 1 });
      r.gs.dispatch({ type: 'COACH_START', result: eliminationStep() });
      const before = new Uint16Array(r.gs.getState().pencil);

      const result = r.session.fillPencilMarks();

      expect(r.gs.getState().coachSession).to.equal(null);
      expect(result.cellsChanged).to.equal(differing(before, r.gs.getState().pencil));
    });

    it('D-34: a cell filled during the session gets no marks back when the session ends; the count matches', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));
      r.gs.dispatch({ type: 'PENCIL_TOGGLE', digit: 1 });
      r.gs.dispatch({ type: 'COACH_START', result: eliminationStep() });
      // A digit placed without ending the session (as a restore does).
      r.gs.dispatch({ type: 'PEN_ENTER', digit: SOLUTION[2], fromHint: true });
      const before = new Uint16Array(r.gs.getState().pencil);

      const result = r.session.fillPencilMarks();

      const after = r.gs.getState().pencil;
      expect(before[2], 'r1c3 before').to.equal(0);
      expect(after[2], 'r1c3 after').to.equal(0);
      expect(result.cellsChanged).to.equal(differing(before, after));
      expect(result.message).to.equal(`Pencil marks filled in ${differing(before, after)} cells.`);
    });
  });

  // ── History ──────────────────────────────────────────────────────────────

  describe('copySession', () => {
    it('DS11: a successful copy writes the indented document and announces the counts', async () => {
      const r = await rig();
      r.gs.dispatch(LOAD());
      r.recorder.captureError({ kind: 'uncaught', message: 'x' });

      const { result, announced } = await announcedBy(() => r.session.copySession());

      expect(r.calls.copied).to.deep.equal([JSON.stringify(r.recorder.exportDocument(), null, 2)]);
      expect(result).to.deep.equal({ ok: true, message: 'Session copied: 1 action, 1 error.' });
      expect(announced).to.deep.equal(['Session copied: 1 action, 1 error.']);
    });

    it('DS11: a failed copy fails with copy-failed, returns the text to show, and is announced', async () => {
      const r = await rig({ deps: { copy: async () => false } });
      r.gs.dispatch(LOAD());
      const message = 'Couldn\'t copy automatically. The session document is shown for you to copy.';

      const { result, announced } = await announcedBy(() => r.session.copySession());

      expect(result).to.deep.equal({
        ok: false, reason: 'copy-failed', message, document: JSON.stringify(r.recorder.exportDocument(), null, 2),
      });
      expect(announced).to.deep.equal([message]);
    });
  });

  describe('clearHistory', () => {
    const CLEARED = 'History cleared.';
    const withEntries = r => {
      r.gs.dispatch(LOAD());
      r.gs.dispatch(sel(2));
      r.recorder.captureError({ kind: 'uncaught', message: 'x' });
    };

    it('DS29: during a replay commit it fails with busy and clears nothing', async () => {
      const r = await rig();
      let result;
      duringCommit(r.gs, () => { result = r.session.clearHistory(api({ discardHistory: true })); });

      await r.session.replay(twoActionDoc(), {}, API, 'api');

      expect(result).to.deep.equal(BUSY);
      expect(r.recorder.counts()).to.include({ actions: 2, errors: 0 });
    });

    it('DS29: the panel asks with the counts, and a confirmed clear empties the history, emits cleared and is announced', async () => {
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm });
      withEntries(r);
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.clearHistory(PANEL));

      expect(confirm.opened).to.deep.equal([{
        title: 'Clear recorded history?',
        body: 'The recorded history (2 actions, 1 error) will be discarded. Your game is not affected.',
        confirmLabel: 'Clear History',
      }]);
      expect(result).to.deep.equal({ ok: true, message: CLEARED, discarded: { actions: 2, errors: 1 } });
      expect(r.recorder.counts()).to.include({ actions: 0, errors: 0 });
      expect(events.cleared).to.deep.equal([{ discarded: { actions: 2, errors: 1 } }]);
      expect(announced).to.deep.equal([CLEARED]);
    });

    it('DS29: a declined panel clear keeps the history, emits nothing, and announces "History not cleared."', async () => {
      const r = await rig({ confirm: fakeConfirm(false) });
      withEntries(r);
      const before = r.snapshot();
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.clearHistory(PANEL));

      expect(result).to.deep.equal({ ok: false, reason: 'declined', message: 'History not cleared.' });
      expect(r.snapshot()).to.equal(before);
      expect(events.order).to.deep.equal([]);
      expect(announced).to.deep.equal(['History not cleared.']);
    });

    it('DS29: an empty history is cleared without a dialog, with zero counts, announced', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.clearHistory(PANEL));

      expect(confirm.opened).to.deep.equal([]);
      expect(result).to.deep.equal({ ok: true, message: CLEARED, discarded: { actions: 0, errors: 0 } });
      expect(events.cleared).to.have.length(1);
      expect(announced).to.deep.equal([CLEARED]);
    });

    it('DS29: the API without discardHistory fails with needs-discard-history and the counts, silently', async () => {
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm });
      withEntries(r);
      const before = r.snapshot();
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.clearHistory(API));

      expect(result).to.deep.equal({
        ok: false, reason: 'needs-discard-history',
        message: 'History not cleared. Pass discardHistory: true to discard the recorded history (2 actions, 1 error).',
      });
      expect(confirm.opened).to.deep.equal([]);
      expect(r.snapshot()).to.equal(before);
      expect(events.order).to.deep.equal([]);
      expect(announced).to.deep.equal([]);
    });

    it('DS29: the API with discardHistory: true clears without asking and returns what it discarded', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withEntries(r);
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.clearHistory(api({ discardHistory: true })));

      expect(result).to.deep.equal({ ok: true, message: CLEARED, discarded: { actions: 2, errors: 1 } });
      expect(confirm.opened).to.deep.equal([]);
      expect(events.cleared).to.deep.equal([{ discarded: { actions: 2, errors: 1 } }]);
      expect(announced).to.deep.equal([CLEARED]);
    });

    it('DS29: the API clears an empty history without the flag', async () => {
      const r = await rig();

      expect(r.session.clearHistory(API)).to.deep.equal({ ok: true, message: CLEARED, discarded: { actions: 0, errors: 0 } });
    });

    it('discardHistory: "true" is not discardHistory: true', async () => {
      const r = await rig();
      withEntries(r);

      expect(r.session.clearHistory(api({ discardHistory: 'true' })).reason).to.equal('needs-discard-history');
    });

    it('DS30: an error captured while the dialog is open is discarded too; the dialog shows the counts at opening', async () => {
      const confirm = fakeConfirm();
      const r = await rig({ confirm });
      r.gs.dispatch(sel(2));

      const pending = r.session.clearHistory(PANEL);
      r.recorder.captureError({ kind: 'uncaught', message: 'late' });
      confirm.answer(true);
      const result = await pending;

      expect(confirm.opened[0].body).to.equal('The recorded history (1 action, 0 errors) will be discarded. Your game is not affected.');
      expect(result.discarded).to.deep.equal({ actions: 1, errors: 1 });
    });
  });

  // ── Replay ───────────────────────────────────────────────────────────────

  describe('replay: rejection, confirmation and intent', () => {
    it('DS12: a rejected panel replay empties the report, shows the error status, announces it, and asks nothing', async () => {
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm });
      withProgress(r);
      const before = r.snapshot();
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.replay('{', {}, PANEL, 'panel'));

      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message: NOT_JSON });
      expect(events.order).to.deep.equal([`status:${CHECKING}`, 'report:empty', `status:${NOT_JSON}`]);
      expect(events.status.at(-1)).to.deep.equal({ text: NOT_JSON, error: true });
      expect(confirm.opened).to.deep.equal([]);
      expect(r.snapshot()).to.equal(before);
      expect(announced).to.deep.equal([NOT_JSON]);
    });

    it('a rejected API replay is announced and shown in the status line too', async () => {
      const r = await rig();
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() =>
        r.session.replay('{', {}, api({ replace: true, discardHistory: true }), 'api'));

      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message: NOT_JSON });
      expect(events.status.at(-1)).to.deep.equal({ text: NOT_JSON, error: true });
      expect(announced).to.deep.equal([NOT_JSON]);
    });

    const bodies = [
      ['progress only', r => { withProgress(r); r.recorder.clear(); }, 'Your current progress will be lost.'],
      ['history only', r => { r.gs.dispatch(sel(2)); r.recorder.captureError({ kind: 'uncaught', message: 'x' }); },
        'The recorded history (1 action, 1 error) will be discarded.'],
      ['progress and history', withProgress,
        'Your current progress will be lost, and the recorded history (3 actions, 0 errors) will be discarded.'],
    ];
    for (const [label, arrange, body] of bodies) {
      it(`DS13: with ${label} the panel asks once, with the body for what is at stake`, async () => {
        const confirm = fakeConfirm(true);
        const r = await rig({ confirm });
        arrange(r);

        await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

        expect(confirm.opened).to.deep.equal([{ title: 'Replay this session?', body, confirmLabel: 'Replay' }]);
      });
    }

    it('DS13: with neither progress nor history the panel replays without a dialog', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });

      const result = await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      expect(confirm.opened).to.deep.equal([]);
      expect(result.ok).to.equal(true);
    });

    it('DS14: a declined panel replay shows and announces the declined message and changes nothing else', async () => {
      const r = await rig({ confirm: fakeConfirm(false) });
      withProgress(r);
      const before = r.snapshot();
      const events = recordEvents(r.session);

      const { result, announced } = await announcedBy(() => r.session.replay(twoActionDoc(), {}, PANEL, 'panel'));

      expect(result).to.deep.equal({ ok: false, reason: 'declined', message: DECLINED });
      expect(events.order).to.deep.equal([`status:${CHECKING}`, `status:${DECLINED}`]);
      expect(r.snapshot()).to.equal(before);
      expect(r.calls.beforeReplace).to.equal(0);
      expect(announced).to.deep.equal([DECLINED]);
    });

    const PASS_DISCARD = 'Pass discardHistory: true to discard the recorded history (3 actions, 0 errors).';
    const intents = [
      ['progress without replace', r => { withProgress(r); r.recorder.clear(); }, api({ discardHistory: true }),
        { ok: false, reason: 'needs-replace', missing: ['replace'], message: `${DECLINED} ${PASS_REPLACE}` }],
      ['history without discardHistory', r => { withProgress(r); r.gs.dispatch({ type: 'RESET_PUZZLE' }); }, api({ replace: true }),
        { ok: false, reason: 'needs-discard-history', missing: ['discardHistory'],
          message: `${DECLINED} Pass discardHistory: true to discard the recorded history (4 actions, 0 errors).` }],
      ['both missing', withProgress, API,
        { ok: false, reason: 'needs-replace', missing: ['replace', 'discardHistory'], message: `${DECLINED} ${PASS_REPLACE} ${PASS_DISCARD}` }],
      ['both given as truthy non-booleans', withProgress, api({ replace: 1, discardHistory: 'yes' }),
        { ok: false, reason: 'needs-replace', missing: ['replace', 'discardHistory'], message: `${DECLINED} ${PASS_REPLACE} ${PASS_DISCARD}` }],
    ];
    for (const [label, arrange, intent, expected] of intents) {
      it(`DS15: ${label} fails with ${expected.reason}, unannounced, with the declined status, changing nothing`, async () => {
        const confirm = fakeConfirm(true);
        const r = await rig({ confirm });
        arrange(r);
        const before = r.snapshot();
        const events = recordEvents(r.session);

        const { result, announced } = await announcedBy(() => r.session.replay(twoActionDoc(), {}, intent, 'api'));

        expect(result).to.deep.equal(expected);
        expect(events.order).to.deep.equal([`status:${CHECKING}`, `status:${DECLINED}`]);
        expect(confirm.opened).to.deep.equal([]);
        expect(r.snapshot()).to.equal(before);
        expect(announced).to.deep.equal([]);
      });
    }

    it('DS15: flags that are not needed are harmless', async () => {
      const r = await rig();

      const result = await r.session.replay(twoActionDoc(), {}, api({ replace: true, discardHistory: true }), 'api');

      expect(result).to.include({ ok: true, applied: 2, total: 2 });
    });

    it('DS15: a document that is not valid is rejected whatever flags are passed', async () => {
      const r = await rig();
      withProgress(r);

      const result = await r.session.replay('{', {}, api({ replace: true, discardHistory: true }), 'api');

      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message: NOT_JSON });
    });

    it('DS20: progress and history are judged when checking ends, not when the replay starts', async () => {
      const checked = deferred();
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm, deps: { checkPuzzles: async p => { await checked.promise; return checkAll(p); } } });
      r.gs.dispatch(LOAD());
      r.recorder.clear();

      const pending = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      r.gs.dispatch(sel(2));
      r.gs.dispatch(pen(SOLUTION[2]));
      checked.resolve();
      await pending;

      expect(confirm.opened.map(o => o.body)).to.deep.equal([
        'Your current progress will be lost, and the recorded history (2 actions, 0 errors) will be discarded.',
      ]);
    });
  });

  describe('replay: applying to the live game', () => {
    it('DS16: the commit runs in order: cancel, clear the panel, replace the history, one silent restore, then compare and report', async () => {
      const order = [];
      const r = await rig({
        wrapRecorder: rec => ({ ...rec, replaceHistory: (...args) => { order.push('replaceHistory'); return rec.replaceHistory(...args); } }),
        deps: { beforeReplace: () => order.push('beforeReplace') },
      });
      const events = recordEvents(r.session);
      r.session.on('replay-status', ({ text }) => {
        if (text === COMPARING) order.push(`applying over: ${r.session.clearHistory(API).reason}`);
      });
      duringCommit(r.gs, () => {
        order.push('restore');
        announce('inside the commit');
      });

      const { result, announced } = await announcedBy(() => r.session.replay(twoActionDoc(), {}, API, 'api'));

      expect(order).to.deep.equal(['beforeReplace', 'replaceHistory', 'restore', 'applying over: needs-discard-history']);
      expect(events.order).to.deep.equal([
        `status:${CHECKING}`, 'report:empty', 'cleared-fallback', `status:${COMPARING}`, 'report', `status:${TWO_ACTIONS_REPLAYED}`,
      ]);
      expect(result.message).to.equal(TWO_ACTIONS_REPLAYED);
      expect(announced).to.deep.equal([TWO_ACTIONS_REPLAYED]);
    });

    it('DS17: exactly one action reaches the live store, a DEV_RESTORE_POSITION, emitted once', async () => {
      const r = await rig();
      const emitted = [];
      r.gs.on('changed', ({ action }) => emitted.push(action.type));

      await r.session.replay(twoActionDoc(), {}, API, 'api');

      expect(r.calls.dispatched.map(a => a.type)).to.deep.equal(['DEV_RESTORE_POSITION']);
      expect(emitted).to.deep.equal(['DEV_RESTORE_POSITION']);
      const s = r.gs.getState();
      expect(s.selected).to.equal(2);
      expect(s.pen[2]).to.equal(SOLUTION[2]);
    });

    it('DS18: the history becomes the document start plus the applied actions at their recorded times, not re-recorded', async () => {
      const r = await rig({ deps: { analyzeStep: () => placementStep(2) } });
      const doc = sessionDoc({
        actions: [sel(2), { type: 'COACH_START', result: placementStep(2) }, pen(SOLUTION[2])],
        errors: [{ at: at(1), afterAction: 1, kind: 'listener', message: 'old', stack: null, source: null, action: 'SELECT_CELL', count: 1 }],
      });

      await r.session.replay(doc, { stopAfter: 2 }, API, 'api');

      const exported = r.recorder.exportDocument();
      expect(exported.start).to.deep.equal(doc.start);
      expect(exported.actions).to.deep.equal(doc.actions.slice(0, 2));
      expect(exported.errors).to.deep.equal([]);
    });

    it('DS18: errors raised during the replay are carried into the history and the report', async () => {
      const r = await rig({
        deps: {
          analyzeStep: () => {
            r.recorder.captureError({ kind: 'listener', message: 'raised while comparing', action: 'COACH_START' });
            return placementStep(2);
          },
        },
      });
      const doc = sessionDoc({ actions: [sel(2), { type: 'COACH_START', result: placementStep(2) }] });

      const result = await r.session.replay(doc, {}, API, 'api');

      expect(r.recorder.exportDocument().errors.map(e => [e.afterAction, e.kind, e.message]))
        .to.deep.equal([[2, 'listener', 'raised while comparing']]);
      expect(result.report.errors.raised).to.deep.equal([{ kind: 'listener', afterAction: 2, message: 'raised while comparing', count: 1 }]);
    });

    it('DS19: an action that throws stops the replay before it, captures the error, and is not compared', async () => {
      const compared = [];
      const r = await rig({
        deps: {
          makeMachine: throwingOnNth('COACH_START', 2),
          analyzeStep: (...args) => { compared.push(args); return placementStep(2); },
        },
      });
      const events = recordEvents(r.session);
      const doc = sessionDoc({
        actions: [{ type: 'COACH_START', result: placementStep(2) }, sel(3), { type: 'COACH_START', result: placementStep(2) }],
      });
      const message = 'Replay stopped at action 3 of 3: boom. The board shows the position before that action.';

      const { result, announced } = await announcedBy(() => r.session.replay(doc, {}, API, 'api'));

      expect(result).to.deep.include({ ok: false, reason: 'stopped', applied: 2, total: 3, stoppedAt: 3, message });
      expect(result.report.stopped).to.deep.equal({ at: 3, message: 'boom' });
      expect(compared).to.have.length(1);
      expect(r.gs.getState().selected).to.equal(3);
      expect(r.gs.getState().coachSession.step).to.deep.equal(placementStep(2));
      const history = r.recorder.exportDocument();
      expect(history.actions).to.have.length(2);
      expect(history.errors.map(e => [e.afterAction, e.kind, e.message])).to.deep.equal([[2, 'uncaught', 'boom']]);
      expect(events.status.at(-1)).to.deep.equal({ text: message, error: true });
      expect(announced).to.deep.equal([message]);
    });

    it('a replay ending inside a generation clears the busy state and says so in the report', async () => {
      const r = await rig();
      const generating = { message: 'Generating…', difficulty: 'hard', progress: { attempts: 4, budget: 50 } };
      const doc = sessionDoc({ start: plainPositionDoc({ generating }), actions: [sel(2)] });

      const result = await r.session.replay(doc, {}, API, 'api');

      expect(r.gs.getState().generating).to.equal(false);
      expect(result.report.notes).to.deep.equal(['Replay ended during a puzzle generation; the busy state was cleared.']);
    });

    it('a replay cancels a running generation, which reports that it was replaced', async () => {
      const r = await rig({ foreground: { requestPuzzle: () => new Promise(() => {}) } });
      const generation = r.session.generate('nightmare', 7, API);

      await r.session.replay(twoActionDoc(), {}, api({ discardHistory: true }), 'api');

      expect(await generation).to.deep.equal({ ok: false, reason: 'cancelled', message: 'Generation replaced by another request.' });
      expect(r.gs.getState().generating).to.equal(false);
    });

    it('DS21: a panel replay returns focus to where it was when the restore moves it in a frame', async () => {
      const r = await rig();
      const replayButton = document.createElement('button');
      const banner = document.createElement('button');
      live.container.append(replayButton, banner);
      replayButton.focus();
      duringCommit(r.gs, () => requestAnimationFrame(() => banner.focus()));

      await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await frames(2);

      expect(document.activeElement).to.equal(replayButton);
    });

    it('DS21: an API replay leaves focus where it was', async () => {
      const r = await rig();
      const field = document.createElement('input');
      const banner = document.createElement('button');
      live.container.append(field, banner);
      field.focus();
      duringCommit(r.gs, () => requestAnimationFrame(() => banner.focus()));

      await r.session.replay(twoActionDoc(), {}, API, 'api');
      await frames(2);

      expect(document.activeElement).to.equal(field);
    });

    it('DS22: a replay through a coach session to a won board makes exactly one announcement, its outcome', async () => {
      const r = await rig({ deps: { analyzeStep: () => placementStep(5) } });
      r.gs.on('changed', ({ action }) => announce(`changed: ${action.type}`));
      const start = plainPositionDoc({ puzzle: puzzleDoc({ givens: NEARLY_SOLVED }), board: NEARLY_SOLVED });
      const doc = sessionDoc({
        start,
        actions: [sel(2), pen(SOLUTION[2]), sel(3), pen(SOLUTION[3]),
          { type: 'COACH_START', result: placementStep(5) }, sel(5), pen(SOLUTION[5])],
      });

      const { result, announced } = await announcedBy(() => r.session.replay(doc, {}, PANEL, 'panel'));

      expect(r.gs.getState().won).to.equal(true);
      expect(result.message).to.equal('Session replayed: 7 of 7 actions. No divergences in 1 computed result.');
      expect(announced).to.deep.equal([result.message]);
    });

    const operations = [
      ['clearHistory', s => s.clearHistory(api({ discardHistory: true }))],
      ['setPencilMarks', s => s.setPencilMarks('r1c4', [1])],
      ['setPencilMarks with arguments that are not valid', s => s.setPencilMarks('bogus', 'x')],
      ['fillPencilMarks', s => s.fillPencilMarks()],
      ['load', s => s.load(KIDDIE, api({ replace: true }))],
      ['load with a non-string', s => s.load(42, API)],
      ['generate', s => s.generate('kiddie', 1, api({ replace: true }))],
      ['generate with a tier that is not valid', s => s.generate('bogus', 'x', API)],
      ['an API replay', s => s.replay(twoActionDoc(), {}, api({ replace: true, discardHistory: true }), 'api')],
    ];
    for (const [label, call] of operations) {
      it(`DS23: ${label} from a listener during the commit fails with busy before any other check`, async () => {
        const r = await rig();
        let result;
        duringCommit(r.gs, () => { result = call(r.session); });

        await r.session.replay(twoActionDoc(), {}, API, 'api');

        expect(await result).to.deep.equal(BUSY);
        expect(r.recorder.exportDocument().actions).to.deep.equal(twoActionDoc().actions);
        expect(r.calls.generated).to.deep.equal([]);
      });
    }

    it('DS23: logging can be read and set from a listener during the commit', async () => {
      const r = await rig();
      let read;
      let set;
      duringCommit(r.gs, () => {
        read = r.session.logging();
        set = r.session.setLogging('actions', true);
      });

      await r.session.replay(twoActionDoc(), {}, API, 'api');

      expect(read.ok).to.equal(true);
      expect(set).to.include({ ok: true, category: 'actions', on: true });
      expect(r.log.get().actions).to.equal(true);
    });

    it('DS27: a successful API replay returns the counts, the outcome message and the report', async () => {
      const r = await rig();

      const result = await r.session.replay(twoActionDoc(), { stopAfter: '1' }, API, 'api');

      expect(result).to.include({ ok: true, applied: 1, total: 2, message: 'Session replayed: 1 of 2 actions. No computed results to compare.' });
      expect(result.report).to.include({ applied: 1, total: 2, compared: 0, stopped: null });
      expect(Object.keys(result).sort()).to.deep.equal(['applied', 'message', 'ok', 'report', 'total']);
    });

    it('DS28: a successful replay emits checking, comparing and the outcome, and an empty then a final report', async () => {
      const r = await rig();
      const events = recordEvents(r.session);

      const result = await r.session.replay(twoActionDoc(), undefined, PANEL, 'panel');

      expect(events.status).to.deep.equal([
        { text: CHECKING, error: false }, { text: COMPARING, error: false }, { text: TWO_ACTIONS_REPLAYED, error: false },
      ]);
      expect(events.report).to.deep.equal([null, result.report]);
      expect(events.fallback).to.equal(1);
    });

    it('an unsubscribed listener hears nothing more', async () => {
      const r = await rig();
      const heard = [];
      const off = r.session.on('replay-status', s => heard.push(s.text));
      off();

      await r.session.replay(twoActionDoc(), {}, API, 'api');

      expect(heard).to.deep.equal([]);
    });
  });

  describe('replay: overlapping replays', () => {
    /** checkPuzzles held until `release()`, one gate per call. */
    function heldChecks() {
      const gates = [];
      const checkPuzzles = async puzzles => {
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        return checkAll(puzzles);
      };
      return { checkPuzzles, gates, releaseAll: () => gates.forEach(g => g.resolve()) };
    }

    /** Comparison pauses held until released; a document with one computed result reaches it. */
    function heldComparison() {
      const gates = [];
      return {
        deps: { yieldEvery: 0, analyzeStep: () => placementStep(2), pause: () => { const g = deferred(); gates.push(g); return g.promise; } },
        gates,
      };
    }
    const coachDoc = () => sessionDoc({ actions: [{ type: 'COACH_START', result: placementStep(2) }] });

    it('DS24: a panel replay still checking is superseded by a newer one, which alone reports and replaces', async () => {
      const held = heldChecks();
      const r = await rig({ deps: { checkPuzzles: held.checkPuzzles } });
      const events = recordEvents(r.session);

      const first = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await settle();
      expect(held.gates).to.have.length(1);
      const second = r.session.replay(twoActionDoc(), { stopAfter: 1 }, PANEL, 'panel');
      expect(await first).to.deep.equal({ ok: false, reason: 'declined', message: DECLINED });
      held.releaseAll();
      const result = await second;
      await settle();

      expect(result).to.include({ ok: true, applied: 1 });
      expect(r.calls.dispatched.map(a => a.type)).to.deep.equal(['DEV_RESTORE_POSITION']);
      expect(events.status.map(s => s.text)).to.deep.equal([
        CHECKING, CHECKING, COMPARING, 'Session replayed: 1 of 2 actions. No computed results to compare.',
      ]);
    });

    it('DS24: a panel replay at its confirmation is superseded; its dialog is answered by the newer one\'s', async () => {
      const confirm = fakeConfirm();
      const r = await rig({ confirm });
      withProgress(r);
      const events = recordEvents(r.session);

      const first = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await settle();
      expect(confirm.isOpen()).to.equal(true);
      const second = r.session.replay(twoActionDoc(), { stopAfter: 1 }, PANEL, 'panel');
      expect(await first).to.deep.equal({ ok: false, reason: 'declined', message: DECLINED });
      await settle();
      confirm.answer(true);
      const result = await second;

      expect(confirm.opened).to.have.length(2);
      expect(result).to.include({ ok: true, applied: 1 });
      expect(r.calls.dispatched.map(a => a.type)).to.deep.equal(['DEV_RESTORE_POSITION']);
      expect(events.status.map(s => s.text)).to.not.include(DECLINED);
    });

    it('a panel replay superseded at its confirmation has the dialog closed as declined; only the newer replay reports', async () => {
      const confirm = fakeConfirm();
      let closed = 0;
      const closeDialog = () => { closed++; confirm.answer(false); };
      const r = await rig({ confirm, deps: { closeDialog } });
      withProgress(r);
      const events = recordEvents(r.session);
      const first = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await settle();
      expect(confirm.isOpen()).to.equal(true);

      const { result, announced } = await announcedBy(async () => {
        const second = r.session.replay('{', {}, PANEL, 'panel');
        expect(await first).to.deep.equal({ ok: false, reason: 'declined', message: DECLINED });
        return second;
      });

      expect(closed).to.equal(1);
      expect(confirm.isOpen()).to.equal(false);
      expect(confirm.opened).to.have.length(1);
      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message: NOT_JSON });
      expect(events.status.map(s => s.text)).to.deep.equal([CHECKING, CHECKING, NOT_JSON]);
      expect(r.calls.dispatched).to.deep.equal([]);
      expect(announced).to.deep.equal([NOT_JSON]);
    });

    it('DS25: a panel replay arriving while another compares waits for it, then proceeds', async () => {
      const held = heldComparison();
      const confirm = fakeConfirm(true);
      const r = await rig({ confirm, deps: held.deps });
      const events = recordEvents(r.session);

      const first = r.session.replay(coachDoc(), {}, PANEL, 'panel');
      await settle();
      expect(held.gates).to.have.length(1);
      const second = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await settle();
      expect(events.status.map(s => s.text)).to.deep.equal([CHECKING, COMPARING]);
      held.gates[0].resolve();
      const firstResult = await first;
      const secondResult = await second;

      expect(firstResult).to.include({ ok: true, applied: 1, total: 1 });
      expect(secondResult).to.include({ ok: true, applied: 2, total: 2 });
      expect(events.status.map(s => s.text).indexOf(CHECKING, 1)).to.equal(3);
      expect(r.calls.dispatched.map(a => a.type)).to.deep.equal(['DEV_RESTORE_POSITION', 'DEV_RESTORE_POSITION']);
    });

    it('DS25: a panel replay waiting for one that fails while comparing still proceeds', async () => {
      const failed = new Error('pause failed');
      const r = await rig({
        deps: { yieldEvery: 0, analyzeStep: () => placementStep(2), pause: () => Promise.reject(failed) },
      });

      const first = r.session.replay(coachDoc(), {}, PANEL, 'panel');
      let rejected = null;
      first.catch(err => { rejected = err; });
      await settle();
      const second = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      const result = await second;

      expect(rejected).to.equal(failed);
      expect(result).to.include({ ok: true, applied: 2 });
    });

    it('a panel replay waiting behind another is superseded by a newer panel replay', async () => {
      const held = heldComparison();
      const r = await rig({ deps: held.deps });

      const first = r.session.replay(coachDoc(), {}, PANEL, 'panel');
      await settle();
      const waiting = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      const newest = r.session.replay(twoActionDoc(), { stopAfter: 1 }, PANEL, 'panel');
      expect(await waiting).to.deep.equal({ ok: false, reason: 'declined', message: DECLINED });
      held.gates[0].resolve();
      await first;

      expect(await newest).to.include({ ok: true, applied: 1 });
      expect(r.calls.dispatched.map(a => a.type)).to.deep.equal(['DEV_RESTORE_POSITION', 'DEV_RESTORE_POSITION']);
    });

    const flags = api({ replace: true, discardHistory: true });

    it('DS26: an API replay while a panel replay is checking fails with busy', async () => {
      const held = heldChecks();
      const r = await rig({ deps: { checkPuzzles: held.checkPuzzles } });
      const first = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      expect(await r.session.replay(twoActionDoc(), {}, flags, 'api')).to.deep.equal(BUSY);
      held.releaseAll();
      expect(await first).to.include({ ok: true });
    });

    it('DS26: an API replay while a panel replay awaits its confirmation fails with busy, and the dialog stays open', async () => {
      const confirm = fakeConfirm();
      const r = await rig({ confirm });
      withProgress(r);
      const first = r.session.replay(twoActionDoc(), {}, PANEL, 'panel');
      await settle();

      expect(await r.session.replay(twoActionDoc(), {}, flags, 'api')).to.deep.equal(BUSY);
      expect(confirm.isOpen()).to.equal(true);
      confirm.answer(true);
      expect(await first).to.include({ ok: true });
    });

    it('DS26: an API replay while another API replay compares fails with busy', async () => {
      const held = heldComparison();
      const r = await rig({ deps: held.deps });
      const first = r.session.replay(coachDoc(), {}, flags, 'api');
      await settle();

      expect(await r.session.replay(twoActionDoc(), {}, flags, 'api')).to.deep.equal(BUSY);
      held.gates[0].resolve();
      expect(await first).to.include({ ok: true });
    });

    it('DS26: an API replay while another API replay is checking fails with busy', async () => {
      const held = heldChecks();
      const r = await rig({ deps: { checkPuzzles: held.checkPuzzles } });
      const first = r.session.replay(twoActionDoc(), {}, flags, 'api');

      expect(await r.session.replay(twoActionDoc(), {}, flags, 'api')).to.deep.equal(BUSY);
      held.releaseAll();
      expect(await first).to.include({ ok: true });
    });

    it('DS26: a panel replay during an API replay is not allowed to supersede it and waits', async () => {
      const held = heldChecks();
      const r = await rig({ deps: { checkPuzzles: held.checkPuzzles } });
      const first = r.session.replay(twoActionDoc(), {}, flags, 'api');
      const second = r.session.replay(twoActionDoc(), { stopAfter: 1 }, PANEL, 'panel');
      await settle();

      expect(held.gates).to.have.length(1);
      held.releaseAll();
      expect(await first).to.include({ ok: true, applied: 2 });
      await settle();
      held.releaseAll();
      expect(await second).to.include({ ok: true, applied: 1 });
    });
  });

  // ── Seeded generation ────────────────────────────────────────────────────

  describe('generate: arguments, progress and the fallback policy', () => {
    const INVALID_TIER = { ok: false, reason: 'invalid-tier', message: 'Tier must be one of: kiddie, easy, medium, hard, expert, diabolical, nightmare.' };
    const INVALID_SEED = { ok: false, reason: 'invalid-seed', message: 'Seed must be a whole number from 0 to 4294967295.' };

    it('DS31: an API tier in any letter case is accepted and passed on in lower case', async () => {
      const r = await rig();

      await r.session.generate('NIGHTMARE', 1, API);

      expect(r.calls.generated[0]).to.include({ tier: 'nightmare', seed: 1 });
    });

    it('DS31: an unknown tier fails with invalid-tier, unannounced through the API', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.generate('bogus', 1, API));

      expect(result).to.deep.equal(INVALID_TIER);
      expect(r.calls.generated).to.deep.equal([]);
      expect(announced).to.deep.equal([]);
    });

    it('DS31: a panel tier is accepted', async () => {
      const r = await rig();

      await r.session.generate('hard', '5', PANEL);

      expect(r.calls.generated[0]).to.include({ tier: 'hard', seed: 5 });
    });

    for (const [seed, value] of [['0', 0], ['4294967295', 4294967295], [' 42 ', 42], [42, 42], [0, 0]]) {
      it(`DS32: seed ${JSON.stringify(seed)} is accepted as ${value}`, async () => {
        const r = await rig();

        await r.session.generate('easy', seed, API);

        expect(r.calls.generated[0].seed).to.equal(value);
      });
    }

    const invalidSeeds = ['', '4294967296', '-1', '+1', '1.0', '1e3', '0x10', '12345678901', 'abc', 1.5, -1, 4294967296, NaN, null, undefined];
    for (const seed of invalidSeeds) {
      it(`DS32: seed ${typeof seed === 'string' ? JSON.stringify(seed) : String(seed)} fails with invalid-seed`, async () => {
        const r = await rig();

        expect(await r.session.generate('easy', seed, API)).to.deep.equal(INVALID_SEED);
        expect(r.calls.generated).to.deep.equal([]);
      });
    }

    it('validateGenerateArgs checks the tier before the seed', () => {
      expect(validateGenerateArgs('bogus', 'bogus')).to.deep.equal(INVALID_TIER);
    });

    it('validateGenerateArgs returns the normalised tier and seed', () => {
      expect(validateGenerateArgs('Easy', ' 7 ')).to.deep.equal({ ok: true, tier: 'easy', seed: 7 });
    });

    it('a panel seed validation error is announced', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.generate('easy', 'x', PANEL));

      expect(result).to.deep.equal(INVALID_SEED);
      expect(announced).to.deep.equal([INVALID_SEED.message]);
    });

    it('DS33: over progress the panel asks first; declining generates nothing and is announced', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withProgress(r);
      let started = false;

      const { result, announced } = await announcedBy(() =>
        r.session.generate('easy', 1, { ask: true, onStart: () => { started = true; } }));

      expect(confirm.opened).to.deep.equal([
        { title: 'Generate from this seed?', body: 'Your current progress will be lost.', confirmLabel: 'Generate' },
      ]);
      expect(result).to.deep.equal({ ok: false, reason: 'declined', message: NOT_GENERATED });
      expect(r.calls.generated).to.deep.equal([]);
      expect(started).to.equal(false);
      expect(announced).to.deep.equal([NOT_GENERATED]);
    });

    it('over progress a confirmed panel run starts, calling onStart first', async () => {
      const r = await rig({ confirm: fakeConfirm(true) });
      withProgress(r);
      const order = [];
      r.session.generate('easy', 1, { ask: true, onStart: () => order.push('onStart') });
      await settle();

      expect(r.calls.generated).to.have.length(1);
      expect(order).to.deep.equal(['onStart']);
    });

    it('DS33: over progress the API without replace fails with needs-replace before generating, unannounced', async () => {
      const r = await rig();
      withProgress(r);
      const before = r.snapshot();

      const { result, announced } = await announcedBy(() => r.session.generate('easy', 1, api({ replace: 'yes' })));

      expect(result).to.deep.equal({ ok: false, reason: 'needs-replace', message: `${NOT_GENERATED} ${PASS_REPLACE}` });
      expect(r.calls.generated).to.deep.equal([]);
      expect(r.snapshot()).to.equal(before);
      expect(announced).to.deep.equal([]);
    });

    it('over progress the API with replace: true generates', async () => {
      const r = await rig();
      withProgress(r);

      await r.session.generate('easy', 1, api({ replace: true }));

      expect(r.calls.generated).to.have.length(1);
    });

    for (const [label, intent, fallback, budget] of [
      ['the panel', PANEL, 'ask', undefined],
      ['the API with acceptFallback: true', api({ acceptFallback: true, budget: 3 }), 'accept', 3],
      ['the API without acceptFallback', api({ acceptFallback: 1 }), 'refuse', undefined],
    ]) {
      it(`DS34: ${label} asks for fallback '${fallback}' and passes the budget on`, async () => {
        const r = await rig();

        await r.session.generate('nightmare', 9, intent);

        expect(r.calls.generated).to.deep.equal([{ tier: 'nightmare', seed: 9, fallback, budget }]);
      });
    }
  });

  describe('generate: outcomes', () => {
    /** A generated puzzle as the pipeline delivers it. */
    const generated = (difficulty, gen) => ({
      ...makePuzzle({ difficulty, source: 'generated' }),
      gen: { requestedTier: 'easy', seed: 26, seedBy: 'developer', budget: 30, attempts: 30, fallback: true,
        rejected: { unsolved: 0, wrongTier: 30, byTier: { hard: 30 } }, ...gen },
    });
    const diagnosticsOf = puzzle => ({
      seed: puzzle.gen.seed, seedBy: 'developer', requestedTier: puzzle.gen.requestedTier, tier: puzzle.difficulty,
      fallback: puzzle.gen.fallback, attempts: puzzle.gen.attempts, budget: puzzle.gen.budget, rejected: puzzle.gen.rejected,
      techniqueProfile: [{ technique: 'Naked Single', count: 1 }],
    });
    const plain = generated('hard', { requestedTier: 'hard', fallback: false, attempts: 3 });
    const fellBack = generated('hard');
    const unrated = generated('unrated', { requestedTier: 'expert', seed: 223, attempts: 2, budget: 1 });
    const best = generated('easy', { requestedTier: 'nightmare', seed: 1, budget: 3, attempts: 3 });
    const bestUnrated = generated('unrated', { requestedTier: 'nightmare', seed: 223, budget: 1, attempts: 2 });

    const outcomes = [
      ['loaded at the requested tier', 'hard', 26, { status: 'loaded', puzzle: plain, fallback: false },
        { ok: true, requestedTier: 'hard', tier: 'hard', seed: 26, fallback: false, diagnostics: diagnosticsOf(plain),
          message: 'Generated from seed 26: Hard puzzle.' }],
      ['loaded after a fallback', 'easy', 26, { status: 'loaded', puzzle: fellBack, fallback: true },
        { ok: true, requestedTier: 'easy', tier: 'hard', seed: 26, fallback: true, diagnostics: diagnosticsOf(fellBack),
          message: 'Generated from seed 26: Hard puzzle. No Easy puzzle was found within the budget.' }],
      ['loaded as Unrated', 'expert', 223, { status: 'loaded', puzzle: unrated, fallback: true },
        { ok: true, requestedTier: 'expert', tier: 'unrated', seed: 223, fallback: true, diagnostics: diagnosticsOf(unrated),
          message: 'Generated from seed 223: Unrated puzzle. No Expert puzzle was found within the budget.' }],
      ['refused, rated', 'nightmare', 1, { status: 'needs-accept-fallback', puzzle: best },
        { ok: false, reason: 'needs-accept-fallback', requestedTier: 'nightmare', tier: 'easy', seed: 1, diagnostics: diagnosticsOf(best),
          message: 'No Nightmare puzzle found. The best the generator found is rated Easy. Pass acceptFallback: true to play it.' }],
      ['refused, Unrated', 'nightmare', 223, { status: 'needs-accept-fallback', puzzle: bestUnrated },
        { ok: false, reason: 'needs-accept-fallback', requestedTier: 'nightmare', tier: 'unrated', seed: 223, diagnostics: diagnosticsOf(bestUnrated),
          message: 'No Nightmare puzzle found. The best the generator found can\'t be rated. Pass acceptFallback: true to play it.' }],
      ['fallback declined', 'nightmare', 1, { status: 'fallback-declined' }, { ok: false, reason: 'declined', message: NOT_GENERATED }],
      ['cancelled', 'nightmare', 1, { status: 'cancelled' }, { ok: false, reason: 'cancelled', message: 'Generation cancelled.' }],
      ['replaced', 'nightmare', 1, { status: 'replaced' },
        { ok: false, reason: 'cancelled', message: 'Generation replaced by another request.' }],
      ['failed', 'nightmare', 1, { status: 'failed' }, { ok: false, reason: 'failed', message: 'The puzzle couldn\'t be generated.' }],
    ];
    for (const [label, tier, seed, outcome, expected] of outcomes) {
      it(`DS35: ${label} maps to ${expected.ok ? 'ok' : expected.reason} with its message`, async () => {
        const r = await rig();
        r.outcome = outcome;

        expect(await r.session.generate(tier, seed, API)).to.deep.equal(expected);
      });

      for (const [caller, intent] of [['panel', PANEL], ['API', API]]) {
        it(`DS36: ${label} from the ${caller} is announced once`, async () => {
          const r = await rig();
          r.outcome = outcome;

          const { announced } = await announcedBy(() => r.session.generate(tier, seed, intent));

          expect(announced).to.deep.equal([expected.message]);
        });
      }
    }

    it('diagnostics recompute the technique profile when the puzzle carries no trace', async () => {
      const r = await rig();
      const puzzle = { ...plain, solveTrace: [] };
      r.outcome = { status: 'loaded', puzzle, fallback: false };

      const result = await r.session.generate('hard', 26, API);

      expect(result.diagnostics).to.deep.equal(generationDiagnostics(puzzle, givens => rate(givens).trace));
      expect(result.diagnostics.techniqueProfile).to.not.deep.equal([]);
    });
  });

  describe('generate: through the real foreground generator and pipeline', function () {
    this.timeout(60000);

    let warn;
    beforeEach(() => { warn = console.warn; console.warn = () => {}; });
    afterEach(() => { console.warn = warn; });

    it('a seed reproduces the same puzzle and diagnostics, loaded as a new game', async () => {
      const r = await rig({ foreground: {} });

      const first = await r.session.generate('kiddie', 1, API);
      const firstPuzzle = r.gs.getState().puzzle;
      const second = await r.session.generate('kiddie', 1, API);

      expect(first).to.include({ ok: true, tier: 'kiddie', fallback: false, message: 'Generated from seed 1: Kiddie puzzle.' });
      expect(firstPuzzle.id).to.equal('2fe4fb4f');
      expect(second).to.deep.equal(first);
      expect(r.gs.getState().puzzle.id).to.equal('2fe4fb4f');
      expect(first.diagnostics).to.include({ seed: 1, seedBy: 'developer', requestedTier: 'kiddie', tier: 'kiddie' });
      expect(r.written).to.deep.equal([]);
    });

    it('an API run refusing a Nightmare fallback loads nothing and clears the busy state', async () => {
      const r = await rig({ foreground: { saved: 'nightmare' } });
      r.gs.dispatch(LOAD());
      const board = Array.from(r.gs.getState().pen).join('');

      const result = await r.session.generate('nightmare', 1, api({ budget: 3 }));

      expect(result).to.include({ ok: false, reason: 'needs-accept-fallback', tier: 'easy' });
      expect(r.gs.getState().generating).to.equal(false);
      expect(Array.from(r.gs.getState().pen).join('')).to.equal(board);
      expect(r.written).to.deep.equal([]);
    });

    it('an API run accepting a Nightmare fallback loads it and saves its tier as the preference', async () => {
      const r = await rig({ foreground: { saved: 'nightmare' } });

      const result = await r.session.generate('nightmare', 1, api({ budget: 3, acceptFallback: true }));

      expect(result).to.include({
        ok: true, tier: 'easy', fallback: true,
        message: 'Generated from seed 1: Easy puzzle. No Nightmare puzzle was found within the budget.',
      });
      expect(r.gs.getState().puzzle.difficulty).to.equal('easy');
      expect(r.written).to.deep.equal(['easy']);
    });

    for (const [choice, expected] of [
      ['Play', { ok: true, tier: 'easy', fallback: true }],
      ['Cancel', { ok: false, reason: 'declined', message: NOT_GENERATED }],
    ]) {
      it(`a panel-style run shows the honest-fallback dialog; ${choice} gives ${expected.ok ? 'the puzzle' : 'declined'}`, async () => {
        const r = await rig({ foreground: { saved: 'nightmare' } });

        const pending = r.session.generate('nightmare', 1, { ask: true, budget: 3 });
        await waitUntil(() => r.dialogs.length === 1);
        const dialog = r.dialogs[0];
        if (choice === 'Play') dialog.onConfirm();
        else dialog.onCancel();
        const result = await pending;

        expect(dialog).to.include({ title: 'No Nightmare puzzle found', confirmLabel: 'Play Easy' });
        expect(result).to.include(expected);
        expect(r.written).to.deep.equal(choice === 'Play' ? ['easy'] : []);
      });
    }

    for (const [tier, seed] of [['expert', 223], ['expert', 307]]) {
      it(`${tier} seed ${seed} at budget 1 loads Unrated without a prompt and leaves the preference`, async () => {
        const r = await rig({ foreground: { saved: 'medium' } });

        const result = await r.session.generate(tier, seed, api({ budget: 1 }));

        expect(result).to.include({
          ok: true, tier: 'unrated', fallback: true,
          message: `Generated from seed ${seed}: Unrated puzzle. No Expert puzzle was found within the budget.`,
        });
        expect(result.diagnostics).to.include({ tier: 'unrated', fallback: true, budget: 1 });
        expect(r.dialogs).to.deep.equal([]);
        expect(r.written).to.deep.equal([]);
      });
    }

    for (const [tier, seed] of [['nightmare', 223], ['diabolical', 307]]) {
      it(`${tier} seed ${seed} at budget 1 refused through the API cannot be rated`, async () => {
        const r = await rig({ foreground: {} });

        const result = await r.session.generate(tier, seed, api({ budget: 1 }));

        const label = tier === 'nightmare' ? 'Nightmare' : 'Diabolical';
        expect(result).to.include({
          ok: false, reason: 'needs-accept-fallback', tier: 'unrated',
          message: `No ${label} puzzle found. The best the generator found can't be rated. Pass acceptFallback: true to play it.`,
        });
      });
    }

    it('nightmare seed 307 at budget 1 accepted through the API loads Unrated and leaves the preference', async () => {
      const r = await rig({ foreground: { saved: 'nightmare' } });

      const result = await r.session.generate('nightmare', 307, api({ budget: 1, acceptFallback: true }));

      expect(result).to.include({ ok: true, tier: 'unrated', fallback: true });
      expect(r.gs.getState().puzzle.difficulty).to.equal('unrated');
      expect(r.written).to.deep.equal([]);
    });

    it('diabolical seed 223 at budget 1 through the panel offers Play Unrated, which leaves the preference', async () => {
      const r = await rig({ foreground: { saved: 'diabolical' } });

      const pending = r.session.generate('diabolical', 223, { ask: true, budget: 1 });
      await waitUntil(() => r.dialogs.length === 1);
      r.dialogs[0].onConfirm();
      const result = await pending;

      expect(r.dialogs[0].confirmLabel).to.equal('Play Unrated');
      expect(result).to.include({ ok: true, tier: 'unrated', fallback: true });
      expect(r.written).to.deep.equal([]);
    });
  });

  // ── Logging switches ─────────────────────────────────────────────────────

  describe('setLogging', () => {
    it('DS37: a category in another letter case fails with invalid-category and changes nothing', async () => {
      const r = await rig();

      expect(r.session.setLogging('Generation', true)).to.deep.equal({
        ok: false, reason: 'invalid-category', message: 'Logging category must be one of: generation, swallowed, actions.',
      });
      expect(r.log.get().generation).to.equal(true);
    });

    for (const value of [1, 0, 'on', undefined]) {
      it(`DS37: the value ${JSON.stringify(value)} fails with invalid-value`, async () => {
        const r = await rig();

        expect(r.session.setLogging('generation', value)).to.deep.equal({
          ok: false, reason: 'invalid-value', message: 'Logging can only be set to true or false.',
        });
      });
    }

    for (const category of ['bogus', 'toString', undefined]) {
      it(`DS37: category ${JSON.stringify(category)} fails with invalid-category before the value is checked`, async () => {
        const r = await rig();

        expect(r.session.setLogging(category, 1).reason).to.equal('invalid-category');
      });
    }

    it('DS37: a change is applied, saved, announced, and returns all three switches', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.setLogging('generation', false));

      expect(result).to.deep.equal({
        ok: true, category: 'generation', on: false, logging: { generation: false, swallowed: true, actions: false },
        message: 'Generation worker logging off.',
      });
      expect(r.saved.get('sudoku.dev.logging.v1')).to.deep.equal({ generation: false, swallowed: true, actions: false });
      expect(announced).to.deep.equal(['Generation worker logging off.']);
    });

    it('DS37: setting a switch to its current state succeeds with the same wording, unannounced', async () => {
      const r = await rig();

      const { result, announced } = await announcedBy(() => r.session.setLogging('actions', false));

      expect(result).to.deep.equal({
        ok: true, category: 'actions', on: false, logging: { generation: true, swallowed: true, actions: false },
        message: 'Action trace logging off.',
      });
      expect(announced).to.deep.equal([]);
    });

    it('turning a switch on uses its label and "on"', async () => {
      const r = await rig();

      expect(r.session.setLogging('swallowed', false).message).to.equal('Swallowed exceptions logging off.');
      expect(r.session.setLogging('swallowed', true).message).to.equal('Swallowed exceptions logging on.');
    });
  });

  // ── Post-review fixes (fspec D-35 f, review M5) ──────────────────────────

  describe('D-35 f: counts of 1,000 or more carry a thousands separator', () => {
    /** 1,234 recorded actions: the game has progress (KIDDIE, r1c3 filled) then 1,231 selections. */
    function withThousandsOfActions(r) {
      withProgress(r);
      for (let i = 0; i < 1231; i++) r.gs.dispatch(sel(i % 2 === 0 ? 3 : 5));
    }

    /** A document of 1,234 selections. */
    const thousandActionDoc = () => sessionDoc({ actions: Array.from({ length: 1234 }, (_, i) => sel(i % 2 === 0 ? 3 : 5)) });

    it('in the replay dialog body for progress and history', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withThousandsOfActions(r);

      await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      expect(confirm.opened[0].body).to.equal(
        'Your current progress will be lost, and the recorded history (1,234 actions, 0 errors) will be discarded.');
    });

    it('in the Clear history dialog body', async () => {
      const confirm = fakeConfirm(false);
      const r = await rig({ confirm });
      withThousandsOfActions(r);

      await r.session.clearHistory(PANEL);

      expect(confirm.opened[0].body).to.equal(
        'The recorded history (1,234 actions, 0 errors) will be discarded. Your game is not affected.');
    });

    it('in an API message, while the result\'s counts stay plain numbers', async () => {
      const r = await rig();
      withThousandsOfActions(r);

      const refused = r.session.clearHistory(API);
      const cleared = r.session.clearHistory(api({ discardHistory: true }));

      expect(refused.message).to.equal(
        'History not cleared. Pass discardHistory: true to discard the recorded history (1,234 actions, 0 errors).');
      expect(cleared.discarded).to.deep.equal({ actions: 1234, errors: 0 });
    });

    it('in the replay outcome and status line, with applied and total plain numbers', async () => {
      const r = await rig();
      const events = recordEvents(r.session);

      const result = await r.session.replay(thousandActionDoc(), {}, API, 'api');

      const message = 'Session replayed: 1,234 of 1,234 actions. No computed results to compare.';
      expect(result.message).to.equal(message);
      expect(events.status.at(-1)).to.deep.equal({ text: message, error: false });
      expect([result.applied, result.total, result.report.applied]).to.deep.equal([1234, 1234, 1234]);
    });

    it('in the copy outcome', async () => {
      const r = await rig();
      withThousandsOfActions(r);

      expect((await r.session.copySession()).message).to.equal('Session copied: 1,234 actions, 0 errors.');
    });

    it('state() reports the recorder counts as plain numbers', async () => {
      const r = await rig();
      withThousandsOfActions(r);

      expect(r.session.state().recorder.actions).to.equal(1234);
    });

    it('seeds stay plain in the generate message', async () => {
      const r = await rig({ foreground: { saved: 'medium' } });

      const result = await r.session.generate('kiddie', 1234567, API);

      expect(result.message).to.match(/^Generated from seed 1234567: /);
      expect(result.seed).to.equal(1234567);
    });
  });

  describe('a seeded puzzle that fails to load (post-review fix)', () => {
    it('generate returns failed with the generator-failure message instead of hanging', async () => {
      // A delivered puzzle that cannot be read: starting it throws inside the dispatch.
      const unreadable = { id: 'bad', difficulty: 'hard', get givens() { throw new Error('load failed'); } };
      const r = await rig({ foreground: { requestPuzzle: async () => ({ puzzle: unreadable, fallback: false }) } });
      const error = console.error;
      console.error = () => {};
      let result;
      try {
        result = await Promise.race([
          r.session.generate('hard', 5, API),
          new Promise(resolve => setTimeout(() => resolve('still pending'), 2000)),
        ]);
      } finally {
        console.error = error;
      }

      expect(result).to.deep.equal({ ok: false, reason: 'failed', message: 'The puzzle couldn\'t be generated.' });
      expect(r.gs.getState().generating).to.equal(false);
    });
  });

  describe('review M5: an exception while checking a document', () => {
    const NOT_CHECKED = 'This session can\'t be replayed. The session couldn\'t be checked.';

    it('is reported once on the diagnostics channel as swallowed at replay.prepare', async () => {
      const error = new Error('check worker gone');
      const r = await rig({ deps: { checkPuzzles: () => Promise.reject(error) } });
      const swallowed = [];
      diagnostics.on('swallowed', e => swallowed.push(e));

      await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      expect(swallowed).to.deep.equal([{ where: 'replay.prepare', error }]);
    });

    it('leaves the user-facing rejection message unchanged', async () => {
      const r = await rig({ deps: { checkPuzzles: () => { throw new Error('boom'); } } });

      const result = await r.session.replay(twoActionDoc(), {}, PANEL, 'panel');

      expect(result).to.deep.equal({ ok: false, reason: 'rejected', message: NOT_CHECKED });
    });

    it('a rejection without an exception reports nothing as swallowed', async () => {
      const r = await rig();
      const swallowed = [];
      diagnostics.on('swallowed', e => swallowed.push(e));

      await r.session.replay('{', {}, PANEL, 'panel');

      expect(swallowed).to.deep.equal([]);
    });
  });
});

/** Polls `predicate` across macrotasks; a seeded run resolves in a later task. */
async function waitUntil(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await settle();
  }
}
