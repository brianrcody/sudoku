# Review Report — Developer Mode, Inspector Fill, Debug Instrumentation (v2)
**Date:** 2026-11-27
**Reviewer:** Reviewer (Review stage)
**Implementation reviewed:** `debug-instrumentation` at `35c25e5`. The only working-tree
change is the §4.2 backlog note in `debug-instrumentation-open-items.md`, which has no code.
**Specs:**
1. Developer mode: rspec-005, fspec-005-dev-mode, vspec-005-dev-mode, aspec-dev-mode
2. Inspector fill amendment (`fff6319`): fspec-005 §5.4 and §11 as amended, aspec-dev-mode
   `pencilAtStep` and the wiring table, the finned-fish `fishDigit` rename
3. Debug instrumentation: rspec-007, fspec-007 (D-1 to D-36), vspec-007,
   aspec-debug-instrumentation
**Prior records relied on:** review-devmode-sharing-v1 (2026-11-13),
review-inspector-fill-v1 (2026-11-22), review-debug-instrumentation-v1 with its Orchestrator
Disposition (2026-11-16), debug-instrumentation-open-items.
**Verdict:** **Sign-off.** No blockers. Seven non-blocking findings (§8).

**Method.** I read every code change in `main..HEAD` that touches the three spec sets.
`devPanel.js`, `recorderPanel.js` and `foreground.js` I read in full. In `inspect.js`,
`replay.js`, `devSession.js`, `state.js` and `clientGenProvider.js` I read the relevant
parts. Each was checked against the specs. For code that has not changed since a prior
review, I relied on that review's tables. I ran 37 targeted test files in headless Chromium
from a private page that loads only those files (1,889 passing, 0 failing, 1 pending; the
pending test is `SS17`, which was already deferred). They include `devmode.test.js` and
`debug.test.js` (147 passing, 0 pending, so DBG-L3 now runs and passes). I also ran six
scripted Playwright passes against a private static server (ports 8901–8906), covering:

- the dev-off guarantee;
- panel clicks against the recorder;
- the Clear history → paste → Replay path;
- 1,204 recorded actions through the counts line, both dialogs and the API messages;
- a corrupt saved history at load;
- the inspector end to end by keyboard;
- the overlay, Restore, staleness, and replay over a stepped board;
- Generate from seed with its validation, confirmation and focus;
- Copy seed and Copy session failure;
- API focus and announcements;
- the logging switches by keyboard;
- an accessibility audit of the panel DOM;
- the panel's tab order;
- key isolation in the text fields;
- layout at 1500, 1000 and 390 px.

I diffed the old golden trace (`3b4a279`) against the new one. I did not run the full suite
(QE owns it). The only file I modified is this report.

Legend: **R** verified by reading, **X** verified by running (tests or scripted browser),
**I** inferred from a prior review for code provably unchanged since, **—** not checked.

---

## 1. Developer Mode (fspec-005, vspec-005, aspec-dev-mode)

The 2026-11-13 sign-off predates `415ff16` (inspector stepping, side-by-side panel),
`4badacc`, `a4defe6` (marks and overlay follow stepping), `09dee45`, and `fff6319`. These
are the changes that touch fspec-005 code:

- `devPanel.js`: the panel root now carries `data-keep-selection`, and `mount` is async,
  waiting for the recorder.
- The Generation diagnostics body is split into a table plus a permanent seed group.
- `pencilAtStep` gained the fill rule.
- `devMode.js` gained `RECORDER_DB` and `isFreshDevSession`.

Nothing else in the fspec-005 paths has changed. The table below re-checks fspec-005 in full
against HEAD.

### 1.1 Functional (fspec-005)

