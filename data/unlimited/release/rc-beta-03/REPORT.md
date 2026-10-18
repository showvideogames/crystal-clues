# Cluevoyance Unlimited: release-readiness report (beta-03 candidate)

2026-10-18. **Status: ready for owner review. Push, merge and deploy are on HOLD.**

- **Live site:** unchanged at main `a98a9b0`, serving **16 boards** (pool SHA-256 `dddd17a34ff84d5b82d699dcc0fc6f576862edc7d36290c7d265ac2a6cb82bbb`).
- **Local candidate:** branch `feature/unlimited-batch-02` in the worktree `C:\Users\leviw\cluevoyance-unlimited`, HEAD `0d982e000c498874e8fadeb9d3e65f23dca87a42`. It holds **32 boards**: the 16 live boards byte-identical, plus beta-03 at indices 17–32. Pool SHA-256: `99f43d46d63cce8966578f2b492cb7feed5d81e8a3b3d0723f265ee3d3f95b42`.
- **Nothing pushed, merged or deployed.** No live writes, no new analytics and no database changes. Browser tests ran only against the local dev server (127.0.0.1:5192) and the local stack. The final authoring/review batches u27–u32 and release-readiness work used Opus 5.5; earlier batches retain their recorded Fable provenance, including recovered u26. Paid extras remained off.

## What changed versus live main

| Area | Files | What |
|---|---|---|
| App bundle | `src/unlimited/pool.json` | +16 boards (beta-03, indices 17–32). The first 16 boards are identical as JSON objects to live main. This is the only app change. |
| Tests | `tests/unlimited/append-check-32.mjs` (new), `smoke.mjs` (log text), `live-check.mjs` (earlier wording fix) | Test-only. |
| Content data | `data/unlimited/**` | The 1,225-pair library, reviews, preferences, beta-03 candidate and checkpoints. Not bundled. |
| Scripts | `scripts/unlimited/**` | Content pipeline and its tests. Not bundled. |

`src/App.jsx` and all other app code are identical to live main. The source and test diff is in `diff-vs-live-main-src-tests.patch`, and the 68 commits since live main are listed in `commits-since-live-main.txt`. The real append differs from the simulation reviewed at d86fc3d only in the `appended` timestamp of the beta-03 batch entry; all 32 boards are identical.

## Browser suites (each run once against the committed harness)

| Suite | Viewports | What it covered | Result |
|---|---|---|---|
| `append-check-32.mjs` (new) | phone 390×844 (touch) and desktop 1280×860 | Seeded guest with 15 of 16 played (mixed results, a replay, a rated clue). Puzzle 16: one wrong guess, refresh resumes, solve, frozen reveal. Next to 17 (beta-03-001): four distinct hints, wrong guess, refresh resumes, solve, reveal, rating, note, Copy. Next to 18 (beta-03-002): solve, reveal. Download export holds the new records and the 15 seeded ones unchanged. Seeded records stay byte-identical throughout, and no Daily key is written. | PASS, 12 labelled screenshots |
| `smoke.mjs` (existing) | phone 390×844, desktop 1280×900 | Over the 32-board pool: Standard win, refresh resume, why-these-clues, note and Copy at once, Download, Easy loss with reveal, note kept through Next, leave and Continue, Expert, Hardcore, desktop resume, all 32 played (exhaustion message), Replay counted once with the loss kept. Seeded Daily storage stays byte-identical. | PASS. The log line "all eight played" was stale test wording; the check covered all 32, and the line is annotated in the saved output and fixed in the harness. |
| `daily-smoke.mjs` (existing) | phone 390×844 | Daily game: wrong guess, refresh keeps progress, solve, stats; tutorial, archive, admin visibility and admin deal. | PASS |
| `home-results.mjs` (existing) | phone 390×844 and 320×568 | Front page, daily screen, results, archive, error and retry states, signed-in summary and inbox. | PASS ("All home & results checks passed.") |
| `guest.mjs` (Friends, existing) | phone 375×812 | Puzzle by link: guest play with a refresh, win, sign-up, send back, expired and fresh links. Writes only to the local stack. | PASS |

### Difficulty coverage

| Difficulty | Extra cards | Exercised in |
|---|---|---|
| Easy | 0 | smoke (loss with reveal; Continue) |
| Standard | 1 | smoke (win), append-check-32 (puzzles 16, 17, 18 at both viewports) |
| Expert | 2 | smoke |
| Hardcore | 3 | smoke |

## Static checks

| Check | Result |
|---|---|
| `check-boards.mjs` on the full 32-board pool | 32/32 pass (server rules, one-word clues, distinct hints, `bestSubmit` at all four rotations, deal never solved at any difficulty, state transitions) |
| Production build (`vite build`, run once into a scratch dir) | Success, built in 1.6 s; UnlimitedView chunk 64.97 kB (16.35 kB gzip) |
| Game unit tests (vitest) | 130 / 130 pass |
| Content script tests (node --test, including the 7 reconciliation regressions) | 54 / 54 pass |
| Lint | 4 errors, all pre-existing in `src/App.jsx`, identical on live main a98a9b0, out of scope (see below) |

### Pre-existing lint diagnostics (baseline, out of scope)

Running ESLint on `src/App.jsx` gives the same four errors at HEAD and on live main a98a9b0, and the file is byte-identical between them:

- `1772:34` 'dim' is defined but never used (no-unused-vars)
- `3840:7` calling setState synchronously within an effect (react-hooks)
- `4224:9` 'adminDateLabel' is assigned a value but never used (no-unused-vars)
- `5296:35` duplicate key 'height' (no-dupe-keys)

The new test file adds no lint errors.

## Screenshots

- `screens/`: the new-board run at phone and desktop. Each carries an injected **TEST DATA / LOCAL CANDIDATE** banner; the banner is test-only DOM, and the app is unchanged. `previews/` holds 320-px copies.
- `smoke-screens/` and `guest-friends-screens/`: the existing suites' own screenshots, from the local dev server and local stack. They show the first boards and Friends flows, and are not bannered.

## Test logs

`test-outputs/`: append-check-32, unlimited-smoke-32 (annotated), daily-smoke, home-results, friends-guest, check-boards-pool-32, production-build, vitest, script-tests, lint.

## To release later (owner decision)

Push the branch, open a PR, merge, let Vercel deploy, then run `tests/unlimited/live-check.mjs` against production. None of this has been done.
