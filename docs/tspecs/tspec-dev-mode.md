# Test Strategy — Developer Mode
**Date:** 2026-11-13
**Status:** Final — implemented; see `docs/misc/test-summary-devmode-sharing.md`
**Author:** Uber Developer (QE Strategist stage)
**Inputs:** aspec-dev-mode, fspec-005-dev-mode, vspec-005-dev-mode

---

## 1. Approach

Developer code is held to the same 100% branch standard as the rest (rspec-005 R12).
The three-layer split makes that cheap:

- `devMode.js` and `inspect.js` are pure and unit-tested directly.
- `devPanel.js` is unit-tested in the Mocha page against a fake game state and a **real**
  `ui/grid.js` mount, so the step highlight and candidate overlay are verified through the
  actual renderer and its decorator hook, with `loadPuzzle` and `copy` injected.
- Integration tests cover what only the running app can show: that the tooling is not
  fetched when the mode is off, flag persistence across loads, statistics suppression end
  to end, load-from-string through the real worker, and computed style.

The lazy-loading guarantee is checked two ways: behaviorally
(`performance.getEntriesByType('resource')` in the app frame, DVI1) and structurally
(source scan for static imports of the tooling, AR-D1–AR-D3).

## 2. Test Inventory

### 2.1 Unit — `unit/devMode.test.js`

DM1–DM9: default off; `?dev=1` on + saved; saved applies; `?dev=0` off + cleared; stays
off; unrecognized value with saved on / off; parameter among others; non-`true` saved value.

### 2.2 Unit — `unit/inspect.test.js`

| IDs | Function | Covers |
|---|---|---|
| IN1 | `cellRef` | corners and row wrap |
| IN2–IN4 | `formatStep` | placement; single-digit elimination; multi-digit clauses in digit order |
| IN5–IN12 | `stepCells` | placement; de-duplicated eliminations; scalar and array cell keys; digit keys ignored; nested chain nodes; XY-Chain cells; colour groups; null field; role precedence |
| IN13–IN19 | `runInspector`, `summarize` | solved with rank + tier; ordering; input untouched; stall at 0 steps; already full; singular wording; one-step solve |
| IN20–IN25 | `candidateDiff` | filled → null; unmarked → all agree; exact; missing; extra; pencil untouched |
| IN26–IN29 | `overlayLabel` | plain; missing; extra; no candidates |
| IN30–IN31 | `techniqueProfile` | count order with alphabetical ties; empty |
| IN32–IN35 | `describeGeneration` | four message cases; full rows; recomputed trace + empty breakdown; real generator output |

### 2.3 Unit — `unit/devPanel.test.js`, extended suites

| IDs | Covers |
|---|---|
| DP1–DP6 | Panel region, badge link + focus, stylesheet, note, five collapsed disclosure sections |
| DP7–DP11 | Label; checking state; loaded outcome + announce + field kept; inline error; error cleared |
| DP12–DP26 | Listing + summary + announce; board untouched; player digits included; select/move/deselect; plural elimination highlight; stray list click; highlight survives re-render; stale on pen and puzzle, not pencil; no stale message without results; Clear; re-run |
| DP27–DP35 | Switch state; overlay in every empty cell; filled cells untouched; divergence classes; accessible names; selected suffix; live update; off restores and never modified; overlay + highlight combined |
| DP36–DP42 | No session; JSON; follows session; copy success/failure; status cleared; default copy |
| DP43–DP47 | Table; loaded; updates; recomputed profile; no puzzle |
| UG14–UG19 (`ui-grid`) | Decorator absent; immediate full ordered pass; runs after rebuild; runs every render; clearing; `refresh` |
| PD1 ×6–PD8 (`pipeline-diagnostics`) | **Seed pins captured before the change**; marker + fields; attempt arithmetic; per-tier sum; explicit budget; fallback; degenerate path; unsolved counted |
| PP6 (`puzzleProvider`, extended) | Diagnostics survive the pre-generation cache |
| AR-D1 ×8, AR-D2, AR-D3 (`arch`) | No static tooling import in always-loaded modules; guarded dynamic import; no dev markup in `index.html` |

### 2.4 Integration — `integration/devmode.test.js`

| IDs | Covers (rspec-005) |
|---|---|
| DVI1 | Off: no dev DOM, tooling never requested (R2) |
| DVI2–DVI4 | `?dev=1` on with lazy resources; persists; `?dev=0` off and stays off (R1) |
| DVI5–DVI6 | Badge fixed and visible after scroll; focuses the panel (R3) |
| DVI7–DVI9 | No attempt/win with dev on, generated and shared (R4); resume rule after `?dev=0` |
| DVI10–DVI15 | Load valid (multi-line, `.`), malformed, non-unique, confirm + decline, Unrated; field keeps its digits (R5) |
| DVI16 | [perf] cold and warm load-from-string < 1 s, rateable and unrateable (R11; rspec-006 R12) |
| DVI17–DVI18 | Inspector on the live app: list, highlight, read-only, stale; explicit stall; [perf] (R6) |
| DVI19 | Overlay divergence, non-colour cues from computed style, marks untouched (R7) |
| DVI20 | Coach viewer equals the live `CoachStep`; follows session end (R8) |
| DVI21 | Diagnostics for a generated puzzle; identical after reload; loaded message (R9) |
| DVI22 | Every dev control focusable and named (R10) |
| DVI23–DVI24 | No overflow at 320px; contrast in five themes; unaffected by left-hand mode |

## 3. Coverage Map

| Module | Decision points | Covered by |
|---|---|---|
| `devMode.js` | `'1'`; `'0'`; saved | DM2; DM4; DM1/DM3/DM9 |
| `inspect.js` `formatStep` | placement; new digit bucket | IN2; IN3/IN4 |
| `_collectCells` | number ± cell key; array; object; null/other | IN7–IN11 |
| `stepCells` | placement; core key; taken | IN5/IN6; IN7; IN12 |
| `runInspector`/`summarize` | full; plural ×2; solved | IN17; IN18; IN13/IN16 |
| `candidateDiff` | filled; unmarked | IN20; IN21 vs IN22 |
| `overlayLabel` | none; missing; extra | IN26–IN29 |
| `techniqueProfile` | count tie-break | IN30 |
| `describeGeneration` | no puzzle; loaded ×2; no gen; stored trace; breakdown; fallback | IN32–IN34 |
| `devPanel.js` | default copy; stale guard (results × key); coachSession; puzzle; rejected class; step button hit; toggle select; announce plural; overlay on; first cell; empty cell; selected; step selected; role found; diff class ×4; copy ok; session; message vs rows | DP42; DP21–DP24; DP38; DP45; DP9/DP10; DP19; DP15–DP17; DP15/DP18; DP27/DP28; DP28; DP29; DP32; DP15/DP17; DP15/DP20; DP30; DP39/DP40; DP36/DP37; DP43/DP44 |
| `grid.js` additions | decorator present | UG14 vs UG15 |
| `pipeline.js` additions | unsolved; byTier first/again; three `finish` sites | PD8; PD4; PD2/PD6/PD7 |

## 4. Gaps and Risks

- **Pattern-cell highlighting is verified against synthetic steps and one real
  elimination step.** `stepCells` is generic over key names, so a future technique that
  reports cells under a new key would simply get no pattern highlight; IN7–IN11 pin every
  key in use today.
- **Resource-timing proof (DVI1) depends on the browser recording module fetches**, which
  Chromium does. AR-D1–AR-D3 provide the same guarantee structurally.
- **DVI22 counts on native focusability.** It focuses each control programmatically; Tab
  order is the DOM order of native controls and is not separately simulated.
