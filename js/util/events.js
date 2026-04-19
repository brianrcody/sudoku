/**
 * @fileoverview Tiny typed event emitter factory.
 */

/**
 * @typedef {Object} Emitter
 * @property {function(string, function): function} on
 * @property {function(string, function): void} off
 * @property {function(string, *=): void} emit
 * @property {function(string=): void} clear
 */

/**
 * Creates a new event emitter.
 *
 * - `on` returns an unsubscribe function; calling it more than once is a no-op.
 * - `emit` invokes listeners synchronously in registration order.
 * - Listeners added during an emit do not fire for the in-flight emission.
 * - Listeners removed during an emit do not fire for the remainder of that
 *   emission if they have not yet been called.
 * - Re-entrant emit calls run to completion before the outer emit resumes.
 * - If a listener throws, the error is logged and remaining listeners still fire.
 *
 * @returns {Emitter}
 */
export function createEmitter() {
  /** @type {Map<string, Array<function|null>>} */
  const map = new Map();

  function getListeners(type) {
    let ls = map.get(type);
    if (!ls) {
      ls = [];
      map.set(type, ls);
    }
    return ls;
  }

  function on(type, listener) {
    getListeners(type).push(listener);
    let removed = false;
    return function unsubscribe() {
      if (removed) return;
      removed = true;
      off(type, listener);
    };
  }

  function off(type, listener) {
    const ls = map.get(type);
    if (!ls) return;
    // Null out in place so any in-progress emit snapshot is not affected,
    // and so the emit loop can skip removed entries.
    const idx = ls.indexOf(listener);
    if (idx !== -1) ls[idx] = null;
  }

  function emit(type, payload) {
    const ls = map.get(type);
    if (!ls) return;

    // Snapshot the current length so listeners added during this emit are
    // excluded from this pass.
    const len = ls.length;
    for (let i = 0; i < len; i++) {
      const fn = ls[i];
      if (!fn) continue;  // removed during this emit
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }

    // Compact nulls introduced during this emit pass.
    // We only compact if something was nulled to avoid churning on the common path.
    let hasNulls = false;
    for (let i = 0; i < len; i++) {
      if (ls[i] === null) { hasNulls = true; break; }
    }
    if (hasNulls) {
      const compacted = ls.filter(fn => fn !== null);
      ls.length = 0;
      ls.push(...compacted);
    }
  }

  function clear(type) {
    if (type === undefined) {
      map.clear();
    } else {
      map.delete(type);
    }
  }

  return { on, off, emit, clear };
}
