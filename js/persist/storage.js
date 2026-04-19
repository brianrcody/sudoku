/**
 * @fileoverview localStorage wrapper with silent failure on unavailable storage
 * (private browsing, quota exceeded, disabled by policy).
 */

/**
 * Reads and JSON-parses a localStorage item.
 *
 * @param {string} key
 * @returns {*} Parsed value, or null if missing/unparseable/unavailable.
 */
export function getItem(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * JSON-serializes and writes a value to localStorage.
 *
 * @param {string} key
 * @param {*} value
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently ignore quota errors and disabled storage.
  }
}

/**
 * Removes an item from localStorage.
 *
 * @param {string} key
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore.
  }
}
