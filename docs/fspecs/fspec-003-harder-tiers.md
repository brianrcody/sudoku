# Functional Spec: Harder Difficulty Tiers
**ID:** fspec-003-harder-tiers
**Status:** Draft
**Date:** 2026-06-12
**Author:** Uber Developer (Functional Designer stage)
**Based on:** rspec-003-harder-tiers; spike data in `docs/misc/v3-harder-tiers-spike.md`

---

## Table of Contents

1. [Scope and Conventions](#1-scope-and-conventions)
2. [Tier Structure and Naming](#2-tier-structure-and-naming)
3. [Data Continuity (Migration)](#3-data-continuity-migration)
4. [Per-Tier Game Behavior](#4-per-tier-game-behavior)
5. [Generation Experience](#5-generation-experience)
6. [New Technique Explanations (Coach)](#6-new-technique-explanations-coach)
7. [Coaching Fidelity Policy](#7-coaching-fidelity-policy)
8. [Statistics](#8-statistics)
9. [Accessibility](#9-accessibility)
10. [Edge Cases and Error States](#10-edge-cases-and-error-states)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Scope and Conventions

This spec extends `fspec-001-v1.md` (game) and `fspec-002-coach.md` (Coach Mode). All
existing behaviors remain unchanged unless explicitly overridden here. "Coach session,"
"coached cells," and "auto-revealed candidates" are used as defined in fspec-002 §1.

The feature ships in three implementation steps (Expert enrichment; Diabolical; Nightmare)
but this spec defines the complete end state. Step boundaries are an aspec concern.

**Terminology:**
- *Tier ID* — internal identifier (persistence, config keys). Never user-visible.
- *Display name* — the user-visible tier name.
- *Limited coaching* — the reduced-fidelity explanation defined in §7.2.

---

## 2. Tier Structure and Naming

**2.1** The difficulty selector offers exactly seven options, in this order:

| Position | Display name | Tier ID | Status |
|---|---|---|---|
| 1 | Kiddie | `kiddie` | unchanged |
| 2 | Easy | `easy` | unchanged |
| 3 | Medium | `medium` | unchanged |
| 4 | Hard | `hard` | unchanged |
| 5 | Expert | `expert` | renamed from "Death March" (`death-march`) |
| 6 | Diabolical | `diabolical` | new |
| 7 | Nightmare | `nightmare` | new |

**2.2** Selector behavior (immediate switch when idle; abandonment confirmation when a
puzzle is in progress, fspec-001 §"Difficulty") is identical for all seven tiers.

**2.3** The display name "Death March" no longer appears anywhere in the UI. (It is
reserved for a future curated tier; nothing in V3 references it.)

**2.4** Everywhere a tier name is displayed (selector, statistics table, win banner,
SR announcements), the new names are used consistently.

---

## 3. Data Continuity (Migration)

Migration is one-time, automatic, and invisible. No dialog, no flash of wrong names.

**3.1 Statistics.** Stored statistics keyed `death-march` are re-keyed to `expert` on first
load after the update. Historical counts (started/completed/best time, per fspec-001 §12)
appear in the Expert row. No data loss.

**3.2 Current difficulty.** A persisted current difficulty of `death-march` loads as
`expert` (selector shows "Expert").

**3.3 In-progress puzzle.** A saved in-progress puzzle with difficulty `death-march`
resumes with difficulty `expert` and is otherwise untouched.

**3.4 Pre-generated puzzle cache.** Cached not-yet-played puzzles labeled `death-march` are
**discarded** (not relabeled). Rationale: they were rated by the pre-fix rater (see
`bugs-forcing-chains-soundness.md`) and may not match the sound Expert definition; the
cache refills in the background as usual.

**3.5 Idempotence.** Migration runs at most once (guarded by a schema-version marker in
persistence); re-running on every load must be a no-op.

---

## 4. Per-Tier Game Behavior

**4.1** Diabolical and Nightmare adopt the existing top-tier policies:

| Behavior | Diabolical | Nightmare |
|---|---|---|
| Hints | 0 | 0 |
| Check button | hidden | hidden |
| Correctness mode | on-complete-silent | on-complete-silent |
| Pencil marks, undo, erase-all-pencil, themes, keyboard | unchanged | unchanged |

**4.2** Expert behavior is exactly the former Death March behavior (0 hints, no Check,
on-complete-silent). Only the name and internal ID change.

**4.3** Coach is available at all seven tiers (fidelity per §7). The Coach button is never
hidden or disabled by tier.

---

## 5. Generation Experience

**5.1 Expected timing.** Kiddie–Expert generation behavior is unchanged. Diabolical and
Nightmare may take noticeably longer on a cold start (no cached puzzle): seconds typically;
tens of seconds occasionally; bounded by a budget sized so that exceeding ~120 s without a
result is vanishingly rare (rspec R16; budgets from spike data).

**5.2 Busy indicator with progress.** The existing "Generating puzzle…" busy state is
retained. For Diabolical and Nightmare only, after **3 seconds** of waiting the indicator
additionally shows a progress line updated at least once per second, of the form:

> "Searching for a worthy puzzle… (attempt N of M)"

where N/M come from the generator's progress reporting. The puzzle area remains inert and
the app responsive throughout (no frozen UI).

**5.3 Cancel.** While the §5.2 progress line is showing, a **Cancel** button appears with
it. Activating Cancel aborts generation and restores the exact prior state (previous puzzle
and its progress if one existed; otherwise the empty pre-generation state, with the
difficulty selector reverted to its previous value). Cancel is keyboard-accessible and is
announced (§9).

**5.4 Honest exhaustion fallback (replaces silent mislabeling).** If the attempt budget is
exhausted without a puzzle of the requested tier, the app does **not** silently substitute.
A confirmation dialog (existing dialog component) appears:

> **"No ⟨Tier⟩ puzzle found"**
> "The generator couldn't find a ⟨Tier⟩ puzzle this time. The best it found is rated
> ⟨ActualTier⟩. Play it?"
> Buttons: **Play ⟨ActualTier⟩** (default) / **Cancel**

- *Play:* the found puzzle loads; the difficulty selector and all labels show its **true**
  tier (⟨ActualTier⟩); statistics attribute it to ⟨ActualTier⟩.
- *Cancel:* identical outcome to §5.3 Cancel.
- This dialog applies to Diabolical and Nightmare requests. Kiddie–Expert keep their
  existing fallback behavior (budget exhaustion there is not a user-visible event today and
  remains non-blocking).

**5.5 Pre-generation.** Background pre-generation and the cached-next-puzzle mechanism
extend to Diabolical and Nightmare, so §5.2–5.4 occur mainly on a user's first request at
a new tier.

---

## 6. New Technique Explanations (Coach)

Conventions follow fspec-002 §8: each technique defines its coached cells, the explanation
panel text, arrow/visual semantics, and candidate auto-reveal (always required for these
ranks). Exact strings below are normative; emphasis spans marked with asterisks per the
existing convention. Cell-set vocabulary: *pattern cells* highlight with the cause
treatment; *elimination cells* with the elimination treatment (both existing).

### 6.1 XYZ-Wing (Expert, full coaching)

- **Coached cells:** pivot (3 candidates *XYZ*) + two wings (*XZ*, *YZ*); elimination cells.
- **Visual:** chain edges pivot→wing1 and pivot→wing2; dashed pointers from each pattern
  cell to each elimination cell.
- **Text:** "One of these three cells must contain *[Z]* — any cell that sees all three
  can't contain *[Z]*."

### 6.2 WXYZ-Wing (Expert, full coaching)

- **Coached cells:** the four pattern cells; elimination cells.
- **Visual:** chain edges from the pivot to each wing; dashed pointers to eliminations.
- **Text:** "One of these four cells must contain *[Z]* — any cell that sees every *[Z]*
  in the group can't contain *[Z]*."

### 6.3 Finned X-Wing (Expert, full coaching)

- **Coached cells:** the four X-Wing corner cells; the fin cell(s) with a **distinct fin
  treatment** (visually distinguishable from pattern cells; Visual Designer defines it);
  elimination cells.
- **Visual:** the X-Wing rectangle outline (existing connector treatment) plus the fin
  highlight; dashed pointers to eliminations.
- **Text:** "*[D]* almost forms an X-Wing — except for the *fin*. Either the X-Wing holds,
  or the fin is *[D]*. Both ways, *[D]* can't appear in cells covered by both."

### 6.4 Finned Swordfish (Expert, full coaching)

- Same structure as §6.3 with the Swordfish outline.
- **Text:** "*[D]* almost forms a Swordfish — except for the *fin*. Either the Swordfish
  holds, or the fin is *[D]*. Both ways, *[D]* can't appear in cells covered by both."

### 6.5 Unique Rectangle, Types 1, 2, 4 (Diabolical, full coaching)

- **Coached cells:** the four rectangle cells; elimination cells. For Type 1 the roof cell
  is also an elimination cell.
- **Visual:** closed rectangle outline through the four cells (existing connector
  treatment); dashed pointers to eliminations where they are outside the rectangle.
- **Texts:**
  - Type 1: "If these four cells held only *[a]* and *[b]*, the puzzle would have two
    solutions — and every puzzle here has exactly one. The corner with extra candidates
    can't be just *[a]*/*[b]*: remove *[a]* and *[b]* from it."
  - Type 2: "To avoid an impossible two-solution rectangle, one of these two corners must
    be *[c]* — cells seeing both can't contain *[c]*."
  - Type 4: "To avoid an impossible two-solution rectangle, these two corners can't both
    keep *[b]* — since *[a]* is locked to them in this unit, remove *[b]* from both."
- **Recap and panel behavior** identical to other fully-coached elimination techniques.

### 6.6 ALS-XZ (Nightmare, limited coaching — §7.2)

- **Coached cells:** set A cells (one group treatment), set B cells (a second group
  treatment — reuses the two coloring-group treatments), elimination cells.
- **Visual:** group highlights only. No chain edges, no walkable arrows.
- **Text:** "These two groups are each one digit short of locked. They share *[X]*
  restrictively — so one group must contain *[Z]*. Cells seeing every *[Z]* in both groups
  can't contain *[Z]*."
- **Acknowledgment note (always):** "Tracing which digits lock each group is an advanced
  exercise — the highlights show the two groups and the result."

---

## 7. Coaching Fidelity Policy

**7.1 Full coaching** (Kiddie–Diabolical, and all sub-ALS techniques at Nightmare): exactly
the fspec-002 experience. The existing long-chain acknowledgment for XY-Chain/Forcing Chain
remains as-is at every tier where those techniques appear.

**7.2 Limited coaching** (ALS-class techniques): the coach names the technique, highlights
the cell groups and elimination cells, reveals the relevant candidates, states the rule
(§6.6), and shows the acknowledgment note. It does **not** draw inference arrows or walk
the logic. Everything else about the coach session (cell selection, panel, recap,
progression on the next press) is unchanged.

**7.3 Fidelity is per-technique, not per-board.** A Nightmare puzzle whose current easiest
step is, e.g., a Naked Pair gets the full Naked Pair coaching.

**7.4** The coach never places or erases anything (existing principle; restated as
normative for the new tiers).

---

## 8. Statistics

**8.1** The statistics table shows seven rows in selector order with the new display names.

**8.2** The Expert row contains the migrated historical Death March statistics (§3.1).

**8.3** Diabolical and Nightmare rows start at zero and accumulate identically to other
tiers, including the §5.4 case (attributed to the *actual* tier played).

---

## 9. Accessibility

**9.1** The difficulty selector remains a native select; new options are plain text.

**9.2** §5.2 progress updates are announced via the existing polite live region, throttled
to at most one announcement per 10 seconds (avoid SR spam), e.g. "Still searching for a
Nightmare puzzle."

**9.3** The §5.3 Cancel button is focusable, has an accessible name ("Cancel puzzle
search"), and focus moves to it when it appears only if focus was on the triggering
control; otherwise focus is unchanged.

**9.4** The §5.4 dialog follows the existing dialog component's focus-trap and SR behavior;
its title is announced.

**9.5** New coach visuals (fin treatment, UR rectangle, ALS group highlights) must not rely
on color alone; the Visual Designer provides a non-color distinguisher (consistent with the
existing coached-cell treatments), and supporting text always carries the full explanation.

**9.6** Limited coaching announces the acknowledgment note after the supporting text in the
same SR flow used by the existing long-chain acknowledgment.

---

## 10. Edge Cases and Error States

**10.1 Mid-generation tier switch.** Selecting a different difficulty while §5.2 is showing
behaves as Cancel (§5.3) followed by the normal difficulty-change flow.

**10.2 Page close during generation.** Nothing is persisted mid-generation; on reload the
app restores the prior state (existing behavior).

**10.3 Coach on a legacy board.** A resumed pre-update puzzle may not be solvable by the
sound ladder from its current state. The existing "no applicable technique" coach handling
(fspec-002 §2.1) applies; no new UI.

**10.4 Coach desync via erasure.** Unchanged, accepted (rspec R13). Limited coaching makes
player-applied eliminations more error-prone; the existing behavior (analyzer trusts
erasures) stands.

**10.5 Offline/storage-full.** Cache writes failing never block play (existing policy);
the §3.4 cache discard is tolerant of missing/corrupt entries.

---

## 11. Out of Scope

- The curated "Death March" top tier (V4): bundled library, coach disabled.
- Re-ranking techniques below the current Hard/Expert boundary.
- "Apply this step for me" coach affordances (explicitly rejected, brief D4).
- Server-side anything.
