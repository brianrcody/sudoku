# Visual Design Spec — Sudoku v1
**Status:** Final
**Date:** 2026-04-18
**Author:** Visual Designer
**Approved mockup:** docs/mockups/game-v4.html

---

## 1. Theme Architecture

### 1.1 Design Constraint: Additive Theme Extensibility

Themes must be implemented as self-contained style units. Each theme is a single CSS class on `<body>` (e.g., `body.theme-minimalist`) that defines all CSS custom properties for that theme. The `:root` block defines the default theme values (Minimalist) as a fallback; every other theme overrides these via its body class selector.

**Adding a new theme requires only:**
1. One new CSS block: `body.theme-{name} { ... }` defining all custom properties
2. One `<option>` element in the theme selector
3. The theme class name added to the JavaScript `THEME_CLASSES` array

No existing theme code is modified. Theme-specific structural overrides (e.g., Terminal's square buttons, Coffee's dark header) follow the same pattern: `body.theme-{name} .component { ... }`.

### 1.2 Theme Switching Mechanism

- Theme is applied by removing all `theme-*` classes from `<body>` and adding the selected `theme-{value}` class.
- Theme is persisted in a cookie. The cookie is written immediately when the user selects a new theme.
- On page load, the saved cookie value is read and the corresponding theme class is applied to `<body>` before first paint — no flash of the default theme.
- The `<body>` element begins with `class="theme-minimalist"` in the HTML; the cookie-restore script replaces this before render.
- Announcing theme change to screen readers: `"Theme changed to {name}."` via an `aria-live` region.

---

## 2. Color System

All values are used as CSS custom properties (`--property-name: value`).

### 2.1 Minimalist (default)

Applied via `:root` and `body.theme-minimalist`.

| Property         | Value        | Role                                     |
|------------------|--------------|------------------------------------------|
| `--bg`           | `#f7f6f2`    | Page background                          |
| `--surface`      | `#ffffff`    | Grid background, card/panel backgrounds |
| `--border`       | `#c8c4bb`    | Thin cell borders, panel borders         |
| `--border-strong`| `#2e2b25`    | Box divider lines, outer grid border     |
| `--text`         | `#1c1a16`    | Primary text                             |
| `--text-muted`   | `#7a7570`    | Labels, secondary text                   |
| `--text-given`   | `#1c1a16`    | Given-cell digit color                   |
| `--given-bg`     | `#eceae4`    | Given cell background                    |
| `--accent`       | `#2c5282`    | Player pen digits, selection outline, active mode indicator, focus rings |
| `--accent-light` | `#dbeafe`    | Selected cell background                 |
| `--conflict`     | `#b91c1c`    | Conflict digit color                     |
| `--conflict-bg`  | `#fef2f2`    | Conflict cell background                 |
| `--pencil`       | `#5a6778`    | Pencil mark digits                       |
| `--btn-bg`       | `#f0ede6`    | Button fill                              |
| `--btn-hover`    | `#e4e0d7`    | Button hover fill                        |
| `--btn-border`   | `#c8c4bb`    | Button border                            |
| `--active-mode`  | `#2c5282`    | Active pen/pencil mode indicator         |
| `--win`          | `#15803d`    | Win banner title color                   |
| `--stats-row-sep`| `#f0ede6`    | Stats table row separator                |
| `--header-bg`    | `var(--surface)` | Header background (white)            |
| `--modal-bg`     | `var(--surface)` | Dialog background (white)            |
| `--win-banner-bg`| `rgba(255,255,255,0.92)` | Win overlay fill              |
| `--primary-hover`| `#1e3a6e`    | Primary button hover state               |

### 2.2 Coffee Shop

Applied via `body.theme-coffee`.

