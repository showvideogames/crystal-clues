# Cluevoyance Unlimited — semantic quality audit and repair of the 20-word pilot

This document reports a hand audit of every clue in the 20-word pilot, and the repair that
followed. Nothing was deployed, Supabase was not touched, the game was not changed.

The audit is **editorial judgement**, recorded clue by clue in
`pilot-clue-quality-audit.json`. The validator and the test suite check structure only. They
cannot and do not show that a clue is good. Wherever this document says a clue is strong or
weak, that is a person's opinion with reasons attached, not a measurement.

**Clue format changed.** The previous set assumed one uppercase word of 4–5 letters. Clues may
now be one word or a familiar two-word phrase, up to 18 characters including the space. The
schema, the validator and the tests were updated to match. Two clues in the new set use the
allowance: `CROSS OVER` and `OTHER SIDE`, both for BRIDGE + GHOST.

> **Superseded in part.** An independent reviewer later rescored every clue in this set and
> disagreed with this audit on 56 of the 426 clues both had seen, on the repeat-clue policy, and
> on 23 of the removals. That review is `pilot-independent-review.md`; the repair that acted on
> it is `pilot-small-repair-plan.md` and section 11 below. This document is kept unchanged above
> that section as the record of what the first audit concluded.

---

## 1. Before and after, in numbers

| | Before | After |
|---|---|---|
| Pairs | 190 | 190 |
| Clue records | 576 | 536 |
| Clues passing the rubric | 495 (85.9%) | 536 (100% by construction — see the caveat below) |
| Clues failing the rubric | 81 | 0 |
| Pairs with fewer than 2 passing clues | 15 | 0 |
| Pairs with **zero** passing clues | 4 | 0 |
| Average clues per pair | 3.03 | 2.82 |

The four pairs that had nothing usable at all were CROWN + ENGINE, DIAMOND + SHADOW,
HONEY + MIRROR and HONEY + SHADOW.

**The caveat on "100%".** 424 of the 536 surviving clues were read and scored in the audit and
passed; 2 more failed only on their explanation and were rewritten rather than replaced (see
section 2). The other 110 were written afterwards, by the same judgement, against the same rubric.
They have not been through a second, independent pass. That is a real limitation: the person who
wrote them also approved them. A genuinely independent check is the obvious next step, and it is
the reason the recommendation in section 10 is qualified.

Why the total fell while every pair improved: 71 clues were cut even though they passed, because
they were the fourth or fifth appearance of the same clue word, or because they said the same
thing as a stronger clue in the same pair.

### Failure breakdown of the 81 rejected clues

| Reason | Count |
|---|---|
| Generic padding — a colour, tone or mood word applied separately to each word | 42 |
| One-sided or simply too thin overall | 23 |
| The explanation did most of the creative work | 8 |
| Too obscure for any player to reach | 8 |

---

## 2. Clues retained, rejected, rewritten and added

| Outcome | Count |
|---|---|
| Retained exactly as written | 409 |
| Retained with a rewritten explanation | 17 |
| — of which the clue itself had **failed** and the rewrite rescued it | 2 |
| Newly written | 110 |
| Rejected outright | 150 |
| — because they failed the rubric | 79 |
| — because they passed but were over-used or duplicated another clue in the same pair | 71 |

The two rescues were BANK + ENGINE `TURN` and ENGINE + SHADOW `BLOCK`. In both cases the clue
word was fine and the original explanation had reached for the wrong meaning. `TURN` was being
justified as "the engine drives the turn", when the real link is that an engine *turns over*.
`BLOCK` was justified as "a block of shadow", which is not a phrase, when a shadow is precisely
what appears when something *blocks* the light.

---

## 3. Final clue-count distribution

| Clues in the pair | Pairs |
|---|---|
| 2 | 37 |
| 3 | 150 |
| 4 | 3 |
| 5 | 0 |

Every pair meets the two-clue minimum. 153 of 190 pairs (81%) carry three or more. No pair was
padded to three: where only two clues survive, a third would have meant inventing one, and the
brief is explicit that three to five is only worth having when the extra clues are genuinely good.

The four-clue pairs are FIRE + IRON, FIRE + LIGHT and LIGHT + SHADOW — the three pairs where four
separate clues all earned their place.

Clue load per word, across each word's 19 pairs: FIRE 58, LIGHT 57, CROWN 56, down to MIRROR 51,
SHADOW 49 and MOON 49. The spread is narrow, which is the point: the hard words are no longer
being carried by padding.

