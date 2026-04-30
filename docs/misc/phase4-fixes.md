# Phase 4 QE Test Runner — Fix Report

**Status:** Triage complete. No fixes applied yet. All 23 failures from the first `npm test` run
are accounted for. This document is a complete, self-contained brief for applying them.

Run `npm test` to execute (Playwright/Mocha in headless Chromium). The test runner is
`test-runner/run.js`. Test entry point is `js/tests/setup.html`.

---

## Production Code Fixes

### 1. `js/generator/rater.js` — R6: unsolvable board returns 'kiddie'

**Failing test:** R6 in `js/tests/unit/rater.test.js`
**Error:** `expected 'kiddie' to equal 'beyond-death-march'`

**Root cause:** Line 17: `const tier = tierForRank(hardestRank) ?? 'kiddie'`.
When a board is unsolvable (`solved=false`), `hardestRank=0`, `tierForRank(0)=null`,
so the nullish coalescing returns `'kiddie'`.

**Fix:** Replace line 17:
```js
// BEFORE
const tier = tierForRank(hardestRank) ?? 'kiddie';

// AFTER
const tier = solved ? (tierForRank(hardestRank) ?? 'kiddie') : 'beyond-death-march';
```

---

### 2. `js/generator/pipeline.js` — PL4: abort not checked after onProgress

**Failing test:** PL4 in `js/tests/unit/pipeline.test.js`
**Error:** abort signal is not respected when onProgress triggers the abort.

**Root cause:** `throwIfAborted()` is called at the top of the while loop but NOT immediately
after the `onProgress` callback. If `onProgress` sets the abort signal, execution continues
through the current iteration and may return a result before the next loop iteration checks.

**Fix:** In the `if (opts.onProgress && ...)` block, add a `throwIfAborted()` call after
the callback:
```js
// BEFORE
if (opts.onProgress && now - lastProgressMs >= 100) {
  opts.onProgress({ attempts, budget });
  lastProgressMs = now;
}

// AFTER
if (opts.onProgress && now - lastProgressMs >= 100) {
  opts.onProgress({ attempts, budget });
  lastProgressMs = now;
  opts.abortSignal?.throwIfAborted();
}
```

---

### 3. `js/game/statistics.js` — ST8: save() rejection propagates

**Failing test:** ST8 in `js/tests/unit/statistics.test.js`
**Error:** test's awaited `recordAttemptOnce()` call throws because `provider.save` rejects.

**Root cause:** Both `recordAttemptOnce` and `recordWin` call `await provider.save(cache)`
with no error handling. When the provider's `save` rejects, it propagates out of the
public API methods.

**Fix:** Add `.catch(() => {})` to both save calls (lines 44 and 50):
```js
// BEFORE (both occurrences)
await provider.save(cache);

// AFTER (both occurrences)
await provider.save(cache).catch(() => {});
```

---

### 4. `js/config.js` — PP2/PP6/PP9/PP10: WORKER_URL resolves incorrectly in test context

**Failing tests:** PP2, PP6, PP9, PP10 in `js/tests/unit/puzzleProvider.test.js`
**Error:** `{"isTrusted":true}` — an ErrorEvent is thrown instead of a puzzle. This is
`worker.onerror` firing because the Worker 404s.

**Root cause:** Line 70: `export const WORKER_URL = './js/worker/generator.worker.js'`.
This relative URL is resolved against the calling document's base URL. When the test suite
runs at `http://localhost:3001/js/tests/setup.html`, the base URL is `/js/tests/`, so
the Worker is requested at `/js/tests/js/worker/generator.worker.js` — which doesn't exist.

**Fix:** Change to an absolute path (line 70):
```js
// BEFORE
export const WORKER_URL = './js/worker/generator.worker.js';

// AFTER
export const WORKER_URL = '/js/worker/generator.worker.js';
```

---

### 5. `js/providers/clientGenProvider.js` — PP: worker.onerror passes ErrorEvent not Error