| Property         | Value        | Role                       |
|------------------|--------------|----------------------------|
| `--bg`           | `#3b2a1a`    | Dark roast background      |
| `--surface`      | `#f5ede0`    | Warm cream                 |
| `--border`       | `#c9a97a`    | Warm tan                   |
| `--border-strong`| `#7c4f22`    | Deep brown                 |
| `--text`         | `#2b1d0e`    | Dark espresso              |
| `--text-muted`   | `#8c6642`    | Muted brown                |
| `--text-given`   | `#2b1d0e`    |                            |
| `--given-bg`     | `#e8d5b8`    | Parchment                  |
| `--accent`       | `#8b4513`    | Saddlebrown                |
| `--accent-light` | `#fde8cc`    |                            |
| `--conflict`     | `#c0392b`    |                            |
| `--conflict-bg`  | `#fdf0ee`    |                            |
| `--pencil`       | `#7a5c3a`    |                            |
| `--btn-bg`       | `#ecdfc8`    |                            |
| `--btn-hover`    | `#e0cead`    |                            |
| `--btn-border`   | `#c9a97a`    |                            |
| `--active-mode`  | `#8b4513`    |                            |
| `--win`          | `#2d6a4f`    |                            |
| `--stats-row-sep`| `#ecdfc8`    |                            |
| `--header-bg`    | `#2b1d0e`    | Dark header                |
| `--modal-bg`     | `#f5ede0`    |                            |
| `--win-banner-bg`| `rgba(245,237,224,0.93)` |              |
| `--primary-hover`| `#6b3410`    |                            |

**Coffee-specific structural overrides:**
- Main area background: `linear-gradient(160deg, #3b2a1a 0%, #4a3020 50%, #3b2a1a 100%)`
- Grid box shadow: `0 4px 16px rgba(59,42,26,0.4)`
- Button border-radius: `6px`; button box shadow: `0 1px 3px rgba(59,42,26,0.15)`
- Dialog box shadow: `0 8px 40px rgba(59,42,26,0.4)`
- Header text color: `#f5ede0`; `h1` color: `#f5ede0`; header border-bottom: `#7c4f22`
- Theme control label color: `#c9a97a`
- Theme select in header: `background-color: #3b2a1a`, `color: #f5ede0`, `border-color: #7c4f22`
- Difficulty select arrow fill: `#8c6642`

### 2.3 School

Applied via `body.theme-school`.

| Property         | Value        | Role                       |
|------------------|--------------|----------------------------|
| `--bg`           | `#f8f5e6`    | Ruled paper cream          |
| `--surface`      | `#fdfaf0`    |                            |
| `--border`       | `#b8c4d4`    | Slate blue-grey            |
| `--border-strong`| `#4a5568`    |                            |
| `--text`         | `#2d3748`    |                            |
| `--text-muted`   | `#718096`    |                            |
| `--text-given`   | `#1a202c`    |                            |
| `--given-bg`     | `#edf0f5`    |                            |
| `--accent`       | `#4a5568`    |                            |
| `--accent-light` | `#e2e8f0`    |                            |
| `--conflict`     | `#c53030`    |                            |
| `--conflict-bg`  | `#fff5f5`    |                            |
| `--pencil`       | `#718096`    |                            |
| `--btn-bg`       | `#edf2f7`    |                            |
| `--btn-hover`    | `#e2e8f0`    |                            |
| `--btn-border`   | `#b8c4d4`    |                            |
| `--active-mode`  | `#4a5568`    |                            |
| `--win`          | `#276749`    |                            |
| `--stats-row-sep`| `#edf2f7`    |                            |
| `--header-bg`    | `#fdfaf0`    |                            |
| `--modal-bg`     | `#fdfaf0`    |                            |
| `--win-banner-bg`| `rgba(253,250,240,0.93)` |              |
| `--primary-hover`| `#2d3748`    |                            |

**School-specific structural overrides:**
- Main area background: `background-color: #f8f5e6` with `repeating-linear-gradient(transparent, transparent 27px, #a8b8cc 27px, #a8b8cc 28px)` positioned at `0 14px` (ruled-paper lines)
- Grid box shadow: `2px 2px 8px rgba(74,85,104,0.12)`
- Header bottom border: `2px solid #b8c4d4`
- Button border-radius: `3px`
- Primary button color: `#ffffff` (explicit — `--surface` is off-white)
- Player pen digits: `color: #4a5568`, `font-style: italic`, `font-weight: 400` (handwritten feel)
- Digit buttons: `font-style: italic`
- Pencil marks: `font-style: italic`, `font-size: 8px`, `color: #718096`

### 2.4 Mountain

Applied via `body.theme-mountain`.

