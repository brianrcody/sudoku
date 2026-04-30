# Working with Claude: A Team Primer

This document gives a quick orientation to how we use Claude on this project. If you're new
to the workflow, start here.

---

## The Basic Idea

We treat Claude not as a single assistant but as a **development team**: a collection of
specialized agents, each with a defined role, a specific set of inputs and outputs, and
clear acceptance criteria for when their work is done. This mirrors how a human engineering
team works — a designer hands off to an architect who hands off to an implementor — but the
entire team runs inside Claude.

The main session Claude (the one you talk to) acts as **Orchestrator**: it runs conversations
with you, authors specs, and delegates work to specialized subagents. Subagents are separate
Claude instances launched with role-specific instructions. They work independently and return
their output to the Orchestrator, who synthesizes and hands off downstream.

---

## Building Out the Team

Before any feature work began, we defined the full development team as a set of role files
in `docs/agents/`. Each file specifies:

- **Subagent type** — which Claude agent capability to use (e.g., general-purpose, Plan)
- **Model** — which Claude model to use; higher-leverage roles like the Architect run on
  Opus, lighter roles on Sonnet or Haiku
- **Purpose** — what this role owns and what it explicitly does *not* own
- **Instructions** — a prompt that shapes the subagent's behavior for this project
- **Done criteria** — explicit conditions that must be true before this role's work is
  accepted

This upfront investment pays off: the Orchestrator can reliably brief any subagent because
the role contract is already written down. You don't re-litigate scope at every handoff.

---

## Roles in the Pipeline

| Role | What they produce |
|------|------------------|
| Product Director (you) | Feature direction, UX approvals, final decisions |
| Orchestrator (Claude) | Requirements specs, coordination, progress reports |
| Functional Designer | Functional specs: what the app does and how users experience it |
| Visual Designer | HTML/CSS/JS mockups, then a finalized visual design spec |
| Architect | Implementation plan: stack, structure, data models, build sequence |
| QE Strategist | Test strategy: what to test and at what level |
| Implementor | Working code |
| Reviewer | Explicit sign-off that code matches both the fspec and the aspec |
| QE Test Writer | Test code from the test strategy |
| QE Test Runner | Automated loop: runs tests, coordinates bug fixes, loops until done |

---

## Acceptance Criteria and When to Involve You

Each role's `docs/agents/` file has an explicit **Done When** section. Work is not accepted
until those conditions are met — the Orchestrator holds subagents to this, and it's the same
standard a human tech lead would apply.

**The Orchestrator handles autonomously:**
- Implementation details with no significant design implications
- Minor UX choices clearly within the spirit of the functional spec
- Negotiation outcomes between agents (e.g., Architect flags something infeasible →
  Functional Designer revises → Orchestrator confirms resolution)

**You are looped in before proceeding when:**
- Scope changes or feature additions are proposed
- There's an unresolved conflict between agents that can't be settled by reasonable judgment
- Anything has significant UX impact — you review and approve mockups before the visual
  design is finalized
- The QE phase is complete and the iteration is ready to close

The goal is to keep your involvement at the decision level, not the execution level.

---

## How a Feature Flows

1. **Requirements analysis** — you and the Orchestrator have a conversation that surfaces
   what the feature needs to do. The Orchestrator signals when it's ready to hand off; you
   confirm.

2. **Functional spec** — the Orchestrator authors a requirements doc and briefs the
   Functional Designer subagent, which produces a formal spec covering user flows, state
   transitions, edge cases, and accessibility behavior.

3. **Visual design** — the Visual Designer builds executable HTML/CSS/JS mockups. You give
   feedback; the Designer iterates until you approve. A finalized visual design spec is then
   written.

4. **Architecture** — the Architect reads the functional and visual specs and produces an
   implementation plan: file structure, component breakdown, data models, key algorithms,
   test infrastructure. If anything in the functional spec is technically infeasible, the
   Architect flags it and the Orchestrator mediates a resolution.

5. **QE strategy** — running in parallel with implementation, the QE Strategist reads the
   implementation plan and defines what to test and at what level (unit vs. integration vs.
   system).

6. **Implementation** — the Implementor builds from the plan. The Reviewer then validates
   the code against both the functional spec and the architectural plan, issuing explicit
   sign-off or a list of blockers.

7. **Testing** — the QE Test Writer implements the test suite. The QE Test Runner phase
   then executes an automated loop: run tests, coordinate with the Implementor or Test
   Writer to fix failures, repeat until all exit criteria are met.

---

## Exit Criteria

An iteration is complete when *all* of the following are true:

1. All tests pass
2. Branch coverage is 100%
3. Reviewer has signed off with no open blockers
4. Functional correctness is validated
5. All user-facing actions complete in under 1 second
6. Accessibility requirements are met (keyboard navigable, correct ARIA, screen reader
   compatible)
7. You have approved the UX at the current milestone boundary

These aren't aspirational — the QE Test Runner loop does not exit until they're all green.

---

## What Makes This Work

A few things we've found matter in practice:

**Write the role files before you need them.** Having clear purpose and done-criteria per
role eliminates ambiguity at handoff time. The Orchestrator reads the role file before
briefing a subagent — this is not optional.

**Specs are the source of truth, not conversation history.** Once a functional spec or
implementation plan is written, subsequent agents work from the document, not from
re-reading the chat. Keep specs up to date when decisions change.

**Surface conflicts early.** If the Architect disagrees with the Functional Designer, that
tension is resolved before implementation starts — not discovered mid-build. The Orchestrator
mediates; you only get involved if the agents genuinely can't resolve it.

**Your time is for decisions, not execution.** The workflow is designed so that most of the
back-and-forth happens between agents. When you're asked something, it's because a real
decision needs your authority or judgment — not because an agent got stuck on something
it should handle itself.
