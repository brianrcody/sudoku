/**
 * @fileoverview Logging switches and console writers (aspec-debug-instrumentation
 * §10.1). Three categories, each written to the console with its tag while on.
 * The switches are read once from storage and written back on every change.
 */

import { createEmitter, diagnostics } from '../util/events.js';
import { getItem, setItem } from '../persist/storage.js';

/** Storage key of the switches; survives `?dev=0` (aspec §5.6). */
export const LOGGING_KEY = 'sudoku.dev.logging.v1';

/**
 * The logging categories, keyed by the name the API uses.
 * @type {Readonly<Object<string, {tag: string, label: string, def: boolean}>>}
 */
export const CATEGORIES = Object.freeze({
  generation: Object.freeze({ tag: '[dev:gen]', label: 'Generation worker', def: true }),
  swallowed: Object.freeze({ tag: '[dev:swallowed]', label: 'Swallowed exceptions', def: true }),
  actions: Object.freeze({ tag: '[dev:action]', label: 'Action trace', def: false }),
});

/**
 * @typedef {{generation: boolean, swallowed: boolean, actions: boolean}} LogSwitches
 */

/**
 * @typedef {Object} DevLog
 * @property {function(): LogSwitches} get - A copy of the current switches.
 * @property {function(string, boolean): boolean} set - Sets one switch; true when it changed.
 * @property {function(string, function): function} on - `'change'` with the switches; returns an unsubscribe.
 * @property {function(object, string[], number): void} action - Writes the action trace line.
 * @property {function(): void} dispose - Removes the diagnostics subscriptions.
 */

function readSwitches(storage) {
  const saved = storage.getItem(LOGGING_KEY);
  const switches = {};
  for (const [name, { def }] of Object.entries(CATEGORIES)) {
    const value = saved !== null && typeof saved === 'object' ? saved[name] : undefined;
    switches[name] = typeof value === 'boolean' ? value : def;
  }
  return switches;
}

/**
 * Build the developer log. Category names are checked by the caller
 * (the controller, aspec §11.2).
 *
 * @param {{out?: {log: function, warn: function},
 *          storage?: {getItem: function(string): *, setItem: function(string, *): void}}} [deps]
 *   `out` defaults to `console`, `storage` to `persist/storage.js`.
 * @returns {DevLog}
 */
export function createDevLog({ out = console, storage = { getItem, setItem } } = {}) {
  const switches = readSwitches(storage);
  const emitter = createEmitter({ reportErrors: false });

  const subscriptions = [
    diagnostics.on('generation', data => {
      if (switches.generation) out.log(CATEGORIES.generation.tag, data.event, data);
    }),
    diagnostics.on('swallowed', ({ where, error }) => {
      if (switches.swallowed) out.warn(CATEGORIES.swallowed.tag, where, error);
    }),
  ];

  return {
    get: () => ({ ...switches }),

    set(category, on) {
      if (switches[category] === on) return false;
      switches[category] = on;
      storage.setItem(LOGGING_KEY, { ...switches });
      emitter.emit('change', { ...switches });
      return true;
    },

    on: emitter.on,

    /**
     * @param {{a: object, f?: object[]}} entry - A depth-0 action entry.
     * @param {string[]} changedParts - Fingerprint parts the action changed.
     * @param {number} ms - Time from `begin` to `end`, listeners included.
     */
    action(entry, changedParts, ms) {
      if (!switches.actions) return;
      const actionDoc = entry.f === undefined ? entry.a : { ...entry.a, then: entry.f };
      out.log(CATEGORIES.actions.tag, entry.a.type, actionDoc,
        changedParts.length ? changedParts : 'no change', `${ms.toFixed(1)} ms`);
    },

    dispose() {
      for (const unsubscribe of subscriptions) unsubscribe();
      emitter.clear();
    },
  };
}