| Property         | Value        | Role                       |
|------------------|--------------|----------------------------|
| `--bg`           | `#e8f0f7`    | Alpine sky                 |
| `--surface`      | `#f7fafc`    |                            |
| `--border`       | `#adc6de`    |                            |
| `--border-strong`| `#1a3a52`    | Deep navy                  |
| `--text`         | `#0f2233`    |                            |
| `--text-muted`   | `#4d7a99`    |                            |
| `--text-given`   | `#1a4d2e`    | Dark forest green          |
| `--given-bg`     | `#dce8f2`    |                            |
| `--accent`       | `#1a6b8a`    | Teal                       |
| `--accent-light` | `#cfe8f3`    |                            |
| `--conflict`     | `#b91c1c`    |                            |
| `--conflict-bg`  | `#fef2f2`    |                            |
| `--pencil`       | `#2d6e4e`    | Forest green               |
| `--btn-bg`       | `#dce8f2`    |                            |
| `--btn-hover`    | `#c8dcea`    |                            |
| `--btn-border`   | `#adc6de`    |                            |
| `--active-mode`  | `#1a6b8a`    |                            |
| `--win`          | `#1a6b4e`    |                            |
| `--stats-row-sep`| `#dce8f2`    |                            |
| `--header-bg`    | `#1a3a52`    | Deep navy header           |
| `--modal-bg`     | `#f7fafc`    |                            |
| `--win-banner-bg`| `rgba(247,250,252,0.93)` |              |
| `--primary-hover`| `#145a75`    |                            |

**Mountain-specific structural overrides:**
- Main area background: `linear-gradient(175deg, #d4e8f5 0%, #e8f0f7 40%, #f0f5fa 100%)`
- Grid box shadow: `0 2px 16px rgba(26,58,82,0.15)`
- Button border-radius: `6px`; button box shadow: `0 1px 3px rgba(26,58,82,0.1)`
- Header text color: `#e8f0f7`; `h1` color: `#f7fafc`, `letter-spacing: 0.06em`
- Header border-bottom: `#2d5878`
- Theme control label color: `#adc6de`
- Theme select in header: `background-color: #2d5878`, `color: #e8f0f7`, `border-color: #4d7a99`
- Pencil marks: `color: #2d6e4e`
- Player pen digits: `color: #1f6b45`
- Difficulty select arrow fill: `#4d7a99`

### 2.5 Digital Terminal

Applied via `body.theme-terminal`.

| Property         | Value        | Role                              |
|------------------|--------------|-----------------------------------|
| `--bg`           | `#0d0d0d`    | Near-black                        |
| `--surface`      | `#111111`    |                                   |
| `--border`       | `#1f4a1f`    | Dark green border                 |
| `--border-strong`| `#39ff14`    | Phosphor green                    |
| `--text`         | `#b0ffb0`    | Soft phosphor                     |
| `--text-muted`   | `#3d7a3d`    | Dim green                         |
| `--text-given`   | `#39ff14`    | Full phosphor for givens          |
| `--given-bg`     | `#0a1a0a`    | Very dark green                   |
| `--accent`       | `#39ff14`    | Phosphor green                    |
| `--accent-light` | `#0a2a0a`    |                                   |
| `--conflict`     | `#ff4444`    | Red alert                         |
| `--conflict-bg`  | `#1a0505`    |                                   |
| `--pencil`       | `#3d7a3d`    |                                   |
| `--btn-bg`       | `#0f1f0f`    |                                   |
| `--btn-hover`    | `#162b16`    |                                   |
| `--btn-border`   | `#1f4a1f`    |                                   |
| `--active-mode`  | `#39ff14`    |                                   |
| `--win`          | `#39ff14`    |                                   |
| `--stats-row-sep`| `#0f1f0f`    |                                   |
| `--header-bg`    | `#090909`    | Slightly darker than surface      |
| `--modal-bg`     | `#111111`    |                                   |
| `--win-banner-bg`| `rgba(11,11,11,0.95)` |                         |
| `--primary-hover`| `#22cc00`    |                                   |

