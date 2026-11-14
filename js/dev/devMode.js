/**
 * @fileoverview Developer-mode flag. This is the only developer module loaded
 * when the mode is off; the tooling itself (devPanel.js) is imported lazily.
 */

import { getItem, setItem, removeItem } from '../persist/storage.js';

const STORAGE_KEY = 'sudoku.dev.v1';

let _on = false;

/**
 * Resolve the flag once at boot: `?dev=1` turns it on and saves it, `?dev=0`
 * turns it off and clears it, anything else keeps the saved setting.
 *
 * @param {string} search - `location.search`.
 * @returns {boolean}
 */
export function initDevMode(search) {
  const param = new URLSearchParams(search).get('dev');
  if (param === '1') {
    _on = true;
    setItem(STORAGE_KEY, true);
  } else if (param === '0') {
    _on = false;
    removeItem(STORAGE_KEY);
  } else {
    _on = getItem(STORAGE_KEY) === true;
  }
  return _on;
}

/**
 * @returns {boolean} Whether developer mode is on. False before `initDevMode`.
 */
export function isDevMode() {
  return _on;
}
