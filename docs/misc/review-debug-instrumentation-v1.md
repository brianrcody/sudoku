# Review Report — Debug Instrumentation (v1)
**Date:** 2026-11-16
**Reviewer:** Reviewer (Review stage)
**Specs:** fspec-007-debug-instrumentation (with rspec-007 for intent),
vspec-007-debug-instrumentation, aspec-debug-instrumentation (Final, amended 2026-11-15);
context: fspec-005, fspec-006, fspec-003 §5.4
**Implementation reviewed:** working tree over `a4defe6`, Phases 1, 1B, 2–7. Phase 8 is
not done and its absence is not held against the implementation.
**Verdict:** **1 blocker** (§5). No sign-off until it is resolved. Seven minor findings
(§6) and eight spec inconsistencies (§7) are non-blocking.

Verification method: every changed always-loaded file read as a diff against `a4defe6`;
every new `js/dev/` module, `js/game/foreground.js`, `js/tests/helpers/replayFixture.js`
and the `css/dev.css` diff read in full against the three specs; then scripted headless
Chromium passes against a private static server (port 8765) covering the dev-off
guarantee, recording, export, the whole `window.sudokuDev` surface, panel replay / clear /
copy / generate flows, reload, two tabs, `?dev=0`, a discarded saved history, error
capture, a 5,600-action random drive at recorder capacity replayed against itself, and
computed styles in five themes at 1500 / 1000 / 390 px. `generateForTier` was run in Node
for the pinned seeds. The automated suite was not run (by instruction). Read-only: no file
other than this report was modified.

Legend for the coverage tables: **R** verified by reading, **X** verified by running,
**I** inferred (read, depends on code outside the diff that I did not re-read),
**—** not checked.

---

## 1. Functional Spec Fidelity (fspec-007)

