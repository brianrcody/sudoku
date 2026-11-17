/**
 * @fileoverview IndexedDB stand-ins for the recorder-store tests
 * (tspec-debug-instrumentation §1.3, §5): a proxy around the real
 * `IDBFactory` that counts transactions and fails chosen ones, and fully fake
 * factories for opens that error, hang, or succeed late.
 */

/** A DOMException with the given name, as IndexedDB reports failures. */
export const idbError = (name, message = `${name} (injected)`) => new DOMException(message, name);

/**
 * Proxies a real `IDBFactory`. Every transaction the store requests is
 * counted from 1, across connections.
 *
 * @param {IDBFactory} real
 * @param {{
 *   abort?: Object<number, {error: DOMException, skipHandler?: boolean}>,
 *   throwOn?: number[],
 *   failOpen?: Object<number, DOMException>,
 * }} [script]
 *   `abort[n]`: transaction *n* aborts, reporting `error` as `tx.error`. It
 *   aborts once the store's first success handler in it has run, so whatever
 *   that handler wrote is rolled back with it; with `skipHandler` the handler
 *   never runs (a failed read); when the store sets no handler, it aborts at
 *   once, after the store has queued its requests.
 *   `throwOn`: transaction *n* cannot be started (`db.transaction` throws).
 *   `failOpen[n]`: the *n*-th `open` fails with that error.
 * @returns {IDBFactory & {transactions: number, settle: function(): Promise<void>}}
 *   `transactions` counts the transactions requested; `settle()` resolves once
 *   no transaction is in flight and none started in the meantime.
 */
export function failingIdb(real, { abort = {}, throwOn = [], failOpen = {} } = {}) {
  let opens = 0;
  let inFlight = 0;
  const wrapped = new WeakMap();

  const factory = {
    transactions: 0,

    open(name, version) {
      opens++;
      if (failOpen[opens]) return failedOpen(failOpen[opens]);
      return wrapOpenRequest(real.open(name, version));
    },

    deleteDatabase: name => real.deleteDatabase(name),

    async settle() {
      for (;;) {
        const seen = factory.transactions;
        await new Promise(r => setTimeout(r, 5));
        if (inFlight === 0 && factory.transactions === seen) return;
      }
    },
  };

  function wrapOpenRequest(req) {
    return {
      get result() { return wrapDb(req.result); },
      get error() { return req.error; },
      set onupgradeneeded(fn) { req.onupgradeneeded = fn; },
      set onsuccess(fn) { req.onsuccess = fn; },
      set onerror(fn) { req.onerror = fn; },
    };
  }

  function wrapDb(db) {
    if (!wrapped.has(db)) {
      wrapped.set(db, new Proxy(db, {
        get(target, prop) {
          if (prop === 'transaction') return (stores, mode) => transaction(target, stores, mode);
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      }));
    }
    return wrapped.get(db);
  }

  function transaction(db, stores, mode) {
    const n = ++factory.transactions;
    if (throwOn.includes(n)) throw idbError('InvalidStateError');
    const tx = db.transaction(stores, mode);
    inFlight++;
    const done = () => { inFlight--; };
    tx.addEventListener('complete', done);
    tx.addEventListener('abort', done);
    return abort[n] ? abortingTransaction(tx, abort[n]) : tx;
  }

  return factory;
}

function abortingTransaction(tx, { error, skipHandler = false }) {
  let aborted = false;
  let handlerSet = false;
  const abortNow = () => {
    if (aborted) return;
    aborted = true;
    tx.abort();
  };
  queueMicrotask(() => { if (!handlerSet) abortNow(); });

  const wrapRequest = req => ({
    get result() { return req.result; },
    set onsuccess(fn) {
      handlerSet = true;
      req.onsuccess = event => {
        if (!skipHandler) fn(event);
        abortNow();
      };
    },
  });

  const wrapStore = store => new Proxy(store, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const result = value.apply(target, args);
        return prop === 'get' || prop === 'getAll' ? wrapRequest(result) : result;
      };
    },
  });

  return new Proxy(tx, {
    get(target, prop) {
      if (prop === 'error') return aborted ? error : target.error;
      if (prop === 'objectStore') return name => wrapStore(target.objectStore(name));
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

/** An open request that fails with `error` on the next task. */
function failedOpen(error) {
  const req = { result: undefined, error, onsuccess: null, onerror: null, onupgradeneeded: null };
  setTimeout(() => req.onerror?.());
  return req;
}

/** A factory whose `open` fails with `error` on the next task. */
export function erroringIdb(error = idbError('UnknownError')) {
  return { open: () => failedOpen(error), deleteDatabase() { throw new Error('not expected'); } };
}

/** A factory whose `open` throws synchronously. */
export function throwingIdb(error = idbError('SecurityError')) {
  return { open() { throw error; } };
}

/** A factory whose open requests never settle. */
export function hangingIdb() {
  return { open: () => ({}) };
}

/**
 * A factory whose `open` succeeds after `delayMs` with a fake connection.
 *
 * @returns {{idb: IDBFactory, connection: {closed: number, transactions: number}}}
 */
export function lateIdb(delayMs) {
  const connection = {
    closed: 0,
    transactions: 0,
    close() { this.closed++; },
    transaction() { this.transactions++; throw new Error('not expected'); },
  };
  const idb = {
    open() {
      const req = { result: connection, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => req.onsuccess?.(), delayMs);
      return req;
    },
  };
  return { idb, connection };
}

/**
 * A factory whose `open` reports a `VersionError`, and whose
 * `deleteDatabase` throws (`deleteFails: 'throw'`) or fails (`'error'`).
 */
export function newerVersionIdb({ deleteFails }) {
  return {
    open: () => failedOpen(idbError('VersionError')),
    deleteDatabase() {
      if (deleteFails === 'throw') throw idbError('UnknownError');
      const req = { error: idbError('UnknownError'), onsuccess: null, onerror: null };
      setTimeout(() => req.onerror?.());
      return req;
    },
  };
}

// ── Direct access to a real database, for arranging and inspecting ───────────

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const txDone = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error);
});