**Terminal-specific structural overrides:**
- Body font: `"Courier New", Courier, monospace` (entire UI, not just grid)
- Main area background: `#0d0d0d` with `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)` (scanlines)
- Grid: `border-radius: 0`, `border-color: var(--accent)`, `box-shadow: 0 0 12px rgba(57,255,20,0.2), inset 0 0 4px rgba(57,255,20,0.05)`
- Header: `border-bottom: 1px solid var(--accent)`, `box-shadow: 0 1px 0 0 var(--accent)`
- `h1`: `color: var(--accent)`, `text-shadow: 0 0 8px rgba(57,255,20,0.4)`, `letter-spacing: 0.15em`
- Theme select: `border-color: var(--accent)`
- Difficulty select: `border-color: var(--accent)`
- Buttons: `border-radius: 0`, `letter-spacing: 0.05em`, `text-transform: uppercase`, `font-size: 12px`
- Button hover: `border-color: var(--accent)`, `box-shadow: 0 0 6px rgba(57,255,20,0.2)`
- Active pen mode button: `box-shadow: 0 0 8px rgba(57,255,20,0.25)`
- Primary button hover: `box-shadow: 0 0 10px rgba(57,255,20,0.4)`
- Primary button text color: `#000` (black on phosphor green background)
- Dialog backdrop: `background: rgba(0,0,0,0.75)` (heavier than default `rgba(0,0,0,0.35)`)
- Dialog: `border-radius: 0`, `border-color: var(--accent)`, `box-shadow: 0 0 24px rgba(57,255,20,0.2)`
- Stats panel: `border-radius: 0`; on hover/focus-within: `border-color: var(--accent)`
- Stats heading: `color: var(--accent)`, `letter-spacing: 0.15em`, `font-size: 10px`
- Active stats row: `text-shadow: 0 0 4px rgba(57,255,20,0.3)`
- Active stats row indicator: `content: " >"` (right-angle bracket instead of bullet)
- Win banner: `border-radius: 0`
- Win title: `text-shadow: 0 0 16px rgba(57,255,20,0.6)`, `letter-spacing: 0.1em`
- Hint badge: `border-radius: 0`, `color: #000`
- Given cells: `text-shadow: 0 0 6px rgba(57,255,20,0.5)`
- Player pen digit: `color: #b0ffb0`, `text-shadow: 0 0 4px rgba(176,255,176,0.3)`
- Conflict digit: `text-shadow: 0 0 6px rgba(255,68,68,0.6)`
- Selected cell: additional `box-shadow: inset 0 0 8px rgba(57,255,20,0.25)`
- Pencil marks: `font-family: "Courier New", Courier, monospace`, `font-size: 8px`
- Digit buttons: `font-family: "Courier New", Courier, monospace`, `font-size: 18px`, `font-weight: 700`, `letter-spacing: 0`, `text-transform: none`

---

## 3. Typography

### 3.1 Font Stacks

| Context                     | Default stack                                                                 | Terminal override               |
|-----------------------------|-------------------------------------------------------------------------------|---------------------------------|
| UI chrome (body default)    | `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` | `"Courier New", Courier, monospace` |
| Grid digits (default)       | `Georgia, "Times New Roman", serif`                                           | `"Courier New", Courier, monospace` |
| Grid digits (School)        | `Georgia, serif`                                                               | —                               |
| Grid digits (Coffee)        | `Georgia, "Times New Roman", serif`                                            | —                               |
| Pencil marks (default)      | `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` | `"Courier New", Courier, monospace` |
| Digit pad buttons (default) | `Georgia, "Times New Roman", serif`                                            | `"Courier New", Courier, monospace` |
| Digit pad buttons (School)  | `Georgia, serif` with `font-style: italic`                                    | —                               |
| All other buttons           | Inherits body font                                                             |                                 |

### 3.2 Font Sizes and Weights by Context

**Body/base:** `15px`, `line-height: 1.4`

**Header `h1`:**
- Default: `18px`, `font-weight: 600`, `letter-spacing: 0.04em`, `text-transform: uppercase`
- Mobile: `16px`
- Terminal: `letter-spacing: 0.15em`
- Mountain: `letter-spacing: 0.06em`

**Grid cells:**
- Default: `font-size: 22px`, `font-weight: 500`
- Given cells: `font-weight: 700`
- Player pen digits (default): `font-weight: 500`, color `var(--accent)`
- Player pen digits (School): `font-weight: 400`, `font-style: italic`
- Terminal: `font-size: 20px`, `font-weight: 700`
- Mobile: `font-size: clamp(14px, 4.5vw, 22px)`

