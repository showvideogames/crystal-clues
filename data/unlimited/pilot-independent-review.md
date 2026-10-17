# Cluevoyance Unlimited — independent semantic review of the 20-word pilot

Read-only review. Nothing in the repository was modified: no clue, no schema, no validator, no
test, no `App.jsx`, no Supabase, no website. Nothing was committed, pushed or deployed. The only
two files created are this one and `pilot-independent-review.json`.

**Independence.** Phases 1 to 3 — scoring all 536 current clues, reviewing all 150 removed clues,
and reaching a verdict on all 190 pairs — were completed and written to disk *before*
`pilot-clue-quality-audit.json`, `pilot-quality-review.md` or `pilot-review.md` were opened. No
score in this review was altered after reading the previous audit. Where I disagree with the
earlier reviewer I have kept my own scoring and explained the disagreement in section 11.

**What this is and is not.** These are judgements, not measurements. I did not playtest. Every
fairness and recognizability score is my estimate of what a general audience knows, and a real
audience will prove some of them wrong in both directions.

---

## 1. Total current clues reviewed

| | |
|---|---|
| Pairs | 190 |
| Clue records reviewed | **536** |
| Of those, written after the previous audit | 110 |
| Of those, carried over and previously audited | 426 |
| Removed clues also reviewed (phase 2) | 150 |
| Total clue judgements in this review | 686 |

Clue counts per pair: 37 pairs hold two clues, 150 hold three, 3 hold four. No pair holds five.

---

## 2. PASS / BORDERLINE / FAIL counts

| Verdict | Count | Share |
|---|---|---|
| PASS | 450 | 84.0% |
| BORDERLINE | 80 | 14.9% |
| FAIL | 6 | 1.1% |

**BORDERLINE is not a failure count.** The previous audit used a binary pass/fail with a
threshold of 6 out of 10. I used three verdicts, so a clue that scored exactly 6 there and got a
clean "pass" will often appear here as BORDERLINE. A BORDERLINE clue is playable; it is simply
not dependable enough to be one of only two clues in a pair. Only PASS counts toward the minimum.

Split by origin — the single most important number in this review:

| Group | Clues | PASS | Pass rate |
|---|---|---|---|
| Written after the previous audit (self-approved) | 110 | 81 | **73.6%** |
| Carried over (independently scored by the previous audit) | 426 | 369 | **86.6%** |

The previous review predicted this gap in its own caveat — "the person who wrote them also
approved them" — and then reported the new clues at 100% passing. The gap is real and it is
13.0 points.

---

## 3. Pairs with at least two independently passing clues

**171 of 190 pairs (90.0%)** carry two or more clues I would defend.

The previous audit reported 0 pairs below the minimum. I find 19. Almost all of that gap is the
110 self-approved clues: 11 of my 19 below-threshold pairs contain at least one clue the repair wrote,
and in 3 of them — BANK + MIRROR, HONEY + MIRROR and HONEY + SHADOW — every clue is new.

After applying the 13 recommended restorations from section 5, 172 of 190 pairs clear the bar and
**18 still need new clues written**.

Below-threshold pairs are not spread evenly. Incidence by word:

| Word | Below-threshold pairs | Pass rate across its 19 pairs |
|---|---|---|
| MIRROR | 6 | 78.4% |
| SHADOW | 5 | 69.4% |
| HONEY | 4 | 75.0% |
| MOON | 4 | 81.6% |
| GHOST | 3 | 76.4% |
| KEY | 3 | 80.8% |
| BANK | 2 | 83.0% |
| BRIDGE | 2 | 80.0% |
| CROWN | 2 | 78.6% |
| ROSE | 2 | 86.8% |
| DIAMOND | 1 | 84.9% |
| ENGINE | 1 | 78.2% |
| FIRE | 1 | 89.7% |
| HEART | 1 | 92.6% |
| SNAKE | 1 | 81.8% |

The pilot was designed expecting SHADOW, ENGINE and MIRROR to be the hard words. SHADOW and
MIRROR are, and **MIRROR is the worst word in the set, not ENGINE**. ENGINE finished at 78.2% with
only one below-threshold pair; it is dry but it is concrete, and concrete words clue well. MIRROR
is abstract, has almost no compounds, and its best clues keep collapsing into REFLECT, SILVER or
"they are both car parts". The word-selection instinct was right about the difficulty and wrong
about which word would cause it.

---

## 4. Every pair below the threshold

Nineteen pairs. `→` shows what restoration would achieve.

