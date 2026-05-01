# Architectural Spec — Theme System
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 6), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-game-state.md` (§2) — `THEME_CLASSES` and `DEFAULT_THEME` constants live in `config.js`.

---

## Table of Contents

1. [CSS Structure](#1-css-structure)
2. [Theme Switching — `js/ui/themes.js`](#2-theme-switching--jsuithemesjs)
3. [No-Flash Inline Script](#3-no-flash-inline-script)
4. [Extensibility Constraint](#4-extensibility-constraint)

---

## 1. CSS Structure

Every theme is a single CSS block in `css/themes.css`:
- `body.theme-<name> { --var: value; ... }` — all custom properties for that theme.

The Minimalist theme is declared as a combined `:root, body.theme-minimalist { ... }` selector. `:root` sets Minimalist values as fallback defaults, so the Minimalist theme works without any `body.theme-*` class being present. There are no structural override blocks; all per-theme differences are expressed entirely through custom properties.

The five theme classes are: `theme-minimalist`, `theme-coffee`, `theme-school`, `theme-terminal`, `theme-mountain`.

---

## 2. Theme Switching — `js/ui/themes.js`

Exports three functions:

### `applyTheme(themeClass: string, shouldAnnounce = true) → void`

Behavioral obligations (from fspec §12.2 and vspec §1.2):
- Apply immediately, no confirmation, no page reload.
- Removes all `THEME_CLASSES` from `document.body.classList`.
- Adds `themeClass` to `document.body.classList`.
- Writes the theme name (without `'theme-'` prefix) to the `'sudoku.theme'` cookie immediately via `persist/cookies.js`.
- If `shouldAnnounce` is `true` (the default), announces the change via `srLive.announce()`: `"Theme changed to {displayName}."` where `displayName` is the human-readable name for the theme. When `shouldAnnounce` is `false`, the announcement is suppressed (used during silent initialization).

```js
function applyTheme(themeClass, shouldAnnounce = true) {
  for (const c of THEME_CLASSES) document.body.classList.remove(c);
  document.body.classList.add(themeClass);
  cookies.set('sudoku.theme', themeClass.replace('theme-', ''));
  if (shouldAnnounce) {
    announce(`Theme changed to ${DISPLAY_NAMES[themeClass] ?? themeClass}.`);
  }
}
```

### `initTheme() → void`

Called by `main.js` before DOM is mounted (step 2 of the bootstrap sequence). Reads the `'sudoku.theme'` cookie and reconstructs the theme class as `'theme-' + cookieValue`. If the cookie is missing, falls back to `DEFAULT_THEME`. Calls `applyTheme(cls, false)` — the `false` suppresses the screen reader announcement and also re-writes the cookie on every page load. Reconciles the `classList` in case of drift between the inline head script (§3) and the module load.

### `bindThemeSelect(selectEl: HTMLSelectElement) → void`

Wires up the `#theme-select` element. On call, reads the current active theme class from `document.body.classList` (falling back to `DEFAULT_THEME`) and sets `selectEl.value` to the theme name without the `'theme-'` prefix. Attaches a `change` event listener that calls `applyTheme('theme-' + selectEl.value)` on every change.

---

## 3. No-Flash Inline Script

Tiny inline `<script>` placed in `<head>` **before** CSS `<link>` tags. Runs synchronously before the browser renders anything, preventing a flash of the default Minimalist theme for users with a different theme saved.

```html
<script>
  (function() {
    var m = document.cookie.match(/(?:^|; )sudoku\.theme=([^;]+)/);
    var v = m ? decodeURIComponent(m[1]) : 'minimalist';
    document.documentElement.setAttribute('data-theme', v);
    document.addEventListener('DOMContentLoaded', function() {
      document.body.className = 'theme-' + v;
    });
  })();
</script>
```

Behavioral obligations (from fspec §12.3):
- The selected theme is stored in a cookie and applied before first render.
- No flash of default theme on page load.

The `initTheme()` call in `main.js` reconciles any drift between the inline script's `DOMContentLoaded` assignment and the ES module's execution order.

---

## 4. Extensibility Constraint

Three additions, zero edits to existing code to add a new theme (from vspec §1.1):
1. Add `body.theme-new { ... }` block in `css/themes.css`.
2. Add `<option value="new">New</option>` to the theme `<select>` in `index.html`.
3. Add `'theme-new'` to `THEME_CLASSES` in `js/config.js`.

This constraint is documented in `README.md` under "Adding a theme" and enforced by code review. No other files require modification.
