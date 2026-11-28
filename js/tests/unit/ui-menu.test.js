/**
 * @fileoverview Unit tests for js/ui/menu.js (MN1–MN116, tspec-hamburger-menu §2.1).
 *
 * Every test mounts a fresh rig (§1.2): the static `.menu-wrap` markup of
 * aspec §3.2, outside targets, stub hooks and a fake MediaQueryList. menu.js
 * keeps module-level state and its document listeners read it, so a stale
 * listener from an earlier mount acts on the latest rig (tspec §5 item 3).
 */

import { mount, isOpen, close, NARROW_QUERY } from '../../ui/menu.js';
import { THEME_OPTIONS } from '../../ui/themes.js';

const { makeFakeGameState } = window;

const ITEM_IDS = [
  'mi-stats', 'mi-share', 'mi-reset',
  'mi-theme-minimalist', 'mi-theme-coffee', 'mi-theme-school', 'mi-theme-terminal', 'mi-theme-mountain',
  'mi-hand',
];
const THEME_IDS = ITEM_IDS.slice(3, 8);

const PUZZLE = { id: 'p', difficulty: 'easy', givens: new Uint8Array(81), solution: new Uint8Array(81) };

/** Dispatches a bubbling, cancelable keydown on `el` and returns it. */
function key(el, k, mods = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  el.dispatchEvent(e);
  return e;
}

/** Counts bubble-phase keydowns reaching document and window. */
function docKeySpy() {
  const counts = { document: 0, window: 0 };
  const onDoc = () => { counts.document++; };
  const onWin = () => { counts.window++; };
  document.addEventListener('keydown', onDoc);
  window.addEventListener('keydown', onWin);
  counts.remove = () => {
    document.removeEventListener('keydown', onDoc);
    window.removeEventListener('keydown', onWin);
  };
  return counts;
}

function makeMedia(matches) {
  return {
    matches,
    addEventListener(type, fn) { this._fn = fn; },
    flip(m) { this.matches = m; this._fn({ matches: m }); },
  };
}

