/**
 * @fileoverview Header menu button and menu (fspec-008 §4, §5).
 *
 * Owns `#menu-button` and the contents of `#app-menu`: open/close, roving
 * focus, type-ahead, game-shortcut suppression, item state (`aria-checked`,
 * `aria-disabled`) and the narrow-viewport rule for Left-handed. Statistics,
 * sharing, resetting, themes and handedness arrive as injected hooks, so this
 * module imports no other UI module.
 */

/** The narrow breakpoint; the same query the CSS uses to hide Left-handed. */
export const NARROW_QUERY = '(max-width: 720px)';

const RELEVANT_KEYS = new Set(['puzzle', 'won']);

let _root, _button, _menu, _items, _handItem, _themeItems;
let _statsItem, _shareItem, _resetItem;
let _hooks, _media, _gameState;
let _opened = false;
/** The item holding `tabindex="0"` (roving), or null when closed. */
let _current = null;

/**
 * Wires the menu button and renders the menu.
 *
 * @param {HTMLElement} root - `#menu-root` (`.menu-wrap`), containing `#menu-button`
 *   and `#app-menu`.
 * @param {{ getState: function, on: function }} gameState
 * @param {object} hooks
 * @param {function(): void} hooks.onStatistics - Opens the Statistics dialog.
 * @param {function(): void} hooks.onShare - Runs the share action.
 * @param {function(): void} hooks.onReset - Opens the Reset confirmation.
 * @param {{ options: Array<{value: string, label: string}>,
 *           current: function(): string,
 *           apply: function(string): void }} hooks.themes
 *   Theme choices in menu order; `current()` returns the applied value; `apply(value)`
 *   applies, saves and announces it.
 * @param {{ isLeft: function(): boolean, toggle: function(): void }} hooks.hand
 * @param {function(): (HTMLElement|null)} hooks.nextFocus - The Tab stop after the
 *   menu button (the Difficulty selector).
 * @param {MediaQueryList} [hooks.media] - Narrow-viewport query; defaults to
 *   `matchMedia(NARROW_QUERY)`. Injected for tests.
 */
export function mount(root, gameState, hooks) {
  _root = root;
  _gameState = gameState;
  _hooks = hooks;
  _media = hooks.media ?? matchMedia(NARROW_QUERY);
  _button = root.querySelector('#menu-button');
  _menu = root.querySelector('#app-menu');
  _opened = false;
  _current = null;

  _render();

  _button.addEventListener('click', () => {
    if (_opened) close({ focusButton: true });
    else _open('first');
  });
  _button.addEventListener('keydown', _onButtonKeydown);
  _menu.addEventListener('keydown', _onMenuKeydown);

  _menu.addEventListener('pointermove', e => {
    const item = e.target.closest('.mi');
    if (item && e.pointerType === 'mouse' && item !== _current) _focusItem(item);
  });
  // Native focus (a touch or pen tap, a screen reader's virtual cursor) can
  // land on an item without _focusItem; keep the roving state in step with it.
  // _focusItem sets _current before focusing, so its own focus is a no-op here.
  _menu.addEventListener('focusin', e => {
    const item = e.target.closest('.mi');
    if (item && item !== _current) _setCurrent(item);
  });
  // A press on a heading or padding would blur the focused item to <body>.
  _menu.addEventListener('mousedown', e => {
    if (!e.target.closest('.mi')) e.preventDefault();
  });
  _menu.addEventListener('click', e => {
    const item = e.target.closest('.mi');
    if (item) _activate(item);
  });

  // Focus landing outside the menu (an outside click on a focusable target, the
  // win banner's focus move, any programmatic focus) closes it where it is.
  document.addEventListener('focusin', e => {
    if (_opened && !_root.contains(e.target)) close();
  });

  // Outside clicks on targets that take no focus (number pad buttons, empty
  // page area) leave focus on a hidden item or the body: send it to the button.
  document.addEventListener('click', e => {
    if (!_opened || _root.contains(e.target)) return;
    close();
    const active = document.activeElement;
    if (!active || active === document.body || _menu.contains(active)) _button.focus();
  });

  _media.addEventListener('change', _onMediaChange);

  gameState.on('changed', ({ changed }) => {
    if (![...changed].some(k => RELEVANT_KEYS.has(k))) return;
    const state = gameState.getState();
    _syncDisabled(state);
    // The win banner moves focus to New Puzzle on its next frame.
    if (changed.has('won') && state.won) close();
  });

  _syncChecked();
  _syncDisabled(gameState.getState());
}

