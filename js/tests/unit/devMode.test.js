/**
 * @fileoverview Unit tests for js/dev/devMode.js (DM1–DM9; DM10–DM15 from
 * tspec-debug-instrumentation: the history purge, the fresh-session flag).
 *
 * The global beforeEach clears localStorage, so every test starts with no
 * saved setting.
 */

import { initDevMode, isDevMode, isFreshDevSession, RECORDER_DB } from '../../dev/devMode.js';
import { diagnostics } from '../../util/events.js';
import { seedDb } from '../helpers/fakeIdb.js';

const KEY = 'sudoku.dev.v1';

describe('dev/devMode.js', () => {
  afterEach(() => { initDevMode(''); });

  it('DM1: defaults to off with no parameter and nothing saved', () => {
    expect(initDevMode('')).to.be.false;
    expect(isDevMode()).to.be.false;
  });

  it('DM2: ?dev=1 turns it on and saves the setting', () => {
    expect(initDevMode('?dev=1')).to.be.true;
    expect(isDevMode()).to.be.true;
    expect(localStorage.getItem(KEY)).to.equal('true');
  });

  it('DM3: the saved setting applies when the parameter is absent', () => {
    initDevMode('?dev=1');
    expect(initDevMode('')).to.be.true;
    expect(isDevMode()).to.be.true;
  });

  it('DM4: ?dev=0 turns it off and clears the saved setting', () => {
    initDevMode('?dev=1');
    expect(initDevMode('?dev=0')).to.be.false;
    expect(isDevMode()).to.be.false;
    expect(localStorage.getItem(KEY)).to.be.null;
  });

  it('DM5: once cleared, a later load without the parameter stays off', () => {
    initDevMode('?dev=1');
    initDevMode('?dev=0');
    expect(initDevMode('')).to.be.false;
  });

  it('DM6: an unrecognized value keeps the saved setting (on)', () => {
    initDevMode('?dev=1');
    expect(initDevMode('?dev=yes')).to.be.true;
  });

  it('DM7: an unrecognized value keeps the saved setting (off)', () => {
    expect(initDevMode('?dev=true')).to.be.false;
    expect(localStorage.getItem(KEY)).to.be.null;
  });

  it('DM8: the parameter is found among others', () => {
    expect(initDevMode('?p=123&dev=1&x=y')).to.be.true;
  });

  it('DM9: a saved value other than true does not enable it', () => {
    localStorage.setItem(KEY, '"1"');
    expect(initDevMode('')).to.be.false;
  });

  // ── Phase 4: the session history ────────────────────────────────────────

  /** Runs `act` with `window.indexedDB` replaced by `value`, restoring it after. */
  function withIndexedDB(value, act) {
    const own = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', { configurable: true, writable: true, value });
    try {
      return act();
    } finally {
      if (own) Object.defineProperty(window, 'indexedDB', own);
      else delete window.indexedDB;
    }
  }

  const listed = async () => (await indexedDB.databases()).some(db => db.name === RECORDER_DB);

  it('DM10: ?dev=0 deletes the saved session history', async function () {
    this.timeout(5000);
    await seedDb(RECORDER_DB);
    const before = await listed();

    initDevMode('?dev=0');

    expect(before).to.equal(true);
    const deadline = Date.now() + 3000;
    while (await listed()) {
      if (Date.now() > deadline) throw new Error('the history database was not deleted');
      await new Promise(r => setTimeout(r, 20));
    }
  });

  it('DM11: ?dev=0 with a throwing deleteDatabase still turns the mode off, silently', () => {
    initDevMode('?dev=1');
    const swallowed = [];
    const off = diagnostics.on('swallowed', e => swallowed.push(e));

    let result;
    try {
      result = withIndexedDB({ deleteDatabase() { throw new DOMException('denied', 'SecurityError'); } },
        () => initDevMode('?dev=0'));
    } finally {
      off();
    }

    expect(result).to.equal(false);
    expect(isDevMode()).to.equal(false);
    expect(swallowed).to.deep.equal([]);
  });

  it('DM12: ?dev=0 without IndexedDB does not throw', () => {
    expect(withIndexedDB(undefined, () => initDevMode('?dev=0'))).to.equal(false);
  });

  it('DM13: ?dev=1 with nothing saved is a fresh developer session', () => {
    initDevMode('?dev=1');

    expect(isFreshDevSession()).to.equal(true);
  });

  describe('DM14: every other load is not fresh', () => {
    const cases = [
      ['?dev=1 when already on', () => initDevMode('?dev=1'), '?dev=1'],
      ['no parameter with the mode saved on', () => initDevMode('?dev=1'), ''],
      ['?dev=0', () => initDevMode('?dev=1'), '?dev=0'],
      ['an unrecognised value', () => initDevMode('?dev=1'), '?dev=yes'],
    ];
    for (const [label, arrange, search] of cases) {
      it(label, () => {
        arrange();

        initDevMode(search);

        expect(isFreshDevSession()).to.equal(false);
      });
    }
  });

  it('DM15: the history database is named sudoku-dev-recorder', () => {
    expect(RECORDER_DB).to.equal('sudoku-dev-recorder');
  });
});