**Pencil marks:**
- Default: `9px`, `font-weight: 500`
- Terminal: `8px`
- School: `8px`, `font-style: italic`
- Mobile: `clamp(6px, 2vw, 9px)`

**Digit pad buttons (`.btn-digit`):**
- Default: `font-size: 20px`, `font-weight: 500`, `font-family: Georgia, "Times New Roman", serif`
- Terminal: `font-size: 18px`, `font-weight: 700`, `font-family: "Courier New", Courier, monospace`
- School: italic

**General buttons (`.btn`):** `14px`, `font-weight: 500`
- Terminal override: `12px`, `text-transform: uppercase`, `letter-spacing: 0.05em`

**Mode button sub-label (`.mode-sub`):** `10px`, `opacity: 0.7`
**Mode button main label (`.mode-main`):** `13px` (Terminal: `12px`)

**Hint badge:** `11px`, `font-weight: 700`

**Difficulty label:** `12px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.07em`; Terminal: `letter-spacing: 0.1em`

**Theme control label:** `13px`

**Stats heading:** `11px`, `font-weight: 700`, `letter-spacing: 0.08em`, `text-transform: uppercase`; Terminal: `10px`, `letter-spacing: 0.15em`

**Stats table:** `font-size: 13px`
- Column headers: `10px`, `font-weight: 600`, `letter-spacing: 0.05em`, `text-transform: uppercase`
- Row label cells: `font-weight: 500`
- Active difficulty row: `font-weight: 600`

**Win title:** `28px`, `font-weight: 700`, `letter-spacing: 0.02em`; Terminal: `letter-spacing: 0.1em`
**Win subtitle:** `14px`

**Modal `h2`:** `16px`, `font-weight: 600`
**Modal body text:** `14px`, `line-height: 1.5`

---

## 4. Spacing and Sizing

### 4.1 Grid

- **Grid size (desktop):** `414px × 414px`
- **Outer border:** `2.5px solid var(--border-strong)`, `border-radius: 3px` (Terminal: `border-radius: 0`)
- **Cell borders:** `1px solid var(--border)` on right and bottom edges
- **Box divider borders:** `2.5px solid var(--border-strong)` — right edge of columns 3 and 6; bottom edge of rows 3 and 6
- **Last column cells:** no right border
- **Last row cells:** no bottom border
- **Cell font/layout:** centered both axes; `position: relative`

### 4.2 Header

- Padding: `14px 24px` (mobile: `12px 16px`)
- Border-bottom: `1px solid var(--border)` (School: `2px`)
- Theme control gap: `8px`

### 4.3 Main Layout

- Main padding: `24px 16px 32px` (mobile: `16px 12px 28px`)
- Main gap between game area and any other main children: `24px` (mobile: `16px`)
- `.game-area`: `flex-direction: row`, `gap: 32px`, `max-width: 860px`
- `.left-col`: `flex-direction: column`, `gap: 14px`, `flex-shrink: 0`
- `.right-col`: `flex-direction: column`, `gap: 20px`, `min-width: 220px`, `flex-shrink: 0`

### 4.4 Difficulty Selector

- Label + select row gap: `10px`
- Select padding: `6px 28px 6px 10px`
- Select border-radius: `5px`
- Arrow icon positioned `right: 10px center`

### 4.5 Number Pad

- Outer `.numpad` gap between rows: `8px`
- Digit grid: `repeat(3, 1fr)`, `gap: 6px` — 9 buttons in 3 columns
- Utils row (Erase + Mode): `repeat(2, 1fr)`, `gap: 6px`
- Bottom row (Hint + Check): `repeat(2, 1fr)`, `gap: 6px`
- Check button: `grid-column: span 2` when visible (spans full width of 2-column row)

### 4.6 Buttons

- Default padding: `10px 8px`
- Border: `1px solid var(--btn-border)`, `border-radius: 5px` (Terminal: `0`, Coffee/Mountain: `6px`, School: `3px`)
- Digit button padding: `12px 6px`
- Disabled state: `opacity: 0.38`, `cursor: not-allowed`, `pointer-events: none`

### 4.7 Action Row