**Failing tests:** PP2, PP6, PP9, PP10 (same tests as fix #4; this is a secondary defensive fix)
**Error:** Rejected promise carries an ErrorEvent object instead of an Error.

**Root cause:** In the `worker.onerror` handler (line ~81):
```js
cb.reject(err);  // err is an ErrorEvent, not an Error
```

**Fix:**
```js
// BEFORE
worker.onerror = function (err) {
  for (const [id, cb] of pending) {
    pending.delete(id);
    cb.reject(err);
  }
};

// AFTER
worker.onerror = function (err) {
  for (const [id, cb] of pending) {
    pending.delete(id);
    cb.reject(new Error(err.message || 'Worker error'));
  }
};
```

---

### 6. `js/main.js` — PE7: CHANGE_DIFFICULTY never persists difficulty

**Failing test:** PE7 in `js/tests/integration/persistence.test.js`
**Error:** `expected 'easy' to equal 'hard'` — localStorage still has the old difficulty.

**Root cause:** The persistence writer (~line 223) only writes `DIFF_KEY` when
`changed.has('puzzle') && s.puzzle?.difficulty`. When `CHANGE_DIFFICULTY` fires before a
puzzle is loaded (`state.puzzle === null`), `s.puzzle?.difficulty` is undefined → falsy →
the key is never written. Even when puzzle IS loaded, the puzzle change fires
*synchronously* and the saved value can be overwritten by the async PUZZLE_LOADED
event with the original difficulty.

**Fix:** In the `gameState.on('changed', ...)` handler, add a direct branch for
`CHANGE_DIFFICULTY` before the existing puzzle-change branch:
```js
// BEFORE
  // Persist current difficulty immediately on any puzzle change.
  if (changed.has('puzzle') && s.puzzle?.difficulty) {
    setItem(DIFF_KEY, s.puzzle.difficulty);
  }

// AFTER
  // Persist difficulty immediately on explicit change or puzzle load.
  if (action.type === 'CHANGE_DIFFICULTY') {
    setItem(DIFF_KEY, action.difficulty);
  } else if (changed.has('puzzle') && s.puzzle?.difficulty) {
    setItem(DIFF_KEY, s.puzzle.difficulty);
  }
```

---

### 7. `js/worker/generator.worker.js` — W4/W5: abort/priority broken due to synchronous generation

**Failing tests:** W4 (`expected true to be false`), W5 (`Expected foreground first but got: bg, fg`)

**Root cause:** `generateForTier` runs synchronously and blocks the Worker's event loop.
The Worker's `onmessage` handler cannot process a `GEN_ABORT` (or a new `GEN_REQUEST`)
while `generateForTier` is executing. Both W4 and W5 rely on messages arriving and
being processed *during* generation.

**Fix:** Make `processNext` async and add a `setTimeout(0)` yield at the start. This yields
control to the event loop so any queued messages (GEN_ABORT, new GEN_REQUEST) are processed
before generation begins. Add a `processing` guard to prevent concurrent execution.

Replace the entire `processNext` function:
```js
// BEFORE
function processNext() {
  if (queue.length === 0) return;

  const req = queue[0];
  aborted = false;

  const rng = mulberry32(req.seed);

  // AbortSignal polyfill via the internal `aborted` flag.
  const signal = {
    get aborted() { return aborted; },
    throwIfAborted() {
      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
    },
  };

  let puzzle;
  let fallback = false;

  try {
    puzzle = generateForTier(req.tier, {
      rng,
      seed: req.seed,
      budget: req.budget,
      abortSignal: signal,
      onProgress({ attempts, budget }) {
        self.postMessage(makeGenProgress({ id: req.id, attempts, budget }));
      },
    });

    // Detect fallback: the returned puzzle's difficulty differs from requested.
    if (puzzle.difficulty !== req.tier) {
      fallback = true;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Request was aborted — silently discard, process next in queue.
      queue.shift();
      processNext();
      return;
    }
    self.postMessage(makeGenError({ id: req.id, message: err.message }));
    queue.shift();
    processNext();
    return;
  }

  self.postMessage(makeGenResult({ id: req.id, puzzle, fallback }));
  queue.shift();
  processNext();
}
```

```js
// AFTER
let processing = false;

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const req = queue[0];
  aborted = false;

  // Yield to the event loop so any pending GEN_ABORT or GEN_REQUEST messages
  // that arrived between postMessage calls can be processed before we start.
  await new Promise(r => setTimeout(r, 0));

  if (aborted) {
    // This request was aborted before generation started.
    processing = false;
    processNext();
    return;
  }

  const rng = mulberry32(req.seed);

  const signal = {
    get aborted() { return aborted; },
    throwIfAborted() {
      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
    },
  };

  let puzzle;
  let fallback = false;

  try {
    puzzle = generateForTier(req.tier, {
      rng,
      seed: req.seed,
      budget: req.budget,
      abortSignal: signal,
      onProgress({ attempts, budget }) {
        self.postMessage(makeGenProgress({ id: req.id, attempts, budget }));
      },
    });

    if (puzzle.difficulty !== req.tier) {
      fallback = true;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      queue.shift();
      processing = false;
      processNext();
      return;
    }
    self.postMessage(makeGenError({ id: req.id, message: err.message }));
    queue.shift();
    processing = false;
    processNext();
    return;
  }

  self.postMessage(makeGenResult({ id: req.id, puzzle, fallback }));
  queue.shift();
  processing = false;
  processNext();
}
```

Also declare `let processing = false;` at module scope alongside `let queue = []` and
`let aborted = false`.

**Trace for W4** (GEN_REQUEST then immediate GEN_ABORT):
1. GEN_REQUEST processed: queue=[req], `processNext()` called, `processing=true`
2. `await setTimeout(0)` — yields to event loop
3. GEN_ABORT processed: `aborted=true`, `queue=[]`
4. `processNext` resumes: `aborted=true` → `processing=false`, calls `processNext()` → queue empty → returns
5. No GEN_RESULT posted ✓

**Trace for W5** (background then foreground):
1. GEN_REQUEST(bg): queue=[bg], `processNext()` called, yields
2. GEN_REQUEST(fg): `aborted=true`, `queue=[fg,bg]`, no new `processNext` (queue.length=2)
3. `processNext` resumes (was bg): `aborted=true` → `processing=false`, calls `processNext()`
4. New `processNext`: `req=fg`, `aborted=false`, yields
5. No abort arrives → runs `generateForTier(fg)`, posts GEN_RESULT(fg) ← fg first ✓
6. `queue.shift()` → `queue=[bg]`, calls `processNext()`
7. Processes bg, posts GEN_RESULT(bg) ✓

---

## Test Fixture / Test Code Fixes

### 8. `js/tests/unit/bitset.test.js` — B8: wrong binary literal

**Failing test:** B8
**Error:** `expected [ 1, 6, 8 ] to deeply equal [ 1, 3, 5 ]`

**Root cause:** `0b010100001` has bits 0, 5, 7 set → digits [1, 6, 8].
The correct literal for digits [1, 3, 5] (bits 0, 2, 4) is `0b000010101`.

**Fix:** Line 60:
```js
// BEFORE
expect(iterate(0b010100001)).to.deep.equal([1, 3, 5]);

// AFTER
expect(iterate(0b000010101)).to.deep.equal([1, 3, 5]);
```

---

### 9. `js/tests/fixtures/techniques/hiddenSingle.js` — HS1/HS2: box contamination

**Failing tests:** HS1 (`expected null not to be null`), HS2 (same)

**HS1 root cause:** `b2[1] = 7` places 7 at r0c1, which is in **box0** (rows0–2, cols0–2).
The target cell18 (r2c0) is also in box0 → box0 has 7 placed → cell18 loses 7 as candidate.
No hidden single exists.

**HS1 fix:** Change `b2[1] = 7` to `b2[28] = 7` (r3c1). r3c1 is in col1 (still blocks
cell19 via col1) but is in box3, outside box0. Cell18 keeps 7 as candidate.
```js
// BEFORE (line 52)
b2[1] = 7;  // col 1 row 0: blocks cell 19 (row2 col1)

// AFTER
b2[28] = 7;  // col 1 row 3: blocks cell 19 (row2 col1) without contaminating box0
```

**HS2 root cause:** `bb[3] = 3` places 3 at r0c3, which is in **box1** (rows0–2, cols3–5).
The target cell14 (r1c5) is also in box1 → box1 has 3 → cell14 loses 3. No hidden single.

**HS2 fix:** Change `bb[3] = 3` to `bb[6] = 3` (r0c6). r0c6 is in row0 (still blocks
cell5 via row0) but is in box2, outside box1. Cell14 keeps 3 as candidate.
```js
// BEFORE (line 77)
bb[3] = 3;  // row 0 → blocks cell 5 (row0, col5)

// AFTER
bb[6] = 3;  // row 0 col6 → blocks cell 5 (row0 col5) without contaminating box1
```

---

### 10. `js/tests/fixtures/techniques/nakedSubsets.js` — NT2: digit 8 not blocked from triple cells

**Failing test:** NT2 (nakedTriple223)
**Error:** `expected null not to be null`

**Root cause:** After clearing `b[71]=0`, col8 has `{4,5,6,7,9}` placed. The three
triple cells are:
- Cell8 (r0c8): row0 has `{3}` (b[2]=3) → candidates = `{1,2,8}` (not `{1,2}`)
- Cell17 (r1c8): row1 has `{1}` (b[9]=1) → candidates = `{2,3,8}` (not `{2,3}`)
- Cell26 (r2c8): row2 has `{2}` (b[20]=2) → candidates = `{1,3,8}` (not `{1,3}`)

Union = `{1,2,3,8}` — size 4, not 3. `nakedSubsets` returns null.

**Root cause detail:** Digit 8 was removed from col8 when `b[71]=0` was cleared (b[71] was
originally `8`). Nothing in the construction blocks 8 from cells 8, 17, 26.

**Fix:** All three triple cells are in **box2** (rows0–2, cols6–8). Place 8 in box2 at a
cell outside col8 — e.g. `b[7] = 8` (r0c7):

Add this line after `b[20] = 2;` and before `b[71] = 0;`:
```js
// ADD this line (blocks 8 from all of box2, including cells 8, 17, 26)
b[7] = 8;  // r0c7 — box2 has 8 → cells 8,17,26 all lose 8
```

After this fix:
- Cell8: col8`{4,5,6,7,9}` + row0`{3,8}` + box2`{8}` → loses `{3,4,5,6,7,8,9}` → `{1,2}` ✓
- Cell17: col8`{4,5,6,7,9}` + row1`{1}` + box2`{8}` → `{2,3}` ✓
- Cell26: col8`{4,5,6,7,9}` + row2`{2}` + box2`{8}` → `{1,3}` ✓
- Cell71 (target): col8`{4,5,6,7,9}` only (in box8, not box2) → `{1,2,3,8}` ✓ (eliminations fire)

---

### 11. `js/tests/fixtures/techniques/coloring.js` — SC1/SC2/SC3: broken sc1Board construction

**Failing tests:** SC1, SC2, SC3 (all use `sc1` fixture)
**Error:** `expected null not to be null`

**Root cause:** The fixture IIFE for `sc1` (lines ~19–469) contains extensive exploration
code left as executable statements. The critical issues:

1. `sc1Board[1] = 5` (line 406): Places 5 at r0c1. Row0 now has 5 placed →
   ALL row0 cells (including chain targets 0 and 2) lose 5 as candidate.

2. `sc1Board[10] = 5` (line 412): r1c1 is in **box0** (rows0–2, cols0–2). Box0 has 5 →
   cells 0, 2, 18, 20 all lose 5. The entire chain is destroyed.

**Intended chain:** Cells 0(r0c0), 2(r0c2), 18(r2c0), 20(r2c2) with digit 5. Links:
row0(0–2), col0(0–18), row2(18–20), col2(2–20). Color0={0,20}, Color1={2,18}.
Rule 2: cells 0 and 20 share box0 → color0 eliminated.

**Fix:** Replace the sc1Board construction block. Find the section starting with:
```
sc1Board[1] = 5; // r0c1=5 → row0 has 5 at col1 ...
```
and ending with:
```
sc1Board[80] = 5;
// Row0 now: cells 1,3-8 blocked via their columns. ...
```
(This is approximately lines 406–424 plus the multi-paragraph comment block that follows
through ~line 456.)

Replace ALL those lines with:
```js
  sc1Board[17] = 5; // r1c8 — blocks row1 (cell9 loses 5) and col8 (cell8 loses 5)
  sc1Board[28] = 5; // r3c1 — blocks col1 (cell1,19 lose 5) and row3
  sc1Board[39] = 5; // r4c3 — blocks col3 (cell3,21 lose 5) and row4
  sc1Board[49] = 5; // r5c4 — blocks col4 (cell4,22 lose 5) and row5
  sc1Board[59] = 5; // r6c5 — blocks col5 (cell5,23 lose 5) and row6
  sc1Board[69] = 5; // r7c6 — blocks col6 (cell6,24 lose 5) and row7
  sc1Board[79] = 5; // r8c7 — blocks col7 (cell7,25 lose 5) and row8
  // Row0: 5 only at cells 0,2 (cells 1,3–8 blocked via their columns/col8). Bilocation. ✓
  // Col0: 5 only at cells 0,18 (rows1,3–8 blocked via row placements). Bilocation. ✓
  // Row2: 5 only at cells 18,20 (cells 19,21–26 blocked via col placements). Bilocation. ✓
  // Col2: 5 only at cells 2,20 (rows1,3–8 blocked via row placements). Bilocation. ✓
  // Box0 has 5 in cells {0,2,18,20} — count=4, no bilocation link via box0.
  // BFS: 0=c0; row0→2=c1; col0→18=c1; row2→20=c0; col2→20=c0 (consistent).
  // Color0={0,20}: 0(r0c0) and 20(r2c2) both in box0 → peers → Rule2 fires.
```

The `expected` block in the return statement (lines ~461–466) already has the correct values:
```js
    eliminations: [
      { cellIndex: 0,  digit: 5 },
      { cellIndex: 20, digit: 5 },
    ],
```
Leave those unchanged.

**Scope note:** The `sc1` IIFE also contains earlier abandoned exploration code using
variables `b`, `c`, `d`, `e` (lines ~20–395). These don't cause errors — they just compute
and discard arrays. Leave them in place; only fix the `sc1Board` construction.

---

### 12. `js/tests/fixtures/techniques/forcingChains.js` — XYC1/XYC2: invalid board breaks chain

**Failing tests:** XYC1, XYC2 (XYC2 reuses xyc1 board)
**Error:** `expected null not to be null`

**Root cause (two problems):**

1. `b[36] = 3` (r4c0) AND `b[38] = 3` (r4c2): both place digit 3 in **row4** —
   two instances of the same digit in a row → invalid board.

2. `b[36] = 3` places 3 in **col0**. Cell0 (r0c0) is the chain start (should be `{1,3}`):
   - row0 missing = `{1,3,7}`, col0 has `{7,3}` → cell0 = `{1}` — naked single, not bivalue!
   - The XY-chain can't start.

**Intended chain:** A=cell0`{1,3}` — B=cell2`{3,7}` — C=cell20`{7,9}` — D=cell18`{9,1}`.
Z=1. Elimination: cells seeing both A(r0c0) and D(r2c0) lose 1 (e.g. cell9, r1c0).

**Fix (lines ~43–51 of the xyc1 IIFE):**

```js
// BEFORE
  b[21] = 2; b[22] = 4; b[23] = 5; b[24] = 6; b[25] = 8;
  // row2 missing = {1,3,7,9}. Cells 18,19,20,26 have {1,3,7,9} from row.
  // Block 3 and 7 from cell18 (to get {1,9}): col0 has {7}(b[27]) → cell18 loses 7. ✓
  // Block 3 from cell18 via col0 or row: col0 needs 3. b[36]=3 (r4c0).
  b[36] = 3; // col0 → cell18 loses 3. Cell18 = {1,9}. ✓ (row missing {1,3,7,9} minus col{7,3} = {1,9})
  // Block 1 and 3 from cell20 (to get {7,9}): col2 has {1}(b[29]) → loses 1. ✓
  // Block 3 from cell20 via col2: b[29]=1 doesn't block 3. Need 3 in col2:
  b[38] = 3; // r4c2 → col2 → cell20 loses 3. Cell20 = {7,9}. ✓

// AFTER
  b[21] = 3; b[22] = 4; b[23] = 5; b[24] = 6; b[25] = 8; b[26] = 2;
  // row2 has {2,3,4,5,6,8} given → missing {1,7,9}.
  // Cell18 (r2c0): row2 missing {1,7,9}; col0 has {7}(b[27]) → loses 7. = {1,9}. ✓
  // Cell20 (r2c2): row2 missing {1,7,9}; col2 has {1}(b[29]) → loses 1. = {7,9}. ✓
  // Cell0 (r0c0): row0 missing {1,3,7}; col0 has {7}(b[27]) only → loses 7. = {1,3}. ✓
  // Cell2 (r0c2): row0 missing {1,3,7}; col2 has {1}(b[29]) → loses 1. = {3,7}. ✓
```

Changes in plain terms:
- `b[21] = 2` → `b[21] = 3` (blocks 3 from row2 instead of 2)
- Add `b[26] = 2` at end of that line (blocks 2 from row2, keeping cell18 as `{1,9}` not `{1,2,9}`)
- Delete the entire `b[36] = 3;` line and its comments
- Delete the entire `b[38] = 3;` line and its comments

---

### 13. `js/tests/fixtures/techniques/xyWing.js` — position2: ReferenceError `d is not defined`

**Failing tests:** XYW1–XYW5 (module load failure causes all to fail)
**Error:** `ReferenceError: d is not defined` (page error visible in browser console)

**Root cause:** `position2`'s IIFE (starting at line 105) contains extensive exploration code
using variables `b`, `c`, `e`, `f`, `g`, `h`, `k`, `m`, `n`, `p`, `q`. At the very end
(lines 395–404), the return statement references `d`:
```js
  return {
    board: d, // reuse position1's board; test just verifies technique fires
    state: makeState(d),
```
`d` is declared in **`position1`'s** IIFE (a different scope) and is not accessible
in `position2`'s IIFE. This throws a ReferenceError when the module evaluates, causing
the entire xyWing.js module to fail, breaking XYW1–XYW5.

**Fix:** Add an inline `baseBoard` construction just before the `return` statement in
`position2`'s IIFE, and reference it in the return. This is identical to what `position3`
already does correctly (lines 477–483).

```js
// BEFORE (at the end of position2's IIFE, lines ~395–405)
  return {
    board: d, // reuse position1's board; test just verifies technique fires
    state: makeState(d),
    expected: {
      placements: [],
      eliminations: [{ cellIndex: 24, digit: 7 }],
    },
    description: 'XY-Wing: hinge in column peer configuration',
    source: 'sudokuwiki.org/Y_Wing_Strategy',
  };
})();

// AFTER
  const baseBoard = (() => {
    const bd = new Uint8Array(81);
    bd[0] = 2; bd[1] = 4; bd[2] = 5; bd[3] = 6; bd[5] = 8; bd[7] = 9;
    bd[14] = 7; bd[15] = 3;
    bd[19] = 1; bd[21] = 2; bd[22] = 3; bd[23] = 5; bd[24] = 7; bd[25] = 8; bd[26] = 9;
    return bd;
  })();

  return {
    board: baseBoard,
    state: makeState(baseBoard),
    expected: {
      placements: [],
      eliminations: [{ cellIndex: 24, digit: 7 }],
    },
    description: 'XY-Wing: hinge in column peer configuration',
    source: 'sudokuwiki.org/Y_Wing_Strategy',
  };
})();
```

**Note:** The `baseBoard` values are the same as what `position3` uses (and what `position1`'s
final `d` variable contained). The `d is not defined` error causes all 5 XYW tests to fail
even though only position2 is broken, because the module-level error prevents the whole file
from exporting.

---

### 14. `js/tests/integration/a11y.test.js` — A13: waitForPuzzle resolves before puzzle loads

**Failing test:** A13: `expected 'Hint — no hints remaining' to satisfy [Function]`

**Root cause (two issues):**

1. `waitForPuzzle` checks for 81 `.cell` elements in the DOM. The grid is mounted
   immediately (before puzzle generation completes), so `waitForPuzzle` can return while
   `gameState.getState().puzzle === null`. The initial `hintsRemaining` is `0` (see
   `state.js` line 47), so the hint button renders with label `'Hint — no hints remaining'`
   (no digit, no 'unlimited') before the puzzle loads and sets the proper hint count.

2. Previous integration tests (game-flows, persistence) may leave a `sudoku.state.v1`
   blob in localStorage with `hintsRemaining: 0` (e.g. after hints are exhausted). Since
   all iframes at `localhost:3001` share storage, subsequent a11y test iframes restore this
   depleted state.

**Fix:** Two changes to `a11y.test.js`:

**a) Enhance `waitForPuzzle` to also wait for puzzle state:**
```js
// BEFORE
async function waitForPuzzle(iframe, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      if (doc.querySelectorAll('.cell').length === 81) return resolve();
      setTimeout(check, 100);
    }
    setTimeout(check, 300);
  });
}

// AFTER
async function waitForPuzzle(iframe, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() > deadline) return reject(new Error('Timed out'));
      const doc = iframe.contentDocument;
      if (!doc) return setTimeout(check, 100);
      const cellsReady = doc.querySelectorAll('.cell').length === 81;
      const gs = iframe.contentWindow?.gameState;
      const puzzleLoaded = gs && gs.getState().puzzle !== null;
      if (cellsReady && puzzleLoaded) return resolve();
      setTimeout(check, 100);
    }
    setTimeout(check, 300);
  });
}
```

