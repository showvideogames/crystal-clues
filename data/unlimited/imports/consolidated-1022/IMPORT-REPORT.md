# Consolidated offline batch import (consolidated-1022)

**Status: prepared for review. Not merged into main, not published, not deployed.** Branch `feature/unlimited-import-consolidated`, stacked on `feature/unlimited-x04` (6984f62, the X23 pause checkpoint), as the owner chose on 2026-10-21. No model calls were made: no drafting, no generation and no new reviews.

## Source

- Archive `Cluevoyance-final-consolidated.zip`, sha256 `b6d51bdf…d329c`; offline reconciliation snapshot 2026-10-22T03:21:38Z.
- Import list: `unique-candidate-picks.csv` only (6,192 rows, sha256 `8d96fa2e…8b81`). Each pick carried only independent pass verdicts (3,451 `PASS_EDITORIAL`, 2,744 `pass`).
- **Not imported:** `unique-holds.csv` (2,070), `unique-rejects.csv` (364), raw attempts, the partial batches (m-p batch-08, q-s batch-08), `repair-proposals-full.json` / repairs, and the owner queue (see `OWNER-QUEUE-PROPOSALS.md`).
- The small source notes are kept verbatim in `source/`.

## Result

| Outcome | Count |
|---|---:|
| **New pairs added** (served) | **6,087** |
| **Alternative hints added** on existing pairs (stored, not served) | **18** |
| Exact duplicates skipped (pair already holds the same hint) | 22 |
| Held back for later review (editorial set-asides) | 65 |
| Off-bank, hint-rule, target-form, owner-rejection, reserved, owner-queue or conflicting-review rows | 0 |
| **Total** | **6,192** |

- Served export: 4,638 → **10,725 pairs**. Library: 4,957 → 11,044 pair records (6,105 new ai_reviewed hints).
- All 4,638 previously served pairs are byte-identical in the export. No existing stored hint was changed or removed. The word bank (1,203 words) is unchanged. All owner holds and rejections are intact: the 396 overrides were re-applied, and rejections.json was not edited.
- Every row and its outcome: `ledger.csv`. Set-asides with reasons: `editorial-set-aside.json`.

## How it went through the normal pipeline

1. `scripts/unlimited/import-consolidated.mjs` applies the x14-check rules (bank, one-word hint rule, target containment), the brief's "another form of a target" rule, rejections.json, the reserved x11 pairs, duplicates by spelling key, and the editorial set-asides. It writes `library/batches/consolidated-1022-batch.json`. Each hint there carries an `importRecord`: candidate ids, source files, self-review, every independent verdict and reason, and difficulty.
2. It builds the review and key in the variation-review format from the batch's own independent PASS evidence. Scores are null, because that review gave none.
3. `variation-review.mjs merge` (append-only: never replaces a hint), then `apply-overrides.mjs`, then `export-random-library.mjs`.
4. Each imported hint has `provenance.source = "consolidated-1022"` and `provenance.request = <candidate id>`, so it traces back to the batch file and the archive.

Two text points:
- **Reveal sentence.** The batch has per-word lines but no explanation sentence, and the client requires one. Imported hints use the template "HINT connects A and B." No new claims are made. The two reviewed lines are shown unchanged beneath it.
- **17 swapped lines.** In 17 source records each per-word line was attached to the other word. Example: CHEST + RED → ROBIN showed the red-breast line under CHEST. They were swapped back with `correct-text.mjs`. The wording is unchanged and the original is kept in `provenance.textCorrection`.

## Editorial set-asides (65, kept for later review, not rejected)

