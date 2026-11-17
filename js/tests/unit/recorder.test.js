/**
 * @fileoverview The session history (tspec-debug-instrumentation RC1–RC33):
 * the dispatch tap, follow-ups, "changed nothing", hints, capacity and the
 * starting position, error entries, the boot merge, export, clear, replay
 * hand-over, `silently`, `mark` / `errorsSince`, and events.
 *
 * A real game store runs with `tap: recorder.tap`; the store collaborator is
 * an in-memory fake that records what it is handed, `now` is a settable
 * clock, and the hint provider is wrapped as `devBoot.wrapHintProvider` does.
 * `open()`'s rejection (RC22b) is handled by `devBoot` and tested there.
 */

import { createRecorder, RECORDER_CAPACITY } from '../../dev/recorder.js';
import { createGameState } from '../../game/state.js';
import { createMachine, applyEntry } from '../../dev/machine.js';
import {
  encodePosition, readDocument, validateActionItem, validatePosition,
} from '../../dev/sessionCodec.js';
import {
  makePuzzle, placementStep, plainPositionDoc, manualTimers, NEARLY_SOLVED, SOLUTION, wrong,
} from '../helpers/codecFixtures.js';

const sel = index => ({ type: 'SELECT_CELL', index });
const pen = digit => ({ type: 'PEN_ENTER', digit });
const LOAD = { type: 'PUZZLE_LOADED', puzzle: makePuzzle() };
const clone = v => structuredClone(v);

/** Records every call; `failWrite` makes `write` throw. */
function fakeStore({ status = 'ok' } = {}) {
  const calls = [];
  return {
    calls,
    failWrite: false,
    onWrite: null,
    write(batch) {
      this.onWrite?.(batch);
      if (this.failWrite) throw new Error('write failed');
      calls.push(['write', clone(batch)]);
    },
    replaceAll(start, entries) { calls.push(['replaceAll', clone(start), clone(entries)]); },
    status: () => status,
  };
}

function fakeLog() {
  const lines = [];
  return { lines, fail: false, action(entry, parts, ms) {
    if (this.fail) throw new Error('log failed');
    lines.push({ entry: clone(entry), parts, ms });
  } };
}

/**
 * A recorder over a fake store and a real game store. Nothing is dispatched;
 * `boot()` runs `bootComplete` and waits for the merge.
 */
function rig({ capacity, opened = Promise.resolve({ status: 'empty' }), hint = () => null,
               store = fakeStore(), log = fakeLog(), clock = () => 0 } = {}) {
  const time = { value: 1000, failNext: 0 };
  const now = () => {
    if (time.failNext > 0 && --time.failNext === 0) throw new Error('clock failed');
    return time.value;
  };
  const recorder = createRecorder({ store, log, opened, capacity, now, clock });
  const gs = createGameState({
    stats: { recordAttemptOnce() {}, recordWin() {} },
    hintProvider: { nextHint: (...args) => { const h = hint(...args); recorder.noteHint(h); return h; } },
    statsSuppressed: () => true,
    tap: recorder.tap,
    timers: manualTimers().timers,
  });
  const boot = async () => {
    recorder.bootComplete(gs);
    await recorder.ready;
  };
  const entries = () => recorder.snapshot().entries;
  const actionTypes = () => entries().filter(e => 'a' in e).map(e => e.a.type);
  return { recorder, gs, store, log, time, boot, entries, actionTypes };
}

/** Run `fn` once, from a `changed` listener, for the first action of `type`. */
function onFirst(gs, type, fn) {
  let done = false;
  gs.on('changed', ({ action }) => {
    if (!done && action.type === type) {
      done = true;
      fn();
    }
  });
}

/** Silences console.error for the duration of `fn`, returning what it logged. */
function quietConsoleError(fn) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    fn();
  } finally {
    console.error = original;
  }
  return logged;
}

const capture = (message, extra = {}) => ({ kind: 'uncaught', message, stack: null, source: null, action: null, ...extra });

