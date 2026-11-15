# Test Strategy — Puzzle Loading and Sharing
**Date:** 2026-11-13
**Status:** Final — implemented; see `docs/misc/test-summary-devmode-sharing.md`
**Author:** Uber Developer (QE Strategist stage)
**Inputs:** aspec-puzzle-sharing, fspec-006-puzzle-sharing, vspec-006-puzzle-sharing

---

## 1. Approach

The feature was built so that almost all of its logic is reachable without the app:
the codec and `loadFromGivens` are pure, and `puzzleLoader`, `loadProvider`, `share`, and
`notice` take their collaborators by injection. Unit tests therefore carry branch coverage
on their own for every new module.

Integration tests exist for what unit tests cannot see: the wiring in `main.js` (the
boot-time race, the address bar, persistence, the generation tier), the real worker, and
computed layout and colour. They load `index.html` in iframes sized as a desktop viewport
by default, select every control by id, and wait on precise conditions rather than time:

- `waitForLinkHandled` — the app strips `p` only when the outcome is known, so the
  parameter's disappearance is the one signal that covers loaded, declined, and rejected.
- `waitForPuzzle` — `state.puzzle !== null`, not a cell count
  (`flaky-test-remediation.md`).

Two races are made deterministic rather than probable. "Generation still in flight" uses
a Diabolical cold start (seconds of worker time against a ~150 ms load). "Cancel during
generation" starts and replaces or cancels the search within one task (SHR40/41).

Worker-side code is covered by importing `loadFromGivens` directly, per the existing
worker-coverage policy; LV7 and the integration tests exercise the real worker.

## 2. Test Inventory

### 2.1 Unit — new files

| File | IDs | Covers |
|---|---|---|
| `unit/config.test.js` | CF1–CF4 | `isRatedTier`; `unrated` rows in the behavior tables; absent from generation tables |
| `unit/puzzleString.test.js` | PS1–PS10 | digits; `.`; whitespace; `chars`; `chars` before `length`; short/long/empty; encode; round trip |
| `unit/clipboard.test.js` | CB1–CB3 | success; refused write; missing API |
| `unit/loadPuzzle.test.js` | LP1–LP10 | rated tiers; payload; stable id; Unrated + its solution; `contradiction`, `complete`, `no-solution`, `multiple`; input not mutated |
| `unit/loadProvider.test.js` | LV1–LV7 | lazy creation; envelope; id matching + reuse; error rejects all; generic message + respawn; late result ignored; real worker |
| `unit/puzzleLoader.test.js` | PL-L1–PL-L24 | `hasProgress` (5 cases); messages; parse rejections; `onChecking`; validation rejection; worker failure; load without prompt; `beforeReplace` ordering; source; Unrated; confirm titles; decline; progress judged late; won board |
| `unit/state-unrated.test.js` | SU1–SU22 (+SU16b×2) | Unrated: hints 0, play features, Check, win without stats, `HINT`/`COACH_START` refused, reset, `CHANGE_DIFFICULTY` not relabelling; suppression across all three win arms, `HINT`, resume rule both directions |
| `unit/ui-notice.test.js` | NT1–NT13 | mount; variants; Dismiss ± callback; timer; replace cancels timer; `hide` silent; link field |
| `unit/ui-share.test.js` | SH1–SH16 | `buildShareUrl` (query, fragment, `file:`, only-givens); enable/disable; copy; both outcomes; focus return; `NEW_PUZZLE` clears; default deps |

### 2.2 Unit — extended files

| File | IDs | Covers |
|---|---|---|
| `unit/protocol.test.js` | WP3 ×3 | load message constants and envelopes |
| `unit/ui-dialog.test.js` | UD7–UD12 | `onCancel` on Cancel/Escape; not on confirm; once only; replaced dialog; absent |
| `unit/ui-controls.test.js` | UC11–UC19 | Unrated option add/keep/remove; dispatch; revert under confirmation; generating guard and resync; no puzzle |
| `unit/ui-numpad.test.js` | UN13–UN15 | Unrated hint badge/label; Check shown; rated-exhausted label unchanged |
| `unit/ui-keyboard.test.js` | UK13–UK16 | digits/erase/arrows ignored in `<input>` and `<textarea>`; `<select>` unchanged |
| `unit/arch.test.js` | (list) | `notice.js` and `share.js` join the UI import-boundary check |

### 2.3 Integration — `integration/sharing.test.js`