/** @returns {boolean} Whether the menu is open. */
export function isOpen() {
  return _opened;
}

/**
 * Closes the menu if it is open; a no-op otherwise (it never moves focus then).
 *
 * @param {{ focusButton?: boolean }} [opts] - Move focus to the menu button.
 */
export function close({ focusButton = false } = {}) {
  if (!_opened) return;
  _menu.hidden = true;
  _button.setAttribute('aria-expanded', 'false');
  _opened = false;
  for (const item of _items) item.setAttribute('tabindex', '-1');
  _current = null;
  if (focusButton) _button.focus();
}

// ── Rendering ─────────────────────────────────────────────────────────────

function _el(tag, attrs = {}, text = null) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

function _item(role, attrs, label) {
  const item = _el('div', { class: 'mi', role, tabindex: '-1', ...attrs });
  item.appendChild(_el('span', { class: 'mi-label' }, label));
  return item;
}

function _render() {
  _menu.replaceChildren();

  const game = _el('div', { class: 'menu-section', role: 'none' });
  game.appendChild(_el('div', { class: 'menu-heading', id: 'mh-game', 'aria-hidden': 'true' }, 'Game'));
  const gameGroup = _el('div', { role: 'group', 'aria-labelledby': 'mh-game' });
  _statsItem = _item('menuitem',
    { id: 'mi-stats', 'aria-haspopup': 'dialog', 'aria-label': 'Statistics' }, 'Statistics…');
  _shareItem = _item('menuitem', { id: 'mi-share', 'aria-label': 'Share puzzle link' }, 'Share puzzle');
  _shareItem.appendChild(_el('span', { class: 'mi-hint', 'aria-hidden': 'true' }, 'Copy link'));
  _resetItem = _item('menuitem',
    { id: 'mi-reset', 'aria-haspopup': 'dialog', 'aria-label': 'Reset puzzle' }, 'Reset puzzle…');
  gameGroup.append(_statsItem, _shareItem, _resetItem);
  game.appendChild(gameGroup);

  const settings = _el('div', { class: 'menu-section', role: 'none' });
  settings.appendChild(_el('div', { class: 'menu-heading', id: 'mh-settings', 'aria-hidden': 'true' }, 'Settings'));
  settings.appendChild(_el('div', { class: 'menu-subheading', id: 'mh-theme', 'aria-hidden': 'true' }, 'Theme'));
  const themeGroup = _el('div', { role: 'group', 'aria-labelledby': 'mh-settings mh-theme' });
  _themeItems = _hooks.themes.options.map(({ value, label }) => {
    const item = _el('div', {
      class: 'mi', role: 'menuitemradio', tabindex: '-1', 'aria-checked': 'false',
      id: `mi-theme-${value}`, 'data-theme': value,
    });
    item.append(
      _el('span', { class: 'mi-radio', 'aria-hidden': 'true' }),
      _el('span', { class: 'mi-label' }, label),
      _el('span', { class: 'mi-swatch', 'aria-hidden': 'true' }),
    );
    return item;
  });
  themeGroup.append(..._themeItems);
  settings.appendChild(themeGroup);

  const handSection = _el('div', { class: 'mi-hand-section', role: 'group', 'aria-labelledby': 'mh-settings' });
  _handItem = _item('menuitemcheckbox', { id: 'mi-hand', 'aria-checked': 'false' }, 'Left-handed');
  const track = _el('span', { class: 'mi-switch-track', 'aria-hidden': 'true' });
  track.appendChild(_el('span', { class: 'mi-switch-thumb' }));
  _handItem.appendChild(track);
  handSection.appendChild(_handItem);
  settings.appendChild(handSection);

  _menu.append(game, settings);
  _items = [_statsItem, _shareItem, _resetItem, ..._themeItems, _handItem];
}

// ── Open, focus, visibility ───────────────────────────────────────────────

