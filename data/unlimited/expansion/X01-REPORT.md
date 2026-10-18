# Unlimited expansion x01: full word bank and 140 new pairs (local, held for review)

2026-10-18. Branch `feature/unlimited-expansion` off live main `cfd7064`, in the worktree `C:\Users\leviw\cluevoyance-unlimited`. **Push, merge and deployment are on hold for the owner.** The live site is unchanged. All drafting and review ran on Opus 5.5 (`claude-opus-5-5`, echoed by every agent) with Usage Credits off. There were no paid APIs, no new credentials and no database writes; the word bank was only read.

## 1. Full word bank for the 20 extra words

- **Verified count: 1,196 words.** `scripts/unlimited/export-wordbank.mjs` reads the bank page by page with the app's own loader (`src/game/wordBank.js`, keyset paging by id). It then asks the database for its exact row count before and after the read (1,196 both times) and refuses to write on any mismatch. The read took 3 requests, the last one empty. There were 0 duplicates after normalising, 0 blanks and 7 multiword entries (ICE CREAM, LOCH NESS, NEW YEAR, NEW YORK, SCUBA DIVER, STAR WARS, VIDEO GAME).
- The snapshot is `data/unlimited/wordbank/wordbank.json`, with its source, fetch time, counts and content hash. `src/unlimited/random-library.json` now carries all 1,196 words, and the 20 extras on each board are drawn uniformly, without replacement, from the bank minus the eight targets. There is no semantic filtering; the existing clue rules already allow a hint to match another word on the board. Difficulty options and all other board rules are unchanged.
- **Why a snapshot rather than a live fetch in the browser:** boards keep working offline and stay deterministic for a seed, and words added to the open admin page never reach players unseen. Refreshing the snapshot is one command followed by the library export.
- The generator is now version 2, and each new board records the library hash it was made from. Boards made by generator 1 (extras from the original 50) are frozen snapshots and never change; there is a fixture board and tests for this.
- **Long and multiword words:** card words are one line and are clipped at the card edge (shared game CSS). Below about 390px wide, 10 to 12 letter words did not fit: at 320px, 22 of the 28 longest words were clipped, including CALCULATOR and CAMOUFLAGE. Inside Unlimited only, `src/unlimited/fitWords.js` now sets a word that would be clipped just small enough to show in full, down to 8px at 320px. Every other word keeps the normal size. `App.jsx`, Daily and Friends are unchanged. **Daily has the same latent clipping** on phones under 390px whenever a puzzle uses a long bank word; that is a separate decision for the owner.

## 2. The new batch (x01)