---

## 4. The 20 weakest remaining pairs

Ranked most fragile first. Every one of these meets the minimum, and none of them is padded — but
these are the places where the connections are laterally reached and a player may well need the
reveal before the clue lands.

| # | Pair | Final clues | Honest reasoning |
|---|---|---|---|
| 1 | HONEY + SHADOW | SPY, EYE, TREE | SPY is a real single field — a honeytrap and shadowing a target are both tradecraft — but the player has to find espionage first. EYE leans on eyeshadow being definitional while honey-as-an-eye-colour is soft. TREE is the weakest: a bee tree is real but not common knowledge. |
| 2 | DIAMOND + SHADOW | WINDOW, ECLIPSE | Only two clues, and both are observational rather than idiomatic. Diamond-paned windows throwing diamond shadows is true and visual; the diamond ring effect at an eclipse is real but belongs to people who have watched one. |
| 3 | ENGINE + SHADOW | BLOCK, CAST | Two clues, both built on the same trick — an engine block is *cast*, and a shadow is *cast* when something *blocks* the light. They work, but they are two halves of one idea. |
| 4 | CROWN + ENGINE | WHEEL, TRAIN, PISTON | The hardest pair in the set and still the least satisfying. The crown wheel and the piston crown are both genuine engineering terms, and both are mechanic-level knowledge. The Royal Train is the only clue an ordinary player will reach. |
| 5 | GHOST + HONEY | TRAP, TOMB | TRAP is strong and fair. TOMB rests on one fact — honey found sealed in Egyptian tombs — which is well circulated but is still a single piece of trivia carrying the whole clue. |
| 6 | HONEY + MIRROR | COMB, DRESSING | Both are pure wordplay: honeycomb against a hair comb, honey dressing against a dressing table. Neither is a connection of meaning, and a player who does not spot the pun gets nothing. |
| 7 | BANK + SHADOW | SHADE, CLOUD | SHADE is close to a synonym for SHADOW, so half the puzzle comes free, though the shady-bank double meaning redeems it. A cloud bank is real but not top-of-mind. |
| 8 | HONEY + LIGHT | AMBER, CANDLE | Both are sound. The problem is thinness: after the amber traffic light and the beeswax candle there is genuinely nothing else here that is not colour padding. |
| 9 | KEY + SHADOW | DOOR, CABINET | The shadow under a door is a real and specific image but the key half is ordinary. CABINET is good wordplay and noticeably British. |
| 10 | IRON + SHADOW | CURTAIN, BAR | CURTAIN is excellent. BAR is geometry — iron bars throw striped shadows, as any solid object would. Nothing else survived. |
| 11 | HEART + SHADOW | SECRET, DOUBT | Both work through the figurative sense of shadow (shadowy meaning hidden, a shadow of a doubt). Neither touches the heart as an organ, so the pair is entirely abstract. |
| 12 | MOON + ROSE | RISE, FADE | RISE is clean wordplay on rose as the past tense of rise. FADE is honest but plain. Every other route into this pair turned out to be colour. |
| 13 | KEY + SNAKE | FLUTE, CHARM | FLUTE is good. CHARM is lopsided: the snake charmer is instant, a charm on a keyring is filler. |
| 14 | IRON + SNAKE | PIPE, ROD | PIPE is the find here — a plumber's snake goes down an iron pipe. ROD needs Aaron's rod, which not everyone has. |
| 15 | BANK + MIRROR | CHECK, SILVER | CHECK is a genuinely good pun. SILVER is defensible on both sides but is doing duty in three pairs. |
| 16 | BRIDGE + MIRROR | DOUBLE, VENICE | DOUBLE describes an arch completing itself in the water, which is lovely but needs to be seen. VENICE is two separate facts about one city. |
| 17 | KEY + MOON | PIANO, SONATA | Two clues pointing at the same reference, the Moonlight Sonata, by two routes. |
| 18 | MIRROR + ROSE | BEAUTY, VANITY | BEAUTY is strong (the enchanted rose and the magic mirror). VANITY is proximity — a rose on the table the mirror stands on. |
| 19 | HORSE + MOON | MARE, SHOE | MARE is the best thing in this pair by a distance. SHOE is a shape resemblance and nothing more. |
| 20 | ENGINE + MIRROR | CAR, WING, REAR | Three clues, all of which amount to "these are both car parts". Fair, unarguable, and dull. |

