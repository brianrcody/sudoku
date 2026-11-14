/**
 * @fileoverview Share action — copies a link to the current puzzle's givens.
 *
 * Owns the `#btn-share` button. Results are shown through the notice card and
 * announced through the live region.
 */

import { announce } from './srLive.js';
import * as notice from './notice.js';
import { copyText } from '../util/clipboard.js';
import { encodeGivens } from '../util/puzzleString.js';
import { SHARE_PARAM } from '../config.js';

const COPIED_MS = 4000;

/**
 * Build the share link for a puzzle: the app's own URL, stripped of query and
 * fragment, carrying only the givens.
 *
 * @param {Uint8Array} givens
 * @param {string} href - The app's current URL.
 * @returns {string}
 */
export function buildShareUrl(givens, href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(SHARE_PARAM, encodeGivens(givens));
  return url.href;
}

/**
 * @param {HTMLButtonElement} button - The `#btn-share` element.
 * @param {{ getState: function, on: function }} gameState
 * @param {object} [deps]
 * @param {function(string): Promise<boolean>} [deps.copy]
 * @param {function(): string} [deps.getHref]
 */
export function mount(button, gameState, { copy = copyText, getHref = () => location.href } = {}) {
  const sync = () => { button.disabled = gameState.getState().puzzle === null; };

  button.addEventListener('click', async () => {
    const url = buildShareUrl(gameState.getState().puzzle.givens, getHref());
    if (await copy(url)) {
      notice.show('Link copied to clipboard.', { timeoutMs: COPIED_MS });
      announce('Link copied to clipboard.');
    } else {
      notice.showLink('Copy this link to share the puzzle:', url, {
        onDismiss: () => button.focus(),
      });
      announce('Couldn\'t copy automatically. The link is shown for you to copy.');
    }
  });

  gameState.on('changed', ({ action, changed }) => {
    if (changed.has('puzzle')) sync();
    // A freshly generated puzzle makes any link or outcome on show stale.
    if (action.type === 'NEW_PUZZLE') notice.hide();
  });

  sync();
}
