# Consolidated offline batch import (consolidated-1022)

**Status: under review. Not merged, not published, not deployed to production.** Branch `feature/unlimited-import-consolidated`, stacked on `feature/unlimited-x04` (6984f62, the X23 pause checkpoint); PR #30 targets `feature/unlimited-x04`. No model calls: no drafting, no generation, no new reviews.

Round 2 (owner feedback 2026-10-21): no template sentence, the hyphen rule, content labels, owner choices applied, review examples, a loading check, and a production check. The library was rebuilt from the x04 base, so the steps below reproduce it exactly.

## Source

- Archive `Cluevoyance-final-consolidated.zip`, sha256 `b6d51bdf…d329c`; offline reconciliation snapshot 2026-10-22T03:21:38Z.
- Import list: `unique-candidate-picks.csv` only (6,192 rows, sha256 `8d96fa2e…8b81`). Each pick carried only independent pass verdicts.
- **Not imported:** holds (2,070), rejects (364), raw attempts, the partial batches, and the repair proposals. The owner queue went through owner decisions instead (below). Small source notes are kept verbatim in `source/`.

## Counts

| Outcome | Count |
|---|---:|
| **New pairs added** (served) | **6,067** |
| **Alternative hints on existing pairs** | **18** (2 now served by owner choice, 16 stored only) |
| Exact duplicates skipped | 22 |
| **Held back** for later review (`editorial-set-aside.json`) | **85** |
| **Total** | **6,192** |

Owner choices added 4 more new pairs: DINGHY, FIVE ×2, PARKER (HUMAN). Totals:

- Served export: 4,638 → **10,709 pairs, 10,722 served hint entries** (1,203 words, unchanged).
- Library: 4,957 → 11,028 pair records, 12,867 stored hint entries.

Changes to what was already served, all owner choices:

| Pair | Was | Now |
|---|---|---|
| MOUSE + QUEEN | PUSSYCAT | MINNIE |
| BELL + WATER | DIVING | BUOY |
| ROBOT + TOY | PIXAR | TRANSFORMER |
| SPIDER + WEB | PARKER | SILK |

The other 4,634 previously served pairs are byte-identical. Only two existing stored hints changed: MINNIE and BUOY, which got status and text; their old text is kept in `provenance.textCorrection`. Owner holds and rejections are intact (404 overrides re-applied).

## Round-2 changes

1. **No template sentence.** Imported hints have an empty explanation sentence. The reveal sheet already shows the sentence only when present, so players see the two per-word lines. Two checks that demanded a sentence now require only the two lines: `check-boards.mjs` and `generate.test.js`. Owner-added hints keep the short sentence written from the owner's rationale.
2. **Hyphen rule (owner).** Genuinely common hyphenated words and names are allowed: WALL-E, SPIDER-MAN, PAC-MAN, SCI-FI, DOUBLE-DECKER, JACK-O-LANTERN, ITSY-BITSY, A-FRAME, CATCH-UP, PING-PONG, POST-IT; these are served. No artificial hyphens or run-together spellings to make a phrase one word. The 14 earlier spelling holds were revisited and **none was auto-accepted** (table below). The rule also caught 9 run-together spellings in the import (MACHINEGUN, FIRETRUCK…), now held.
3. **Content labels.** `contentFlags` (the existing COKE field) is set on 226 imported hints: alcohol 93, firearms-explosives 83, gambling 29, tobacco 12, violence 10. Rules are in `content-labels.json` and the list is in `labelled.csv`. Labels hide nothing; no filter was built. Bank membership was not treated as approval: 8 hints were held as content (VAPE, HOOKAH, TEQUILA via the Patrón brand, ASSAULT, GORE, DROWN, AUTOPSY, HELL), on top of the 6 earlier sensitive holds.
4. **Owner choices.** Applied with `catalogue.mjs add --by owner --approve --prefer`, `correct-text.mjs --by owner`, and owner overrides plus canonical preferences. Ledger: `owner-decisions-2026-10-21.json`. **SPIDER + MAN is not applied**; see the decisions section.

## Reproduce

```
git show 6984f62:data/unlimited/library/pairs.json > data/unlimited/library/pairs.json
node scripts/unlimited/import-consolidated.mjs <unique-candidate-picks.csv>
node scripts/unlimited/variation-review.mjs merge data/unlimited/library/reviews/consolidated-1022-review.json data/unlimited/library/reviews/consolidated-1022-key.json
correct-text.mjs for each pair in line-swaps.json (lines swapped back, --by "coordinator (consolidated-1022 import)")
owner steps in owner-decisions-2026-10-21.json
node scripts/unlimited/apply-overrides.mjs && node scripts/unlimited/export-random-library.mjs
```

## Hyphen revisit: the 14 earlier spelling holds

