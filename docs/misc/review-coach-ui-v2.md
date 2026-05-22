# Coach UI Review (V2)

Reviewer pass against `docs/fspecs/fspec-002-coach.md`, `docs/vspecs/vspec-002-coach.md`,
and `docs/aspecs/aspec-coach-ui.md`. Date: 2026-05-22.

## Section 1 — Blockers / decision item

No purely-internal blockers. **D1 RESOLVED 2026-05-22:** Product Director confirmed that
C firing from a focused button is the intended behavior (decided in an earlier session;
shipped in commit `e07727d`). Resolution path (b) chosen — the fspec was amended rather
than the code. `fspec-002 §3.1` now states the shortcut is ignored only inside text-entry
elements and intentionally fires when a button is focused. Code and tests (CT-KB2) already
matched this; they are now consistent with the spec. **Coach UI signs off clean.**

**D1 (resolved) — 'C' shortcut focus guard omits BUTTON (fspec §3.1, line 211)**

- *Spec requires:* the 'C' shortcut "is ignored when focus is inside a text input, select,
  textarea, or **button** element."
- *Implementation does* (`js/ui/coach.js:76–77`): guards only `INPUT`/`SELECT`/`TEXTAREA`;
  BUTTON is omitted, so pressing 'C' while any button is focused triggers Coach.
- *Conflict:* existing integration tests (CT-KB2 per `next-session.md`) deliberately assert
  the current trigger-on-button behavior. So **code and tests agree with each other but
  contradict the fspec** — a three-way disagreement.
- *Resolution paths:* (a) add `'BUTTON'` to the guard at `coach.js:77` and flip CT-KB2; or
  (b) amend fspec §3.1 to drop "button" and keep current behavior. Needs Product Director /
  Functional Designer decision. Verified against source by the Orchestrator.

## Section 2 — Fidelity assessment (otherwise clean)

**Functional (fspec-002):** coach button placement/availability/states (§3); triggering —
normal, no-technique, session reset (§4); highlights + cell selection (§5); candidate
auto-reveal + revert (§6); explanation panel lifecycle (§7); post-fill recap normal/error/
elim variants (§9); state lifecycle transitions (§10); hint-button interaction (§11.1); win
precedence (§11.3); conflict detection + pencil auto-clear (§11.4–11.5); a11y keyboard nav,
ARIA, live-region announcements (§12). All implemented.

**Visual (vspec-002):** coach accent color per theme (§1); numpad 2-row restructure (§2);
button idle/coaching/error states + 2s pulse keyframes (§3); all coached-cell classes —
cause/target/elim-target/unit-member/sc-a/sc-b (§4); focus-visible ring override (§4,
§12.3); auto-reveal `.coach-reveal` styling (§5); SVG arrow overlay (§6); panel
animation/typography/ARIA (§7); recap toast variants (§8–9); all five themes (§11);
responsive deferral (§13). Matches.

**Architectural (aspec-coach-ui):** CoachSession slice shape + all fields (§2.1);
`deriveCoachedCells` unions all role cells (§2.3); all six COACH_* actions (§3); reducer
interaction with PEN_ENTER/ERASE/PENCIL_TOGGLE/HINT/NEW_PUZZLE/RESET_PUZZLE/
CHANGE_DIFFICULTY/PUZZLE_LOADED/ON_COMPLETION_EVALUATE (§4); pencil snapshot + revert
formula (§5); `coach.js` mount contract, button wiring, focus tracking, panel/recap render
(§6); `coachOverlay.js` CustomEvent coupling + arrow rendering (§7); index.html DOM
additions (§8); main.js mount order (§9); numpad HTML/CSS restructure (§10); CSS additions
(§11); a11y wiring (§12); recap (2.5s) + error (5s) timer lifecycle (§13). Matches.

## Section 3 — Non-blocking observations

- `js/ui/coach.js:28` comment says "3s error toast auto-dismiss"; actual timeout is 5000ms
  (correct per fspec §4.2). Comment typo — fix when convenient.