| Pair | Clues now | P/B/F | Restore | After | Needs new writing |
|---|---|---|---|---|---|
| **BANK + GHOST** | VAULT* `B`, ACCOUNT* `B`, TOWN `B` | 0/3/0 | VANISH | 1 PASS | **yes** |
| **BANK + MIRROR** | CHECK* `B`, SILVER* `P` | 1/1/0 | WATER | 2 PASS | no |
| **BRIDGE + MIRROR** | DOUBLE `B`, VENICE* `B` | 0/2/0 | WATER | 1 PASS | **yes** |
| **BRIDGE + SHADOW** | TROLL `B`, UNDER `B`, ARCH `B` | 0/3/0 | — | 0 PASS | **yes** |
| **CROWN + ENGINE** | WHEEL* `B`, TRAIN `B`, PISTON* `F` | 0/2/1 | POWER | 1 PASS | **yes** |
| **CROWN + MIRROR** | QUEEN `P`, VANITY `B`, GOLD `B` | 1/2/0 | — | 1 PASS | **yes** |
| **DIAMOND + MIRROR** | SCRATCH `B`, GLASS `P` | 1/1/0 | — | 1 PASS | **yes** |
| **FIRE + MOON** | RING `P`, NIGHT `B`, LANTERN* `B` | 1/2/0 | — | 1 PASS | **yes** |
| **GHOST + HONEY** | TRAP `P`, TOMB* `B` | 1/1/0 | — | 1 PASS | **yes** |
| **GHOST + MOON** | NIGHT `B`, WALK* `P`, HAUNT `B` | 1/2/0 | — | 1 PASS | **yes** |
| **HEART + SHADOW** | SECRET `B`, DOUBT* `B` | 0/2/0 | — | 0 PASS | **yes** |
| **HONEY + MIRROR** | COMB* `P`, DRESSING* `B` | 1/1/0 | — | 1 PASS | **yes** |
| **HONEY + MOON** | WEDDING `P`, MONTH `B` | 1/1/0 | — | 1 PASS | **yes** |
| **HONEY + SHADOW** | SPY* `B`, EYE* `B`, TREE* `B` | 0/3/0 | — | 0 PASS | **yes** |
| **KEY + MOON** | PIANO `P`, SONATA `B` | 1/1/0 | — | 1 PASS | **yes** |
| **KEY + SHADOW** | DOOR `B`, CABINET* `B` | 0/2/0 | SKELETON | 0 PASS | **yes** |
| **KEY + SNAKE** | FLUTE `P`, CHARM `B` | 1/1/0 | — | 1 PASS | **yes** |
| **MIRROR + ROSE** | BEAUTY `P`, VANITY `F` | 1/0/1 | TINT | 1 PASS | **yes** |
| **ROSE + SHADOW** | SHADE `P`, DUSK `B` | 1/1/0 | — | 1 PASS | **yes** |

`*` = written after the previous audit. 11 of these 19 pairs contain at least one new clue.

Notes on the worst of them:

- **HONEY + SHADOW** — 0 PASS. Section 9 in full.
- **CROWN + ENGINE** — 0 PASS. WHEEL and PISTON are drivetrain vocabulary (a crown wheel, a piston
  crown); TRAIN reaches CROWN only through the Royal Train. All three clues ask the player to know
  a trade. Restoring POWER gives one fair clue back and the pair still needs a second.
- **BRIDGE + SHADOW** — 0 PASS from three clues. TROLL points hard at BRIDGE and barely at SHADOW;
  UNDER is a bare preposition; ARCH is "solid objects cast shadows", which is true of everything.
- **HEART + SHADOW** — 0 PASS. Both clues work only on the figurative sense of shadow. Nothing
  touches the heart as an organ, so the pair is abstract on both sides at once.
- **BANK + GHOST** — 0 PASS. VAULT and ACCOUNT both point at BANK and reach GHOST by a step the
  explanation takes for the player; TOWN is the reverse. Restoring VANISH is the cheapest fix.
- **KEY + MOON** — PIANO and SONATA are the same referent, the Moonlight Sonata, twice. The pair
  effectively has one clue.
- **HONEY + MOON** — worth singling out because the word list chose HONEY specifically to give the
  pilot a known-good compound. It ends up on two clues, one of which (MONTH) is an etymology
  lesson. The designated easy case is below the bar.
- **MIRROR + ROSE** — BEAUTY is genuinely good; VANITY is a rose placed on a table next to a
  mirror, which is set dressing, not a connection. It is one of the five outright failures.

---

## 5. Removed clues recommended for restoration

All 150 removed clues were reviewed individually. My verdicts on them: 20 PASS, 72 BORDERLINE, 58 FAIL.

**Most removals were right.** The colour purge in particular was correct and overdue: GOLD in
eleven pairs, WHITE and PALE and DARK doing nothing but "these two things are the same shade" are
exactly the padding the brief excludes. I would not restore any of them.

I recommend restoring **23** clues — 13 firmly and 10 optionally. Every one keeps its pair at or
under five clues, none is a true within-pair duplicate, and none is a pilot word.

### Recommended (13)

| Pair | Clue | Pair size now → after | Why restore |
|---|---|---|---|
| BANK + CROWN | **GOLD** | 3 → 4 | Not a colour clue here: crowns are made of gold and gold is what banks were built to hold. Both material and literal. Pair goes to 4. |
| BANK + GHOST | **VANISH** | 3 → 4 | A ghost vanishes and money vanishes from an account; both sides are real and the pair badly needs a third that is not asymmetric. |
| BANK + LIGHT | **SWITCH** | 3 → 4 | "A bank of switches" is a genuine fourth sense of BANK and switches turn on lights. Distinct from the other three clues. |
| BANK + MIRROR | **WATER** | 2 → 3 | River bank plus still water as a mirror. Concrete on both sides and this pair currently has the weakest two clues in the set. |
| BANK + MOON | **SILVER** | 2 → 3 | The silver moon and silver as the metal banking was built on. Fair and recognisable; pair is on two. |
| BANK + SPRING | **RIVER** | 2 → 3 | A spring feeds the river and the river runs between its banks. Plain, fair, and the pair only has two. |
| BRIDGE + CROWN | **LONDON** | 3 → 4 | London Bridge plus the crown jewels a few hundred yards away. Adds a non-dental idea to a pair that is otherwise entirely dentistry. |
| BRIDGE + HONEY | **NIAGARA** | 3 → 4 | Honeymoon capital and the crossing there was literally named the Honeymoon Bridge. Both words present in one place name. |
| BRIDGE + MIRROR | **WATER** | 2 → 3 | Still water under a bridge genuinely works as a mirror. This pair currently has no clue that is fair on both sides. |
| CROWN + ENGINE | **POWER** | 3 → 4 | Political power and mechanical power. Abstract but genuinely bidirectional, and it is the only fair, recognisable clue this pair can have. All three retained clues are drivetrain jargon. |
| DIAMOND + GHOST | **VANISH** | 3 → 4 | A stolen stone vanishes overnight and so does a ghost. Worth restoring because the retained FOREVER fails on its ghost half. |
| DIAMOND + HORSE | **RING** | 2 → 3 | A show horse is paraded in the ring and a diamond is set in one. Both sides concrete and the pair only has two clues. |
| GHOST + SPRING | **RISE** | 3 → 4 | Everything rises in spring and a ghost rises from the grave. Modest but fair on both sides, and the retained JACK fails outright. |

