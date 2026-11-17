/**
 * @fileoverview Manual clock for tests (tspec-debug-instrumentation §1.3):
 * replaces `setTimeout`, `clearTimeout` and `Date.now` on `window` until
 * `uninstall()`. Callbacks run only from `advance(ms)`, in due-time order
 * (ties in scheduling order), including callbacks scheduled by a callback
 * that fall due within the same advance.
 *
 * Mocha keeps its own references to the real timers, so its timeouts are
 * unaffected. A test using this clock must not await a macrotask while it is
 * installed.
 */

/**
 * @param {number} [start] - The initial `Date.now()`, epoch milliseconds.
 * @returns {{ now: function(): number, advance: function(number): void,
 *   pending: function(): number, uninstall: function(): void }}
 */
export function installFakeClock(start = Date.UTC(2026, 10, 16, 9, 0, 0)) {
  const real = { setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, now: Date.now };
  let time = start;
  let nextId = 1;
  /** @type {Map<number, {due: number, fn: function, args: Array}>} */
  const timers = new Map();

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { due: time + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); };
  Date.now = () => time;

  function nextDue(limit) {
    let best = null;
    for (const [id, t] of timers) {
      if (t.due <= limit && (best === null || t.due < best[1].due)) best = [id, t];
    }
    return best;
  }

  return {
    now: () => time,
    advance(ms) {
      const limit = time + ms;
      for (let due = nextDue(limit); due !== null; due = nextDue(limit)) {
        const [id, t] = due;
        timers.delete(id);
        time = t.due;
        t.fn(...t.args);
      }
      time = limit;
    },
    pending: () => timers.size,
    uninstall() {
      window.setTimeout = real.setTimeout;
      window.clearTimeout = real.clearTimeout;
      Date.now = real.now;
    },
  };
}
