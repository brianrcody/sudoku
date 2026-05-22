# Undo Review (V2)

Reviewer pass against `docs/aspecs/aspec-undo.md` (and undo-related flows in
`docs/fspecs/fspec-001-v1.md`). Date: 2026-05-22.

## Sign-off

**APPROVED — no blockers.** All architectural requirements in aspec-undo.md §1–12 are
faithfully implemented. The one-level undo feature matches the spec at the architectural
level.

## Section 1 — Functional / Architectural fidelity

**1.1 `undoSnapshot` field & structure** — typedef declared (`js/game/state.js:25–31`),
added to `GameState` typedef (`:50`), initialized `null` in `createGameState` (`:98`).
Snapshot captures pen, pencil, hintsRemaining, attemptRecorded as required.

**1.2 `_captureUndoSnapshot()` helper** — defined (`:116–124`), creates fresh typed-array
copies, called in all required handlers.

**1.3 PEN_ENTER capture** (aspec §3.1, `:325–359`) — pending object created before
mutation; `_applyPenEnter` returns boolean (`:178–213`); snapshot committed only if
mutated; no-op guard preserves prior snapshot (`:184`); board-full path returns true;
emit includes `undoSnapshot` (`:357`).

**1.4 PENCIL_TOGGLE capture** (aspec §3.1, `:361–393`) — guards break before capture;
`_captureUndoSnapshot` after last guard, before toggle (`:368`); emit includes
`undoSnapshot` (`:391`).

**1.5 ERASE capture** (aspec §3.1, `:395–419`) — pen and pencil erase paths both capture
before mutation with correct emit; empty-cell no-op correctly skips capture/emit.

**1.6 ERASE_ALL_PENCIL integration** (`:421–439`) — no-op guard breaks before capture;
snapshot captured before mutation (`:427`); emit includes `undoSnapshot` (`:433`).

**1.7 UNDO handler** (aspec §4, `:441–481`) — guards on `undoSnapshot === null`, `won`,
`generating`; coach session ended directly (not via COACH_END dispatch); board restored
via `pen.set()`/`pencil.set()` preserving array identity; stats restored; conflicts
recomputed; transient state cleared and incorrect-timer cancelled; snapshot consumed to
null; `selected`/`activeMode` preserved; emit keys complete.

**1.8 Snapshot clear points** (aspec §3.2) — cleared on PUZZLE_LOADED, NEW_PUZZLE,
RESET_PUZZLE, CHANGE_DIFFICULTY, and **RESTORE_SESSION (`:680`)** — the critical invariant
(no cross-session undo of a restored move) is met.

**1.9 Coach / HINT actions** — COACH_START, COACH_END, HINT do not capture or clear the
snapshot, per aspec §3.2.

**1.10 Numpad button** (aspec §5, `js/ui/numpad.js`) — template with id/aria-label/disabled;
`RELEVANT_KEYS` includes `undoSnapshot` and `generating`; disabled logic
`undoSnapshot === null || won || generating`; click handler dispatches UNDO and announces
"Last move undone".

**1.11 Keyboard binding** (aspec §6, `js/ui/keyboard.js:47–58`) — placed before digit
block; detects Ctrl/Cmd+Z without shift/alt; focus guard excludes INPUT/SELECT/TEXTAREA/
BUTTON; state guards present; no `preventDefault` when guarded off (preserves native Ctrl+Z
in editable contexts); no announce from keyboard path.

**1.12 HTML & CSS** (aspec §7, `css/controls.css:34–38`) — `.numpad-undo-row` 2-column
grid; button ships disabled; no new theme props needed.

**1.13 One-level-only** — snapshot cleared after UNDO; second consecutive UNDO is a no-op;
no redo stack/REDO action.

**1.14 Session-only** — `undoSnapshot` never serialized; RESTORE_SESSION clears it; inits
to null on load.

## Section 2 — Non-blocking observations

- §7.1 spec describes the row holding Undo; implementation makes it a 2-column grid also
  holding Erase-all (a later feature). Coherent, not a violation.
- Clear/Erase button labeled "Clear" in code vs "Erase" in fspec — **RESOLVED 2026-05-22**:
  the rename was deliberate (commit `00fba2b`, disambiguating from "Erase all pencil");
  "Clear" is the authoritative name. fspec-001 updated to "Clear" for the single-cell
  button. (Undo button itself was always correctly labeled.)
- PEN_ENTER emit includes `won`/`winHandled` beyond aspec §10.1's UNDO-specific list —
  correct, since ON_COMPLETION_EVALUATE may dispatch within the handler.
- `attemptRecorded` restored in-memory but stats cookie intentionally not decremented
  (aspec §4.7) — correct.
