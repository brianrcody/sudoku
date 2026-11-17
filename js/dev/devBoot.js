/**
 * @fileoverview Early developer bootstrap (aspec-debug-instrumentation §6.5,
 * §10.3). Imported by `main.js` at step 1.5, before the game state exists:
 * builds the log, the store and the recorder, installs error capture, and
 * starts opening the saved history.
 */

import { createRecorder, RECORDER_CAPACITY } from './recorder.js';
import { createRecorderStore } from './recorderStore.js';
import { createDevLog } from './devLog.js';
import { isFreshDevSession, RECORDER_DB } from './devMode.js';
import { diagnostics } from '../util/events.js';

/**
 * @typedef {Object} DevBoot
 * @property {import('../game/state.js').DispatchTap} tap
 * @property {import('./recorder.js').Recorder} recorder
 * @property {import('./devLog.js').DevLog} log
 * @property {function({nextHint: function}): {nextHint: function}} wrapHintProvider
 *   Reports each live hint to the recorder.
 * @property {function({getState: function}): void} bootComplete
 *   Call after the restore burst: recording starts here.
 * @property {function(): void} dispose - Removes every listener and subscription
 *   and closes the store's connection. Production never calls it.
 */

function ownerToken(now) {
  return `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * @param {Object} [deps] - Test seams; `main.js` passes none.
 * @param {Window} [deps.win]
 * @param {IDBFactory} [deps.idb]
 * @param {string} [deps.dbName]
 * @param {{getItem: function, setItem: function}} [deps.storage]
 *   The logging switches' storage; `devLog` defaults it to `persist/storage.js`.
 * @param {{log: function, warn: function}} [deps.out]
 * @param {function(): number} [deps.now]
 * @param {boolean} [deps.fresh] - Developer mode was just turned on: start a new history.
 * @param {number} [deps.capacity]
 * @returns {DevBoot}
 */
export function boot({ win = window, idb = globalThis.indexedDB, dbName = RECORDER_DB, storage,
                       out = console, now = Date.now, fresh = isFreshDevSession(),
                       capacity = RECORDER_CAPACITY } = {}) {
  const log = createDevLog(storage === undefined ? { out } : { out, storage });

  let recorder = null;
  const store = createRecorderStore({
    idb,
    dbName,
    ownerId: ownerToken(now),
    snapshot: () => recorder.snapshot(),
    onStatus: status => recorder?.storageChanged(status),
  });
  // open() never rejects by contract; a rejection is a defect, treated as no storage.
  const opened = store.open({ discard: fresh }).catch(error => {
    diagnostics.emit('swallowed', { where: 'recorder.open', error });
    return { status: 'unavailable' };
  });
  recorder = createRecorder({ store, log, opened, capacity, now });

  const onError = e => recorder.captureError({
    kind: 'uncaught',
    message: String(e.message),
    stack: e.error?.stack ?? null,
    source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null,
    action: null,
  });
  const onRejection = e => recorder.captureError({
    kind: 'rejection',
    message: String(e.reason?.message ?? e.reason),
    stack: e.reason?.stack ?? null,
    source: null,
    action: null,
  });
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  const offListenerError = diagnostics.on('listener-error', ({ error, payload }) => recorder.captureError({
    kind: 'listener',
    message: String(error?.message ?? error),
    stack: error?.stack ?? null,
    source: null,
    action: payload?.action?.type ?? null,
  }));

  return {
    tap: recorder.tap,
    recorder,
    log,
    wrapHintProvider: provider => ({
      nextHint: (...args) => {
        const hint = provider.nextHint(...args);
        recorder.noteHint(hint);
        return hint;
      },
    }),
    bootComplete: gameState => recorder.bootComplete(gameState),
    dispose() {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      offListenerError();
      log.dispose();
      store.close();
    },
  };
}
