/**
 * @fileoverview Architecture invariant tests (tspec §4.7 item 19).
 *
 * Verifies that no UI module directly imports from `../game/` or
 * `../providers/`. Each UI module is fetched as text and scanned for
 * forbidden import patterns.
 */

const UI_MODULES = [
  '/js/ui/grid.js',
  '/js/ui/numpad.js',
  '/js/ui/controls.js',
  '/js/ui/stats.js',
  '/js/ui/winBanner.js',
  '/js/ui/dialog.js',
  '/js/ui/srLive.js',
  '/js/ui/themes.js',
  '/js/ui/handedness.js',
  '/js/ui/keyboard.js',
  '/js/ui/notice.js',
  '/js/ui/share.js',
];

// Forbidden import patterns: any import from ../game/ or ../providers/ (relative paths).
const FORBIDDEN = [/from\s+['"]\.\.\/game\//,  /from\s+['"]\.\.\/providers\//];

describe('arch: UI modules must not directly import from game/ or providers/', () => {
  for (const path of UI_MODULES) {
    it(`${path} has no forbidden imports`, async function () {
      this.timeout(5000);
      const res = await fetch(path);
      if (!res.ok) {
        throw new Error(`Could not fetch ${path}: ${res.status}`);
      }
      const src = await res.text();
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(src), `${path} contains forbidden import matching ${pattern}`).to.be.false;
      }
    });
  }
});

