/**
 * @fileoverview The regression-fixture helper (tspec-debug-instrumentation
 * RF1–RF8; aspec-debug-instrumentation §13, §14.3): object and text input,
 * rejection, the stopped outcome, the `state()` shape, determinism, freedom
 * from side effects, the stop value, the upgrade note, and fixture loading.
 */

import { replayFixture, loadSessionFixture } from '../helpers/replayFixture.js';
import { RECORDER_DB } from '../../dev/devMode.js';
import { createMachine } from '../../dev/machine.js';
import { KIDDIE, SOLUTION, plainPositionDoc } from '../helpers/codecFixtures.js';

const at = i => new Date(Date.UTC(2026, 10, 15, 14, 1, 0) + i * 1000).toISOString();
const sel = index => ({ type: 'SELECT_CELL', index });
const pen = digit => ({ type: 'PEN_ENTER', digit });

/** KIDDIE: cells 2 and 3 filled correctly, then a hint for cell 5 and a selection. */
function smallDoc() {
  const actions = [
    sel(2), pen(SOLUTION[2]), sel(3),
    { type: 'HINT', hint: { cellIndex: 3, digit: SOLUTION[3], technique: 'Naked Single' } },
    sel(5),
  ];
  return {
    format: 'sudoku-session', version: 1, exportedAt: at(9), start: plainPositionDoc(),
    actions: actions.map((action, i) => ({ at: at(i + 1), action })), errors: [],
  };
}

const STATE_FIELDS = [
  'puzzle', 'board', 'pencilMarks', 'selected', 'mode', 'hintsRemaining', 'won', 'generating',
  'undoAvailable', 'coachActive', 'conflicts', 'flaggedIncorrect', 'recorder', 'text',
];

/** A machine factory whose machines throw `message` on any HINT. */
const throwingOnHint = message => position => {
  const machine = createMachine(position);
  return {
    getState: machine.getState,
    dispatch(action) {
      if (action.type === 'HINT') throw new Error(message);
      machine.dispatch(action);
    },
  };
};

/** Creates the recorder database with one stored entry, as a developer session leaves it. */
function seedRecorderDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECORDER_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta');
      req.result.createObjectStore('entries', { keyPath: 'seq' });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['meta', 'entries'], 'readwrite');
      tx.objectStore('meta').put({ form: 1, owner: 'other', start: null }, 'history');
      tx.objectStore('entries').put({ seq: 1, t: 1, a: sel(4) });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

const storageSnapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
const databaseNames = async () => (await indexedDB.databases()).map(d => d.name).sort();