**b) Clear saved state in `beforeEach`:**
```js
// BEFORE
  beforeEach(async function () {
    this.timeout(15000);
    iframe = createIframe();
    await waitForPuzzle(iframe);
  });

// AFTER
  beforeEach(async function () {
    this.timeout(15000);
    localStorage.removeItem('sudoku.state.v1');
    iframe = createIframe();
    await waitForPuzzle(iframe);
  });
```

---

### 15. `js/tests/integration/persistence.test.js` — PE8: puzzle null after second iframe load

**Failing test:** PE8: `expected null not to be null`

**Root cause:** `loadIframe()` calls `waitForPuzzle()` which resolves when 81 DOM cells
are present — but the grid renders immediately (before puzzle generation). After
`loadIframe()` returns, `gs2.getState().puzzle` is still `null` because the async
`requestPuzzle()` hasn't resolved yet.

**Fix:** Add a polling wait after the second `loadIframe()` call in PE8. Find the PE8 test
and replace:
```js
// BEFORE (lines ~190–199)
    iframe = await loadIframe();
    const gs2 = iframe.contentWindow.gameState;
    if (!gs2) return this.skip();

    // Should load a fresh puzzle, not the stale blob.
    // The state should be valid but puzzle may differ; importantly no crash.
    expect(gs2.getState().puzzle).to.not.be.null;

// AFTER
    iframe = await loadIframe();
    const gs2 = iframe.contentWindow.gameState;
    if (!gs2) return this.skip();

    // Wait for async puzzle generation to complete.
    const deadline = Date.now() + 10000;
    while (gs2.getState().puzzle === null && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Should load a fresh puzzle, not the stale blob.
    expect(gs2.getState().puzzle).to.not.be.null;
```

