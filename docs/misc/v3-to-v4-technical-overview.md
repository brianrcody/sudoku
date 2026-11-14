# V3 → V4 — Technical Overview

**Date:** 2026-11-13
**Purpose:** a high-level account of what changed in the architecture and implementation
between V3 (harder tiers) and V4 as it stands in the working tree.
**Detail lives in:** `aspec-left-hand.md`, `aspec-puzzle-sharing.md`, `aspec-dev-mode.md`.

**Scope.** V4 so far is three features:

| Feature | State |
|---|---|
| Left-hand layout | Shipped 2026-09-13 (`f81f343`) |
| Puzzle sharing via URL | Built 2026-11-13, **uncommitted** |
| Developer mode | Built 2026-11-13, **uncommitted** |

The other V4 candidates (hamburger menu, daily puzzle) are not started. Left-hand layout
is covered briefly in §9; it was architecturally small. Sharing and developer mode are
where the architecture moved, and they are the bulk of this document.

---

## 1. The Short Version

V3's architecture assumed three things that V4 had to relax:

| V3 assumption | V4 reality |
|---|---|
| Every puzzle comes from the generator | A puzzle can come from a URL or a pasted string |
| Every puzzle has one of the seven tiers | A puzzle can be **Unrated** |
| Every game counts toward statistics | Statistics can be ineligible — per puzzle (Unrated) or globally (developer mode) |

Almost every change to existing code traces back to one of those three. On top of that,
V4 added two seams that did not exist before — a second worker path, and a render hook on
the grid — and the app's first lazily loaded code.

What did **not** change: the solver, the technique ladder, the rater, the coach analyzer,
the generator's algorithm, the reducer's event model, the theme system, and the
no-build/no-dependency stack. No solver code was touched, so no soundness sweep was owed.

### Size

| | Files | Lines |
|---|---|---|
| New production modules (sharing + dev) | 10 JS + 1 CSS | ~1,430 |
| Existing production files modified | 15 | +389 / −41 |
| Tests | 750 → 1,081 | |

---

## 2. Before and After

### V3 — one way in

```
                      ┌─ generation worker ─┐
main.js ─ requestPuzzle ─► generateForTier ─► Puzzle ─► PUZZLE_LOADED / NEW_PUZZLE
   │                                                          │
   └─ restore from localStorage ──────────────────────────────┘
```

### V4 — two ways in, one shape out

```
                      ┌─ generation worker ─┐
main.js ─ requestPuzzle ─► generateForTier ─► Puzzle {source:'generated', gen:{…}}
   │                                                          │
   ├─ restore from localStorage ──────────────────────────────┤
   │                                                          ▼
   │   ?p=…  ─┐                                         PUZZLE_LOADED
   │          ├─► puzzleLoader.load ─► parse                  ▲
   └─ dev    ─┘        │                                      │
      string           ├─► loadProvider ─► ┌─ load worker ─┐  │
                       │                   │ loadFromGivens │  │
                       │                   └─ conflicts →   │  │
                       │                      uniqueness →  │  │
                       │                      rate → toPuzzle  │
                       ├─► confirm (if progress)               │
                       └─► beforeReplace() ───────────────────┘
                            (abort generation, close dialogs)
```

Both entry points for external puzzles — share links and the developer tool — go through
`puzzleLoader.load`. There is deliberately no second path.

---

## 3. New Concept: The Unrated Tier

**Representation.** `Puzzle.difficulty === 'unrated'` (`UNRATED` in `config.js`).

The design choice was *where* to put it. It is **not** in `DIFFICULTY_ORDER`, which keeps
its V3 meaning: tiers that can be generated, selected, cached, and counted. It **is** a
key in the four per-puzzle behavior tables, so every existing `TABLE[puzzle.difficulty]`
lookup stays total without a guard:

| Table | `unrated` | Effect |
|---|---|---|
| `TIER_LABELS` | `'Unrated'` | Display |
| `HINT_LIMITS` | `0` | Existing hint guards disable hints unchanged |
| `CHECK_VISIBLE` | `true` | Check button shown |
| `CORRECTNESS_MODE` | `'on-demand'` | Win detection through an existing branch |

