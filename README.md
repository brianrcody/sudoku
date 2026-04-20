# Sudoku

A single-page Sudoku web application. No framework, no build step — vanilla HTML, CSS,
and ES module JavaScript. Puzzles are generated client-side using a logical solver and a
technique-ladder difficulty rater.

## Features

**Five difficulty levels**

| Level       | Hints | Feedback                                        |
|-------------|-------|-------------------------------------------------|
| Kiddie      | ∞     | Real-time — incorrect cells flagged as entered  |
| Easy        | 3     | On-demand Check button                          |
| Medium      | 1     | On-demand Check button                          |
| Hard        | 0     | On completion only                              |
| Death March | 0     | On completion only, no cell highlighting        |

**Gameplay**
- Pen and pencil mark modes
- Arrow-key and tab navigation; system keyboard never invoked
- Puzzle state persisted across page loads (`localStorage`)
- Per-difficulty statistics (games played, win rate, best/average time) persisted in cookies
- New Puzzle confirmation when a game is in progress

**Visual themes** — Minimalist, Ocean, Coffee, Terminal, Sunset. Theme persisted in a
cookie; applied before first paint (no flash).

**Accessibility** — keyboard navigable, ARIA roles, screen reader compatible.

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
├── generator/              # Puzzle generation, difficulty rating, attempt budgeting
├── providers/              # SolverHintProvider
├── game/                   # Game state machine
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
`docs`, `test-runner`) to the hosting provider via SFTP/FTP.

## License

[MIT](LICENSE)
