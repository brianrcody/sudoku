/**
 * @fileoverview Left-/right-hand layout preference: `<html data-hand>` attribute,
 * and cookie persistence. The menu's Left-handed item toggles it.
 *
 * The swap itself is pure CSS (the vspec-008 §2.2 grid-column swap), so DOM and
 * focus order never change with the mode.
 */

import * as cookies from '../persist/cookies.js';
import { announce } from './srLive.js';

const COOKIE_NAME = 'sudoku.hand';

const ANNOUNCE_ON = 'Left-handed layout on. Controls are left of the puzzle.';
const ANNOUNCE_OFF = 'Left-handed layout off. Controls are right of the puzzle.';

/**
 * Returns the handedness currently applied to the document.
 *
 * @returns {'left'|'right'}
 */
export function getHandedness() {
  return document.documentElement.getAttribute('data-hand') === 'left' ? 'left' : 'right';
}

/**
 * Applies a handedness to the document and persists it. Any value other than
 * `'left'` is treated as `'right'`.
 *
 * @param {'left'|'right'} hand
 * @param {boolean} [shouldAnnounce=true]
 */
export function applyHandedness(hand, shouldAnnounce = true) {
  const left = hand === 'left';
  if (left) {
    document.documentElement.setAttribute('data-hand', 'left');
  } else {
    document.documentElement.removeAttribute('data-hand');
  }
  cookies.set(COOKIE_NAME, left ? 'left' : 'right');
  if (shouldAnnounce) {
    announce(left ? ANNOUNCE_ON : ANNOUNCE_OFF);
  }
}

/**
 * Reconciles the document with the saved cookie, silently. The inline head
 * script has normally applied it already; this also normalizes an unrecognized
 * cookie value to `'right'`.
 */
export function initHandedness() {
  applyHandedness(cookies.get(COOKIE_NAME) === 'left' ? 'left' : 'right', false);
}

/** Flips the applied handedness, saves it, and announces it (fspec-004 §2.3 steps 2–5). */
export function toggleHandedness() {
  applyHandedness(getHandedness() === 'left' ? 'right' : 'left');
}
