/**
 * Helpers that reproduce what a developer does in the app: they click the
 * real controls rather than calling `window.sudokuDev`, so a bug seen by hand
 * is reproduced through the same path. Reads use page state directly and
 * return compact summaries, never whole state objects.
 *
 * Step numbers are the panel's 1-based numbers, as a person reads them.
 */

import { BASE_URL } from './lifecycle.mjs';

const TOOLS = {
  load: 'dev-load',
  inspector: 'dev-inspector',
  overlay: 'dev-overlay',
  coach: 'dev-coach',
  generation: 'dev-gen',
  recorder: 'dev-rec',
};

/** @param {number} i @returns {string} e.g. `r1c8` */
export const cellRef = i => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`;

async function _until(page, fn, arg, { timeout = 10000, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await page.evaluate(fn, arg);
    if (value) return value;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out after ${timeout} ms waiting for ${what}`);
}

/**
 * Expand a developer tool's section.
 * @param {import('playwright').Page} page
 * @param {keyof TOOLS} name
 */
export async function openTool(page, name) {
  const id = TOOLS[name];
  if (!id) throw new Error(`Unknown tool "${name}"; one of ${Object.keys(TOOLS).join(', ')}`);
  await page.evaluate(id => { document.getElementById(id).open = true; }, id);
}

/**
 * Open a puzzle through a share link (`?dev=1&p=…`), confirming the "Load
 * shared puzzle?" prompt if progress would be lost, and wait until it is the
 * current puzzle.
 * @param {import('playwright').Page} page
 * @param {string} puzzle - 81 cells; `0` or `.` for empty, whitespace ignored.
 * @returns {Promise<object>} `summary()` of the loaded position.
 */
export async function load(page, puzzle) {
  const givens = puzzle.replace(/\s+/g, '').replace(/\./g, '0');
  if (!/^[0-9]{81}$/.test(givens)) throw new Error('A puzzle is 81 cells of 0–9 or "."');
  await page.goto(`${BASE_URL}/?dev=1&p=${givens}`);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await page.locator('#modal-confirm').isVisible()) await page.click('#modal-confirm');
    const loaded = await page.evaluate(g => {
      const s = window.gameState?.getState();
      return !!s?.puzzle && !s.generating && Array.from({ length: 81 }, (_, i) => s.puzzle.givens[i]).join('') === g;
    }, givens);
    if (loaded) return summary(page);
    await page.waitForTimeout(100);
  }
  throw new Error('The puzzle did not load within 15 s; check the page for a rejection message');
}

/**
 * Run the solver step inspector on the current board.
 * @param {import('playwright').Page} page
 * @returns {Promise<{summary: string, steps: string[]}>} Steps as `"17. Locked Candidates — …"`.
 */
export async function runSolver(page) {
  await openTool(page, 'inspector');
  await page.evaluate(() => { document.getElementById('dev-inspect-summary').textContent = ''; });
  await page.click('#dev-inspect-run');
  await _until(page, () => document.getElementById('dev-inspect-summary').textContent, null,
    { what: 'the inspector summary' });
  return page.evaluate(() => ({
    summary: document.getElementById('dev-inspect-summary').textContent,
    steps: [...document.querySelectorAll('#dev-inspect-list button[data-step]')]
      .map(b => `${Number(b.dataset.step) + 1}. ${b.textContent.trim()}`),
  }));
}

/**
 * Set the board to the position after step `n` (double-click, as by hand).
 * Requires `runSolver` first.
 * @param {import('playwright').Page} page
 * @param {number} n - 1-based step number as shown in the panel.
 * @returns {Promise<{status: string, step: string}>}
 */
export async function applyStep(page, n) {
  const button = page.locator(`#dev-inspect-list button[data-step="${n - 1}"]`);
  if (await button.count() === 0) throw new Error(`No step ${n}; run the solver first, or check the step count`);
  await button.dblclick();
  const status = await _until(page, n => {
    const text = document.getElementById('dev-inspect-board').textContent;
    return text.startsWith(`Board set to step ${n} of`) && text;
  }, n, { what: `the board to be set to step ${n}` });
  return { status, step: (await button.textContent()).trim() };
}

/**
 * Turn the candidate overlay on or off.
 * @param {import('playwright').Page} page
 * @param {boolean} [on=true]
 * @returns {Promise<boolean>} The switch's state afterwards.
 */
export async function overlay(page, on = true) {
  await openTool(page, 'overlay');
  const checked = await page.getAttribute('#dev-overlay-toggle', 'aria-checked') === 'true';
  if (checked !== on) await page.click('#dev-overlay-toggle');
  return await page.getAttribute('#dev-overlay-toggle', 'aria-checked') === 'true';
}

/**
 * Press Coach and describe what it suggests.
 * @param {import('playwright').Page} page
 * @returns {Promise<{technique: string|null, rank?: number, type?: string, digits?: number[],
 *   eliminations?: string[], text?: string, message?: string}>}
 *   `technique` is null when the coach declined; `message` then carries its toast.
 */
export async function coach(page) {
  await page.click('#btn-coach');
  let step;
  try {
    step = await _until(page, () => {
      const s = window.gameState.getState().coachSession?.step;
      return s && {
        technique: s.technique, rank: s.rank, type: s.type, digits: s.digits,
        eliminations: s.eliminations, text: s.supportingText,
      };
    }, null, { timeout: 2000, what: 'a coach session' });
  } catch {
    const message = await page.evaluate(() => document.getElementById('coach-recap')?.textContent.trim());
    return { technique: null, message };
  }
  return { ...step, eliminations: step.eliminations.map(e => `${e.digit} from ${cellRef(e.cellIndex)}`) };
}

/**
 * A compact picture of the game and the developer tools.
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} Board rows use `.` for empty cells.
 */
export async function summary(page) {
  return page.evaluate(() => {
    const s = window.gameState.getState();
    const at = (arr, i) => arr?.[i] ?? 0;
    const rows = [];
    for (let r = 0; r < 9; r++) {
      let row = '';
      for (let c = 0; c < 9; c++) row += at(s.pen, r * 9 + c) || '.';
      rows.push(row);
    }
    let empty = 0;
    let pencilled = 0;
    for (let i = 0; i < 81; i++) {
      if (!at(s.pen, i)) empty++;
      if (at(s.pencil, i)) pencilled++;
    }
    const text = id => document.getElementById(id)?.textContent.trim() || null;
    return {
      puzzle: s.puzzle && { id: s.puzzle.id, difficulty: s.puzzle.difficulty, source: s.puzzle.source },
      board: rows,
      empty,
      pencilledCells: pencilled,
      conflicts: s.conflicts?.size ?? 0,
      won: s.won,
      coach: s.coachSession?.step?.technique ?? null,
      inspector: { summary: text('dev-inspect-summary'), board: text('dev-inspect-board') },
    };
  });
}

/**
 * Bind every helper to one page, for snippets: `await dev.applyStep(17)`.
 * @param {import('playwright').Page} page
 */
export function bind(page) {
  return {
    load: p => load(page, p),
    openTool: name => openTool(page, name),
    runSolver: () => runSolver(page),
    applyStep: n => applyStep(page, n),
    overlay: on => overlay(page, on),
    coach: () => coach(page),
    summary: () => summary(page),
    cellRef,
  };
}
