/**
 * Start and stop the live-debugging pair: the no-store static server and a
 * headed Chrome with remote debugging on a throwaway profile (so the player's
 * real stats and settings are never touched). Both run detached; their PIDs
 * live in a state file so `down` works from any later shell.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_PORT = 8080;
export const CDP_PORT = 9222;
export const BASE_URL = `http://localhost:${SERVER_PORT}`;
export const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
/** Runtime files: state, logs, Chrome profile, screenshots. */
export const RUN_DIR = path.join(os.tmpdir(), 'sudoku-devdrive');

const STATE_FILE = path.join(RUN_DIR, 'state.json');
const SERVER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');

async function _responds(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function _waitFor(url, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await _responds(url)) return;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs} ms (logs in ${RUN_DIR})`);
}

function _readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function _spawnDetached(command, args, logName) {
  const log = fs.openSync(path.join(RUN_DIR, logName), 'a');
  const child = spawn(command, args, { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  return child.pid;
}

/**
 * Report whether the server and the debug Chrome answer.
 * @returns {Promise<{server: boolean, chrome: boolean}>}
 */
export async function status() {
  return {
    server: await _responds(`${BASE_URL}/`),
    chrome: await _responds(`${CDP_URL}/json/version`),
  };
}

/**
 * Start whichever of the pair is not already answering, then wait until both do.
 * @returns {Promise<string[]>} One line per component describing what happened.
 */
export async function up() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const state = _readState();
  const running = await status();
  const report = [];

  if (running.server) {
    report.push(`server: already answering at ${BASE_URL}`);
  } else {
    state.serverPid = _spawnDetached(process.execPath, [SERVER_SCRIPT, String(SERVER_PORT)], 'server.log');
    await _waitFor(`${BASE_URL}/`, 'server');
    report.push(`server: started at ${BASE_URL} (pid ${state.serverPid})`);
  }

  if (running.chrome) {
    report.push(`chrome: already answering at ${CDP_URL}`);
  } else {
    const chrome = process.env.CHROME ?? 'google-chrome';
    state.chromePid = _spawnDetached(chrome, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${path.join(RUN_DIR, 'chrome-profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      `${BASE_URL}/?dev=1`,
    ], 'chrome.log');
    await _waitFor(`${CDP_URL}/json/version`, 'chrome');
    report.push(`chrome: started with remote debugging at ${CDP_URL} (pid ${state.chromePid})`);
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  return report;
}

/**
 * Stop the pair if `up` started it. Anything started some other way is left
 * alone and reported.
 * @returns {Promise<string[]>}
 */
export async function down() {
  const state = _readState();
  const report = [];
  for (const [key, label] of [['chromePid', 'chrome'], ['serverPid', 'server']]) {
    const pid = state[key];
    if (!pid) continue;
    try {
      // Detached children lead their own process group; this takes Chrome's helpers too.
      process.kill(-pid, 'SIGTERM');
      report.push(`${label}: stopped (pid ${pid})`);
    } catch {
      report.push(`${label}: pid ${pid} was not running`);
    }
    delete state[key];
  }
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));

  await new Promise(r => setTimeout(r, 500));
  const still = await status();
  if (still.server) report.push(`server: still answering at ${BASE_URL} (not started by devdrive)`);
  if (still.chrome) report.push(`chrome: still answering at ${CDP_URL} (not started by devdrive)`);
  if (report.length === 0) report.push('nothing to stop');
  return report;
}
