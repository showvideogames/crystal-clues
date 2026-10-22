# Unlimited batch x02: uncovered words first (local, held for owner review)

2026-10-19. Branch `feature/unlimited-x02` off live main `251e414` (the x01 release), in `C:\Users\leviw\cluevoyance-unlimited`. **Not pushed, merged or deployed: held for the owner.** All drafting and review ran on Opus 5.5 (`claude-opus-5-5`, echoed by every agent) with Usage Credits off. There were no paid APIs and no database writes; the word bank was only read.

## Word bank

The bank was re-read page by page and checked against the database's exact count: **1,199 words** (was 1,196). The new words are BEE, GYM and PINK. Extras on new boards come from all 1,199.

## Owner-selected pairs (counted separately)

All 22 pairs were added with `catalogue.mjs add --by owner --approve --prefer`: owner decisions (`human_approved` in overrides.json) and preferred hints. All target words are in the bank; GYM was missing from the earlier snapshot but is in the live bank now. None of the pairs existed before.

- PLANK: PIRATE + GYM, SHIP + GYM, WOOD + GYM
- JUNGLE: GYM + FOREST
- BEE: INSECT + SCHOOL, HONEY + SCHOOL
- SCURVY: PIRATE + FRUIT
- SAFARI: INTERNET + JUNGLE, INTERNET + AFRICA
- SUBMARINE: YELLOW + WATER
- CLOUD: INTERNET + RAIN
- WOODY: DOLL + COWBOY
- BUZZ: DOLL + ASTRONAUT, TOY + HAIR, ASTRONAUT + HAIR
- REX: TOY + DINOSAUR, DINOSAUR + DOG
- SLINKY: TOY + DOG
- OREO: BLACK + COOKIE
- MILK: WHITE + COOKIE
- DIP: COOKIE + MILK
- CHESS: KNIGHT + GAME

Not added, as instructed:
- BEE + SCHOOL → SPELLING (withdrawn by the owner; BEE is now a bank word, but the pair stays withdrawn)
- DOLL + HAIR → BUZZ
- WHITE + COOKIE → OREO

The original-50 exclusion did not apply to these pairs.

**AQUARIUM (OCEAN + GLASS)** now reads "An aquarium is like a little ocean behind glass.", the owner's wording; the old text is kept in its provenance. WEDDING (HEART + BELL), "Wedding bells and hearts.", is also thin and could get the same treatment if the owner wants.

## The batch