| § | Requirement | How | Result |
|---|---|---|---|
| 1 | Terminology; "Counts in wording" singular rule | R, X | ✓ one `count()` helper; "1 action", "1 of 1 action", "the 1 computed result matches" seen in output. Thousands separator: known K2 |
| 2 | Dev off: nothing loads, records, logs; no API; no database | R, X | ✓ only `js/dev/devMode.js` requested; `'sudokuDev' in window` false; `indexedDB.databases()` empty; no dev DOM |
| 2 | Dev on: sixth tool, seed controls, recording and API from load | X | ✓ |
| 2 | Under 1 s with all logging on at capacity | X (incidental) | ✓ 5,600 actions incl. 286 coach analyses in 4.9 s at capacity. Formal perf test is Phase 8 |
| 3.1 | One entry per issued action; consequences and follow-ups folded in; data carried; hints carry result; ignored actions marked; time-driven actions | R, X | ✓ `CHANGE_DIFFICULTY` is one entry with `then: [SET_GENERATING]`; ignored actions carry `noChange`; `HINT` carries `{cellIndex, digit, technique}`; the check-highlight timer uses public dispatch |
| 3.1 | Malformed console action: not recorded, one "Unrecordable action: *kind*" error entry | X | ✓ |
| 3.1 | Not-recorded list | R, X | ✓ for the things themselves; see K1 for the `DESELECT` side effect of panel clicks |
| 3.2 | Starting position, capacity 5,000, start advances, errors count, renumbering | R, X | ✓ history capped at 5,000, start advanced 600 times, replay of the export reproduced `state()` exactly |
| 3.3 | Lifetime: reload entry, Clear, Replay, `?dev=0`, `?dev=1` fresh, `?dev=1` left in URL | X | ✓ all six rows |
| 3.4 | Storage: save after every entry; unavailable; failing and retry; unreadable → discarded; precedence | R; discarded X | ✓ (`form: 99` pre-seeded: discarded, message shown until next load, logged under `[dev:swallowed]`). Failing / unavailable / timeout / `VersionError` by reading only. See M1 |
| 3.5 | Two tabs: later tab owns; loser learns at next entry, message announced once; no interleaving | X | ✓ |
| 3.6 | Counts line and capacity sentence | X | ✓ "5,000 actions, 0 errors recorded." + "At capacity (5,000): the oldest entries are being discarded." |
| 4.1 | Document content, cell indexing, marks ascending, no trace, nothing outside the game | R, X | ✓ |
| 4.2 | Copy flow, fallback field, shared history status line | X | ✓ failure path (headless clipboard denied): message, error style, field focused, all selected, `scrollTop` 0; removed when a replay proceeds; kept on a declined replay |
| 5.1 | Fields, hint, trimming, no keystroke filter | R, X | ✓ " 1 " accepted, "1x" rejected |
| 5.2 | Procedure, "Checking session…", "Comparing with current code…" | R, X | ✓ |
| 5.3 | Nine rejections, order, details, D-33 full stop | X | ✓ every row reproduced character for character, including the five puzzle details and the unknown version |
| 5.4 | Three dialog bodies, title, buttons, Cancel focus, declined message, supersession | X | ✓ both-, history-only bodies seen; progress-only by reading |
| 5.5 | Verbatim application on a headless machine; no generation, preference, statistics, dialogs | R, X | ✓ tampered coach step and hint digit were applied as recorded |
| 5.6 | Final position incl. coach session and win; busy cleared; saved like any game; history replaced without re-recording; focus stays on Replay | X | ✓ re-export after replay equals the document; saved game written / removed on a won board; panel focus stays on Replay. API focus: **B1** |
| 5.7 | Coach, generation, dialogs, inspector, overlay, coach data, diagnostics | R, X | ✓ inspector cleared with the stale summary and Restore disabled; coach data shows the recorded step. Overlay by reading |
| 5.8 | Scope line and notes; four summaries; divergence lines; expandable JSON; Not compared; Errors with ×count | R, X | ✓ |
| 5.9 | Outcome messages and error styling | R, X | ✓ stopped outcome by reading only (unreachable from a document) |
| 6.1 | Results, same rules, intent flags exactly `true`, cells, recording, announcements, no focus move, busy | R, X | ✓ except **B1**; see S1, S2 |
| 6.2 | `state()` fields and `text` | X | ✓ |
| 6.3 | `load` | X | ✓ four rows |
| 6.4 | `inspect` | X | ✓ |
| 6.5 | `coachStep` | X | ✓ |
| 6.6 | `candidates` | X | ✓ |
| 6.7 | `setPencilMarks`, `fillPencilMarks`, six failures in order, announce-on-change | R, X | ✓ |
| 6.8 | `exportSession`, `replay`, `missing`, `busy`, report object | X | ✓ all three `missing` rows; `busy` while a panel replay awaits confirmation |
| 6.9 | `generate` rows, order tier → seed → budget, diagnostics, `budget` | X | ✓ incl. Unrated and `needs-accept-fallback` through the real worker |
| 6.10 | `clearHistory` | X | ✓ |
| 6.11 | `logging`, `setLogging`, no coercion, switch follows | X | ✓ |
| 7.1 | Seed rows, Copy seed, "Not recorded" / "—" | R, X | ✓ |
| 7.2 | Generate from seed: validation, confirm, status, focus, replaced / cancelled / failed | R, X | ✓ validation, dialog, decline, success via the panel; replaced / cancelled / failed by reading |
| 7.3 | Budget exhaustion; honest-fallback dialog | R, X (API) | ✓ the panel dialog path by reading (`foreground.js`) |
| 7.4 | Reproducibility | X | ✓ same givens twice in the app; `generateForTier` deep-equal random vs seeded except `seedBy` for four pins |
| 7.5 | Unrated fallback in every mode | R, X | ✓ pipeline, provider discard, dialog and announcement wording, preference untouched. Normal-mode UI path by reading |
| 8.1 | Three categories, tags, defaults, generation events | R, X | ✓ see M4, M5 |
| 8.2 | Switches: immediate, persisted, announced | R, X | ✓ |
| 8.3 | Error capture: three kinds, order, no interference, collapse, no recursion | R, X | ✓ |
| 9.1–9.2 | Fixture helper contract; format compatibility | R | ✓ helper matches aspec §13. Baseline fixture content: known K3 |
| 10 | Panel summary, Clear history confirmation | X | ✓ |
| 11 | Accessibility table | R, X | ✓ every row checked against the built DOM; see M1 |
| 12 | Edge cases | R, part X | ✓ those exercised: stop 0, no-puzzle start, replay after reload, won board, superseded panel replay, `clearHistory()` empty, `setLogging` variants |
| 13 | Out of scope respected | R | ✓ no `?seed=`, no file picker |
| 14 | D-1 … D-34 | R | ✓ D-23 to D-34 each traced to code |

