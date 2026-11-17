/**
 * @fileoverview The session history (aspec-debug-instrumentation §6): the
 * dispatch tap, entries, follow-ups, "changed nothing", capacity and the
 * starting position, captured errors, the boot merge, and export.
 *
 * Nothing here may throw into the game: the tap's bodies and `captureError`
 * contain every failure, and a capture requested while one is in progress is
 * dropped (§10.3).
 */

import {
  KINDS, encodeAction, encodePosition, fingerprint, isInformational, buildDocument,
} from './sessionCodec.js';
import { createMachine, applyEntry } from './machine.js';

/** Maximum number of entries, actions and errors together (fspec §3.2). */
export const RECORDER_CAPACITY = 5000;

/**
 * The position of a game store before anything is loaded. The history starts
 * here when the live position at boot could not be encoded.
 *
 * @returns {import('./sessionCodec.js').PositionDoc}
 */
function emptyPosition() {
  return {
    puzzle: null,
    board: '0'.repeat(81),
    pencil: Array.from({ length: 81 }, () => []),
    selected: null,
    mode: 'pen',
    hintsRemaining: 0,
    attemptRecorded: false,
    won: false,
    incorrect: [],
    highlightPending: false,
    completionMessage: '',
    undo: null,
    generating: null,
    coach: null,
  };
}

/**
 * @typedef {Object} CapturedError
 * @property {'uncaught'|'rejection'|'listener'} kind
 * @property {string} message
 * @property {string|null} [stack]
 * @property {string|null} [source]
 * @property {string|null} [action] - Action type; listener errors only.
 */

/**
 * @typedef {Object} RecorderCounts
 * @property {number} actions
 * @property {number} errors
 * @property {number} capacity
 * @property {boolean} atCapacity
 */

/**
 * @typedef {Object} ErrorItem - As in the replay report (aspec §5.7).
 * @property {string} kind
 * @property {number} afterAction - Action entries preceding the error.
 * @property {string} message
 * @property {number} count
 */

/**
 * @typedef {Object} Recorder
 * @property {import('../game/state.js').DispatchTap} tap - Never throws.
 * @property {function(*): void} noteHint - Called by the wrapped hint provider.
 * @property {function({getState: function}): void} bootComplete
 *   Ends boot suppression and fixes the boot position.
 * @property {Promise<void>} ready - The saved history is merged, or absent.
 * @property {function(CapturedError): void} captureError
 * @property {function(): RecorderCounts} counts
 * @property {function(): string} storageStatus - The store's `status()`.
 * @property {function(): import('./sessionCodec.js').SessionDocument} exportDocument
 * @property {function(): {actions: number, errors: number}} clear - Counts removed.
 * @property {function(object, object[]): void} replaceHistory - Replay hand-over.
 * @property {function(function): *} silently - The next depth-0 action is not recorded.
 * @property {function(): number} mark
 * @property {function(number): ErrorItem[]} errorsSince - Errors captured since `mark()`.
 * @property {function(string, function): function} on - `'change'` (counts), `'storage'` (status).
 * @property {function(): {start: object, entries: object[]}} snapshot
 *   The store's `snapshot` collaborator.
 * @property {function(string): void} storageChanged - The store's `onStatus` collaborator.
 */

/**
 * @param {Object} deps
 * @param {{write: function, replaceAll: function, status: function}} deps.store
 * @param {{action: function(object, string[], number): void}} deps.log
 * @param {Promise<import('./recorderStore.js').OpenResult>} deps.opened
 *   The store's `open()`; the history is merged when it settles and boot is complete.
 * @param {number} [deps.capacity]
 * @param {function(): number} [deps.now] - Epoch milliseconds.
 * @param {function(): number} [deps.clock] - High-resolution milliseconds, for the action trace.
 * @returns {Recorder}
 */