/** Delete a database and wait for it to go. */
export function deleteDb(name) {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

/**
 * Create `name` with the recorder's stores and contents, as an earlier page
 * load would have left it.
 *
 * @param {string} name
 * @param {{meta?: *, entries?: object[], version?: number}} contents - `meta`
 *   is stored under `'history'` when present.
 */
export async function seedDb(name, { meta, entries = [], version = 1 } = {}) {
  const req = indexedDB.open(name, version);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('meta');
    req.result.createObjectStore('entries', { keyPath: 'seq' });
  };
  const db = await done(req);
  const tx = db.transaction(['meta', 'entries'], 'readwrite');
  if (meta !== undefined) tx.objectStore('meta').put(meta, 'history');
  for (const entry of entries) tx.objectStore('entries').put(entry);
  await txDone(tx);
  db.close();
}

/**
 * Read what is on disk, without ever creating the database.
 *
 * @returns {Promise<{meta: *, entries: object[]}|null>} null when the
 *   database or its stores do not exist.
 */
export async function readDb(name) {
  const req = indexedDB.open(name);
  req.onupgradeneeded = () => req.transaction.abort();
  let db;
  try {
    db = await done(req);
  } catch {
    return null;
  }
  try {
    if (!db.objectStoreNames.contains('meta')) return null;
    const tx = db.transaction(['meta', 'entries'], 'readonly');
    const [meta, entries] = await Promise.all([
      done(tx.objectStore('meta').get('history')),
      done(tx.objectStore('entries').getAll()),
    ]);
    return { meta, entries };
  } finally {
    db.close();
  }
}

/**
 * A factory whose `open` succeeds at once with a fake connection whose claim
 * transaction settles only when the test says so.
 *
 * @returns {{idb: IDBFactory, connection: {closed: number}, claim: {complete: function, abort: function}}}
 */
export function slowClaimIdb() {
  let tx = null;
  const request = () => ({ result: undefined, onsuccess: null });
  const store = { get: request, getAll: request, put() {}, clear() {} };
  const connection = {
    closed: 0,
    objectStoreNames: { contains: () => true },
    close() { this.closed++; },
    transaction() {
      tx = { error: idbError('AbortError'), objectStore: () => store, oncomplete: null, onabort: null };
      return tx;
    },
  };
  const idb = {
    open() {
      const req = { result: connection, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => req.onsuccess?.());
      return req;
    },
  };
  return { idb, connection, claim: { complete: () => tx.oncomplete(), abort: () => tx.onabort() } };
}

/** A factory whose `open` fails with `error` after `delayMs`. */
export function lateErroringIdb(delayMs, error = idbError('UnknownError')) {
  return {
    open() {
      const req = { result: undefined, error, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => req.onerror?.(), delayMs);
      return req;
    },
  };
}