| Pair | Hint | Decision |
|---|---|---|
| ALIEN + CHILD, BIKE + SPACE | E-T | **questionable**: the film is E.T., and the rule has no period. ET (letters only, like NYC) is the allowed form. Your call |
| CHESS + PIANO | BLACK-AND-WHITE | **questionable**: a genuinely common hyphenated adjective (a black-and-white film), but a three-word phrase used as a noun. Your call |
| BITE + SAUSAGE | HOT-DOG | held: "hot dog" is two words |
| COLD + SOFT | ICE-CREAM | held: two words |
| DRESS + HOLLYWOOD | RED-CARPET | held: two words |
| COCKTAIL + WORK | HAPPY-HOUR | held: two words |
| BANANA + SHELL | MARIO-KART | held: Mario Kart |
| HELMET + SUPERHERO, HERO + MACHINE | IRON-MAN | held: Marvel spells it Iron Man |
| EARTH + SUPERHERO | CAPTAIN-PLANET | held: two words |
| NEW YORK + PARTY | TIMES-SQUARE | held: two words |
| ASIA + VEGETABLE | BOK-CHOY | held: two words |
| FLUTE + KID | PIED-PIPER | held: two words |

New spelling holds found under the same rule:
- **Respelling proposals, not applied:** SPIDERMAN ×2 → SPIDER-MAN (CLIMBING + MARVEL, SUPERHERO + WEB); HALFPIPE → HALF-PIPE (RAMP + SKATEBOARD); SIXSHOOTER → SIX-SHOOTER (COWBOY + PISTOL).
- **Two words run together:** MACHINEGUN (AMMO + BELT), HARDHAT (CAP + DANGER), FIRETRUCK (ENGINE + LADDER), TINKERBELL (DISNEY + GREEN).
- **Hyphenated and British:** FLATPACK (FURNITURE + IKEA).
- **Questionable, held:** FAIRYTALE (PRINCE + STORY, TROLL + WISH). "Fairy tale" is usually two words, but "fairytale" is common.
- **Regional:** DUSTBIN (TRASH + VACUUM).

## Review examples

### From the 150-row random sample of unflagged rows (seed 7, reproducible)

Set aside after reading (4):

| Pair | Hint | First word | Second word | Concern |
|---|---|---|---|---|
| DISTRICT + PRESS | NEWS | A district has local news. | The press reports news. | DISTRICT link is generic |
| EDGE + ROW | BORDER | A border is an edge. | A border row can line the edge of a garden or arrangement. | ROW link is loose |
| CAREER + EXPLORE | PATH | A career path is a familiar phrase. | A path is explored or followed. | EXPLORE link is generic |
| ENTRY + WINDOW | OPENING | An entry is an opening into somewhere. | A window is an opening in a wall. | definitions on both sides |

Kept, but I noted them as generic-leaning during that read (served now; your call):

| Pair | Hint | First word | Second word | Concern |
|---|---|---|---|---|
| FRAME + HELICOPTER | AIR | An airframe is the structure of an aircraft. | A helicopter flies through the air. | AIR fits most flying things; FRAME needs "airframe" |
| TAP + VOICE | RECORDING | A phone tap can make a recording. | A recording can capture a voice. | loose on both sides |
| PHYSICAL + SPORT | ATHLETIC | Physical ability can be athletic ability. | Sport is athletic activity. | near-synonym chain |
| CLOTHING + NECKLACE | FASHION | Clothing is part of fashion. | A necklace is a fashion accessory. | category word; fits many pairs |
| GARAGE + HOSPITAL | REPAIR | A garage repairs cars. | A hospital repairs injuries, such as broken bones. | the HOSPITAL side is a stretch, though a fair one |

### Representative held-back hints (from the 85)

| Pair | Hint | First word | Second word | Concern |
|---|---|---|---|---|
| CINDERELLA + PRISON | ESCAPE | Cinderella is confined and escapes to attend the ball. | A prison escape leaves confinement. | not true to the familiar story |
| BOOK + PARADISE | LOST | Paradise Lost is a famous literary work published as a book. | LOST completes Paradise Lost. | works only for PARADISE |
| FLOUR + FLOWER | SOUND | Flour sounds like flower. | Flower sounds like flour. | names the homophone relation, not a shared thing |
| TIME + WEIGHT | MEASURE | Time can be measured. | Weight can be measured. | fits nearly anything |
| FORCE + POST | POLICE | A police force enforces the law. | A police post is a small police station or assigned location. | "police post" is not a familiar U.S. phrase |
| JACK + TECHNOLOGY | PORT | An audio jack is a connection port. | Electronic technology has connection ports. | TECHNOLOGY side is generic |
| MOLE + NUMBER | AVOGADRO | A mole contains Avogadro's number of entities. | Avogadro's number is a famous scientific number. | chemistry trivia |
| RED + TEA | ROOIBOS | Rooibos is often called red tea. | Rooibos is an herbal tea. | niche tea name |
| NOVEL + SHIP | DRAFT | A novelist writes a draft. | A ship's draft is how deeply its hull sits in water. | nautical jargon carries one side |
| MUG + TEA | CUPPA | A mug holds a cuppa. | A cuppa is a cup of tea. | British slang |
| LIGHT + SCUBA DIVER | TORCH | A torch provides light. | A scuba diver can use an underwater torch. | British "torch" = flashlight |
| GLOVE + LAWYER | FIT | A glove must fit the hand. | If it doesn't fit, you must acquit is a famous trial quotation. | O.J. Simpson murder trial |
| ATTACK + RIFLE | ASSAULT | An assault is an attack. | Assault rifle is a familiar weapon term. | politically charged weapon phrase |
| HELMET + SUPERHERO | IRON-MAN | Iron Man wears an armored helmet. | Iron Man is a superhero. | artificial hyphen (Iron Man) |
| COWBOY + PISTOL | SIXSHOOTER | A six-shooter is an iconic cowboy weapon. | A six-shooter is a revolver pistol. | good hint; spelling should be SIX-SHOOTER |

