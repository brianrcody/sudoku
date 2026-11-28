/**
 * @fileoverview Shared helpers for integration tests that load the real app
 * (index.html) in an iframe: sized frames, readiness waits, and state seeding.
 *
 * Controls are always selected by id. Menu items such as #mi-hand are
 * display:none at ≤720px, so "first item" selectors are unreliable in small
 * frames (docs/misc/bugs-left-hand-1.md).
 */

export const STATE_KEY = 'sudoku.state.v1';
export const DIFF_KEY = 'sudoku.currentDifficulty.v1';
export const PREGEN_PREFIX = 'sudoku.pregen.v1.';

/**
 * @param {string} [src]
 * @param {{width?: number, height?: number}} [size] Defaults to a desktop-width frame.
 * @returns {HTMLIFrameElement}
 */
export function createApp(src = '/index.html', { width = 1100, height = 900 } = {}) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText =
    `width:${width}px;height:${height}px;border:0;position:fixed;left:-20000px;top:0;`;
  document.body.appendChild(iframe);
  return iframe;
}

/**
 * Poll until `predicate()` is truthy.
 *
 * @param {function(): *} predicate
 * @param {number} [timeoutMs]
 * @param {string} [what] - For the timeout message.
 * @returns {Promise<*>} The truthy value.
 */
export async function waitFor(predicate, timeoutMs = 15000, what = 'condition') {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value = false;
    try { value = predicate(); } catch { /* frame not ready yet */ }
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

/** The app's game-state store, once the frame has booted. */
export const gsOf = iframe => iframe.contentWindow.gameState;

/**
 * Wait until the app has a puzzle. Waits for `state.puzzle !== null`, not just
 * the 81 cells, which render before the boot-time puzzle arrives
 * (docs/misc/flaky-test-remediation.md).
 */
export async function waitForPuzzle(iframe, timeoutMs = 20000) {
  await waitFor(() =>
    iframe.contentDocument.querySelectorAll('.cell').length === 81 &&
    gsOf(iframe).getState().puzzle !== null, timeoutMs, 'puzzle');
}

/**
 * Wait until a share link has been fully handled: the app strips the `p`
 * parameter only once the outcome (loaded / declined / rejected) is known.
 */
export async function waitForLinkHandled(iframe, timeoutMs = 20000) {
  await waitFor(() =>
    gsOf(iframe) !== undefined &&
    !new URLSearchParams(iframe.contentWindow.location.search).has('p'), timeoutMs, 'share link to be handled');
}

/** Wait for the developer panel, which arrives through a lazy import. */
export async function waitForDevPanel(iframe, timeoutMs = 20000) {
  await waitFor(() => iframe.contentDocument.getElementById('dev-root') !== null, timeoutMs, 'developer panel');
}

/** Two animation frames in the app frame: lets srLive's deferred write land. */
export function appFrame(iframe) {
  const raf = iframe.contentWindow.requestAnimationFrame.bind(iframe.contentWindow);
  return new Promise(r => raf(() => raf(() => r())));
}

export const digits = s => Array.from(s, Number);

/**
 * Seed a saved game so the next app boot restores it instead of generating.
 *
 * @param {object} opts
 * @param {string} opts.givens - 81-digit string.
 * @param {string} opts.solution - 81-digit string.
 * @param {string} [opts.difficulty]
 * @param {Object<number, number>} [opts.entries] - Player digits by cell index.
 * @param {Object<number, number>} [opts.pencil] - Pencil bitsets by cell index.
 * @param {object} [opts.extra] - Extra fields for the saved puzzle object.
 */
export function seedSavedGame({ givens, solution, difficulty = 'easy', entries = {}, pencil = {}, extra = {}, attemptRecorded = false }) {
  const pen = digits(givens);
  for (const [i, d] of Object.entries(entries)) pen[i] = d;
  const marks = new Array(81).fill(0);
  for (const [i, bits] of Object.entries(pencil)) marks[i] = bits;
  localStorage.setItem(STATE_KEY, JSON.stringify({
    version: 1,
    difficulty,
    puzzle: { id: 'seeded', givens: digits(givens), solution: digits(solution), ...extra },
    pen,
    pencil: marks,
    hintsRemaining: 0,
    attemptRecorded,
    savedAt: new Date().toISOString(),
  }));
}

/**
 * Statistics in the Statistics dialog's table, as `{ Kiddie: {attempted, won}, … }`.
 * The table is rendered whether or not the dialog is open.
 */
export function readStats(iframe) {
  const out = {};
  for (const tr of iframe.contentDocument.querySelectorAll('#stats-tbody tr')) {
    const m = tr.getAttribute('aria-label').match(/^(.+?)(?:, current level)?: (\d+) attempted, (\d+) won$/);
    out[m[1]] = { attempted: Number(m[2]), won: Number(m[3]) };
  }
  return out;
}

/** Opens the header menu with a pointer click on the menu button (if closed). */
export function openMenu(iframe) {
  const button = iframe.contentDocument.getElementById('menu-button');
  if (button.getAttribute('aria-expanded') !== 'true') button.click();
}

/**
 * Opens the header menu and clicks one of its items.
 *
 * @param {HTMLIFrameElement} iframe
 * @param {string} id - e.g. `'mi-reset'`, `'mi-theme-coffee'`.
 */
export function clickMenuItem(iframe, id) {
  openMenu(iframe);
  iframe.contentDocument.getElementById(id).click();
}

/** Enter a digit through the reducer, as a keypress would. */
export function enter(iframe, index, digit) {
  gsOf(iframe).dispatch({ type: 'SELECT_CELL', index });
  gsOf(iframe).dispatch({ type: 'PEN_ENTER', digit });
}

/** Fill every empty cell with its solution digit. */
export function solveAll(iframe) {
  const { puzzle } = gsOf(iframe).getState();
  for (let i = 0; i < 81; i++) {
    if (puzzle.givens[i] === 0) enter(iframe, i, puzzle.solution[i]);
  }
}

export const boardString = iframe => Array.from(gsOf(iframe).getState().puzzle.givens).join('');
