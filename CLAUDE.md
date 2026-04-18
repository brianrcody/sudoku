# Sudoku Website — Project Process

## Overview

This file defines how the user and Claude agents collaborate to build the Sudoku web
application. It covers roles, workflow, artifact storage, decision authority, and measures
of success. It does **not** cover technical stack or implementation choices — those live
in `docs/aspecs/`.

## Reading This File

At the start of each session, read this file and the following before doing any work:

- `docs/agents/` — role definitions, subagent types, models, and prompt instructions for
  every subagent used in this project. Always consult the relevant role file before
  briefing a subagent.
- Any existing specs in `docs/rspecs/`, `docs/fspecs/`, `docs/vspecs/`, `docs/aspecs/`,
  `docs/tspecs/` — to understand what has already been decided and documented.

---

## Roles

### Product Director (User)
- Sets product direction and feature priorities
- Final decision authority on all major decisions
- Reviews and approves UX at milestone boundaries
- Confirms when requirements analysis is complete enough to hand off

### Orchestrator (Claude, in-session)
- Runs requirements analysis conversations with the user
- Authors requirements specs that hand off to the Functional Designer
- Delegates work to specialized subagents — always read `docs/agents/[role].md` before
  briefing a subagent to ensure the correct subagent type, model, and instructions are used
- Mediates negotiation between agents (e.g., Architect ↔ Functional Designer)
- Resolves minor decisions autonomously; surfaces major decisions to the user
- Reports progress and synthesizes outputs

### Functional Designer (subagent)
- Receives a requirements spec from the Orchestrator and produces formal functional specs
- Defines behavior and UX — not technical implementation
- Participates in feasibility negotiation with the Architect (mediated by Orchestrator)
- Output: `docs/fspecs/`

### Visual Designer (subagent)
- Receives the functional spec and produces executable HTML/CSS/JS mockups
- Iterates on mockups based on user feedback until the visual design is approved
- Writes finalized visual design spec once approved
- Mockups: `docs/mockups/` | Finalized spec: `docs/vspecs/`

### Architect (subagent)
- Translates functional specs and visual design specs into implementation plans
- Negotiates feasibility with the Functional Designer (mediated by Orchestrator)
- Output: `docs/aspecs/`

### Implementor (subagent)
- Implements code from the implementation plan
- Produces README and deployment documentation
- Works with the Reviewer to resolve any issues before QE

### Reviewer (subagent)
- Validates that the implementation matches the functional spec, visual design spec, and architectural plan
- Issues explicit sign-off or returns a list of blockers to the Implementor
- Review reports: `docs/misc/`

### QE Strategist (subagent)
- Reads the implementation plan and produces a test strategy
- Defines which behaviors require unit vs. integration vs. system tests
- Output: `docs/tspecs/`

### QE Test Writer (subagent)
- Implements tests from the test strategy

### QE Test Runner (automated phase)
- Runs tests against current code
- Coordinates bug resolution with Implementor and QE Test Writer
- Loops until all exit criteria are met — no user involvement required per iteration
- Bug reports: `docs/misc/`

---

## Workflow

```
User ──► Orchestrator ──► [Requirements Analysis] ──► rspec (docs/rspecs/)
                     │
                     ├──► Functional Designer ──► fspec (docs/fspecs/)
                     │
                     ├──► Visual Designer ──► mockups (docs/mockups/) ──► User feedback
                     │         └── (iterate until approved) ──► vspec (docs/vspecs/)
                     │         ▲ feasibility negotiation (mediated by Orchestrator)
                     ├──► Architect (from fspec + vspec) ──► aspec (docs/aspecs/)
                     │
                     ├──► QE Strategist (from aspec) ──► tspec (docs/tspecs/)
                     │
                     ├──► Implementor (from aspec) ──► code + docs
                     │         │
                     │         ▼
                     │    Reviewer ──► sign-off or blockers back to Implementor
                     │
                     ├──► QE Test Writer (from tspec) ──► test code
                     │
                     └──► QE Test Runner phase (automated loop until exit criteria met)
                               ├── coordinates with Implementor on code bugs
                               └── coordinates with QE Test Writer on test issues
```

### Requirements handoff trigger
The Orchestrator signals when requirements analysis is sufficiently complete. The user
confirms, and the Orchestrator then authors the rspec and engages the Functional Designer.

---

## Artifact Storage

| Directory      | Contents                                             |
|----------------|------------------------------------------------------|
| `docs/agents/`  | Role definitions and prompt templates for each subagent       |
| `docs/rspecs/`  | Requirements specs — output of requirements analysis          |
| `docs/fspecs/`  | Functional specs                                              |
| `docs/vspecs/`  | Visual design specs — finalized look and feel                 |
| `docs/mockups/` | Executable HTML/CSS/JS mockups for user feedback              |
| `docs/aspecs/`  | Architectural specs and implementation plans                  |
| `docs/tspecs/`  | Test strategy plans                                           |
| `docs/misc/`    | Review reports, bug reports, miscellaneous                    |

---

## Decision Authority

**Orchestrator resolves autonomously:**
- Implementation details with no significant design implications
- Minor UX choices clearly within the spirit of the fspec
- Negotiation outcomes between agents where both positions are reasonable

**Surface to user before proceeding:**
- Scope changes or feature additions
- Architectural pivots
- Unresolved conflicts between agents
- Anything with significant UX impact

We will adjust this boundary as we learn through experience.

---

## Measures of Success

### Tests
- Branch coverage: **100%**
- Unit tests are the primary vehicle
- Integration and system tests used judiciously to validate end-to-end workflows
- All tests must pass at the end of every iteration

### Spec Fidelity
- Reviewer explicitly signs off that code matches both the fspec and aspec
- No iteration closes with open Reviewer blockers

### Functional Correctness
- Generated puzzles are valid: unique solution, correct difficulty rating
- All puzzle rules are correctly enforced

### Accessibility
- Hard requirement: keyboard navigable, correct ARIA roles, screen reader compatible

### UX Quality
- User reviews and approves UX at each milestone boundary
- The Orchestrator schedules these checkpoints explicitly

### Performance
- All user-facing actions complete in **under 1 second**
- Thresholds are adjustable as we learn more about the domain

### Iteration Exit Criteria
An iteration is complete when all of the following are true:
1. All tests pass
2. Branch coverage is 100%
3. Reviewer has signed off (no open blockers)
4. Functional correctness validated
5. All user-facing actions meet the performance threshold
6. A11y requirements met
7. User has approved UX at the current milestone boundary
