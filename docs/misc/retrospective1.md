# Retrospective 1 — Token Usage Analysis

**Date:** 2026-04-21  
**Subject:** Why did this project exhaust rate limits so quickly?

Over ~36 hours of work, nearly 90% of the weekly token limit was consumed, sometimes
burning through the 5-hour limit in under 30 minutes. This document identifies the
contributing factors, ranked by impact.

---

## Findings

### 1. Context Re-initialization at Every Agent Boundary (Largest Driver)

The multi-agent architecture is the single biggest cost amplifier. Every subagent
spawned cold and had to re-read the world before doing any work: CLAUDE.md, its role
file, and all upstream artifacts. By the time the QE phases ran, a single agent
invocation loaded:

- CLAUDE.md (~240 lines) + project CLAUDE.md
- Its own role file (~65 lines)
- rspec (305) + fspec (702) + vspec (640) + aspec (1,682) + tspec (870)
- Full production codebase (~4,800 lines JS + 1,100 CSS + 104 HTML)

That's ~10,500 lines of context per agent before writing a single line of output. With
~8 agent types, multiple invocations of some (Implementor/Reviewer iterating on
blockers, QE Test Runner looping), and parallel spawns, the cumulative re-read cost
compounds fast. In a monolithic session, that context is loaded once; in the
multi-agent model, it's loaded once per agent boundary.

### 2. The Mockup Iteration Cycle (~7,200 lines of HTML)

Four full-page mockups at ~1,900 lines each. The Visual Designer wrote, read, and
re-read these across iterations. They're also HTML/CSS/JS — not wireframes — so they
are dense and expensive to both generate and reason about. Four rounds of iteration
means the full mockup history appeared in context multiple times.

### 3. Algorithmic Complexity of the Solver Domain

Sudoku solving techniques are genuinely hard. The project has 12+ solver technique
implementations: X-Wing, Swordfish, Jellyfish, XY-Wing, hidden/naked subsets, locked
candidates, forcing chains, coloring chains. Each required:

- Domain research (the puzzle-generation spike alone is 313 lines of notes)
- Careful algorithmic implementation
- Verification of correctness

Forcing chains and coloring are among the hardest Sudoku techniques. The model must
hold significant constraint-satisfaction logic in working memory while generating code,
which means longer outputs and more correctness passes.

### 4. Test Suite Size (2× Production Code)

The test suite (~9,550 lines across unit, integration, and fixture files) is nearly
twice the size of the production code (~4,800 lines). The 100% branch coverage
requirement drove this — the QE Test Writer had to reason about every code path in
every technique. The fixture files are a particular multiplier: `xyWing.js` alone is
526 lines, `coloring.js` is 743 lines. Crafting valid Sudoku board states as test
fixtures is token-intensive work.

### 5. Dense Architecture Spec Read by Many Agents

The aspec at 1,179 lines is large. It was loaded by: Implementor, Reviewer (twice —
puzzle brain and app brain reviews), QE Strategist, QE Test Writer, and QE Test Runner.
That's at minimum 6+ full reads of a 1,179-line document. The aspec is ~70% larger
than either the fspec or vspec.

### 6. External Research (Minor)

The puzzle-generation spike documents significant web research into Sudoku techniques.
WebFetch calls and processing external pages add tokens, but this is the smallest line
item.

---

## Summary

| Driver | Relative Impact |
|--------|----------------|
| Context re-initialization per agent boundary | High |
| Mockup iteration (~7,200 lines of HTML) | High |
| Algorithmic complexity of the solver domain | Medium-High |
| Test suite size (2× production code) | Medium-High |
| Dense aspec read by 6+ agents | Medium |
| External research | Low |

---

## Implications for Future Projects

The multi-agent architecture is structurally token-expensive because agents don't share
state — they re-derive it. The tradeoff is clean separation of concerns and
parallelism. Mitigations for future projects:

**Trim agent read lists.** Not every agent needs every spec. The QE Test Writer doesn't
need the rspec; the Implementor doesn't need the tspec. Scoping each agent's "read
before starting" list to only what's strictly necessary reduces per-agent load.

**Write aspecs to be behaviorally self-contained.** When the aspec cross-references the
fspec by section (e.g. "runs steps in fspec §6.2"), the Implementor is forced to load
both documents. The Architect should instead reproduce the relevant behavioral detail
inline so the Implementor can work from the aspec alone. This eliminates the fspec as
an Implementor dependency entirely.

**Reduce mockup verbosity.** Four near-identical 1,900-line files is expensive. Mockups
could be diffs from a shared base, or a single live file iterated in place rather than
duplicated.

**Decompose specs by feature rather than writing monolithic documents.** A monolithic
spec forces an all-or-nothing load — an agent needing only hint behavior still loads
the full 702-line fspec or 1,179-line aspec. Feature-focused specs (e.g.
`fspec-hints.md`, `aspec-hints.md`) let agents load exactly what their task requires.

Pair this with one lightweight overview spec per document type that covers only
cross-cutting concerns: application structure, shared conventions, the state model,
the event architecture. These are stable once written and don't grow with each new
feature. Feature specs should reference each other explicitly when interactions exist
(e.g., hints touching pen mode and conflict detection), so agents know when a second
feature spec is needed. Keep the overview thin — if a detail belongs to a single
feature, it goes in that feature's spec, not the overview.

**Minimize fixture verbosity.** Fixture files can often be expressed more compactly by
encoding only the cells that matter for a technique, rather than full 81-cell boards.

The domain complexity (Sudoku solver) was genuinely unavoidable. The structural choices
above added a meaningful multiplier on top.