---

## 5. HONEY + SHADOW specifically

The previous report called this "the weakest pair in the set. Nothing genuinely connects them."
That judgement was wrong, or at least premature. Three options were found, and they are ranked
and labelled honestly:

1. **SPY** — *lateral*. A honeytrap and shadowing a target are both standard pieces of spycraft.
   This is a single shared field in which both words are technical terms, which is exactly what a
   good clue is made of. The reach is that the player has to arrive at espionage unprompted.
2. **EYE** — *wordplay*. Eyeshadow is definitional for one word; honey is a standard descriptor
   for that colour of eyes and hair. Fair, if the honey half is the softer one.
3. **TREE** — *lateral*. Wild honey comes out of a hollow bee tree, and a tree is the thing that
   throws shade. Ranked last because the bee tree is the least common knowledge of the three.

What was thrown out: DARK (dark honey against a dark patch — nothing joins them), SUN (two
separate facts about the sun) and GOLD dressed up as contrast.

---

## 6. 20 strong representative pairs

| Pair | Clues |
|---|---|
| LIGHT + SHADOW | CAST, DARK, PUPPET, SUN |
| FIRE + LIGHT | MATCH, CANDLE, TORCH, SPARK |
| FIRE + IRON | FORGE, HOT, SMITH, BRAND |
| LIGHT + SPRING | BULB, DAY, CLOCK |
| HORSE + IRON | SHOE, SMITH, TRAIN |
| BANK + HORSE | STABLE, CHARGE, BET |
| BRIDGE + CROWN | DENTIST, TOOTH, ARCH |
| MOON + SPRING | TIDE, EASTER, RABBIT |
| SHADOW + SPRING | GROUNDHOG, SUN, LENGTH |
| GHOST + HORSE | HEADLESS, PALE, RIDER |
| CROWN + SNAKE | COBRA, EGYPT, HOOD |
| CROWN + GHOST | HAMLET, KING, CASTLE |
| HEART + SALT | TEARS, PRESSURE, EARTH |
| BANK + HEART | BLOOD, STEAL, TRUST |
| DIAMOND + SNAKE | BACK, PATTERN, SCALE |
| ENGINE + KEY | IGNITION, TURN, START |
| MIRROR + SALT | LUCK, SHOULDER, CRYSTAL |
| SNAKE + SPRING | COIL, WAKE, SHED |
| BRIDGE + ENGINE | SHIP, TRAIN, RIVET |
| HORSE + SALT | LICK, SWEAT |

The best single clue in the set is probably LIGHT + SPRING `BULB`: a light bulb and a spring bulb
are the same word doing two completely different jobs, and both are instant. LIGHT + MOON
`REFLECT` is the most educational — the moon makes no light of its own.

### Pairs that were rescued outright

| Pair | Was | Now |
|---|---|---|
| HONEY + MIRROR | SMOOTH, GOLD, BEAUTY — all three failed | COMB, DRESSING |
| CROWN + ENGINE | POWER, TRAIN, GEAR — all three failed | WHEEL, TRAIN, PISTON |
| DIAMOND + SHADOW | BLACK, FLAW, LIGHT — all three failed | WINDOW, ECLIPSE |
| HONEY + SHADOW | DARK, SUN, GOLD — all three failed | SPY, EYE, TREE |
| ENGINE + HONEY | SWEET, THICK, OIL | DRONE, HUM, SWEET |
| DIAMOND + HONEY | RING, CLARITY, CUT | CRYSTAL, RAW, CLARITY |
| BRIDGE + HONEY | GOLDEN, NIAGARA, COMB | POOH, TOOTH, GOLDEN |
| GHOST + HONEY | BEE, TRAP, JAR | TRAP, TOMB |
| BANK + GHOST | VANISH, EMPTY, TOWN | VAULT, ACCOUNT, TOWN |

ENGINE + HONEY was called in the previous report "no shared field at all. Rescued only by SWEET
as mechanics' slang". In fact a **drone** is both the male bee and the sound an engine makes, and
both bees and engines **hum**. Neither needed a stretch.

---

## 7. Two disqualifying bugs found

Two clues were the same word as a word on the board: DIAMOND + SHADOW used `LIGHT`, and
ENGINE + HORSE used `IRON`. The iron horse is a lovely connection, but a board word used as a
clue points at itself and is unplayable. Both are gone, and the validator and the test suite now
fail on any clue that matches one of the twenty pilot words.

