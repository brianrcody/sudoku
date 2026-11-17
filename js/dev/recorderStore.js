/**
 * @fileoverview IndexedDB persistence of the session history and tab ownership
 * (aspec-debug-instrumentation §5.6, §7). One record per entry; writes are
 * incremental, coalesced, and transactional; ownership is checked inside every
 * write transaction. Every failure is reported as a swallowed exception and
 * none interrupts recording.
 */

import { diagnostics } from '../util/events.js';
import { RECORDER_DB } from './devMode.js';

/** Stored-form number; bumped whenever the entry or position encoding changes. */
export const STORED_FORM = 1;

const DB_VERSION = 1;
const META = 'meta';
const ENTRIES = 'entries';
const META_KEY = 'history';

/**
 * @typedef {'ok'|'failing'|'lost'|'discarded'|'unavailable'} StoreStatus
 */

/**
 * @typedef {Object} OpenResult
 * @property {'loaded'|'empty'|'discarded'|'unavailable'} status
 * @property {import('./sessionCodec.js').PositionDoc} [start] - `loaded` only.
 * @property {Array<import('./sessionCodec.js').ActionEntry|import('./sessionCodec.js').ErrorEntry>} [entries]
 *   `loaded` only, in `seq` order.
 */

/**
 * @typedef {Object} RecorderStore
 * @property {function({discard?: boolean}=): Promise<OpenResult>} open - Never rejects.
 * @property {function({put?: object[], removeBelow?: number|null, start?: object|null}=): void} write
 * @property {function(object, object[]): void} replaceAll
 * @property {function(): StoreStatus} status
 * @property {function(): void} close
 */

const isObject = v => v !== null && typeof v === 'object';

/** Why a saved history cannot be used, or null when it can (aspec §7.3). */
function unreadable(record, stored) {
  if (record !== undefined && (!isObject(record) || record.form !== STORED_FORM)) {
    return `The saved history has an unknown stored form (${isObject(record) ? record.form : record}).`;
  }
  if ((record === undefined || record.start == null) && stored.length > 0) {
    return 'The saved history has entries but no starting position.';
  }
  if (stored.some(e => !isObject(e) || (!('a' in e) && !('e' in e)))) {
    return 'The saved history holds a malformed entry.';
  }
  return null;
}

/**
 * @param {Object} deps
 * @param {IDBFactory} [deps.idb] - Defaults to `globalThis.indexedDB`.
 * @param {string} [deps.dbName] - Defaults to `RECORDER_DB`; tests use their own.
 * @param {string} deps.ownerId - This page load's ownership token.
 * @param {function(): {start: object, entries: object[]}} deps.snapshot
 *   The recorder's current history, for full rewrites.
 * @param {function(StoreStatus): void} [deps.onStatus] - Called when `status()` changes.
 * @param {number} [deps.openTimeoutMs]
 * @returns {RecorderStore}
 */