| IDs | Group | Covers (rspec-006) |
|---|---|---|
| SHR1–SHR4 | Opening a link | Givens, empty board, tier re-rated (R4, R6); outcome shown + announced (R13); `p` stripped without reload, others kept (R4); `.` accepted (R5) |
| SHR5–SHR7 | The shared puzzle wins | Generation in flight is abandoned and never lands; generation-first is replaced silently; restored game without progress replaced silently (brief §5) |
| SHR8–SHR13 | Replace confirmation | Asked for a digit; modal semantics + focus; pencil-only counts; Cancel; Escape; confirm → fresh board (R8) |
| SHR14 ×5–SHR16 | Invalid links | Five rejection classes: message, announcement, game untouched (R5); notice sticky; boot puzzle still arrives |
| SHR17–SHR23 | Unrated | Visible + announced restrictions; `C` shortcut; all other features and no stats on win (R7, R9); persist/restore (R10); New Puzzle and difficulty change return to generation (R11); abandonment prompt |
| SHR24–SHR28 | Rated loaded puzzles | Attempt + win under the rated tier (R9); hints/coach; persist/restore (R10); preference untouched; New Puzzle tier |
| SHR38–SHR41 | Generation tier | Legacy blob defaults; invalid preference; difficulty change replaces a pending generation; cancel keeps the puzzle and restores its label, New Puzzle mid-generation uses the pending tier |
| SHR42–SHR44 | Difficulty change (fspec-001 §3.2, 2026-11-14) | Rated puzzle never relabelled, new puzzle generated; confirm/cancel with progress, focus to selector; won board changes tier without asking |
| SHR29–SHR37 | Share action | Link holds only givens, confirmation (R1, R2); round trip without progress; clipboard denied/missing fallback (R1); field keeps its keys; Unrated/won (R3); a11y (R13); visible at six widths incl. where header controls hide (R3); no overflow at 320px; contrast ≥ 4.5 in five themes; left-hand placement |

Performance (R12): SHR5 logs link-load time under a busy generation worker; DVI16
(tspec-dev-mode) asserts < 1 s for cold and warm loads of rateable and unrateable puzzles
through the same loader.

## 3. Coverage Map

| Module | Decision points | Covered by |
|---|---|---|
| `puzzleString.js` | chars; length | PS4–PS8 vs PS1 |
| `clipboard.js` | no API; catch | CB3; CB2 vs CB1 |
| `loadPuzzle.js` | conflicts; complete; count 0; count >1; solved ×2 | LP6–LP9; LP1 vs LP4 |
| `loadProvider.js` | default factory; worker exists; no callback; message fallback | LV7; LV3; LV6; LV4 vs LV5 |
| `puzzleLoader.js` | puzzle/won; pencil; pen; length vs other; unrated; parse ok; onChecking; catch; result ok; progress; confirmed | PL-L1–L5; L6–L9; L10–L24 |
| `notice.js` | progress variant; onDismiss; timeout; timer pending | NT4–NT11 |
| `share.js` | defaults; copy ok; puzzle changed; NEW_PUZZLE | SH16; SH11/12; SH8/9; SH14/15 |
| `state.js` additions | `statsSuppressed` default; `_statsEligible` both operands; 2 attempt sites; 3 win sites; `COACH_START`; `CHANGE_DIFFICULTY` | SU16; SU2/SU17; SU2/SU20; SU6/SU16b/SU18/SU19; SU8/9; SU11–15 |
| `dialog.js` additions | replaced; cancelled; confirm clears | UD11; UD7/10/12; UD9 |
| `controls.js` additions | generating; add; remove; has difficulty | UC17/18; UC12/13; UC14; UC19 |
| `numpad.js`, `keyboard.js`, `coach.js` additions | Unrated arms; text-field guard | UN13–15; UK13–16; SHR17/18/25 |
| `main.js` additions | preference valid; tier rated; blob defaults; fallback pref; cancel vs Unrated vs neither; link present; rejected vs not | SHR39; SHR21/28; SHR38; (gap, §4); SHR40/22/27; SHR1/DVI1; SHR14/SHR2 |

## 4. Gaps and Risks

- **`main.js` honest-fallback confirm (one new assignment inside a pre-existing uncovered
  block).** Reaching it needs a Diabolical/Nightmare budget exhaustion through the UI,
  which is not seed-controllable. The block has been a documented coverage exception
  since V3 (`CodeCoverageV3.md` §2); the new line is a single unconditional assignment.
- **Clipboard in headless Chromium.** The real clipboard may accept or refuse writes
  depending on focus. Tests that assert a specific outcome stub `navigator.clipboard` in
  the app frame; SH16 only asserts that one of the two outcomes is shown.
- **Timing.** SHR15 waits 4.5 s to prove stickiness and SHR5 waits 2.5 s to prove the
  abandoned generation never lands; both are lower bounds on "nothing happens", so a slow
  machine cannot make them fail spuriously.
