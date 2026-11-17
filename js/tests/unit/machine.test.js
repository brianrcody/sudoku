/**
 * @fileoverview The headless game machine (tspec-debug-instrumentation
 * MC1–MC10): construction from a position document, null collaborators,
 * applying history entries, and snapshots.
 */

import { createMachine, applyEntry, snapshot } from '../../dev/machine.js';
import { decodePosition, decodeAction, fingerprint } from '../../dev/sessionCodec.js';
import { GOLDEN_PUZZLES } from '../helpers/goldenScript.js';
import { createSessionDriver } from '../helpers/sessionDriver.js';
import {
  KIDDIE, NEARLY_SOLVED, wrong, placementStep, puzzleDoc, plainPositionDoc, richPositionDoc,
} from '../helpers/codecFixtures.js';

const sel = index => ({ type: 'SELECT_CELL', index });
const pen = digit => ({ type: 'PEN_ENTER', digit });

/** A machine-shaped object whose dispatch records each action, optionally throwing on one type. */
function recordingMachine({ throwOn } = {}) {
  const dispatched = [];
  return {
    dispatched,
    getState: () => null,
    dispatch(action) {
      if (action.type === throwOn) throw new Error(`refused ${throwOn}`);
      dispatched.push(action);
    },
  };
}

/**
 * Replaces `obj[name]` with a pass-through that logs `label`, and returns the
 * function that puts the original back.
 */
function spyOn(obj, name, label, log) {
  const original = obj[name];
  obj[name] = function (...args) {
    log.push(label);
    return original.apply(this, args);
  };
  return () => { obj[name] = original; };
}