| § | Requirement | How | Result |
|---|---|---|---|
| 2 | `?dev=1` / `?dev=0` / saved; read once; parameter kept | R, I | ✓ `devMode.js` logic unchanged except `?dev=0` now also deletes `RECORDER_DB` (fspec-007 §3.3) |
| 2 | Off: no dev UI, nothing downloaded | X | ✓ only `dev/devMode.js` fetched; no dev DOM; no `sudokuDev`; `indexedDB.databases()` empty |
| 2 | On: badge links to panel; heading and note; six collapsed sections | X | ✓ badge name exact; `aria-labelledby="dev-title"`; all six `<details>` closed |
| 3 | No statistics; play unchanged | R, I | ✓ `statsSuppressed` unchanged. Normal-mode changes since v1 are in §5 |
| 4 | Load from string: checking, shared loader, inline outcome, error style, announced, field kept | R, X | ✓ `_wireLoad` unchanged; API `load` exercised |
| 5.1 | Run on current board; step texts; three summaries; announced; read-only | R, X | ✓ "Solved in 60 steps. Hardest rank 11 (Hard)." announced |
| 5.2 | Click selects; Up/Down/Home/End move focus and selection, stop at ends, don't move cursor via `keyboard.js`; Escape clears; cursor to placement / first elimination cell; three highlight roles; announcement | R, X | ✓ ArrowDown → step 2 pressed, focus on it, cursor r7c1, label "… — solver step: placement", "Step 2: … 1 cell highlighted."; End/Home/ArrowUp stops at 0; Escape clears pressed state and highlights |
| 5.3 | Stale on pen/puzzle change, not on pencil or own `DEV_SET_BOARD`; Clear | R, X | ✓ `setPencilMarks` while stepped leaves list intact; a pen entry gives "Board changed — run the solver again." |
| 5.4 | Enter/Space/double-click sets board; step selected; board status announced; steps 1…n marked, n current; not undoable; no win; ends coach | R, X | ✓ "Board set to step 33 of 60."; 33 `data-applied`, `aria-current` on 32; `undoAvailable` false; recorded as `DEV_SET_BOARD` with `pencil` |
| 5.4 | Marks follow solver, fill rule (amended) | R, X | See §2 |
| 5.4 | Restore: board and baseline back; message; disabled until set; focus to selected (else first) step; cursor unchanged | R, X | ✓ board and marks equal the pre-step state exactly; focus on selected step; button disabled after; no step marked |
| 6 | Overlay: computed candidates, four states, unmarked cell all Agree, live, step candidates while stepped, basic after restore/stale, never modifies marks | R, X | ✓ while stepped: 0 Missing, 0 Extra; after replay over a stepped board the overlay stays on with `_appliedCandidates` cleared |
| 7 | Coach data: empty message, JSON, follows session, Copy | R, I | ✓ `_renderCoach` unchanged |
| 8 | Diagnostics: four cases, fields, survives reload | R, X | ✓ table rows present; seed rows lead (fspec-007 §7.1) |
| 9 | Accessibility table | R, X | ✓ see §6 |
| 10 | Edge cases | R, I | ✓ unchanged logic; stalled summary on wrong digits unchanged |
| 11 | Out of scope respected; 2026-11-22 amendment recorded | R | ✓ |

### 1.2 Visual (vspec-005)

| § | Result | How |
|---|---|---|
| 2 Badge | ✓ unchanged rules | I |
| 3 Panel, 3.1 sections, 3.2 load field | ✓ | I |
| 3.3 Step list incl. `data-applied` bar and `aria-current` " ◀ board" | ✓ rules present (`dev.css` 183–188) | R |
| 3.4 Highlight rings, 3.5 overlay marks, legend, switch | ✓ underline / line-through present | R |
| 3.6 JSON, 3.7 diagnostics table | ✓ | I |
| 4 Responsive | ✓ 1500 px: beside, 480 px, `sticky`; 1000 px: under, 860 px; 390 px: 366 px; no horizontal scroll at any width | X |

### 1.3 Architecture (aspec-dev-mode)

