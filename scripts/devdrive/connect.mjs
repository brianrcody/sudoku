/**
 * Attach to the running debug Chrome over CDP and find the app tab.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { BASE_URL, CDP_URL, RUN_DIR } from './lifecycle.mjs';

export const SHOTS_DIR = path.join(RUN_DIR, 'shots');

/**
 * @typedef {Object} Connection
 * @property {import('playwright').Browser} browser - `close()` only disconnects.
 * @property {import('playwright').BrowserContext} context
 * @property {import('playwright').Page} page - The app tab.
 * @property {string[]} events - Console warnings/errors, page errors and failed requests.
 * @property {(name: string, opts?: object) => Promise<string>} shot - Screenshot; returns the file path.
 */

/**
 * Connect, bypass the HTTP cache, and start collecting page events.
 * @returns {Promise<Connection>}
 */
export async function connect() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    throw new Error(`No debug Chrome at ${CDP_URL}. Run: node scripts/devdrive.mjs up`);
  }
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().startsWith(BASE_URL)) ?? context.pages()[0];

  // The server sends no-store, but a profile reused from before devdrive (or
  // another server) may hold cached modules; the worker is a separate target,
  // so empty the cache rather than only disabling it for the page.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.clearBrowserCache');

  const events = [];
  // The app has no favicon; Chrome's request for one is noise.
  const isFavicon = url => url?.endsWith('/favicon.ico');
  page.on('console', m => {
    if ((m.type() === 'error' || m.type() === 'warning') && !isFavicon(m.location().url)) {
      events.push(`[console.${m.type()}] ${m.text()}`);
    }
  });
  page.on('pageerror', e => events.push(`[pageerror] ${e.stack || e.message}`));
  page.on('requestfailed', r => events.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => {
    if (r.status() >= 400 && !isFavicon(r.url())) events.push(`[http ${r.status()}] ${r.url()}`);
  });

  const shot = async (name, opts = {}) => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const file = path.join(SHOTS_DIR, `${name}.png`);
    await page.screenshot({ path: file, ...opts });
    return file;
  };

  return { browser, context, page, events, shot };
}