| Category | Count | Examples |
|---|---:|---|
| spelling (hyphen joins two words) | 14 | IRON-MAN ×2, HOT-DOG, ICE-CREAM, E-T ×2, TIMES-SQUARE, BLACK-AND-WHITE |
| weak / one-sided / generic | 24 | CINDERELLA + PRISON → ESCAPE, TIME + WEIGHT → MEASURE, FLOUR + FLOWER → SOUND |
| obscure / specialist | 12 | MOLE + NUMBER → AVOGADRO, RED + TEA → ROOIBOS, SHAPE + TILE → TESSELLATION |
| regional (British) | 8 | MUG + TEA → CUPPA, NAPKIN + PAPER → SERVIETTE, LIGHT + SCUBA DIVER → TORCH |
| sensitive | 6 | RIGHT + WING → CONSERVATIVE, MAGIC + MUSHROOM → PSYCHEDELIC, GLOVE + LAWYER → FIT |
| near-duplicate | 1 | SATURN + WEDDING → RINGS (the pair serves RING) |

**How the screen worked, and what it did not cover.** A mechanical screen flagged 405 rows: reviewer notes naming familiarity, regional or technical risk; hedged lines on both sides; hints of 11 or more letters; non-letter spellings; sensitive words. I read every flagged row, plus a random sample of 150 unflagged rows. The sample turned up 4 more weak rows (set aside). That is about 3%, so perhaps 150 to 200 loose or generic hints remain among the roughly 5,600 unread rows. They are reviewer-passed, but not owner-quality-checked.

## Alternatives added (18): existing served hint unchanged

| Pair | Serves today | Added alternative |
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
| ROBOT + TOY | PIXAR | TRANSFORMER |
| SHARK + SWIMMING | JAWS | FIN |
| SLUG + SNAIL | SLIME | MOLLUSK |
| SPICY + TACO | JALAPENO | CHILI |
| SPIDER + SUPERHERO | PARKER | PETER |
| SPIDER + WEB | PARKER | SILK |
| TORNADO + WIZARD | KANSAS | OZ |

A few alternatives may beat today's served hint (SPIDER + WEB → SILK, ROBOT + TOY → TRANSFORMER). Switching one is an owner preference and was not applied.

## Representative additions for spot-checking

| Pair | Hint | First word's line | Second word's line | Candidate |
|---|---|---|---|---|
| ASTRONAUT + LAWYER | SUIT | An astronaut wears a space suit. | A lawyer brings a legal suit. | b02-014 |
| AMBULANCE + GUITAR | PICKUP | An ambulance picks up patients. | An electric guitar has a pickup that senses string vibration. | b01-009 |
| HELICOPTER + TREE | MAPLE | Spinning maple seeds are called helicopters. | A maple is a tree. | b10-075 |
| MUG + TREE | ROOT | Mug is a familiar root beer brand. | A tree has roots. | b01-029 |
| BUCKET + WIZARD | APPRENTICE | The Sorcerer's Apprentice features enchanted brooms carrying water buckets. | An apprentice learns magic from a sorcerer or wizard. | b07-172 |
| CHARGE + PLATYPUS | BILL | A bill states charges owed. | A platypus has a duck-like bill. | b04-101 |
| GUITAR + PIRATE | HOOK | A musical hook is a catchy phrase often played on guitar. | A storybook pirate may have a hook hand. | b01-136 |
| KETCHUP + RACE | CATCH-UP | Catch-up sounds like ketchup. | A trailing racer tries to catch up. | b17-031 |
| CAVALRY + NIGHTMARE | HORSE | Cavalry traditionally rides horses. | The mare part of nightmare spells a word for a female horse. | b15-119 |
| AXE + COMPUTER | HACK | An axe can hack through wood. | A hacker works with computer systems. | b02-018 |
| BOXING + STOCKS | CORNER | A boxing ring has corners occupied by fighters and their teams. | To corner a market is to control enough of its supply to influence it. | b04-104 |
| PIRATE + PRINCESS | BRIDE | The Princess Bride features the Dread Pirate Roberts. | The Princess Bride contains a princess-to-be. | mp-0946 |
| CAT + DEATH | NINE | Cats are said to have nine lives. | The nine-lives saying imagines surviving death repeatedly. | b20-128 |
| SHIP + SOUL | FERRY | A ferry is a ship or boat. | Mythic ferrymen carry souls. | qs-0919 |
| DISNEY + ROOSTER | MOANA | Moana is a Disney film. | Heihei is the rooster in Moana. | b07-024 |
| MERCURY + WING | HERMES | Mercury is the Roman counterpart of Hermes. | Hermes is depicted with winged sandals. | mp-0070 |
| CEREAL + MUSIC | POPS | Corn Pops is a cereal brand. | Pops concerts feature accessible popular music. | b03-114 |
| BLUE + PIANO | RHAPSODY | Rhapsody in Blue is a famous composition. | Rhapsody in Blue prominently features piano. | b23-056 |
| AFRICA + SCIENTIST | GOODALL | Jane Goodall is associated with chimpanzee research in Africa. | Jane Goodall is a scientist. | b08-102 |
| THIEF + VICTORY | STEAL | A thief steals. | To steal a victory means to win unexpectedly or narrowly. | tz-0965 |
| ACCESSORY + CASE | PHONE | Phone accessories include protective cases. | A phone case protects a phone. | b23-020 |
| ARM + TREE | LIMB | An arm is a limb. | A tree branch can be called a limb. | b02-004 |