| § | Item | Result |
|---|---|---|
| 1–2 | Three layers; files touched; `index.html` untouched | ✓ R |
| 3 | `devMode.js` API; additions documented in aspec-debug-instrumentation | ✓ R |
| 4 | Lazy import only behind the flag | ✓ R, X (arch tests passed) |
| 5 | Grid decorator seam; `data-keep-selection` honoured by the outside-click handler | ✓ R |
| 6 | `inspect.js` signatures incl. `pencilAtStep(basePencil, baseBoard, steps, upTo)` | ✓ R |
| 7 | Wiring table, incl. the amended `pencilAtStep(_basePencil, _base, steps, n)` call | ✓ R (`devPanel.js:379`) |
| 8 | Generation `gen` fields | ✓ I, plus `seed` / `seedBy` per aspec-debug-instrumentation §9 |
| 9–11 | Tests, sequence, decisions | ✓ R |

## 2. Inspector Fill Amendment (`fff6319`)

review-inspector-fill-v1 signed off on this change. The code it reviewed is unchanged at HEAD.

| Requirement | How | Result |
|---|---|---|
| Unmarked baseline cell still empty at step n → solver candidates after step n | R, X | ✓ at step 33 of HARD on an unmarked board, no empty cell is unmarked and every elimination of step 33 is absent from its cell's marks |
| Marked cell trimmed to nothing stays empty; filled cells unmarked | X | ✓ IN14h (passing; uses an explicit precondition, no conditional guard: O4 addressed) |
| Overlay agrees with the filled marks while stepped | X | ✓ 0 Missing, 0 Extra |
| Restore returns the exact baseline | X | ✓ |
| `fishDigit` rename; `step.digit === null` on eliminations | X | ✓ L10b, IN14i, finned-fish tests pass |
| Prior observations O1–O5 | R | ✓ O1: `analyzer.test.js:533,556` pin `digits[0]`; O3: `_applyStep` JSDoc updated (one doc line remains, N5); O4: precondition asserted; O5: L10b in tspec-001 |

## 3. Debug Instrumentation (fspec-007, vspec-007, aspec-debug-instrumentation)

The v1 review found everything matching except B1, which D-36 withdrew. Since then, the
code that changed in `js/` is:

- the disposition fixes, folded into `09dee45`;
- `replay.js` (2.1, `e7fe359`);
- `clientGenProvider.js`, `foreground.js` and `state.js` (1.1–1.3, `35c25e5`).

I relied on the v1 tables for everything else, and spot-checked it by running.

### 3.1 Disposition fixes

| Item | Spec | How | Result |
|---|---|---|---|
| K1 | D-35 e: no panel control records a deselect | R, X | ✓ `devPanel.js:120` sets `data-keep-selection` on `#dev-root`; `grid.js:114` honours any ancestor. Clicked all six summaries, every text field, the select, a switch twice, Copy session, the heading: **0 actions recorded**. Clear history → click the replay field → paste → click Stop after → Replay on a board without progress: **no dialog**, replay proceeds (fspec §12 row holds). The DEV badge sits outside the panel: N1 |
| K2 | D-35 f: thousands separators on counts | R, X | ✓ one `count()` (`replay.js:141`); "1,204 actions, 0 errors recorded."; Clear dialog "The recorded history (1,204 actions, 0 errors) will be discarded. …"; replay dialog, status "Session replayed: 1,204 of 1,204 actions. …", report scope; API `needs-replace` and `needs-discard-history` messages all separated. Seeds and positions plain. See N6 for the diagnostics table |
| M1 | D-35 d: a storage message in force at mount is announced once | R, X | ✓ `recorderPanel.js:163–164`. Corrupt saved history (`form: 99`) + reload: line reads "The saved history couldn't be read and was discarded." and it is announced once |
| M4 | Worker failure logged once | R, X | ✓ provider emits `failed` for `GEN_ERROR` / `onerror`; `foreground.js:177` emits only when `delivered` |
| M5 | A checking exception is logged as swallowed | R, X | ✓ `prepare` returns `error`; `devSession.js:408` emits `swallowed` at `replay.prepare`. The aspec does not list the site: N3 |
| B1 → D-36 | Focus rule narrowed | R, X | ✓ code unchanged (as decided); an API `generate` with focus on Replay leaves focus there |

