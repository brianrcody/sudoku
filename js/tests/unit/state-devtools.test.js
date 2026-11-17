/**
 * @fileoverview The reducer surface added for the debug instrumentation
 * (tspec-debug-instrumentation SDT1–SDT31): the dispatch tap, injectable
 * timers, HINT with a supplied hint, DEV_SET_PENCIL, DEV_FILL_PENCIL and
 * DEV_RESTORE_POSITION.
 */

import { createGameState } from '../../game/state.js';
import { computeConflicts } from '../../game/conflicts.js';
import { CHECK_HIGHLIGHT_MS } from '../../config.js';
import { canonical } from '../helpers/stateTrace.js';

const SOLUTION = Uint8Array.from(
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
  Number,
);
const bit = d => 1 << (d - 1);
const wrong = i => SOLUTION[i] % 9 + 1;

/** Cells 1 and 3 are empty in every test puzzle; cell 0 is a given. */
function makePuzzle(difficulty, empties = [1, 3, 11, 13, 21]) {
  const givens = new Uint8Array(SOLUTION);
  for (const i of empties) givens[i] = 0;
  return { id: `t-${difficulty}`, difficulty, givens, solution: new Uint8Array(SOLUTION), solveTrace: [] };
}

const NO_ROLES = { target: null, cause: [], elimTarget: [], unitMember: [], scA: [], scB: [] };