## 2. Visual Design Spec Fidelity (vspec-007)

| § | Result | How |
|---|---|---|
| 2 Tool order | ✓ sixth tool, collapsed | X |
| 3.1–3.8 Group, field, input / textarea, inline row, select, danger and end buttons, small button, callout | ✓ every declared value matches computed style | X (5 themes) |
| 4.1 Order and grouping: History, Console logging, Replay | ✓ | R, X |
| 4.2–4.3 Counts line, switches and tags | ✓ | X |
| 4.4 Report container, parts, lists, bars, divergence item, compare blocks | ✓ 340px stacked, 45vh side by side | X |
| 5.1–5.3 Diagnostics body order, seed rows, Generate group, `15ch` seed field | ✓ | X |
| 6 Dialogs unchanged; `aria-describedby="modal-body"` | ✓ | R, X |
| 7 Focus indicators | ✓ rules present | R |
| 8 Responsive: no new breakpoints, no horizontal scroll at 390px, Clear history at the row end | ✓ | X |
| 9 Theme overrides: Terminal radius list, select border and arrows per theme, small button font | ✓ | X |
| 10 Implementation notes (`[hidden]`, status lines permanent, input types) | ✓ | R |
| 11.1 Nothing mockup-only implemented | ✓ no `mock-*`, `dev-new-focus`, `#m-*` | R |

## 3. Architectural Plan Fidelity (aspec-debug-instrumentation)

| § | Item | Result |
|---|---|---|
| 1 | Five ideas: tap, headless machine, results on the action, IndexedDB per entry, one diagnostics channel | ✓ R |
| 2.1–2.2 | File list; `index.html` untouched; overview tree updated | ✓ R |
| 2.3 | Import rules | ✓ with the known additions (§8, K4), all acceptable; no other violation |
| 3 | Dev-off guarantee; two guarded dynamic imports; residual cost | ✓ R, X; see M6 |
| 4.1–4.4 | Seams in `events`, `state`, `main`, loader, providers, `srLive`, `dialog`, `coach`, `devMode` | ✓ R, as specified |
| 5.1–5.5 | Document form, internal position, entries, format v1 schema, upgraders | ✓ R, X; see S4 |
| 5.6 | Stored form, logging key | ✓ R |
| 5.7 | Report object | ✓ plus two additive fields (M7) |
| 6 | Recorder: tap table, fingerprint, capacity, boot merge, operations | ✓ R, X; see S6 |
| 7 | Store: incremental coalesced writes, recovery, precedence, ownership | ✓ R; ownership and discard X |
| 8 | Machine, kinds table (32 reducer cases + `PAGE_RELOADED`), `prepare` / `run` / `compare`, messages | ✓ R, X |
| 9.1–9.3 | Seed plumbing, cache bypass, determinism | ✓ R, X |
| 9.4 | `foreground.js` extraction | ✓ R, statement by statement against the removed `main.js` code |
| 9.5 | Unrated fallback in three places | ✓ R, X (pins 223 / 307) |
| 10 | Logging events, thirteen swallowed sites, error capture layers | ✓ R |
| 11 | Controller, operations, replay phases, generate flow, API wrapper | ✓ R, X except **B1** |
| 12 | Panel markup, wiring, CSS list, async `mount` | ✓ R, X |
| 13 | `replayFixture`, `loadSessionFixture` | ✓ R |
| 14.4 | Arch tests AR-D1 … AR-D6 exist | ✓ R (not run) |
| 14.6 | Test seams with production defaults | ✓ R |
| 15 | Phases 1–7 complete; 8 open | ✓ |
| 14.1–14.3, 14.5 | Test plan, coverage, performance | — out of scope (QE) |

