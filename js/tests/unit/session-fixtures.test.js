/**
 * @fileoverview Regression fixtures (tspec-debug-instrumentation §7, FX):
 * session documents recorded from the real app, replayed against the current
 * code through the fixture helper.
 *
 * `format-v1-baseline.json` is the deliberately broad, frozen format-1
 * document (FX1, FX4, FX6, FX7, FX8). `first-boot-null-start.json` starts at a
 * first-ever boot with no puzzle (FX9). `coach-in-progress.json` ends inside a
 * coach session (FX2, FX3) and `unrated-then-medium.json` plays an Unrated
 * puzzle (FX5). Cases with no fixture file of their own are asserted on these
 * documents through a stop value or an edit made in memory. Fixture files are
 * never modified.
 */

import { replayFixture, loadSessionFixture } from '../helpers/replayFixture.js';
import { prepare, run } from '../../dev/replay.js';
import { KINDS, encodePosition } from '../../dev/sessionCodec.js';
import { createMachine, applyEntry } from '../../dev/machine.js';
import { checkGivens } from '../../generator/loadPuzzle.js';

/** SHA-256 of format-v1-baseline.json, frozen at this release (aspec §5.5, fspec §9.2). */
const BASELINE_SHA256 = 'd845b7bca1cac9a19ba7f70a7a6d342811d17f0326c5a0c3365679f357b66a52';

const UNRATED_REASON = 'hints and coach are unavailable on an Unrated puzzle';
const BUSY_CLEARED = 'Replay ended during a puzzle generation; the busy state was cleared.';
const START_NOT_COMPARED = 'the position before it is not in the document';

const checkPuzzles = puzzles => puzzles.map(({ givens, solution }) => checkGivens(givens, solution));

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** The final position of a fixture replayed to `stopAfter`, for parts `state()` does not show. */
async function finalPosition(text, stopAfter) {
  const prepared = await prepare(text, { checkPuzzles, stopAfter });
  return run(prepared.doc, prepared.n).position;
}

/** 1-based number of the first action matching `test`. */
const actionNumber = (doc, test) => doc.actions.findIndex(item => test(item.action)) + 1;

/** 1-based number of the last action matching `test`. */
const lastActionNumber = (doc, test) => doc.actions.findLastIndex(item => test(item.action)) + 1;

const withoutRecorder = ({ recorder, ...rest }) => rest;

/**
 * The document as a recorder at a smaller capacity would have exported it:
 * the first `k` actions folded into the starting position (fspec §3.2).
 */
function advancedBy(doc, k) {
  const machine = createMachine(doc.start);
  for (const item of doc.actions.slice(0, k)) applyEntry(machine, { a: item.action, f: item.then });
  return {
    ...doc,
    start: encodePosition(machine.getState()),
    actions: doc.actions.slice(k),
    errors: doc.errors.filter(e => e.afterAction > k).map(e => ({ ...e, afterAction: e.afterAction - k })),
  };
}