### 3.2 Aspec tidy-up (M3, M6, M7, S3–S7)

| Item | Result |
|---|---|
| M6 / S5 residual cost | ✓ §3 item 3 now lists the off-path statements |
| M7 report fields | ✓ §5.7 `technique?`, `cell?` |
| S3 `fillPencilMarks` | ✓ §11.2 counts after dispatch; not announced at 0 |
| S4 `roles.fin` | ✓ §8.2 |
| S6 recorder API, `boot` storage default | ✓ §6.1 |
| S7 superseded dialog closed explicitly | ✓ §11.3 |
| §2.3 import table | ✓ rebuilt; matches the imports I read in `devPanel.js`, `recorderPanel.js`, `replay.js` |
| §12.1 panel-root `data-keep-selection` | ✓ |
| §16.3 browser figures | ✓ |
| M3 hint divergence with several parts in one list item | **Not recorded** in the aspec; the open-items list omits it too. N3 |

### 3.3 Spec checklist at HEAD

| Area | How | Result |
|---|---|---|
| fspec §2 availability, dev-off | X | ✓ (§1.1) |
| §3 recorder, §3.6 counts, capacity | X, I | ✓ |
| §4.2 copy flow failure path | X | ✓ field shown, focused, whole content selected (4,508 of 4,508); error-styled message; keys in it leave the board alone |
| §5 replay: no-dialog path, both-body dialog, Cancel focused, declined message, focus stays on Replay, report kept on decline | X | ✓ |
| §5.7 inspector state dropped by a replay | X | ✓ list emptied, stale summary, board status cleared, Restore disabled, overlay stays on |
| §5.9 stopped message, position plain (2.1) | X | ✓ `replay.test.js` "action 1234 of 5,000" passes |
| §6 API: focus kept, announcements, `setLogging` follows to `aria-checked` | X | ✓ |
| §7.1 seed rows, Copy seed failure styled and announced | X | ✓ |
| §7.2 Generate: invalid seed (error, `aria-invalid`, `aria-describedby` → status, announced); confirm body "Your current progress will be lost.", Cancel focused; decline message; success "Generated from seed 12345: Medium puzzle."; focus returns to Generate; diagnostics show "Developer (seeded run)" | X | ✓ |
| §8 switches by keyboard (Space, Enter), announced | X | ✓ "Generation worker logging off." |
| §8.1 swallowed sites incl. `pregen.load` at boot (1.1) | X | ✓ DBG-L3 passes |
| §10.1.1 Clear confirmation: title, body, Cancel focused, decline / confirm messages announced, focus returns to Clear history | X | ✓ |
| §11 accessibility | X | ✓ see §6 |
| vspec-007 | I, X | ✓ `css/dev.css` unchanged since `09dee45`; responsive re-checked (§1.2) |
| aspec §9.4, §10.2 (1.2 changes) | R | ✓ `chooseTier` sets `_preferred` before writing; `accept()` swallows at `foreground.chooseTier`; a throwing `openDialog` → log, `failed`, outcome `failed` |
| aspec §9 pre-generation row (1.1) | R | ✓ `ensureLoaded()` on every public method and in `onmessage` |
| aspec-coach-ui §5.4 (1.3) | R | ✓ `state.js:226` matches the amended formula |

## 4. Open Items