describe('machine', () => {
  it('MC1: a machine built from a rich position has that position\'s fingerprint', () => {
    const doc = richPositionDoc();

    const machine = createMachine(doc);

    expect(fingerprint(machine.getState())).to.deep.equal(fingerprint(decodePosition(doc)));
  });

  it('MC2: a machine exposes getState and dispatch only', () => {
    const machine = createMachine(plainPositionDoc());

    expect(Object.keys(machine)).to.have.members(['getState', 'dispatch']).and.have.length(2);
  });

  it('MC3: winning a rated puzzle on a machine persists no statistics', () => {
    const doc = plainPositionDoc({ puzzle: puzzleDoc({ givens: NEARLY_SOLVED }), board: NEARLY_SOLVED });
    const machine = createMachine(doc);
    const writes = [];
    const cookieBefore = document.cookie;
    const restore = spyOn(Storage.prototype, 'setItem', 'setItem', writes);

    try {
      for (const [cell, digit] of [[2, 4], [3, 6], [5, 8]]) {
        machine.dispatch(sel(cell));
        machine.dispatch(pen(digit));
      }
    } finally {
      restore();
    }

    expect(machine.getState().won).to.equal(true);
    expect(writes).to.deep.equal([]);
    expect(localStorage.length).to.equal(0);
    expect(document.cookie).to.equal(cookieBefore);
  });

  it('MC4: HINT without a recorded hint changes nothing', () => {
    const machine = createMachine(plainPositionDoc({ selected: 2 }));
    const before = fingerprint(machine.getState());

    machine.dispatch({ type: 'HINT' });

    expect(fingerprint(machine.getState())).to.deep.equal(before);
  });

  it('MC5: CHECK schedules no timer and leaves the highlight pending', () => {
    const machine = createMachine(plainPositionDoc({ selected: 2 }));
    machine.dispatch(pen(wrong(2)));
    const calls = [];
    const restore = spyOn(window, 'setTimeout', 'setTimeout', calls);

    try {
      machine.dispatch({ type: 'CHECK' });
    } finally {
      restore();
    }

    expect(calls).to.deep.equal([]);
    expect(snapshot(machine).highlightPending).to.equal(true);
    expect([...machine.getState().incorrect]).to.deep.equal([2]);
  });

  it('MC6: applyEntry dispatches the decoded action, then each follow-up in order', () => {
    const machine = recordingMachine();
    const entry = {
      a: { type: 'SELECT_CELL', index: 2 },
      f: [{ type: 'DEV_SET_PENCIL', index: 2, digits: [1, 3] }, { type: 'COACH_FOCUS_OFF' }],
    };

    applyEntry(machine, entry);

    expect(machine.dispatched).to.deep.equal([entry.a, ...entry.f].map(decodeAction));
    expect(machine.dispatched[1].mask).to.equal(0b101);
  });

  it('MC7: an entry with no follow-ups dispatches once', () => {
    const machine = recordingMachine();

    applyEntry(machine, { a: { type: 'UNDO' } });

    expect(machine.dispatched).to.deep.equal([{ type: 'UNDO' }]);
  });

  it('MC8: an action that throws propagates out of applyEntry and stops the entry', () => {
    const machine = recordingMachine({ throwOn: 'COACH_FOCUS_COACHED_CELL' });
    const entry = {
      a: { type: 'SELECT_CELL', index: 3 },
      f: [{ type: 'COACH_FOCUS_COACHED_CELL', index: 3 }, { type: 'COACH_FOCUS_OFF' }],
    };

    expect(() => applyEntry(machine, entry)).to.throw('refused COACH_FOCUS_COACHED_CELL');
    expect(machine.dispatched.map(a => a.type)).to.deep.equal(['SELECT_CELL']);
  });

  describe('MC9: snapshot independence', () => {
    it('a snapshot of a rich position is unchanged by later actions and restores to its fingerprint', () => {
      const machine = createMachine(richPositionDoc());
      const snap = snapshot(machine);
      const before = fingerprint(snap);

      machine.dispatch({ type: 'PENCIL_TOGGLE', digit: 1 });
      machine.dispatch({ type: 'COACH_FOCUS_OFF' });
      machine.dispatch({ type: 'GEN_PROGRESS', attempts: 9, budget: 50 });
      machine.dispatch({ type: 'COACH_FILL_RECAP', variant: 'elim' });
      machine.dispatch(pen(4));
      machine.dispatch({ type: 'CLEAR_INCORRECT' });
      const restored = createMachine(plainPositionDoc());
      restored.dispatch({ type: 'DEV_RESTORE_POSITION', position: snap });

      expect(fingerprint(snap)).to.deep.equal(before);
      expect(fingerprint(machine.getState())).to.not.deep.equal(before);
      expect(fingerprint(restored.getState())).to.deep.equal(before);
      expect(snap.coachSession.eliminationTargets).to.be.instanceOf(Map);
    });

    it('a snapshot of a bare position carries its conflicts and restores to its fingerprint', () => {
      // A 5 in cell 2 repeats the given 5 in cell 0.
      const machine = createMachine(plainPositionDoc({ board: `535${KIDDIE.slice(3)}` }));
      const snap = snapshot(machine);
      const before = fingerprint(snap);

      machine.dispatch(sel(6));
      machine.dispatch(pen(9));
      const restored = createMachine(plainPositionDoc());
      restored.dispatch({ type: 'DEV_RESTORE_POSITION', position: snap });

      expect(snap.conflicts).to.deep.equal(new Set([0, 2]));
      expect([snap.coachSession, snap.undoSnapshot, snap.genProgress]).to.deep.equal([null, null, null]);
      expect(fingerprint(snap)).to.deep.equal(before);
      expect(fingerprint(restored.getState())).to.deep.equal(before);
    });

    it('a snapshot of a placement coach session has no elimination targets', () => {
      const machine = createMachine(plainPositionDoc({ selected: 2 }));
      machine.dispatch({ type: 'COACH_START', result: placementStep(2) });

      const snap = snapshot(machine);

      expect(snap.coachSession.eliminationTargets).to.equal(null);
      expect(snap.coachSession.focusedCoachedCell).to.equal(2);
    });
  });

  it('MC10: 200 driver actions touch no storage, IndexedDB, DOM or global timer', () => {
    const machine = createMachine(plainPositionDoc());
    const driver = createSessionDriver(0x3c10, {
      puzzles: [GOLDEN_PUZZLES.kiddie, GOLDEN_PUZZLES.easy, GOLDEN_PUZZLES.hard, GOLDEN_PUZZLES.unrated],
    });
    const activity = [];
    const restores = [
      ...['setItem', 'getItem', 'removeItem', 'clear'].map(m => spyOn(Storage.prototype, m, `Storage.${m}`, activity)),
      ...['open', 'deleteDatabase'].map(m => spyOn(IDBFactory.prototype, m, `indexedDB.${m}`, activity)),
      ...['setTimeout', 'setInterval', 'requestAnimationFrame'].map(m => spyOn(window, m, m, activity)),
      spyOn(Document.prototype, 'createElement', 'createElement', activity),
    ];
    const observer = new MutationObserver(() => {});
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    let mutations;

    try {
      for (let i = 0; i < 200; i++) machine.dispatch(driver.next(machine.getState()));
    } finally {
      mutations = observer.takeRecords();
      observer.disconnect();
      for (const restore of restores) restore();
    }

    expect(activity).to.deep.equal([]);
    expect(mutations).to.have.length(0);
  });
});