### Optional (10)

| Pair | Clue | Pair size now → after | Why |
|---|---|---|---|
| DIAMOND + HONEY | RING | 3 → 4 | Putting a diamond ring on the finger of the person you call honey is an enjoyable lateral, and the retained CLARITY is weak. Honey side is a pet-name hop, so optional. |
| FIRE + KEY | START | 3 → 4 | You start a fire and a key starts a car. Plain but fair on both sides, and stronger than the retained ESCAPE. |
| HEART + IRON | COLD | 3 → 4 | Iron is cold to the touch and a cold heart has no feeling in it. Genuinely good; the pair is simply already strong at three. |
| HONEY + HORSE | OATS | 2 → 3 | Oats for the horse and honey on your own. Everyday and concrete on both sides; the pair is on two. |
| HORSE + SALT | WATER | 2 → 3 | Lead a horse to water, and salt water is the kind nothing can drink. Two real idioms and the pair is on two. |
| IRON + SNAKE | COIL | 2 → 3 | A snake coils and iron is coiled into wire and springs. Concrete on both sides; the pair is on two. |
| KEY + SHADOW | SKELETON | 2 → 3 | Skeleton key is exact for KEY, but "a skeleton is the shape a shadow makes of a person" is the explanation reaching. Better than the retained CABINET; the pair still needs new writing. |
| LIGHT + MOON | SILVER | 3 → 4 | Both the moon and the light it throws are called silver. Fair on both sides; pair goes to four. |
| MIRROR + MOON | REFLECT | 3 → 4 | Unlike the other REFLECT removals this one is genuinely bidirectional and does not duplicate FACE, SILVER or TELESCOPE. Counts against it that it half-defines MIRROR. |
| MIRROR + ROSE | TINT | 2 → 3 | Rose-tinted is exact for ROSE; a tinted mirror is weak. Still better than the retained VANITY, which fails. Pair needs new writing regardless. |

### The removals I most disagree with

**71 of the 150 removals were clues the previous audit itself passed.** They were cut to hold a
global repeat ceiling or because another clue in the pair was judged better. The brief for this
review is explicit that repetition belongs to board generation, not to clue quality, and that a
good clue should not be dropped because its text appears elsewhere. On that basis:

- **BANK + MIRROR `WATER`** and **BRIDGE + MIRROR `WATER`** were cut while WATER was trimmed from
  seven pairs to four. Both pairs were then left with two clues that do not pass. This is the
  clearest case of the ceiling costing real quality.
- **BRIDGE + HONEY `NIAGARA`** was failed for depending on "a specific bridge demolished in 1938".
  That undersells it: Niagara is the honeymoon capital in ordinary general knowledge, entirely
  independent of the bridge, and the bridge name is a bonus rather than the load-bearing fact.
- **CROWN + ENGINE `POWER`** was failed as too abstract, and its replacements are drivetrain
  jargon. Political power and mechanical power is the only clue here an ordinary player reaches.
- **BRIDGE + CROWN `LONDON`** was failed as "proximity in a city". London Bridge and the crown
  jewels are both London-defining; meanwhile the pair it left behind is three dentistry clues.
- **MIRROR + MOON `REFLECT`** was cut in a general REFLECT purge. The purge was right in principle
  — REFLECT half-defines MIRROR — but this instance is genuinely bidirectional and the pair could
  carry it as a fourth clue.

---

## 6. The 25 weakest current clues

Ranked worst first: failures, then borderlines by ascending total. `*` = newly written.

