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
  '/js/ui/keyboard.js',
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
