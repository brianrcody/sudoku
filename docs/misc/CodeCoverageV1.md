# Code Coverage Report — v1

**Date:** 2026-04-30
**Test run:** 407 passing, 0 failing, 16 pending
**Coverage tool:** c8 (V8 coverage via Playwright `page.coverage`)
**Target (per CLAUDE.md / tspec §3.12):** 100% branch coverage
**Status:** **Not met — 90.84% branch overall**

---

## 1. Headline numbers

| Metric | Result | Target |
|---|---|---|
| Statement | 96.58% | — |
| Branch | **90.84%** | **100%** |
| Function | 98.01% | — |
| Line | 96.58% | — |

The branch gap (~9 points) is the only one that matters per the iteration
exit criteria. Statement, function, and line numbers are reported for
context only.

---

## 2. Branch coverage by file

Sorted lowest-first. Files at 100% branch coverage are listed at the end.

### Below 100%

| File | Branch % | Line % | Uncovered lines |
|---|---|---|---|
| `js/ui/srLive.js` | 66.66 | 100 | 17, 27 |
| `js/main.js` | 69.76 | 88.97 | 14, 167–168, 184–195, 203, 213–217 |
| `js/game/state.js` | 73.84 | 96.68 | 316–317, 323–324, 355–358, 369–372 |
| `js/ui/numpad.js` | 79.48 | 84.03 | 118, 135, 137–138, 140–141, 205–207 |
| `js/generator/rater.js` | 80.00 | 100 | 17 |
| `js/ui/themes.js` | 81.81 | 98.30 | 57 |
| `js/generator/pipeline.js` | 84.00 | 94.16 | 121–128 |
| `js/ui/controls.js` | 85.00 | 100 | 51, 72–73 |
| `js/ui/stats.js` | 85.71 | 100 | 71, 78 |
| `js/persist/cookieStatsStore.js` | 87.50 | 97.05 | 63–64 |
| `js/generator/fillGrid.js` | 88.23 | 94.73 | 22–24 |
| `js/persist/storage.js` | 90.00 | 95.74 | 45–46 |
| `js/ui/winBanner.js` | 90.00 | 100 | 42 |
| `js/solver/techniques/forcingChains.js` | 90.47 | 86.56 | 181–198, 227–242 |
| `js/ui/dialog.js` | 91.66 | 100 | 97 |
| `js/ui/grid.js` | 92.06 | 98.46 | 190–192 |
| `js/providers/clientGenProvider.js` | 92.50 | 93.77 | 69–75, 81–85, 205–206 |
| `js/solver/techniques/coloring.js` | 93.97 | 95.69 | 64–65, 68–69, 124–125, 128–129 |
| `js/providers/hintProvider.js` | 94.11 | 97.10 | 65–66 |
| `js/ui/keyboard.js` | 96.00 | 100 | 17 |
| `js/util/events.js` | 96.29 | 100 | 51 |
| `js/solver/uniqueness.js` | 97.05 | 100 | 45, 170 |
| `js/solver/techniques/xyWing.js` | 97.72 | 100 | 36 |

### At 100% branch coverage

`js/config.js`, `js/prng.js`,
`js/game/conflicts.js`, `js/game/correctness.js`, `js/game/statistics.js`,
`js/generator/removeCells.js`,
`js/persist/cookies.js`,
`js/providers/puzzleProvider.js`, `js/providers/statsProvider.js`,
`js/solver/candidates.js`, `js/solver/logical.js`,
`js/solver/techniques/{hiddenSingle,hiddenSubsets,index,jellyfish,lockedCandidates,nakedSingle,nakedSubsets,swordfish,xWing}.js`,
`js/util/bitset.js`, `js/util/grid.js`,
`js/worker/protocol.js`.

---

## 3. Coverage by area (rolled up)

| Area | Branch % | Notes |
|---|---|---|
| `js/util/` | 98.27 | Almost there; `events.js:51` is the only gap |
| `js/solver/` (root) | 98.23 | `uniqueness.js:45, 170` |
| `js/solver/techniques/` | 96.32 | `coloring`, `forcingChains`, `xyWing` carry the gap |
| `js/persist/` | 94.11 | `storage.js:45–46`, `cookieStatsStore.js:63–64` |
| `js/providers/` | 92.30 | `clientGenProvider.js` is the largest gap |
| `js/generator/` | 87.71 | Worker-resident code — see §4 caveat |
| `js/ui/` | 87.50 | Many small gaps across DOM modules |
| `js/game/` | 79.39 | Almost entirely from `state.js` |
| `js/` (root: `main.js`) | 74.00 | Boot wiring — see §4 caveat |
| `js/worker/` | 100 | `protocol.js` only |

---

## 4. Caveats and context

These materially affect how to interpret the gaps. **Read this before
deciding which gaps are real.**

### 4.1 Worker-only code paths are invisible to `page.coverage`

Per **tspec §4.2 item 5**, Playwright's `page.coverage` API captures the
main frame only. Code that runs inside a `Worker` thread is not measured
by this report. The project addresses this by importing worker-side
modules directly in unit tests (so they execute in the main frame too).

This means coverage gaps in **`js/generator/pipeline.js` (84.00%)**,
**`js/generator/fillGrid.js` (88.23%)**, and
**`js/generator/rater.js` (80.00%)** could be either:
- (a) real gaps the unit tests miss, *or*
- (b) branches that only execute inside the actual Worker thread when
  generation runs end-to-end through `clientGenProvider`, which the
  direct-import tests cannot reach.

These need eyes-on-source before deciding what to do about them.

`js/worker/protocol.js` is at 100% — that's the message-protocol module,
imported directly by tests, so it's well-covered through the
direct-import path.

### 4.2 `index.html` inline head script is exempt