- Two buttons, equal width: `grid-template-columns: 1fr 1fr`, `gap: 8px`

### 4.8 Stats Panel

- Border: `1px solid var(--border)`, `border-radius: 6px` (Terminal: `border-radius: 0`)
- Heading padding: `8px 12px 6px`
- Table cell padding: `5px 12px` (header cells: `6px 12px 4px`)

### 4.9 Hint Badge

- Size: `min-width: 18px`, `height: 18px`, `border-radius: 99px` (Terminal: `border-radius: 0`)
- Padding: `0 4px`
- Background: `var(--accent)`; disabled: `var(--text-muted)`
- Text color: `var(--surface)` (Terminal: `#000`)

### 4.10 Win Banner

- Position: `position: absolute; inset: 0` over the `.grid-wrapper`
- `border-radius: 3px` (Terminal: `0`)
- `z-index: 10`
- Content gap: `6px`

### 4.11 Confirmation Dialog

- Backdrop: `position: fixed; inset: 0`, `background: rgba(0,0,0,0.35)` (Terminal: `rgba(0,0,0,0.75)`)
- Dialog max-width: `340px`, `width: 90%`
- Dialog padding: `28px 28px 22px`
- Dialog border-radius: `10px` (Terminal: `0`)
- Dialog box shadow: `0 8px 40px rgba(0,0,0,0.18)`
- `h2` margin-bottom: `8px`
- Body text margin-bottom: `22px`
- Actions: `justify-content: flex-end`, `gap: 10px`

---

## 5. Component States

### 5.1 Grid Cell States

**Empty:** background `var(--surface)`, no text content.

**Given:** background `var(--given-bg)`, color `var(--text-given)`, `font-weight: 700`, `cursor: default`.
- Terminal: `text-shadow: 0 0 6px rgba(57,255,20,0.5)`
- School: `color: #1a202c`, `font-weight: 700`

**Pen digit (player-entered):** class `.pen`, color `var(--accent)`, `font-weight: 500` (default).
- School: `color: #4a5568`, `font-style: italic`, `font-weight: 400`
- Terminal: `color: #b0ffb0`, `text-shadow: 0 0 4px rgba(176,255,176,0.3)`
- Coffee: `color: #8b4513`
- Mountain: `color: #1f6b45`

**Pencil marks:** cell contains a 3×3 sub-grid of `.pencil-mark` spans. Digits not present have class `empty` and `visibility: hidden`. Font size `9px` (Terminal/School: `8px`), color `var(--pencil)`.

**Selected:** class `.selected`, background `var(--accent-light) !important`, `outline: 2px solid var(--accent)`, `outline-offset: -2px`, `z-index: 1`.
- Terminal: additional `box-shadow: inset 0 0 8px rgba(57,255,20,0.25)`

**Conflict:** class `.conflict`, background `var(--conflict-bg) !important`, color `var(--conflict) !important`.
- Terminal: `text-shadow: 0 0 6px rgba(255,68,68,0.6)`

**Conflict + selected:** background stays `var(--conflict-bg)`, outline changes to `var(--conflict)`.

### 5.2 Pen/Pencil Mode Toggle Button

**Pen active (`.btn-mode.mode-pen`):** background `var(--surface)`, border-color `var(--accent)`, color `var(--accent)`, `font-weight: 600`. Main label: "Pen". Sub-label: "tap for pencil". `aria-pressed="false"`.
- Terminal: `box-shadow: 0 0 8px rgba(57,255,20,0.25)`

**Pencil active (`.btn-mode.mode-pencil`):** background `var(--surface)`, border-color `var(--pencil)`, color `var(--pencil)`, `font-weight: 600`. Main label: "Pencil". Sub-label: "tap for pen". `aria-pressed="true"`.

Both states: button has stacked label structure — `.mode-main` on top, `.mode-sub` below with `opacity: 0.7`.

### 5.3 Hint Button

**Enabled with count:** label "Hint" followed by a badge showing count. `aria-label="Hint, N remaining"`. Badge background `var(--accent)`.

**Enabled, infinite (Kiddie):** badge shows "∞".

**Disabled (0 hints or selected cell already has a pen digit):** `opacity: 0.38`, badge background `var(--text-muted)`. `aria-label="Hint — no hints remaining"`.