| Item | Claimed | Verified | Pinned by |
|---|---|---|---|
| 1.1 corrupt pre-gen entry at boot logged | Lazy read on first use | R, X | DBG-L3 (`debug.test.js:1083`, now `it`, passing); SW1 still passes |
| 1.2 busy state on throwing preference write / dialog | Degrade; `failed` on dialog throw | R, X | `foreground.test.js` "the preference write throws", "the fallback dialog throws", "an onOutcome that throws after delivery" (all passing) |
| 1.3 mark left on a filled cell after coach | `snapshot = pen[i] === 0 ? … : 0` | R, X | `session.test.js` "Example E"; `devSession.test.js` D-34 updated; golden trace re-captured. Of the old trace's 638 records, 29 differ, starting at record 329 (`COACH_END fill-coached-elim`). Every difference is one cell (index 1, holding 3) whose restored mark 4 is now 0, carried into later `pencil`, `coachSession` and `undoSnapshot` copies. Nothing else differs |
| 2.1 stop position plain | `at` unformatted | R, X | `replay.test.js` new case |
| 2.2 aspec trails code | Rewritten | R | §3.2 above; residue in N3 |
| 2.3 dev-mode-workflows stale | Rewritten | R | One leftover phrase: N5 |
| 2.4 role files | Opus; general-purpose | R | `docs/agents/reviewer.md` matches |
| 3.1 branch coverage 96.98% | Open | — | Not blocking for this sign-off: the shortfall is in lines that predate the feature. I checked the lines named for `events.js`, `dialog.js`, `srLive.js`, `main.js` and `state.js` with `git blame`. The `clientGenProvider` `err.message \|\| 'Worker error'` branch moved in `09dee45` but existed before it. **However**, rspec-007 R15 and CLAUDE.md exit criterion 2 both require 100%. The iteration cannot close on this criterion unless the Product Director waives or schedules it. `coverage/lcov.info` predates `35c25e5` (it still shows `foreground.js:162` uncovered), so I could not confirm the HEAD figure |
| 4.2 stale modules after deploy | Backlog, no code | R | Not blocking: deploy-time configuration, no spec requirement |
| 4.4 pre-gen cache refills only at boot | Backlog | R | Not blocking: CLAUDE.md exempts cold generation from the 1 s target (2026-11-21) |

## 5. Normal-Mode Changes Since the v1 Review

These changes reach players, and both were approved by the Product Director:

- **1.3:** when a coach session ends, a cell the player has filled no longer gets its
  pre-session marks back.
- **1.1:** the pre-generation cache is read from localStorage on the provider's first use
  instead of at module evaluation. No observable difference.

The golden-trace delta (§4) is confined to the 1.3 case. The attempt-budget increase
(`3b4a279`) is outside these specs and was recorded as a Product Director decision.

## 6. Accessibility (hard requirement)

| Check | How | Result |
|---|---|---|
| Every panel `input` / `textarea` / `select` has a `label[for]` | X | ✓ none missing |
| Every panel button has an accessible name | X | ✓ |
| Switches: `role="switch"` + `aria-checked`, four of them | X | ✓; follow API changes |
| Step list: buttons with `aria-pressed`; `aria-current="step"` on the board's step | X | ✓ |
| Status lines are `role="status"` (8 regions) | X | ✓ |
| Tab order through the open panel | X | ✓ document order, disabled controls skipped, no trap: six summaries, Load field and button, Run, Clear, overlay switch, Coach JSON, Copy seed, Tier, Seed, Generate, Copy session, Clear history, three switches, replay field, Stop after, Replay, every step |
| Keyboard operation | X | ✓ step-list keys, Space/Enter on switches, Escape and focus return on every dialog. Playwright keys are trusted, which closes the gap noted in open item 3.3 |
| Focus-visible rules | R | ✓ badge, panel, summaries, step buttons, switches, JSON, report, report summaries; `.btn` and fields via `controls.css` / `dev.css` `:focus` |
| Text-field key isolation | X | ✓ digits, arrows and Backspace in the load, replay, stop and seed fields leave the board and selection unchanged |
| Announcements | X | ✓ one per outcome as specified; the load-time storage message announced once (M1) |
| Real screen reader | — | not run |

## 7. Blockers

None.

## 8. Non-Blocking Findings