---

## 8. Where the explanation was doing too much work

Eight clues were rejected on this ground. The pattern is always the same: the clue word points
hard at one target, and the explanation supplies a small essay to reach the other.

| Pair | Clue | The explanation that was doing the work |
|---|---|---|
| BANK + HONEY | HIVE | "A hive is where bees **bank** the honey" — circular; it only connects by using the target word itself as its verb. |
| BANK + SHADOW | DARK | "dark money is what moves through the shadow banking system" — two pieces of finance jargon the player has to be taught. |
| BRIDGE + CROWN | LONDON | "the crown jewels sit a few hundred yards away" — that is proximity in a city, not meaning. |
| BRIDGE + HONEY | NIAGARA | Depends on a specific bridge demolished in 1938. |
| BRIDGE + HONEY | COMB | "honeycomb panels are used as decking in real bridges because the shape is so strong" — an engineering footnote. |
| BRIDGE + MOON | REFLECT | "A Japanese moon bridge is arched so steeply that its reflection completes a full circle" — the entire idea is constructed by the explanation. |
| CROWN + IRON | KING | KING reaches CROWN instantly and IRON not at all, without the Iron Crown of Lombardy. |
| GHOST + HONEY | BEE | "Telling the bees" is a genuine and beautiful folk custom, and far outside general knowledge. |

---

## 9. Repeated-clue analysis

Repetition matters here in a way it would not in a crossword: in a 20-word board, a clue used in
five pairs points at five different answers at once.

- 364 distinct clue words across 536 records.
- 110 clue words appear in more than one pair, covering 282 records.
- Spread: 69 words appear twice, 20 appear three times, 21 appear four times. **Nothing appears
  five or more times.** The validator now warns above four.

Before and after, for the worst offenders:

| Clue | Pairs before | Pairs after |
|---|---|---|
| GOLD | 11 | 2 |
| REFLECT | 9 | 2 |
| RING | 8 | 4 |
| DARK | 8 | 3 |
| CUT | 7 | 4 |
| WHITE | 6 | 0 |
| PALE | 6 | 2 |
| GARDEN | 6 | 4 |
| CROSS | 6 | 3 |
| LOVE | 6 | 4 |

GOLD was the single clearest symptom: eleven pairs, five of them HONEY pairs where it meant
nothing but "this is a yellowish colour". It survives in two pairs only — CROWN + FIRE and
CROWN + MIRROR — where a gold crown is definitional on one side.

WHITE is gone entirely. Every use of it was "this thing is white and so is that one".

REFLECT was near-definitional for MIRROR, so half of each of those puzzles was free. It is kept
only in LIGHT + MIRROR and LIGHT + MOON, where the physics is the actual point.

### The 21 clue words used in four pairs

RIVER, SAFE, LOCK, NIGHT, WATER, ARCH, CARD, TRAIN, BURN, RUST, RING, RED, CRYSTAL, CUT, LOVE,
SWEET, CAST, SEA, COIL, BEE, GARDEN.

These are mostly hub words attached to a hub target — RIVER and SAFE belong to BANK, ARCH to
BRIDGE, CUT to DIAMOND, BEE to HONEY. Four is a defensible ceiling for a 20-word board and an
uncomfortable one for a 50-word board, where the same hub word would collide across far more
pairs. That is a live risk for the next stage, not a problem in this set.

---

## 10. Recommendation: is this ready for a 50-word playable test?

**Yes, with two conditions.**

The set is in a genuinely different condition from the one the previous report described. Every
pair has at least two clues that a person can defend out loud. The colour-padding problem, which
affected roughly one clue in eight, is gone. Two unplayable clues that duplicated board words have
been removed and are now caught automatically. Four pairs that had nothing usable now have real
options, including the one that was declared impossible.

The conditions:

1. **The 110 new clues need a second pair of eyes before the playable test, not after.** They were
   written and approved by the same judgement. That is the weakest link in this whole exercise, and
   no amount of validation will surface it. The CSV at `pilot-pair-clues-20.csv` has empty
   *Reviewer Notes* and *Approved* columns for exactly this; a reviewer working through the 110 new
   rows is perhaps two hours of work and worth more than anything else on this list.

2. **Decide the repeat ceiling before scaling, not during.** At 20 words a clue used four times is
   tolerable. At 50 words there are 1,225 pairs, and hub words like RIVER, CUT and BEE will collide
   far harder. Either the ceiling drops to two or three, or the generation process needs to track
   clue frequency as it writes rather than afterwards. This is the single thing most likely to make
   a 50-word set feel repetitive even though every individual clue is sound.

