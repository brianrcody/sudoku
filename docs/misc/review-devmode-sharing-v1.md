# Review Report — Developer Mode + Puzzle Sharing (v1)
**Date:** 2026-11-13
**Reviewer:** Uber Developer (Review stage)
**Specs:** fspec-005-dev-mode, fspec-006-puzzle-sharing, vspec-005-dev-mode,
vspec-006-puzzle-sharing, aspec-dev-mode, aspec-puzzle-sharing
**Verdict:** **Sign-off** — no open blockers. Three blockers were found and fixed during
the review (§4); non-blocking observations are in §5.

Verification method: code read against each spec section; a scripted Playwright pass
against the running app (1100px and 390px viewports, all five themes, left-hand mode,
`?p=` with rated / unrateable / malformed strings, `?dev=1` / `?dev=0`, console-error
capture, screenshots inspected); then the automated suite, whose integration tests now
pin every behavior checked by hand.

---

## 1. Functional Spec Fidelity

### 1.1 fspec-006 — Puzzle Sharing

| § | Requirement | Result |
|---|---|---|
| 2.1 | Share button under New Puzzle / Reset, full row, every width | ✓ `index.html` `.action-row`; `#btn-share { grid-column: 1 / -1 }`; SHR35 at six widths |
| 2.2 | Enabled whenever a puzzle is loaded, incl. Unrated and won | ✓ `share.js` `sync()`; SHR33 |
| 2.3 | Copy → confirm (4 s) + announce; failure → focused, selected read-only field | ✓ SHR29, SHR31 (denied and missing clipboard) |
| 3.1 | Digits, `0`/`.`, whitespace ignored, 81 cells | ✓ `parsePuzzleString`; PS1–PS8 |
| 3.2 | Link = app URL without query/fragment + `p`; nothing but givens | ✓ `buildShareUrl`; SH1–SH5, SHR29–SHR30 |
| 4.1 | Parse → validate off-thread → rate → confirm if progress → replace → report | ✓ `puzzleLoader.load`; order pinned by PL-L17, PL-L23 |
| 4.1 | "Checking puzzle…" while validating; game stays playable | ✓ `onChecking` → progress notice; work is in a worker |
| 4.2 | Seven rejection messages; chars before length; game untouched | ✓ PL-L6/7, PS5, SHR14 (five classes end to end) |
| 4.3 | Confirmation text, modal semantics, only with progress, not on won/untouched boards | ✓ SHR6–SHR13, PL-L24 |
| 4.4 | Outcome messages | ✓ exact strings asserted |
| 5 | Boots normally; link concurrent; outcome shown + announced; `p` stripped, rest kept | ✓ SHR1–SHR3 |
| 5 | The shared puzzle wins in all three orderings | ✓ SHR5 (generation in flight), SHR6 (generation first), SHR8 (restored progress) |
| 6 | Unrated: play features normal, Check shown, Hint/Coach disabled + labelled, `C` announces, selector entry, no active stats row | ✓ SHR17–SHR19, SU1–SU10 |
| 6 | Unrated: New Puzzle at generation tier; difficulty change generates; cancel returns selector to Unrated | ✓ SHR21–SHR23, SHR41 |
| 7.1 | Rated loaded puzzle records; Unrated never; dev mode never; resume rule | ✓ SHR24, SHR19, DVI7–DVI9, SU16–SU22 |
| 7.2 | Persist/restore incl. Unrated; preference untouched | ✓ SHR20, SHR26, SHR27 |
| 8 | One notice; variants; Dismiss except Progress; cleared on a generated puzzle | ✓ NT1–NT13, SH14, SHR21 |
| 9 | Accessible names, announcements, focus return, text-field key isolation | ✓ SHR9, SHR31, SHR32, SHR34, UK13–UK15 |
| 10 | Edge cases (dev mode + link, move while checking, New Puzzle while checking, fallback dialog, duplicate `p`) | ✓ DVI8; PL-L23; `beforeReplace` aborts and closes; `URLSearchParams.get` returns the first value |

### 1.2 fspec-005 — Developer Mode

| § | Requirement | Result |
|---|---|---|
| 2 | `?dev=1` on + saved; `?dev=0` off + cleared; otherwise saved; read once; parameter left in place | ✓ DM1–DM9, DVI2–DVI4, DVI8 |
| 2 | Off: no dev UI in the page; tooling not downloaded | ✓ DVI1 (DOM + resource timing), AR-D1–AR-D3 |
| 2 | On: fixed DEV badge linking to the panel; heading; statistics note; five collapsed sections | ✓ DP1–DP6, DVI5, DVI6 |
| 3 | No attempt or win recorded while on; nothing else changes | ✓ DVI7, DVI8; `statsSuppressed` is the only game-layer hook |
| 4 | Load: labelled field, checking state, shared loader, inline outcome, field kept, no global notice | ✓ DP7–DP11, DVI10–DVI14 |
| 5.1 | Solver on current board; step text; three summary forms; announced; read-only | ✓ IN2–IN4, IN13–IN19, DP12–DP14, DVI17, DVI18 |
| 5.2 | Toggle selection; three highlight roles; announcement; additive styling | ✓ IN5–IN12, DP15–DP20 |
| 5.3 | Stale on board change, not on pencil change; Clear | ✓ DP21–DP25 |
| 6 | Overlay: computed candidates in every empty cell; agree / missing / extra; unmarked cell all-agree; live; marks never modified | ✓ IN20–IN25, DP27–DP34, DVI19 |
| 7 | Coach data: empty message, JSON (2-space), follows session, copy success/failure | ✓ DP36–DP42, DVI20 |
| 8 | Diagnostics: four puzzle cases; seven fields; survives reload | ✓ IN32–IN35, DP43–DP47, DVI21 |
| 9 | Badge name; region labelled; native disclosures; `aria-pressed`; `role="switch"`; overlay and highlight cell names | ✓ DP2, DP1, DP6, DP12, DP27, DP31, DP15, DVI22 |
| 10 | Edge cases (wrong digits, overlay across puzzles, highlight + overlay, Unrated) | ✓ solver fuzzed on 600 inconsistent boards with no exception; DP33, DP35, DVI14, DVI18 |