export function createRecorderStore({ idb = globalThis.indexedDB, dbName = RECORDER_DB, ownerId,
                                      snapshot, onStatus = () => {}, openTimeoutMs = 2000 }) {
  /** @type {IDBDatabase|null} */
  let db = null;
  let closed = false;
  /** @type {'ok'|'failing'|'lost'|'unavailable'} */
  let save = 'ok';
  let discardedThisLoad = false;
  // After a failed write the next one rewrites everything from snapshot().
  let dirty = false;
  let inFlight = false;
  /**
   * Writes requested while a transaction is in flight, merged into one batch.
   * @type {null | {full: false, put: Map<number, object>, removeBelow: number|null, start: object|null}
   *              | {full: true, content: {start: object, entries: object[]}|null}}
   */
  let pending = null;

  function status() {
    if (save === 'lost') return 'lost';
    if (save === 'unavailable') return 'unavailable';
    if (save === 'failing') return 'failing';
    if (discardedThisLoad) return 'discarded';
    return 'ok';
  }

  function update(change) {
    const before = status();
    change();
    const after = status();
    if (after !== before) onStatus(after);
  }

  function swallow(where, error) {
    diagnostics.emit('swallowed', { where, error });
  }

  const claimRecord = start => ({ form: STORED_FORM, owner: ownerId, start });

  function open({ discard = false } = {}) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;

      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const unavailable = error => {
        if (settled) return;
        update(() => { save = 'unavailable'; });
        swallow('recorder.open', error);
        finish({ status: 'unavailable' });
      };

      // Read the saved history and take ownership in one transaction, so two
      // tabs opening at once serialise (aspec §7.4). `outcome` is the result
      // reported when the stores are wiped rather than read, and `reason` says
      // why a wiped history was discarded.
      const claim = (conn, wipe, outcome, reason = null) => {
        let result = null;
        let tx;
        try {
          tx = conn.transaction([META, ENTRIES], 'readwrite');
        } catch (error) {
          dropConnection(conn);
          unavailable(error);
          return;
        }
        const meta = tx.objectStore(META);
        const entries = tx.objectStore(ENTRIES);
        const wipeAndClaim = () => {
          meta.clear();
          entries.clear();
          meta.put(claimRecord(null), META_KEY);
        };

        if (wipe) {
          wipeAndClaim();
          result = { status: outcome };
        } else {
          const metaReq = meta.get(META_KEY);
          const allReq = entries.getAll();
          allReq.onsuccess = () => {
            const record = metaReq.result;
            const stored = allReq.result;
            reason = unreadable(record, stored);
            if (reason !== null) {
              wipeAndClaim();
              result = { status: 'discarded' };
            } else if (record === undefined || record.start == null) {
              meta.put(claimRecord(null), META_KEY);
              result = { status: 'empty' };
            } else {
              meta.put({ ...record, owner: ownerId }, META_KEY);
              result = { status: 'loaded', start: record.start, entries: stored };
            }
          };
        }

        tx.oncomplete = () => {
          if (settled) return;
          if (result.status === 'discarded') {
            update(() => { discardedThisLoad = true; });
            swallow('recorder.open', new Error(reason));
          }
          finish(result);
        };
        tx.onabort = () => {
          if (settled) return;
          swallow('recorder.open', tx.error);
          // A history that cannot be read is discarded: wipe it once, and give
          // up on storage if even that fails.
          if (wipe) {
            dropConnection(conn);
            update(() => { save = 'unavailable'; });
            finish({ status: 'unavailable' });
          } else {
            claim(conn, true, 'discarded', 'The saved history could not be read and was discarded.');
          }
        };
      };

      const connect = afterVersionError => {
        let req;
        try {
          req = idb.open(dbName, DB_VERSION);
        } catch (error) {
          unavailable(error);
          return;
        }
        req.onupgradeneeded = () => {
          const conn = req.result;
          if (!conn.objectStoreNames.contains(META)) conn.createObjectStore(META);
          if (!conn.objectStoreNames.contains(ENTRIES)) conn.createObjectStore(ENTRIES, { keyPath: 'seq' });
        };
        req.onerror = () => {
          const error = req.error;
          if (error?.name !== 'VersionError' || afterVersionError) {
            unavailable(error);
            return;
          }
          // A database from a newer build: delete it and reopen once.
          swallow('recorder.open', error);
          let del;
          try {
            del = idb.deleteDatabase(dbName);
          } catch (deleteError) {
            unavailable(deleteError);
            return;
          }
          del.onsuccess = () => connect(true);
          del.onerror = () => unavailable(del.error);
        };
        req.onsuccess = () => {
          const conn = req.result;
          if (settled || closed) {
            conn.close();
            finish({ status: 'unavailable' });
            return;
          }
          db = conn;
          // Another tab deleting or upgrading the database: let it, and stop saving.
          conn.onversionchange = () => {
            dropConnection(conn);
            update(() => { save = 'lost'; });
            swallow('recorder.write', new Error('The saved history was deleted or upgraded by another tab.'));
          };
          if (afterVersionError) claim(conn, true, 'discarded', 'The saved history was written by a newer build.');
          else if (discard) claim(conn, true, 'empty');
          else claim(conn, false);
        };
      };

      if (idb == null) {
        unavailable(new Error('IndexedDB is not available.'));
        return;
      }
      timer = setTimeout(() => {
        dropConnection(db);
        unavailable(new Error(`Opening the saved history timed out after ${openTimeoutMs} ms.`));
      }, openTimeoutMs);
      connect(false);
    });
  }

  function dropConnection(conn) {
    if (conn === null) return;
    conn.close();
    if (db === conn) db = null;
  }

  function canSave() {
    return !closed && db !== null && save !== 'lost' && save !== 'unavailable';
  }

  function failed(error) {
    dirty = true;
    update(() => { save = 'failing'; });
    swallow('recorder.write', error);
    flush();
  }

  /** Run the pending batch as one transaction, unless one is already in flight. */
  function flush() {
    if (inFlight || pending === null || !canSave()) return;
    const batch = pending;
    pending = null;
    const full = batch.full || dirty;

    let tx;
    try {
      tx = db.transaction([META, ENTRIES], 'readwrite');
    } catch (error) {
      failed(error);
      return;
    }
    inFlight = true;
    let ownershipLost = false;
    const meta = tx.objectStore(META);
    const entries = tx.objectStore(ENTRIES);

    const check = meta.get(META_KEY);
    check.onsuccess = () => {
      if (check.result?.owner !== ownerId) {
        ownershipLost = true;
        tx.abort();
        return;
      }
      if (full) {
        const content = batch.full && batch.content !== null ? batch.content : snapshot();
        entries.clear();
        meta.put(claimRecord(content.start), META_KEY);
        for (const entry of content.entries) entries.put(entry);
      } else {
        for (const entry of batch.put.values()) entries.put(entry);
        if (batch.removeBelow !== null) entries.delete(IDBKeyRange.upperBound(batch.removeBelow, true));
        if (batch.start !== null) meta.put(claimRecord(batch.start), META_KEY);
      }
    };

    tx.oncomplete = () => {
      inFlight = false;
      dirty = false;
      update(() => { if (save === 'failing') save = 'ok'; });
      flush();
    };
    tx.onabort = () => {
      inFlight = false;
      if (ownershipLost) {
        pending = null;
        update(() => { save = 'lost'; });
        swallow('recorder.write', new Error('Another tab has taken over the saved history.'));
        return;
      }
      failed(tx.error);
    };
  }

  function write({ put = [], removeBelow = null, start = null } = {}) {
    if (!canSave()) return;
    if (pending === null) pending = { full: false, put: new Map(), removeBelow: null, start: null };
    if (pending.full) {
      // An incremental write after a pending rewrite: rewrite the newest history.
      pending.content = null;
    } else {
      for (const entry of put) pending.put.set(entry.seq, entry);
      if (removeBelow !== null) pending.removeBelow = Math.max(pending.removeBelow ?? removeBelow, removeBelow);
      if (start !== null) pending.start = start;
    }
    flush();
  }

  function replaceAll(start, entries) {
    if (!canSave()) return;
    pending = { full: true, content: { start, entries } };
    flush();
  }

  function close() {
    closed = true;
    dropConnection(db);
  }

  return { open, write, replaceAll, status, close };
}
