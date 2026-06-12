# V3 Feature Candidates

---

## Extended Difficulty Tiers with Coached Solving

**Origin:** Conversation, 2026-05-11

> **Superseded (2026-06-11).** This section is an early sketch. The investigation it called for has
> been done; current decisions, level breakdown/naming, and the staged build plan live in
> `docs/misc/v3-harder-tiers-brief.md` (with deeper analysis in
> `docs/misc/v3-harder-tiers-exploration.md`). Read those, not this section, for the live plan.

### Background

The V1/V2 technique ladder runs ranks 1–15, topping out at Forcing Chain (AIC). The five
difficulty tiers are:

| Tier | Hardest rank |
|---|---|
| Kiddie | 1 |
| Easy | 2 |
| Medium | 3–7 |
| Hard | 8–11 |
| Death March | 12–15 |

"Death March" sounds extreme, but in the broader sudoku solving community, AIC is roughly
upper-intermediate to expert — not the ceiling. There is a substantial class of techniques
beyond rank 15 that serious hobbyists study. The generator currently rejects puzzles
requiring any of them.

### Techniques Beyond Rank 15

Roughly in ascending difficulty:

- **XYZ-Wing / WXYZ-Wing** — generalizations of XY-Wing to 3/4-candidate pivots
- **Finned Fish** (Finned X-Wing, Finned Swordfish) — fish patterns with extra "fin" cells
- **Unique Rectangles** (Types 1–6+) — exploit the unique-solution constraint; several variants
- **ALS-XZ** — two Almost Locked Sets sharing a restricted common digit
- **ALS-XY Wing / ALS-AIC** — progressively more powerful ALS chains
- **3D Medusa** — multi-digit coloring across chains
- **Death Blossom** — stem cell with ALS "petal" sets
- **Grouped AIC** — chain nodes that are candidate groups rather than single candidates
- **Exocet** — high-level base/target pattern; very powerful and rare
- **Forcing Nets** — branching inference trees (approaches brute force)
- **Pattern Overlay Method** — enumerate all placements of a digit; brute-force-adjacent

### Coaching Feasibility Assessment

The current `CoachStep` schema (cell roles + arrow vocabulary + complexity acknowledgment)
can be extended with varying levels of effort depending on the technique class.

**Clean extensions** (schema unchanged or one new role):
- XYZ-Wing, WXYZ-Wing — structural relatives of XY-Wing; hinge/wing role pattern maps directly
- Finned X-Wing / Swordfish — add a "fin" cell role; same connector-chain arrows

**Feasible with effort** (new role types needed):
- Unique Rectangles — clean 4-cell visual, but the uniqueness-constraint justification
  is harder to compress into one description line
- ALS-XZ — cause/elimTarget roles work, but communicating *which candidates define the set*
  (not just which cells) requires a new visual concept (candidate-set "blob")
- 3D Medusa — multi-digit coloring; scA/scB visual works but gets cluttered

**Breaks the coaching model** (fundamental structural limits):
- ALS-AIC, Grouped AIC — chain nodes that are candidate groups rather than single candidates;
  the arrow system assumes one candidate per node
- Death Blossom — stem + multiple ALS blobs; no clean linear representation
- Forcing Nets — branching inference tree; the arrow system is built for linear chains only
- At this level, the complexity acknowledgment ("here are the endpoints, trace it yourself")
  is already the graceful-degradation ceiling — which is what rank 15 already does

### V3 Proposal

1. **Add 3–5 new technique ranks** covering XYZ-Wing, WXYZ-Wing, Finned X-Wing, Finned
   Swordfish, and one or two Unique Rectangle variants. These slot cleanly into the existing
   architecture.
2. **Introduce a new tier** (e.g., "Nightmare" or similar) for ranks 16–20.
3. **Extend the coach** with full explanations for the clean-extension techniques and
   complexity-acknowledged partial explanations for ALS/Medusa techniques (analogous to
   the existing rank 14–15 treatment).
4. **Accept the coaching ceiling** — for techniques beyond grouped AIC, coaching can name
   the technique, highlight key cells, and acknowledge it cannot walk the player through
   the full inference. This is honest and still useful.

### Open Questions for V3 Requirements Analysis

- What should the new tier be called? "Death March" was the previous ceiling; a new tier
  above it needs to signal genuine expert territory without hyperbole inflation.
- Should Unique Rectangles be implemented? They rely on the unique-solution constraint
  rather than pure logical elimination — philosophically different from the rest of the ladder.
- Is there a target audience for ranks 16+? V1/V2 are aimed at general web users; a tier
  above Death March may serve a niche that warrants its own UX considerations (e.g., an
  "expert mode" toggle rather than a default difficulty option).
- Generator retry limits may need revisiting — harder puzzles are rarer and may require
  significantly more generation attempts.

---

## Left-Hand Layout Mode

**Origin:** Conversation, 2026-05-24

### Background

The current layout places the control panel (number pad, mode toggles, action buttons) to
the right of the board. On a laptop with a touchscreen, a left-handed user reaching for
the controls with their left hand must cross over the board, obscuring it while interacting.

### Proposal

Add a layout toggle that mirrors the UI — moving the control panel to the left of the
board. The board itself stays centered within the panel arrangement; only the side on which
the controls appear changes.

The toggle would be a persistent preference (saved alongside theme and other settings) so
the user does not need to re-select it each session.

### Open Questions for V3 Requirements Analysis

- Should the toggle live in a settings panel, or be a always-visible button (e.g., in the
  header)?
- Does the number pad layout itself need to mirror (right-to-left digit order), or is
  positional mirroring of the panel sufficient?
- Are there other asymmetries in the layout (e.g., coach panel placement) that would also
  need to flip?

---

## Puzzle Sharing via URL

**Origin:** Conversation, 2026-05-24

### Background

Players may want to send a specific puzzle to a friend or revisit a puzzle they found
interesting. Encoding the puzzle into the URL makes this zero-infrastructure — no server
storage required, just a link.

### Proposal

Encode the puzzle's given cells into a URL query parameter or hash fragment (e.g.,
`?puzzle=<encoded-string>`). When the app loads and detects this parameter, it
initializes the board from the encoded puzzle rather than generating a new one. The
recipient starts from the same given cells with no progress — a fresh attempt at the
same puzzle.

A "Share" button (or copy-link action) would generate and copy the URL to the clipboard.

### Open Questions for V3 Requirements Analysis

- Hash fragment (`#`) vs. query parameter (`?`): fragment stays client-side and never
  hits the server; query parameter is more conventional but leaks to server logs.
- Should the shared URL also encode difficulty tier, so the recipient sees the correct
  label?
- What encoding scheme? A simple 81-character string (digit or `.` for empty) is
  human-readable; base64 or similar is more compact but opaque.
- Should an in-progress game state (fills, pencil marks) optionally be shareable, or
  only the givens?