| # | Pair | Clue | Verdict | Total | Why |
|---|---|---|---|---|---|
| 1 | CROWN + ENGINE | **PISTON*** | FAIL | 4/10 | Piston crown is specialist mechanic vocabulary. Unfair and unrecognisable. |
| 2 | DIAMOND + GHOST | **FOREVER*** | FAIL | 4/10 | A Diamond Is Forever is strong; the ghost half is a joke the explanation makes, not a connection. |
| 3 | GHOST + SPRING | **JACK** | FAIL | 4/10 | Spring-heeled Jack is Victorian obscurity; JACK evokes no ghost for a modern player. |
| 4 | HORSE + SNAKE | **VENOM** | FAIL | 4/10 | Antivenom produced in horses is veterinary trivia; no player reaches HORSE from VENOM. |
| 5 | MIRROR + ROSE | **VANITY** | FAIL | 4/10 | A rose on the vanity table is the explanation placing a prop; no real connection. |
| 6 | HORSE + KEY | **GATE** | FAIL | 7/10 | Identical proverb to STABLE, with the same explanation text. True within-pair duplicate. |
| 7 | GHOST + HONEY | **TOMB*** | BORDERLINE | 3/10 | Honey in Egyptian tombs is trivia; the ghost side is only the tomb setting. |
| 8 | BANK + GHOST | **ACCOUNT*** | BORDERLINE | 4/10 | "Ghost account" is not a settled phrase; BANK side does all the work. |
| 9 | CROWN + ENGINE | **WHEEL*** | BORDERLINE | 4/10 | Crown wheel is drivetrain jargon; almost no player reaches CROWN from WHEEL. |
| 10 | DIAMOND + FIRE | **VOLCANO*** | BORDERLINE | 4/10 | Kimberlite pipes are geology trivia and volcano-to-fire is loose. |
| 11 | BANK + ENGINE | **DRIVE** | BORDERLINE | 5/10 | Drive-through is a weak reach for BANK; ENGINE side is near-tautology. |
| 12 | BANK + GHOST | **VAULT*** | BORDERLINE | 5/10 | Burial vault is real but GHOST is one step past it; badly asymmetric. |
| 13 | BANK + HEART | **TRUST** | BORDERLINE | 5/10 | Both reaches are loose; trust fund is finance-generic. |
| 14 | BANK + MIRROR | **CHECK*** | BORDERLINE | 5/10 | Cheque/check spelling split, and checking in a mirror barely evokes MIRROR. |
| 15 | BANK + ROSE | **HEDGE*** | BORDERLINE | 5/10 | Hedge fund is good; hedgerow rose is a gardener fact, not a player one. |
| 16 | BANK + SALT | **SALARY** | BORDERLINE | 5/10 | Rests entirely on the sal-/salary etymology the explanation states. |
| 17 | BRIDGE + CROWN | **ARCH*** | BORDERLINE | 5/10 | Crown-of-an-arch is architect vocabulary, not general knowledge. |
| 18 | BRIDGE + MIRROR | **DOUBLE** | BORDERLINE | 5/10 | Only works once you supply the water the explanation supplies. |
| 19 | BRIDGE + SNAKE | **CABLE** | BORDERLINE | 5/10 | The snake reading is the explanation simile, not the word meaning. |
| 20 | CROWN + MIRROR | **GOLD** | BORDERLINE | 5/10 | A gilt frame is incidental. Colour/material padding. |
| 21 | DIAMOND + MOON | **SKY** | BORDERLINE | 5/10 | Lucy in the Sky with Diamonds contains no moon; the explanation smuggles it in. |
| 22 | FIRE + MOON | **NIGHT** | BORDERLINE | 5/10 | Pure scene-setting; nothing but mood connects these. |
| 23 | GHOST + MOON | **NIGHT** | BORDERLINE | 5/10 | Mood only; the moon is the night light and the ghost merely shares the hour. |
| 24 | HEART + SHADOW | **SECRET** | BORDERLINE | 5/10 | Both reaches are mood-level; nothing lexical anchors it. |
| 25 | HONEY + SHADOW | **TREE*** | BORDERLINE | 5/10 | Bee tree is a beekeeping term; the shade half is true of any tree. |

The six outright failures deserve naming separately, because they should not ship as written:

1. **CROWN + ENGINE `PISTON`** — a piston crown is mechanic vocabulary. No player reaches CROWN.
2. **DIAMOND + GHOST `FOREVER`** — "a diamond is forever, and so, inconveniently, is a ghost" is a
   joke made by the explanation. The clue itself has no ghost half.
3. **GHOST + SPRING `JACK`** — Spring-heeled Jack is Victorian obscurity. JACK evokes no ghost.
4. **HORSE + SNAKE `VENOM`** — antivenom being produced in horses is veterinary trivia.
5. **MIRROR + ROSE `VANITY`** — a rose on the table the mirror stands on. Proximity, not meaning.
6. **HORSE + KEY `GATE`** — a true duplicate. STABLE and GATE are the same proverb, and their
   explanations differ by one word. The test "no duplicate clue text within a pair" passes because
   it compares text, not meaning.

---

## 7. The 25 strongest current clues

This is an editorial ranking, not a sort by score — many clues tie at 10/10. `*` = newly written.

| # | Pair | Clue | Why it works |
|---|---|---|---|
| 1 | BANK + IRON | **PIG*** | Pig iron and piggy bank: the best clue in the BANK block. |
| 2 | BANK + SALT | **DEPOSIT*** | Two literal deposits; excellent. |
| 3 | BRIDGE + KEY | **STONE*** | Keystone holds the arch; very satisfying. |
| 4 | BRIDGE + KEY | **SONG** | A song has a bridge and is in a key; excellent. |
| 5 | BRIDGE + ENGINE | **SHIP** | Bridge and engine room on the same vessel; excellent. |
| 6 | MIRROR + SPRING | **NARCISSUS** | Reflection in a spring, and narcissus is the spring flower; superb. |
| 7 | CROWN + LIGHT | **CORONA*** | Corona is literally crown and is also a ring of light; best kind of wordplay. |
| 8 | SALT + SHADOW | **DOUBT*** | Pinch of salt and shadow of a doubt; two idioms meeting on one word. |
| 9 | BRIDGE + SPRING | **SUSPENSION** | Suspension bridge and car suspension; the best kind of double. |
| 10 | ENGINE + HONEY | **DRONE*** | Drone bee and the drone of an engine; the best clue in the ENGINE block. |
| 11 | BANK + SHADOW | **SHADE** | Shady bank works in both directions at once; genuinely witty. |
| 12 | ENGINE + IRON | **STEAM** | Steam engine and steam iron; excellent. |
| 13 | CROWN + MOON | **DIANA*** | Roman moon goddess and the princess in the tiara; excellent double. |
| 14 | BRIDGE + HONEY | **POOH*** | Poohsticks and the honey pot; charming and fair. |
| 15 | DIAMOND + HORSE | **CARROT** | Carrot/carat homophone; a genuinely delightful stretch. |
| 16 | HEART + IRON | **CORE*** | Core is heart, and the earth core is iron; elegant. |
| 17 | BRIDGE + ROSE | **COMPASS*** | Compass rose read from the ship bridge; elegant. |
| 18 | HORSE + MIRROR | **GROOM** | Groom the horse, groom yourself; the best clue in the MIRROR block. |
| 19 | MIRROR + SNAKE | **MEDUSA** | Snakes for hair, killed by her own reflection. |
| 20 | MIRROR + SHADOW | **VAMPIRE** | No shadow, no reflection; one creature carrying both. |
| 21 | BRIDGE + GHOST | **CROSS OVER*** | Crossing over is exactly the euphemism; very good. |
| 22 | CROWN + HORSE | **TRIPLE** | Triple Crown; the single best fit in the CROWN block. |
| 23 | SHADOW + SPRING | **GROUNDHOG** | Sees its shadow, six more weeks of winter; both words in one custom. |
| 24 | ENGINE + HEART | **VALVE*** | Four in the heart, one per cylinder; exact and satisfying. |
| 25 | LIGHT + SPRING | **BULB** | Light bulb and a spring bulb; one word, two meanings. |

