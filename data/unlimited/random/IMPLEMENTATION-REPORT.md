# Random Unlimited: implementation report (local, held for review)

2026-10-18. Branch `feature/unlimited-random`, local only, in the worktree `C:\Users\leviw\cluevoyance-unlimited`. It is based on `442bb8e` (the tested 32-board candidate). **Push, PR, merge and deploy are on hold.** The live site is unchanged: main `a98a9b0`, 16 fixed boards. Built on Opus 5.5 with paid extras off; there were no content-generation calls, paid APIs, new credentials or database changes.

## What it does

- **Play and Next** build a new random board in the browser. There is no server, API or database involved.
- **Pairs:** four disjoint eligible pairs (eight distinct target words) drawn from `src/unlimited/random-library.json`.
- **Hints:** each pair serves exactly its library choice, which is the approved canonical hint or the stable provisional top. Only an approved equal set would be varied, at random among its playable members; the current data has none, so that path is tested on synthetic data. An approved set with no playable member yields no choice, never a weaker fallback. Every board has four distinct hint texts.
- **Fillers:** 20 words drawn at random without replacement from the fixed 50-word list minus the eight targets. All 7 cards and 28 words are distinct.
- **Geometry and difficulty:** the game's existing geometry, ported unchanged from the reviewed assembler. Easy, Standard, Expert and Hardcore still deal 0, 1, 2 and 3 extra cards with the same mechanics.
- **Randomness:** a fresh secure seed per board (`crypto.getRandomValues`) and an unbiased Fisher–Yates shuffle. Up to 60 random draws are tried, and pairs from the last 3 boards are skipped when possible. If every draw dead-ends, an exhaustive backtracking search runs, so the generator only fails when no valid board exists at all. If generation ever fails, the fallback is the next unplayed fixed board, and failing that a "try again" message. With the real library, all 5,500 checked seeds succeeded on the random path.
- **Frozen at creation:** each board gets a unique stable id (`r-<created-at base36>-<seed base36>`) and is saved whole, cards, solution, clues and full reveal text, into this browser's history (`cv_unlimited_v1.boards`) when it starts. Refresh, Continue, the Played list and Replay always resolve that exact saved board and never re-roll it. The Download export includes the frozen boards it refers to.
- **Old history stays valid:** fixed-pool ids (beta-01/02 live, beta-03 local) still resolve to `pool.json`. Their played records, feedback and in-progress games keep working, and their frozen reveal snapshots are untouched. `pool.json` is byte-identical to `442bb8e`.

## Library export (`scripts/unlimited/export-random-library.mjs`)

| | Count |
|---|---|
| Library pairs | 1,225 |
| Pairs with a playable hint | 981 |
| Under the DIAMOND+SNAKE generation hold | 1 |
| **Eligible for random boards** | **980** (150 approved canonical, 830 stable provisional top) |
| Approved equal sets in current data | 0 (path tested synthetically) |
| Served hints containing their own target | 0 |

The task brief said 981 eligible pairs. The difference is the one pair under the parent's earlier generation hold, which stays excluded. Held and rejected hints are never exported. The file is 287 KB, 45 KB gzipped, and carries a content hash and its source commit.

## Files changed (versus 442bb8e)

- `src/unlimited/generate.js` (new): the pure generator, plus `validateBoard`.
- `src/unlimited/random-library.json` (new, generated): the served-choice library.
- `src/unlimited/history.js`: frozen `boards` map; `resolveBoard`, `recentPairIds`, `playedTotal`; export includes boards. The store stays version 1, and older stores load unchanged.
- `src/unlimited/UnlimitedView.jsx`: Play and Next generate; Continue and Replay resolve snapshots; the Played list covers fixed and random history, newest first, with each random board's clues.
- `src/unlimited/unlimited.css`: one style for the clue summary.
- Tests: `src/unlimited/generate.test.js` (new) and `history.test.js` (compatibility tests). `scripts/unlimited/check-random.mjs` runs the full `check-boards` over generated boards, and `tests/unlimited/random-check.mjs` is the browser test.
- `tests/unlimited/smoke.mjs`, `append-check.mjs` and `append-check-32.mjs` are marked SUPERSEDED, not deleted. They encode the old play-the-next-fixed-board flow; `random-check.mjs` covers the same paths for random play.

## Test results

See `test-outputs/` in the bundle.

| Check | Result |
|---|---|
| Unit tests (vitest, all) | 145 / 145 pass, including 11 generator tests and 9 history tests |
| Generator tests | seed determinism; 3,000 seeds structurally valid; only served choices; recent-pair avoidance; no ordering bias (early vs late library pairs within 12%); equal-set variation; single-choice collision; equal set fully collided means no choice; exhaustive fallback and the impossible case; uniform shuffle |
| History tests | a store written before random boards loads unchanged; snapshot frozen on start and never replaced; Replay counted, first result kept; export includes boards; fixed pool untouched |
| `check-random.mjs`: full `check-boards` over generated boards | 500/500 and 5,000/5,000 pass (server rules, distinct one-word clues, 28 distinct words, reveal faces the right words, `bestSubmit` at all four rotations, wrong placements refused, deal never solved at any difficulty, lives and lock transitions) |
| Fixed pool `check-boards` | 32/32 pass |
| Content script tests | 54 / 54 pass |
| Production build | succeeds; the Unlimited chunk is now 334 KB (63 KB gzip), up from 65 KB because it embeds the library. It is lazy-loaded on /unlimited only. |
| Lint | only the 4 pre-existing `src/App.jsx` errors, identical on live main (baseline); the new code adds none |
| Browser: `random-check.mjs`, phone 390×844 and desktop 1280×860 | PASS at both widths, 14 labelled screenshots (details below) |
| Browser: Daily smoke (phone 390×844) | PASS: daily game, tutorial, archive and admin unchanged |
| Browser: home and results (phone 390×844 and 320×568) | PASS: all home and results checks passed |
| Browser: Friends guest (phone 375×812, local stack) | PASS |

### Browser coverage (`random-check.mjs`)

At each viewport, for a guest with old fixed history (three beta-01 boards and a rated clue) and Daily data in the browser:
- **First board:** Play on Standard gives a random board frozen on start. A wrong guess costs a life. After a refresh it is the same board id, hints and card words, with the life still lost. Solving shows the frozen reveal.
- **Next and Continue:** Next opens a different board, with none of the previous board's pairs. Leaving and pressing Continue resumes that same board.
- **Replay:** replaying the first random board opens the exact saved board; the replay is counted and the snapshot is untouched. Replaying old fixed board beta-01-002 shows its pool snapshot, and its original loss is kept.
- **Difficulties:** Expert, Hardcore and Easy deal 2, 3 and 0 extra cards. An Easy game is lost after three wrong guesses and explained.
- **Export and integrity:** the Download holds the 5 frozen random boards and the fixed records. Old records and feedback stay byte-identical, the Daily keys stay byte-identical, and there are no page or console errors.

## Known limits and choices for review

- **Avoiding repeats:** only the last 3 boards' pairs are avoided, and only when possible. Board-level variety otherwise comes from 980 pairs and 50 words. There is no semantic or decoy analysis, as instructed.
- **History growth:** about 1.5 KB per random board; localStorage holds thousands. There is no cap yet.
- **Rolling back:** if this were rolled back, the old code would ignore `boards`, and an in-progress random game would simply show as not resumable. Fixed history is unaffected.
- **Owner feedback** (HEIST, DENTIST, SALEM, HALLOWEEN) is discussion only and unchanged; see `owner-feedback-notes.md`. Live DOUBLOON and BACK are untouched.