describe('session fixtures', () => {
  describe('FX1: format-v1-baseline.json', () => {
    let text;
    let doc;
    let result;
    before(async () => {
      text = await loadSessionFixture('format-v1-baseline.json');
      doc = JSON.parse(text);
      result = await replayFixture(text);
    });

    it('is frozen: its SHA-256 is pinned', async () => {
      expect(await sha256(text), 'format-v1-baseline.json is frozen and must never be edited; '
        + 'record a new fixture file instead').to.equal(BASELINE_SHA256);
    });

    it('replays all 480 of its 480 actions', () => {
      expect([result.applied, result.total]).to.deep.equal([480, 480]);
    });

    it('ends on the pinned board, won, with no pencil marks', () => {
      expect(result.state.text).to.equal([
        '9 6 7 | 8 4 3 | 1 2 5',
        '8 4 3 | 5 2 1 | 9 6 7',
        '5 2 1 | 6 9 7 | 3 8 4',
        '------+-------+------',
        '7 9 6 | 2 8 4 | 5 1 3',
        '2 5 8 | 1 3 9 | 4 7 6',
        '1 3 4 | 7 5 6 | 8 9 2',
        '------+-------+------',
        '3 7 5 | 9 1 2 | 6 4 8',
        '4 1 2 | 3 6 8 | 7 5 9',
        '6 8 9 | 4 7 5 | 2 3 1',
      ].join('\n'));
      expect(result.state.won).to.equal(true);
      expect(result.state.pencilMarks).to.deep.equal(Array.from({ length: 81 }, () => []));
    });

    it('has no divergences in 41 computed results (38 coach, 3 hint); the Unrated hint is not compared', () => {
      expect(result.report.divergences).to.deep.equal([]);
      expect(result.report.compared).to.equal(41);
      expect(result.report.counts).to.deep.equal({ coach: 38, hint: 3 });
      expect(result.report.notCompared).to.deep.equal([{ action: 349, kind: 'hint', reason: UNRATED_REASON }]);
    });

    it('carries its four recorded errors, no notes, and is not stopped', () => {
      expect(result.report.errors.recorded.map(({ kind, afterAction, count }) => [kind, afterAction, count]))
        .to.deep.equal([['uncaught', 98, 1], ['uncaught', 98, 2], ['rejection', 98, 1], ['listener', 99, 1]]);
      expect(result.report.errors.recorded[0].message).to.equal('Unrecordable action: NOT_A_RECORDABLE_ACTION');
      expect(result.report.errors.raised).to.deep.equal([]);
      expect(result.report.notes).to.deep.equal([]);
      expect(result.report.stopped).to.equal(null);
    });

    it('contains every action kind, as an action or a follow-up', () => {
      const present = new Set(doc.actions.flatMap(item => [item.action, ...(item.then ?? [])]).map(a => a.type));

      expect(Object.keys(KINDS).filter(kind => !present.has(kind))).to.deep.equal([]);
      expect(Object.keys(KINDS)).to.have.length(33);
    });

    it('contains ignored actions and a difficulty change carrying its generation start', () => {
      const change = doc.actions.find(item => item.action.type === 'CHANGE_DIFFICULTY');

      expect(doc.actions.some(item => item.noChange === true)).to.equal(true);
      expect(change.then.map(a => a.type)).to.deep.equal(['SET_GENERATING']);
    });

    it('contains each kind of captured error, one of them repeated', () => {
      expect([...new Set(doc.errors.map(e => e.kind))].sort()).to.deep.equal(['listener', 'rejection', 'uncaught']);
      expect(doc.errors.some(e => e.count > 1)).to.equal(true);
    });

    it('contains placement and elimination coach steps and a "no technique" answer', () => {
      const steps = doc.actions.filter(item => item.action.type === 'COACH_START').map(item => item.action.result.type);

      expect([...new Set(steps)].sort()).to.deep.equal(['elimination', 'placement']);
      expect(doc.actions.some(item => item.action.type === 'COACH_NO_TECHNIQUE')).to.equal(true);
    });

    it('states the starting puzzle\'s seed and requested tier at the top level', () => {
      expect([doc.seed, doc.tier]).to.deep.equal([3682070827, 'easy']);
      expect([doc.start.puzzle.gen.seed, doc.start.puzzle.gen.requestedTier]).to.deep.equal([doc.seed, doc.tier]);
    });
  });

  it('FX2: coach-in-progress.json ends inside the coach session with the recorded step', async () => {
    const text = await loadSessionFixture('coach-in-progress.json');
    const doc = JSON.parse(text);
    const lastStep = doc.actions.filter(item => item.action.type === 'COACH_START').at(-1).action.result;

    const { state } = await replayFixture(text);
    const position = await finalPosition(text);

    expect(state.coachActive).to.equal(true);
    expect(position.coachSession.step).to.deep.equal(lastStep);
  });

  it('FX3: coach-in-progress.json stopped at its first coached placement ends in a recap', async () => {
    const text = await loadSessionFixture('coach-in-progress.json');
    const firstPlacement = actionNumber(JSON.parse(text), a => a.type === 'PEN_ENTER');

    const position = await finalPosition(text, firstPlacement);

    expect(position.coachSession.recap).to.equal('normal');
  });

  it('FX4: format-v1-baseline.json ends on a win with no undo available', async () => {
    const { state } = await replayFixture(await loadSessionFixture('format-v1-baseline.json'));

    expect(state.won).to.equal(true);
    expect(state.undoAvailable).to.equal(false);
  });

  describe('FX5: unrated-then-medium.json', () => {
    it('lists the coach and hint requests on the Unrated puzzle as not compared', async () => {
      const { report } = await replayFixture(await loadSessionFixture('unrated-then-medium.json'));

      expect(report.notCompared).to.deep.equal([
        { action: 26, kind: 'hint', reason: UNRATED_REASON },
        { action: 27, kind: 'coach', reason: UNRATED_REASON },
      ]);
      expect(report.divergences).to.deep.equal([]);
    });

    it('stopped before the Medium puzzle, shows no hint count for the Unrated puzzle', async () => {
      const text = await loadSessionFixture('unrated-then-medium.json');
      const mediumLoad = actionNumber(JSON.parse(text), a => a.type === 'PUZZLE_LOADED' && a.puzzle.tier === 'medium');

      const { state } = await replayFixture(text, { stopAfter: mediumLoad - 1 });

      expect(state.puzzle.tier).to.equal('unrated');
      expect(state.hintsRemaining).to.equal(null);
    });
  });

  it('FX6: the baseline with one coach technique and one hint digit edited gives exactly those two divergences', async () => {
    const doc = JSON.parse(await loadSessionFixture('format-v1-baseline.json'));
    // The last coached step and the last hint: nothing compared after them depends on the edits.
    const coachAt = lastActionNumber(doc, a => a.type === 'COACH_START');
    const hintAt = lastActionNumber(doc, a => a.type === 'HINT' && a.hint);
    const coach = doc.actions[coachAt - 1];
    const hint = doc.actions[hintAt - 1];
    const recordedTechnique = coach.action.result.technique;
    const recordedDigit = hint.action.hint.digit;
    coach.action.result.technique = 'Edited Technique';
    hint.action.hint.digit = recordedDigit % 9 + 1;

    const { report } = await replayFixture(doc);

    expect(report.applied).to.equal(480);
    expect(report.divergences).to.deep.equal([
      {
        action: coachAt, kind: 'coach', time: coach.at, technique: 'Edited Technique',
        differences: [{ part: 'technique', recorded: 'Edited Technique', current: recordedTechnique }],
      },
      {
        action: hintAt, kind: 'hint', time: hint.at, cell: hint.action.hint.cellIndex,
        differences: [{ part: 'digit', recorded: recordedDigit % 9 + 1, current: recordedDigit }],
      },
    ]);
  });

  it('FX7: format-v1-baseline.json stopped at its difficulty change clears the busy state and says so', async () => {
    const text = await loadSessionFixture('format-v1-baseline.json');
    const change = actionNumber(JSON.parse(text), a => a.type === 'CHANGE_DIFFICULTY');

    const { state, report } = await replayFixture(text, { stopAfter: change });

    expect(state.generating).to.equal(false);
    expect(report.notes).to.deep.equal([BUSY_CLEARED]);
  });

  describe('FX8: the baseline as exported at a smaller capacity, mid coach session', () => {
    let doc;
    let advanced;
    before(async () => {
      doc = JSON.parse(await loadSessionFixture('format-v1-baseline.json'));
      // One action into the first coach session: its start carries the session.
      advanced = advancedBy(doc, actionNumber(doc, a => a.type === 'COACH_START'));
    });

    it('starts inside a coach session', () => {
      expect(advanced.start.coach).to.not.equal(null);
    });

    it('lists the starting position\'s coach step as not compared', async () => {
      const { report } = await replayFixture(advanced);

      expect(report.notCompared[0]).to.deep.equal({ action: 0, kind: 'coach', reason: START_NOT_COMPARED });
      expect(report.divergences).to.deep.equal([]);
    });

    it('replays to exactly the position of the full document', async () => {
      const full = await replayFixture(doc);
      const trimmed = await replayFixture(advanced);

      expect(withoutRecorder(trimmed.state)).to.deep.equal(withoutRecorder(full.state));
    });
  });

  describe('FX9: first-boot-null-start.json starts at a first-ever boot with no puzzle', () => {
    it('replays in full', async () => {
      const text = await loadSessionFixture('first-boot-null-start.json');

      const { report, applied, total } = await replayFixture(text);

      expect(JSON.parse(text).start.puzzle).to.equal(null);
      expect(report.stopped).to.equal(null);
      expect([applied, total]).to.deep.equal([183, 183]);
    });

    it('stopped before the first puzzle arrives, is rejected with the no-puzzle message', async () => {
      const text = await loadSessionFixture('first-boot-null-start.json');
      const firstLoad = actionNumber(JSON.parse(text), a => a.type === 'PUZZLE_LOADED');

      let caught = null;
      try {
        await replayFixture(text, { stopAfter: firstLoad - 1 });
      } catch (err) {
        caught = err;
      }

      expect(caught?.message).to.equal(
        'This session can\'t be replayed. It would end before any puzzle is loaded. Choose a later stopping point.');
    });
  });
});