The common property of every clue on this list: one idea reaches both words, rather than two
separate facts being filed under one heading. That is the whole difference between a good clue and
a defensible one, and the set produces it often enough to prove the method can.

**12 of these 25 are newly written** — PIG, DEPOSIT, STONE, CORONA, DOUBT, DRONE, DIANA, POOH, CORE,
COMPASS, CROSS OVER and VALVE. That is the honest counterweight to section 2, and it is a large
one: nearly half the best clues in the set were written in the batch nobody checked. The new-clue
batch is not worse at its best; it is more variable, and it is the floor that needs attention.

---

## 8. Review of all 110 newly written clues

| | Count | Share |
|---|---|---|
| PASS | 81 | 73.6% |
| BORDERLINE | 27 | 24.5% |
| FAIL | 2 | 1.8% |

Against 86.6% for the 426 previously audited clues. Same author, same rubric, same week — the
only difference is that one batch was checked by someone else and the other was not.

**The 29 new clues I do not pass:**

| Pair | Clue | Verdict | Why |
|---|---|---|---|
| BANK + GHOST | **VAULT** | BORDERLINE | Burial vault is real but GHOST is one step past it; badly asymmetric. |
| BANK + GHOST | **ACCOUNT** | BORDERLINE | "Ghost account" is not a settled phrase; BANK side does all the work. |
| BANK + MIRROR | **CHECK** | BORDERLINE | Cheque/check spelling split, and checking in a mirror barely evokes MIRROR. |
| BANK + ROSE | **HEDGE** | BORDERLINE | Hedge fund is good; hedgerow rose is a gardener fact, not a player one. |
| BRIDGE + CROWN | **ARCH** | BORDERLINE | Crown-of-an-arch is architect vocabulary, not general knowledge. |
| BRIDGE + HORSE | **VIOLIN** | BORDERLINE | Needs to know the bow is horsehair; BRIDGE side is solid. |
| BRIDGE + MIRROR | **VENICE** | BORDERLINE | Venetian mirror glass is an art-history fact, not a player instinct. |
| BRIDGE + MOON | **CRESCENT** | BORDERLINE | Crescent bridge is the explanation invention; also restates ARCH. |
| CROWN + ENGINE | **WHEEL** | BORDERLINE | Crown wheel is drivetrain jargon; almost no player reaches CROWN from WHEEL. |
| CROWN + ENGINE | **PISTON** | FAIL | Piston crown is specialist mechanic vocabulary. Unfair and unrecognisable. |
| CROWN + HONEY | **MEAD** | BORDERLINE | Mead-to-honey is solid; mead-to-crown needs the mead-hall picture supplied. |
| CROWN + IRON | **FIST** | BORDERLINE | Iron fist is strong; the crowned despot is the explanation adding a monarch. |
| DIAMOND + FIRE | **VOLCANO** | BORDERLINE | Kimberlite pipes are geology trivia and volcano-to-fire is loose. |
| DIAMOND + GHOST | **FOREVER** | FAIL | A Diamond Is Forever is strong; the ghost half is a joke the explanation makes, not a connection. |
| DIAMOND + SPRING | **WEDDING** | BORDERLINE | Spring weddings is a soft generalisation; the diamond side is fine. |
| FIRE + MOON | **LANTERN** | BORDERLINE | Moon Festival lanterns is a real link but regionally specific. |
| GHOST + HONEY | **TOMB** | BORDERLINE | Honey in Egyptian tombs is trivia; the ghost side is only the tomb setting. |
| GHOST + ROSE | **WREATH** | BORDERLINE | A wreath reaches the dead, not a ghost; restates GRAVE. |
| HEART + SHADOW | **DOUBT** | BORDERLINE | Shadow of a doubt is strong; the heart half is asserted by the explanation. |
| HONEY + IRON | **TONIC** | BORDERLINE | Iron tonic is dated; the honey half is folk remedy, not language. |
| HONEY + KEY | **JAM** | BORDERLINE | Keys jam is good; honey next to jam on the table is proximity, not connection. |
| HONEY + MIRROR | **DRESSING** | BORDERLINE | Dressing table is strong; honey dressing is a salad the explanation had to find. |
| HONEY + SHADOW | **SPY** | BORDERLINE | Shadowing a target is exact for SHADOW; HONEY arrives only through honeytrap. Badly one-sided. |
| HONEY + SHADOW | **EYE** | BORDERLINE | Eyeshadow is strong; honey-coloured eyes is a colour reach the explanation supplies. |
| HONEY + SHADOW | **TREE** | BORDERLINE | Bee tree is a beekeeping term; the shade half is true of any tree. |
| IRON + ROSE | **MAIDEN** | BORDERLINE | Iron Maiden is strong; English-rose-as-maiden is the explanation forcing it. |
| KEY + SHADOW | **CABINET** | BORDERLINE | Shadow cabinet is UK politics; a cabinet key is a weak reach for KEY. |
| SALT + SHADOW | **SEASON** | BORDERLINE | Season food is exact; season-decides-shadow-length is the explanation teaching. |
| SALT + SNAKE | **LICK** | BORDERLINE | Salt lick is exact; snakes flick rather than lick, so the second half is off. |