That left a short list of sites that genuinely assumed "difficulty is a generatable tier":

| Site | V3 behavior on `'unrated'` | V4 |
|---|---|---|
| `state.js` stats calls | `cache['unrated']` is undefined → throws | Gated (§5) |
| `state.js` `CHANGE_DIFFICULTY` | Relabels the puzzle to the chosen tier | Leaves an Unrated puzzle alone; `main.js` generates a new one |
| `state.js` `COACH_START` | Would start | Refused |
| `main.js` New Puzzle / `primeNext` | `generateForTier('unrated')` → no budget, garbage | `_generationTier()` (§6) |
| `controls.js` selector | Blank — no matching `<option>` | Option added while the puzzle is Unrated |
| `numpad.js`, `coach.js` | Misleading labels | "Unavailable for unrated puzzles" |

---

## 4. New Subsystem: Puzzle Loading

Six new modules, each with one job. The split is by *where the code runs* and *what it
may import*.

| Module | Runs | Role |
|---|---|---|
| `util/puzzleString.js` | Main thread | Codec: 81 cells ↔ `Uint8Array`. Pure |
| `generator/loadPuzzle.js` | **Worker** | `loadFromGivens`: conflicts → uniqueness → rate → `toPuzzle`. Pure |
| `providers/loadProvider.js` | Main thread | Owns the load worker; `rateGivens(givens) → Promise` |
| `game/puzzleLoader.js` | Main thread | Orchestration: parse, await rating, confirm, dispatch. All collaborators injected |
| `ui/notice.js` | Main thread | Message card under the board |
| `ui/share.js` | Main thread | Share button; builds the link |

`loadFromGivens` reuses V3 code unchanged: `computeConflicts`, `countSolutions`, `rate`,
`toPuzzle`. Nothing in the solver or rater knows that loaded puzzles exist.

### 4.1 The second worker

This is the one structural surprise, and a departure from the handoff brief's wording.

V3 has one worker, and `generateForTier` is **synchronous** inside it. While a generation
runs the worker cannot receive messages; `GEN_ABORT` only takes effect between requests.
That was acceptable in V3 because the only thing waiting was another generation.

A load cannot wait. Opening a share link coincides with boot-time generation, and a
Diabolical search occupies the worker for seconds. So `loadProvider` creates a **second
instance of the same worker script**, lazily, on the first load:

| | Generation worker | Load worker |
|---|---|---|
| Script | `generator.worker.js` | `generator.worker.js` (same file) |
| Created | At boot | On first load; never, if nothing is loaded |
| Messages | `GEN_*` | `LOAD_REQUEST` / `LOAD_RESULT` |
| Queueing | FIFO with foreground preemption | None — answered inline |

The protocol change is purely additive: two new message types, existing envelopes
untouched.

### 4.2 Why the loader takes its dependencies by injection

`createPuzzleLoader({ gameState, rateGivens, confirm, beforeReplace })`.

`main.js` has always been the project's coverage weak spot because it is only reachable
through iframes. Putting the load flow in `main.js` would have added to that. As an
injected module it is unit-tested to 100% with fakes, and `main.js` only supplies four
small adapters. The same technique is used for `loadProvider` (worker factory) and
`share.js` (clipboard, location).

### 4.3 "The shared puzzle wins"

A shared-link load is a second asynchronous `PUZZLE_LOADED` racing the boot-time one.
V3 already had a staleness check for superseded generations (`_genAbort !== controller`).
V4 reuses it: `beforeReplace()` aborts and nulls `_genAbort`, so a late generation result
fails the existing check. No new race-handling mechanism was needed.

---

## 5. Changed Concept: Statistics Eligibility

V3: the reducer calls `stats.recordAttemptOnce` / `recordWin` unconditionally.

V4: one predicate gates all five call sites.

```js
createGameState({ stats, hintProvider, statsSuppressed = () => false })

_statsEligible = () => puzzle.difficulty !== UNRATED && !statsSuppressed()
```