// Developer tooling must stay behind the lazy import: the only dev module any
// always-loaded file may import statically is the flag (devMode.js).
describe('arch: developer tooling is only ever imported lazily', () => {
  const ALWAYS_LOADED = ['/js/main.js', '/js/ui/grid.js', '/js/ui/share.js', '/js/ui/notice.js',
    '/js/game/puzzleLoader.js', '/js/game/state.js', '/js/providers/loadProvider.js', '/js/dev/devMode.js',
    '/js/util/events.js', '/js/persist/storage.js', '/js/util/clipboard.js', '/js/game/statistics.js',
    '/js/providers/cookieStatsStore.js', '/js/providers/clientGenProvider.js', '/js/ui/srLive.js',
    '/js/ui/dialog.js', '/js/ui/coach.js', '/js/generator/pipeline.js', '/js/generator/loadPuzzle.js',
    '/js/worker/protocol.js', '/js/worker/generator.worker.js', '/js/game/foreground.js'];
  const STATIC_DEV_IMPORT =
    /^\s*import\s+(?:[^;'"]*\sfrom\s+)?['"][^'"]*\/dev\/(?!devMode\.js['"])[^'"]*['"]/m;

  it('AR-D1: the static-import pattern accepts devMode.js and rejects any other dev module', () => {
    expect(STATIC_DEV_IMPORT.test("import { initDevMode } from './dev/devMode.js';")).to.be.false;
    expect(STATIC_DEV_IMPORT.test("import('./dev/devPanel.js')")).to.be.false;
    expect(STATIC_DEV_IMPORT.test("import { mount } from './dev/devPanel.js';")).to.be.true;
    expect(STATIC_DEV_IMPORT.test("import {\n  boot,\n} from '../dev/devBoot.js';")).to.be.true;
    expect(STATIC_DEV_IMPORT.test("import '../dev/devApi.js';")).to.be.true;
  });

  for (const path of ALWAYS_LOADED) {
    it(`AR-D1: ${path} has no static import from /dev/ other than devMode.js`, async function () {
      this.timeout(5000);
      const src = await (await fetch(path)).text();
      expect(STATIC_DEV_IMPORT.test(src)).to.be.false;
    });
  }

  it('AR-D2: main.js imports devPanel.js dynamically, guarded by the dev flag', async function () {
    this.timeout(5000);
    const src = await (await fetch('/js/main.js')).text();
    expect(src).to.match(/if \(devMode\) \{\s*import\('\.\/dev\/devPanel\.js'\)/);
  });

  it('AR-D4: main.js imports devBoot.js dynamically, guarded by the dev flag', async function () {
    this.timeout(5000);
    const src = await (await fetch('/js/main.js')).text();
    expect(src).to.include("devMode ? (await import('./dev/devBoot.js'))");
  });

  it('AR-D6: game/foreground.js imports only config.js and touches no DOM or storage', async function () {
    this.timeout(5000);
    const src = await (await fetch('/js/game/foreground.js')).text();
    const IMPORT_SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
    const specs = [...src.matchAll(IMPORT_SPEC)].map(([, spec]) => spec);
    expect(specs).to.deep.equal(['../config.js']);
    for (const name of ['document', 'window', 'localStorage']) {
      expect(new RegExp(`\\b${name}\\b`).test(src), `foreground.js mentions ${name}`).to.be.false;
    }
  });

  it('AR-D3: index.html contains no developer markup or stylesheet', async function () {
    this.timeout(5000);
    const html = await (await fetch('/index.html')).text();
    expect(html).to.not.match(/dev-root|dev-badge|dev\.css|devPanel|sudokuDev|dev-rec|devBoot/);
  });

  // Every module reachable from the page and worker entry points through
  // static or dynamic imports, outside js/dev/ and js/tests/.
  async function reachableAppModules() {
    const IMPORT_SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
    const roots = ['/js/main.js', '/js/worker/generator.worker.js'];
    const seen = new Set(roots);
    const sources = new Map();
    const queue = [...roots];
    while (queue.length > 0) {
      const path = queue.shift();
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not fetch ${path}: ${res.status}`);
      const src = await res.text();
      sources.set(path, src);
      for (const [, spec] of src.matchAll(IMPORT_SPEC)) {
        if (!spec.startsWith('.')) continue;
        const next = new URL(spec, `http://x${path}`).pathname;
        if (next.startsWith('/js/dev/') || next.startsWith('/js/tests/')) continue;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return sources;
  }

  it('AR-D5: no module outside js/dev/ and js/tests/ mentions indexedDB', async function () {
    this.timeout(10000);
    const sources = await reachableAppModules();
    expect(sources.size).to.be.greaterThan(40);
    for (const [path, src] of sources) {
      expect(src.includes('indexedDB'), `${path} mentions indexedDB`).to.be.false;
    }
  });

  // A dev action name used as a value rather than compared against; the reducer
  // and listeners such as coach.js may still test `action.type` for it.
  const DEV_ACTION_VALUE =
    /(?<!(?:===|!==|\bcase)\s*)['"](?:DEV_SET_PENCIL|DEV_FILL_PENCIL|DEV_RESTORE_POSITION)['"]/;
  const HINT_WITH_HINT = /\btype\s*:\s*['"]HINT['"][^}]*\bhint\b/;
  const REDUCER = '/js/game/state.js';

  it('AR-D7: the dev-dispatch patterns accept comparisons and a plain HINT and reject the rest', () => {
    expect(DEV_ACTION_VALUE.test("if (action.type === 'DEV_RESTORE_POSITION')")).to.be.false;
    expect(DEV_ACTION_VALUE.test("case 'DEV_SET_PENCIL': {")).to.be.false;
    expect(DEV_ACTION_VALUE.test("dispatch({ type: 'DEV_FILL_PENCIL' })")).to.be.true;
    expect(DEV_ACTION_VALUE.test("const t = 'DEV_RESTORE_POSITION';")).to.be.true;
    expect(HINT_WITH_HINT.test("dispatch({ type: 'HINT' });")).to.be.false;
    expect(HINT_WITH_HINT.test("dispatch({ type: 'HINT', hint });")).to.be.true;
    expect(HINT_WITH_HINT.test("dispatch({\n  type: 'HINT',\n  hint: step,\n});")).to.be.true;
  });

  it('AR-D7: no module outside js/dev/ and js/tests/ dispatches a dev action or a HINT with a hint', async function () {
    this.timeout(10000);
    const sources = await reachableAppModules();
    expect(sources.size).to.be.greaterThan(40);
    for (const [path, src] of sources) {
      if (path !== REDUCER) {
        expect(DEV_ACTION_VALUE.test(src), `${path} uses a dev action name`).to.be.false;
      }
      expect(HINT_WITH_HINT.test(src), `${path} dispatches HINT with a hint`).to.be.false;
    }
  });
});
