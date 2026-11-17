/**
 * @fileoverview Early developer bootstrap (tspec-debug-instrumentation
 * DB1–DB9, and RC22b): the boot object, the hint-provider wrapper, error
 * capture from window events and the diagnostics channel, the fresh-session
 * discard, ownership tokens, and a rejected `open()`.
 *
 * Each boot gets its own database and an `EventTarget` as its window, and is
 * disposed afterwards.
 */

import { boot } from '../../dev/devBoot.js';
import { diagnostics } from '../../util/events.js';
import { LOGGING_KEY } from '../../dev/devLog.js';
import { devModeStore, plainPositionDoc } from '../helpers/codecFixtures.js';
import { seedDb, readDb, deleteDb, failingIdb, idbError } from '../helpers/fakeIdb.js';

let dbCounter = 0;

/** Logging-switch storage with every category off. */
const allOff = () => ({ getItem: () => ({ generation: false, swallowed: false, actions: false }), setItem() {} });

const quietOut = () => ({ lines: [], log(...a) { this.lines.push(a); }, warn(...a) { this.lines.push(a); } });

describe('dev/devBoot.js', function () {
  this.timeout(10000);

  let name;
  let boots;
  let win;

  beforeEach(() => {
    name = `test-dev-boot-${++dbCounter}-${Date.now()}`;
    boots = [];
    win = new EventTarget();
  });

  afterEach(async () => {
    for (const b of boots) b.dispose();
    await deleteDb(name);
  });

  /** A boot on this test's database and window. */
  function start(deps = {}) {
    const b = boot({ win, dbName: name, out: quietOut(), fresh: false, storage: allOff(), ...deps });
    boots.push(b);
    return b;
  }

  /** Boot, complete it on an empty game, and wait for the merge. */
  async function started(deps) {
    const b = start(deps);
    b.bootComplete(devModeStore());
    await b.recorder.ready;
    return b;
  }

  const errors = b => b.recorder.exportDocument().errors
    .map(({ kind, message, stack, source, action }) => ({ kind, message, stack, source, action }));

  it('DB1: boot returns the tap, recorder, log, hint wrapper, bootComplete and dispose', () => {
    const b = start();

    expect(Object.keys(b)).to.have.members(
      ['tap', 'recorder', 'log', 'wrapHintProvider', 'bootComplete', 'dispose']);
    expect(b.tap).to.equal(b.recorder.tap);
    expect(b.tap.begin).to.be.a('function');
    expect(b.log.get).to.be.a('function');
  });

  it('DB2: the wrapped hint provider returns the hint and reports it to the recorder', async () => {
    const b = await started();
    const hint = { cellIndex: 2, digit: 4, technique: 'Naked Single' };
    const calls = [];
    const wrapped = b.wrapHintProvider({ nextHint: (...args) => { calls.push(args); return hint; } });
    const noted = [];
    const original = b.recorder.noteHint;
    b.recorder.noteHint = h => { noted.push(h); original(h); };

    const result = wrapped.nextHint('puzzle', 'player', { targetCell: 2 });

    expect(result).to.equal(hint);
    expect(calls).to.deep.equal([['puzzle', 'player', { targetCell: 2 }]]);
    expect(noted).to.deep.equal([hint]);
  });

  describe('DB3: window error events', () => {
    const cases = [
      ['with an error and a filename', { message: 'boom', error: Object.assign(new Error('boom'), { stack: 'S' }),
        filename: 'http://x/a.js', lineno: 3, colno: 9 }, { stack: 'S', source: 'http://x/a.js:3:9' }],
      ['without a filename', { message: 'boom', error: Object.assign(new Error('boom'), { stack: 'S' }) },
        { stack: 'S', source: null }],
      ['without an error', { message: 'boom', filename: 'http://x/a.js', lineno: 1, colno: 2 },
        { stack: null, source: 'http://x/a.js:1:2' }],
    ];
    for (const [label, init, expected] of cases) {
      it(`are captured as uncaught errors ${label}`, async () => {
        const b = await started();

        win.dispatchEvent(new ErrorEvent('error', init));

        expect(errors(b)).to.deep.equal([{ kind: 'uncaught', message: 'boom', action: null, ...expected }]);
      });
    }
  });

  describe('DB4: unhandled rejections', () => {
    const cases = [
      ['an Error reason', Object.assign(new Error('nope'), { stack: 'S' }), { message: 'nope', stack: 'S' }],
      ['a string reason', 'plain', { message: 'plain', stack: null }],
      ['an undefined reason', undefined, { message: 'undefined', stack: null }],
    ];
    for (const [label, reason, expected] of cases) {
      it(`are captured as rejections with ${label}`, async () => {
        const b = await started();

        win.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }));

        expect(errors(b)).to.deep.equal([{ kind: 'rejection', source: null, action: null, ...expected }]);
      });
    }
  });

  describe('DB5: listener errors', () => {
    it('carry the type of the action being applied', async () => {
      const b = await started();
      const error = Object.assign(new Error('listener broke'), { stack: 'S' });

      diagnostics.emit('listener-error', { error, type: 'changed', payload: { action: { type: 'HINT' } } });

      expect(errors(b)).to.deep.equal([
        { kind: 'listener', message: 'listener broke', stack: 'S', source: null, action: 'HINT' },
      ]);
    });

    it('carry no action when the payload has none', async () => {
      const b = await started();

      diagnostics.emit('listener-error', { error: 'thrown string', type: 'other', payload: undefined });

      expect(errors(b)).to.deep.equal([
        { kind: 'listener', message: 'thrown string', stack: null, source: null, action: null },
      ]);
    });
  });

  it('DB6: capturing an error event does not prevent its default handling', async () => {
    await started();
    const event = new ErrorEvent('error', { message: 'boom', cancelable: true });

    win.dispatchEvent(event);

    expect(event.defaultPrevented).to.equal(false);
  });

  describe('DB7: a fresh developer session', () => {
    beforeEach(async () => {
      await seedDb(name, {
        meta: { form: 1, owner: 'earlier', start: plainPositionDoc() },
        entries: [{ seq: 1, t: 1, a: { type: 'SELECT_CELL', index: 3 } }],
      });
    });

    it('fresh: the saved history is discarded and a new one starts', async () => {
      const b = await started({ fresh: true });

      expect(b.recorder.exportDocument().actions).to.deep.equal([]);
      expect(b.recorder.storageStatus()).to.equal('ok');
      expect((await readDb(name)).entries).to.deep.equal([]);
    });

    it('not fresh: the saved history is kept and the reload appended', async () => {
      const b = await started({ fresh: false });

      expect(b.recorder.exportDocument().actions.map(a => a.action.type)).to.deep.equal(['SELECT_CELL', 'PAGE_RELOADED']);
    });
  });

  it('DB8: two boots claim the history with different owner tokens', async () => {
    await started();
    const first = (await readDb(name)).meta.owner;

    await started();
    const second = (await readDb(name)).meta.owner;

    expect(first).to.be.a('string').and.not.equal('');
    expect(second).to.be.a('string').and.not.equal(first);
  });

  it('DB9: errors are captured with every logging category off', async () => {
    const b = await started({ storage: allOff() });

    win.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    diagnostics.emit('listener-error', { error: new Error('l'), type: 'changed', payload: {} });

    expect(b.log.get()).to.deep.equal({ generation: false, swallowed: false, actions: false });
    expect(errors(b).map(e => e.kind)).to.deep.equal(['uncaught', 'listener']);
  });

  it('the logging switches default to the saved setting when no storage is injected', async () => {
    localStorage.setItem(LOGGING_KEY, JSON.stringify({ actions: true }));

    const b = start({ storage: undefined });

    expect(b.log.get().actions).to.equal(true);
  });

  it('RC22b: when the store\'s open rejects, the history starts unsaved and ready still resolves', async () => {
    const swallowed = [];
    const off = diagnostics.on('swallowed', e => swallowed.push(e));
    // The store's open timer would fire after the test; it is never scheduled.
    const realSetTimeout = window.setTimeout;
    window.setTimeout = () => 0;
    let b;
    try {
      b = start({ idb: { open: () => null } });
    } finally {
      window.setTimeout = realSetTimeout;
    }
    b.bootComplete(devModeStore());

    await b.recorder.ready;
    off();

    expect(swallowed).to.have.length(1);
    expect(swallowed[0].where).to.equal('recorder.open');
    expect(swallowed[0].error).to.be.an.instanceOf(TypeError);
    expect(b.recorder.exportDocument().actions).to.deep.equal([]);
  });

  it('a change of storage status reaches the recorder', async () => {
    const b = await started();
    const statuses = [];
    b.recorder.on('storage', s => statuses.push(s));

    await deleteDb(name);

    expect(statuses).to.deep.equal(['lost']);
    expect(b.recorder.storageStatus()).to.equal('lost');
  });

  it('after a failed save, the next save rewrites the recorder\'s whole history', async () => {
    // Transactions: 1 the claim, 2 the merged history (fails), 3 the rewrite.
    const idb = failingIdb(indexedDB, { abort: { 2: { error: idbError('QuotaExceededError') } } });
    const b = start({ idb });
    const gs = devModeStore();
    b.bootComplete(gs);
    await b.recorder.ready;
    await idb.settle();
    const failing = b.recorder.storageStatus();
    b.tap.begin({ type: 'DESELECT' });
    b.tap.end({ type: 'DESELECT' });
    await idb.settle();

    expect(failing).to.equal('failing');
    expect(b.recorder.storageStatus()).to.equal('ok');
    const disk = await readDb(name);
    expect(disk.meta.start).to.deep.equal(b.recorder.snapshot().start);
    expect(disk.entries).to.deep.equal(b.recorder.snapshot().entries);
  });

  it('dispose removes the window listeners and the diagnostics subscriptions', async () => {
    const b = await started();
    const out = quietOut();
    const logged = boot({ win: new EventTarget(), dbName: name, out, fresh: false, storage: { getItem: () => null, setItem() {} } });
    boots.push(logged);

    b.dispose();
    logged.dispose();
    win.dispatchEvent(new ErrorEvent('error', { message: 'after dispose' }));
    diagnostics.emit('listener-error', { error: new Error('after dispose'), type: 'changed', payload: {} });
    diagnostics.emit('swallowed', { where: 'x', error: new Error('after dispose') });

    expect(errors(b)).to.deep.equal([]);
    expect(out.lines).to.deep.equal([]);
  });
});