function placementStep(target, reveal = []) {
  return {
    type: 'placement', technique: 'Naked Single', rank: 1, digits: [SOLUTION[target]],
    roles: { ...NO_ROLES, target }, unit: null, arrows: [], eliminations: [],
    autoReveal: { required: reveal.length > 0, cells: reveal },
    supportingText: '', complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** Eliminates 9 from cell 1 and 2 from cell 3, revealing both cells' marks. */
function eliminationStep() {
  return {
    type: 'elimination', technique: 'Naked Pair', rank: 4, digits: [9, 2],
    roles: { ...NO_ROLES, cause: [11, 13], elimTarget: [1, 3] },
    unit: { type: 'row', index: 0 }, arrows: [],
    eliminations: [{ cellIndex: 1, digit: 9 }, { cellIndex: 3, digit: 2 }],
    autoReveal: {
      required: true,
      cells: [{ cellIndex: 1, candidates: bit(3) | bit(9) }, { cellIndex: 3, candidates: bit(6) | bit(2) }],
    },
    supportingText: '', complexity: { acknowledged: false, note: null, endpoints: null },
  };
}

/** Timers that never run anything on their own; `fire` runs a captured callback. */
function manualTimers(now = 1000) {
  const pending = new Map();
  const calls = { set: [], clear: [] };
  let nextId = 1;
  return {
    calls,
    pending,
    timers: {
      now: () => now,
      set: (fn, ms) => { const id = nextId++; calls.set.push({ id, ms }); pending.set(id, fn); return id; },
      clear: id => { calls.clear.push(id); pending.delete(id); },
    },
    fire(id) {
      const fn = pending.get(id);
      pending.delete(id);
      fn();
    },
    fireAll() { for (const id of [...pending.keys()]) this.fire(id); },
  };
}

/**
 * A store with spies. `log` receives tap calls (`begin:TYPE`, `end:TYPE`) and
 * emits (`emit:TYPE`) in order.
 */
function makeStore({ tap = true, timers, providerHint } = {}) {
  const log = [];
  const stats = { attempts: [], wins: [] };
  const statsDep = {
    recordAttemptOnce: d => { stats.attempts.push(d); },
    recordWin: d => { stats.wins.push(d); },
  };
  const providerCalls = [];
  const hintProvider = {
    nextHint(puzzle, playerState, opts) {
      providerCalls.push({ puzzle, playerState, opts });
      return providerHint ?? { cellIndex: opts.targetCell, digit: puzzle.solution[opts.targetCell], technique: 'Stub' };
    },
  };
  const deps = { stats: statsDep, hintProvider };
  if (tap) {
    deps.tap = {
      begin: action => log.push(`begin:${action.type}`),
      end: action => log.push(`end:${action.type}`),
    };
  }
  if (timers) deps.timers = timers;
  const store = createGameState(deps);
  const emits = [];
  store.on('changed', ({ action, changed }) => {
    log.push(`emit:${action.type}`);
    emits.push({ action, changed: [...changed].sort() });
  });
  const reset = () => { log.length = 0; emits.length = 0; providerCalls.length = 0; };
  return { store, log, emits, stats, providerCalls, reset };
}

function load(store, puzzle) {
  store.dispatch({ type: 'PUZZLE_LOADED', puzzle });
}

/** A full InternalPosition for the Easy puzzle, every field at its default. */
function basePosition(puzzle = makePuzzle('easy')) {
  return {
    puzzle,
    pen: new Uint8Array(puzzle.givens),
    pencil: new Uint16Array(81),
    selected: null,
    activeMode: 'pen',
    incorrect: new Set(),
    highlightPending: false,
    hintsRemaining: 3,
    attemptRecorded: false,
    won: false,
    generating: false,
    generatingMessage: '',
    generatingDifficulty: null,
    genProgress: null,
    completionMessage: '',
    coachSession: null,
    undoSnapshot: null,
  };
}

const POSITION_FIELDS = Object.keys(basePosition()).filter(k => k !== 'highlightPending');

function positionPart(state) {
  const out = {};
  for (const key of POSITION_FIELDS) out[key] = canonical(state[key]);
  return out;
}

describe('state.js developer seams', () => {

  describe('dispatch tap', () => {
    it('SDT1: a public dispatch is bracketed by begin and end around all of its emits', () => {
      const { store, log, reset } = makeStore();
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'COACH_START', result: eliminationStep() });
      reset();

      store.dispatch({ type: 'ERASE' });

      expect(log).to.deep.equal(['begin:ERASE', 'emit:ERASE', 'emit:COACH_END', 'end:ERASE']);
    });

    it('SDT2: the reducer\'s nested dispatches do not reach the tap', () => {
      const { store, log, reset } = makeStore();
      load(store, makePuzzle('easy', [1]));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'COACH_START', result: placementStep(1) });
      reset();

      store.dispatch({ type: 'PEN_ENTER', digit: SOLUTION[1] });

      expect(log.filter(e => !e.startsWith('emit:'))).to.deep.equal(['begin:PEN_ENTER', 'end:PEN_ENTER']);
      expect(log).to.include.members(['emit:ON_COMPLETION_EVALUATE', 'emit:COACH_END']);
    });

    it('SDT3: a dispatch from a changed listener is a nested public dispatch', () => {
      const { store, log, reset } = makeStore();
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'COACH_START', result: placementStep(1) });
      store.dispatch({ type: 'COACH_FOCUS_COACHED_CELL', index: 1 });
      let redispatched = false;
      store.on('changed', ({ action }) => {
        if (action.type === 'SELECT_CELL' && !redispatched) {
          redispatched = true;
          store.dispatch({ type: 'COACH_FOCUS_OFF' });
        }
      });
      reset();

      store.dispatch({ type: 'SELECT_CELL', index: 3 });

      expect(log.filter(e => !e.startsWith('emit:'))).to.deep.equal(
        ['begin:SELECT_CELL', 'begin:COACH_FOCUS_OFF', 'end:COACH_FOCUS_OFF', 'end:SELECT_CELL']);
    });

    it('SDT4: an exception from the reducer propagates unchanged and end is still called once', () => {
      const failure = new Error('stats down');
      const log = [];
      const store = createGameState({
        stats: { recordAttemptOnce() { throw failure; }, recordWin() {} },
        hintProvider: { nextHint: () => null },
        tap: { begin: a => log.push(`begin:${a.type}`), end: a => log.push(`end:${a.type}`) },
      });
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      log.length = 0;

      let thrown = null;
      try { store.dispatch({ type: 'PEN_ENTER', digit: 4 }); } catch (e) { thrown = e; }

      expect(thrown).to.equal(failure);
      expect(log).to.deep.equal(['begin:PEN_ENTER', 'end:PEN_ENTER']);
    });

    it('SDT5: the check-highlight expiry is a top-level public CLEAR_INCORRECT', () => {
      const clock = manualTimers();
      const { store, log, reset } = makeStore({ timers: clock.timers });
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });
      store.dispatch({ type: 'CHECK' });
      reset();

      clock.fire(clock.calls.set[0].id);

      expect(log).to.deep.equal(['begin:CLEAR_INCORRECT', 'emit:CLEAR_INCORRECT', 'end:CLEAR_INCORRECT']);
      expect(store.getState().incorrect.size).to.equal(0);
      expect(store.getState().incorrectShownUntil).to.equal(0);
    });
  });

  describe('injectable timers', () => {
    it('SDT6: CHECK takes its deadline from timers.now and replaces its pending timer', () => {
      const clock = manualTimers(1000);
      const { store } = makeStore({ timers: clock.timers });
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });

      store.dispatch({ type: 'CHECK' });
      store.dispatch({ type: 'CHECK' });

      expect(store.getState().incorrectShownUntil).to.equal(1000 + CHECK_HIGHLIGHT_MS);
      expect(clock.calls.set.map(c => c.ms)).to.deep.equal([CHECK_HIGHLIGHT_MS, CHECK_HIGHLIGHT_MS]);
      expect(clock.calls.clear).to.deep.equal([clock.calls.set[0].id]);
    });

    function completeWrongly(difficulty) {
      const clock = manualTimers(2000);
      const { store } = makeStore({ timers: clock.timers });
      load(store, makePuzzle(difficulty, [1]));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });
      return { state: store.getState(), clock };
    }

    it('SDT7a: a wrong on-complete board takes its highlight deadline from timers.now', () => {
      const { state, clock } = completeWrongly('hard');

      expect(state.incorrect.has(1)).to.be.true;
      expect(state.incorrectShownUntil).to.equal(2000 + CHECK_HIGHLIGHT_MS);
      expect(clock.calls.set).to.have.length(1);
    });

    it('SDT7b: a wrong on-complete-silent board takes its message deadline from timers.now', () => {
      const { state, clock } = completeWrongly('expert');

      expect(state.completionMessage).to.equal('Not quite. Keep going!');
      expect(state.incorrectShownUntil).to.equal(2000 + CHECK_HIGHLIGHT_MS);
      expect(clock.calls.set).to.have.length(1);
    });

    const CLEARING_ACTIONS = {
      PUZZLE_LOADED: () => ({ type: 'PUZZLE_LOADED', puzzle: makePuzzle('easy') }),
      UNDO: () => ({ type: 'UNDO' }),
      NEW_PUZZLE: () => ({ type: 'NEW_PUZZLE', difficulty: 'easy', puzzle: makePuzzle('easy') }),
      RESET_PUZZLE: () => ({ type: 'RESET_PUZZLE' }),
      DEV_SET_BOARD: () => ({ type: 'DEV_SET_BOARD', pen: new Uint8Array(81) }),
    };

    for (const [name, make] of Object.entries(CLEARING_ACTIONS)) {
      it(`SDT8: ${name} cancels a pending highlight through timers.clear`, () => {
        const clock = manualTimers();
        const { store, log } = makeStore({ timers: clock.timers });
        load(store, makePuzzle('easy'));
        store.dispatch({ type: 'SELECT_CELL', index: 1 });
        store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });
        store.dispatch({ type: 'CHECK' });
        const handle = clock.calls.set[0].id;

        store.dispatch(make());
        clock.fireAll();

        expect(clock.calls.clear).to.deep.equal([handle]);
        expect(log).to.not.include('begin:CLEAR_INCORRECT');
      });
    }

    it('SDT9: inert timers set the highlight without scheduling anything', () => {
      const { store } = makeStore({ timers: { now: () => 0, set: () => 0, clear() {} } });
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });
      const realSetTimeout = window.setTimeout;
      let scheduled = 0;
      window.setTimeout = (...args) => { scheduled++; return realSetTimeout(...args); };

      try {
        store.dispatch({ type: 'CHECK' });
      } finally {
        window.setTimeout = realSetTimeout;
      }

      expect(store.getState().incorrect.has(1)).to.be.true;
      expect(store.getState().incorrectShownUntil).to.equal(CHECK_HIGHLIGHT_MS);
      expect(scheduled).to.equal(0);
    });
  });

  describe('HINT with a supplied hint', () => {
    function hintReady(difficulty = 'easy') {
      const s = makeStore();
      load(s.store, makePuzzle(difficulty));
      s.store.dispatch({ type: 'SELECT_CELL', index: 1 });
      s.reset();
      return s;
    }

    it('SDT10: a supplied hint is applied instead of asking the provider', () => {
      const { store, emits, stats, providerCalls } = hintReady();
      const digit = wrong(1);

      store.dispatch({ type: 'HINT', hint: { cellIndex: 1, digit, technique: 'Recorded' } });

      const s = store.getState();
      expect(providerCalls).to.have.length(0);
      expect(s.pen[1]).to.equal(digit);
      expect(s.hintsRemaining).to.equal(2);
      expect(s.attemptRecorded).to.be.true;
      expect(stats.attempts).to.deep.equal(['easy']);
      expect(emits.map(e => e.changed)).to.deep.equal(
        [['conflicts', 'hintsRemaining', 'incorrect', 'pen', 'pencil']]);
    });

    it('SDT11: a supplied null hint changes nothing and does not ask the provider', () => {
      const { store, emits, providerCalls } = hintReady();
      const before = canonical(store.getState());

      store.dispatch({ type: 'HINT', hint: null });

      expect(providerCalls).to.have.length(0);
      expect(canonical(store.getState())).to.deep.equal(before);
      expect(emits).to.have.length(0);
    });

    for (const [label, action] of [
      ['absent', { type: 'HINT' }],
      ['undefined', { type: 'HINT', hint: undefined }],
    ]) {
      it(`SDT12: with the hint ${label}, the provider is asked exactly as before`, () => {
        const { store, providerCalls } = hintReady();
        const s = store.getState();

        store.dispatch(action);

        expect(providerCalls).to.have.length(1);
        const [call] = providerCalls;
        expect(call.puzzle).to.equal(s.puzzle);
        expect(call.playerState).to.deep.equal({ pen: s.pen, conflicts: s.conflicts });
        expect(call.playerState.pen).to.equal(s.pen);
        expect(call.opts).to.deep.equal({ targetCell: 1 });
        expect(s.pen[1]).to.equal(SOLUTION[1]);
      });
    }

    const GUARDS = {
      'no selection': s => s.store.dispatch({ type: 'DESELECT' }),
      'no puzzle': s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), puzzle: null, selected: 1 },
      }),
      'no hints left': s => s.store.dispatch({ type: 'RESTORE_SESSION', hintsRemaining: 0 }),
      'a given cell': s => s.store.dispatch({ type: 'SELECT_CELL', index: 0 }),
      'a pen cell': s => s.store.dispatch({ type: 'PEN_ENTER', digit: 4 }),
      'a won board': s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), won: true, selected: 1 },
      }),
    };

    for (const [label, arrange] of Object.entries(GUARDS)) {
      it(`SDT13: a supplied hint is ignored with ${label}`, () => {
        const s = hintReady();
        arrange(s);
        s.reset();
        const before = canonical(s.store.getState());

        s.store.dispatch({ type: 'HINT', hint: { cellIndex: 1, digit: SOLUTION[1], technique: 'Recorded' } });

        expect(s.emits).to.have.length(0);
        expect(s.providerCalls).to.have.length(0);
        expect(canonical(s.store.getState())).to.deep.equal(before);
      });
    }

    it('SDT14: a supplied hint fills its own cell, not the selected one', () => {
      const { store } = hintReady();

      store.dispatch({ type: 'HINT', hint: { cellIndex: 3, digit: SOLUTION[3], technique: 'Recorded' } });

      expect(store.getState().pen[3]).to.equal(SOLUTION[3]);
      expect(store.getState().pen[1]).to.equal(0);
    });
  });

  describe('DEV_SET_PENCIL', () => {
    function ready() {
      const s = makeStore();
      load(s.store, makePuzzle('easy'));
      s.store.dispatch({ type: 'SELECT_CELL', index: 3 });
      s.store.dispatch({ type: 'PENCIL_TOGGLE', digit: 5 });
      s.reset();
      return s;
    }

    const GUARDS = {
      'no puzzle': [s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), puzzle: null },
      }), 1],
      'a won board': [s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), won: true },
      }), 1],
      'generation running': [s => s.store.dispatch({ type: 'SET_GENERATING', flag: true }), 1],
      'a given cell': [() => {}, 0],
      'a pen digit': [s => { s.store.dispatch({ type: 'SELECT_CELL', index: 1 }); s.store.dispatch({ type: 'PEN_ENTER', digit: 4 }); }, 1],
      'the current mask': [() => {}, 3, bit(5)],
    };

    for (const [label, [arrange, index, mask = bit(7)]] of Object.entries(GUARDS)) {
      it(`SDT15: DEV_SET_PENCIL is ignored with ${label}`, () => {
        const s = ready();
        arrange(s);
        s.reset();
        const before = canonical(s.store.getState());
        const undoBefore = s.store.getState().undoSnapshot;

        s.store.dispatch({ type: 'DEV_SET_PENCIL', index, mask });

        expect(s.emits).to.have.length(0);
        expect(s.store.getState().undoSnapshot).to.equal(undoBefore);
        expect(canonical(s.store.getState())).to.deep.equal(before);
      });
    }

    it('SDT16: DEV_SET_PENCIL sets the cell\'s marks as an undoable move', () => {
      const { store, emits } = ready();
      const mask = bit(1) | bit(8);

      store.dispatch({ type: 'DEV_SET_PENCIL', index: 1, mask });

      const s = store.getState();
      expect(s.pencil[1]).to.equal(mask);
      expect(s.undoSnapshot.pencil[1]).to.equal(0);
      expect(s.undoSnapshot.pencil[3]).to.equal(bit(5));
      expect(emits.map(e => e.changed)).to.deep.equal([['pencil', 'undoSnapshot']]);
      expect(s.selected).to.equal(3);
      expect(s.activeMode).to.equal('pen');
    });

    it('SDT17: UNDO after DEV_SET_PENCIL restores the previous marks', () => {
      const { store } = ready();
      store.dispatch({ type: 'DEV_SET_PENCIL', index: 3, mask: bit(1) });

      store.dispatch({ type: 'UNDO' });

      expect(store.getState().pencil[3]).to.equal(bit(5));
    });

    function eliminationSession() {
      const s = makeStore();
      load(s.store, makePuzzle('easy'));
      s.store.dispatch({ type: 'COACH_START', result: eliminationStep() });
      s.reset();
      return s;
    }

    it('SDT18a: clearing the last indicated candidate starts the elimination recap within one tap frame', () => {
      const { store, log, reset } = eliminationSession();
      store.dispatch({ type: 'DEV_SET_PENCIL', index: 1, mask: bit(3) });
      reset();

      store.dispatch({ type: 'DEV_SET_PENCIL', index: 3, mask: bit(6) });

      expect(store.getState().coachSession.recap).to.equal('elim');
      expect(log).to.deep.equal(
        ['begin:DEV_SET_PENCIL', 'emit:COACH_FILL_RECAP', 'emit:DEV_SET_PENCIL', 'end:DEV_SET_PENCIL']);
    });

    it('SDT18b: clearing an indicated candidate that is not the last leaves the session running', () => {
      const { store, log } = eliminationSession();

      store.dispatch({ type: 'DEV_SET_PENCIL', index: 1, mask: bit(3) });

      expect(store.getState().coachSession).to.not.equal(null);
      expect(store.getState().coachSession.recap).to.equal(null);
      expect(log).to.deep.equal(['begin:DEV_SET_PENCIL', 'emit:DEV_SET_PENCIL', 'end:DEV_SET_PENCIL']);
    });

    it('SDT18c: without a coach session no recap logic runs', () => {
      const { store, log } = ready();

      store.dispatch({ type: 'DEV_SET_PENCIL', index: 1, mask: 0x1ff });

      expect(store.getState().coachSession).to.equal(null);
      expect(log).to.deep.equal(['begin:DEV_SET_PENCIL', 'emit:DEV_SET_PENCIL', 'end:DEV_SET_PENCIL']);
    });
  });

  describe('DEV_FILL_PENCIL', () => {
    const allMarks = () => new Uint16Array(81).fill(bit(2) | bit(4));

    function ready() {
      const s = makeStore();
      load(s.store, makePuzzle('easy'));
      s.store.dispatch({ type: 'SELECT_CELL', index: 11 });
      s.store.dispatch({ type: 'PEN_ENTER', digit: SOLUTION[11] });
      s.store.dispatch({ type: 'SELECT_CELL', index: 13 });
      s.store.dispatch({ type: 'PENCIL_TOGGLE', digit: 7 });
      s.reset();
      return s;
    }

    const GUARDS = {
      'no puzzle': s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), puzzle: null },
      }),
      'a won board': s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), won: true },
      }),
      'generation running': s => s.store.dispatch({ type: 'SET_GENERATING', flag: true }),
    };

    for (const [label, arrange] of Object.entries(GUARDS)) {
      it(`SDT20: DEV_FILL_PENCIL is ignored with ${label}`, () => {
        const s = ready();
        arrange(s);
        s.reset();
        const before = canonical(s.store.getState());

        s.store.dispatch({ type: 'DEV_FILL_PENCIL', pencil: allMarks() });

        expect(s.emits).to.have.length(0);
        expect(canonical(s.store.getState())).to.deep.equal(before);
      });
    }

    it('SDT21: DEV_FILL_PENCIL marks only empty cells, as one undoable move', () => {
      const { store, emits } = ready();
      const before = new Uint16Array(store.getState().pencil);

      store.dispatch({ type: 'DEV_FILL_PENCIL', pencil: allMarks() });

      const s = store.getState();
      for (let i = 0; i < 81; i++) {
        expect(s.pencil[i], `cell ${i}`).to.equal(s.pen[i] === 0 ? (bit(2) | bit(4)) : 0);
      }
      expect(emits.map(e => e.changed)).to.deep.equal([['pencil', 'undoSnapshot']]);
      store.dispatch({ type: 'UNDO' });
      expect(Array.from(store.getState().pencil)).to.deep.equal(Array.from(before));
    });

    it('SDT22: DEV_FILL_PENCIL ends a coach session, reverting its marks, before filling', () => {
      const { store, log, reset } = ready();
      const beforeSession = new Uint16Array(store.getState().pencil);
      store.dispatch({ type: 'COACH_START', result: eliminationStep() });
      let pencilAtEnd = null;
      let endReason = null;
      store.on('changed', ({ action }) => {
        if (action.type === 'COACH_END') {
          endReason = action.reason;
          pencilAtEnd = Array.from(store.getState().pencil);
        }
      });
      reset();

      store.dispatch({ type: 'DEV_FILL_PENCIL', pencil: allMarks() });

      expect(log).to.deep.equal(
        ['begin:DEV_FILL_PENCIL', 'emit:COACH_END', 'emit:DEV_FILL_PENCIL', 'end:DEV_FILL_PENCIL']);
      expect(endReason).to.equal('erase');
      expect(pencilAtEnd).to.deep.equal(Array.from(beforeSession));
      expect(store.getState().pencil[1]).to.equal(bit(2) | bit(4));
      expect(store.getState().coachSession).to.equal(null);
    });

    it('SDT23: DEV_FILL_PENCIL does not alias the supplied array', () => {
      const { store } = ready();
      const supplied = allMarks();
      store.dispatch({ type: 'DEV_FILL_PENCIL', pencil: supplied });
      const after = Array.from(store.getState().pencil);

      supplied.fill(0x1ff);

      expect(Array.from(store.getState().pencil)).to.deep.equal(after);
    });
  });

  describe('DEV_RESTORE_POSITION', () => {
    /** Every field away from its default. */
    function richPosition() {
      const puzzle = makePuzzle('easy');
      const pen = new Uint8Array(puzzle.givens);
      pen[1] = SOLUTION[1];
      pen[3] = wrong(3);
      const pencil = new Uint16Array(81);
      pencil[11] = bit(1) | bit(7);
      return {
        puzzle,
        pen,
        pencil,
        selected: 11,
        activeMode: 'pencil',
        incorrect: new Set([3]),
        highlightPending: false,
        hintsRemaining: 1,
        attemptRecorded: true,
        won: true,
        generating: true,
        generatingMessage: 'Generating…',
        generatingDifficulty: 'hard',
        genProgress: { attempts: 4, budget: 40 },
        completionMessage: 'Not quite. Keep going!',
        coachSession: {
          step: eliminationStep(),
          coachedCells: new Set([1, 3, 11, 13]),
          focusedCoachedCell: 11,
          pencilSnapshot: new Uint16Array(81).fill(1),
          coachRevealedBits: new Uint16Array(81).fill(2),
          eliminationTargets: new Map([[1, bit(9)], [3, bit(2)]]),
          recap: null,
        },
        undoSnapshot: {
          pen: new Uint8Array(puzzle.givens),
          pencil: new Uint16Array(81).fill(4),
          hintsRemaining: 2,
          attemptRecorded: false,
        },
      };
    }

    function restore(position, opts) {
      const s = makeStore(opts);
      load(s.store, makePuzzle('kiddie'));
      s.reset();
      s.store.dispatch({ type: 'DEV_RESTORE_POSITION', position });
      return s;
    }

    it('SDT24: the restored state equals the position and does not alias it', () => {
      const position = richPosition();
      const expected = positionPart(position);
      const { store } = restore(position);
      const restored = positionPart(store.getState());

      position.pen[5] = 1;
      position.pencil[5] = 1;
      position.incorrect.add(5);
      position.genProgress.attempts = 99;
      position.coachSession.coachedCells.add(5);
      position.coachSession.pencilSnapshot[5] = 0;
      position.coachSession.coachRevealedBits[5] = 0;
      position.coachSession.eliminationTargets.set(5, 1);
      position.coachSession.recap = 'elim';
      position.undoSnapshot.pen[5] = 0;
      position.undoSnapshot.pencil[5] = 0;
      position.undoSnapshot.hintsRemaining = 0;

      expect(restored).to.deep.equal(expected);
      expect(positionPart(store.getState())).to.deep.equal(expected);
      expect(store.getState().coachSession.step).to.equal(position.coachSession.step);
    });

    for (const won of [true, false]) {
      it(`SDT25: winHandled is restored as won (${won})`, () => {
        const { store } = restore({ ...basePosition(), won });

        expect(store.getState().winHandled).to.equal(won);
      });
    }

    it('SDT26: conflicts are recomputed from the restored pen', () => {
      const position = basePosition();
      position.pen[1] = SOLUTION[0];   // repeats the given in row 1
      delete position.conflicts;

      const { store } = restore(position);

      expect(canonical(store.getState().conflicts)).to.deep.equal(canonical(computeConflicts(position.pen)));
      expect(store.getState().conflicts.size).to.be.greaterThan(0);
    });

    it('SDT27: a pending highlight gets a fresh deadline and a timer that expires through the tap', () => {
      const clock = manualTimers(500);
      const { store, log, reset } = restore(
        { ...basePosition(), incorrect: new Set([1]), highlightPending: true }, { timers: clock.timers });

      expect(store.getState().incorrectShownUntil).to.equal(500 + CHECK_HIGHLIGHT_MS);
      expect(clock.calls.set.map(c => c.ms)).to.deep.equal([CHECK_HIGHLIGHT_MS]);
      reset();
      clock.fireAll();
      expect(log).to.deep.equal(['begin:CLEAR_INCORRECT', 'emit:CLEAR_INCORRECT', 'end:CLEAR_INCORRECT']);
    });

    it('SDT28: restoring with no highlight pending cancels the current one', () => {
      const clock = manualTimers();
      const { store, log } = makeStore({ timers: clock.timers });
      load(store, makePuzzle('easy'));
      store.dispatch({ type: 'SELECT_CELL', index: 1 });
      store.dispatch({ type: 'PEN_ENTER', digit: wrong(1) });
      store.dispatch({ type: 'CHECK' });
      const handle = clock.calls.set[0].id;

      store.dispatch({ type: 'DEV_RESTORE_POSITION', position: basePosition() });
      clock.fireAll();

      expect(store.getState().incorrectShownUntil).to.equal(0);
      expect(clock.calls.clear).to.deep.equal([handle]);
      expect(log).to.not.include('begin:CLEAR_INCORRECT');
    });

    it('SDT29: the restore emits the same keys as PUZZLE_LOADED', () => {
      const { store, emits, reset } = restore(basePosition());
      const restoreKeys = emits[0].changed;
      reset();

      store.dispatch({ type: 'PUZZLE_LOADED', puzzle: makePuzzle('easy') });

      expect(restoreKeys).to.deep.equal(emits[0].changed);
    });

    it('SDT30: restoring a solved board records nothing and does not evaluate completion', () => {
      const position = basePosition();
      position.pen = new Uint8Array(SOLUTION);

      const { store, stats, log } = restore(position);

      expect(store.getState().won).to.be.false;
      expect(stats.attempts).to.deep.equal([]);
      expect(stats.wins).to.deep.equal([]);
      expect(log).to.deep.equal(['begin:DEV_RESTORE_POSITION', 'emit:DEV_RESTORE_POSITION', 'end:DEV_RESTORE_POSITION']);
    });

    const UNGUARDED = {
      'of a position with no puzzle': [() => {}, { ...basePosition(), puzzle: null, selected: 13 }],
      'while generating': [s => s.store.dispatch({ type: 'SET_GENERATING', flag: true }),
        { ...basePosition(), selected: 13 }],
      'while won': [s => s.store.dispatch({
        type: 'DEV_RESTORE_POSITION', position: { ...basePosition(), won: true },
      }), { ...basePosition(), selected: 13 }],
    };

    for (const [label, [arrange, position]] of Object.entries(UNGUARDED)) {
      it(`SDT31: a restore is accepted ${label}`, () => {
        const s = makeStore();
        load(s.store, makePuzzle('kiddie'));
        arrange(s);
        s.reset();

        s.store.dispatch({ type: 'DEV_RESTORE_POSITION', position });

        expect(s.emits).to.have.length(1);
        expect(positionPart(s.store.getState())).to.deep.equal(positionPart(position));
      });
    }
  });
});