## 4. The Two Guarantees

**Dev-off.** With the flag off the only new statements on a normal-mode path are those of
aspec §3 plus a handful of equally trivial ones (M6). No always-loaded file imports a
`js/dev/` module other than `devMode.js`; both dynamic imports sit behind `devMode`.
`devMode.js` touches `indexedDB` only on `?dev=0`, and deleting an absent database creates
none (confirmed).

**Normal-mode behaviour.** Changes a player could experience, exhaustively:

| Change | Authorised by |
|---|---|
| An unsolvable fallback puzzle is Unrated (dialog body, "Play Unrated", announcement, no cache entry, preference kept) | fspec §7.5, rspec R16 |
| Generated puzzles carry `gen.seed`, `gen.seedBy` (saved game, pre-generation cache) | fspec §7.1 |
| Every confirmation dialog now has `aria-describedby="modal-body"`, so screen readers read the body on open in normal mode too (New Puzzle, Reset, load, fallback) | vspec §6, aspec §4.4. Not one of the two changes the brief lists; flagged so the Orchestrator knows it ships to players |

Nothing else changes. Checked and found neutral: `AbortController.abort()` now passes a
string reason (the provider still rejects with its own `AbortError`); New Puzzle announces
before clearing the saved game instead of after; the honest-fallback dialog gains an
`onCancel` nobody observes; the console text of a generation failure is unchanged.

## 5. Blockers

### B1 — An API replay that ends on a won board moves keyboard focus

- **Spec:** fspec §6.1 ("API calls never move keyboard focus"), §11 last list; aspec
  §11.3 step 7 ("keeps focus on Replay (panel) or wherever it was (API)").
- **Requires:** no API call moves focus.
- **Does instead:** `commit()` in `js/dev/devSession.js` (lines 391–395) remembers
  `document.activeElement` and, a frame later, calls `focused.focus()` if focus has moved.
  When nothing is focused the remembered element is `<body>`, and `body.focus()` is a
  no-op, so the win banner's deferred focus move to **New Puzzle** stands. An agent
  driving the page through `evaluate`, or a developer in the console after a reload, is
  in exactly that state.
- **Confirmed:** headless run — blur, `sudokuDev.replay(doc, { replace: true,
  discardHistory: true })` with a document ending in a win; afterwards
  `document.activeElement` is `BUTTON#btn-new`. The same replay from the panel keeps
  focus on Replay, as specified.
- **Suggested fix:** when the remembered element is `document.body` (or is no longer
  connected), blur the element that took focus instead of calling `focus()` on the
  remembered one.

## 6. Minor Findings