**The recurring defect is asymmetry, and it has a signature.** In 21 of these 29, the clue is a
real term of art on one side and a modifier on the other: *shadowing* a target but a *honey*trap,
the *shadow* cabinet but a *cabinet* key, a *dressing* table but honey *dressing*, *eye*shadow but
honey-coloured eyes. The pattern is that a compound word is being mined for one of its halves. A
compound is a legitimate source of clues — PIG for pig iron and piggy bank is on the strongest
list — but it only works when *both* targets are reached that way. When one side gets the
compound and the other gets the plain everyday sense, the clue pulls hard in one direction.

**The best of the new clues are excellent** and should not be lost in this: DRONE, PIG, ROUGH,
STONE, ISLAND, CROSS OVER, POOH, CHESS, CORONA, DIANA, RATTLE, PIPE, ALICE, HOLY, WELL, SUGAR,
COMB, GROOM, DOUBT, CAST, HAND and CORE are all genuine finds. The problem is not the ceiling of
the new batch; it is the floor.

---

## 9. HONEY + SHADOW → SPY, reviewed specifically

| Clue | A (HONEY) | B (SHADOW) | Fair | Recog | Satisf | Exp-dep | Obsc | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **SPY** | 1 | 2 | 1 | 2 | 2 | −0 | −1 | 7/10 | BORDERLINE |
| **EYE** | 2 | 2 | 1 | 2 | 1 | −1 | −0 | 7/10 | BORDERLINE |
| **TREE** | 1 | 2 | 1 | 1 | 1 | −0 | −1 | 5/10 | BORDERLINE |

**Pair verdict: 0 PASS, 3 BORDERLINE. Below the minimum.** All three clues are new and none was
checked by anyone but its author.

### SPY in detail

- **SHADOW side: strong.** To shadow someone is a literal, everyday verb and the tradecraft term.
  SPY reaches SHADOW immediately and directly.
- **HONEY side: weak.** SPY reaches HONEY only through *honeytrap*, a compound in which honey is a
  modifier. Nothing in the word SPY evokes honey on its own.
- **The asymmetry is the defect.** On a 20-word board, SPY pulls a player toward SHADOW and toward
  any other covert-sounding word long before it pulls them toward HONEY. A clue that reliably
  finds one of its two targets and not the other is not doing the job the game asks of it.
- **The explanation uses a form of the target word.** It justifies the clue with "shadowing a
  target" — the target word itself, in verb form. A clue cannot be validated by the word it is
  supposed to point at. This is a specific pattern worth grepping the whole dataset for.
- **It is not obscure and it is not padding.** Espionage is one genuine shared field and both words
  are technical in it. The reveal is satisfying. That is why it is BORDERLINE and not FAIL.

The previous review called the earlier "nothing genuinely connects them" judgement "wrong, or at
least premature". I think the earlier judgement was closer to right. Three clues were found, and
all three are one-sided in the same way: EYE is eyeshadow against a soft colour word, TREE is a
beekeeping term against shade that any tree throws.

**Recommendation: do not ship this pair on these three.** Restoration does not help — DARK, SUN and
GOLD were all correctly cut. HONEY + SHADOW needs new writing, and it remains the clearest single
piece of evidence that the generation method has not yet solved its hardest cases.

---

## 10. Repeat-clue analysis, kept separate from semantic quality

**No clue in this review was downgraded for appearing in another pair, and no restoration was
refused on that ground.** This section is a board-generation concern only.

| | |
|---|---|
| Distinct clue texts | 364 |
| Clue records | 536 |
| Texts used once | 254 |
| Texts used twice | 69 |
| Texts used three times | 20 |
| Texts used four times | 21 |
| Texts used five or more times | **0** |

Before the repair the distribution ran to eleven uses (GOLD). The hard stop at four is not an
accident of writing; a ceiling was enforced.

**The finding that matters: the ceiling was enforced by deleting, not by rewriting.** 71 passing
clues were cut to hold it, and on my reading 23 of them should come back. Two pairs — BANK +
MIRROR and BRIDGE + MIRROR — were pushed below the quality minimum by a repetition rule. That is
the wrong trade: a repeated clue is a board-generation problem that a generator can route around,
while a thin pair is a permanent quality problem that it cannot.

### The 21 texts used in four pairs

| Clue | Pairs |
|---|---|
| **ARCH** | BRIDGE + CROWN · BRIDGE + MOON · BRIDGE + ROSE · BRIDGE + SHADOW |
| **BEE** | FIRE + HONEY · HONEY + KEY · HONEY + ROSE · HONEY + SPRING |
| **BURN** | BRIDGE + FIRE · ENGINE + FIRE · FIRE + HEART · FIRE + MIRROR |
| **CARD** | BRIDGE + DIAMOND · BRIDGE + HEART · CROWN + HEART · DIAMOND + HEART |
| **CAST** | ENGINE + IRON · ENGINE + SHADOW · IRON + LIGHT · LIGHT + SHADOW |
| **COIL** | ENGINE + SNAKE · ENGINE + SPRING · IRON + SPRING · SNAKE + SPRING |
| **CRYSTAL** | DIAMOND + HONEY · DIAMOND + SALT · LIGHT + SALT · MIRROR + SALT |
| **CUT** | DIAMOND + IRON · DIAMOND + KEY · DIAMOND + LIGHT · DIAMOND + ROSE |
| **GARDEN** | IRON + ROSE · KEY + ROSE · ROSE + SNAKE · ROSE + SPRING |
| **LOCK** | BANK + KEY · CROWN + KEY · IRON + KEY · KEY + SPRING |
| **LOVE** | DIAMOND + ROSE · HEART + HONEY · HEART + MOON · HEART + ROSE |
| **NIGHT** | BANK + MOON · FIRE + MOON · GHOST + MOON · LIGHT + MOON |
| **RED** | DIAMOND + HEART · ENGINE + FIRE · FIRE + ROSE · HEART + ROSE |
| **RING** | CROWN + FIRE · DIAMOND + HEART · DIAMOND + MOON · FIRE + MOON |
| **RIVER** | BANK + BRIDGE · BANK + MOON · BANK + SNAKE · BRIDGE + SNAKE |
| **RUST** | BRIDGE + IRON · BRIDGE + SALT · ENGINE + SALT · IRON + SALT |
| **SAFE** | BANK + DIAMOND · BANK + FIRE · BANK + IRON · DIAMOND + KEY |
| **SEA** | ENGINE + SALT · IRON + SALT · MOON + SALT · SALT + SNAKE |
| **SWEET** | ENGINE + HONEY · HEART + HONEY · HONEY + ROSE · HONEY + SALT |
| **TRAIN** | BRIDGE + ENGINE · CROWN + ENGINE · ENGINE + GHOST · HORSE + IRON |
| **WATER** | BANK + SPRING · BRIDGE + SPRING · ROSE + SALT · SALT + SPRING |

