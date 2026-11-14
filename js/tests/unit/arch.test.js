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
    '/js/game/puzzleLoader.js', '/js/game/state.js', '/js/providers/loadProvider.js', '/js/dev/devMode.js'];
  const STATIC_TOOLING_IMPORT = /^\s*import\s[^;]*from\s+['"][^'"]*\/dev\/(devPanel|inspect)\.js['"]/m;

  for (const path of ALWAYS_LOADED) {
    it(`AR-D1: ${path} has no static import of devPanel.js or inspect.js`, async function () {
      this.timeout(5000);
      const src = await (await fetch(path)).text();
      expect(STATIC_TOOLING_IMPORT.test(src)).to.be.false;
    });
  }

  it('AR-D2: main.js imports devPanel.js dynamically, guarded by the dev flag', async function () {
    this.timeout(5000);
    const src = await (await fetch('/js/main.js')).text();
    expect(src).to.match(/if \(devMode\) \{\s*import\('\.\/dev\/devPanel\.js'\)/);
  });

  it('AR-D3: index.html contains no developer markup or stylesheet', async function () {
    this.timeout(5000);
    const html = await (await fetch('/index.html')).text();
    expect(html).to.not.match(/dev-root|dev-badge|dev\.css|devPanel/);
  });
});