Two smaller notes. The average of 2.82 clues per pair is honest rather than generous — 37 pairs
carry the bare minimum, and if the game wants three clues everywhere then those 37 need more work,
not more padding. And a handful of clues lean British (CABINET for the shadow cabinet, high-street
banking behind STREET, GATE and STABLE for the stable-door proverb); if the audience is mostly
American, that is worth a pass of its own.

What should *not* happen next is generating the 100-word dataset. The 50-word playable test is the
right next step, and it should run on clues a second person has signed off.

---

## 11. The small repair, after the independent review

This section is written by the author of the clues, after acting on `pilot-independent-review.md`.
It records what changed. It is not a quality verdict: the author scoring the author's own work is
exactly the failure mode this pilot measured, and it measured it at 13.0 points of optimism.

### What changed, in numbers

| | Before | After |
|---|---|---|
| Pairs | 190 | 190 |
| Clues | 536 | 568 |
| Pairs on 2 clues | 37 | 21 |
| Pairs on 3 clues | 150 | 152 |
| Pairs on 4 clues | 3 | 15 |
| Pairs on 5 clues | 0 | 2 |
| Distinct clue texts | 364 | 374 |

Clues restored **19**, newly written **24**, removed **11**, explanations rewritten **5**.
Optional restorations offered **10**, accepted **6**, refused **4**.

### The six failures are gone

CROWN + ENGINE `PISTON`, DIAMOND + GHOST `FOREVER`, GHOST + SPRING `JACK`, HORSE + KEY `GATE`,
HORSE + SNAKE `VENOM` and MIRROR + ROSE `VANITY` were all removed. No pair fell below two clues
as a result.

### Five more clues were removed although they were only BORDERLINE

Removed because they were semantic duplicates of a stronger clue in the same pair, or because the
reviewer's own note was that nothing but mood connected them:

- KEY + MOON `SONATA` — the same Moonlight Sonata as `PIANO`. The pair effectively had one clue.
- HONEY + SHADOW `EYE` — the same eyeshadow route as the new `LID`, plus a colour reach.
- BRIDGE + SHADOW `ARCH` — the same under-the-bridge idea as `TROLL` and `UNDER`.
- FIRE + MOON `NIGHT` and GHOST + MOON `NIGHT` — scene-setting on both sides.

### Five restored clues needed their explanations rewritten first

The test `no clue the audit rejected survived unchanged` caught five restorations whose
explanations were byte-identical to text the first audit had failed. That is the test doing its
job: the independent reviewer restored them on the merit of the clue *word*, and the earlier
criticism was of the *explanation*. Each was rewritten to answer the criticism —
BANK + GHOST `VANISH`, BANK + LIGHT `SWITCH`, BRIDGE + CROWN `LONDON`, BRIDGE + HONEY `NIAGARA`
and CROWN + ENGINE `POWER`. `NIAGARA` now rests on the Rainbow Bridge, which still stands, rather
than the span demolished in 1938.

### The four optional restorations that were refused

| Pair | Clue | Why refused |
|---|---|---|
| FIRE + KEY | START | Semantically duplicates the retained `IGNITION`: both are the key that starts the engine. |
| LIGHT + MOON | SILVER | Duplicates the retained `PALE` — both say the moon and its light share one colour word. |
| MIRROR + MOON | REFLECT | Half-defines MIRROR, and the pair already carries three passing clues. |
| DIAMOND + HONEY | RING | The honey half is a pet-name hop, and the pair already clears the bar. |

Cross-pair repetition was **not** used as a reason to refuse anything, and no good clue was
deleted to hold a frequency ceiling. `WATER` now appears in seven pairs, `RIVER`, `RING` and
`COIL` in five. The validator warns about these and does not fail them, which is the right
treatment: it is a board-generation constraint, not a semantic defect.

### Where it still falls short

Four pairs finish without two clues the author would defend confidently:
**GHOST + HONEY**, **HONEY + SHADOW**, **KEY + SHADOW** and **ROSE + SHADOW**. In each case the
best available second clue scores 7 out of 10 on the reviewer's own rubric, which that review's
record shows is a coin flip rather than a pass. HONEY + SHADOW is the worst of them and finishes
with no clue above 7. The reviewer's judgement that this pair defeats the method still stands.
