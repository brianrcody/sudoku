/**
 * @fileoverview Developer-mode flag. This is the only developer module loaded
 * when the mode is off; the tooling itself (devPanel.js) is imported lazily.
 */

import { getItem, setItem, removeItem } from '../persist/storage.js';

const STORAGE_KEY = 'sudoku.dev.v1';

/** IndexedDB database holding the session history (aspec-debug-instrumentation §5.6). */
export const RECORDER_DB = 'sudoku-dev-recorder';

let _on = false;
let _fresh = false;

/**
 * Resolve the flag once at boot: `?dev=1` turns it on and saves it, `?dev=0`
 * turns it off, clears it and deletes the saved session history, anything
 * else keeps the saved setting.
 *
 * @param {string} search - `location.search`.
 * @returns {boolean}
 */
export function initDevMode(search) {
  const param = new URLSearchParams(search).get('dev');
  if (param === '1') {
    _on = true;
    _fresh = getItem(STORAGE_KEY) !== true;
    setItem(STORAGE_KEY, true);
  } else if (param === '0') {
    _on = false;
    _fresh = false;
    removeItem(STORAGE_KEY);
    try {
      indexedDB.deleteDatabase(RECORDER_DB);
    } catch {
      // Storage unavailable: nothing to purge. Not reported: the mode is going off.
    }
  } else {
    _on = getItem(STORAGE_KEY) === true;
    _fresh = false;
  }
  return _on;
}

/**
 * @returns {boolean} Whether developer mode is on. False before `initDevMode`.
 */
export function isDevMode() {
  return _on;
}

/**
 * @returns {boolean} Whether this load is the one that turned developer mode
 *   on (`?dev=1` while it was off), which starts a new session history
 *   (fspec-007 §3.3). False on every other path.
 */
export function isFreshDevSession() {
  return _fresh;
}
