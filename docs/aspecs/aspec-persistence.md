# Architectural Spec — Persistence, Statistics, and Storage
**Status:** Final
**Date:** 2026-04-30
**Author:** Architect
**Loaded by:** Implementor (Phase 5), Reviewer, QE Test Writer, QE Test Runner.

> **Also load:** `aspec-overview.md` — for the master directory tree and cross-cutting conventions.
> **Also load:** `aspec-game-state.md` — the persistence writer (§5 below) subscribes to `GameState` events; the stats wiring code blocks (§3 below) are referenced from action handlers in `aspec-game-state.md` §5.

---

## Table of Contents

1. [Cookies — `js/persist/cookies.js`](#1-cookies--jspersistcookiesjs)
2. [Storage — `js/persist/storage.js`](#2-storage--jspersststoragejs)
3. [Stats Wiring Inside the Reducer](#3-stats-wiring-inside-the-reducer)
4. [Resume Behavior](#4-resume-behavior)
5. [Persistence Writer](#5-persistence-writer)
6. [Statistics — `js/game/statistics.js`](#6-statistics--jsgamestatisticsjs)
7. [Stats Provider — `js/providers/statsProvider.js`](#7-stats-provider--jsprovidersstatsprovidjs)
8. [Cookie Stats Store — `js/providers/cookieStatsStore.js`](#8-cookie-stats-store--jsproviderscookiestatsstorejs)
9. [Future Stats Stores](#9-future-stats-stores)
10. [Persistence Schemas](#10-persistence-schemas)

---

## 1. Cookies — `js/persist/cookies.js`

```js
get(name: string) → string | null
set(name: string, value: string, { maxAge?, path?, sameSite? }) → void
remove(name: string, path?: string) → void
```

Defaults applied to all `set` calls:
- `maxAge = 60 * 60 * 24 * 365 * 2` (2 years)
- `path = '/'`
- `SameSite = 'Lax'`

---

## 2. Storage — `js/persist/storage.js`

Wraps `localStorage` with try/catch. All reads and writes fail silently in private-browsing mode or when `localStorage` is disabled. No errors propagate to callers.

Keys used (see §10.2 for schemas):
- `sudoku.state.v1` — current in-progress puzzle state
- `sudoku.pregen.v1.<difficulty>` — pre-generated next puzzle per tier (5 keys)
- `sudoku.currentDifficulty.v1` — last selected difficulty

---

## 3. Stats Wiring Inside the Reducer

These code blocks live inside `js/game/state.js` action handlers. They are listed here to co-locate all stats behavior, since `aspec-game-state.md` references them.

### 3.1 PEN_ENTER Handler

Immediately after a non-given cell transitions from empty to a non-empty pen value and `action.fromHint !== true`:
```js
if (!fromHint && prevValue === 0 && !state.attemptRecorded) {
  state.attemptRecorded = true;
  stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
}
```

### 3.2 HINT Handler

Immediately after the hint digit is written to `state.pen`:
```js
if (!state.attemptRecorded) {
  state.attemptRecorded = true;
  stats.recordAttemptOnce(state.puzzle.difficulty); // fire-and-forget
}
```

### 3.3 ON_COMPLETION_EVALUATE Handler

Branches on `CORRECTNESS_MODE[state.puzzle.difficulty]`:

**`'realtime'` or `'on-demand'`** — check if board is correct; on `correct && !state.winHandled`:
```js
state.won = true;
state.winHandled = true;
stats.recordWin(state.puzzle.difficulty); // fire-and-forget
```

**`'on-complete'`** — same win path as above; if `!correct`, highlight wrong cells and set `completionMessage = "Not quite — some cells are incorrect. Keep going!"`.

**`'on-complete-silent'`** — same win path as above; if `!correct`, no cell highlighting, set `completionMessage = "Not quite. Keep going!"` and schedule auto-clear.

`RESET_PUZZLE` does not touch `attemptRecorded` (per fspec §9.2 — "no stats impact").
`NEW_PUZZLE` resets `attemptRecorded` to `false`.

### 3.4 Behavioral Obligations (from fspec §11.1)

Stats increment rules:
- **Games attempted:** increments exactly once per puzzle instance, on whichever comes first: first pen digit entry or first hint use. Resuming a saved puzzle does not re-increment (`attemptRecorded` is persisted and restored). Resetting a puzzle does not re-increment (`attemptRecorded` preserved). Starting a new puzzle or changing difficulty resets `attemptRecorded` to `false` for the new instance.
- **Games won:** increments only on correct completion. Abandoning, resetting, or completing incorrectly does not affect games won.

---

## 4. Resume Behavior

On page load, if `sudoku.state.v1` exists in `localStorage` and is valid (see §10.3), the following resume flow applies (from fspec §13.2):

1. Restore the saved puzzle identity (givens, solution, id) into `state.puzzle`.
2. Restore saved pen digits into `state.pen`.
3. Restore saved pencil marks into `state.pencil`.
4. Restore saved `hintsRemaining`.
5. Set `difficulty` to match the saved puzzle's difficulty; update the difficulty selector.
6. No cell is selected (`state.selected = null`).
7. `activeMode` is `'pen'` (never persisted; always resets).
8. Recompute `state.conflicts` for the restored pen state; apply conflict flags where applicable.
9. Correctness flags from prior Check or completion attempt are **not** restored. The player starts the session without flags visible.
10. `attemptRecorded` restored from the saved blob.

### 4.1 What Is Saved (from fspec §13.1)

On every state-changing action (pen digit entry, pencil mark toggle, erase, hint use), write the following to `sudoku.state.v1`:
- Puzzle identity / givens (and solution for correctness checking)
- All committed pen digits (player-entered and hint-filled)
- All pencil marks
- Remaining hint count
- Whether `attemptRecorded` has been set for this puzzle

Active mode (`'pen'` / `'pencil'`) is **not** persisted; always resets to Pen on page load.

### 4.2 State Invalidation (from fspec §13.3)

`sudoku.state.v1` is cleared in the following cases:
- Player taps New Puzzle and confirms (or no confirmation required)
- Player changes difficulty and confirms
- Puzzle completion (win state)

---

## 5. Persistence Writer

Registered from `main.js` step 9 (see `aspec-game-state.md` §1.2). Single subscriber to state `'changed'` events:

- If `changed` intersects `{ puzzle, pen, pencil, hintsRemaining, attemptRecorded }`, schedule a debounced (100 ms) write of `sudoku.state.v1` via `persist/storage.js`.
- If `action.type === 'CHANGE_DIFFICULTY'`, synchronously write `sudoku.currentDifficulty.v1`.
- On `NEW_PUZZLE` action or when `won && winHandled` transitions to `true`, immediately clear `sudoku.state.v1` (puzzle is no longer resumable).

---

## 6. Statistics — `js/game/statistics.js`

Factory:
```js
createStatistics(provider: StatsProvider) → Statistics
```

Statistics interface:
- `init() → Promise<void>` — loads from provider, caches in memory, emits `'stats-changed'`.
- `get() → StatsMap` — returns the current cached map (synchronous).
- `recordAttemptOnce(difficulty: Tier) → Promise<void>` — increments `attempted` for that difficulty, persists via provider, emits `'stats-changed'`. The idempotency guard (checking `attemptRecorded`) is the caller's responsibility — see §3.1.
- `recordWin(difficulty: Tier) → Promise<void>` — increments `won`, persists, emits `'stats-changed'`.
- `on(type: string, listener: Function) → unsubscribe` — event subscription (built on `util/events.js`).

This module holds no storage knowledge. All persistence is delegated to the provider (§7). Construction and `await stats.init()` happen in `main.js` before UI mount (see `aspec-game-state.md` §1.2 step 3).

---

## 7. Stats Provider — `js/providers/statsProvider.js`

Factory:
```js
createStatsProvider(store: StatsStore) → StatsProvider
```

StatsStore adapter contract:
- `load() → Promise<StatsMap>` — resolves to stored map, or the zero-initialized default if missing/invalid. Never throws.
- `save(stats: StatsMap) → Promise<void>` — persists; best-effort (swallow I/O errors per persist-layer policy).

`StatsProvider` is a thin pass-through that currently delegates 1:1 to the store but serves as the stable seam if stats ever move server-side (retry/backoff, request coalescing would live here without touching `game/statistics.js`).

---

## 8. Cookie Stats Store — `js/providers/cookieStatsStore.js`

The v1 `StatsStore` implementation. Exports `cookieStatsStore` (singleton).

- Owns cookie name `'sudoku.stats'` and the on-the-wire schema from §10.1.
- `load()` — reads the cookie via `persist/cookies.js`, URL-decodes, JSON-parses, checks `version === 1`, returns the inner `stats` map; otherwise returns the default zero-counts map for all five difficulties.
- `save(stats)` — wraps `{ version: 1, stats }`, JSON-encodes, URL-encodes, calls `cookies.set('sudoku.stats', value, { maxAge: 2y, path: '/', sameSite: 'Lax' })`.

This is the only module outside `persist/cookies.js` that names the stats cookie.

---

## 9. Future Stats Stores

A server-backed store (e.g., `serverStatsStore.js`) would implement the same `StatsStore` contract against `fetch()`. Swapping requires a single edit in `main.js`: replace `cookieStatsStore` with the new store in the `createStatsProvider(...)` call. No other module changes.

---

## 10. Persistence Schemas

### 10.1 Cookies

`sudoku.theme` — value: one of `minimalist | coffee | school | terminal | mountain`.

`sudoku.stats` — JSON-encoded, URL-encoded:
```json
{
  "version": 1,
  "stats": {
    "kiddie":       { "attempted": 0, "won": 0 },
    "easy":         { "attempted": 0, "won": 0 },
    "medium":       { "attempted": 0, "won": 0 },
    "hard":         { "attempted": 0, "won": 0 },
    "death-march":  { "attempted": 0, "won": 0 }
  }
}
```
Max-age: 2 years. `Path=/; SameSite=Lax`.

### 10.2 localStorage Keys

`sudoku.state.v1` — current in-progress puzzle:
```json
{
  "version": 1,
  "difficulty": "hard",
  "puzzle": { "id": "...", "givens": [81 numbers], "solution": [81 numbers] },
  "pen": [81 numbers],
  "pencil": [81 numbers],
  "hintsRemaining": 3,
  "attemptRecorded": true,
  "savedAt": "2026-04-18T12:00:00Z"
}
```

`sudoku.pregen.v1.<difficulty>` — pre-generated next puzzle per tier:
```json
{
  "version": 1,
  "puzzle": { "id": "...", "givens": [...], "solution": [...], "solveTrace": [...] },
  "generatedAt": "2026-04-18T12:00:00Z"
}
```

`sudoku.currentDifficulty.v1` — last selected difficulty (plain string value, no JSON wrapping).

Note on typed arrays: `Uint8Array` and `Uint16Array` fields (givens, solution, pen, pencil, solveTrace cell indices) are serialized to plain `number[]` on write and restored to typed arrays on read. The provider (clientGenProvider for pregen, main.js persistence writer for game state) handles this conversion at the persistence boundary.

### 10.3 State Migration Policy

Each persisted blob carries `version: 1`. On read, if version is missing or not `1`, the blob is discarded and treated as empty. No migration code in v1.