describe('replayFixture helper', () => {
  it('RF1: an object document and its JSON text give deep-equal results', async () => {
    const text = await loadSessionFixture('unrated-then-medium.json');

    const fromText = await replayFixture(text);
    const fromObject = await replayFixture(JSON.parse(text));

    expect(fromObject).to.deep.equal(fromText);
  });

  describe('RF2: a document replay would reject makes the helper throw the rejection message', () => {
    const versionTwo = () => ({ ...smallDoc(), version: 2 });
    const badStart = () => ({ ...smallDoc(), start: plainPositionDoc({ board: KIDDIE.slice(1) }) });
    const cases = [
      ['empty text', () => '', 'This session can\'t be replayed. No session document was supplied.'],
      ['a newer version', versionTwo, 'This session can\'t be replayed. It is format version 2; this build reads versions 1 to 1.'],
      ['a malformed start', badStart, 'This session can\'t be replayed. Its starting position is not valid: its data is incomplete or invalid.'],
    ];
    for (const [label, make, message] of cases) {
      it(label, async () => {
        let caught = null;
        try {
          await replayFixture(make());
        } catch (err) {
          caught = err;
        }

        expect(caught).to.be.instanceOf(Error);
        expect(caught.message).to.equal(message);
      });
    }
  });

  it('RF3: an action that throws resolves with the stop, the error raised, and the state reached', async () => {
    const result = await replayFixture(smallDoc(), { makeMachine: throwingOnHint('boom') });

    expect(result.report.stopped).to.deep.equal({ at: 4, message: 'boom' });
    expect(result.report.errors.raised).to.deep.equal([{ kind: 'uncaught', afterAction: 3, message: 'boom', count: 1 }]);
    expect(result.applied).to.equal(3);
    expect(result.state.selected).to.equal('r1c4');
    expect(result.state.board[2]).to.equal(String(SOLUTION[2]));
    expect(result.state.board[3]).to.equal('0');
    expect(result.state.recorder.actions).to.equal(3);
  });

  it('RF4: state has every field of state() and the recorder counts the applied actions', async () => {
    const result = await replayFixture(smallDoc(), { stopAfter: 3 });

    expect(Object.keys(result.state)).to.have.members(STATE_FIELDS).and.have.length(STATE_FIELDS.length);
    expect(result.state.recorder).to.deep.equal({ actions: 3, errors: 0, capacity: 5000 });
    expect(result).to.include({ applied: 3, total: 5 });
  });

  it('RF5: the result does not depend on the clock, on saved storage, or on a recorder database', async () => {
    const text = await loadSessionFixture('unrated-then-medium.json');
    const first = await replayFixture(text);
    const realNow = Date.now;
    localStorage.setItem('sudoku.dev.logging.v1', '{not json');
    localStorage.setItem('sudoku-state', '[[junk]]');
    await seedRecorderDb();

    let second;
    try {
      Date.now = () => realNow() + 10 * 365 * 24 * 3600 * 1000;
      second = await replayFixture(text);
    } finally {
      Date.now = realNow;
    }

    expect(second).to.deep.equal(first);
  });

  it('RF6: it touches no storage, no database, no DOM and no timer', async () => {
    const text = await loadSessionFixture('unrated-then-medium.json');
    localStorage.setItem('kept', 'value');
    const storageBefore = storageSnapshot();
    const databasesBefore = await databaseNames();
    const childrenBefore = document.body.childElementCount;
    const realSetTimeout = window.setTimeout;
    let timers = 0;
    window.setTimeout = (...args) => { timers++; return realSetTimeout(...args); };

    try {
      await replayFixture(text);
    } finally {
      window.setTimeout = realSetTimeout;
    }

    expect(timers).to.equal(0);
    expect(storageSnapshot()).to.equal(storageBefore);
    expect(await databaseNames()).to.deep.equal(databasesBefore);
    expect(document.body.childElementCount).to.equal(childrenBefore);
  });

  it('RF7: the stop value is honoured', async () => {
    const result = await replayFixture(JSON.stringify(smallDoc()), { stopAfter: '2' });

    expect(result).to.include({ applied: 2, total: 5 });
    expect(result.state.selected).to.equal('r1c3');
    expect(result.report.applied).to.equal(2);
  });

  it('the format-upgrade note reaches the report', async () => {
    const upgraders = { 1: doc => ({ ...doc, version: 2 }) };

    const result = await replayFixture(smallDoc(), { current: 2, upgraders });

    expect(result.report.notes).to.deep.equal(['Document format version 1 was read as version 2.']);
  });

  describe('RF8: loadSessionFixture', () => {
    it('returns a fixture\'s JSON text', async () => {
      const text = await loadSessionFixture('format-v1-baseline.json');

      expect(JSON.parse(text)).to.include({ format: 'sudoku-session', version: 1 });
    });

    it('rejects naming a fixture that is not there', async () => {
      const realFetch = window.fetch;
      const requested = [];
      window.fetch = async url => { requested.push(url); return new Response('', { status: 404 }); };
      let caught = null;
      try {
        await loadSessionFixture('missing.json');
      } catch (err) {
        caught = err;
      } finally {
        window.fetch = realFetch;
      }

      expect(requested).to.deep.equal(['/js/tests/fixtures/sessions/missing.json']);
      expect(caught?.message).to.equal('No session fixture missing.json.');
    });
  });
});