export function createRecorder({ store, log, opened, capacity = RECORDER_CAPACITY, now = Date.now,
                                 clock = () => performance.now() }) {
  /** @type {Map<string, Set<function>>} */
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }

  // A failing listener is logged and contained, as the app's emitters do; it
  // is not captured, so a panel bug cannot feed the history.
  function emit(event, payload) {
    for (const fn of [...(listeners.get(event) ?? [])]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** @type {Array<object>} Entries in issue order. */
  let entries = [];
  let nActions = 0;
  let nErrors = 0;
  /** @type {import('./sessionCodec.js').PositionDoc|null} */
  let start = null;
  /** Machine at the starting position; advanced as entries leave at capacity. */
  let base = null;
  let nextSeq = 1;
  // Before the merge, entries stay in memory and are numbered at the merge.
  let merged = false;

  let gameState = null;
  let suppressed = true;
  let silentNext = false;
  let capturing = false;

  /** Open public dispatches, outermost first. */
  const frames = [];
  /** The open depth-0 frame that is being recorded, or that was unrecordable. */
  let open = null;

  /** Error entries in capture order, for `mark` / `errorsSince`. */
  const raised = [];

  let bootTime = 0;
  let reloadAction = null;
  let resolveBoot;
  const booted = new Promise(resolve => { resolveBoot = resolve; });

  function counts() {
    return { actions: nActions, errors: nErrors, capacity, atCapacity: entries.length >= capacity };
  }

  function changed() {
    emit('change', counts());
  }

  function append(entry) {
    if (merged) entry.seq = nextSeq++;
    entries.push(entry);
    if ('a' in entry) nActions++;
    else nErrors++;
  }

  /**
   * Remove the oldest entries beyond capacity, applying discarded actions to
   * the base machine so the remaining entries still reproduce every later
   * position (§6.4).
   *
   * @returns {{removeBelow: number, start: object}|null} What the store must
   *   also write, or null when nothing was removed.
   */
  function trim() {
    if (entries.length <= capacity) return null;
    let removed = null;
    while (entries.length > capacity) {
      removed = entries.shift();
      if ('a' in removed) {
        nActions--;
        applyEntry(base, removed);
      } else {
        nErrors--;
      }
    }
    start = encodePosition(base.getState());
    return { removeBelow: entries.length > 0 ? entries[0].seq : removed.seq + 1, start };
  }

  function persist(entry, trimmed) {
    if (!merged) return;
    store.write(trimmed === null ? { put: [entry] } : { put: [entry], ...trimmed });
  }

  function captureError(e) {
    if (capturing) return;
    capturing = true;
    try {
      const last = entries[entries.length - 1];
      const error = {
        kind: e.kind,
        message: e.message,
        stack: e.stack ?? null,
        source: e.source ?? null,
        action: e.action ?? null,
      };
      let entry;
      let trimmed = null;
      if (last !== undefined && 'e' in last && last.e.kind === error.kind && last.e.message === error.message
          && last.e.stack === error.stack && last.e.source === error.source) {
        entry = last;
        entry.n++;
      } else {
        entry = { t: now(), n: 1, e: error };
        append(entry);
        raised.push(entry);
        // An action's own entry is trimmed only once it is complete, at `end`.
        if (open === null && merged) trimmed = trim();
      }
      changed();
      persist(entry, trimmed);
    } catch {
      // Dropped: capturing never triggers further capture.
    } finally {
      capturing = false;
    }
  }

  function captureFailure(err) {
    captureError({
      kind: 'uncaught',
      message: String(err?.message ?? err),
      stack: err?.stack ?? null,
    });
  }

  function captureUnrecordable(action) {
    captureError({ kind: 'uncaught', message: `Unrecordable action: ${action?.type}` });
  }

  const tap = {
    begin(action) {
      const frame = { kind: 'ignored', entry: null, before: null, started: 0 };
      frames.push(frame);
      try {
        if (suppressed) return;
        if (open !== null) {
          // A follow-up: a public dispatch made while an action is applied.
          frame.kind = 'follow-up';
          if (open.entry === null) return;
          const doc = encodeAction(action);
          if (doc === null) captureUnrecordable(action);
          else (open.entry.f ??= []).push(doc);
          return;
        }
        if (silentNext) {
          silentNext = false;
          frame.kind = 'silent';
          return;
        }
        frame.kind = 'top';
        open = frame;
        const a = encodeAction(action);
        if (a === null) {
          captureUnrecordable(action);
          return;
        }
        frame.entry = { t: now(), a };
        append(frame.entry);
        frame.before = fingerprint(gameState.getState());
        frame.started = clock();
      } catch (err) {
        captureFailure(err);
      }
    },

    end() {
      const frame = frames.pop();
      if (frame?.kind !== 'top') return;
      open = null;
      try {
        if (frame.entry === null || frame.before === null) return;
        const ms = clock() - frame.started;
        const entry = frame.entry;
        const after = fingerprint(gameState.getState());
        const parts = Object.keys(after).filter(part => after[part] !== frame.before[part]);
        if (parts.length === 0 && !isInformational(entry.a)) entry.nc = true;
        const trimmed = merged ? trim() : null;
        persist(entry, trimmed);
        log.action(entry, parts, ms);
        changed();
      } catch (err) {
        captureFailure(err);
      }
    },
  };

  function noteHint(hint) {
    try {
      if (open?.entry != null && open.entry.a.type === 'HINT') {
        open.entry.a.hint = KINDS.HINT.encode({ type: 'HINT', hint }).hint;
      }
    } catch (err) {
      captureFailure(err);
    }
  }

  function bootComplete(gs) {
    gameState = gs;
    try {
      bootTime = now();
      reloadAction = KINDS.PAGE_RELOADED.encode({ type: 'PAGE_RELOADED', position: gs.getState() });
    } catch (err) {
      captureFailure(err);
    }
    suppressed = false;
    resolveBoot();
  }

  /**
   * Combine the saved history with what was recorded since boot (§6.5). When
   * the boot position could not be encoded there is no reload entry to join a
   * saved history with, so a new history starts at the empty position.
   */
  function merge(result) {
    const postBoot = entries;
    entries = [];
    nActions = 0;
    nErrors = 0;
    merged = true;
    if (result.status === 'loaded' && reloadAction !== null) {
      start = result.start;
      for (const entry of result.entries) {
        entries.push(entry);
        if ('a' in entry) nActions++;
        else nErrors++;
      }
      nextSeq = entries.length > 0 ? entries[entries.length - 1].seq + 1 : 1;
      const reload = { t: bootTime, a: reloadAction };
      for (const entry of [reload, ...postBoot]) append(entry);
      base = createMachine(start);
      const trimmed = trim();
      store.write({ put: [reload, ...postBoot], ...(trimmed ?? {}) });
    } else {
      start = reloadAction === null ? emptyPosition() : reloadAction.position;
      nextSeq = 1;
      for (const entry of postBoot) append(entry);
      base = createMachine(start);
      trim();
      if (result.status !== 'unavailable') store.replaceAll(start, entries);
    }
  }

  const ready = Promise.all([opened, booted]).then(([result]) => {
    try {
      merge(result);
    } catch (err) {
      captureFailure(err);
    }
    changed();
  });

  /** Start a new history at `newStart` with `newEntries`, numbering continuing. */
  function reset(newStart, newEntries) {
    start = newStart;
    entries = [];
    nActions = 0;
    nErrors = 0;
    for (const entry of newEntries) append(entry);
    base = createMachine(start);
    trim();
    store.replaceAll(start, entries);
    changed();
  }

  function clear() {
    const removed = { actions: nActions, errors: nErrors };
    reset(encodePosition(gameState.getState()), []);
    return removed;
  }

  function replaceHistory(newStart, newEntries) {
    reset(structuredClone(newStart), newEntries.map(({ seq, ...entry }) => structuredClone(entry)));
  }

  function silently(fn) {
    silentNext = true;
    try {
      return fn();
    } finally {
      silentNext = false;
    }
  }

  function errorsSince(mark) {
    const items = [];
    for (const entry of raised.slice(mark)) {
      const index = entries.indexOf(entry);
      if (index === -1) continue;
      const afterAction = entries.slice(0, index).filter(e => 'a' in e).length;
      items.push({ kind: entry.e.kind, afterAction, message: entry.e.message, count: entry.n });
    }
    return items;
  }

  return {
    tap,
    noteHint,
    bootComplete,
    ready,
    captureError,
    counts,
    storageStatus: () => store.status(),
    exportDocument: () => buildDocument({ start, entries, exportedAt: now() }),
    clear,
    replaceHistory,
    silently,
    mark: () => raised.length,
    errorsSince,
    on,
    snapshot: () => ({ start, entries }),
    storageChanged: status => emit('storage', status),
  };
}
