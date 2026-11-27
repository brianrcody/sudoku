/**
 * @fileoverview Node script (not a browser test): captures the golden reducer
 * trace (tspec-debug-instrumentation SG0) from the working tree.
 *
 *   node js/tests/tools/captureGoldenTrace.js
 *
 * Serves the repository on port 3002, runs js/tests/helpers/goldenScript.js in
 * headless Chromium against js/game/state.js, and writes
 * js/tests/fixtures/state/golden-trace.json. Before writing, it lists every
 * record that differs from the existing file.
 *
 * Re-capture only for a deliberate change to reducer behaviour, and only after
 * every listed difference is explained by that change: an unreviewed re-capture
 * blesses whatever the reducer now does. (The first capture came from a4defe6,
 * before the debug-instrumentation seams, and proved they change nothing in
 * normal mode; the trace has since been a regression net for the reducer.)
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(REPO, 'js/tests/fixtures/state/golden-trace.json');
const PORT = 3002;

const CAPTURE_PAGE = `<!DOCTYPE html><meta charset="utf-8"><script type="module">
  import { createGameState } from '/js/game/state.js';
  import { runGoldenScript } from '/js/tests/helpers/goldenScript.js';
  runGoldenScript(createGameState).then(
    trace => { window.__trace = trace; },
    error => { window.__error = String(error && error.stack || error); });
</script>`;

function serve() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/capture.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(CAPTURE_PAGE);
      return;
    }
    const file = path.join(REPO, urlPath);
    if (!file.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const type = file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/** Prints the records of `next` that differ from the existing golden file. */
function reportDifferences(next) {
  if (!fs.existsSync(OUT)) return;
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).trace;
  const differing = [];
  for (let i = 0; i < Math.max(prev.length, next.length); i++) {
    if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) differing.push(i);
  }
  if (prev.length !== next.length) console.log(`Record count: ${prev.length} → ${next.length}`);
  if (differing.length === 0) {
    console.log('No records differ from the existing golden file.');
    return;
  }
  console.log(`${differing.length} records differ from the existing golden file:`);
  for (const i of differing) {
    const r = next[i] ?? prev[i];
    console.log(`  ${i}: ${r.e} ${r.action?.type ?? r.type ?? ''}`);
  }
}

async function main() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim();
  const dirty = execFileSync('git', ['status', '--porcelain', 'js'], { cwd: REPO }).toString().trim() !== '';

  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error(`[page error] ${err.message}`));
    await page.goto(`http://127.0.0.1:${PORT}/capture.html`);
    await page.waitForFunction(() => window.__trace || window.__error, null, { timeout: 60000 });
    const error = await page.evaluate(() => window.__error);
    if (error) throw new Error(error);
    const trace = await page.evaluate(() => window.__trace);
    reportDifferences(trace);
    const doc = { capturedFrom: dirty ? `${sha} + working tree` : sha, capturedAt: new Date().toISOString(), trace };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(doc, null, 0).replace(/\},\{"e"/g, '},\n{"e"') + '\n');
    console.log(`Captured ${trace.length} records → ${path.relative(REPO, OUT)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