| | |
|---|---|
| Focus | The 914 bank words with no playable pair, in four seeded slices. Partners are uncovered or have only 1–2 pairs. Original-50 words are excluded (enforced by `prepare-expansion.mjs --exclude-original`). |
| Drafted | 160 pairs by four Opus drafters, revised mid-draft for the owner's refinement: 35 phrase-join pairs were replaced with character, story, scene and fact links. 6 cross-drafter duplicates were dropped, leaving 154. |
| Shared-hint pass | An Opus drafter reused the strongest reviewed hints (77 with top delight) and the drafters' "also fits" ideas on other natural pairs: 40 pairs. It dropped 29 of 46 suggestions as weak. |
| Independent review | Five fresh Opus reviewers, with a stricter brief: each hint's mechanism labelled, phrase-joins passed only if exceptional, explanations checked. |
| One revision | 32 text fixes: reviewer-flagged problems, plus explanations that missed why a clue works (per the owner's AQUARIUM / LOW-KEY guidance). 2 replacements: WASHINGTON for BILL + BUCK, BLADE for AXE + HELICOPTER. Every change was reviewed once more by a fresh reviewer. |
| **Accepted** | **189 pairs, 193 hints** (149 from the main batch, 40 from the shared-hint pass) |
| Held (5) | BEIJING + DUCK: PEKING(held); BUS + WAITER: TABLES(held); CAKE + LAVA: MOLTEN(held); CANAL + HAT: PANAMA(held); DOOR + WOOD: KNOCK(held) |

**How the served hints work** (the reviewer's mechanism label, one per accepted pair):

| Mechanism | Served hints |
|---|---|
| Shared reference (character, story, work, person) | 71 |
| Double meaning | 42 |
| Fact | 33 |
| Shared property | 19 |
| Scene | 18 |
| Other | 1 |
| **Phrase-join** | **5** |

So 5 of 189 accepted clues mainly use the familiar-phrase / prefix / blank pattern. DEW, BILLY, CAKE, CROSSBONES and PHANTOM are kept as exceptional; the other phrase-joins were held or replaced in drafting and review.

**Target words:** 298 distinct targets in the batch. **232 of them never appeared as a target in the live game**, plus 6 more from the owner pairs (DOLL, BLACK, WHITE, GYM, FRUIT, RAIN). The library now has **520 distinct target words** (live: 282) and 1336 eligible pairs.

### A varied sample (served hint and explanation)

| Pair | Hint | Explanation |
|---|---|---|
| ARM + FUNNY | HUMERUS | The humerus is your upper-arm bone, and its name sounds like "humorous." |
| BABY + DELIVERY | STORK | In folklore, the stork handles all baby deliveries. |
| BENCH + CHOCOLATE | GUMP | Forrest Gump sat on a bench with a box of chocolates and told his life story. |
| BILL + BUCK | WASHINGTON | George Washington's face is on the one-dollar bill, also known as a buck. |
| BIRD + PLANE | SUPERMAN | It's a bird! It's a plane! No, it's Superman! |
| CINDERELLA + CROCODILE | CLOCK | Cinderella races the midnight clock, and Captain Hook's crocodile ticks from the clock it swallowed. |
| COCKROACH + VIKING | RAID | Vikings went on raids; roaches run from Raid. |
| CRICKET + WHALE | PINOCCHIO | Pinocchio is guided by Jiminy Cricket and swallowed by Monstro the whale. |
| DIAMOND + PENCIL | GRAPHITE | Pencil "lead" is graphite, which is pure carbon, just like diamond. |
| DYNAMITE + EINSTEIN | NOBEL | Alfred Nobel invented dynamite, and Einstein won the prize that bears his name. |
| EGYPT + ELVIS | MEMPHIS | There are two famous Memphises: one ruled by pharaohs, one by the King of Rock and Roll. |
| FATHER + HAND | VADER | In The Empire Strikes Back, Darth Vader cuts off Luke's hand and then reveals he is Luke's father. |
| FRIEND + KANGAROO | JOEY | Joey is one of the six Friends and also the word for a baby kangaroo. |
| GOLF + LOCH NESS | SCOTLAND | Scotland is the birthplace of golf and the home of Loch Ness. |
| HEN + KISS | PECK | A hen pecks for seeds; a peck on the cheek is a little kiss. |
| IRELAND + WIZARD | EMERALD | Ireland is called the Emerald Isle, and the Wizard of Oz rules the Emerald City. |
| LADY + QUEEN | GAGA | Lady Gaga took her stage name from Queen's song "Radio Ga Ga." |
| MONSTER + TRUCK | BIGFOOT | Bigfoot is both a mythical monster and the original monster truck. |
| OCTOPUS + SPONGEBOB | SQUIDWARD | Surprise: SpongeBob's neighbor Squidward is an octopus, not a squid. |
| TOOTH + UNICORN | NARWHAL | The narwhal is nicknamed the unicorn of the sea for its spiral "horn," which is really a long tooth. |

### Judgement calls passed by the reviewers, for the owner

- **Recognizability:** DWIGHT depends on The Office. SQUIDWARD's octopus side and MOWGLI's India side need a fact. SCOTLAND (the unicorn) is less known in the U.S.
- **Close to a target:** PECK (a peck is a kind of kiss), NYE (New Year's Eve, accepted like NYC) and MUPPET (one letter from PUPPET).
- **One hint, several pairs** (allowed; the same hint never appears twice on one board): OSCAR serves TRASH + TROPHY, FILM + GARBAGE, MOVIE + TRASH and x01's AWARD + GARBAGE. ALADDIN, LEONARDO, BUZZ and PLANK also recur.
- **Hints that are also bank words** (allowed by the clue rules): for example ROAST, WOLF, SNAKE, COOKIE and WASHINGTON. WASHINGTON is also a target in MOUNT + WASHINGTON, so the two could occasionally share a board.
- **PG:** VADER (FATHER + HAND) mentions Luke's hand being cut off (from a PG film).
- DIAMOND + SNAKE stays held.

## Variety

200 simulated players × 30 boards each, using the app's own flow. Selection is still uniform, as instructed.

| | Live now (x01, 251e414) | **With batch 2 (uniform)** |
|---|---|---|
| Eligible pairs / bank words | 1125 / 1196 | 1336 / 1199 |
| Distinct target words | 282 | 520 |
| Boards with at least one pair using a word outside the original 50 | 47.0% | 74.2% |
| Target slots filled by words outside the original 50 | 13.4% | 27.0% |
| Distinct targets one player sees in 30 boards | 79.6 | 109.1 |
| Repeated pairs within 30 boards | 5.17 | 4.12 |
| Distinct extras one player sees in 30 boards | 475.7 | 474.4 |
| Most frequent targets (share of boards) | DOG 15.9%, ROCK 15.9%, FIRE 15.8% | GLASS 14.2%, FIRE 14.1%, CAT 13.5% |

## Tests

| Check | Result |
|---|---|
| Unit tests (vitest, all) | 171 / 171 pass. The library holds the exact verified bank (now 1,199); extras are drawn uniformly from it; a generator-1 board stays byte-identical. |
| Content script tests | 60 / 60 pass. The catalogue test now reads the bank size from the snapshot, and checks the owner decisions. |
| `check-random.mjs`: full board checker over generated boards | 1,000 / 1,000 pass |
| Browser: `random-check.mjs`, phone and desktop | PASS: frozen boards, refresh, Next, Continue, Replay of a random and an old fixed board, all four difficulties, Easy loss, Download, Daily keys untouched |
| Browser: `storage-failure.mjs` | PASS: storage full, unreadable and blocked; history never overwritten |
| Browser: `long-words.mjs`, 320 / 390 / 1280 | PASS: the longest and multiword bank entries are never clipped or overlapping |
| Browser: Daily `daily-smoke.mjs`, home/results `home-results.mjs`, Friends `guest.mjs` | PASS (local stack): Daily and Friends unaffected |
| Production build | Succeeds. The lazy Unlimited chunk is about 100 KB gzip (live: 82 KB), from 211 more pairs and the bank. |
| Lint | Only the 4 pre-existing `src/App.jsx` errors |
| Unchanged | Of the 1,370 live pairs, only AQUARIUM's explanation changed (owner wording, old text in provenance). Earlier preferences and overrides are untouched (additions only), and so are `pool.json`, `App.jsx`, Daily and Friends. |