---

### 16. `js/tests/integration/system.test.js` — SYS3: puzzle null after iframe load

**Failing test:** SYS3: `expected null not to be null`

**Root cause:** Same timing issue as PE8. `waitForPuzzle(iframe, 15000)` resolves when DOM
cells appear, but death-march generation is async. `gs.getState().puzzle` is null immediately
after `waitForPuzzle` returns.

**Fix:** Add a polling wait in SYS3 after `waitForPuzzle`:
```js
// BEFORE (lines ~112–128)
    const t0 = performance.now();
    iframe = createIframe();
    await waitForPuzzle(iframe, 15000);
    const elapsed = performance.now() - t0;

    const gs = iframe.contentWindow.gameState;
    if (gs) {
      const state = gs.getState();
      // If a DM puzzle loaded, verify.
      if (state.puzzle?.difficulty === 'death-march') {
        console.log(`[SYS3] Death March load time: ${elapsed.toFixed(0)} ms`);
        expect(elapsed).to.be.below(5000);
      }
      // If a different difficulty loaded (fallback), puzzle is still valid.
      expect(state.puzzle).to.not.be.null;
    }

// AFTER
    const t0 = performance.now();
    iframe = createIframe();
    await waitForPuzzle(iframe, 15000);

    const gs = iframe.contentWindow.gameState;
    if (gs) {
      // Wait for async puzzle generation to complete.
      const deadline = Date.now() + 10000;
      while (gs.getState().puzzle === null && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100));
      }

      const elapsed = performance.now() - t0;
      const state = gs.getState();
      if (state.puzzle?.difficulty === 'death-march') {
        console.log(`[SYS3] Death March load time: ${elapsed.toFixed(0)} ms`);
        expect(elapsed).to.be.below(5000);
      }
      expect(state.puzzle).to.not.be.null;
    }
```

