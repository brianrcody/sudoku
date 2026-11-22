/**
 * Live-debugging driver: runs the app in a headed debug Chrome and drives it
 * over CDP while a person watches and plays along.
 *
 * Usage:
 *   node scripts/devdrive.mjs up             start the server (:8080) and debug Chrome (:9222)
 *   node scripts/devdrive.mjs down           stop what `up` started
 *   node scripts/devdrive.mjs status         report whether each answers
 *   node scripts/devdrive.mjs run <file.mjs> run a file whose default export is
 *                                            async ({page, context, browser, shot, dev}) => any
 *   node scripts/devdrive.mjs -e '<body>'    run an async function body with the same names in scope
 *
 * `dev` holds the panel helpers from scripts/devdrive/panel.mjs bound to the
 * app tab: load, openTool, runSolver, applyStep (1-based, as the panel numbers
 * steps), overlay, coach, summary, cellRef. A snippet's return value is
 * printed as JSON, followed by any console errors, page errors and failed
 * requests seen while it ran. Screenshots and logs go under the OS temp dir
 * (`sudoku-devdrive/`). Example:
 *
 *   node scripts/devdrive.mjs -e 'await dev.load("<81 cells>"); await dev.runSolver();
 *     await dev.applyStep(17); return dev.coach()'
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { up, down, status } from './devdrive/lifecycle.mjs';
import { connect } from './devdrive/connect.mjs';
import { bind } from './devdrive/panel.mjs';

const USAGE = 'usage: node scripts/devdrive.mjs up | down | status | run <file.mjs> | -e \'<async body>\'';

async function runSnippet(fn) {
  const conn = await connect();
  const env = { ...conn, dev: bind(conn.page) };
  try {
    const result = await fn(env);
    if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('[driver error]', e.stack || e);
    process.exitCode = 1;
  } finally {
    if (conn.events.length) console.log('--- page events ---\n' + conn.events.join('\n'));
    await conn.browser.close();   // disconnects; Chrome keeps running
  }
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case 'up':
    console.log((await up()).join('\n'));
    break;
  case 'down':
    console.log((await down()).join('\n'));
    break;
  case 'status': {
    const s = await status();
    console.log(`server: ${s.server ? 'up' : 'down'}\nchrome: ${s.chrome ? 'up' : 'down'}`);
    break;
  }
  case 'run':
    if (!arg) throw new Error(USAGE);
    await runSnippet((await import(pathToFileURL(path.resolve(arg)).href)).default);
    break;
  case '-e':
    if (!arg) throw new Error(USAGE);
    await runSnippet(new Function('env',
      `const {page, context, browser, shot, events, dev} = env; return (async () => { ${arg} })();`));
    break;
  default:
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
}
