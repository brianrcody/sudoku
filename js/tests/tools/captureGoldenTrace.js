/**
 * @fileoverview Node script (not a browser test): captures the golden reducer
 * trace (tspec-debug-instrumentation SG0) from a past commit.
 *
 *   node js/tests/tools/captureGoldenTrace.js [commit]     (default a4defe6)
 *
 * Extracts `js/` of `commit` into a temporary directory with `git archive`
 * (the working tree is never touched), serves it under `/head/` next to the
 * working tree on port 3002, and runs js/tests/helpers/goldenScript.js in
 * headless Chromium against `/head/js/game/state.js`. Writes
 * js/tests/fixtures/state/golden-trace.json.
 *
 * The golden file must come from the reducer as it was before the debug
 * instrumentation seams; re-capturing from a later commit proves nothing.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(REPO, 'js/tests/fixtures/state/golden-trace.json');
const PORT = 3002;
const commit = process.argv[2] ?? 'a4defe6';

const CAPTURE_PAGE = `<!DOCTYPE html><meta charset="utf-8"><script type="module">
  import { createGameState } from '/head/js/game/state.js';
  import { runGoldenScript } from '/js/tests/helpers/goldenScript.js';
  runGoldenScript(createGameState).then(
    trace => { window.__trace = trace; },
    error => { window.__error = String(error && error.stack || error); });
</script>`;

function serve(headRoot) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/capture.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(CAPTURE_PAGE);
      return;
    }
    const [root, rel] = urlPath.startsWith('/head/')
      ? [headRoot, urlPath.slice('/head'.length)]
      : [REPO, urlPath];
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
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

async function main() {
  const headRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-head-'));
  const sha = execFileSync('git', ['rev-parse', commit], { cwd: REPO }).toString().trim();
  const archive = execFileSync('git', ['archive', sha, 'js'], { cwd: REPO, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', headRoot], { input: archive });

  const server = await serve(headRoot);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error(`[page error] ${err.message}`));
    await page.goto(`http://127.0.0.1:${PORT}/capture.html`);
    await page.waitForFunction(() => window.__trace || window.__error, null, { timeout: 60000 });
    const error = await page.evaluate(() => window.__error);
    if (error) throw new Error(error);
    const trace = await page.evaluate(() => window.__trace);
    const doc = { capturedFrom: sha, capturedAt: new Date().toISOString(), trace };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(doc, null, 0).replace(/\},\{"e"/g, '},\n{"e"') + '\n');
    console.log(`Captured ${trace.length} records from ${sha} → ${path.relative(REPO, OUT)}`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(headRoot, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