The tricky ones to judge are CAVALRY + NIGHTMARE (letter-play), CEREAL + MUSIC (Corn Pops plus pops concerts), MERCURY + WING (myth), BOXING + STOCKS (cornering a market) and THIEF + VICTORY.

## Decisions for the owner

1. **Reveal sentence template.** Keep "HINT connects A and B." for the 6,105 imported hints, or write real explanation sentences later (that would be new text and model calls).
2. **Spelling set-asides (14).** Allow two-word names joined by a hyphen (IRON-MAN, HOT-DOG, ICE-CREAM, TIMES-SQUARE, BLACK-AND-WHITE…), or keep the "conventional spelling only" rule?
3. **Adult-theme hints.** 55 imported hints touch guns, tobacco, gambling or alcohol (BULLET, CIGARETTE, POKER, TEQUILA, SHOT…). They match bank words already in the game (GUN, CIGARETTE, CASINO…) and were kept. There is still no family-friendly filter (the open COKE question).
4. **Owner queue.** See `OWNER-QUEUE-PROPOSALS.md`. MINNIE and BUOY would change served hints, and three new pairs need player text.
5. **Alternatives.** Promote any of the 18 (for example SILK, TRANSFORMER) over today's served hint?
6. **Hint repetition.** The import repeats common hints (WATER ×23, FRUIT ×17, TREE ×15, CARD ×15). The assembler's once-per-board rule copes, but the concentration finding in the backlog grows.
7. **Bundle size.** `random-library.json` grows from 1.6 MB to 3.4 MB. The lazily loaded Unlimited chunk is 3.26 MB minified (678 kB gzip). The first Unlimited load is slower on phones.

## Checks (all on this branch)

- `node scripts/unlimited/import-consolidated.mjs <picks.csv>`: 6,192 classified, as in the table above.
- `node --test scripts/unlimited/*.test.mjs`: exit 0, 113/113. The pinned served-hyphen list was extended with the 10 new conventional spellings, and a consolidated-1022 test was added.
- `npx vitest run`: exit 0, 172/172. The ordering-bias test now sizes its sample to the library: 6,000 boards gave only 2.2 draws per pair at 10,725 pairs, and a uniform generator then leaves about 10.7% of pairs unseen (Poisson; 1,142 observed). The generator is unchanged.
- `node scripts/unlimited/check-random.mjs`: exit 0, 500/500 boards pass every check.
- `npx eslint scripts/unlimited src/unlimited`: exit 0. `npx eslint .` exits 1 on the 4 existing `src/App.jsx` errors (untouched).
- `npm run build`: exit 0.
