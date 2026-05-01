/**
 * Playwright-based test runner.
 *
 * 1. Starts the static file server (serve.js).
 * 2. Launches headless Chromium.
 * 3. Opens js/tests/setup.html with JS coverage enabled.
 * 4. Waits for Mocha to finish.
 * 5. Writes V8 coverage JSON to coverage/.
 * 6. Exits non-zero on any test failure.
 *
 * Worker coverage note (tspec §4.2): Playwright's page.coverage API captures
 * coverage from the main frame only. Worker scripts run in a separate context
 * and their coverage is NOT collected here. Worker code coverage is addressed
 * by direct-import unit tests that exercise the generator pipeline without
 * spawning a Worker.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './serve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERAGE_DIR = path.resolve(__dirname, '../coverage');

async function run() {
  const server = await startServer();
  let browser;
  let exitCode = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Relay browser console output to the terminal.
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error' || type === 'warn') {
        console.error(`[browser ${type}] ${text}`);
      } else if (text.startsWith('[PERF]')) {
        console.log(text);
      }
    });
    page.on('pageerror', err => console.error(`[page error] ${err.message}`));

    // Enable V8 JS coverage.
    await page.coverage.startJSCoverage({ resetOnNavigation: false });

    // Navigate to the Mocha test runner page.
    await page.goto('http://localhost:3001/js/tests/setup.html');

    // Wait for Mocha to finish — the page dispatches 'mocha:done' on window
    // and sets window.mochaResults.
    const results = await page.evaluate(() => {
      return new Promise((resolve) => {
        if (window.mochaResults) {
          resolve(window.mochaResults);
          return;
        }
        window.addEventListener('mocha:done', (e) => resolve(e.detail), { once: true });
      });
    });

    // Collect coverage.
    const coverageEntries = await page.coverage.stopJSCoverage();

    // Write coverage entries to coverage/ directory.
    if (!fs.existsSync(COVERAGE_DIR)) {
      fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    }

    // Write a combined coverage file in V8 format for c8.
    const coverageData = { result: coverageEntries };
    fs.writeFileSync(
      path.join(COVERAGE_DIR, 'coverage.json'),
      JSON.stringify(coverageData),
    );

    // Print results summary.
    const passes = results.passes || 0;
    const failures = results.failures || 0;
    const pending = results.pending || 0;

    console.log(`\nTest Results:`);
    console.log(`  Passing: ${passes}`);
    console.log(`  Failing: ${failures}`);
    console.log(`  Pending: ${pending}`);

    if (results.failureDetails && results.failureDetails.length > 0) {
      console.log('\nFailures:');
      for (const f of results.failureDetails) {
        console.log(`  [FAIL] ${f.fullTitle}`);
        console.log(`         ${f.error}`);
      }
    }

    if (failures > 0) {
      exitCode = 1;
    }

  } catch (err) {
    console.error('Runner error:', err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  process.exit(exitCode);
}

run();