### 5.4 Check Button

Visible only when difficulty is "Easy" or "Medium". Hidden (`display: none`) for Kiddie, Hard, Death March. When visible, spans full two-column width of `.numpad-bottom` row.

### 5.5 Confirmation Dialog

- Triggered by: "New Puzzle" (when in-progress), "Reset" (always), difficulty change (when in-progress).
- Default focus: Cancel button receives focus when dialog opens.
- Dismiss: Cancel button, Escape key.
- Confirm: confirm button label varies by context ("New Puzzle", "Reset", "Change Difficulty").
- Confirm button style: `.btn-primary` — background `var(--accent)`, color `var(--surface)`, border-color `var(--accent)`.

### 5.6 Win Banner

Shown (class `.show`, `display: flex`) over the grid when puzzle is complete. Contains:
- `.win-title`: "Puzzle Complete!", `font-size: 28px`, `font-weight: 700`, color `var(--win)`
- `.win-sub`: "Well done.", `font-size: 14px`, color `var(--text-muted)`

### 5.7 Stats Table Active Row

The row matching the current difficulty has class `.active-diff`:
- All cells: background `var(--accent-light)`, color `var(--accent)`, `font-weight: 600`
- First cell appends ` ●` (bullet, `font-size: 8px`, Terminal: ` >` at `10px`)

---

## 6. Theme Selector

### 6.1 Placement and Structure

Located in `<header>`, right side, as a `.theme-control` flex container. Label "Theme" (`<label for="theme-select">`) followed by `<select id="theme-select">`.

### 6.2 Option Values and Display Names

| `value`       | Display name     |
|---------------|------------------|
| `minimalist`  | Minimalist       |
| `coffee`      | Coffee Shop      |
| `school`      | School           |
| `terminal`    | Digital Terminal |
| `mountain`    | Mountain         |

"Minimalist" is the `selected` default in the HTML.

### 6.3 Select Styling

- Font size: `13px`
- Padding: `4px 8px`, right-pad extended to `24px` for arrow
- Border: `1px solid var(--btn-border)`, `border-radius: 4px`
- Background: `var(--btn-bg)`; color: `var(--text)`
- Custom SVG chevron arrow (`10×6px`, `M0 0l5 6 5-6z`) positioned `right: 8px center`, fill color matches `--text-muted` for the active theme:
  - Minimalist: `#7a7570`
  - Coffee: `#8c6642` (and special dark-header variant: `#c9a97a`)
  - School: `#718096`
  - Terminal: `#39ff14`
  - Mountain (in dark header): `#adc6de`
- Focus: `outline: 2px solid var(--accent)`, `outline-offset: 2px`
- Transitions: `background 0.2s, color 0.2s, border-color 0.2s`

---

## 7. Difficulty Selector

Placed in `.difficulty-row` above the grid in `.left-col`.

- Font size: `14px`, `font-weight: 500`
- Padding: `6px 28px 6px 10px`
- Border: `1px solid var(--btn-border)`, `border-radius: 5px`
- Background: `var(--surface)` (not `--btn-bg`)
- Arrow icon: same SVG chevron, positioned `right: 10px center`, fill matches theme muted color
- Options: Kiddie, Easy, Medium (default selected), Hard, Death March
- Focus: `outline: 2px solid var(--accent)`, `outline-offset: 2px`

**Hint count per difficulty:**

| Difficulty   | Hint count | Check visible |
|--------------|-----------|---------------|
| Kiddie       | ∞         | No            |
| Easy         | 3         | Yes           |
| Medium       | 1         | Yes           |
| Hard         | 0         | No            |
| Death March  | 0         | No            |

---

## 8. Responsive Breakpoints

### 8.1 Desktop (default, `> 720px`)

- `.game-area`: `flex-direction: row`, grid left, controls right
- Grid: fixed `414px × 414px`
- `.right-col`: `min-width: 220px`

### 8.2 Mobile (`max-width: 720px`)