describe('dev/recorder.js', () => {
  it('exports the fspec capacity of 5000 entries', () => {
    expect(RECORDER_CAPACITY).to.equal(5000);
  });

  // ── Boot ─────────────────────────────────────────────────────────────────

  it('RC1: nothing is recorded before bootComplete, and no frame is left open', async () => {
    const r = rig();
    onFirst(r.gs, 'SELECT_CELL', () => r.gs.dispatch({ type: 'DESELECT' }));
    r.gs.dispatch(LOAD);
    r.gs.dispatch(sel(2));

    await r.boot();
    r.gs.dispatch(sel(3));

    expect(r.entries()).to.have.length(1);
    expect(r.entries()[0]).to.deep.equal({ seq: 1, t: 1000, a: sel(3) });
  });

  it('RC2: bootComplete fixes the starting position at the live position after the restore burst', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    r.gs.dispatch(sel(2));
    r.gs.dispatch(pen(4));
    r.gs.dispatch({ type: 'DESELECT' });
    const restored = encodePosition(r.gs.getState());

    await r.boot();

    expect(r.recorder.snapshot().start).to.deep.equal(restored);
    expect(r.entries()).to.deep.equal([]);
  });

  // ── Tap ──────────────────────────────────────────────────────────────────

  it('RC3: a top-level action is one entry stamped with now()', async () => {
    const r = rig();
    await r.boot();
    r.time.value = 5000;

    r.gs.dispatch(sel(7));

    expect(r.entries()).to.deep.equal([{ seq: 1, t: 5000, a: sel(7) }]);
  });

  it('RC4: actions dispatched by a listener during an action are its follow-ups, in order', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    onFirst(r.gs, 'SELECT_CELL', () => {
      r.gs.dispatch({ type: 'SET_MODE', mode: 'pencil' });
      r.gs.dispatch({ type: 'TOGGLE_MODE' });
    });

    r.gs.dispatch(sel(2));

    expect(r.entries()).to.have.length(1);
    expect(r.entries()[0].f).to.deep.equal([{ type: 'SET_MODE', mode: 'pencil' }, { type: 'TOGGLE_MODE' }]);
    expect(r.recorder.counts().actions).to.equal(1);
  });

  it('RC5: the reducer\'s own consequences of a winning fill in a coach session are not follow-ups', async () => {
    const r = rig();
    r.gs.dispatch({ type: 'PUZZLE_LOADED', puzzle: makePuzzle({ givens: NEARLY_SOLVED }) });
    for (const cell of [2, 3]) {
      r.gs.dispatch(sel(cell));
      r.gs.dispatch(pen(SOLUTION[cell]));
    }
    r.gs.dispatch({ type: 'COACH_START', result: placementStep(5) });
    r.gs.dispatch(sel(5));
    await r.boot();

    r.gs.dispatch(pen(SOLUTION[5]));

    expect(r.gs.getState().won).to.equal(true);
    expect(r.entries()).to.have.length(1);
    expect(r.entries()[0]).to.not.have.property('f');
  });

  describe('RC6: changed nothing', () => {
    const cases = [
      ['PEN_ENTER on a given', gs => gs.dispatch(sel(0)), pen(9), true],
      ['UNDO with nothing to undo', () => {}, { type: 'UNDO' }, true],
      ['HINT with none left', gs => {
        gs.dispatch({ type: 'RESTORE_SESSION', hintsRemaining: 0 });
        gs.dispatch(sel(2));
      }, { type: 'HINT' }, true],
      ['a PEN_ENTER that places a digit', gs => gs.dispatch(sel(2)), pen(4), false],
    ];
    for (const [label, arrange, action, nc] of cases) {
      it(`${label} is ${nc ? '' : 'not '}marked nc`, async () => {
        const r = rig({ hint: () => ({ cellIndex: 2, digit: 4, technique: 'Naked Single' }) });
        r.gs.dispatch(LOAD);
        arrange(r.gs);
        await r.boot();

        r.gs.dispatch(action);

        expect(r.entries().at(-1).nc).to.equal(nc ? true : undefined);
      });
    }
  });

  describe('RC7: informational actions are never marked nc', () => {
    const cases = [
      ['COACH_NO_TECHNIQUE', { type: 'COACH_NO_TECHNIQUE', reason: 'none' }],
      ['COACH_START with no technique', { type: 'COACH_START', result: { type: 'no-technique', reason: 'none' } }],
      ['COACH_START with a step', { type: 'COACH_START', result: placementStep(2) }],
    ];
    for (const [label, action] of cases) {
      it(label, async () => {
        const r = rig();
        r.gs.dispatch(LOAD);
        await r.boot();

        r.gs.dispatch(action);

        expect(r.entries()).to.have.length(1);
        expect(r.entries()[0]).to.not.have.property('nc');
      });
    }
  });

  describe('RC8: hints', () => {
    const HINTED = { cellIndex: 2, digit: 4, technique: 'Naked Single' };

    it('a HINT that places a digit carries the provider\'s answer', async () => {
      const r = rig({ hint: () => ({ ...HINTED, extra: 'ignored' }) });
      r.gs.dispatch(LOAD);
      r.gs.dispatch(sel(2));
      await r.boot();

      r.gs.dispatch({ type: 'HINT' });

      expect(r.entries()[0].a).to.deep.equal({ type: 'HINT', hint: HINTED });
      expect(r.gs.getState().pen[2]).to.equal(4);
    });

    it('noteHint with no open entry is ignored', async () => {
      const r = rig();
      await r.boot();

      r.recorder.noteHint(HINTED);

      expect(r.entries()).to.deep.equal([]);
      expect(r.recorder.counts().errors).to.equal(0);
    });

    it('noteHint during an open non-HINT entry is ignored', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      await r.boot();
      onFirst(r.gs, 'SELECT_CELL', () => r.recorder.noteHint(HINTED));

      r.gs.dispatch(sel(2));

      expect(r.entries()[0].a).to.deep.equal(sel(2));
    });

    it('a HINT whose guard fails is stored without a hint and marked nc', async () => {
      let asked = 0;
      const r = rig({ hint: () => { asked++; return HINTED; } });
      r.gs.dispatch(LOAD);
      await r.boot();

      r.gs.dispatch({ type: 'HINT' });

      expect(asked).to.equal(0);
      expect(r.entries()[0]).to.deep.include({ a: { type: 'HINT' }, nc: true });
    });

    it('a hint that cannot be read is captured as an error and the HINT still applies', async () => {
      const unreadable = { cellIndex: 2, digit: 4, get technique() { throw new Error('bad hint'); } };
      const r = rig({ hint: () => unreadable });
      r.gs.dispatch(LOAD);
      r.gs.dispatch(sel(2));
      await r.boot();

      r.gs.dispatch({ type: 'HINT' });

      expect(r.entries()[0].a).to.deep.equal({ type: 'HINT' });
      expect(r.entries()[1].e).to.deep.include({ kind: 'uncaught', message: 'bad hint' });
    });
  });

  describe('RC9: unrecordable actions', () => {
    for (const [label, action, type] of [['an unknown type', { type: 'NOPE' }, 'NOPE'],
      ['a PEN_ENTER with a non-digit', pen('x'), 'PEN_ENTER']]) {
      it(`${label} is not recorded and one error entry notes it`, async () => {
        const r = rig();
        r.gs.dispatch(LOAD);
        r.gs.dispatch(sel(2));
        await r.boot();
        const reduced = [];
        r.gs.on('changed', ({ action: a }) => reduced.push(a.type));

        r.gs.dispatch(action);

        expect(r.actionTypes()).to.deep.equal([]);
        expect(r.entries()).to.have.length(1);
        expect(r.entries()[0].e).to.deep.equal(capture(`Unrecordable action: ${type}`));
        if (type === 'PEN_ENTER') expect(reduced).to.deep.equal(['PEN_ENTER']);
      });
    }

    it('follow-ups of an unrecordable action are dropped with it', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      r.gs.dispatch(sel(2));
      await r.boot();
      onFirst(r.gs, 'PEN_ENTER', () => r.gs.dispatch(sel(3)));

      r.gs.dispatch(pen('x'));

      expect(r.actionTypes()).to.deep.equal([]);
      expect(r.gs.getState().selected).to.equal(3);
    });

    it('an unrecordable follow-up is dropped and noted by one error entry', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      await r.boot();
      onFirst(r.gs, 'SELECT_CELL', () => r.gs.dispatch({ type: 'NOPE' }));

      r.gs.dispatch(sel(2));

      expect(r.entries()[0]).to.not.have.property('f');
      expect(r.entries()[1].e.message).to.equal('Unrecordable action: NOPE');
      expect(r.entries()).to.have.length(2);
    });
  });

  // ── Merge ────────────────────────────────────────────────────────────────

  it('RC10: nothing reaches the store before the merge, then the merged history is handed over', async () => {
    let resolveOpen;
    const opened = new Promise(r => { resolveOpen = r; });
    const r = rig({ opened });
    r.gs.dispatch(LOAD);
    r.recorder.bootComplete(r.gs);
    const boot = encodePosition(r.gs.getState());
    r.gs.dispatch(sel(2));
    r.recorder.captureError(capture('early'));
    r.gs.dispatch(sel(3));
    await Promise.resolve();
    const before = [...r.store.calls];

    resolveOpen({ status: 'empty' });
    await r.recorder.ready;

    expect(before).to.deep.equal([]);
    expect(r.store.calls).to.deep.equal([['replaceAll', boot, [
      { seq: 1, t: 1000, a: sel(2) },
      { seq: 2, t: 1000, n: 1, e: capture('early') },
      { seq: 3, t: 1000, a: sel(3) },
    ]]]);
  });

  it('RC18: a loaded history is followed by PAGE_RELOADED at the boot time and the post-boot entries', async () => {
    const stored = [1, 2, 3].map(seq => ({ seq, t: seq, a: sel(seq) }));
    stored.push({ seq: 4, t: 4, n: 1, e: capture('stored error') });
    const savedStart = plainPositionDoc();
    const r = rig({ opened: Promise.resolve({ status: 'loaded', start: savedStart, entries: clone(stored) }) });
    r.gs.dispatch(LOAD);
    r.time.value = 7000;
    r.recorder.bootComplete(r.gs);
    const p0 = encodePosition(r.gs.getState());
    r.time.value = 7001;
    r.gs.dispatch(sel(10));

    await r.recorder.ready;

    const reload = { seq: 5, t: 7000, a: { type: 'PAGE_RELOADED', position: p0 } };
    const postBoot = { seq: 6, t: 7001, a: sel(10) };
    expect(r.recorder.snapshot()).to.deep.equal({ start: savedStart, entries: [...stored, reload, postBoot] });
    expect(r.store.calls).to.deep.equal([['write', { put: [reload, postBoot] }]]);
    r.gs.dispatch(sel(11));
    expect(r.entries().at(-1).seq).to.equal(7);
    expect(r.recorder.counts()).to.deep.include({ actions: 6, errors: 1 });
  });

  it('RC18: a loaded history with a start and no entries numbers the reload entry 1', async () => {
    const r = rig({ opened: Promise.resolve({ status: 'loaded', start: plainPositionDoc(), entries: [] }) });
    r.gs.dispatch(LOAD);

    await r.boot();

    expect(r.entries().map(e => [e.seq, e.a.type])).to.deep.equal([[1, 'PAGE_RELOADED']]);
  });

  it('RC19: a merged history over capacity is trimmed, advancing the start from the stored one', async () => {
    const stored = [1, 2, 3, 4].map(seq => ({ seq, t: seq, a: sel(seq) }));
    const savedStart = plainPositionDoc();
    const r = rig({ capacity: 5, opened: Promise.resolve({ status: 'loaded', start: savedStart, entries: clone(stored) }) });
    r.gs.dispatch(LOAD);
    r.recorder.bootComplete(r.gs);
    for (const cell of [10, 11, 12]) r.gs.dispatch(sel(cell));
    const expected = createMachine(savedStart);
    for (const e of stored.slice(0, 3)) applyEntry(expected, e);

    await r.recorder.ready;

    const { start, entries } = r.recorder.snapshot();
    expect(entries.map(e => e.seq)).to.deep.equal([4, 5, 6, 7, 8]);
    expect(start).to.deep.equal(encodePosition(expected.getState()));
    expect(r.store.calls).to.have.length(1);
    expect(r.store.calls[0][1]).to.deep.include({ removeBelow: 4, start });
    expect(r.store.calls[0][1].put.map(e => e.seq)).to.deep.equal([5, 6, 7, 8]);
  });

  describe('RC20, RC21: empty, unavailable and discarded saved histories', () => {
    for (const status of ['empty', 'unavailable', 'discarded']) {
      it(`${status}: the history starts at the boot position with the post-boot entries`, async () => {
        const r = rig({ opened: Promise.resolve({ status }), store: fakeStore({ status: status === 'empty' ? 'ok' : status }) });
        r.gs.dispatch(LOAD);
        r.recorder.bootComplete(r.gs);
        const p0 = encodePosition(r.gs.getState());
        r.gs.dispatch(sel(2));

        await r.recorder.ready;

        const history = r.recorder.snapshot();
        expect(history).to.deep.equal({ start: p0, entries: [{ seq: 1, t: 1000, a: sel(2) }] });
        expect(r.recorder.storageStatus()).to.equal(status === 'empty' ? 'ok' : status);
        expect(r.store.calls).to.deep.equal(status === 'unavailable' ? [] : [['replaceAll', p0, history.entries]]);
      });
    }
  });

  it('RC22a: ready resolves once open has resolved and boot is complete', async () => {
    const r = rig();
    let ready = false;
    r.recorder.ready.then(() => { ready = true; });
    await Promise.resolve();
    await Promise.resolve();
    const beforeBoot = ready;

    await r.boot();

    expect(beforeBoot).to.equal(false);
    expect(ready).to.equal(true);
  });

  it('RC22: a store that throws while the history is handed over is captured, and ready still resolves', async () => {
    const store = fakeStore();
    store.replaceAll = () => { throw new Error('rewrite failed'); };
    const r = rig({ store });
    r.gs.dispatch(LOAD);

    await r.boot();

    expect(r.entries().filter(e => 'e' in e).map(e => e.e.message)).to.deep.equal(['rewrite failed']);
  });

  it('a boot position that cannot be read is captured as an error and recording still starts', async () => {
    const r = rig();
    const live = r.gs.getState;
    let failed = false;
    const gs = { getState: () => { if (!failed) { failed = true; throw new Error('no position'); } return live(); } };

    r.recorder.bootComplete(gs);
    await r.recorder.ready;
    r.gs.dispatch(sel(2));

    expect(r.entries().filter(e => 'e' in e)).to.have.length(1);
    expect(r.actionTypes()).to.deep.equal(['SELECT_CELL']);
  });

  describe('a boot position that cannot be encoded', () => {
    const EMPTY_START = {
      puzzle: null, board: '0'.repeat(81), pencil: Array.from({ length: 81 }, () => []), selected: null,
      mode: 'pen', hintsRemaining: 0, attemptRecorded: false, won: false, incorrect: [], highlightPending: false,
      completionMessage: '', undo: null, generating: null, coach: null,
    };
    const STORED = [{ seq: 1, t: 1, a: sel(1) }, { seq: 2, t: 2, a: sel(2) }];

    /** Boots over a live game whose pencil marks were corrupted by a malformed console action. */
    async function corruptBoot(opened) {
      const r = rig({ opened });
      r.gs.dispatch(LOAD);
      r.gs.dispatch(sel(2));
      r.gs.dispatch({ type: 'DEV_SET_PENCIL', index: 2, mask: 1 << 12 });
      await r.boot();
      return r;
    }

    it('starts a new history at the empty position, keeping the captured error', async () => {
      const r = await corruptBoot(Promise.resolve({ status: 'empty' }));
      r.gs.dispatch(sel(3));

      const { start, entries } = r.recorder.snapshot();
      expect(start).to.deep.equal(EMPTY_START);
      expect(entries.map(e => ('e' in e ? e.e.message : e.a.type))).to.deep.equal([
        'Cell 2 has an invalid pencil mask.', 'SELECT_CELL',
      ]);
      expect(r.store.calls[0]).to.deep.equal(['replaceAll', EMPTY_START, [entries[0]]]);
    });

    it('overwrites a saved history instead of joining it', async () => {
      const r = await corruptBoot(Promise.resolve({ status: 'loaded', start: plainPositionDoc(), entries: clone(STORED) }));

      const { start, entries } = r.recorder.snapshot();
      expect(start).to.deep.equal(EMPTY_START);
      expect(entries.map(e => e.seq)).to.deep.equal([1]);
      expect('e' in entries[0]).to.equal(true);
      expect(r.store.calls.map(c => c[0])).to.deep.equal(['replaceAll']);
      expect(r.store.calls[0][2]).to.deep.equal(entries);
    });

    it('exports a valid document from the empty position', async () => {
      const r = await corruptBoot(Promise.resolve({ status: 'empty' }));
      r.gs.dispatch(sel(3));

      const doc = r.recorder.exportDocument();

      expect(readDocument(doc).ok).to.equal(true);
      expect(validatePosition(doc.start).ok).to.equal(true);
      expect(doc.start.puzzle).to.equal(null);
      expect(doc.errors.map(e => [e.afterAction, e.message])).to.deep.equal([[0, 'Cell 2 has an invalid pencil mask.']]);
      expect(doc.actions.map(a => a.action)).to.deep.equal([sel(3)]);
    });
  });

  // ── Capacity ─────────────────────────────────────────────────────────────

  it('RC11: at capacity the oldest actions leave and the start advances past them', async () => {
    const r = rig({ capacity: 3 });
    r.gs.dispatch(LOAD);
    await r.boot();
    const actions = [sel(2), pen(4), sel(3), pen(6), sel(5)];
    const positions = [];

    for (const action of actions) {
      r.gs.dispatch(action);
      positions.push(encodePosition(r.gs.getState()));
    }

    const { start, entries } = r.recorder.snapshot();
    expect(entries.map(e => e.a)).to.deep.equal(actions.slice(2));
    expect(start).to.deep.equal(positions[1]);
    expect(r.store.calls.at(-1)).to.deep.equal(['write', { put: [entries[2]], removeBelow: 3, start: positions[1] }]);
  });

  it('RC12: an error leaving at capacity does not move the start', async () => {
    const r = rig({ capacity: 3 });
    r.gs.dispatch(LOAD);
    await r.boot();
    const p0 = r.recorder.snapshot().start;
    r.recorder.captureError(capture('oldest'));
    const actions = [sel(2), sel(3), sel(4)];
    for (const action of actions) r.gs.dispatch(action);
    const afterThree = clone(r.recorder.snapshot());

    r.gs.dispatch(sel(5));

    expect(afterThree.entries.map(e => e.a)).to.deep.equal(actions);
    expect(afterThree.start).to.deep.equal(p0);
    expect(r.recorder.snapshot().start.selected).to.equal(2);
  });

  it('at capacity, a repeated identical error collapses into its entry and displaces nothing', async () => {
    const r = rig({ capacity: 3 });
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    r.gs.dispatch(sel(3));
    r.recorder.captureError(capture('storm'));
    const start = clone(r.recorder.snapshot().start);

    r.recorder.captureError(capture('storm'));

    const { entries } = r.recorder.snapshot();
    expect(entries.map(e => ('a' in e ? e.a.type : `${e.e.message}×${e.n}`))).to.deep.equal(['SELECT_CELL', 'SELECT_CELL', 'storm×2']);
    expect(r.recorder.snapshot().start).to.deep.equal(start);
  });

  it('RC13: counts report actions, error entries (not repeats) and capacity', async () => {
    const r = rig({ capacity: 3 });
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    r.recorder.captureError(capture('twice'));
    r.recorder.captureError(capture('twice'));
    const below = r.recorder.counts();

    r.gs.dispatch(sel(3));

    expect(below).to.deep.equal({ actions: 1, errors: 1, capacity: 3, atCapacity: false });
    expect(r.recorder.counts()).to.deep.equal({ actions: 2, errors: 1, capacity: 3, atCapacity: true });
  });

  it('RC33: progress updates are each recorded at capacity, displacing the oldest and advancing the start', async () => {
    const r = rig({ capacity: 5 });
    r.gs.dispatch(LOAD);
    r.gs.dispatch({ type: 'SET_GENERATING', flag: true, message: 'Generating…', difficulty: 'hard' });
    await r.boot();

    for (let attempts = 1; attempts <= 20; attempts++) r.gs.dispatch({ type: 'GEN_PROGRESS', attempts, budget: 50 });

    expect(r.entries().map(e => e.a.attempts)).to.deep.equal([16, 17, 18, 19, 20]);
    expect(r.recorder.snapshot().start.generating.progress).to.deep.equal({ attempts: 15, budget: 50 });
  });

  it('an error captured during an action trims nothing until the action ends', async () => {
    const r = rig({ capacity: 2 });
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    r.gs.dispatch(sel(3));
    let during = null;
    onFirst(r.gs, 'PEN_ENTER', () => {
      r.recorder.captureError(capture('mid-action'));
      during = r.entries().length;
    });

    r.gs.dispatch(pen(6));

    expect(during).to.equal(4);
    expect(r.entries()).to.have.length(2);
    expect(r.entries()[1].e.message).to.equal('mid-action');
  });

  it('RC11: with capacity 0 no entry is kept and the start follows the live position', async () => {
    const r = rig({ capacity: 0 });
    r.gs.dispatch(LOAD);
    await r.boot();

    r.gs.dispatch(sel(2));

    expect(r.entries()).to.deep.equal([]);
    expect(r.recorder.snapshot().start).to.deep.equal(encodePosition(r.gs.getState()));
    expect(r.store.calls.at(-1)[1]).to.deep.include({ put: [{ seq: 1, t: 1000, a: sel(2) }], removeBelow: 2 });
  });

  // ── Errors ───────────────────────────────────────────────────────────────

  describe('RC14: identical consecutive errors', () => {
    it('are one entry whose count is incremented and re-saved under the same seq', async () => {
      const r = rig();
      await r.boot();
      r.recorder.captureError(capture('same'));

      r.recorder.captureError(capture('same'));

      expect(r.entries()).to.deep.equal([{ seq: 1, t: 1000, n: 2, e: capture('same') }]);
      expect(r.store.calls.at(-1)).to.deep.equal(['write', { put: [{ seq: 1, t: 1000, n: 2, e: capture('same') }] }]);
    });

    for (const field of ['kind', 'message', 'stack', 'source']) {
      it(`are separate entries when ${field} differs`, async () => {
        const r = rig();
        await r.boot();
        r.recorder.captureError(capture('same'));

        r.recorder.captureError({ ...capture('same'), [field]: field === 'kind' ? 'rejection' : 'other' });

        expect(r.entries().map(e => e.n)).to.deep.equal([1, 1]);
      });
    }

    it('are separate entries when an action comes between them', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      await r.boot();
      r.recorder.captureError(capture('same'));
      r.gs.dispatch(sel(2));

      r.recorder.captureError(capture('same'));

      expect(r.entries().filter(e => 'e' in e).map(e => e.n)).to.deep.equal([1, 1]);
    });
  });

  describe('RC15: capture never recurses', () => {
    it('a capture requested while capturing is dropped', async () => {
      const store = fakeStore();
      const r = rig({ store });
      await r.boot();
      store.onWrite = () => { r.recorder.captureError(capture('nested')); };

      r.recorder.captureError(capture('outer'));

      expect(r.entries().map(e => e.e.message)).to.deep.equal(['outer']);
    });

    it('a throwing change listener is logged and contained, not captured', async () => {
      const r = rig();
      await r.boot();
      r.recorder.on('change', () => { throw new Error('panel bug'); });

      const logged = quietConsoleError(() => r.recorder.captureError(capture('outer')));

      expect(r.entries().map(e => e.e.message)).to.deep.equal(['outer']);
      expect(logged.map(([err]) => err.message)).to.deep.equal(['panel bug']);
    });
  });

  it('RC16: a store that throws while an error is captured drops nothing else and recording continues', async () => {
    const store = fakeStore();
    const r = rig({ store });
    r.gs.dispatch(LOAD);
    await r.boot();
    store.failWrite = true;

    expect(() => r.recorder.captureError(capture('first'))).to.not.throw();
    store.failWrite = false;
    r.gs.dispatch(sel(2));

    expect(r.entries().map(e => ('a' in e ? e.a.type : e.e.message))).to.deep.equal(['first', 'SELECT_CELL']);
  });

  describe('RC17: a failing collaborator never reaches the game', () => {
    async function dispatchWith(arrange) {
      const store = fakeStore();
      const log = fakeLog();
      const r = rig({ store, log });
      r.gs.dispatch(LOAD);
      await r.boot();
      const emitted = [];
      r.gs.on('changed', ({ action }) => emitted.push(action.type));
      arrange(r);
      expect(() => r.gs.dispatch(sel(2))).to.not.throw();
      store.failWrite = false;
      expect(r.gs.getState().selected).to.equal(2);
      expect(emitted).to.deep.equal(['SELECT_CELL']);
      return r;
    }

    it('now() throwing in begin', async () => {
      const r = await dispatchWith(rr => { rr.time.failNext = 1; });

      expect(r.entries().map(e => e.e?.message)).to.deep.equal(['clock failed']);
    });

    it('log.action throwing in end', async () => {
      const r = await dispatchWith(rr => { rr.log.fail = true; });

      expect(r.entries().filter(e => 'e' in e).map(e => e.e.message)).to.deep.equal(['log failed']);
    });

    it('store.write throwing in end', async () => {
      const r = await dispatchWith(rr => { rr.store.failWrite = true; });

      expect(r.entries().filter(e => 'e' in e).map(e => e.e.message)).to.deep.equal(['write failed']);
    });
  });

  it('RC17: a collaborator that throws a non-Error is captured by its string form', async () => {
    const log = fakeLog();
    const r = rig({ log });
    r.gs.dispatch(LOAD);
    await r.boot();
    log.action = () => { throw 'plain failure'; };

    r.gs.dispatch(sel(2));

    expect(r.entries()[1].e).to.deep.equal(capture('plain failure'));
  });

  // ── Export ───────────────────────────────────────────────────────────────

  it('RC23: the exported document places errors after their action and carries nc and follow-ups', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    r.recorder.captureError(capture('before any action'));
    onFirst(r.gs, 'SELECT_CELL', () => r.gs.dispatch({ type: 'SET_MODE', mode: 'pencil' }));
    r.gs.dispatch(sel(2));
    r.gs.dispatch({ type: 'UNDO' });
    r.recorder.captureError(capture('after two'));
    r.recorder.captureError(capture('after two'));
    r.time.value = Date.UTC(2026, 10, 16, 12, 0, 0, 250);

    const doc = r.recorder.exportDocument();

    expect(doc.exportedAt).to.equal('2026-11-16T12:00:00.250Z');
    expect(doc.errors.map(e => [e.afterAction, e.message, e.count])).to.deep.equal([
      [0, 'before any action', 1], [2, 'after two', 2],
    ]);
    expect(doc.actions[0].then).to.deep.equal([{ type: 'SET_MODE', mode: 'pencil' }]);
    expect(doc.actions[1]).to.deep.include({ action: { type: 'UNDO' }, noChange: true });
    expect(readDocument(doc).ok).to.equal(true);
    expect(validatePosition(doc.start).ok).to.equal(true);
    expect(doc.actions.every(item => validateActionItem(item).ok)).to.equal(true);
  });

  it('RC24: the exported document is a copy', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    const doc = r.recorder.exportDocument();
    const expected = clone(doc);

    doc.start.board = 'x';
    doc.actions[0].action.index = 80;

    expect(r.recorder.exportDocument()).to.deep.equal(expected);
  });

  it('RC25: right after boot the export is a valid document with no actions', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();

    const doc = r.recorder.exportDocument();

    expect(readDocument(doc).ok).to.equal(true);
    expect(doc.actions).to.deep.equal([]);
    expect(doc.start).to.deep.equal(encodePosition(r.gs.getState()));
  });

  // ── Clear and replay hand-over ───────────────────────────────────────────

  it('RC26: clear() starts a new history at the live position and seq continues', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    r.gs.dispatch(pen(wrong(2)));
    r.recorder.captureError(capture('e'));
    const live = encodePosition(r.gs.getState());

    const removed = r.recorder.clear();
    r.gs.dispatch(sel(3));

    expect(removed).to.deep.equal({ actions: 2, errors: 1 });
    expect(r.recorder.snapshot().start).to.deep.equal(live);
    expect(r.store.calls).to.deep.include(['replaceAll', live, []]);
    expect(r.entries()).to.deep.equal([{ seq: 4, t: 1000, a: sel(3) }]);
  });

  it('RC27: replaceHistory replaces the content, renumbering from the current seq', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    r.gs.dispatch(sel(2));
    const newStart = plainPositionDoc({ selected: 40 });
    const given = [{ seq: 90, t: 5, a: sel(41) }, { seq: 91, t: 6, n: 1, e: capture('replayed') }];

    r.recorder.replaceHistory(newStart, given);

    const expected = [{ seq: 2, t: 5, a: sel(41) }, { seq: 3, t: 6, n: 1, e: capture('replayed') }];
    expect(r.recorder.snapshot()).to.deep.equal({ start: newStart, entries: expected });
    expect(r.store.calls.at(-1)).to.deep.equal(['replaceAll', newStart, expected]);
    expect(given[0].seq).to.equal(90);
  });

  // ── silently ─────────────────────────────────────────────────────────────

  it('RC28: silently skips its own action; a public dispatch nested in it is a top-level entry', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    onFirst(r.gs, 'SELECT_CELL', () => r.gs.dispatch({ type: 'TOGGLE_MODE' }));

    const result = r.recorder.silently(() => { r.gs.dispatch(sel(2)); return 'done'; });

    expect(result).to.equal('done');
    expect(r.entries().map(e => e.a)).to.deep.equal([{ type: 'TOGGLE_MODE' }]);
    expect(r.entries()[0]).to.not.have.property('f');
  });

  it('RC29: the dispatch after silently is recorded normally, even when silently dispatched nothing', async () => {
    const r = rig();
    r.gs.dispatch(LOAD);
    await r.boot();
    r.recorder.silently(() => r.gs.dispatch(sel(2)));
    r.recorder.silently(() => {});

    r.gs.dispatch(sel(3));

    expect(r.entries().map(e => e.a)).to.deep.equal([sel(3)]);
  });

  // ── mark / errorsSince ───────────────────────────────────────────────────

  describe('RC30: mark and errorsSince', () => {
    it('lists only errors created since the mark, placed after their action', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      await r.boot();
      r.recorder.captureError(capture('before'));
      const mark = r.recorder.mark();
      r.gs.dispatch(sel(2));
      r.recorder.captureError(capture('after', { kind: 'listener', action: 'SELECT_CELL' }));
      r.recorder.captureError(capture('after', { kind: 'listener', action: 'SELECT_CELL' }));

      expect(r.recorder.errorsSince(mark)).to.deep.equal([
        { kind: 'listener', afterAction: 1, message: 'after', count: 2 },
      ]);
    });

    it('does not list an increment to an error created before the mark', async () => {
      const r = rig();
      await r.boot();
      r.recorder.captureError(capture('before'));
      const mark = r.recorder.mark();

      r.recorder.captureError(capture('before'));

      expect(r.recorder.errorsSince(mark)).to.deep.equal([]);
    });

    it('does not list an error that has left the history', async () => {
      const r = rig({ capacity: 1 });
      r.gs.dispatch(LOAD);
      await r.boot();
      const mark = r.recorder.mark();
      r.recorder.captureError(capture('gone'));

      r.gs.dispatch(sel(2));

      expect(r.recorder.errorsSince(mark)).to.deep.equal([]);
    });
  });

  // ── Events and the action trace ──────────────────────────────────────────

  describe('RC31: events', () => {
    it('each recorded action emits change with the counts', async () => {
      const r = rig();
      r.gs.dispatch(LOAD);
      await r.boot();
      const changes = [];
      r.recorder.on('change', c => changes.push(c));

      r.gs.dispatch(sel(2));

      expect(changes).to.deep.equal([{ actions: 1, errors: 0, capacity: RECORDER_CAPACITY, atCapacity: false }]);
    });

    it('a store status change emits storage with the status, until unsubscribed', async () => {
      const r = rig();
      const statuses = [];
      const off = r.recorder.on('storage', s => statuses.push(s));

      r.recorder.storageChanged('failing');
      off();
      r.recorder.storageChanged('ok');

      expect(statuses).to.deep.equal(['failing']);
    });
  });

  it('RC32: each top-level entry hands the trace its changed parts and duration', async () => {
    const times = [10, 12.5, 20, 21];
    const log = fakeLog();
    const r = rig({ log, clock: () => times.shift() });
    r.gs.dispatch(LOAD);
    await r.boot();
    onFirst(r.gs, 'SELECT_CELL', () => r.gs.dispatch({ type: 'TOGGLE_MODE' }));

    r.gs.dispatch(sel(2));
    r.gs.dispatch({ type: 'NOPE' });
    r.gs.dispatch({ type: 'UNDO' });

    expect(log.lines.map(l => [l.entry.a.type, l.parts, l.ms])).to.deep.equal([
      ['SELECT_CELL', ['selected', 'mode'], 2.5],
      ['UNDO', [], 1],
    ]);
    expect(log.lines[0].entry.f).to.deep.equal([{ type: 'TOGGLE_MODE' }]);
  });
});

