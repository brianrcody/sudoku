/**
 * @fileoverview Share action — copies a link to the current puzzle's givens.
 *
 * Runs when the menu's Share puzzle item is activated; the menu owns the item
 * and its disabled state. Results are shown through the notice card and
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
 * @param {{ getState: function, on: function }} gameState
 * @param {object} deps
 * @param {function(): HTMLElement} deps.returnFocus - Receives focus when the
 *   copy-fallback notice is dismissed (the menu button).
 * @param {function(string): Promise<boolean>} [deps.copy]
 * @param {function(): string} [deps.getHref]
 * @returns {{ share: function(): Promise<void> }}
 */
export function mount(gameState, { returnFocus, copy = copyText, getHref = () => location.href }) {
  gameState.on('changed', ({ action }) => {
    // A freshly generated puzzle makes any link or outcome on show stale.
    if (action.type === 'NEW_PUZZLE') notice.hide();
  });

  async function share() {
    const puzzle = gameState.getState().puzzle;
    if (puzzle === null) return;
    const url = buildShareUrl(puzzle.givens, getHref());
    if (await copy(url)) {
      notice.show('Link copied to clipboard.', { timeoutMs: COPIED_MS });
      announce('Link copied to clipboard.');
    } else {
      notice.showLink('Copy this link to share the puzzle:', url, {
        onDismiss: () => returnFocus().focus(),
      });
      announce('Couldn\'t copy automatically. The link is shown for you to copy.');
    }
  }

  return { share };
}
