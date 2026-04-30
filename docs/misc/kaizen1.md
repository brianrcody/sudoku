# Kaizen 1 — Agent Spec Loading Optimization

**Date:** 2026-04-21  
**Status:** Applied  
**Motivation:** Post-v1 retrospective identified context re-initialization at agent
boundaries as the largest token cost driver. These two changes reduce unnecessary spec
loading with zero risk to output quality.

---

## Change 1: Remove vspec from Implementor inputs

**File changed:** `docs/agents/implementor.md`

**Before:**
```
## Inputs
- Architectural spec / implementation plan: docs/aspecs/[feature].md
- Functional spec (for behavior reference): docs/fspecs/[feature].md
- Visual design spec (for design reference): docs/vspecs/[feature].md
```

**After:**
```
## Inputs
- Architectural spec / implementation plan: docs/aspecs/[feature].md
- Functional spec (for behavior reference): docs/fspecs/[feature].md
```

**Rationale:** A search of `aspec-001-v1.md` found zero `vspec §` cross-references.
The Architect fully absorbed the visual design spec into the implementation plan. The
Implementor has no legitimate reason to consult the vspec independently, and doing so
risks second-guessing the Architect's decisions. Saves ~640 lines per Implementor
invocation.

**To revert:** Restore the `- Visual design spec (for design reference)` line.

---

## Change 2: Make "existing specs" reads conditional for Functional Designer, Visual Designer, and Architect

**Files changed:** `docs/agents/functional-designer.md`, `docs/agents/visual-designer.md`,
`docs/agents/architect.md`

**Before (same pattern in all three):**
```
- Existing [X] specs (for consistency): docs/[X]specs/
```

**After (same pattern in all three):**
```
- Existing [X] specs (for consistency): docs/[X]specs/ — load only if this feature
  extends or modifies an existing feature area. If it is unclear whether the new
  feature overlaps existing work, stop and ask the Orchestrator before loading.
```

**Rationale:** For a new independent feature, loading all prior specs in a directory
is unnecessary overhead. The consistency check only matters when new work touches
existing feature areas. The escalation path (ask the Orchestrator on ambiguity) ensures
agents don't silently skip a load they should have done. The Orchestrator can resolve
the question directly or consult the user if needed.

Potential savings per agent invocation on a new feature:
- Functional Designer: up to ~700 lines (existing fspecs)
- Visual Designer: up to ~640 lines (existing vspecs)
- Architect: up to ~1,680 lines (existing aspecs)

**To revert:** Restore the unconditional `- Existing [X] specs (for consistency)`
lines in all three files.

---

## How to fully unwind

1. In `docs/agents/implementor.md`, restore the vspec input line.
2. In `docs/agents/functional-designer.md`, `visual-designer.md`, and `architect.md`,
   replace the conditional input lines with the original unconditional versions.

No code changes. No spec changes. Agent behavior for extension features is identical
to pre-kaizen behavior.