function _open(which) {
  _syncChecked();
  _syncDisabled(_gameState.getState());
  _menu.hidden = false;
  _button.setAttribute('aria-expanded', 'true');
  _opened = true;
  const visible = _visibleItems();
  _focusItem(which === 'last' ? visible[visible.length - 1] : visible[0]);
}

function _focusItem(item) {
  _setCurrent(item);
  item.focus();
}

/** Moves the roving `tabindex="0"` to `item`. Never moves focus. */
function _setCurrent(item) {
  if (_current) _current.setAttribute('tabindex', '-1');
  item.setAttribute('tabindex', '0');
  _current = item;
}

/**
 * Derived from the CSS's own media query, not from layout, so it holds without
 * stylesheets. Disabled items are included (fspec-008 §4.4).
 */
function _visibleItems() {
  return _media.matches ? _items.filter(item => item !== _handItem) : _items;
}

function _onMediaChange() {
  if (_opened && _media.matches && _current === _handItem) {
    const visible = _visibleItems();
    _focusItem(visible[visible.length - 1]);
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────

function _onButtonKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    // Handled in keydown so the browser never synthesizes a click: opening from
    // the keyboard must not reach the grid's deselecting click listener.
    e.preventDefault();
    e.stopPropagation();
    if (!_opened) _open('first');
    else if (e.key !== 'ArrowDown') close({ focusButton: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    if (!_opened) _open('last');
  }
}

function _onMenuKeydown(e) {
  // Every game shortcut listener (keyboard.js, coach.js) is a bubble-phase
  // document listener, so stopping propagation here keeps all of them from
  // seeing keys pressed on a menu item (fspec-008 §9.1).
  e.stopPropagation();

  const visible = _visibleItems();
  const idx = visible.indexOf(_current);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      _focusItem(visible[(idx + 1) % visible.length]);
      return;
    case 'ArrowUp':
      e.preventDefault();
      _focusItem(visible[(idx - 1 + visible.length) % visible.length]);
      return;
    case 'Home':
      e.preventDefault();
      _focusItem(visible[0]);
      return;
    case 'End':
      e.preventDefault();
      _focusItem(visible[visible.length - 1]);
      return;
    case 'Enter':
    case ' ':
      e.preventDefault();
      _activate(_current);
      return;
    case 'Escape':
      e.preventDefault();
      close({ focusButton: true });
      return;
    case 'Tab':
      // Handled here: the browser's default would start from a now-hidden item.
      e.preventDefault();
      if (e.shiftKey) {
        close({ focusButton: true });
      } else {
        close();
        _hooks.nextFocus()?.focus();
      }
      return;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      return;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    _typeAhead(e.key.toLowerCase(), visible, idx);
  }
  // Anything else keeps its browser default; the game never sees it.
}

function _typeAhead(ch, visible, idx) {
  for (let i = 1; i <= visible.length; i++) {
    const item = visible[(idx + i) % visible.length];
    const label = item.querySelector('.mi-label').textContent.trim().toLowerCase();
    if (label.startsWith(ch)) {
      _focusItem(item);
      return;
    }
  }
}

// ── Activation and item state ─────────────────────────────────────────────

/**
 * Action items close the menu with focus on the button before acting, so any
 * dialog they open records the button as its trigger (fspec-008 §8.2).
 */
function _activate(item) {
  if (item === _statsItem) {
    close({ focusButton: true });
    _hooks.onStatistics();
  } else if (item === _shareItem || item === _resetItem) {
    if (item.getAttribute('aria-disabled') === 'true') return;
    close({ focusButton: true });
    if (item === _shareItem) _hooks.onShare();
    else _hooks.onReset();
  } else if (item === _handItem) {
    _hooks.hand.toggle();
    _syncChecked();
  } else {
    const value = item.dataset.theme;
    if (value === _hooks.themes.current()) return;
    _hooks.themes.apply(value);
    _syncChecked();
  }
}

function _syncChecked() {
  const current = _hooks.themes.current();
  for (const item of _themeItems) {
    item.setAttribute('aria-checked', String(item.dataset.theme === current));
  }
  _handItem.setAttribute('aria-checked', String(_hooks.hand.isLeft()));
}

function _syncDisabled(state) {
  for (const item of [_shareItem, _resetItem]) {
    if (state.puzzle === null) item.setAttribute('aria-disabled', 'true');
    else item.removeAttribute('aria-disabled');
  }
}
