# Sudoku

A single-page Sudoku web application. No framework, no build step — vanilla HTML, CSS,
and ES module JavaScript. Puzzles are generated client-side using a logical solver and a
technique-ladder difficulty rater.

## Features

**Seven difficulty levels**

| Level      | Hints | Feedback                                        |
|------------|-------|-------------------------------------------------|
| Kiddie     | ∞     | Real-time — incorrect cells flagged as entered  |
| Easy       | 3     | On-demand Check button                          |
| Medium     | 1     | On-demand Check button                          |
| Hard       | 0     | On completion only                              |
| Expert     | 0     | On completion only, no cell highlighting        |
| Diabolical | 0     | On completion only, no cell highlighting        |
| Nightmare  | 0     | On completion only, no cell highlighting        |

Expert is the former "Death March" tier (existing statistics carry over). Diabolical
puzzles require Unique Rectangle reasoning; Nightmare puzzles require ALS-XZ. Searching
for a top-tier puzzle can take a little while on a cold start — a progress line and a
Cancel button appear after a few seconds, and if no qualifying puzzle is found the app
says so honestly and offers the hardest one it generated instead.

**Gameplay**
- Pen and pencil mark modes; `P` toggles between them
- Arrow-key and tab navigation through all cells (including givens); `Home` jumps to the first cell; system keyboard never invoked
- One-level undo (Undo button or Ctrl/Cmd+Z)
- Erase all pencil marks in one tap
- Coach mode (`C`) — identifies the simplest applicable technique (Naked Single through
  Forcing Chain / AIC, plus Unique Rectangles and ALS-XZ at the top tiers), highlights
  relevant cells with an SVG arrow overlay, auto-reveals candidate marks when needed, and
  shows a step-by-step explanation below the grid; a recap confirms the technique after
  you apply the move. ALS-XZ uses deliberately limited coaching: the coach names the
  technique, highlights the two cell groups and the result, and leaves the tracing to you
- Puzzle state persisted across page loads (`localStorage`)
- Per-difficulty statistics (games played, win rate, best/average time) persisted in cookies
- New Puzzle confirmation when a game is in progress

**Visual themes** — Minimalist, Coffee Shop, School, Digital Terminal, Mountain. Theme
persisted in a cookie; applied before first paint (no flash).

**Left-handed layout** — a header switch moves the number pad, action buttons, and
statistics to the left of the board on wide screens (phones keep the stacked layout, and
the switch is hidden there). Keyboard and screen reader order are the same in both modes.
The preference is persisted in a cookie and applied before first paint.

**Share links** — the **Share** button copies a link to the current puzzle. The link
carries only the givens — 81 digits, `0` for an empty cell — in the `p` query parameter:

```
https://example.com/sudoku/?p=530070000600195000098000060800060003400803001700020006060000280000419005000080079
```

Your digits, pencil marks, and difficulty are never included. If the browser won't allow
clipboard access, the link is shown in a field to copy by hand. Opening a link validates
the puzzle (it must have exactly one solution), rates it with the same solver the
generator uses, and loads it with an empty board; `.` is also accepted for empty cells. If
you have a game in progress you are asked before it is replaced, and the parameter is
removed from the address bar once the link has been handled. A puzzle the solver can't
solve loads as **Unrated**: fully playable, with Check available, but without hints or
coach, and it never counts in the statistics. No server is involved.

**Accessibility** — keyboard navigable, ARIA roles, screen reader compatible.

## Developer Mode

Diagnostic tools for the solver, coach, and generator, hidden from players.

| URL | Effect |
|---|---|
| `?dev=1` | Turn developer mode on. The setting is saved in `localStorage` and persists |
| `?dev=0` | Turn it off and clear the saved setting |

When it is on, a **DEV** badge sits in the bottom-left corner and a *Developer tools*
panel appears below the game. **No statistics are recorded while developer mode is on.**
When it is off, none of the tooling is downloaded (`js/dev/devPanel.js`, `js/dev/inspect.js`,
and `css/dev.css` are loaded on demand).

| Tool | What it does |
|---|---|
| Load puzzle from string | Paste 81 cells (`1`–`9`; `0` or `.` for empty; whitespace ignored) and load them, bypassing the generator. Same validation, rating, and Unrated handling as a share link |
| Solver step inspector | Runs the logical solver on the current board (givens plus your digits) and lists every step. Select a step to highlight its placement, elimination, and pattern cells. Read-only; reports a stall explicitly |
| Candidate overlay | Shows computed candidates in every empty cell in place of pencil marks. Candidates you haven't marked are underlined; marks that aren't candidates are struck through. Your marks are never changed |
| Coach step data | The `CoachStep` object handed to the coach renderer, as JSON, with a copy button |
| Generation diagnostics | Requested vs. achieved tier, fallback, attempts, rejections (unsolvable / wrong tier, by tier), and the technique profile of the solve |

## Architecture

All puzzle logic runs in a Web Worker to keep the main thread responsive during
generation. The solver is shared between the Worker (generation) and the main thread
(hints) via ESM imports.

```
js/
├── solver/
│   ├── uniqueness.js       # Norvig-style constraint propagation
│   ├── logical.js          # Technique-ladder logical solver
│   └── techniques/         # Naked/hidden singles, subsets, X-Wing, XY-Wing,
│                           #   Swordfish, Jellyfish, coloring, forcing chains
├── generator/              # Puzzle generation, difficulty rating, attempt budgeting;
│                           #   loadPuzzle.js validates + rates externally supplied givens
├── providers/              # Puzzle, hint, stats, and load (share/dev) providers
├── game/                   # Game state machine; puzzleLoader.js (the one path for
│                           #   share links and developer load-from-string)
├── dev/                    # Developer mode: devMode.js (flag, always loaded);
│                           #   devPanel.js + inspect.js (lazy)
├── ui/                     # DOM rendering and event handling
├── persist/                # localStorage and cookie helpers
├── prng.js                 # mulberry32 seedable PRNG
└── worker/                 # Web Worker protocol
```

No third-party Sudoku library is used. All algorithms are clean-room implementations
(MIT-safe, no GPL contamination).

## Local Development

Open `index.html` directly in a browser — `file://` works with no server required.

For tests, a local server is needed because Playwright drives a real browser:

```sh
npx serve .        # or any static file server on localhost
npm test
```

Test output and coverage land in `coverage/`.

## Testing

Tests use **Mocha + Chai** running in a headless Chromium instance via **Playwright**.
Coverage is collected by **c8** (native V8 coverage, no transpilation).

```sh
npm test
```

Exit criteria: 100% branch coverage, all tests passing.

## Deployment

Static files only. Upload the project root (excluding `node_modules`, `coverage`,
`docs`, `test-runner`) to the hosting provider via SFTP/FTP. Share links resolve against
wherever `index.html` is served, so hosting under a sub-path needs no configuration.
Developer-mode files ship with the site but are only fetched by a browser that has
turned the mode on.

## License

[MIT](LICENSE)