describe('ui/menu.js', () => {
  let rig;
  let cleanups;

  /**
   * @param {{ puzzle?: ?object, theme?: string, left?: boolean, narrow?: boolean,
   *           options?: Array, nextFocus?: function, media?: ?object }} [opts]
   *   `media: null` omits `hooks.media`.
   */
  function makeMenuRig({
    puzzle = PUZZLE, theme = 'minimalist', left = false, narrow = false,
    options = THEME_OPTIONS, nextFocus, media,
  } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'menu-wrap';
    wrap.id = 'menu-root';
    wrap.innerHTML = `
      <button type="button" class="menu-button" id="menu-button"
              aria-haspopup="menu" aria-expanded="false" aria-controls="app-menu"
              aria-label="Menu"></button>
      <div class="app-menu" id="app-menu" role="menu" aria-label="Menu" hidden></div>`;
    const next = document.createElement('select');
    next.id = 't-next';
    next.innerHTML = '<option>a</option>';
    const outside = document.createElement('button');
    outside.id = 't-outside';
    outside.textContent = 'outside';
    const area = document.createElement('div');
    area.id = 't-area';
    area.textContent = 'area';
    const sr = document.createElement('div');
    sr.id = 'sr-live';
    document.body.append(wrap, next, outside, area, sr);

    const gs = makeFakeGameState({ puzzle, won: false });
    const calls = { statistics: [], share: [], reset: [], apply: [], toggle: 0 };
    const record = list => () => list.push({ active: document.activeElement, open: isOpen() });
    let currentTheme = theme;
    let isLeft = left;
    const themes = {
      options,
      current: () => currentTheme,
      apply: v => { calls.apply.push(v); currentTheme = v; },
      set: v => { currentTheme = v; },
    };
    const hand = {
      isLeft: () => isLeft,
      toggle: () => { calls.toggle++; isLeft = !isLeft; },
      set: v => { isLeft = v; },
    };
    const fakeMedia = media === undefined ? makeMedia(narrow) : media;
    const hooks = {
      onStatistics: record(calls.statistics),
      onShare: record(calls.share),
      onReset: record(calls.reset),
      themes,
      hand,
      nextFocus: nextFocus ?? (() => next),
    };
    if (fakeMedia !== null) hooks.media = fakeMedia;

    mount(wrap, gs, hooks);

    const $ = id => document.getElementById(id);
    rig = {
      wrap, gs, calls, themes, hand, media: fakeMedia, next, outside, area, sr, $,
      button: $('menu-button'),
      menu: $('app-menu'),
      items: () => [...$('app-menu').querySelectorAll('.mi')],
    };
    return rig;
  }

  const active = () => document.activeElement;
  const openByClick = () => rig.button.click();
  /** Focuses an item natively; the menu's focusin listener syncs the roving stop. */
  const focusOn = id => rig.$(id).focus();
  const tabStops = () => rig.items().filter(i => i.getAttribute('tabindex') === '0');
  const pointer = (el, pointerType) =>
    el.dispatchEvent(new PointerEvent('pointermove', { pointerType, bubbles: true }));
  /** Replaces `el.focus` with a recording spy that still focuses. */
  const spyFocus = el => {
    const spy = { count: 0 };
    const orig = el.focus.bind(el);
    el.focus = (...a) => { spy.count++; orig(...a); };
    return spy;
  };
  const stubActiveElement = el => {
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => el });
    cleanups.push(() => { delete document.activeElement; });
  };

  beforeEach(() => { cleanups = []; });

  afterEach(() => {
    for (const fn of cleanups.reverse()) fn();
    // Stale document listeners read module state: leave the module closed.
    close();
    if (rig) {
      for (const el of [rig.wrap, rig.next, rig.outside, rig.area, rig.sr]) el.remove();
    }
    rig = null;
  });

  // ── A. Mount and markup ───────────────────────────────────────────────────

  describe('mount and markup', () => {
    it('MN1: renders the nine items in order with ids and roles', () => {
      makeMenuRig();
      const items = rig.items();
      expect(items.map(i => i.id)).to.deep.equal(ITEM_IDS);
      expect(items.map(i => i.getAttribute('role'))).to.deep.equal([
        'menuitem', 'menuitem', 'menuitem',
        'menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio',
        'menuitemcheckbox',
      ]);
      for (const item of items) {
        expect(item.className).to.equal('mi');
        expect(item.getAttribute('tabindex')).to.equal('-1');
      }
    });

    it('MN2: Game items carry the specified names and popups', () => {
      makeMenuRig();
      const stats = rig.$('mi-stats');
      expect(stats.getAttribute('aria-label')).to.equal('Statistics');
      expect(stats.getAttribute('aria-haspopup')).to.equal('dialog');
      expect(stats.querySelector('.mi-label').textContent).to.equal('Statistics…');

      const share = rig.$('mi-share');
      expect(share.getAttribute('aria-label')).to.equal('Share puzzle link');
      expect(share.hasAttribute('aria-haspopup')).to.be.false;
      expect(share.querySelector('.mi-label').textContent).to.equal('Share puzzle');
      const hint = share.querySelector('.mi-hint');
      expect(hint.textContent).to.equal('Copy link');
      expect(hint.getAttribute('aria-hidden')).to.equal('true');

      const reset = rig.$('mi-reset');
      expect(reset.getAttribute('aria-label')).to.equal('Reset puzzle');
      expect(reset.getAttribute('aria-haspopup')).to.equal('dialog');
      expect(reset.querySelector('.mi-label').textContent).to.equal('Reset puzzle…');
    });

    it('MN3: theme items are named by their label text', () => {
      makeMenuRig();
      THEME_IDS.forEach((id, i) => {
        const item = rig.$(id);
        expect(item.hasAttribute('aria-label'), id).to.be.false;
        expect(item.querySelector('.mi-label').textContent).to.equal(THEME_OPTIONS[i].label);
        expect(item.dataset.theme).to.equal(THEME_OPTIONS[i].value);
        expect(item.querySelector('.mi-radio').getAttribute('aria-hidden')).to.equal('true');
        expect(item.querySelector('.mi-swatch').getAttribute('aria-hidden')).to.equal('true');
      });
      const hand = rig.$('mi-hand');
      expect(hand.querySelector('.mi-label').textContent).to.equal('Left-handed');
      expect(hand.querySelector('.mi-switch-track').getAttribute('aria-hidden')).to.equal('true');
    });

    it('MN4: sections are groups labelled by their headings, headings hidden', () => {
      makeMenuRig();
      const nameOf = el => el.getAttribute('aria-labelledby').split(' ')
        .map(id => rig.$(id).textContent).join(' ');
      const gameGroup = rig.$('mi-stats').parentElement;
      const themeGroup = rig.$('mi-theme-minimalist').parentElement;
      const handGroup = rig.menu.querySelector('.mi-hand-section');

      expect(gameGroup.getAttribute('role')).to.equal('group');
      expect(gameGroup.getAttribute('aria-labelledby')).to.equal('mh-game');
      expect(themeGroup.getAttribute('role')).to.equal('group');
      expect(themeGroup.getAttribute('aria-labelledby')).to.equal('mh-settings mh-theme');
      expect(handGroup.getAttribute('role')).to.equal('group');
      expect(handGroup.getAttribute('aria-labelledby')).to.equal('mh-settings');

      for (const [id, text] of [['mh-game', 'Game'], ['mh-settings', 'Settings'], ['mh-theme', 'Theme']]) {
        expect(rig.$(id).textContent).to.equal(text);
        expect(rig.$(id).getAttribute('aria-hidden')).to.equal('true');
      }
      const sections = rig.menu.querySelectorAll(':scope > .menu-section');
      expect(sections).to.have.length(2);
      for (const s of sections) expect(s.getAttribute('role')).to.equal('none');

      expect(nameOf(gameGroup)).to.equal('Game');
      expect(nameOf(themeGroup)).to.equal('Settings Theme');
      expect(nameOf(handGroup)).to.equal('Settings');
    });

    it('MN5: labels are inserted as text, never HTML', () => {
      makeMenuRig({ options: [{ value: 'x', label: '<b>X</b>' }], theme: 'x' });
      const label = rig.$('mi-theme-x').querySelector('.mi-label');
      expect(label.children).to.have.length(0);
      expect(label.textContent).to.equal('<b>X</b>');
    });

    it('MN6: mounts closed', () => {
      makeMenuRig();
      expect(rig.menu.hidden).to.be.true;
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
      expect(rig.button.getAttribute('aria-haspopup')).to.equal('menu');
      expect(rig.button.getAttribute('aria-controls')).to.equal('app-menu');
      expect(isOpen()).to.be.false;
    });

    it('MN7: NARROW_QUERY is the CSS breakpoint', () => {
      expect(NARROW_QUERY).to.equal('(max-width: 720px)');
    });

    it('MN8: without an injected media query, mount uses matchMedia(NARROW_QUERY)', () => {
      const queries = [];
      const fake = makeMedia(true);
      const orig = window.matchMedia;
      window.matchMedia = q => { queries.push(q); return fake; };
      cleanups.push(() => { window.matchMedia = orig; });

      makeMenuRig({ media: null });
      key(rig.button, 'ArrowUp');

      expect(queries).to.deep.equal([NARROW_QUERY]);
      expect(active()).to.equal(rig.$('mi-theme-mountain'));
    });

    it('MN9: isOpen tracks the open state', () => {
      makeMenuRig();
      const seen = [isOpen()];
      openByClick();
      seen.push(isOpen());
      close();
      seen.push(isOpen());
      expect(seen).to.deep.equal([false, true, false]);
    });
  });

  // ── B. Menu button ────────────────────────────────────────────────────────

  describe('menu button', () => {
    it('MN10: clicking the closed button opens on the first item', () => {
      makeMenuRig();
      openByClick();
      expect(rig.menu.hidden).to.be.false;
      expect(rig.button.getAttribute('aria-expanded')).to.equal('true');
      expect(active()).to.equal(rig.$('mi-stats'));
      expect(tabStops()).to.deep.equal([rig.$('mi-stats')]);
    });

    for (const [id, k] of [['MN11', 'Enter'], ['MN12', ' '], ['MN13', 'ArrowDown']]) {
      it(`${id}: ${JSON.stringify(k)} on the closed button opens on the first item and prevents the default`, () => {
        makeMenuRig();
        const e = key(rig.button, k);
        expect(isOpen()).to.be.true;
        expect(active()).to.equal(rig.$('mi-stats'));
        expect(e.defaultPrevented).to.be.true;
      });
    }

    it('MN14: ArrowUp on the closed button opens on the last item (wide)', () => {
      makeMenuRig({ narrow: false });
      const e = key(rig.button, 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-hand'));
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN15: ArrowUp on the closed button opens on Mountain (narrow)', () => {
      makeMenuRig({ narrow: true });
      key(rig.button, 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-theme-mountain'));
    });

    it('MN16: other keys on the closed button bubble untouched', () => {
      makeMenuRig();
      const spy = docKeySpy();
      cleanups.push(spy.remove);
      // Judged on the wrapper, before the document: game listeners left on the
      // document by earlier test files may themselves prevent digits.
      let preventedAtWrap = null;
      const onWrap = e => { preventedAtWrap = e.defaultPrevented; };
      rig.wrap.addEventListener('keydown', onWrap);
      ['5', 'p', 'c', 'Escape', 'Backspace'].forEach((k, i) => {
        key(rig.button, k);
        expect(preventedAtWrap, k).to.be.false;
        expect(isOpen(), k).to.be.false;
        expect(spy.document, k).to.equal(i + 1);
      });
    });

    it('MN17: clicking the button while open closes with focus on the button', () => {
      makeMenuRig();
      openByClick();
      openByClick();
      expect(isOpen()).to.be.false;
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
      expect(active()).to.equal(rig.button);
    });

    it('MN18: Enter and Space on the button while open close it', () => {
      makeMenuRig();
      for (const k of ['Enter', ' ']) {
        openByClick();
        rig.button.focus();
        const e = key(rig.button, k);
        expect(isOpen(), k).to.be.false;
        expect(active(), k).to.equal(rig.button);
        expect(e.defaultPrevented, k).to.be.true;
      }
    });

    it('MN19: ArrowDown and ArrowUp on the button while open do nothing but prevent', () => {
      makeMenuRig();
      openByClick();
      rig.button.focus();
      for (const k of ['ArrowDown', 'ArrowUp']) {
        const e = key(rig.button, k);
        expect(isOpen(), k).to.be.true;
        expect(active(), k).to.equal(rig.button);
        expect(e.defaultPrevented, k).to.be.true;
      }
    });
  });

  // ── C. State synchronized on open ─────────────────────────────────────────

  describe('state synchronized on open', () => {
    it('MN20: the current theme is the one checked item', () => {
      makeMenuRig({ theme: 'school' });
      openByClick();
      for (const id of THEME_IDS) {
        expect(rig.$(id).getAttribute('aria-checked'), id)
          .to.equal(id === 'mi-theme-school' ? 'true' : 'false');
      }
    });

    it('MN21: Left-handed reflects the preference', () => {
      makeMenuRig({ left: true });
      openByClick();
      expect(rig.$('mi-hand').getAttribute('aria-checked')).to.equal('true');
      close();
      for (const el of [rig.wrap, rig.next, rig.outside, rig.area, rig.sr]) el.remove();

      makeMenuRig({ left: false });
      openByClick();
      expect(rig.$('mi-hand').getAttribute('aria-checked')).to.equal('false');
    });

    it('MN22: Share and Reset are aria-disabled with no puzzle', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      for (const id of ['mi-share', 'mi-reset']) {
        expect(rig.$(id).getAttribute('aria-disabled'), id).to.equal('true');
        expect(rig.$(id).getAttribute('tabindex'), id).to.equal('-1');
      }
    });

    it('MN23: Share and Reset carry no aria-disabled with a puzzle', () => {
      makeMenuRig();
      openByClick();
      expect(rig.$('mi-share').hasAttribute('aria-disabled')).to.be.false;
      expect(rig.$('mi-reset').hasAttribute('aria-disabled')).to.be.false;
      expect(rig.$('mi-stats').hasAttribute('aria-disabled')).to.be.false;
    });

    it('MN24: opening resyncs state changed while closed', () => {
      makeMenuRig({ theme: 'school' });
      openByClick();
      close();
      rig.themes.set('coffee');
      rig.hand.set(true);
      openByClick();
      expect(rig.$('mi-theme-coffee').getAttribute('aria-checked')).to.equal('true');
      expect(rig.$('mi-theme-school').getAttribute('aria-checked')).to.equal('false');
      expect(rig.$('mi-hand').getAttribute('aria-checked')).to.equal('true');
    });
  });

  // ── D. Roving focus and navigation ────────────────────────────────────────

  describe('roving focus and navigation', () => {
    it('MN30: ArrowDown walks every item with exactly one tab stop', () => {
      makeMenuRig();
      openByClick();
      for (let i = 1; i < ITEM_IDS.length; i++) {
        const e = key(active(), 'ArrowDown');
        expect(active().id).to.equal(ITEM_IDS[i]);
        expect(tabStops()).to.deep.equal([active()]);
        expect(e.defaultPrevented).to.be.true;
      }
    });

    it('MN31: ArrowDown wraps from the last item to the first', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-hand');
      key(active(), 'ArrowDown');
      expect(active()).to.equal(rig.$('mi-stats'));
    });

    it('MN32: ArrowUp moves back and wraps from the first item to the last', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-reset');
      key(active(), 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-share'));
      focusOn('mi-stats');
      key(active(), 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-hand'));
    });

    it('MN33: Home and End go to the first and last visible items (wide)', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-theme-school');
      const end = key(active(), 'End');
      expect(active()).to.equal(rig.$('mi-hand'));
      const home = key(active(), 'Home');
      expect(active()).to.equal(rig.$('mi-stats'));
      expect(end.defaultPrevented).to.be.true;
      expect(home.defaultPrevented).to.be.true;
    });

    it('MN34: narrow: Left-handed is skipped by every navigation key', () => {
      makeMenuRig({ narrow: true });
      const hand = rig.$('mi-hand');
      let handFocused = false;
      hand.addEventListener('focus', () => { handFocused = true; });
      openByClick();
      key(active(), 'End');
      expect(active()).to.equal(rig.$('mi-theme-mountain'));
      key(active(), 'ArrowDown');
      expect(active()).to.equal(rig.$('mi-stats'));
      key(active(), 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-theme-mountain'));
      expect(handFocused).to.be.false;
    });

    it('MN35: disabled items are not skipped', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      key(active(), 'ArrowDown');
      expect(active()).to.equal(rig.$('mi-share'));
      key(active(), 'ArrowDown');
      expect(active()).to.equal(rig.$('mi-reset'));
    });

    it('MN36: ArrowLeft and ArrowRight do nothing but prevent', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-share');
      for (const k of ['ArrowLeft', 'ArrowRight']) {
        const e = key(active(), k);
        expect(active(), k).to.equal(rig.$('mi-share'));
        expect(isOpen(), k).to.be.true;
        expect(e.defaultPrevented, k).to.be.true;
      }
    });

    it('MN37: the first move after opening roves from the opening item', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'ArrowUp');
      expect(active()).to.equal(rig.$('mi-hand'));
      expect(rig.$('mi-stats').getAttribute('tabindex')).to.equal('-1');
      expect(tabStops()).to.deep.equal([rig.$('mi-hand')]);
    });
  });

  // ── E. Type-ahead ─────────────────────────────────────────────────────────

  describe('type-ahead', () => {
    it('MN40: a letter moves to the next item whose label starts with it, wrapping', () => {
      makeMenuRig();
      openByClick();
      for (const id of ['mi-share', 'mi-theme-school', 'mi-stats']) {
        const e = key(active(), 's');
        expect(active().id).to.equal(id);
        expect(e.defaultPrevented).to.be.true;
      }
    });

    it('MN41: C moves to Coffee Shop', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'c');
      expect(active()).to.equal(rig.$('mi-theme-coffee'));
    });

    it('MN42: matching is case-insensitive and starts after the focused item', () => {
      makeMenuRig();
      openByClick();
      for (const [k, id] of [['M', 'mi-theme-minimalist'], ['m', 'mi-theme-mountain'], ['m', 'mi-theme-minimalist']]) {
        key(active(), k);
        expect(active().id).to.equal(id);
      }
    });

    it('MN43: the only match wraps back to itself', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-theme-coffee');
      const e = key(active(), 'c');
      expect(active()).to.equal(rig.$('mi-theme-coffee'));
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN44: wide: L reaches Left-handed', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'l');
      expect(active()).to.equal(rig.$('mi-hand'));
    });

    it('MN45: narrow: L finds no visible match', () => {
      makeMenuRig({ narrow: true });
      openByClick();
      const e = key(active(), 'l');
      expect(active()).to.equal(rig.$('mi-stats'));
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN46: digits and unmatched letters do nothing but are consumed', () => {
      makeMenuRig();
      openByClick();
      for (const k of ['5', '1', 'x']) {
        const e = key(active(), k);
        expect(active(), k).to.equal(rig.$('mi-stats'));
        expect(e.defaultPrevented, k).to.be.true;
        expect(isOpen(), k).to.be.true;
      }
    });

    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      it(`MN47: a letter with ${mod} is not type-ahead and keeps its default`, () => {
        makeMenuRig();
        openByClick();
        const e = key(active(), 'm', { [mod]: true });
        expect(active()).to.equal(rig.$('mi-stats'));
        expect(e.defaultPrevented).to.be.false;
      });
    }

    it('MN48: named non-printable keys do nothing and keep their default', () => {
      makeMenuRig();
      openByClick();
      for (const [k, mods] of [['Backspace'], ['Delete'], ['F5'], ['Shift'], ['z', { ctrlKey: true }]]) {
        const e = key(active(), k, mods);
        expect(active(), k).to.equal(rig.$('mi-stats'));
        expect(e.defaultPrevented, k).to.be.false;
        expect(isOpen(), k).to.be.true;
      }
    });
  });

  // ── F. Closing from the keyboard ──────────────────────────────────────────

  describe('closing from the keyboard', () => {
    it('MN50: Escape closes and returns focus to the button', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-theme-school');
      const e = key(active(), 'Escape');
      expect(isOpen()).to.be.false;
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
      expect(active()).to.equal(rig.button);
      expect(tabStops()).to.be.empty;
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN51: Tab closes and moves to the next tab stop', () => {
      makeMenuRig();
      openByClick();
      const e = key(active(), 'Tab');
      expect(isOpen()).to.be.false;
      expect(active()).to.equal(rig.next);
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN52: Tab with no next target closes without throwing', () => {
      makeMenuRig({ nextFocus: () => null });
      openByClick();
      expect(() => key(active(), 'Tab')).not.to.throw();
      expect(isOpen()).to.be.false;
    });

    it('MN53: Shift+Tab closes and returns focus to the button', () => {
      makeMenuRig();
      openByClick();
      const e = key(active(), 'Tab', { shiftKey: true });
      expect(isOpen()).to.be.false;
      expect(active()).to.equal(rig.button);
      expect(e.defaultPrevented).to.be.true;
    });

    it('MN54: close() on a closed menu never moves focus', () => {
      makeMenuRig();
      rig.outside.focus();
      close({ focusButton: true });
      expect(active()).to.equal(rig.outside);
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
    });

    it('MN55: close() without focusButton leaves focus alone', () => {
      makeMenuRig();
      openByClick();
      const spy = spyFocus(rig.button);
      close();
      expect(isOpen()).to.be.false;
      expect(spy.count).to.equal(0);
    });
  });

  // ── G. Game shortcut suppression ──────────────────────────────────────────

  describe('game shortcut suppression', () => {
    const GAME_KEYS = [
      ['1'], ['9'], ['c'], ['C'], ['p'], ['P'], ['Backspace'], ['Delete'],
      ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['Home'], ['End'],
      ['z', { ctrlKey: true }], ['z', { metaKey: true }], ['m', { altKey: true }], ['F5'],
    ];

    it('MN60: no key pressed on a focused item reaches a document or window listener', () => {
      makeMenuRig();
      const spy = docKeySpy();
      cleanups.push(spy.remove);
      for (const [k, mods] of GAME_KEYS) {
        if (!isOpen()) openByClick();
        focusOn('mi-theme-school');
        key(active(), k, mods);
        expect(spy.document, k).to.equal(0);
        expect(spy.window, k).to.equal(0);
      }
    });

    it('MN61: keys that act on the menu are also isolated', () => {
      makeMenuRig();
      const spy = docKeySpy();
      cleanups.push(spy.remove);
      const cases = [
        ['mi-theme-coffee', 'Enter'], ['mi-hand', ' '], ['mi-theme-school', 'Escape'],
        ['mi-theme-school', 'Tab'], ['mi-theme-school', 'Tab', { shiftKey: true }],
      ];
      for (const [id, k, mods] of cases) {
        if (!isOpen()) openByClick();
        focusOn(id);
        key(active(), k, mods);
        expect(spy.document, k).to.equal(0);
        expect(spy.window, k).to.equal(0);
      }
    });

    it('MN62: browser shortcuts keep their default inside the menu', () => {
      makeMenuRig();
      const spy = docKeySpy();
      cleanups.push(spy.remove);
      openByClick();
      const e = key(active(), 'z', { ctrlKey: true });
      expect(e.defaultPrevented).to.be.false;
      expect(spy.document).to.equal(0);
    });

    it('MN63: after closing, the same key from the button reaches the game', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'Escape');
      const spy = docKeySpy();
      cleanups.push(spy.remove);
      key(rig.button, '5');
      expect(spy.document).to.equal(1);
    });
  });

  // ── H. Pointer inside the menu ────────────────────────────────────────────

  describe('pointer inside the menu', () => {
    it('MN70: mouse hover focuses the item', () => {
      makeMenuRig();
      openByClick();
      pointer(rig.$('mi-theme-school'), 'mouse');
      expect(active()).to.equal(rig.$('mi-theme-school'));
      expect(tabStops()).to.deep.equal([rig.$('mi-theme-school')]);
    });

    it('MN71: hovering the focused item does not refocus it', () => {
      makeMenuRig();
      openByClick();
      const stats = rig.$('mi-stats');
      let focuses = 0;
      stats.addEventListener('focus', () => { focuses++; });
      pointer(stats, 'mouse');
      expect(focuses).to.equal(0);
      expect(tabStops()).to.deep.equal([stats]);
    });

    it('MN72: touch and pen moves do not move focus', () => {
      makeMenuRig();
      openByClick();
      for (const type of ['touch', 'pen']) {
        pointer(rig.$('mi-theme-school'), type);
        expect(active(), type).to.equal(rig.$('mi-stats'));
      }
    });

    it('MN73: a move over a heading or section gap does nothing', () => {
      makeMenuRig();
      openByClick();
      pointer(rig.$('mh-settings'), 'mouse');
      expect(active()).to.equal(rig.$('mi-stats'));
    });

    it('MN74: clicking an item activates it', () => {
      makeMenuRig();
      openByClick();
      rig.$('mi-stats').click();
      expect(rig.calls.statistics).to.have.length(1);
      expect(isOpen()).to.be.false;
    });

    it('MN75: clicking a non-item inside the menu does nothing', () => {
      makeMenuRig();
      openByClick();
      rig.$('mh-game').click();
      expect(isOpen()).to.be.true;
      const { statistics, share, reset, apply, toggle } = rig.calls;
      expect([statistics.length, share.length, reset.length, apply.length, toggle]).to.deep.equal([0, 0, 0, 0, 0]);
    });
  });

  // ── I. Activation ─────────────────────────────────────────────────────────

  describe('activation', () => {
    it('MN80: Statistics closes with focus on the button before the dialog opens', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'Enter');
      expect(rig.calls.statistics).to.deep.equal([{ active: rig.button, open: false }]);
    });

    it('MN81: Statistics is available with no puzzle', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      key(active(), 'Enter');
      expect(rig.calls.statistics).to.have.length(1);
    });

    it('MN82: enabled Share closes to the button, then shares', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-share');
      key(active(), 'Enter');
      expect(rig.calls.share).to.deep.equal([{ active: rig.button, open: false }]);
      expect(rig.calls.reset).to.be.empty;
    });

    it('MN83: disabled Share does nothing and keeps the menu', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      focusOn('mi-share');
      key(active(), 'Enter');
      expect(rig.calls.share).to.be.empty;
      expect(isOpen()).to.be.true;
      expect(active()).to.equal(rig.$('mi-share'));
    });

    it('MN84: enabled Reset closes to the button, then opens its confirmation', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-reset');
      key(active(), 'Enter');
      expect(rig.calls.reset).to.deep.equal([{ active: rig.button, open: false }]);
      expect(rig.calls.share).to.be.empty;
    });

    it('MN85: disabled Reset does nothing and keeps the menu', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      focusOn('mi-reset');
      key(active(), ' ');
      rig.$('mi-reset').click();
      expect(rig.calls.reset).to.be.empty;
      expect(isOpen()).to.be.true;
      expect(active()).to.equal(rig.$('mi-reset'));
    });

    it('MN86: a theme other than the current one is applied and checked; menu stays', () => {
      makeMenuRig({ theme: 'minimalist' });
      openByClick();
      focusOn('mi-theme-coffee');
      key(active(), 'Enter');
      expect(rig.calls.apply).to.deep.equal(['coffee']);
      expect(rig.$('mi-theme-coffee').getAttribute('aria-checked')).to.equal('true');
      expect(rig.$('mi-theme-minimalist').getAttribute('aria-checked')).to.equal('false');
      expect(isOpen()).to.be.true;
      expect(active()).to.equal(rig.$('mi-theme-coffee'));
    });

    it('MN87: the current theme re-chosen does nothing', () => {
      makeMenuRig({ theme: 'minimalist' });
      openByClick();
      focusOn('mi-theme-minimalist');
      key(active(), 'Enter');
      expect(rig.calls.apply).to.be.empty;
      expect(isOpen()).to.be.true;
      expect(rig.$('mi-theme-minimalist').getAttribute('aria-checked')).to.equal('true');
    });

    it('MN88: Left-handed toggles and reflects; menu stays', () => {
      makeMenuRig({ left: false });
      openByClick();
      focusOn('mi-hand');
      const seen = [];
      for (let i = 0; i < 2; i++) {
        key(active(), 'Enter');
        seen.push(rig.$('mi-hand').getAttribute('aria-checked'));
      }
      expect(rig.calls.toggle).to.equal(2);
      expect(seen).to.deep.equal(['true', 'false']);
      expect(isOpen()).to.be.true;
      expect(active()).to.equal(rig.$('mi-hand'));
    });
  });

  // ── J. Live updates ───────────────────────────────────────────────────────

  describe('live updates', () => {
    const emit = (keys, type = 'NEW_PUZZLE') =>
      rig.gs._emit('changed', { changed: new Set(keys), action: { type } });

    it('MN90: a puzzle landing while open enables Share and Reset', () => {
      makeMenuRig({ puzzle: null });
      openByClick();
      rig.gs.getState().puzzle = PUZZLE;
      emit(['puzzle']);
      expect(rig.$('mi-share').hasAttribute('aria-disabled')).to.be.false;
      expect(rig.$('mi-reset').hasAttribute('aria-disabled')).to.be.false;
      expect(isOpen()).to.be.true;
      expect(active()).to.equal(rig.$('mi-stats'));
    });

    it('MN91: losing the puzzle while open disables them', () => {
      makeMenuRig();
      openByClick();
      rig.gs.getState().puzzle = null;
      emit(['puzzle']);
      expect(rig.$('mi-share').getAttribute('aria-disabled')).to.equal('true');
      expect(rig.$('mi-reset').getAttribute('aria-disabled')).to.equal('true');
    });

    it('MN92: unrelated changes do not resync', () => {
      makeMenuRig();
      openByClick();
      rig.gs.getState().puzzle = null;
      emit(['selected'], 'SELECT_CELL');
      expect(rig.$('mi-share').hasAttribute('aria-disabled')).to.be.false;
    });

    it('MN93: the win state closes the menu without moving focus to the button', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-theme-school');
      rig.gs.getState().won = true;
      emit(['won'], 'PEN_ENTER');
      expect(isOpen()).to.be.false;
      expect(active()).not.to.equal(rig.button);
    });

    it('MN94: a won flag turning false keeps the menu open', () => {
      makeMenuRig();
      openByClick();
      rig.gs.getState().won = false;
      emit(['won'], 'RESET_PUZZLE');
      expect(isOpen()).to.be.true;
    });

    it('MN95: the win state with the menu closed is a no-op', () => {
      makeMenuRig();
      rig.outside.focus();
      rig.gs.getState().won = true;
      expect(() => emit(['won'], 'PEN_ENTER')).not.to.throw();
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
      expect(active()).to.equal(rig.outside);
    });
  });

  // ── K. Closing from outside ───────────────────────────────────────────────

  describe('closing from outside', () => {
    it('MN100: focus moving outside closes the menu and stays where it went', () => {
      makeMenuRig();
      openByClick();
      rig.outside.focus();
      expect(isOpen()).to.be.false;
      expect(active()).to.equal(rig.outside);
    });

    it('MN101: focus moving between items keeps the menu open', () => {
      makeMenuRig();
      openByClick();
      key(active(), 'ArrowDown');
      expect(isOpen()).to.be.true;
    });

    it('MN102: outside focus while closed is ignored', () => {
      makeMenuRig();
      expect(() => rig.outside.focus()).not.to.throw();
      expect(isOpen()).to.be.false;
      expect(rig.button.getAttribute('aria-expanded')).to.equal('false');
    });

    it('MN103: an outside click with focus on body closes and focuses the button', () => {
      makeMenuRig();
      openByClick();
      active().blur();
      expect(active()).to.equal(document.body);
      rig.area.click();
      expect(isOpen()).to.be.false;
      expect(active()).to.equal(rig.button);
    });

    it('MN104: an outside click on a non-focusable target while an item has focus focuses the button', () => {
      makeMenuRig();
      openByClick();
      rig.area.click();
      expect(isOpen()).to.be.false;
      expect(active()).to.equal(rig.button);
    });

    it('MN105: an outside click with no active element focuses the button', () => {
      makeMenuRig();
      openByClick();
      const spy = spyFocus(rig.button);
      stubActiveElement(null);
      rig.area.click();
      expect(isOpen()).to.be.false;
      expect(spy.count).to.equal(1);
    });

    it('MN106: an outside click with focus already elsewhere leaves it there', () => {
      makeMenuRig();
      openByClick();
      const spy = spyFocus(rig.button);
      stubActiveElement(rig.outside);
      rig.area.click();
      expect(isOpen()).to.be.false;
      expect(spy.count).to.equal(0);
    });

    it('MN107: a click while closed does nothing', () => {
      makeMenuRig();
      const spy = spyFocus(rig.button);
      rig.area.click();
      expect(spy.count).to.equal(0);
    });

    it('MN108: the outside click still reaches its target', () => {
      makeMenuRig();
      let reached = 0;
      rig.outside.addEventListener('click', () => { reached++; });
      openByClick();
      const e = new MouseEvent('click', { bubbles: true, cancelable: true });
      rig.outside.dispatchEvent(e);
      expect(reached).to.equal(1);
      expect(e.defaultPrevented).to.be.false;
      expect(isOpen()).to.be.false;
    });
  });

  // ── L. Breakpoint crossing and native focus ───────────────────────────────

  describe('breakpoint crossing and native focus', () => {
    it('MN110: narrowing while Left-handed has focus moves focus to Mountain', async () => {
      makeMenuRig({ narrow: false });
      openByClick();
      key(active(), 'End');
      rig.media.flip(true);
      expect(active()).to.equal(rig.$('mi-theme-mountain'));
      expect(rig.$('mi-theme-mountain').getAttribute('tabindex')).to.equal('0');
      expect(rig.$('mi-hand').getAttribute('tabindex')).to.equal('-1');
      expect(isOpen()).to.be.true;
      await new Promise(r => requestAnimationFrame(r));
      expect(rig.sr.textContent).to.equal('');
    });

    it('MN111: narrowing with focus on another item leaves it', () => {
      makeMenuRig();
      openByClick();
      focusOn('mi-theme-school');
      rig.media.flip(true);
      expect(active()).to.equal(rig.$('mi-theme-school'));
    });

    it('MN112: narrowing while closed does nothing', () => {
      makeMenuRig();
      rig.outside.focus();
      rig.media.flip(true);
      expect(active()).to.equal(rig.outside);
      expect(isOpen()).to.be.false;
    });

    it('MN113: a widening change does not move focus', () => {
      makeMenuRig({ narrow: false });
      openByClick();
      key(active(), 'End');
      rig.media.flip(false);
      expect(active()).to.equal(rig.$('mi-hand'));
    });

    it('MN114: after widening, Left-handed is reachable again', () => {
      makeMenuRig({ narrow: true });
      openByClick();
      rig.media.flip(false);
      key(active(), 'End');
      expect(active()).to.equal(rig.$('mi-hand'));
    });

    it('MN115: native focus on an item (touch/pen tap) syncs roving state', () => {
      makeMenuRig();
      openByClick();
      rig.$('mi-theme-school').focus();
      key(active(), 'ArrowDown');
      expect(active()).to.equal(rig.$('mi-theme-terminal'));
      expect(tabStops()).to.deep.equal([active()]);
    });

    it('MN116: mousedown on a non-item part of the menu keeps focus on the current item', () => {
      makeMenuRig();
      openByClick();
      const down = el => {
        const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        el.dispatchEvent(e);
        return e;
      };
      expect(down(rig.$('mh-settings')).defaultPrevented).to.be.true;
      expect(down(rig.$('mi-theme-school')).defaultPrevented).to.be.false;
    });
  });
});
