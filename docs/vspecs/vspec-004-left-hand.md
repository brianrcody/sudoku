# Visual Design Spec: Left-Hand Layout Mode
**ID:** vspec-004-left-hand
**Status:** Final — approved by Product Director 2026-09-13 (mockup `docs/mockups/left-hand-v1.html`)
**Date:** 2026-09-13
**Author:** Uber Developer (Visual Designer stage)
**Based on:** fspec-004-left-hand; extends vspec-001-v1

---

## 1. Header Arrangement

The header's right side becomes a `.header-controls` flex group containing, in order, the
handedness switch and the existing `.theme-control`.

- `.header-controls`: `display: flex`, `align-items: center`, `gap: 20px`
- Header padding, border, and `justify-content: space-between` unchanged (vspec-001 §4.2).
- The header is not mirrored in left-hand mode.

## 2. Handedness Switch

### 2.1 Structure

A single `<button type="button" role="switch">` containing the visible label text followed
by a decorative track (`aria-hidden="true"`) holding a thumb. The whole button — label text
included — is the hit target.

### 2.2 Dimensions and base styling

| Part | Property | Value |
|---|---|---|
| Button | layout | `inline-flex`, `align-items: center`, `gap: 8px` |
| | padding | `4px 2px` |
| | border / background | none / none |
| | border-radius | `4px` (shapes the focus ring) |
| | font | inherits UI font; `13px`; `white-space: nowrap` |
| | color (label) | `var(--text-muted)` — matches the "Theme" label |
| | hover color | `inherit` (header text color) |
| | cursor | `pointer` |
| Track | size | `32px × 18px`, `flex-shrink: 0` |
| | border | `1px solid var(--text-muted)` |
| | border-radius | `9px` |
| | background | `var(--btn-bg)` |
| Thumb | size / position | `12px × 12px`, absolute at `top: 2px; left: 2px` |
| | border-radius | `50%` |
| | background | `var(--text-muted)` |

Label text: **Left-handed**.

### 2.3 States

| State | Track | Thumb |
|---|---|---|
| Off (`aria-checked="false"`) | as §2.2 | as §2.2 |
| On (`aria-checked="true"`) | border + background `var(--accent)` | `translateX(14px)`; background `var(--surface)` |
| Hover | label color → header text color | — |
| Focus (`:focus-visible`) | `outline: 2px solid var(--accent)`, `outline-offset: 2px` on the button | — |

There is no disabled state.

### 2.4 Per-theme overrides

The Coffee and Mountain headers are dark; their theme accents lack contrast against the
header, so the switch uses the header's muted tone instead.

| Theme | Label color | Focus outline | Track off (border / bg) | Thumb off | Track on (bg) | Thumb on |
|---|---|---|---|---|---|---|
| Minimalist | default | default | default | default | default | default |
| School | default | default | default | default | default | default |
| Coffee Shop | `#c9a97a` | `#c9a97a` | `#c9a97a` / `#3b2a1a` | `#c9a97a` | `#c9a97a` | `#2b1d0e` |
| Mountain | `#adc6de` | `#adc6de` | `#adc6de` / `#2d5878` | `#adc6de` | `#adc6de` | `#1a3a52` |
| Digital Terminal | default | default | border `var(--accent)`; `border-radius: 0` | `border-radius: 0` | default (`#39ff14`) | `#000` |

### 2.5 Motion

- Track: `transition: background 0.15s, border-color 0.15s`
- Thumb: `transition: transform 0.15s, background 0.15s`
- Button label: `transition: color 0.1s`
- `prefers-reduced-motion: reduce` → no track/thumb transitions.

## 3. Layout Swap

- Wide viewports (`not all and (max-width: 720px)` — the exact complement of the existing
  mobile breakpoint): when `<html data-hand="left">`, `.game-area` uses
  `flex-direction: row-reverse`.
- All other `.game-area`, `.left-col`, `.right-col` properties are unchanged: `gap: 32px`,
  `justify-content: center`, `align-items: flex-start`, `max-width: 860px`.
- The column swap is instant — no transition.
- Board column internals are unchanged; the difficulty row stays left-aligned above the grid.

## 4. Responsive

| Breakpoint | Switch | Layout |
|---|---|---|
| `> 720px` | visible | swaps per preference |
| `≤ 720px` | `display: none` | stacked, identical in both modes (vspec-001 §8.2) |

## 5. Theme Selector Focus Fix (adjacent)

The existing theme `<select>` focus outline (`var(--accent)`) is near-invisible in the dark
Coffee and Mountain headers. Override the outline color only:

| Theme | `#theme-select:focus` outline color |
|---|---|
| Coffee Shop | `#c9a97a` |
| Mountain | `#adc6de` |

Width and offset unchanged (`2px`, `2px`).