`main.js` passes `statsSuppressed: isDevMode`. This is the **only** point where developer
mode reaches into the game layer.

One subtlety changed the meaning of an existing field. In V3 `attemptRecorded` meant "the
player has made a move". In V4 it means "an attempt has been *recorded*" — it stays false
while ineligible. Otherwise a game started in developer mode and finished after turning
it off would log a win with no attempt.

---

## 6. Changed Concept: "Current Difficulty" Split in Two

V3 `main.js` had one variable, `currentDifficulty`, doing two jobs: the tier of the puzzle
on screen, and the tier to generate next. They were always equal, so it never mattered.

A loaded puzzle breaks the equality — a friend's Hard puzzle, or an Unrated one, says
nothing about what you want generated. V4 separates them:

| | Source of truth |
|---|---|
| The current puzzle's tier | `state.puzzle.difficulty` (may be `unrated`) |
| The player's chosen tier | `preferredTier` in `main.js`, persisted under the existing `DIFF_KEY` |
| Tier to generate | `_generationTier()` — the puzzle's tier if rated, else `preferredTier` |

Loading a puzzle never writes `DIFF_KEY`.

---

## 7. New Subsystem: Developer Mode

### 7.1 Three layers, one of them always loaded

| Layer | Module | Loaded |
|---|---|---|
| Flag | `dev/devMode.js` (38 lines) | Always — static import |
| Logic | `dev/inspect.js` | Only via the panel |
| UI | `dev/devPanel.js`, `css/dev.css` | `import()` when the flag is on |

**This is the app's first dynamic `import()` and first conditionally loaded stylesheet.**
V3 loaded one static module graph. V4's graph has a lazy branch, and `index.html`
contains no developer markup at all — the badge, panel, and `<link>` are created by
`devPanel.js`. With the flag off, the cost is one 38-line module.

The guarantee is enforced two ways in tests: resource-timing entries in the running app,
and a source scan that fails if any always-loaded module statically imports the tooling.

### 7.2 The grid decorator seam

V3's `ui/grid.js` owned cell rendering completely: every render rebuilds each cell's
classes, accessible name, and content. Nothing outside could draw on a cell without being
wiped on the next render.

V4 adds one hook:

```js
setCellDecorator(fn)   // fn(el, index, state), run at the end of every cell update
refresh()
```

Because the grid rebuilds the cell first, the decorator always starts from a clean slate
and needs no cleanup protocol. Both grid-drawing tools — step highlights and the candidate
overlay — are one decorator function. Cost when unused: a null comparison per cell.

This is the only extension point V4 added to a V3 UI module, and it is general: any
future feature that annotates cells can use it.

### 7.3 The tools are read-only by construction

`devPanel.js` receives `getState` and `on`, and one function: `loadPuzzle`. It has no
`dispatch`. Four of the five tools therefore *cannot* change the game; the fifth does so
only through the shared loader.

### 7.4 Generation diagnostics — a data change in the pipeline

`generateForTier` now returns two extra fields:

```js
source: 'generated',
gen: { requestedTier, budget, attempts, fallback,
       rejected: { unsolved, wrongTier, byTier: {…} } }
```

The counters only observe the existing loop. No RNG call was added, removed, or
reordered, so a seed still produces the identical puzzle — pinned by a regression test
using ids and givens captured from the V3 pipeline before the change.

`Puzzle.source` is new in V4 generally: `'generated'`, `'link'`, or `'string'`.

---

## 8. Smaller Cross-Cutting Changes

| Change | Why |
|---|---|
| `dialog.open` accepts `onCancel` | The loader must learn of a decline. V3 dialogs had only `onConfirm`; cancelling was silent |
| `keyboard.js` ignores digits, erase, and arrows in `<input>`/`<textarea>` | V3 had no text fields. V4 has two (link fallback, dev load field); without the guard, typing in them edited the selected cell |
| `controls.js` resyncs the selector when generation ends | Needed once the selector's value could differ from the current puzzle's tier |
| `clientGenProvider` pre-gen cache stores `source`/`gen` | So diagnostics survive for pre-generated puzzles, which is most of them |
| Saved-game blob stores `source`/`gen` | Same, across reloads |
| `util/clipboard.js` | First use of the Clipboard API in the app |
| `index.html` | `#btn-share`, `#notice-root` — four lines |

