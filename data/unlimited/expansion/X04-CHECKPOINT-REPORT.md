# Unlimited x04: corrections, owner supplement, and the first 25-family checkpoint (local, held)

2026-10-19. Worktree `C:\Users\leviw\cluevoyance-unlimited`, new branch **`feature/unlimited-x04`** from the x03 release candidate `f36a791`. The held x03 pilot (`0fde927`) and the x03 report (`3e69055`) stay untouched on `feature/unlimited-x02`. **Nothing was pushed, merged or deployed, and no database content was changed.** The live word bank was read once (read-only).

**Usage:** I verified via `get_usage` that `extraUsage.enabled = false` (Max plan; 5-hour window at 2% and weekly at 68% when work started). **8 of the 12 allowed content calls** were used, all on Opus 5.5 (each echoed `claude-opus-5-5`), about 831k tokens in total. No Fable content calls were made. Every call is logged in `data/unlimited/expansion/x04-calls.json`.

## Commits and the release boundary

| Commit | What | Served content? | Browser evidence |
|---|---|---|---|
| `0175b59` | **Phase 1: narrow corrections.** Stored-but-unserved fixes, explanation rewrites, ELVIS + PYRAMID held, bank 1,203 | yes | yes |
| `c038883` | **Phase 2: owner supplement.** 96 owner entries added and served; ledger for all 138 | yes | yes |
| `e26ed81` | Supplement review: 9 text fixes, 21 suggestions reviewed, TELESCOPE / ARMORY held | yes | yes |
| `4ebfabb` | 25-family related-word index and capped proposals (data and tools only) | no | n/a |
| `70ab208` | Offline sampler experiment script (the app's sampler is unchanged) | no | n/a |
| **↑ release candidate ends here (`70ab208`)** | | | |
| `684d02f` | **Checkpoint results:** 200 proposals reviewed, 175 playable | yes, **held** | random-check, long-words, reveal-widths, daily-smoke (see Tests) |
| `c4a1bb8` | Checkpoint: BAND + CAR (JAM / HORN) and MAP + PIANO (KEY / SCALE) as equal sets | yes, **held** | as above |
| `3a354cc`, `3d00875` | `reveal-widths` browser check (320 / 390 / 1280) and sampler results; the test uses release-candidate pairs only | test only | yes |
| `bdc1d48` | Lint: 3 unused variables in my scripts (2 date from `0175b59`) | scripts only | n/a |

To release the corrections and supplement without the checkpoint, take everything up to `70ab208` and cherry-pick `3d00875`'s test file and `bdc1d48`; both touch only tests and scripts.

## Phase 1: narrow corrections

- **Stored vs. served,** checked against the real client export rather than the research files:
  - KING + QUEEN → CHESS, KNIGHT + CASTLE → CHESS and CLOWN + HAMBURGER → MCDONALDS were stored but never served. Each is now an equal set with the hint the pair already served (BED / CHESS, MEDIEVAL / CHESS, RONALD / MCDONALDS), so nothing stronger was displaced.
  - BIRD + FOOTBALL (EAGLE / CARDINAL / FALCON / RAVEN) and BASEBALL + BIRD (CARDINAL / JAY / ORIOLE) are unchanged.
  - COOKIE + MILK keeps DIP and serves DIP / OREO as an equal set. DUNK stays playable but is not served.
  - The 502 other multi-hint pairs were not touched.
- **Explanations** now say why the hint clicks:
  - Your wording for CROWN + IRON → THRONE, HEART + KING → CARD and ICE + LION → NARNIA. The Narnia sentence was adjusted after the fact check, because Aslan *returns* to Narnia: "Aslan the lion returns to Narnia, a land trapped in the White Witch's icy winter."
  - The rest of each hint family: THRONE ×6, NARNIA ×2, CARD ×4.
  - The DUNE fix ("roam") reached both exported variants.
- **MEMPHIS:** ELVIS + PYRAMID → MEMPHIS is held, for consistency with your EGYPT + ELVIS rejection. This is recorded as a coordinator-brief decision, not a separate owner ruling.
- **Word bank:** 1,203 words. CROW (id 2788) is back; every earlier id is unchanged.
- **Still open (reported, not fixed):** 744 of about 1,400 served explanations are in the old terse "HINT: …" style, such as "Card: the king of hearts." They are now visible on the reveal screen. A cleanup pass of about 19 calls at 40 per call is proposed for a later checkpoint. The per-word lines are often repetitive; that is noted for later and the modal is unchanged.

## Phase 2: owner supplement (138 entries)

**The full table is attached as `x04-reconciliation-138.csv` / `.md`.** For every entry it gives the latest bank status, existing or added, the decision, served yes/no in the release candidate and in the checkpoint, the preference or equal-set treatment, and the final explanation or reason.

| Outcome | Count |
|---|---|
| Owner entries added as owner decisions; **all 96 verified served** | 96 |
| Missing bank word (kept in the ledger): 030 WRESTLING + POETRY → SLAM; 083 ANTIQUE + BOTTLE → WINE (the bank has ANTIQUITY; not substituted) | 2 |
| Blocked by the hint rule because SEAGULL contains SEA: 099 SEA + CROW, and suggestions SEA + BIRD / PIGEON / CRANE | 4 |
| Suggestions accepted after review (16), plus LIGHTNING + CAR → MCQUEEN, which was already served since x01 | 17 |
| Held: BEACH / OCEAN + CRANE → SEAGULL, CAMP + COOKIE → SMORE (reviewer: SCOUT is better), JOKE + SPECIES / WILD → HYENA, TELESCOPE, ARMORY, BAKER | 8 |
| Pending your decision: GAS + VIRGIN → MOBIL / MOBILE (spelling) | 2 |
| Withdrawn or superseded, recorded as owner rejections: BOOK + CROW (HITCHCOCK, POE), POOP, WASHINGTON, HUNGER, PRISON, STEVEO, ILLEGAL, BOB | 9 |

Notes:
- **Corrections from the independent fact check** (9 slips fixed):
  - Louis XVI's reign ended before his execution.
  - Knievel's canyon jump was a rocket, not a motorcycle.
  - There are several hammerhead and kangaroo species.
  - "The Sound of Silence" was "one of" Simon & Garfunkel's biggest hits.
  - Storybook pirates walk the plank.
  - Dragons fight for the Iron Throne; they don't win it.
  - Investing *can* pay off.
- **Loose owner associations are kept honest:**
  - GEICO's gecko is called "a lizard like the chameleon".
  - Fiona is "Princess Fiona, daughter of the King and Queen".
  - The pigsty is "a pig's idea of a luxury suite".
  - CHECKMATE is explained as "every escape is forbidden".
- **Formatting choices:**
  - S'MORE is stored as **SMORE**, because hints are letters only (like MCDONALDS). The reviewer noted it may look odd to players; your call.
  - STEVE-O is recorded as STEVEO, but only as a rejection.
- **Unresolved items, each needing your decision:**
  - **PLANK + GLASS → TELESCOPE:** held. The reviewer failed it because PLANK needs a pirate-ship detour that TELESCOPE doesn't supply; it suggested PIRATE. SPYGLASS is not used.
  - **WEAPON + BUSINESS → ARMORY:** held. The BUSINESS side rests on gun shops naming themselves "Armory", which reads as invented. DEALER is not used.
  - **DOUGH + RULER → BAKER:** still held; MEASURING serves the pair. One question: *what does RULER mean to you in this clue?*
  - **MOBIL vs MOBILE:** which spelling?
- **Group updates:**
  - CROW was added to the birds group (sense: the bird, not a rooster's crow). PIGEON and CRANE were verified.
  - A new nautical group: SHIP, BOAT, CAPTAIN (a ship's captain), OCEAN, SEA, SAIL, PORT, DECK, KNOT, OAR, RAFT, LIGHTHOUSE, TITANIC, WAVE.
  - SEA and SAIL can't be targets for SEAGULL and SAILOR, because each hint contains them.
- **Hint concentration:** your 12 STY pairs make STY the third most frequent hint (about 3.6% of boards in the release candidate). That is reported here, not capped.

## The 25-family checkpoint (held)

**Families:** SEAGULL, SLAM, PICK, LAVA, DECK, SAILOR, JAM, BARK, TRUNK, PITCH, RING, FAN, NET, BOW, SHELL, CRUST, ORBIT, MINT, KEY, HORN, WING, PUNCH, SCALE, BOLT, CHIP. All are hints with several familiar meanings that many bank words reach. QUEEN was swapped for DECK because QUEEN already serves 7 pairs.

**Method:**
1. I wrote the routes (one per meaning).
2. One independent Opus check of the index against all 1,203 bank words (call 3) found 122 missing words, including 23 new meanings such as Finding Nemo's "Mine!", candy bark, the upper crust, Pearl Jam and the key ring. It also found 14 wrong or overstated clauses; for example, Saturn isn't "the planet with rings", and a deck isn't a raised patio. Applied by `x04-apply-index-review.mjs`.
3. A seed-recall check, labelled as such (it is not a blind discovery test), caught the missing pitchfork route for FORK + TENT → PITCH.
4. The finder produced 2,073 combinations, 1,246 of them eligible. **200 (8 per family, round-robin across meanings)** went to five reviewers (calls 4–8).

| Family | Proposed | Review PASS | Reviewer BORDERLINE | Held by strict bar | Playable & served |
|---|---|---|---|---|---|
| BARK / BOW / FAN / HORN / JAM / KEY / LAVA / PICK / PITCH / PUNCH / RING / SHELL / SLAM / TRUNK | 8 each | 8 each | 0 | BARK 2 | 8 each (BARK 6) |
| WING / SCALE / CHIP | 8 each | 8 each | 0 | 2 each | 6 each |
| SEAGULL | 8 | 8 | 0 | 1 | 7 |
| NET / CRUST / MINT | 8 each | 7 each | 1 each | 0 | 7 each |
| ORBIT | 8 | 6 | 2 | 0 | 6 |
| SAILOR | 8 | 7 | 1 | 2 | 5 |
| BOLT | 8 | 5 | 3 | 0 | 5 |
| DECK | 8 | 4 | 4 | 1 | 3 |
| **Total** | **200** | **187** | **13** | **12** | **175** |

**The full 200-row table is attached as `x04-checkpoint-200-proposals.csv` / `.md`.** For each proposal it lists the targets, hint, route, final explanation, both per-word lines, raw reviewer verdict and scores, the reviewer's reason, final status, hold reason, served in the checkpoint vs. the release candidate, and whether the text was corrected.

**Why there is a strict bar on top of the reviewers.** The five reviewers passed 94% of proposals, which is more lenient than your latest standard ("I don't instantly think of Millennium Falcon"). I held the 12 passes where a reviewer scored one side "needs a moment" or recognition only "moderate". These are reversible overrides with reasons:
- Sailor Moon (×2)
- "waiting in the wings" (×2)
- blue-chip stocks
- a golf chip shot
- BALANCE as a weighing scale (×2)
- a boss who "barks orders" (×2)
- skateboard deck
- BIRD + BOAT → SEAGULL

SLAM + POETRY was kept because you approved "poetry slam" twice. The reviewers' own holds include:
- the Disney film *Bolt* (×3), the same problem as the Millennium Falcon
- DECK as baseball's "on deck" and as a skateboard deck
- MINT + GARDEN
- ORBIT + STATION and ORBIT + MINT (chained)
- PIE + PLANET → CRUST
- BASKETBALL + CIRCUS → NET (safety net)

**Player-facing sample, strong ones** (final text as served):
- STAGE + VIOLIN → **BOW**: Performers take a bow on stage, and a violin is played with a bow.
- BITE + TREE → **BARK**: His bark is worse than his bite, and bark covers a tree's trunk.
- FRY + MINE → **SEAGULL**: Seagulls swoop in to steal your french fries, and the seagulls in Finding Nemo squawk "Mine! Mine!". *(The ". after the quote is a template artifact; fix it in polish.)*
- BASEBALL + BUSINESS → **PITCH**: The pitcher throws the pitch in baseball, and entrepreneurs pitch their business to investors.
- BEACH + GAS → **SHELL**: You collect seashells on the beach, and Shell is a gas station brand.
- CAR + MAMMOTH → **TRUNK**: A car's trunk holds the luggage, and a woolly mammoth had a long trunk like an elephant's.
- CANDY + CURRENCY → **MINT**: Mints are little candies, and the U.S. Mint makes the nation's coins.
- DRAGON + PIANO → **SCALE**: Dragons are covered in scales, and piano students practice scales.
- BOXER + JOKE → **PUNCH**: A boxer throws punches, and a joke ends with the punchline.
- BASEBALL + BASKETBALL → **SLAM**: A grand slam is a home run with the bases loaded, and a slam dunk is basketball's most exciting shot.
- From the supplement: INSECT + BAND → **BEATLES**; COWBOY + SOCCER → **LASSO** (Ted Lasso).

**Genuinely questionable, playable now; your eye please:**
- CONCERT + STADIUM → **FAN**: the same sense on both sides, with targets already close to each other.
- PIE + PIZZA → **CRUST**: same sense and flat (the same applies to BREAD + PIE and BREAD + PIZZA).
- CAR + SUITCASE → **TRUNK**: the two senses are both luggage storage.
- BLACK + FORK → **PITCH**: two plain phrase-joins.
- BASKETBALL + HAIR → **NET** (hairnet) and CAR + SHOE → **HORN** (shoehorn): compound joins.
- DRAFT + ICE → **PICK** and MAP + TEST → **KEY**: easy but flat.
- From the owner supplement (your choices; the text is kept honest): TELEVISION + CHAMELEON → GEICO, LION + BATH → GROOMING, AMBULANCE + WISH → PRAY.

**What the checkpoint teaches us:**
1. **The best families have several everyday meanings** (BOW, PITCH, TRUNK, SHELL, PUNCH, RING, KEY). Almost every cross-meaning pair clicks. Families resting on one niche sense (DECK as skateboard or "on deck", BOLT as the Disney film, SAILOR Moon) are where the holds cluster.
2. **Checking against the whole bank matters.** The index check added a fifth of the words and caught overstatements before any review.
3. **Reviewers alone are too generous for your bar.** The strict bar based on the reviewers' own side scores is cheap and consistent. A second strict reviewer on the PASS set would cost about 5 calls per 200 proposals.
4. **Mechanical explanations are accurate but sometimes stiff.** A light polish pass would help before release.

## Phase 3: sampler experiment (offline, held)

`scripts/unlimited/sampler-experiment.mjs` makes every board with the app's own `generateBoard` and `validateBoard` (0 invalid boards). Only the set of pairs each call may choose from changes. The app's sampler is **unchanged**. 200 players × 30 boards:

| Library | Strategy | Distinct targets | Repeated pairs | Repeated hint showings (same hint, other pair) | Most times one hint seen | Boards between hint repeats | Top hints (share of boards) | Pairs never shown |
|---|---|---|---|---|---|---|---|---|
| Release candidate | current | 124.1 | 3.48 | 11.1 (7.6) | 2.87 | 10.4 | SEA 4.7%, FROZEN 4.2%, STY 3.6% | 0 / 1,515 |
| Release candidate | hint-first | 130.1 | 4.88 | 6.3 (1.4) | 2.13 | 11.8 | none above 0.7% | 11 / 1,515 |
| Release candidate | **recent (last 10 boards)** | 126.2 | **2.07** | **5.6** (3.5) | 2.03 | **16.8** | FROZEN 3.6%, SEA 3.4%, STY 2.8% | 0 / 1,515 |
| + checkpoint | current | 133.8 | 3.28 | 12.4 (9.1) | 2.99 | 10.1 | SEA 4.6%, FROZEN 3.5%, HALLOWEEN 3.0% | 0 / 1,688 |
| + checkpoint | hint-first | 131.8 | 4.61 | 6.1 (1.6) | 2.15 | 11.7 | none above 0.8% | 24 / 1,688 |
| + checkpoint | **recent** | 134.1 | **1.93** | **6.3** (4.4) | 2.09 | **16.7** | SEA 3.5%, FROZEN 2.9%, SEAGULL 2.8% | 0 / 1,688 |
| + checkpoint + x03 pilot | current | 136.6 | 2.90 | 13.0 (10.1) | 3.21 | 10.0 | **FROZEN 6.9%**, SEA 3.9%, EAGLE 3.6% | 0 / 1,770 |
| + checkpoint + x03 pilot | recent | 137.1 | 1.76 | 6.5 (4.8) | 2.15 | 16.6 | FROZEN 4.6%, SEA 3.1%, EAGLE 2.9% | 0 / 1,770 |

**Reading it:**
- **Light recent-history** (skip pairs whose hints were all shown in the last 10 boards) about halves both repeated pairs and repeated hints. It keeps every pair reachable and doesn't change board rules.
- **Hint-first** flattens hint concentration the most, but repeats *pairs* more. It also starves pairs whose hint is shared (11–39 pairs never shown).
- **The checkpoint adds word variety** (+10 distinct targets per 30 boards) with a modest rise in hint repeats.
- **The x03 pilot re-concentrates FROZEN.**
- **Recommendation for the coordinator:** trial light recent-history. Nothing is wired in.

Sample board sequences from the same player, release candidate + checkpoint:
- **current:**
  - STRIPES (REFEREE + ZEBRA), SCALE (DRAGON + MAP), TERRARIUM, SCHOOL
  - ATTACK, OMEGA, SMITH, WILBUR
  - FLIGHTLESS, LEAP, SCRUBS, SKIP
  - WOODY, SEASONS, THRONES, PRINCE
  - CASTLE, WILD, STING, HALLOWEEN
  - SEAGULL (BIRD + FRY), POPPINS, FROZEN, BREAK
- **recent:** the same first board, then:
  - WONKA, NIGHT, VEGAS, RODENT
  - SUPERMAN, SPOUT, PLANK, ROLL
  - CLIFF, CHESS, WIND, CLEAR
  - BOO, SWAMP, GUMP, MINT
  - SONG, CRAB, CIRCUS, STY

## Tests

| Check | Release candidate content (`e26ed81`, served as of `70ab208`) | Checkpoint (`c4a1bb8` onward) |
|---|---|---|
| vitest | 171/171 | 171/171 |
| Content script tests | 66/66 | 66/66 |
| `check-random` (full board checker) | 500/500 | 1,000 + 500 / all pass |
| Browser: random-check (phone + desktop), storage-failure, long-words (320 / 390 / 1280), Daily daily-smoke, home-results, Friends guest | **all PASS** | **all PASS**: random-check, long-words, reveal-widths, daily-smoke |
| Browser: reveal-widths (explanation + both lines at 320 / 390 / 1280, no sideways scroll) | **PASS** (release-candidate pairs only) | PASS |
| Production build | n/a | builds; Unlimited chunk 121.9 KB gzip (x03: 105.7) |
| Lint | 4 existing `App.jsx` errors after `bdc1d48` | same |

Screenshots are in `C:\Users\leviw\crystal-clues\unlimited-preview\x04-shots\`; `reveal\reveal-phone-320.png` shows the explanation at 320 px. Passing tests show the boards are valid. They are not evidence that the clues are good; that judgment is in the tables above.

## Process notes

- One checkpoint reviewer reported opening part of another reviewer's scratch helper script by mistake. It says this had no effect on its verdicts. I'm noting it for transparency; its results are kept.
- The dev server that served the earlier tests had stopped, so the browser checks ran on this session's own preview server, on the same port.
- My edits to `x03-requests.mjs` (env-configurable for x04) keep the x03 behaviour by default.

## Proposed next bounded checkpoint (not started)

- **(a) Explanation polish:** the 744 terse served explanations, the checkpoint template artifacts and the repetitive per-word lines. About 19 calls (40 per call) plus one fact check.
- **(b) Second strict reviewer** on the 175 playable checkpoint proposals: 5 calls.
- **(c) The next 25 families:** about 8 calls, the same as this checkpoint.

Each is gated on your review. The decisions above, from Phase 2 (BAKER, MOBIL / MOBILE, TELESCOPE, ARMORY, SMORE) and Phase 3 (sampler), come first.