| # | Finding |
|---|---|
| M1 | A storage-line message already in force when the panel mounts ("couldn't be read and was discarded", "not being saved" at page load) is shown but never announced: `recorderPanel.js` line 164 sets the text, and the status changed before the panel subscribed. fspec §11 says each message is announced once when it appears; §3.4 says "announced" only for the run-time rows, so the load-time case is arguably unspecified. Confirmed for `discarded` |
| M2 | An API `replay` that fails for a missing intent flag writes "Session not replayed. Your game and recorded history are unchanged." to the panel's replay status line (`devSession.js` line 438), unannounced. fspec D-34 specifies the status line only for a rejection. Something has to replace "Checking session…", so the choice is reasonable |
| M3 | A hint divergence with several differing parts is one list item holding one full sentence per part (`replay.js` `divergenceText`). fspec §5.8 can be read as one item per divergence or one line per part |
| M4 | A worker failure logs `[dev:gen] failed` twice: once from `clientGenProvider.js` (`GEN_ERROR` / `onerror`) and once from `foreground.js`. aspec §10.1 lists both sites |
| M5 | `replay.js` `prepare` turns any exception during checking into "The session couldn't be checked." without a `swallowed` event, so the underlying error is invisible in the console. fspec §8.1 names puzzle checking among the swallowed sites; aspec §10.2 does not list this one, and the §2.3 import rule gives `replay.js` no access to `diagnostics` |
| M6 | aspec §3 calls its dev-off residual-cost list exhaustive. Also present, all negligible and none on the per-action path beyond what §3 lists: the `timers` indirection in `state.js` (specified in §4.2), `confirmOnce ?? confirm` per load, one `CHECK_REQUEST` / `CHECK_RESULT` type comparison per worker message / load result, the `seeded` and `elapsedMs` envelope fields, the fallback-policy and `onOutcome` calls per foreground generation, and an Unrated comparison per background result |
| M7 | Report divergences carry two fields beyond aspec §5.7 and fspec §6.8: `technique` (coach) and `cell` (hint), used to build the report line. Additive |

## 7. Spec Inconsistencies (code is defensible)

| # | Disagreement | Code follows |
|---|---|---|
| S1 | fspec §6.1 / D-34: API failures other than a rejected replay are not announced. fspec §6.9, §7.2 and aspec §11.4: every outcome of a generation run that started is announced once, from either caller. `needs-accept-fallback`, `cancelled` and `failed` are failures of a run that started | §6.9 / aspec §11.4: they are announced (confirmed for `needs-accept-fallback`) |
| S2 | fspec §6.1: a failure leaves the history untouched. fspec §3.1: generation started and progress are actions. A `generate` that ends in `needs-accept-fallback`, `cancelled` or `failed` has already recorded its `SET_GENERATING` / `GEN_PROGRESS` entries | §3.1 |
| S3 | aspec §11.2: `fillPencilMarks` counts cells before the dispatch and always announces. fspec §6.7 / D-34: counts the difference after the call and does not announce when nothing changed | fspec |
| S4 | aspec §8.2 lists the coach-step role arrays a document must have as `cause`, `elimTarget`, `unitMember`, `scA`, `scB`. `sessionCodec.js` also requires `roles.fin`, because `grid.js` reads it. Every step the analyzer produces has it; a hand-written document without it is rejected as "its data is incomplete or invalid" | Stricter than the aspec |
| S5 | aspec §3 "exhaustively" against aspec §4.2 / §4.4, which add further always-loaded statements (M6) | §4 |
| S6 | aspec §6.1 gives `createRecorder({ store, log, capacity, now, clock })`; the implementation also takes a required `opened` promise and returns `snapshot` and `storageChanged` for the store. aspec §6.5 gives `boot` a `storage` default of `{ getItem, setItem }`; the code leaves it undefined and lets `devLog` default it, because §2.3 does not let `devBoot.js` import `persist/storage.js` | The implementation; behaviour is as specified |
| S7 | aspec §11.3 says a superseded replay's dialog "is replaced" by the newer one. The newer replay may open none, so the controller closes it explicitly, which needs `ui/dialog.js` (not in §2.3) | Explicit close; fspec §5.4 is met |
| S8 | fspec §12 "Replay immediately after Clear history, on a board without progress: no dialog" holds only if nothing is clicked in between; fspec §3.1 / OQ-1 records every issued action, and the grid issues a `DESELECT` on any outside click (see K1) | §3.1 |

## 8. Known Items (not rediscovered; scheduled for Phase 8)