### Persistence

No schema version bump. The saved-game blob is still `version: 1`:

- `difficulty` was already a free string, so `'unrated'` round-trips.
- `puzzle.source` and `puzzle.gen` are optional; V3 blobs simply lack them.

New keys:

| Key | Store | Contents |
|---|---|---|
| `sudoku.dev.v1` | `localStorage` | `true` when developer mode is on |
| `sudoku.hand` | Cookie | `left` / `right` (left-hand layout) |

---

## 9. Left-Hand Layout (shipped earlier in V4)

Included for completeness; it changed very little architecturally.

| Aspect | Implementation |
|---|---|
| State | `data-hand="left"` on `<html>`; attribute absent means right |
| The swap | Pure CSS: `flex-direction: row-reverse` on `.game-area`, wide viewports only. DOM and focus order never change |
| No flash | The inline head script that already applied the theme also applies `data-hand` before CSS loads |
| Module | `ui/handedness.js` — cookie + header switch |
| Size | 1 new module (67 lines); 4 files modified |

It established two conventions the later features rely on: root-level state goes on
`<html>` attributes, never body classes (the theme script overwrites `body.className`);
and header controls may be hidden at ≤ 720px, so anything that must stay reachable — the
Share button — cannot live there.

---

## 10. Test Infrastructure

The tooling is unchanged (Mocha + Chai in headless Chromium, c8). What changed is how
integration tests are written:

| V3 | V4 |
|---|---|
| Each integration file defines its own `createIframe` / `waitForPuzzle` | Shared `integration/_app.js` |
| 1px iframes | Desktop-sized frames by default, resized when a test is about width |
| Wait for a puzzle | Also `waitForLinkHandled` — the app strips `?p=` only when the outcome is known, giving one precise signal for loaded / declined / rejected |
| Colour correctness checked by eye | WCAG contrast computed from `getComputedStyle`, per theme. This caught a real bug (unreadable fields in the Coffee theme) |

The older integration files were not migrated to the shared helpers.

---

## 11. What V4 Exposed but Did Not Change

Three V3 behaviors became visible while doing this work. None was altered.

1. **Difficulty change relabels the current puzzle** instead of clearing it, contrary to
   fspec-001 §9.3. V4 had to special-case Unrated around it (§3).
2. **Cancelling a generation does not stop the worker** — the reason for the second
   worker (§4.1).
3. **`main.js` remains hard to cover.** V4 raised its branch coverage from 73% to 90% as
   a side effect, and kept new logic out of it where possible (§4.2).

---

## 12. File Map

**New**

```
js/util/puzzleString.js        js/dev/devMode.js
js/util/clipboard.js           js/dev/inspect.js
js/generator/loadPuzzle.js     js/dev/devPanel.js
js/providers/loadProvider.js   css/dev.css
js/game/puzzleLoader.js        js/ui/handedness.js   (shipped 2026-09-13)
js/ui/notice.js
js/ui/share.js
```

**Modified (sharing + developer mode)**

| File | Nature of change |
|---|---|
| `js/main.js` | Dev flag; `preferredTier` / `_generationTier`; loader wiring; link handling; lazy import; persistence fields |
| `js/game/state.js` | `statsSuppressed` dependency; eligibility gate; Unrated guards |
| `js/generator/pipeline.js` | Diagnostics counters; `source` |
| `js/config.js` | `UNRATED`, `SHARE_PARAM`, `isRatedTier`; table rows |
| `js/worker/protocol.js`, `generator.worker.js` | Load messages |
| `js/ui/grid.js` | Decorator hook |
| `js/ui/dialog.js` | `onCancel` |
| `js/ui/controls.js`, `numpad.js`, `coach.js` | Unrated presentation |
| `js/ui/keyboard.js` | Text-field guard |
| `js/providers/clientGenProvider.js` | Two cached fields |
| `index.html`, `css/controls.css` | Share button, notice |
