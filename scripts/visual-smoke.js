/**
 * Visual smoke pass for share links, the header menu and developer mode.
 *
 * Boots the real app in headless Chromium, drives it into the states worth
 * looking at, and writes full-page screenshots plus a JSON summary of what was
 * observed. Not a test: nothing is asserted beyond "no console errors". It
 * exists so a UX review, or a later change to this UI, can regenerate the same
 * set of pictures.
 *
 * Usage:
 *   node scripts/visual-smoke.js [outputDir]
 *
 * `outputDir` defaults to a fresh directory under the OS temp dir; the path is
 * printed at the end. Uses the test runner's static server on port 3001, so it
 * cannot run at the same time as `npm test`.
 *
 * Shots:
 *   link-rated            ?p= with a rateable puzzle, desktop
 *   link-unrated-coffee   ?p= with an unrateable puzzle, Coffee theme
 *   link-rejected-mobile  ?p= malformed, 390px wide
 *   share-fallback-mobile Share with the clipboard unavailable, 390px wide
 *   menu-<theme>[-mobile] the open header menu, each theme, 1100px and 390px wide
 *   stats-dialog          the Statistics dialog, opened from the menu
 *   dev-<theme>           ?dev=1 with every tool open and in use, each theme,
 *                         1440px wide so the panel sits beside the game
 *                         (School is taken in left-hand mode)
 *   dev-mobile            ?dev=1 at 390px wide
 *   dev-off               ?dev=0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { startServer, port } from '../test-runner/serve.js';

const BASE = `http://localhost:${port}`;
const THEMES = ['minimalist', 'coffee', 'school', 'terminal', 'mountain'];

/** Rated Kiddie by the solver. */
const RATED = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
/** "Golden Nugget" — unique solution the solver cannot finish, so it loads as Unrated. */
const UNRATED = '000000039000001005003050800008090006070002000100400000009080050020000600400700000';

const outDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-visual-smoke-'));
fs.mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const observed = {};

/**
 * Load the app, optionally act on it, and screenshot the whole page.
 *
 * @param {string} name - Screenshot file name, without extension.
 * @param {string} query - Query string, including the leading `?` (or '').
 * @param {object} [opts]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {string} [opts.theme] - Theme cookie value.
 * @param {boolean} [opts.leftHanded]
 * @param {function(import('playwright').Page): Promise<*>} [opts.actions]
 *   Runs after the puzzle is ready; its return value is recorded in the summary.
 */
async function shot(name, query, { width = 1100, height = 1300, theme, leftHanded, actions } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const cookies = [];
  if (theme) cookies.push({ name: 'sudoku.theme', value: theme, url: BASE });
  if (leftHanded) cookies.push({ name: 'sudoku.hand', value: 'left', url: BASE });
  if (cookies.length) await context.addCookies(cookies);

  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`); });
  page.on('pageerror', err => errors.push(`${name}: ${err.message}`));

  await page.goto(`${BASE}/index.html${query}`);
  await page.waitForFunction(
    () => window.gameState && window.gameState.getState().puzzle !== null,
    null, { timeout: 60000 });
  // Let a share link finish loading and the lazy dev panel arrive.
  await page.waitForTimeout(700);

  if (actions) observed[name] = await actions(page);
  // Theme colours and the notice fade in over ≤ 0.2 s.
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  await context.close();
}

/** Open every developer tool and put each one in a non-empty state. */
async function exerciseDevTools(page) {
  await page.waitForSelector('#dev-root');
  for (const id of ['dev-load', 'dev-inspector', 'dev-overlay', 'dev-coach', 'dev-gen']) {
    await page.click(`#${id} > summary`);
  }
  await page.click('#dev-inspect-run');

  // Pencil 1, 2, 3 into the first empty cell so the overlay has divergence to show.
  await page.evaluate(() => {
    const gs = window.gameState;
    const cell = gs.getState().puzzle.givens.findIndex(g => g === 0);
    gs.dispatch({ type: 'SELECT_CELL', index: cell });
    for (const digit of [1, 2, 3]) gs.dispatch({ type: 'PENCIL_TOGGLE', digit });
  });
  await page.click('#dev-overlay-toggle');
  await page.dblclick('#dev-inspect-list li:nth-child(6) button');
  await page.click('#dev-inspect-list li:nth-child(3) button');
  await page.keyboard.press('c');   // start a coach session for the JSON viewer

  return {
    badge: await page.textContent('#dev-badge'),
    inspector: await page.textContent('#dev-inspect-summary'),
    diagnostics: (await page.textContent('#dev-gen-body')).slice(0, 160),
  };
}

try {
  await shot('link-rated', `?p=${RATED}`, {
    actions: async page => ({
      url: page.url(),
      notice: await page.textContent('#notice-root .notice-message'),
      difficulty: await page.inputValue('#difficulty-select'),
    }),
  });

  await shot('link-unrated-coffee', `?p=${UNRATED}`, {
    theme: 'coffee',
    actions: async page => ({
      notice: await page.textContent('#notice-root .notice-message'),
      difficulty: await page.inputValue('#difficulty-select'),
      hintLabel: await page.getAttribute('#btn-hint', 'aria-label'),
      coachDisabled: await page.isDisabled('#btn-coach'),
    }),
  });

  await shot('link-rejected-mobile', '?p=123', {
    width: 390, height: 900,
    actions: async page => ({
      url: page.url(),
      notice: await page.textContent('#notice-root .notice-message'),
    }),
  });

  await shot('share-fallback-mobile', '', {
    width: 390, height: 900,
    actions: async page => {
      // Force the copy-failure path regardless of the browser's clipboard policy.
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      });
      await page.click('#menu-button');
      await page.click('#mi-share');
      await page.waitForSelector('#share-link-field');
      return { link: await page.inputValue('#share-link-field') };
    },
  });

  for (const theme of THEMES) {
    for (const [suffix, width] of [['', 1100], ['-mobile', 390]]) {
      await shot(`menu-${theme}${suffix}`, '', {
        theme, width, height: 900,
        actions: async page => {
          await page.click('#menu-button');
          return {
            expanded: await page.getAttribute('#menu-button', 'aria-expanded'),
            focused: await page.evaluate(() => document.activeElement.id),
          };
        },
      });
    }
  }

  await shot('stats-dialog', '', {
    actions: async page => {
      await page.click('#menu-button');
      await page.click('#mi-stats');
      return {
        open: await page.evaluate(() => document.getElementById('stats-backdrop').classList.contains('open')),
        focused: await page.evaluate(() => document.activeElement.id),
      };
    },
  });

  for (const theme of THEMES) {
    await shot(`dev-${theme}`, '?dev=1', {
      theme,
      width: 1440,
      leftHanded: theme === 'school',
      actions: exerciseDevTools,
    });
  }

  await shot('dev-mobile', '?dev=1', { width: 390, height: 900, actions: exerciseDevTools });

  await shot('dev-off', '?dev=0', {
    actions: async page => ({
      panelPresent: await page.$('#dev-root') !== null,
      devResourcesLoaded: await page.evaluate(() => performance.getEntriesByType('resource')
        .map(e => new URL(e.name).pathname)
        .filter(p => /\/js\/dev\/|\/css\/dev\.css/.test(p))),
    }),
  });
} finally {
  await browser.close();
  server.close();
}

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ observed, errors }, null, 2));

console.log(JSON.stringify(observed, null, 2));
console.log(`\nConsole errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
console.log(`\nScreenshots and summary.json written to ${outDir}`);

process.exit(errors.length > 0 ? 1 : 0);