These cluster on hub words: RIVER and SAFE on BANK, ARCH on BRIDGE, CUT on DIAMOND, BEE on HONEY,
COIL on SPRING. That is structural, not careless — a hub word is hub-like because it is the
obvious route into its target.

### Scaling implication

At 190 pairs, a text used four times creates a manageable number of board conflicts. At 50 words
there are 1,225 pairs — 6.4 times as many — and the same hub words will collide far harder. Two
things follow, and they point in opposite directions:

1. The ceiling should be decided *before* generation and enforced by writing an alternative, never
   by deletion. Deleting after the fact is what produced the thin pairs in this set.
2. The ceiling should probably *not* drop below four on quality grounds alone. Board generation
   only needs to avoid putting two conflicting pairs on the same board, which is a selection
   constraint. Solve it in the generator, not in the corpus.

---

## 11. Disagreements with the previous audit

426 clues can be compared. The other 110 have no previous verdict.

| | Count |
|---|---|
| Agree — both pass | 368 |
| Agree — neither passes | 1 |
| **Agreement rate** | **86.6%** |
| I reject what they passed | 56 |
| I pass what they rejected | 1 |

**We broadly agree.** On the clues both of us scored, we reach the same verdict five times out of
six, and we agree almost exactly on what is bad: the colour purge, the two board-word bugs
(DIAMOND + SHADOW `LIGHT`, ENGINE + HORSE `IRON`), MOTOR as a synonym giveaway, and the
explanation-does-the-work pattern. The earlier audit is careful work and its self-criticism is
unusually honest.

### Clues they passed that I reject (56)

Four are hard failures for me:

- **GHOST + SPRING `JACK`** (their total 6/10) — Spring-heeled Jack is Victorian obscurity; JACK evokes no ghost for a modern player.
- **HORSE + KEY `GATE`** (their total 9/10) — Identical proverb to STABLE, with the same explanation text. True within-pair duplicate.
- **HORSE + SNAKE `VENOM`** (their total 6/10) — Antivenom produced in horses is veterinary trivia; no player reaches HORSE from VENOM.
- **MIRROR + ROSE `VANITY`** (their total 6/10) — A rose on the vanity table is the explanation placing a prop; no real connection.

The rest I mark BORDERLINE rather than FAIL. Grouped by what is wrong with them:

- **One-sided — the clue reaches one target hard and the other by a step the explanation takes** — BRIDGE + SHADOW `TROLL`, BRIDGE + SNAKE `CABLE`, KEY + SNAKE `CHARM`, CROWN + KEY `LOCK`, GHOST + SNAKE `SHED`, SNAKE + SPRING `SHED`, SHADOW + SNAKE `GRASS`, KEY + SHADOW `DOOR`, ROSE + SALT `WATER`, ENGINE + SALT `SEA`, FIRE + HONEY `BEE`, LIGHT + SNAKE `SCALE`, ENGINE + ROSE `STEAM`, GHOST + SALT `SPILL`, DIAMOND + MIRROR `SCRATCH`, DIAMOND + HONEY `CLARITY`, BANK + GHOST `TOWN`, FIRE + KEY `ESCAPE`, BANK + ENGINE `DRIVE`.
- **Generic container — "both of these are found on a car / at night"** — ENGINE + LIGHT `CAR`, ENGINE + MIRROR `CAR`, KEY + MIRROR `CAR`, FIRE + MOON `NIGHT`, GHOST + MOON `NIGHT`, BANK + HONEY `STORE`.
- **Near-definitional — the clue half-defines one of its own targets** — GHOST + HEART `HAUNT`, GHOST + MOON `HAUNT`.
- **Within-pair duplicate — the same idea already covered by a stronger clue** — KEY + MOON `SONATA`, BRIDGE + SHADOW `ARCH`, SHADOW + SPRING `LENGTH`, CROWN + DIAMOND `SPARKLE`.
- **Specialist knowledge** — BRIDGE + ENGINE `RIVET`, KEY + LIGHT `PHOTO`, ENGINE + GHOST `ROLLS`, ENGINE + HONEY `SWEET`, MIRROR + SHADOW `SELF`, DIAMOND + LIGHT `CUT`, BANK + SALT `SALARY`, HONEY + MOON `MONTH`.
- **Abstract or mood-level on both sides** — HEART + SHADOW `SECRET`, MOON + SNAKE `CYCLE`, ROSE + SHADOW `DUSK`, BANK + HEART `TRUST`, BRIDGE + MIRROR `DOUBLE`, BRIDGE + SPRING `BOUNCE`, ENGINE + SPRING `CLOCK`.
- **Colour or material padding that survived the purge** — CROWN + FIRE `GOLD`, CROWN + MIRROR `GOLD`.
- **The explanation invents the resemblance rather than reporting one** — CROWN + MIRROR `VANITY`, CROWN + SNAKE `HOOD`, DIAMOND + MOON `SKY`.
- **The clue word itself is too colourless to point anywhere** — BRIDGE + SHADOW `UNDER`.