| | |
|---|---|
| Drafted | 140 pairs, 155 hints. Four independent Opus drafting agents each focused on a seeded quarter of the 1,146 words outside the original 50, with a theme emphasis each: pop culture, food/everyday, animals/nature, wordplay. |
| Mechanical checks | `prepare-expansion.mjs`: every target in the bank, catalogue pair ids, one-word hints with no target inside or outside, no duplicate of an existing pair (including the owner's), no cross-batch duplicate. 0 dropped. |
| Independent review | Four fresh Opus reviewers. Each read only its input file: pairs, hints and the one short explanation players see, with no author labels or ranking. The rubric used the owner's examples and the "clicks when explained" bar. Result: **155 PASS, 0 BORDERLINE, 0 FAIL.** |
| One revision | 7 hints had a concrete text problem: OZ (the Scarecrow already lives in Oz), QUIDDITCH (U.S. spelling), POLO (name the pool game), CASPER (name "Friendly"; author had crossed the links), GRAND (say "grandmother"), ERUPT (cover the volcano side), and APOLLO for GREECE + NASA ("god of the sun" is debatable). They were rewritten once and re-reviewed once by a fresh reviewer: 7 PASS. |
| **Accepted** | **140 new playable pairs, 155 playable hints** (all `ai_reviewed`; nothing is held). |
| Mix | wordplay 47, pop culture 41, food 18, everyday 14, animals 12, other 8. 120 pairs use only new words; 20 pair a new word with an original one. |

**The 100% pass rate is a caveat.** Each reviewer said the batch was strong and listed its own judgement calls (below). In my own read the hints are well-known, natural links. However, a single review per batch with no failures means the owner's playtesting is the real second check. `catalogue.mjs show` and `search` make that easy.

Owner-approved examples, recorded as owner decisions (`human_approved` in `overrides.json`, preferred in `preferences.json`, provenance "owner-discovery"):
- ZOMBIE + FOOD → BRAINS
- BIG + APPLE → NYC (abbreviation exception)
- CAMOUFLAGE + CALCULATOR → AMBUSH

GOLD + PIRATE → TREASURE was already the approved canonical hint and is unchanged.

**Missing example word:** PURPLE is not in the word bank, so PURPLE + DINOSAUR → BARNEY was not added. The catalogue refuses words outside the bank and never adds them. DINOSAUR is in the bank.

**Target words:** 281 distinct target words can now appear (was 50). **231 of them are newly represented**, including the multiword ICE CREAM and NEW YEAR.

### A varied sample (served hint and its player explanation)

| Pair | Hint | Explanation shown after the game |
|---|---|---|
| POLICE + SCORPION | STING | Scorpions sting, and Sting fronted The Police. |
| AFRICA + WIZARD | TOTO | Toto is both the band behind "Africa" and Dorothy's little dog in The Wizard of Oz. |
| AMBULANCE + MIRROR | REVERSE | The reversed lettering on an ambulance only reads properly in a mirror. |
| CLIFF + CLOSET | HANGER | Closets are full of hangers, and a cliffhanger leaves you hanging until next time. |
| SALAD + TITANIC | ICEBERG | An iceberg sank the Titanic, and iceberg lettuce sinks into your salad. |
| DOG + DWARF | PLUTO | Pluto is both Mickey's dog and the most famous dwarf planet. |
| BOWLING + THANKSGIVING | TURKEY | Roll three strikes and you've earned a turkey, no oven required. |
| LAYER + SHREK | ONION | Ogres are like onions: they both have layers. |
| CALCULATOR + VAMPIRE | COUNT | Calculators count, and Count Dracula is a vampire (so is Sesame Street's number-loving Count). |
| AWARD + GARBAGE | OSCAR | One Oscar is a golden statue, the other is a grouch who lives in a trash can. |
| DOCTOR + HIDE | JEKYLL | Dr. Jekyll's dark side is Mr. Hyde, and you can't hide from that pun. |
| DONKEY + KING | KONG | Donkey Kong and King Kong: two famous apes, one last name. |
| PLANET + PLANT | VENUS | Venus is a planet, and the Venus flytrap is a plant that snaps up bugs. |
| AIRPORT + CARNIVAL | CAROUSEL | One carousel carries suitcases, the other carries painted horses. |
| CAMERA + MOUSE | CHEESE | Say cheese for the camera; cartoon mice just want to eat it. |
| FENCE + KITCHEN | FOIL | Fencers duel with a foil; cooks wrap leftovers in it. |
| ICE CREAM + SUNDAY | SUNDAE | A sundae is ice cream with toppings, and it sounds just like Sunday. |
| PIT + PRINCESS | PEACH | Mario rescues Princess Peach; you just have to eat around the pit. |
| HOCKEY + SHAKESPEARE | PUCK | Shakespeare's trickster fairy shares a name with the hockey puck. |
| NEEDLE + POTATO | EYE | A needle has an eye, and a potato has lots of them. |
| CURTAIN + TORNADO | OZ | A tornado gets Dorothy to Oz, and a curtain hides the Wizard's secret. |

### Judgement calls passed by the reviewers, for the owner's attention

- **Near-synonyms:** TEE for GOLF + SHIRT (a tee is a T-shirt); BOBA for PEARL + TEA; HITCH and DUMMY were also called close. All passed as a kind of the target, not a plain synonym.
- **Homophone puns:** CLAUS (CLAW + SANTA) and SUNDAE (ICE CREAM + SUNDAY).
- **PG judgement:** DUTCH for DOUBLE + OVEN is clean as written, but "Dutch oven" has a juvenile slang meaning. SIXTH for DEAD + SENSE points at a PG-13 film ("I see dead people").
- **Older references:** WHEATIES, ROCKY, Fresh Prince and The Sixth Sense are still widely known in the U.S.; younger players may know them less.
- **Moderate recognizability:** PUCK (the Shakespeare side), JAVA (the island side), SWAMP (Yoda's Dagobah).
- **Same idea twice in one pair:** BACKWARDS/REVERSE, MARCO/POLO, MOLTEN/LAVA, MICHELANGELO/LEONARDO, RAPHAEL/LEONARDO. The reviewer's pick is served (REVERSE, POLO, LAVA, LEONARDO, LEONARDO); `reconcile-preferences.mjs` recorded the four ties.
- **Unchanged:** DIAMOND + SNAKE stays on its generation hold. Live DOUBLOON/BACK and the earlier owner-feedback notes are untouched.

## 3. The catalogue

`scripts/unlimited/catalogue.mjs` (on top of `catalogue-lib.mjs`) covers every unordered pair of the 1,196 bank words: **714,610 possible pairs**. 1,368 are stored, and the other **713,242 are empty pairs represented virtually**: computed on demand, never written out.

- `stats`: bank size, possible / stored / empty pairs, pair states, target-word coverage.
- `show <WORD> <WORD>`: every hint for a pair, with its status, review scores and model, explanation, provenance, overrides, and the hint served today; or "empty".
- `word <WORD>`: a word's populated pairs and how many partners are still empty.
- `thin [--new]`: words with the fewest playable pairs (915 bank words still have none), to steer future batches.
- `empty [--word W]`: empty pairs, overall or for one word.
- `search <TEXT>`: hints and explanations.
- `add <WORD> <WORD> <HINT> --by <owner|friend|name> --why "<short explanation>" [--a ..] [--b ..] [--note ..]`: records an owner or friend-play discovery. A friend discovery waits as a candidate until reviewed. `--approve` and `--prefer` are owner-only and write `overrides.json` / `preferences.json`. Words outside the bank are refused.

Each populated pair keeps any number of hints, each with its own status, independent review, short explanation and provenance. The pair's preferred hint lives in `preferences.json`. Nothing existing was rewritten: all 1,225 earlier pairs, their reviews, the owner decisions and the provenance are unchanged; the only edits are additions. `manifest-1225.json` remains the record of the original 50-word coverage.

## 4. Integration and variety

`src/unlimited/random-library.json`: **1,123 eligible pairs** (980 before + 140 new + 3 owner), 1,196 words. Each board still has four distinct hints, eight distinct targets and 20 unique extras (checked on every generated board). Saved boards, progress, Replay, feedback and fixed-board history are untouched.

Simulated players (200 players × 30 boards each, the app's own flow: a fresh seed per board, the last 3 boards' pairs avoided):

| | Released (50 words) | **This build (uniform)** | Proposal only: new pairs ×3 |
|---|---|---|---|
| Eligible pairs / bank words | 980 / 50 | 1123 / 1196 | 1123 / 1196 |
| Boards with at least one new pair | 0.0% | 45.1% | 79.5% |
| New pairs per board | 0 | 0.55 | 1.27 |
| Target slots filled by new words | 0.0% | 12.7% | 29.7% |
| Distinct targets one player sees in 30 boards | 49.7 | 78.5 | 110.4 |
| Distinct extras one player sees in 30 boards | 50 | 474.5 | 474.3 |
| Extras shared with the previous board | 7.99 | 0.33 | 0.33 |
| Repeated pairs within 30 boards | 5.46 | 4.61 | 6.54 |
| Most frequent targets (share of boards) | FIRE 19.7%, GLASS 19.6%, ROCK 18.4% | FIRE 16.8%, GLASS 16.1%, FISH 15.8% | FIRE 13.9%, GLASS 13.5%, KING 13.2% |

**Selection is unchanged (uniform over eligible pairs).** New pairs already appear on 45% of boards, and a player meets about 79 different target words in 30 boards instead of 50.

**Proposal, not applied:** weight new pairs (for example ×3) until the library is less dominated by the original 50. That would lift new targets to about 30% of slots and put a new pair on 80% of boards. With only 143 new pairs, though, each would recur more often: repeated pairs per 30 boards would rise from 4.6 to 6.5. I recommend staying uniform now and revisiting weighting by target word once a second batch exists. `scripts/unlimited/variety.mjs --weight-new K` simulates any weight without changing the game.

## 5. Tests

| Check | Result |
|---|---|
| Unit tests (vitest, all) | 171 / 171 pass. New: the library holds the exact verified bank; extras drawn uniformly from all 1,196 words with multiword entries intact; a generator-1 board stays byte-identical through Continue, a new game and Replay. |
| Content script tests | 60 / 60 pass (6 new catalogue tests: pair ids, hint rule incl. NYC, virtual empty pairs, served hint, real catalogue, `add` permissions on a throwaway copy) |
| `check-random.mjs`: full board checker over generated boards | 500 / 500 pass (server rules, 4 distinct one-word hints, 28 distinct words, reveal faces the right words, bestSubmit at 4 rotations, deal never solved at any difficulty, lives/lock transitions) |
| Browser: `random-check.mjs`, phone 390×844 and desktop 1280×860 | PASS: random boards frozen on start, wrong guess, refresh = same board, Next = different board, Continue, Replay of a random and an old fixed board, Easy/Standard/Expert/Hardcore, Easy loss, Download, Daily keys byte-identical |
| Browser: `storage-failure.mjs` | PASS: storage full, unreadable and blocked; warning text exact; history never overwritten |
| Browser: `long-words.mjs` (new), 320×568, 390×844, 1280×860 | PASS: the 28 longest/multiword bank entries on one Hardcore board, none clipped, none overlapping, no sideways scroll; solved at 390 and 1280; reveal and Played list fit |
| Browser: Daily `daily-smoke.mjs`, home/results `home-results.mjs`, Friends `guest.mjs` | PASS (local stack): Daily, archive, admin, home, results and the Friends guest flow unaffected |
| Production build | succeeds; the lazy Unlimited chunk is now about 82 KB gzip (was 64 KB): the 1,196-word bank and 143 more pairs |
| Lint | only the 4 pre-existing `src/App.jsx` errors, identical to live main; the Unlimited code, scripts and tests are clean |
| Unchanged | all 1,225 earlier library pairs, 162 earlier preferences and 15 earlier overrides byte-identical (only additions); `pool.json` untouched; `App.jsx`, Daily and Friends code untouched |