describe('PERF-D3: recorder overhead per action at capacity', function () {
  this.timeout(30000);

  const ACTIONS = 5000;
  const step = i => (i % 2 === 0 ? sel([2, 3, 5, 6][(i / 2) % 4]) : { type: 'PENCIL_TOGGLE', digit: 1 + (i % 9) });

  function playThrough(gs) {
    const t0 = performance.now();
    for (let i = 0; i < ACTIONS; i++) gs.dispatch(step(i));
    return performance.now() - t0;
  }

  it('5,000 actions through the tap with a full history, every one trimming, average under 1 ms each', async () => {
    const r = rig({ capacity: ACTIONS });
    await r.boot();
    r.gs.dispatch(LOAD);
    for (let i = 0; i < ACTIONS; i++) r.gs.dispatch(step(i));
    expect(r.recorder.counts().atCapacity, 'full before timing').to.equal(true);
    const bare = createGameState({
      stats: { recordAttemptOnce() {}, recordWin() {} }, hintProvider: { nextHint: () => null }, timers: manualTimers().timers,
    });
    bare.dispatch(LOAD);

    const tapped = playThrough(r.gs);
    const untapped = playThrough(bare);

    const mean = tapped / ACTIONS;
    console.log(`[PERF] PERF-D3 ${ACTIONS} actions at capacity: ${(mean * 1000).toFixed(1)} µs/action recorded, `
      + `${((untapped / ACTIONS) * 1000).toFixed(1)} µs/action unrecorded; overhead ≈ ${(((tapped - untapped) / ACTIONS) * 1000).toFixed(1)} µs`);
    expect(r.recorder.counts().actions).to.equal(ACTIONS);
    expect(mean).to.be.below(1);
  });
});