### Remaining alternatives (stored, not served) beside the current choice

| Pair | Serves | Alternative |
|---|---|---|
| APPLE + POCKET | PICK | IPHONE |
| BITE + SHARK | JAWS | CHOMP |
| BOSS + TREE | BARK | BRANCH |
| BOXER + CLOCK | PUNCH | ROUND |
| CAT + PYRAMID | SPHINX | EGYPT |
| CHICK + EASTER | PEEPS | YELLOW |
| HONEY + WOOD | POOH | BEEHIVE |
| MAGNET + NORTH | POLE | COMPASS |
| MEDUSA + STATUE | STONE | PETRIFICATION |
| MOON + SUN | APOLLO | ECLIPSE |
| OWL + WIZARD | POTTER | HEDWIG |
| SHARK + SWIMMING | JAWS | FIN |
| SLUG + SNAIL | SLIME | MOLLUSK |
| SPICY + TACO | JALAPENO | CHILI |
| SPIDER + SUPERHERO | PARKER | PETER |
| TORNADO + WIZARD | KANSAS | OZ |

## Loading (Daily and the main page)

- The library is bundled only into the lazily loaded `UnlimitedView` chunk. `App.jsx` loads it with `lazy(() => import("./unlimited/UnlimitedView.jsx"))`, behind the existing "Opening Unlimited…" fallback.
- The main bundle has no copy of the library, `index.html` does not preload the chunk, and no non-Unlimited file imports Unlimited code. Checked in this build and on the live site.
- **No change proposed:** Daily and the main page do not download or wait for it.
- **Compressed transfer when Unlimited opens:**
  - Live today: 391 KB raw, **82 KB brotli** as served by Vercel.
  - This branch: 3.06 MB raw, about **0.5–0.6 MB** compressed. That is 511 KB at brotli level 5 and 616 KB gzip; Vercel compresses the live chunk slightly worse than level 5, so expect the upper end.
- The main bundle (about 117 KB brotli live) is unaffected by the library.

## Production today (read-only check, 2026-10-21)

- cluevoyance.com and /unlimited serve the same app (SPA): Last-Modified 2026-10-19 03:46 UTC.
- GitHub deployments: latest **Production** is `251e414`, the `main` merge of PR #29.
- The live Unlimited chunk carries the x01 library: sourceCommit `9c098a1`, content hash `e3258af0…`, identical to `main`'s export. It serves **1,125 pairs, 1,125 hint entries**, 1,196 words.
- **Waiting on `feature/unlimited-x04`, not in production:** x02–x23, served export 4,638 pairs / 4,651 served hint entries, 1,203 words.
- **This PR adds on top of x04:** +6,071 pairs (6,067 import + 4 owner adds), 4 owner replacements and 16 stored alternatives, giving **10,709 pairs / 10,722 served hint entries**.
- Merging PR #30 into `feature/unlimited-x04` does not publish anything. Production deploys come from `main` (or a hand `vercel --prod`). The pushes so far created Vercel **Preview** deployments only, for 6984f62 and 5523074.

## Decisions for the owner

1. **SPIDER + MAN conflict.** This import already serves **PETER** there (mp-0026: MAN "Peter Parker is Spider-Man's human identity.", SPIDER "Peter Parker is Spider-Man."). Replace it with PARKER (PETER stays stored), or keep PETER?
2. **Questionable spellings:** E-T → ET? BLACK-AND-WHITE? FAIRYTALE ×2? And the respellings SPIDER-MAN ×2, HALF-PIPE, SIX-SHOOTER?
3. **Kept generic-leaning rows** from the sample (AIR, RECORDING, ATHLETIC, FASHION, REPAIR): keep or hold?
4. **Content holds and labels:** are the 8 content holds right? Should labels later cover the earlier library too (today only imported hints are labelled)?
5. **Remaining 16 alternatives:** promote any?

## Checks (this branch)

- `node --test scripts/unlimited/*.test.mjs`: 113/113 (consolidated-1022 test rewritten for round 2).
- `npx vitest run`: 172/172. Two sampling tests now scale with the library; the generator is unchanged. The ordering-bias test sizes its sample to the library. The extras test now measures every word on the boards where it was free; only 5 words are never a target after the import, too few to average.
- `check-random.mjs`: 500/500 boards pass every check.
- `eslint scripts/unlimited src/unlimited`: clean.
- `npm run build`: OK.
