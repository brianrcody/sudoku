/**
 * @fileoverview Clipboard write with a boolean outcome instead of a rejection.
 */

import { diagnostics } from './events.js';

/**
 * Copy text to the clipboard.
 *
 * @param {string} text
 * @param {{writeText: function(string): Promise<void>}} [clipboard] Defaults to
 *   `navigator.clipboard`, which is undefined in non-secure contexts.
 * @returns {Promise<boolean>} False when the API is missing or the write is refused.
 */
export async function copyText(text, clipboard = navigator.clipboard) {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch (error) {
    diagnostics.emit('swallowed', { where: 'clipboard.copyText', error });
    return false;
  }
}