## 2. Visual Design Spec Fidelity

| vspec § | Result |
|---|---|
| 006 §2 Share button: base `.btn`, spans the row, never hidden | ✓ |
| 006 §3 Notice: surface card, 4px accent edge (conflict for errors), 13px, Dismiss, fade-in, Terminal square | ✓ after B2/B3 (§4) |
| 006 §3 Link field on `--given-bg` | ✓ after B1 |
| 006 §4 Unrated: appended option, dash badge, disabled buttons, Check visible | ✓ |
| 006 §6 Responsive; nothing conditional on `data-hand` | ✓ SHR35–SHR37 |
| 005 §2 Badge: fixed bottom-left, conflict background, monospace, below the modal layer | ✓ DVI5 |
| 005 §3 Panel: dashed border, surface, 860px max, tool rules, compact buttons, status lines | ✓ screenshots, five themes |
| 005 §3.3 Step list: numbered gutter, monospace rows, accent selected state | ✓ |
| 005 §3.4 Highlight rings: win / conflict / accent | ✓ |
| 005 §3.5 Overlay marks: underline for missing, strike-through for extra; switch; legend | ✓ DVI19 reads the computed `text-decoration-line` |
| 005 §3.6–3.7 JSON block and diagnostics table | ✓ |
| 005 §4 No horizontal scroll; unaffected by hand mode | ✓ DVI23, DVI24 |
| Both: legible in all five themes | ✓ contrast ≥ 4.5:1 asserted per theme (SHR37, DVI24) |

## 3. Architectural Plan Fidelity

| Item | Result |
|---|---|
| Exactly one loader from givens to `Puzzle` | ✓ `loadFromGivens` is the only caller of `countSolutions` + `rate` + `toPuzzle` outside the generator; `puzzleLoader.load` is the only dispatcher of a loaded `PUZZLE_LOADED`; both share links and the dev tool call it |
| Validation and rating in a worker | ✓ `loadProvider` → dedicated instance of `generator.worker.js` |
| Protocol change additive | ✓ two new message types; existing envelopes untouched; WP1–WP2 unchanged and passing |
| Generation deterministic per seed | ✓ PD1: six seeds reproduce ids, givens, tiers, and trace lengths captured before the change |
| Unrated flows through persistence, stats gating, coach/hint disabling | ✓ every site in aspec-puzzle-sharing §3 checked in code |
| Dev module lazy, zero cost when off | ✓ one static import (`devMode.js`, 40 lines); `import()` behind the flag |
| No state on body classes | ✓ none added; dev UI needs no root state |
| File structure matches both aspecs | ✓ |
| No new dependencies; no server code | ✓ |
| UI modules do not import `game/` or `providers/` | ✓ arch test extended to `notice.js`, `share.js` |

## 4. Blockers Found and Resolved

| # | Spec | Finding | Resolution |
|---|---|---|---|
| B1 | vspec-005/006 (as first written) | Inset fields used `--text` on `--bg`; unreadable in Coffee (1.19:1) | `--given-bg`; vspecs amended; pinned by SHR37, DVI24 |
| B2 | vspec-006 §3 | Link-variant card inherited the link field's styles through a shared class name | Field class renamed `notice-field` |
| B3 | vspec-006 §6 | Notice overflowed viewports narrower than 414px | Width moved to `#notice-root`; pinned by SHR36 |

Details in `bugs-devmode-sharing-1.md`.

## 5. Non-Blocking Observations

1. **Pre-existing: difficulty change relabels the current puzzle.** `CHANGE_DIFFICULTY`
   on a *rated* puzzle keeps the board and changes its tier label, so a Nightmare puzzle
   can be re-labelled Kiddie and counted there. fspec-001 §9.3 says the puzzle state is
   cleared. This predates V4 and was left alone for rated puzzles; for Unrated puzzles it
   had to be closed (it would have leaked them into statistics), which is why they
   generate a new puzzle instead. Worth a product decision.
2. **Pre-existing: an aborted foreground generation still completes in the worker** and
   its result is filed in the pre-generation cache. Harmless — arguably useful — but it
   means "cancel" does not free the worker. It is the reason loads use their own worker.
3. **Pre-existing: `README.md` advertises "best/average time" statistics**, which do not
   exist. Not touched.
4. **`<select>` still passes digits and arrows to the board** when a cell is selected.
   The new guard covers text fields only, deliberately, to leave existing behavior alone.
5. **Inspector highlights and the coach's own highlights can coexist** on a cell during a
   coach session. Coach target/cause rings and the dev rings both use `box-shadow`, so the
   dev ring (loaded later) replaces the coach ring while the coach background remains.
   Acceptable for a diagnostic tool.

## 6. Sign-off

The implementation matches fspec-005, fspec-006, vspec-005, vspec-006, aspec-dev-mode,
and aspec-puzzle-sharing. No open blockers.
