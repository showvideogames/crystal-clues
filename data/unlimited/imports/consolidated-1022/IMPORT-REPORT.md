# Consolidated offline batch import (consolidated-1022)

**Status: under review. Not merged, not published, not deployed to production.** Branch `feature/unlimited-import-consolidated`, stacked on `feature/unlimited-x04` (6984f62, the X23 pause checkpoint); PR #30 targets `feature/unlimited-x04`. No model calls: no drafting, no generation and no new reviews in any round.

Rounds:
- **Round 1:** the import.
- **Round 2 (owner, 2026-10-21):** no template sentence, the hyphen rule, content labels, the first owner choices.
- **Round 3 (owner review, 2026-10-22):** keeps, replacements and alternatives; Spider choices left open.

Each round rebuilds the library from the x04 base, so the steps below reproduce it exactly.

## Source

- Archive `Cluevoyance-final-consolidated.zip`, sha256 `b6d51bdf…d329c`.
- Import list: `unique-candidate-picks.csv` only (6,192 rows, sha256 `8d96fa2e…8b81`). Each pick carried only independent pass verdicts.
- **Not imported:** holds, rejects, raw attempts, partial batches and repair proposals. Small source notes are kept verbatim in `source/`.

## Counts

| Outcome | Count |
|---|---:|
| **New pairs added** | **6,069** |
| **Alternative hints on existing pairs** | **18** (8 now served as owner picks, 10 stored only) |
| Exact duplicates skipped | 22 |
| **Held back** (`editorial-set-aside.json`) | **83** |
| **Total** | **6,192** |

**Owner decisions** (`owner-decisions.json`, 28 decisions):
- 11 owner-written hints. Six of them are new pairs: DINGHY, FIVE ×2, PARKER (HUMAN), BEACH, REVOLVER.
- 1 owner hold: JAWS for SHARK + SWIMMING.

**Result:**
- Served export: 4,638 → **10,713 pairs, 10,726 served hint entries**, 1,203 words (unchanged).
- Library: 4,957 → 11,032 pair records, 12,876 stored hint entries.

**Previously served pairs that now serve a different hint (13, all owner choices; replaced hints stay stored):**
MOUSE + QUEEN → MINNIE, BELL + WATER → BUOY, ROBOT + TOY → TRANSFORMER, SPIDER + WEB → SILK, BOSS + TREE → BARKS, HONEY + WOOD → BEEHIVE, APPLE + POCKET → IPHONE, MAGNET + NORTH → COMPASS, MOON + SUN → ECLIPSE, OWL + WIZARD → HEDWIG, SHARK + SWIMMING → OCEAN, SLUG + SNAIL → SLIMY, TORNADO + WIZARD → OZ.

The other 4,625 previously served pairs are byte-identical. Stored hints that changed status: MINNIE (review FAIL → owner-approved, the FAIL kept in provenance), BUOY (owner text), and JAWS on SHARK + SWIMMING (owner hold).

## Round 3 decisions (owner review, 2026-10-22)

| Pair | Serves | Also stored | How |
|---|---|---|---|
| ENTRY + WINDOW | OPENING | | moved out of the set-asides, owner-approved |
| CAREER + EXPLORE | PATH | | moved out of the set-asides, owner-approved |
| GARAGE + HOSPITAL | REPAIR | | owner-approved (was already served) |
| CLOTHING + NECKLACE | FASHION | | owner-approved (was already served) |
| PHYSICAL + SPORT | ATHLETIC | FOOTBALL (owner alternative) | ATHLETIC canonical |
| BOOK + PARADISE | BEACH | | owner hint; LOST stays held |
| COWBOY + PISTOL | REVOLVER | | owner hint (labelled firearms-explosives); SIXSHOOTER stays held |
| BOSS + TREE | BARKS | BARK, BRANCH | owner hint, canonical |
| HONEY + WOOD | BEEHIVE | DIPPER (owner, second), POOH | BEEHIVE canonical |
| APPLE + POCKET | IPHONE | PICK | canonical |
| MAGNET + NORTH | COMPASS | POLE | canonical |
| MOON + SUN | ECLIPSE | APOLLO | canonical |
| OWL + WIZARD | HEDWIG | POTTER | canonical |
| SHARK + SWIMMING | OCEAN | FIN (owner alternative) | canonical; **JAWS owner hold** (rejections.json) |
| SLUG + SNAIL | SLIMY | SLIME, MOLLUSK | owner hint, canonical |
| TORNADO + WIZARD | OZ | KANSAS | canonical |

Unchanged as asked: SPICY + TACO (JALAPENO; CHILI stored) and the Spider choices below. The owner's calibration is recorded in `clue-generation-guide.md`: definition, category and straightforward links are welcome, and obscure references should not be used to make easy pairs harder.

## Reproduce

```
for f in pairs overrides preferences rejections: git show 6984f62:data/unlimited/library/$f.json > data/unlimited/library/$f.json
node scripts/unlimited/import-consolidated.mjs <unique-candidate-picks.csv>
node scripts/unlimited/variation-review.mjs merge data/unlimited/library/reviews/consolidated-1022-review.json data/unlimited/library/reviews/consolidated-1022-key.json
correct-text.mjs for each pair in line-swaps.json (lines swapped back, --by "coordinator (consolidated-1022 import)")
node scripts/unlimited/import-consolidated-owner.mjs      # replays owner-decisions.json with catalogue add / correct-text / overrides / preferences / rejections
node scripts/unlimited/apply-overrides.mjs && node scripts/unlimited/export-random-library.mjs
```