---

## Verification Checklist

After applying all fixes, run `npm test`. Expected outcome:

- [ ] B8: `iterate(0b000010101)` → `[1, 3, 5]`
- [ ] HS1, HS2: hiddenSingle returns placement, not null
- [ ] NT2 (nakedTriple223): returns 3 eliminations on cell71
- [ ] SC1, SC2, SC3: simpleColoring returns eliminations on `sc1` board
- [ ] XYC1, XYC2: xyChain returns non-null on `xyc1` board
- [ ] XYW1–XYW5: no ReferenceError; position2 uses in-scope `baseBoard`
- [ ] R2: `rate()` on easy puzzle returns `'easy'` (downstream of HS fix)
- [ ] R6: `rate()` on unsolvable board returns `'beyond-death-march'`
- [ ] PL4: abort after onProgress is respected
- [ ] ST8: `recordAttemptOnce` with rejecting provider does not throw
- [ ] PP2, PP6, PP9, PP10: worker resolves correctly (absolute URL fix)
- [ ] W4: GEN_ABORT prevents GEN_RESULT
- [ ] W5: foreground before background
- [ ] PE7: CHANGE_DIFFICULTY persists difficulty to localStorage
- [ ] PE8: puzzle non-null after version:2 blob reload
- [ ] A13: hint button label contains digit or 'unlimited'
- [ ] SYS3: puzzle non-null after death-march cold start

Once all tests pass, run coverage:
```
npx c8 --reporter=text node test-runner/run.js
```
Target: **100% branch coverage**.