### Clues they rejected that I would restore

Two kinds. First, the one *current* clue I pass and they failed:

- **BANK + ENGINE `TURN`** — they scored it 5/10 and failed it on
  the original explanation ("the engine drives the turn"). The explanation was then rewritten and
  the clue kept. I agree with the rescue: the clue word was always fine.

Second, removed clues I would bring back. 5 of my 13 firm restorations are clues the previous
audit *failed* outright, not merely trimmed for repetition:

- **BANK + GHOST `VANISH`** — A ghost vanishes and money vanishes from an account; both sides are real and the pair badly needs a third that is not asymmetric.
- **BANK + LIGHT `SWITCH`** — "A bank of switches" is a genuine fourth sense of BANK and switches turn on lights. Distinct from the other three clues.
- **BRIDGE + CROWN `LONDON`** — London Bridge plus the crown jewels a few hundred yards away. Adds a non-dental idea to a pair that is otherwise entirely dentistry.
- **BRIDGE + HONEY `NIAGARA`** — Honeymoon capital and the crossing there was literally named the Honeymoon Bridge. Both words present in one place name.
- **CROWN + ENGINE `POWER`** — Political power and mechanical power. Abstract but genuinely bidirectional, and it is the only fair, recognisable clue this pair can have. All three retained clues are drivetrain jargon.

### Systematic bias in the previous review

1. Self-approval on the new clues. The previous review states the risk plainly in its own caveat and then reports 100% passing anyway. Measured against an independent pass, the 110 self-approved clues run 13.0 points below the clues that had been independently scored.
2. A binary threshold hides the weak middle. A total of 6 out of 10 was recorded as a pass with no further mark, so a one-sided clue and an excellent one both appear as "pass" in the headline figure. 50 of my 56 disagreements are clues scoring 6-8 there.
3. The mechanical rubric is under-weighted on asymmetry. The rule requires each connection to be >= 1, which lets a 2/1 clue through at full credit. Asymmetry is the most common real defect in this set and the rubric does not price it.
4. Repetition was treated as a quality defect rather than a board-generation constraint, which cost 71 clues, several of them good.

### Systematic bias in this review

Stated so it can be discounted appropriately:

1. I am stricter on lateral and specialist clues than the previous reviewer, which will read as harsh on pairs like CROWN + ENGINE where nothing better may exist.
2. I score three ways rather than two, so my BORDERLINE count is not comparable to a failure count and should not be read as one.
3. I did not playtest. Fairness and recognizability are my estimate of a general audience, and a real audience may find some clues I marked obscure perfectly ordinary, or the reverse.
4. I applied a UK/US knowledge split as a recognizability penalty in several places (STREET, CABINET, WING, SOVEREIGN). If the audience is primarily British those penalties are too harsh.

---

## 12. Verdict

# READY AFTER SMALL REPAIR

Small in volume, not small in significance. Roughly 25 to 30 new clues across 18 pairs, plus 13
restorations that are already written, plus one process change. The generation method does not
need revision; the *approval* method does.

**Why not "not ready".** 450 of 536 clues pass independently. 171 of 190 pairs already clear the
two-good-clue bar. The top of the set — PIG, DEPOSIT, STONE, NARCISSUS, CORONA, DOUBT, SHIP,
DRONE — is work a commercial word game would ship without apology. A method that produces those
is not broken.

**Why not "ready".** Eighteen pairs cannot reach two dependable clues without new writing, and six
clues should not ship at all. More importantly, the one number this pilot was run to discover —
can this method judge its own output? — came back negative: 73.6% against 86.6%.

### Before a 50-word playable test

1. Write new clues for the 18 pairs that cannot reach two independently passing clues by restoration. HONEY + SHADOW, CROWN + ENGINE, HEART + SHADOW, BRIDGE + SHADOW and BRIDGE + MIRROR are the hardest and should be written first.
2. Apply the 13 recommended restorations; they are free quality, already written, and every one keeps its pair at or under five clues.
3. Fix the five outright failures: CROWN+ENGINE PISTON, DIAMOND+GHOST FOREVER, GHOST+SPRING JACK, HORSE+SNAKE VENOM, MIRROR+ROSE VANITY. HORSE+KEY GATE is a sixth - it duplicates STABLE with the same proverb and very nearly the same explanation text.
4. Separate authoring from approval permanently. The measured 13-point gap between self-approved and independently-scored clues is the strongest evidence this pilot produced.
5. Decide the repeat ceiling before generating, not after, and enforce it by rewriting rather than deleting.

### Not yet

Generating the 100-word dataset. The previous review reaches the same conclusion and is right to.
Scaling a corpus whose self-assessment is known to run 13 points optimistic would multiply the
error by 6.4 and make it much harder to find.

---

## Repository health

Run read-only, to confirm nothing is broken. Nothing was modified in response.

| Check | Result |
|---|---|
| `node scripts/unlimited/validate-pilot.mjs` | PASS — no structural errors |
| `node --test scripts/unlimited/pilot.test.mjs` | 25/25 pass |
| `npx eslint .` | 35 problems (28 errors, 7 warnings) |
| `git status` | clean apart from the untracked `data/` and `scripts/` directories |

Every eslint problem is in `src/App.jsx` and every one is pre-existing — React hooks rules such as
`react-hooks/set-state-in-effect`. None is in the pilot data or scripts, and none was introduced
or touched by this review. Reported, not fixed, per the brief.

One gap worth noting in the test suite: **`no duplicate clue text within a pair` compares text,
not meaning.** HORSE + KEY `STABLE` and `GATE` are the same proverb with explanations that differ
by a single word, and the test passes. A near-duplicate-explanation check would have caught it.

---

*Full per-clue scoring for all 536 current clues, all 150 removed clues and all 190 pairs is in
`pilot-independent-review.json`.*