**tspec §4.2 item 6** explicitly exempts the inline script in
`index.html` (functionally covered by UT7 but not c8-instrumented). This
report only covers `js/**`, so this exemption is already honored.

### 4.3 `js/main.js` is boot-up wiring

`main.js` at 69.76% branch is the largest absolute branch gap. It runs
on page load to wire up DOM, providers, and event listeners. Many of its
uncovered branches are likely defensive guards (missing DOM nodes,
hydration failures) that are difficult to exercise from a normal test
harness. Some of these may be candidates for `/* c8 ignore */` rather
than tests.

### 4.4 `js/game/state.js` is reducer code with deep conditional logic

The 73.84% branch coverage on `state.js` is more concerning than
`main.js` because the reducer is the heart of the app's correctness
story. tspec §1.2 explicitly chose branch coverage over statement
coverage *because* the reducer's correctness depends on every conditional
arm. Gaps here should default to "needs test" rather than ignore.

Lines 316–324 and 355–372 — worth reading the source to identify which
actions or guards are not exercised.

### 4.5 The HTTP/file URL plumbing is broken

The test runner (`test-runner/run.js`) writes coverage entries with HTTP
URLs (`http://localhost:3001/js/...`) into `coverage/coverage.json`.
`c8 report` expects `file://` URLs in `coverage/tmp/*.json`. Running
`npx c8 report` as documented in `next-session.md` produces a 0%
report.

To produce this report I rewrote the URLs by hand:

```js
// Read coverage/coverage.json, replace 'http://localhost:3001/' with
// 'file:///abs/path/to/repo/', write to coverage/tmp/coverage-1.json
```

**This wiring should be fixed in `run.js`** so that the documented
command works. tspec §3.12 also says `run.js` should fail nonzero below
100% — it currently doesn't enforce that gate at all.

This is a process bug independent of the coverage gaps themselves.

---

## 5. Suggested classification framework

Treating "100%" as a hard gate is not the only path forward. A practical
framework for resolving the gaps:

1. **Ignore (deliberate exemptions).** Defensive guards, environment
   probes, and bootstrap branches that exist only to crash gracefully
   when DOM / browser APIs are missing. Mark with `/* c8 ignore next */`
   and document why in a short comment. Likely candidates: parts of
   `main.js`, `srLive.js`, environment guards in `storage.js` and
   `cookieStatsStore.js`.
2. **Reachable through the test harness — write a test.** Anything in
   the reducer, solver, providers, or UI logic that a real user can
   trigger. Default for: `state.js`, `forcingChains.js`, `coloring.js`,
   `xyWing.js`, `uniqueness.js`, `clientGenProvider.js`,
   `hintProvider.js`, `numpad.js`, `grid.js`, the small one-line gaps
   across most UI modules.
3. **Worker-only — re-route through a direct-import test.** For
   `pipeline.js`, `fillGrid.js`, `rater.js`: import the offending
   functions directly in a unit test rather than going through the
   worker, so the branches are exercised in the main frame and counted.

Two further open questions for the Product Director:

- **Is "100% branch" a v1 hard gate, or a v1.x target?** CLAUDE.md and
  the tspec say yes, but at 90.84% with 407 tests the marginal cost of
  the last 9 points is non-trivial. Acceptable answers include
  "yes, fix it before sign-off", "yes, but worker-only and main.js gaps
  are exempt", and "no, document the gaps and ship".
- **Does fixing the `run.js` plumbing block v1 sign-off?** Strictly, the
  iteration exit criteria don't depend on it — the test gate ran fine —
  but the coverage gate isn't actually enforced in CI today.

---

## 6. Reproducing this report

```sh
npm test                                    # generates coverage/coverage.json
# (URL rewrite step — needs to be folded into run.js)
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('coverage/coverage.json', 'utf8'));
  const baseUrl = 'http://localhost:3001/';
  const fileBase = 'file://' + process.cwd() + '/';
  const result = data.result
    .filter(e => e.url.startsWith(baseUrl))
    .map(e => ({ ...e, url: e.url.replace(baseUrl, fileBase) }));
  fs.mkdirSync('coverage/tmp', { recursive: true });
  fs.writeFileSync('coverage/tmp/coverage-1.json', JSON.stringify({ result }));
"
npx c8 report --reporter=text --reporter=html \
  --include='js/**' --exclude='js/tests/**'
# HTML report at coverage/index.html
```

---

## 7. Recommendations to flag separately from the coverage decision

These are independent of where you land on the 100% target.

### 7.1 Fix the `run.js` → `c8 report` plumbing

The documented `npx c8 report` command in `next-session.md` produces a
0% report because `run.js` writes coverage with HTTP URLs but `c8`
expects `file://` URLs in `coverage/tmp/`. Two fixes belong together:

- Rewrite URLs to `file://` and write into `coverage/tmp/coverage-1.json`
  inside `run.js`, so `npx c8 report` works as documented.
- Enforce the coverage gate per **tspec §3.12** ("`run.js` script fails
  nonzero below 100%"). Today the gate is documentation only.

This is a process bug independent of the coverage gaps themselves and
worth fixing regardless of the v1 sign-off decision.

### 7.2 `js/game/state.js` is the gap I'd least want to ship

At 73.84% branch coverage, `state.js` is the most concerning gap on the
list — not because it's the largest (it isn't; `main.js` is) but
because of *what* it is. **tspec §1.2** picked branch coverage over
statement coverage specifically because the reducer's correctness
depends on every conditional arm being exercised. Gaps in the reducer
should default to "needs a test" rather than "ignore".

The other gaps have plausible rationalizations available — boot
wiring, defensive guards, worker-only paths. `state.js` does not. If
any single file deserves to be brought to 100% before v1 sign-off
regardless of the broader policy decision, this is it.