| # | Item | Note |
|---|---|---|
| K1 | Copy session, the logging switches, Copy seed and Generate deselect the board and record a `DESELECT` | Wider than listed: **every** click in the panel outside Clear history, Replay and the inspector list records one — section summaries, the replay textarea, the stop and seed fields (confirmed). Clear history → click the textarea to paste → Replay therefore asks about "1 action". A panel-wide opt-out would cover it; per-button attributes will not |
| K2 | Thousands separator in the counts line but not in dialog bodies and messages | Confirmed: "5,000 actions" in the tool, "Replayed 5000 of 5000 actions." in the report |
| K3 | `format-v1-baseline.json` narrower than intended | Not examined |
| K4 | Imports missing from aspec §2.3 | All acceptable. `devSession.js` → `devLog.js` (`CATEGORIES`, required by §11.2), `machine.js` (the `makeMachine = createMachine` default is in §11.1's own signature), `solver/logical.js` (`tierForRank`, named in §11.2), `generator/rater.js` (the `getTrace` argument of `generationDiagnostics`, §11.4), `ui/dialog.js` (S7). `recorderPanel.js` → `replay.js` (`formatReportLines` and `count`, both named in §12.1). `devPanel.js` → `config.js` (tier options). No other import breaks §2.3; the table should be amended |
| K5 | Four uncovered pre-existing branches in `main.js` | Not examined |
| K6 | Load-from-string calls the loader directly | Consequence: it is not refused with `busy` during a replay commit; unreachable in practice because the commit is synchronous |

## 9. Not Checked

- The automated suite and coverage (not run, by instruction); the arch tests were read,
  not executed.
- Store paths verified by reading only: write failure and recovery, storage unavailable
  at load, open timeout, `VersionError`, `onversionchange` from a real `?dev=0` in a
  second tab while the first stays open.
- The "stopped" replay outcome end to end (unreachable from a valid document; read only).
- The honest-fallback and Unrated dialogs through the UI, and the Unrated fallback in a
  dev-off session (read in `foreground.js`; the pipeline and the API path were run).
- The busy card's Cancel and New Puzzle over a running seeded run (read only).
- Recap-timer restart and check-highlight rescheduling after a replay (read only).
- Capacity trimming when the oldest entry is an error, and error collapse at capacity
  (read only).
- Screen-reader behaviour with a real assistive technology; focus-ring rendering.
- `state.js` outside its diff, and the three session fixtures' contents.
- fspec §12 rows not listed in §1 above were checked by reading only.

## 10. Verdict

**Not signed off: 1 blocker (B1).** Everything else in fspec-007, vspec-007 and
aspec-debug-instrumentation that was checked matches. B1 is a small, local fix in
`devSession.js`; once it is fixed and pinned by a test, the implementation can be signed
off without a second full pass.

---

## Orchestrator Disposition (2026-11-16)

Added by the Orchestrator after the review; the Reviewer's findings above are unchanged.

- **B1 is withdrawn as a blocker by Product Director decision** (fspec-007 D-36). The rule
  "API calls never move keyboard focus" is narrowed to its purpose: an API call never takes
  focus away from the element that has it. When nothing is focused, the win banner's normal
  move to New Puzzle stands. The code already behaves this way, so no change is made.
- **K1 (deselect on panel clicks)** is resolved in the spec as a panel-wide rule (D-35 e)
  and scheduled as a code fix, together with K2 (thousands separators, D-35 f), M1
  (load-time storage message announced once, D-35 d), M4 (worker failure logged once) and
  M5 (a checking exception is logged as swallowed).
- **S1, S2, M2** are resolved in the spec (D-35 a–c); the code is unchanged.
- **M3, M6, M7, S3–S7** are places where the aspec text trails the code; they go to an
  aspec tidy-up and need no code change.

With B1 withdrawn there are no open blockers. Sign-off is subject to the scheduled fixes
above being made and checked.