| # | Finding |
|---|---|
| N1 | **The DEV badge deselects the board and records a `DESELECT`.** The badge is appended to `<body>`, outside `#dev-root`, so the outside-click handler fires. Keyboard activation of the skip link fires `click` too. D-35 e covers "every control in the developer panel"; the badge is not literally in it, but its purpose is the same. Confirmed by running: after Clear history, one badge click records one action, so a following Replay asks. Fix: add `data-keep-selection` to the badge (`devPanel.js:113`) |
| N2 | **Digit keys on the Tier `<select>` reach the board.** With a cell selected, pressing 7 on `#dev-gen-tier` enters a digit (and records it). fspec-007 §11 guards text fields only, so this is per spec. It is the 2026-11-13 observation 4, now extended to a dev control |
| N3 | **Aspec still trails the code in five places:** (a) §10.2 has no `replay.prepare` row (the M5 fix); (b) the §12 wiring says the storage line is announced "when it changes", but D-35 d also announces at mount; (c) the §10.1 `failed` row says "`foreground.js` catch" without the "after delivery only" qualifier from M4; (d) M3 is not recorded anywhere: a hint divergence with several differing parts is one `<li>` holding one sentence per part; (e) §12 says counts use `toLocaleString('en-US')`, but `count()` uses a regex, with identical output |
| N4 | **Spec statuses.** fspec-007 is still marked **Draft** and tspec-debug-instrumentation **Draft**, although both are implemented and amended through D-36. Housekeeping before merge |
| N5 | **One stale line in the workflows doc.** `dev-mode-workflows.md` line 33 still says set-board-to-step "trims your pencil marks". Line 556 and §3.3 describe the fill correctly |
| N6 | **Diagnostics table counts have no separator.** "Attempts *N* of *budget*" and the rejection counts are unseparated. D-35 f lists counts line, dialogs, status lines, announcements and API messages, not the table. This is only reachable at 1,000 or more through the API `budget` |
| N7 | **Branch coverage (open item 3.1) is the one unmet iteration exit criterion I can see.** It is not a spec-fidelity blocker, but rspec-007 R15 and CLAUDE.md both require 100%; it needs an explicit waiver or a scheduled coverage pass |

## 9. Not Checked

- The full automated suite and the HEAD coverage figure (by instruction).
- A real screen reader. Focus-ring rendering beyond rule presence.
- The five themes at HEAD: not re-run, because `css/dev.css` is unchanged since the v1 pass.
- The store's failure paths (write failure, `VersionError`, a second-tab `onversionchange`):
  read in v1, unchanged since.
- The honest-fallback and Unrated dialogs through the real UI (fake-provider tests only).
- The devdrive script beyond its imports. It is tooling outside fspec-007 §13 and adds no
  dependency.

## 10. Verdict

**Sign-off.** At `35c25e5`, the implementation matches fspec-005 (with the 2026-11-22 fill
amendment), vspec-005 and aspec-dev-mode, and fspec-007 (D-1 to D-36), vspec-007 and
aspec-debug-instrumentation. All five scheduled fixes (K1, K2, M1, M4, M5) are made and
behave as D-35 d–f require. Open-item defects 1.1–1.3 and items 2.1–2.4 are resolved as
described, and each code fix is pinned by a passing test.

The findings in §8 are non-blocking. N1 is a one-attribute fix worth making before merge.
N7 needs a Product Director decision before the iteration closes.

## 11. Orchestrator Disposition — 2026-11-27

| # | Disposition |
|---|---|
| N1 | Fixed after this review: `data-keep-selection` on the badge, with unit and integration tests; fspec D-35 e names the badge. Accepted by the Orchestrator without re-review |
| N2 | Left: per fspec-007 §11 |
| N3 | Fixed in aspec-debug-instrumentation |
| N4 | fspec-007 and tspec-debug-instrumentation marked Final |
| N5 | Fixed in `dev-mode-workflows.md` |
| N6 | Left: outside D-35 f's scope, reachable only through the API `budget` |
| N7 | Waived for V4 by the Product Director; scheduled post-V4 (open item 3.1) |

Full suite with these changes: 2757 passing, 0 failing, 10 pending; 97.01% branch.
Product Director UX sign-off at this milestone: given 2026-11-27. The iteration is closed.
