/**
 * @fileoverview Node script (not a browser test): records the session-document
 * fixtures of js/tests/fixtures/sessions/ by playing scripted sessions in the
 * real app, in developer mode, in headless Chromium.
 *
 *   node js/tests/tools/captureSessionFixtures.js [name …] [--port N]
 *
 * Each scenario opens `index.html?dev=1` in a fresh browser context, so the
 * history starts at the first page load, plays through the app's own controls
 * (Coach, Hint, Check, the difficulty selector, its confirmation dialog) and
 * through `window.gameState`, as a developer at the console would. The
 * document is then read from the recorder's IndexedDB history and built with
 * `buildDocument`, exactly as Copy session exports it.
 *
 * Generation is real, so a re-capture records different puzzles; the
 * scenario's shape is what is reproducible. An existing fixture is never
 * overwritten: `format-v1-baseline.json` is frozen once written (aspec §5.5).
 * Delete a file to capture it again.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { mulberry32 } from '../../prng.js';
import { HARD, MEDIUM, UNRATED } from '../fixtures/puzzles/loadable.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'js/tests/fixtures/sessions');

const MIME = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };

/** Serve the repository root on `port`. */
export function serve(port) {
  const server = http.createServer((req, res) => {
    const file = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/**
 * A driver for one app page. Every method acts the way the app's controls or
 * the console would.
 */
export function driver(page, seed) {
  const rng = mulberry32(seed);
  const int = n => Math.floor(rng() * n);
  const state = () => page.evaluate(() => {
    const s = window.gameState.getState();
    return {
      puzzle: s.puzzle && { givens: [...s.puzzle.givens], solution: [...s.puzzle.solution], difficulty: s.puzzle.difficulty },
      pen: [...s.pen], pencil: [...s.pencil], selected: s.selected, won: s.won, generating: s.generating,
      coach: s.coachSession && { type: s.coachSession.step.type, target: s.coachSession.step.roles.target,
        digit: s.coachSession.step.digits[0], recap: s.coachSession.recap, coached: [...s.coachSession.coachedCells],
        eliminations: s.coachSession.step.eliminations },
    };
  });
  const dispatch = action => page.evaluate(a => window.gameState.dispatch(a), action);
  const click = selector => page.evaluate(sel => document.querySelector(sel).click(), selector);
  const pause = ms => page.waitForTimeout(ms);

  const emptyCells = s => s.pen.map((d, i) => (d === 0 ? i : -1)).filter(i => i >= 0);

  return {
    rng, state, dispatch, click, pause,

    async ready() {
      await page.waitForFunction(() => {
        const s = window.gameState?.getState();
        return s && s.puzzle !== null && !s.generating;
      }, null, { timeout: 120000 });
      await pause(300);
    },

    /** Mixed player input: selection, digits (mostly right), marks, erase, undo, navigation, Check. */
    async play(count) {
      for (let i = 0; i < count; i++) {
        const s = await state();
        if (s.won || !s.puzzle) return;
        const r = rng();
        const empties = emptyCells(s);
        if (r < 0.25) await dispatch({ type: 'SELECT_CELL', index: empties.length && rng() < 0.8 ? empties[int(empties.length)] : int(81) });
        else if (r < 0.5) {
          const right = s.selected !== null ? s.puzzle.solution[s.selected] : 1;
          await dispatch({ type: 'PEN_ENTER', digit: rng() < 0.75 ? right : 1 + int(9) });
        } else if (r < 0.62) await dispatch({ type: 'PENCIL_TOGGLE', digit: 1 + int(9) });
        else if (r < 0.67) await dispatch({ type: 'ERASE' });
        else if (r < 0.74) await dispatch({ type: 'UNDO' });
        else if (r < 0.82) await dispatch({ type: 'ARROW_NAV', direction: ['left', 'right', 'up', 'down'][int(4)] });
        else if (r < 0.86) await dispatch({ type: 'TOGGLE_MODE' });
        else if (r < 0.89) await click('#btn-check');
        else if (r < 0.9) await dispatch({ type: 'ERASE_ALL_PENCIL' });
        else await dispatch({ type: 'SELECT_CELL', index: int(81) });
        if (rng() < 0.05) await pause(50);
      }
    },

    /** Coach button; follow the step: focus coached cells, then apply a placement. */
    async coach({ apply = true } = {}) {
      await click('#btn-coach');
      const s = await state();
      if (!s.coach) return s;
      for (const cell of s.coach.coached.slice(0, 2)) await dispatch({ type: 'SELECT_CELL', index: cell });
      if (apply && s.coach.type === 'placement') {
        await dispatch({ type: 'SET_MODE', mode: 'pen' });
        await dispatch({ type: 'SELECT_CELL', index: s.coach.target });
        await dispatch({ type: 'PEN_ENTER', digit: s.coach.digit });
      }
      return s;
    },

    /** Hint button on an empty cell. */
    async hint() {
      const s = await state();
      const empties = emptyCells(s);
      await dispatch({ type: 'SELECT_CELL', index: empties[int(empties.length)] });
      await click('#btn-hint');
    },

    /** Erase every wrong digit, as a player fixing mistakes before asking the coach. */
    async fixErrors() {
      const s = await state();
      for (let i = 0; i < 81; i++) {
        if (s.pen[i] !== 0 && s.pen[i] !== s.puzzle.solution[i]) {
          await dispatch({ type: 'SELECT_CELL', index: i });
          await dispatch({ type: 'ERASE' });
        }
      }
    },

    /** Fill every empty cell with its solution digit: a win. */
    async win() {
      await dispatch({ type: 'SET_MODE', mode: 'pen' });
      const s = await state();
      for (let i = 0; i < 81; i++) {
        if (s.pen[i] !== s.puzzle.solution[i]) {
          await dispatch({ type: 'SELECT_CELL', index: i });
          if (s.pen[i] !== 0) await dispatch({ type: 'ERASE' });
          await dispatch({ type: 'PEN_ENTER', digit: s.puzzle.solution[i] });
        }
      }
    },

    /** The difficulty selector, confirming the dialog when one opens. */
    async changeDifficulty(tier) {
      await page.selectOption('#difficulty-select', tier);
      await pause(100);
      if (await page.evaluate(() => document.querySelector('#modal-confirm')?.offsetParent != null)) {
        await page.click('#modal-confirm');
      }
      await this.ready();
    },

    async reload() {
      await page.reload();
      await page.waitForFunction(() => window.gameState !== undefined);
      await this.ready();
    },

    /** A `window.sudokuDev` call; fails the capture when the result is not the expected `ok`. */
    async api(method, args = [], expectOk = true) {
      await page.waitForFunction(() => window.sudokuDev !== undefined);
      const result = await page.evaluate(([m, a]) => window.sudokuDev[m](...a), [method, args]);
      if (result.ok !== expectOk) throw new Error(`sudokuDev.${method}: ${JSON.stringify(result)}`);
      await this.ready();
      return result;
    },

    /** Press Coach until it offers an elimination step; returns that step's state, or null. */
    async coachUntilElimination(limit = 80) {
      for (let i = 0; i < limit; i++) {
        const s = await this.coach();
        if (s.coach && s.coach.type === 'elimination') return s;
        if (!s.coach) return null;
      }
      return null;
    },

    /** Clear every mark the elimination step rules out, completing it (an elimination recap). */
    async completeElimination(s) {
      await dispatch({ type: 'SET_MODE', mode: 'pencil' });
      for (const { cellIndex, digit } of s.coach.eliminations) {
        const now = await state();
        if (now.pencil[cellIndex] & (1 << (digit - 1))) {
          await dispatch({ type: 'SELECT_CELL', index: cellIndex });
          await dispatch({ type: 'PENCIL_TOGGLE', digit });
        }
      }
    },

    /** A wrong digit in an empty cell. */
    async wrongDigit() {
      const s = await state();
      const cell = emptyCells(s)[0];
      await dispatch({ type: 'SET_MODE', mode: 'pen' });
      await dispatch({ type: 'SELECT_CELL', index: cell });
      await dispatch({ type: 'PEN_ENTER', digit: (s.puzzle.solution[cell] % 9) + 1 });
    },
  };
}

/** Read the recorder's saved history once writes have settled. */
export async function readHistory(page) {
  const read = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('sudoku-dev-recorder');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['meta', 'entries'], 'readonly');
      const meta = tx.objectStore('meta').get('history');
      const entries = tx.objectStore('entries').getAll();
      tx.oncomplete = () => { db.close(); resolve({ start: meta.result.start, entries: entries.result }); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  for (;;) {
    await page.waitForTimeout(400);
    const a = await read();
    await page.waitForTimeout(200);
    const b = await read();
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
  }
}

/** The session document, as Copy session would export it now. */
export async function exportSession(page) {
  const history = await readHistory(page);
  return page.evaluate(async h => {
    const { buildDocument } = await import('/js/dev/sessionCodec.js');
    return buildDocument({ ...h, exportedAt: Date.now() });
  }, history);
}

/** Open a fresh developer-mode page. `share` is a puzzle string for `?p=`. */
export async function openApp(browser, port, { share } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', err => console.error(`[page error] ${err.message}`));
  const query = share === undefined ? '?dev=1' : `?dev=1&p=${share}`;
  await page.goto(`http://127.0.0.1:${port}/index.html${query}`);
  return { context, page };
}

/**
 * Scenarios. Each returns the exported document.
 * @type {Object<string, function(import('playwright').Browser, number): Promise<object>>}
 */
export const SCENARIOS = {
  /**
   * The format-compatibility anchor (tspec FX1). The history is cleared once
   * the first generated puzzle is on the board, so the document starts from a
   * generated puzzle and carries its seed and tier. It then holds every action
   * kind of `KINDS` (the four the reducer only raises internally, and
   * `RESTORE_SESSION` and `DEV_RESTORE_POSITION`, dispatched from the console),
   * actions that changed nothing, follow-ups, coach placement and elimination
   * steps with their recaps, a no-technique answer, hints with and without a
   * result, all three error kinds (one repeated) and an unrecordable action,
   * a reload, puzzles loaded from a string and Unrated, a difficulty change,
   * seeded and falling-back generations, and a win.
   */
  async 'format-v1-baseline.json'(browser, port) {
    const { context, page } = await openApp(browser, port);
    const d = driver(page, 20261116);
    const console_ = (fn, arg) => page.evaluate(fn, arg);
    await d.ready();
    await d.api('clearHistory', [{ discardHistory: true }]);

    // Player input on the generated puzzle, including Check and its expiry.
    await d.play(40);
    await d.dispatch({ type: 'SELECT_FIRST_CELL' });
    await console_(() => document.body.click());   // a click outside the grid: DESELECT
    await d.wrongDigit();
    await d.click('#btn-check');
    await d.pause(3300);

    // Coach: refused over a wrong digit, then placement steps with a recap and focus follow-ups.
    await d.click('#btn-coach');
    await d.fixErrors();
    await d.coach();
    await d.pause(2800);
    const s = await d.coach({ apply: false });
    if (s.coach) {
      const away = s.pen.findIndex((v, i) => v === 0 && !s.coach.coached.includes(i));
      await d.dispatch({ type: 'SELECT_CELL', index: away });   // follow-up COACH_FOCUS_OFF
    }
    await d.click('#btn-coach');
    await d.coach();
    await d.pause(2800);
    await d.hint();
    await d.hint();

    // Developer tools: pencil marks, the inspector, a restored position.
    const saved = await console_(async () => {
      const { encodePosition } = await import('/js/dev/sessionCodec.js');
      return encodePosition(window.gameState.getState());
    });
    const empty = (await d.state()).pen.findIndex(v => v === 0);
    const cell = `r${Math.floor(empty / 9) + 1}c${(empty % 9) + 1}`;
    await d.api('setPencilMarks', [cell, [1, 2]]);
    await d.api('setPencilMarks', [cell, [1, 2]]);   // changes nothing
    await d.api('fillPencilMarks');
    await d.click('#dev-inspect-run');
    await console_(() => {
      const step = document.querySelector('#dev-inspect-list button[data-step="1"]');
      step.click();
      step.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await d.click('#dev-inspect-restore');
    await d.play(10);
    await console_(async position => {
      const { decodePosition } = await import('/js/dev/sessionCodec.js');
      window.gameState.dispatch({ type: 'DEV_RESTORE_POSITION', position: decodePosition(position) });
    }, saved);

    // Console-only kinds, each changing nothing here, and an unrecordable action.
    await console_(() => {
      const gs = window.gameState;
      const { attemptRecorded, hintsRemaining } = gs.getState();
      gs.dispatch({ type: 'RESTORE_SESSION', attemptRecorded, hintsRemaining });
      gs.dispatch({ type: 'ON_COMPLETION_EVALUATE' });
      gs.dispatch({ type: 'COACH_FILL_RECAP', variant: 'normal' });
      gs.dispatch({ type: 'COACH_FOCUS_OFF' });
      gs.dispatch({ type: 'NOT_A_RECORDABLE_ACTION' });
    });

    // Captured errors: an uncaught error twice in a row (one entry, count 2),
    // an unhandled rejection and a listener exception.
    await console_(() => {
      window.baselineUncaught = () => { throw new Error('Baseline: deliberate uncaught error'); };
      setTimeout(window.baselineUncaught);
      setTimeout(window.baselineUncaught);
    });
    await d.pause(100);
    await console_(() => { Promise.reject(new Error('Baseline: deliberate unhandled rejection')); });
    await d.pause(100);
    await console_(() => {
      const off = window.gameState.on('changed', () => {
        off();
        throw new Error('Baseline: deliberate listener exception');
      });
      window.gameState.dispatch({ type: 'TOGGLE_MODE' });
    });

    await d.reload();
    await d.play(10);
    await d.click('#btn-reset');
    await d.pause(100);
    await page.click('#modal-confirm');
    await d.pause(100);

    // A puzzle loaded from a string, coached to an elimination step that is completed.
    await d.api('load', [HARD, { replace: true }]);
    const elimination = await d.coachUntilElimination();
    if (elimination === null) throw new Error('The coach offered no elimination step.');
    await d.completeElimination(elimination);
    await d.pause(2800);

    // An Unrated puzzle: a hint with nothing to give.
    await d.api('load', [UNRATED, { replace: true }]);
    await d.dispatch({ type: 'SELECT_CELL', index: 0 });
    await d.dispatch({ type: 'HINT' });

    // Generation: a difficulty change, a run that falls back, a seeded run, then a win.
    await d.changeDifficulty('kiddie');
    await d.play(10);
    await d.api('generate', ['nightmare', 7, { budget: 1, acceptFallback: true, replace: true }]);
    await d.api('generate', ['medium', 4242, { replace: true }]);
    await d.play(10);
    await d.fixErrors();
    await d.hint();
    await d.hint();   // Medium allows one: changes nothing
    await d.win();
    await d.pause(500);
    const doc = await exportSession(page);
    await context.close();
    return doc;
  },

  /**
   * A first-ever boot (tspec FX9): the history starts with no puzzle, then
   * the boot generation, play, coach sessions with focus follow-ups, hints,
   * Check and its expiry, a page reload, a difficulty change with its
   * follow-up and generation, and a win on the new puzzle.
   */
  async 'first-boot-null-start.json'(browser, port) {
    const { context, page } = await openApp(browser, port);
    const d = driver(page, 20261116);
    await d.ready();
    await d.play(40);
    await d.coach();
    await d.fixErrors();
    await d.coach();
    await d.coach();
    await d.hint();
    await d.hint();
    await d.click('#btn-check');
    await d.pause(3300);
    await d.reload();
    await d.play(15);
    await d.changeDifficulty('kiddie');
    await d.play(15);
    await d.hint();
    await d.fixErrors();
    await d.coach();
    await d.pause(2800);
    await d.win();
    await d.pause(500);
    const doc = await exportSession(page);
    await context.close();
    return doc;
  },

  /**
   * A shared Hard puzzle coached through its singles until the coach offers
   * an elimination with revealed marks; the session ends inside that coach
   * session, with a coached cell focused.
   */
  async 'coach-in-progress.json'(browser, port) {
    const { context, page } = await openApp(browser, port, { share: HARD });
    const d = driver(page, 7);
    await d.ready();
    for (let i = 0; i < 80; i++) {
      const s = await d.coach();
      if (s.coach && s.coach.type === 'elimination') break;
    }
    const doc = await exportSession(page);
    await context.close();
    return doc;
  },

  /**
   * An Unrated puzzle from a share link, played with hints and the coach
   * requested from the console; then a Medium puzzle loaded from a string, so
   * the session holds both not-compared and compared results.
   */
  async 'unrated-then-medium.json'(browser, port) {
    const { context, page } = await openApp(browser, port, { share: UNRATED });
    const d = driver(page, 99);
    await d.ready();
    await d.play(20);
    await d.dispatch({ type: 'SELECT_CELL', index: 0 });
    await d.dispatch({ type: 'HINT' });
    await d.dispatch({ type: 'COACH_NO_TECHNIQUE', reason: 'error' });
    await page.evaluate(async text => {
      const { loadFromGivens } = await import('/js/generator/loadPuzzle.js');
      const loaded = loadFromGivens(Uint8Array.from(text, Number));
      window.gameState.dispatch({ type: 'PUZZLE_LOADED', puzzle: { ...loaded.puzzle, source: 'string' } });
    }, MEDIUM);
    await d.pause(200);
    await d.play(10);
    await d.fixErrors();
    await d.coach();
    await d.hint();
    const doc = await exportSession(page);
    await context.close();
    return doc;
  },
};

async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? Number(args.splice(portIndex, 2)[1]) : 3006;
  const names = args.length > 0 ? args : Object.keys(SCENARIOS);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await serve(port);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const name of names) {
      const file = path.join(OUT_DIR, name);
      if (fs.existsSync(file)) {
        console.log(`${name}: exists, not overwritten`);
        continue;
      }
      const doc = await SCENARIOS[name](browser, port);
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`${name}: ${doc.actions.length} actions, ${doc.errors.length} errors`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
