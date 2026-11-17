/**
 * @fileoverview The recorder's IndexedDB store (tspec-debug-instrumentation
 * RS1–RS23): load and claim, incremental and coalesced writes, failure and
 * recovery, discarded and unavailable histories, and tab ownership.
 *
 * Every test uses its own database, against real IndexedDB through
 * `failingIdb` (which also counts transactions and waits for them), and
 * deletes it afterwards. RS21 (one `swallowed` event per failure, no window
 * error) is asserted by every failure test and by the `afterEach` below.
 */

import { createRecorderStore, STORED_FORM } from '../../dev/recorderStore.js';
import { diagnostics } from '../../util/events.js';
import {
  failingIdb, erroringIdb, throwingIdb, hangingIdb, lateIdb, lateErroringIdb, slowClaimIdb, newerVersionIdb,
  idbError, seedDb, readDb, deleteDb,
} from '../helpers/fakeIdb.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const entry = seq => ({ seq, t: 1000 + seq, a: { type: 'SELECT_CELL', index: seq % 81 } });
const entries = (...seqs) => seqs.map(entry);
const start = id => ({ id });
const quota = () => idbError('QuotaExceededError');

let dbCounter = 0;

describe('dev/recorderStore.js', function () {
  this.timeout(10000);

  let name;
  let stores;
  let swallowed;
  let windowErrors;
  let offSwallowed;
  const onWindowError = e => windowErrors.push(e);

  beforeEach(() => {
    name = `test-recorder-store-${++dbCounter}-${Date.now()}`;
    stores = [];
    swallowed = [];
    windowErrors = [];
    offSwallowed = diagnostics.on('swallowed', e => swallowed.push(e));
    window.addEventListener('error', onWindowError);
  });

  afterEach(async () => {
    window.removeEventListener('error', onWindowError);
    offSwallowed();
    for (const store of stores) store.close();
    await deleteDb(name);
    expect(windowErrors, 'window errors').to.deep.equal([]);
  });

  /**
   * A store on this test's database. `snap` is what `snapshot()` returns;
   * `statuses` records every `onStatus` call.
   */
  function makeStore({ idb = failingIdb(indexedDB), ownerId = 'owner-A', snap = { start: start('snap'), entries: [] },
                       openTimeoutMs, statusListener = true } = {}) {
    const statuses = [];
    const store = createRecorderStore({
      idb, dbName: name, ownerId, snapshot: () => snap,
      ...(statusListener ? { onStatus: s => statuses.push(s) } : {}),
      ...(openTimeoutMs === undefined ? {} : { openTimeoutMs }),
    });
    stores.push(store);
    return { store, statuses, idb };
  }

  const wheres = () => swallowed.map(e => e.where);

  // ── Load and claim ───────────────────────────────────────────────────────

  it('RS1: opening a fresh database reports empty and claims it for this owner', async () => {
    const { store } = makeStore();

    const result = await store.open();

    expect(result).to.deep.equal({ status: 'empty' });
    expect((await readDb(name)).meta).to.deep.equal({ form: STORED_FORM, owner: 'owner-A', start: null });
    expect(store.status()).to.equal('ok');
    expect(swallowed).to.deep.equal([]);
  });

  it('RS2: a history written by one store is loaded by the next, entries in seq order', async () => {
    const a = makeStore();
    await a.store.open();
    a.store.replaceAll(start('S'), []);
    a.store.write({ put: [entry(3)] });
    a.store.write({ put: [entry(1)] });
    a.store.write({ put: [entry(2)] });
    await a.idb.settle();
    a.store.close();

    const result = await makeStore({ ownerId: 'owner-B' }).store.open();

    expect(result).to.deep.equal({ status: 'loaded', start: start('S'), entries: entries(1, 2, 3) });
  });

  it('RS3: opening with discard empties a saved history', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1, 2) });
    const { store } = makeStore();

    const result = await store.open({ discard: true });

    expect(result).to.deep.equal({ status: 'empty' });
    expect(await readDb(name)).to.deep.equal({
      meta: { form: STORED_FORM, owner: 'owner-A', start: null }, entries: [],
    });
    expect(store.status()).to.equal('ok');
  });

  describe('RS23: no meta record', () => {
    it('RS23a: with no entries the history is empty', async () => {
      await seedDb(name);
      const { store } = makeStore();

      expect(await store.open()).to.deep.equal({ status: 'empty' });
      expect(store.status()).to.equal('ok');
    });

    it('RS23b: with entries present the history is discarded', async () => {
      await seedDb(name, { entries: entries(1) });
      const { store } = makeStore();

      expect(await store.open()).to.deep.equal({ status: 'discarded' });
      expect(store.status()).to.equal('discarded');
      expect(await readDb(name)).to.deep.equal({
        meta: { form: STORED_FORM, owner: 'owner-A', start: null }, entries: [],
      });
      expect(wheres()).to.deep.equal(['recorder.open']);
    });
  });

  it('a meta record with no start and no entries is empty', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: null } });
    const { store } = makeStore();

    expect(await store.open()).to.deep.equal({ status: 'empty' });
  });

  // ── Writes ───────────────────────────────────────────────────────────────

  it('RS4: a trim deletes entries below removeBelow and replaces the start, with the new entry', async () => {
    const { store, idb } = makeStore();
    await store.open();
    store.replaceAll(start('S1'), entries(1, 2, 3));
    await idb.settle();

    store.write({ put: [entry(4)], removeBelow: 3, start: start('S2') });
    await idb.settle();

    const disk = await readDb(name);
    expect(disk.entries).to.deep.equal(entries(3, 4));
    expect(disk.meta.start).to.deep.equal(start('S2'));
  });

  it('RS5: a trim whose transaction aborts leaves neither the delete, the put, nor the new start', async () => {
    // Transactions: 1 claim, 2 replaceAll, 3 the trim.
    const { store, idb } = makeStore({ idb: failingIdb(indexedDB, { abort: { 3: { error: quota() } } }) });
    await store.open();
    store.replaceAll(start('S1'), entries(1, 2, 3));
    await idb.settle();

    store.write({ put: [entry(4)], removeBelow: 3, start: start('S2') });
    await idb.settle();

    const disk = await readDb(name);
    expect(disk.entries).to.deep.equal(entries(1, 2, 3));
    expect(disk.meta.start).to.deep.equal(start('S1'));
  });

  it('RS6: fifty synchronous writes take at most two transactions and all arrive in order', async () => {
    const { store, idb } = makeStore();
    await store.open();
    store.replaceAll(start('S'), []);
    await idb.settle();
    const before = idb.transactions;
    const seqs = Array.from({ length: 50 }, (_, i) => i + 1);

    for (const seq of seqs) store.write({ put: [entry(seq)] });
    await idb.settle();

    expect(idb.transactions - before).to.be.at.most(2);
    expect((await readDb(name)).entries).to.deep.equal(entries(...seqs));
  });

  it('RS7: coalesced trims keep the highest removeBelow and the latest start', async () => {
    const { store, idb } = makeStore();
    await store.open();
    store.replaceAll(start('S0'), []);
    await idb.settle();

    store.write({ put: [entry(1)] });
    store.write({ put: [entry(2)], removeBelow: 2, start: start('S2') });
    store.write({ put: [entry(3)], removeBelow: 1, start: start('S3') });
    await idb.settle();

    const disk = await readDb(name);
    expect(disk.entries).to.deep.equal(entries(2, 3));
    expect(disk.meta.start).to.deep.equal(start('S3'));
  });

  it('an entry written while a rewrite is pending is saved by rewriting the newest history', async () => {
    const snap = { start: start('S-new'), entries: entries(5, 6) };
    const { store, idb } = makeStore({ snap });
    await store.open();
    store.replaceAll(start('S0'), []);   // in flight

    store.replaceAll(start('S-pending'), entries(5));
    store.write({ put: [entry(6)] });
    await idb.settle();

    expect(await readDb(name)).to.deep.include({ entries: entries(5, 6) });
    expect((await readDb(name)).meta.start).to.deep.equal(start('S-new'));
  });

  // ── Failure and recovery ─────────────────────────────────────────────────

  it('RS8: after a failed write the next write rewrites everything from the snapshot', async () => {
    // Transactions: 1 claim, 2 replaceAll, 3 the failing write, 4 the rewrite.
    const snap = { start: start('S-snap'), entries: entries(2, 3) };
    const { store, statuses, idb } = makeStore({
      snap, idb: failingIdb(indexedDB, { abort: { 3: { error: quota() } } }),
    });
    await store.open();
    store.replaceAll(start('S1'), entries(1));
    await idb.settle();

    store.write({ put: [entry(2)] });
    await idb.settle();
    const failing = store.status();
    store.write({ put: [entry(3)] });
    await idb.settle();

    expect(failing).to.equal('failing');
    expect(statuses).to.deep.equal(['failing', 'ok']);
    expect(await readDb(name)).to.deep.equal({
      meta: { form: STORED_FORM, owner: 'owner-A', start: start('S-snap') }, entries: entries(2, 3),
    });
    expect(swallowed).to.have.length(1);
    expect(swallowed[0].where).to.equal('recorder.write');
    expect(swallowed[0].error.name).to.equal('QuotaExceededError');
  });

  it('RS8: a write whose transaction cannot be started fails and is recovered the same way', async () => {
    const snap = { start: start('S-snap'), entries: entries(1, 2) };
    const { store, statuses, idb } = makeStore({ snap, idb: failingIdb(indexedDB, { throwOn: [3] }) });
    await store.open();
    store.replaceAll(start('S1'), entries(1));
    await idb.settle();

    store.write({ put: [entry(2)] });
    const failing = store.status();
    store.write({ put: [entry(3)] });
    await idb.settle();

    expect(failing).to.equal('failing');
    expect(statuses).to.deep.equal(['failing', 'ok']);
    expect((await readDb(name)).entries).to.deep.equal(entries(1, 2));
    expect(wheres()).to.deep.equal(['recorder.write']);
  });

  it('RS9: a second failure keeps the status failing without repeating onStatus', async () => {
    const { store, statuses, idb } = makeStore({
      idb: failingIdb(indexedDB, { abort: { 3: { error: quota() }, 4: { error: quota() } } }),
    });
    await store.open();
    store.replaceAll(start('S1'), []);
    await idb.settle();

    store.write({ put: [entry(1)] });
    await idb.settle();
    store.write({ put: [entry(2)] });
    await idb.settle();

    expect(store.status()).to.equal('failing');
    expect(statuses).to.deep.equal(['failing']);
    expect(wheres()).to.deep.equal(['recorder.write', 'recorder.write']);
  });

  it('RS10: replaceAll while failing rewrites the history it is given and recovers', async () => {
    const { store, statuses, idb } = makeStore({ idb: failingIdb(indexedDB, { abort: { 3: { error: quota() } } }) });
    await store.open();
    store.replaceAll(start('S1'), entries(1));
    await idb.settle();
    store.write({ put: [entry(2)] });
    await idb.settle();

    store.replaceAll(start('S2'), entries(7, 8));
    await idb.settle();

    expect(await readDb(name)).to.deep.equal({
      meta: { form: STORED_FORM, owner: 'owner-A', start: start('S2') }, entries: entries(7, 8),
    });
    expect(store.status()).to.equal('ok');
    expect(statuses).to.deep.equal(['failing', 'ok']);
  });

  it('RS22: onStatus is called on each change of status only', async () => {
    const { store, statuses, idb } = makeStore({ idb: failingIdb(indexedDB, { abort: { 4: { error: quota() } } }) });
    await store.open();
    store.replaceAll(start('S'), []);
    await idb.settle();

    store.write({ put: [entry(1)] });
    await idb.settle();
    const afterOk = [...statuses];
    store.write({ put: [entry(2)] });
    await idb.settle();
    store.write({ put: [entry(3)] });
    await idb.settle();

    expect(afterOk).to.deep.equal([]);
    expect(statuses).to.deep.equal(['failing', 'ok']);
  });

  it('RS22: a failing save outranks the discarded notice, which returns when the save recovers', async () => {
    await seedDb(name, { meta: { form: 99 } });
    const { store, statuses, idb } = makeStore({ idb: failingIdb(indexedDB, { abort: { 3: { error: quota() } } }) });
    await store.open();
    store.replaceAll(start('S'), []);
    await idb.settle();

    store.write({ put: [entry(1)] });
    await idb.settle();
    const whileFailing = store.status();
    store.write({ put: [entry(2)] });
    await idb.settle();

    expect(whileFailing).to.equal('failing');
    expect(store.status()).to.equal('discarded');
    expect(statuses).to.deep.equal(['discarded', 'failing', 'discarded']);
  });

  // ── Storage unavailable ──────────────────────────────────────────────────

  describe('RS11: no IndexedDB', () => {
    it('open reports unavailable and writes do nothing', async () => {
      const { store, statuses } = makeStore({ idb: null });

      const result = await store.open();
      store.write({ put: [entry(1)] });
      store.replaceAll(start('S'), entries(1));

      expect(result).to.deep.equal({ status: 'unavailable' });
      expect(store.status()).to.equal('unavailable');
      expect(statuses).to.deep.equal(['unavailable']);
      expect(wheres()).to.deep.equal(['recorder.open']);
      expect(await readDb(name)).to.equal(null);
    });
  });

  describe('RS12: open fails', () => {
    it('an open request that errors reports unavailable', async () => {
      const error = idbError('UnknownError');
      const { store } = makeStore({ idb: erroringIdb(error) });

      expect(await store.open()).to.deep.equal({ status: 'unavailable' });
      expect(store.status()).to.equal('unavailable');
      expect(swallowed).to.deep.equal([{ where: 'recorder.open', error }]);
    });

    it('an open that throws reports unavailable', async () => {
      const error = idbError('SecurityError');
      const { store } = makeStore({ idb: throwingIdb(error) });

      expect(await store.open()).to.deep.equal({ status: 'unavailable' });
      expect(swallowed).to.deep.equal([{ where: 'recorder.open', error }]);
    });

    it('a claim transaction that cannot be started reports unavailable and writes nothing', async () => {
      const { store, idb } = makeStore({ idb: failingIdb(indexedDB, { throwOn: [1] }) });

      const result = await store.open();
      store.replaceAll(start('S'), entries(1));
      await idb.settle();

      expect(result).to.deep.equal({ status: 'unavailable' });
      expect(store.status()).to.equal('unavailable');
      expect(wheres()).to.deep.equal(['recorder.open']);
      expect((await readDb(name)).entries).to.deep.equal([]);
    });
  });

  it('RS13: an open that never settles reports unavailable after the timeout', async () => {
    const { store } = makeStore({ idb: hangingIdb(), openTimeoutMs: 10, statusListener: false });
    const t0 = performance.now();

    const result = await store.open();

    expect(result).to.deep.equal({ status: 'unavailable' });
    expect(performance.now() - t0).to.be.below(100);
    expect(wheres()).to.deep.equal(['recorder.open']);
  });

  it('RS14: a connection that arrives after the timeout is closed and never written', async () => {
    const { idb, connection } = lateIdb(50);
    const { store } = makeStore({ idb, openTimeoutMs: 10 });

    const result = await store.open();
    await wait(80);
    store.write({ put: [entry(1)] });

    expect(result).to.deep.equal({ status: 'unavailable' });
    expect(store.status()).to.equal('unavailable');
    expect(connection.closed).to.equal(1);
    expect(connection.transactions).to.equal(0);
    expect(wheres()).to.deep.equal(['recorder.open']);
  });

  it('RS14: an open that fails after the timeout reports nothing more', async () => {
    const { store } = makeStore({ idb: lateErroringIdb(50), openTimeoutMs: 10 });

    const result = await store.open();
    await wait(80);

    expect(result).to.deep.equal({ status: 'unavailable' });
    expect(wheres()).to.deep.equal(['recorder.open']);
  });

  for (const outcome of ['complete', 'abort']) {
    it(`RS14: a claim that ${outcome === 'complete' ? 'completes' : 'aborts'} after the timeout changes nothing`, async () => {
      const { idb, connection, claim } = slowClaimIdb();
      const { store, statuses } = makeStore({ idb, openTimeoutMs: 10 });

      const result = await store.open();
      claim[outcome]();

      expect(result).to.deep.equal({ status: 'unavailable' });
      expect(store.status()).to.equal('unavailable');
      expect(statuses).to.deep.equal(['unavailable']);
      expect(connection.closed).to.equal(1);
      expect(wheres()).to.deep.equal(['recorder.open']);
    });
  }

  // ── Unreadable saved history ─────────────────────────────────────────────

  describe('RS15: unknown stored form', () => {
    for (const [label, meta] of [['form 99', { form: 99, owner: 'old', start: start('S') }], ['not an object', 'history']]) {
      it(`a meta record with ${label} is discarded and the next write leaves only new content`, async () => {
        await seedDb(name, { meta, entries: entries(1, 2) });
        const { store, idb } = makeStore();

        const result = await store.open();
        store.replaceAll(start('S-new'), entries(9));
        await idb.settle();

        expect(result).to.deep.equal({ status: 'discarded' });
        expect(store.status()).to.equal('discarded');
        expect(await readDb(name)).to.deep.equal({
          meta: { form: STORED_FORM, owner: 'owner-A', start: start('S-new') }, entries: entries(9),
        });
        expect(wheres()).to.deep.equal(['recorder.open']);
      });
    }
  });

  it('RS16: an entry with neither an action nor an error is discarded', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: start('S') }, entries: [entry(1), { seq: 2, t: 5 }] });
    const { store } = makeStore();

    expect(await store.open()).to.deep.equal({ status: 'discarded' });
    expect((await readDb(name)).entries).to.deep.equal([]);
    expect(wheres()).to.deep.equal(['recorder.open']);
  });

  it('an entry history with no start is discarded', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: null }, entries: entries(1) });
    const { store } = makeStore();

    expect(await store.open()).to.deep.equal({ status: 'discarded' });
  });

  it('RS17: a read that fails during open discards the saved history', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1) });
    const error = idbError('UnknownError');
    const { store } = makeStore({ idb: failingIdb(indexedDB, { abort: { 1: { error, skipHandler: true } } }) });

    const result = await store.open();

    expect(result).to.deep.equal({ status: 'discarded' });
    expect(store.status()).to.equal('discarded');
    expect((await readDb(name)).entries).to.deep.equal([]);
    expect(swallowed[0]).to.deep.equal({ where: 'recorder.open', error });
    expect(wheres().every(w => w === 'recorder.open')).to.equal(true);
  });

  it('RS17: the discard after a failed read is reported as an unreadable history', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1) });
    const error = idbError('UnknownError');
    const { store } = makeStore({ idb: failingIdb(indexedDB, { abort: { 1: { error, skipHandler: true } } }) });

    await store.open();

    expect(swallowed).to.have.length(2);
    expect(swallowed[1].where).to.equal('recorder.open');
    expect(swallowed[1].error.message).to.equal('The saved history could not be read and was discarded.');
  });

  it('RS17: when the wipe after a failed read also fails, storage is unavailable', async () => {
    await seedDb(name, { meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1) });
    const error = idbError('UnknownError');
    const { store, idb } = makeStore({
      idb: failingIdb(indexedDB, { abort: { 1: { error, skipHandler: true }, 2: { error } } }),
    });

    const result = await store.open();
    store.write({ put: [entry(2)] });
    await idb.settle();

    expect(result).to.deep.equal({ status: 'unavailable' });
    expect(store.status()).to.equal('unavailable');
    expect((await readDb(name)).entries).to.deep.equal(entries(1));
    expect(wheres()).to.deep.equal(['recorder.open', 'recorder.open']);
  });

  describe('RS18: a database from a newer build (VersionError)', () => {
    it('RS18a: it is deleted and reopened, and the history is discarded', async () => {
      await seedDb(name, { version: 2, meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1) });
      const { store } = makeStore();

      const result = await store.open();

      expect(result).to.deep.equal({ status: 'discarded' });
      expect(store.status()).to.equal('discarded');
      expect(await readDb(name)).to.deep.equal({
        meta: { form: STORED_FORM, owner: 'owner-A', start: null }, entries: [],
      });
      expect(swallowed[0].where).to.equal('recorder.open');
      expect(swallowed[0].error.name).to.equal('VersionError');
    });

    it('RS18a: the discard is reported as a history written by a newer build', async () => {
      await seedDb(name, { version: 2, meta: { form: 1, owner: 'old', start: start('S') }, entries: entries(1) });
      const { store } = makeStore();

      await store.open();

      expect(swallowed).to.have.length(2);
      expect(swallowed[1].where).to.equal('recorder.open');
      expect(swallowed[1].error.message).to.equal('The saved history was written by a newer build.');
    });

    it('RS18b: when the reopen fails, storage is unavailable', async () => {
      await seedDb(name, { version: 2 });
      const error = idbError('UnknownError');
      const { store } = makeStore({ idb: failingIdb(indexedDB, { failOpen: { 2: error } }) });

      const result = await store.open();

      expect(result).to.deep.equal({ status: 'unavailable' });
      expect(store.status()).to.equal('unavailable');
      expect(swallowed.map(e => e.error.name)).to.deep.equal(['VersionError', 'UnknownError']);
      expect(wheres()).to.deep.equal(['recorder.open', 'recorder.open']);
    });

    for (const deleteFails of ['throw', 'error']) {
      it(`RS18: when deleting the newer database ${deleteFails === 'throw' ? 'throws' : 'fails'}, storage is unavailable`, async () => {
        const { store } = makeStore({ idb: newerVersionIdb({ deleteFails }) });

        const result = await store.open();

        expect(result).to.deep.equal({ status: 'unavailable' });
        expect(swallowed.map(e => e.error.name)).to.deep.equal(['VersionError', 'UnknownError']);
      });
    }
  });

  // ── Ownership ────────────────────────────────────────────────────────────

  it('RS19: a store that has been taken over stops saving for good', async () => {
    const a = makeStore({ ownerId: 'owner-A' });
    await a.store.open();
    a.store.replaceAll(start('S'), entries(1));
    await a.idb.settle();
    const b = makeStore({ ownerId: 'owner-B' });
    await b.store.open();

    a.store.write({ put: [entry(2)] });
    await a.idb.settle();
    const lostAfterWrite = a.store.status();
    const transactionsWhenLost = a.idb.transactions;
    b.store.close();
    a.store.write({ put: [entry(3)] });
    a.store.replaceAll(start('S2'), entries(3));
    await a.idb.settle();

    expect(lostAfterWrite).to.equal('lost');
    expect(a.statuses).to.deep.equal(['lost']);
    expect(a.store.status()).to.equal('lost');
    expect(a.idb.transactions).to.equal(transactionsWhenLost);
    expect(await readDb(name)).to.deep.equal({
      meta: { form: STORED_FORM, owner: 'owner-B', start: start('S') }, entries: entries(1),
    });
    expect(wheres()).to.deep.equal(['recorder.write']);
  });

  it('RS20: deleting the database from elsewhere closes the store, which reports lost', async () => {
    const { store, statuses, idb } = makeStore();
    await store.open();
    let blocked = false;

    await new Promise(resolve => {
      const req = indexedDB.deleteDatabase(name);
      req.onblocked = () => { blocked = true; };
      req.onsuccess = resolve;
    });
    store.write({ put: [entry(1)] });
    await idb.settle();

    expect(blocked).to.equal(false);
    expect(store.status()).to.equal('lost');
    expect(statuses).to.deep.equal(['lost']);
    expect(wheres()).to.deep.equal(['recorder.write']);
    expect(await readDb(name)).to.equal(null);
  });

  it('a closed store writes nothing', async () => {
    const { store, idb } = makeStore();
    await store.open();

    store.close();
    store.replaceAll(start('S'), entries(1));
    await idb.settle();

    expect((await readDb(name)).entries).to.deep.equal([]);
  });
});
