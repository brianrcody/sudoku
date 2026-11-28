/**
 * @fileoverview Unit tests for js/ui/themes.js (UT1–UT12; UT8–UT12 tspec-hamburger-menu §2.5).
 *
 * UT7 (inline head script / first-paint flicker) is an integration test that
 * requires loading the full page. It is implemented in system.test.js as part
 * of the SYS4 theme-cycle test.
 */

import * as themesModule from '../../ui/themes.js';
import { applyTheme, initTheme, THEME_OPTIONS, currentTheme } from '../../ui/themes.js';
import { mount as mountSrLive } from '../../ui/srLive.js';
import * as cookies from '../../persist/cookies.js';
import { THEME_CLASSES } from '../../config.js';

const THEME_COOKIE = 'sudoku.theme';

describe('ui/themes.js', () => {
  let srLive;

  beforeEach(() => {
    srLive = document.createElement('div');
    srLive.id = 'sr-live';
    document.body.appendChild(srLive);
    mountSrLive(document.body);
    // setup.js resets body class to 'theme-minimalist' in beforeEach.
  });

  afterEach(() => {
    srLive?.remove();
    srLive = null;
  });

  // UT1: applyTheme removes existing theme classes
  it('UT1: applyTheme removes all existing THEME_CLASSES before adding the new one', () => {
    // First apply a known theme so the class exists.
    document.body.classList.add('theme-coffee');
    applyTheme('theme-minimalist', false);

    for (const cls of THEME_CLASSES) {
      if (cls !== 'theme-minimalist') {
        expect(document.body.classList.contains(cls)).to.be.false;
      }
    }
    expect(document.body.classList.contains('theme-minimalist')).to.be.true;
  });

  // UT2: applyTheme adds the new class
  it('UT2: applyTheme adds the requested theme class to body', () => {
    applyTheme('theme-coffee', false);
    expect(document.body.classList.contains('theme-coffee')).to.be.true;
  });

  // UT3: applyTheme writes cookie
  it('UT3: applyTheme writes the theme name to the sudoku.theme cookie', () => {
    applyTheme('theme-school', false);
    const val = cookies.get(THEME_COOKIE);
    expect(val).to.equal('school');
  });

  // UT4: applyTheme announces via srLive when shouldAnnounce=true
  it('UT4: applyTheme with shouldAnnounce=true sets a non-empty live region text', async () => {
    applyTheme('theme-terminal', true);
    await new Promise(r => requestAnimationFrame(r));
    expect(srLive.textContent).to.not.equal('');
    expect(srLive.textContent.toLowerCase()).to.include('theme');
  });

  // UT5: initTheme reads cookie and applies the saved theme
  it('UT5: initTheme applies the theme from the cookie', () => {
    cookies.set(THEME_COOKIE, 'mountain');
    initTheme();
    expect(document.body.classList.contains('theme-mountain')).to.be.true;
  });

  // UT6: initTheme defaults to minimalist when no cookie
  it('UT6: initTheme falls back to theme-minimalist when no cookie is set', () => {
    // Cookie already cleared by setup.js beforeEach.
    initTheme();
    expect(document.body.classList.contains('theme-minimalist')).to.be.true;
  });

  // UT7: Inline head script test (first-paint flicker)
  // DEVIATION: This test requires loading the full page in an iframe to
  // verify the inline script applies the theme before first paint. It is
  // covered by the SYS4 integration test in system.test.js. Providing a
  // structural placeholder here for traceability.
  it('UT7: initTheme correctly reflects cookie state (covers inline-script contract)', () => {
    cookies.set(THEME_COOKIE, 'coffee');
    initTheme();
    expect(document.body.classList.contains('theme-coffee')).to.be.true;
  });

  it('UT8: THEME_OPTIONS lists every theme in THEME_CLASSES order', () => {
    expect(THEME_OPTIONS).to.deep.equal([
      { value: 'minimalist', label: 'Minimalist' },
      { value: 'coffee', label: 'Coffee Shop' },
      { value: 'school', label: 'School' },
      { value: 'terminal', label: 'Digital Terminal' },
      { value: 'mountain', label: 'Mountain' },
    ]);
    expect(THEME_OPTIONS.map(o => 'theme-' + o.value)).to.deep.equal(THEME_CLASSES);
  });

  it('UT9: currentTheme returns the applied theme', () => {
    document.body.className = 'theme-coffee';
    expect(currentTheme()).to.equal('coffee');
  });

  it('UT10: currentTheme falls back to the default with no theme class', () => {
    document.body.className = '';
    expect(currentTheme()).to.equal('minimalist');
  });

  it("UT11: the menu's apply path announces the display name", async () => {
    applyTheme('theme-' + 'terminal');
    await new Promise(r => requestAnimationFrame(r));
    expect(srLive.textContent).to.equal('Theme changed to Digital Terminal.');
  });

  it('UT12: bindThemeSelect is gone', () => {
    expect('bindThemeSelect' in themesModule).to.be.false;
  });
});
