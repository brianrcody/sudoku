# Erase All Pencil Review (V2)

Reviewer pass against `docs/aspecs/aspec-erase-pencil.md` (and erase-pencil flows in
`docs/fspecs/fspec-001-v1.md`). Date: 2026-05-22.

## Sign-off

**APPROVED — no blockers.** The implementation faithfully matches aspec-erase-pencil.md in
all material respects. Confidence: HIGH.

## Section 1 — Functional / Architectural fidelity

**1. ERASE_ALL_PENCIL handler** (`js/game/state.js:421–439`) — placed after `ERASE`,
before `UNDO` (aspec §3.2). No-op guard `_hasNoPencil()` (`:425`) breaks before
`_captureUndoSnapshot()`, preserving prior snapshot (aspec §4). Defensive guards
`!puzzle`/`won`/`generating`/`_hasNoPencil` in correct order. Snapshot captured before the
81-cell zeroing loop (aspec §5). Emit keys exactly `{pencil, undoSnapshot}` (aspec §7.1).
Conditional `COACH_END {reason:'erase'}` dispatched after `_emit` when a session is active
(aspec §6) — mirrors `ERASE`'s coach-termination mechanism.

**2. `_hasNoPencil()` helper** (`:170–176`) — placed near `_isBoardFull()` (aspec §3.2);
exact match to spec pseudocode; single source of truth shared (logically) with the numpad
disabled predicate.

**3. Numpad template** (`js/ui/numpad.js:53–57`) — `.numpad-undo-row` holds `#btn-erase-all`
then `#btn-undo` in correct reading order; visible label "Erase all pencil",
`aria-label="Erase all pencil marks"`; ships `disabled`.

**4. CSS grid** (`css/controls.css:34–38`) — `.numpad-undo-row` is
`grid-template-columns: repeat(2, 1fr); gap: 6px`, matching `.numpad-utils`; no theme
changes; resulting layout matches aspec §9.2.

**5. Button state** (`js/ui/numpad.js:12–14, 240–254`) — `RELEVANT_KEYS` includes `pencil`
(critical, so `_update` re-runs on pencil change); disabled predicate
`generating || won || !puzzle || !hasPencil` logically identical to the reducer guard
(aspec §8.2).

**6. Click handler** (`:137–147`) — defensive re-guards; dispatches `{type:'ERASE_ALL_PENCIL'}`;
announces "All pencil marks erased" only on real mutation; mousedown-focus pattern handled
by existing loop.

**7–9. Tests** — unit S78–S86 (all reducer branches + guards), integration GF20–GF22
(button lifecycle, erase→undo round-trip, coach+erase), a11y A22 all present and sound.

**10. Undo interaction** (aspec §5) — UNDO restores the pre-wipe pencil array in full via
the snapshot; S83 confirms the round-trip.

**11. Persistence** (aspec §11) — `pencil` is in the writer's trigger set, so the existing
debounced writer persists the emptied grid; `undoSnapshot` not persisted. No new wiring.

## Section 2 — Non-blocking observations

- Narrow-viewport label wrapping for "Erase all pencil" deferred to manual smoke check
  (aspec §9.2) — appropriate.
- COACH_END `_revertPencil` may re-introduce coach-revealed bits after a full wipe — this
  is the existing accepted `ERASE`+coach behavior, inherited unchanged; UNDO is the
  authoritative recovery path (tested in S85/GF22).
- Announce placed after dispatch but behind the re-guard — fires only on mutation, correct.