## Still open (short list)

1. **Spider choices, together:**
   - SPIDER + MAN serves PETER (import).
   - SPIDER + SUPERHERO serves PARKER, with PETER stored.
   - HUMAN + SPIDER serves PARKER (owner, round 2).
   - SPIDER + WEB serves SILK (settled).
   - Held respellings: CLIMBING + MARVEL and SUPERHERO + WEB → SPIDERMAN would become SPIDER-MAN.
2. **AIR** (FRAME + HELICOPTER) and **RECORDING** (TAP + VOICE): currently served; keep or hold?
3. **Spellings:** E-T → ET? BLACK-AND-WHITE? FAIRYTALE ×2? HALF-PIPE respelling?
4. **Set-asides made only on generic/definition grounds**, now worth a second look under your calibration: BAR + CAGE → METAL, FOREST + LAKE → PARK, MOTOR + PUMP → ELECTRIC, TIME + WEIGHT → MEASURE, DISTRICT + PRESS → NEWS, EDGE + ROW → BORDER, MISSILE + TARGET → GUIDANCE, FULL + SERVER → CAPACITY.
5. **Content:** confirm the 8 content holds (VAPE, HOOKAH, TEQUILA, ASSAULT, GORE, DROWN, AUTOPSY, HELL). Should labels later cover the older library?
6. **SPICY + TACO:** JALAPENO or CHILI, when you're ready.

## Loading

- Unchanged from round 2: the library ships only in the lazily loaded `UnlimitedView` chunk, behind the existing "Opening Unlimited…" fallback. Daily and the main page don't download it.
- When Unlimited opens, this branch transfers about 0.5–0.6 MB compressed (3.06 MB raw), against 82 KB live today.

## Production today and the route to it

- **Production:** `251e414` on `main` (PR #29), deployed 2026-10-19 03:46 UTC. It serves the x01 library: 1,125 pairs, 1,125 hint entries, 1,196 words.
- **`feature/unlimited-x04`** (104 commits, local work x02–x23 plus the handoff): 4,638 pairs / 4,651 entries. **This PR** brings it to 10,713 / 10,726.
- **Non-hint changes that reach production with x04 and this PR.** Every changed file is under `data/unlimited`, `unlimited-preview`, `scripts/unlimited`, `tests/unlimited` or `src/unlimited`. Only the last ships in the site bundle:
  - `UnlimitedView.jsx`: the "Why these clues worked" sheet shows an explanation sentence when a hint has one.
  - `unlimited.css`: one rule styling that sentence.
  - `generate.js`: two hints count as "the same" by letters and digits only (AC/DC = ACDC), when keeping a board's four hints distinct and when validating a board. GENERATOR_VERSION is unchanged.
  - The Unlimited word-bank snapshot grows from 1,196 to 1,203 words (BEE, CLOCK, CROW, GUN, GYM, NUMBER, PINK), so they can appear as Unlimited extras.
  - Everything else (scripts, tests, reports, previews, the 18 MB `pairs.json`) is repo-only and not bundled. `unlimited-preview/` is not in `public/`.
- **Daily does not change.** A local build of `main` reproduces production exactly (same Unlimited chunk name as live). Against this branch's build, every non-Unlimited file is byte-identical: Daily/home `index` code (apart from the Unlimited chunk filenames it references), the word-bank chunk, Friends, styles and images. Saved Unlimited boards are frozen snapshots and do not change.
- **Smallest safe route (not done; needs your approval):**
  1. Merge PR #30 into `feature/unlimited-x04`.
  2. Open a PR from `feature/unlimited-x04` to `main`. Its diff is x02–x23 plus this import, all inside the paths above.
  3. Check the Vercel **Preview** of that PR at /unlimited (a few boards, the reveal sheet) and confirm Daily looks the same.
  4. Merge to `main`. Vercel deploys `main` to production; no manual `vercel --prod` is needed.
  5. Rollback is a Vercel "promote previous deployment" (`251e414`) or a revert of the merge commit.
- **Alternative:** a hint-only branch from `main` that copies just `random-library.json` and the word-bank snapshot, plus the three small `src/unlimited` changes. The production result is the same, but provenance and the scripts stay off `main`, and x04 would conflict later. I do not recommend it, because x04 contains no non-Unlimited changes to avoid.

## Checks (this branch)

- `node --test scripts/unlimited/*.test.mjs`: 113/113. The consolidated-1022 test now checks every owner decision against `owner-decisions.json`. The x04 editorial-bar test now expects BARKS on BOSS + TREE; BARK and its history stay stored.
- `npx vitest run`: 172/172. A run overlapping a parallel `main` build timed out three tests; a clean rerun passed.
- `check-random.mjs`: 500/500 boards pass every check.
- `eslint scripts/unlimited src/unlimited`: clean.
- `npm run build`: OK.
