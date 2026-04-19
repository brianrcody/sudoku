/**
 * @fileoverview Theme class-swap logic and cookie persistence.
 */

import * as cookies from '../persist/cookies.js';
import { THEME_CLASSES, DEFAULT_THEME } from '../config.js';
import { announce } from './srLive.js';

const COOKIE_NAME = 'sudoku.theme';

const DISPLAY_NAMES = {
  'theme-minimalist': 'Minimalist',
  'theme-coffee':     'Coffee Shop',
  'theme-school':     'School',
  'theme-terminal':   'Digital Terminal',
  'theme-mountain':   'Mountain',
};

/**
 * Reads the theme cookie and applies the corresponding class to `<body>` before
 * first render. Falls back to DEFAULT_THEME.
 */
export function initTheme() {
  const saved = cookies.get(COOKIE_NAME);
  const cls = saved ? 'theme-' + saved : DEFAULT_THEME;
  applyTheme(cls, false);
}

/**
 * Switches to the given theme class and persists the choice.
 *
 * @param {string} themeClass - e.g. `'theme-coffee'`
 * @param {boolean} [shouldAnnounce=true]
 */
export function applyTheme(themeClass, shouldAnnounce = true) {
  for (const c of THEME_CLASSES) {
    document.body.classList.remove(c);
  }
  document.body.classList.add(themeClass);
  cookies.set(COOKIE_NAME, themeClass.replace('theme-', ''));
  if (shouldAnnounce) {
    announce(`Theme changed to ${DISPLAY_NAMES[themeClass] ?? themeClass}.`);
  }
}

/**
 * Wires up the `#theme-select` element.
 *
 * @param {HTMLSelectElement} selectEl
 */
export function bindThemeSelect(selectEl) {
  // Reflect current theme.
  const current = THEME_CLASSES.find(c => document.body.classList.contains(c)) ?? DEFAULT_THEME;
  selectEl.value = current.replace('theme-', '');

  selectEl.addEventListener('change', () => {
    applyTheme('theme-' + selectEl.value);
  });
}