- `.game-area`: `flex-direction: column`, `align-items: center`, `gap: 18px`
- `.left-col`: `width: 100%`, `align-items: center`
- Grid: `width: min(calc(100vw - 32px), 414px)`, `height: min(calc(100vw - 32px), 414px)` — square, capped at 414px
- Cell digits: `font-size: clamp(14px, 4.5vw, 22px)`
- Pencil marks: `font-size: clamp(6px, 2vw, 9px)`
- `.right-col`: `width: 100%`, `max-width: 414px`
- Header: padding `12px 16px`; `h1`: `16px`
- Main: padding `16px 12px 28px`; gap `16px`

### 8.3 Very Small (`max-width: 375px`)

- Grid: `width: calc(100vw - 32px)`, `height: calc(100vw - 32px)` (no cap — fills viewport minus margins)

---

## 9. Interaction Animations and Transitions

### 9.1 Theme Switch

- `<body>`: `transition: background 0.2s, color 0.2s`
- `<header>`: `transition: background 0.2s, border-color 0.2s`
- Grid (`.sudoku-grid`): `transition: background 0.2s, border-color 0.2s`
- Cells (`.cell`): `transition: background 0.08s` (selection feedback is fast)
- Buttons (`.btn`): `transition: background 0.1s, border-color 0.1s, color 0.1s`
- Theme select: `transition: background 0.2s, color 0.2s, border-color 0.2s`
- Difficulty select: `transition: background 0.2s, color 0.2s, border-color 0.2s`
- Stats panel: `transition: background 0.2s, border-color 0.2s`
- Modal: `transition: background 0.2s, border-color 0.2s`
- Hint badge: `transition: background 0.2s, color 0.2s`

### 9.2 Selection

Cell background changes with `transition: background 0.08s` — quick but not instant.

### 9.3 No Transitions On

- Font changes (theme switch changes font family in Terminal — this is immediate)
- Outline/border-strong changes

---

## 10. Accessibility

### 10.1 Focus Indicators

- All interactive elements: `outline: 2px solid var(--accent)`, `outline-offset: 2px` on `:focus-visible`
- Grid cells: `outline: 2px solid var(--accent)`, `outline-offset: -2px`, `z-index: 2` on `:focus-visible` (inset to avoid clipping by cell borders)
- Selected cells use the same outline style (always visible, not just on keyboard focus)

### 10.2 ARIA Structure

- Grid: `role="grid"`, `aria-label="Sudoku puzzle"`, `tabindex="0"`
- Each cell: `role="gridcell"`, `tabindex="0"`, `aria-label` describing row, column, value/state
- Given cells: `aria-readonly="true"`, label includes "(given)"
- Player cells: `aria-selected="true/false"`, label includes "conflict" when conflicted, pencil marks listed as "pencil marks 1, 4, 7"
- Number pad: `role="group"`, `aria-label="Number pad"`
- Mode button: `aria-pressed="true/false"`, `aria-label` describes switching TO the other mode
- Hint button: `aria-label` includes hint count or "no hints remaining"
- Theme select: `aria-label="Select visual theme"`
- Difficulty select: `aria-label="Select difficulty level"`
- Stats table: `aria-label="Game statistics by difficulty"`, each row has `aria-label` with full text
- Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title"`
- Win banner: `aria-hidden="true"` when not shown

### 10.3 Screen Reader Live Region

A visually hidden `<div id="sr-live" aria-live="assertive" aria-atomic="true" role="status">` announces: digit placement, conflicts, hint usage, mode changes, theme changes, puzzle reset, win. Content is set via a double-frame pattern (clear then set) to ensure re-announcement of repeated messages.

### 10.4 Theme Contrast Notes

- **Terminal:** Primary button uses `color: #000` (black) on `#39ff14` background for legibility.
- **School:** Primary button uses `color: #ffffff` (white) on `#4a5568` background.
- **Coffee/Mountain:** Dark headers require explicit light text colors on header elements.
- All themes maintain visible focus indicators through `var(--accent)` which is chosen to contrast with `var(--surface)` in each theme.

### 10.5 Keyboard Navigation

- Arrow keys move selection between cells (wraps at edges within row/column)
- Digit keys `1`–`9` enter values in the selected cell
- `Backspace`/`Delete` erase the selected cell
- `p`/`P` toggles pen/pencil mode (when focus is not on an input/select/button)
- `Escape` closes the confirmation dialog

---

## 11. Screen Reader Visibility Utility

```css
#sr-live {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}
```

This pattern is used for the live announcement region only. All other content is visually present.
