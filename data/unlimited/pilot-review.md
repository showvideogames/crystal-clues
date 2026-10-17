# Cluevoyance Unlimited — 20-word clue pilot, review notes

190 pairs, 568 clues, written by hand for this pilot. Nothing here is deployed and nothing
touched Supabase. The point of this document is to let a human judge quality *before* we
scale to 100 words, so the weak results are called out rather than buried.

**These notes were regenerated after the semantic quality audit.** Every clue was scored by
hand against an explicit rubric, 81 clues failed it, 150 were dropped in total and 110 new ones
were written. The full audit is in `pilot-clue-quality-audit.json` and the report on it is
`pilot-quality-review.md`. Read that one for the detail; this file is the overview.

**Updated again after the independent review and the small repair.** An independent reviewer
scored all 536 clues, found 19 pairs below the two-good-clue minimum and six clues that should
not ship, and wrote `pilot-independent-review.md`. The small repair that followed restored 19
previously removed clues, wrote 24 new ones, removed 11 and took the set to 568 clues. 186 of the
190 pairs now clear the bar; four do not. Plan: `pilot-small-repair-plan.md`. Author self-check:
`pilot-small-repair-author-check.json`. Edge cases queued for a person to judge:
`pilot-human-review.md`.

**Clue format:** the game does not enforce a length anywhere in code — `EditableClueTab` only
trims and uppercases. Clues here are one uppercase word, or a familiar two-word phrase, up to 18
characters including the space. Two clues use the two-word allowance (`CROSS OVER` and
`OTHER SIDE`, both for BRIDGE + GHOST). A clue is never one of the twenty pilot words: a board
word used as a clue points at itself and is unplayable. The validator and the tests enforce all of this.

---

## The 20 selected words

| Word | Why it is in the set |
|---|---|
| FIRE | Elemental, huge compound and idiom surface |
| MOON | Celestial, heavy cultural loading |
| BANK | True homonym: money / river / to tilt |
| SPRING | Triple meaning: season / coil / water source |
| LIGHT | Homonym across illumination and weight; noun, verb and adjective |
| HEART | Anatomy, emotion and a card suit |
| IRON | Metal, appliance, golf club, verb |
| CROWN | Royalty, dentistry, top of the head |
| HORSE | Animal, gym apparatus, idiom-rich |
| SHADOW | Abstract, few compounds — included on purpose as a hard one |
| KEY | Object, musical key, map legend, island |
| SALT | Mineral, preservative, idiom-rich |
| ROSE | Flower, colour, name, past tense of rise |
| DIAMOND | Gem, card suit, baseball infield, shape |
| GHOST | Supernatural noun, modern verb, ghostwriter |
| HONEY | Food, colour, term of endearment |
| SNAKE | Animal, verb, metaphor for a betrayer |
| BRIDGE | Structure, card game, dental work, part of a song |
| MIRROR | Narrow category — forces lateral work |
| ENGINE | Dry and technical — the hardest member, included deliberately |

No word was removed. A word is not dropped for being difficult, and the three deliberately hard
members — SHADOW, ENGINE, MIRROR — all carry 19 workable pairs.

---

## 10 easiest pairs

These wrote themselves, and several had more good clues available than the five-clue ceiling allows.

| Pair | Clues |
|---|---|
| LIGHT + SHADOW | CAST, DARK, PUPPET, SUN |
| FIRE + LIGHT | MATCH, CANDLE, TORCH, SPARK |
| FIRE + IRON | FORGE, HOT, SMITH, BRAND |
| LIGHT + SPRING | BULB, DAY, CLOCK |
| HORSE + IRON | SHOE, SMITH, TRAIN |
| BRIDGE + CROWN | DENTIST, TOOTH, ARCH |
| ENGINE + KEY | IGNITION, TURN, START |
| HEART + ROSE | VALENTINE, LOVE, RED |
| MOON + SPRING | TIDE, EASTER, RABBIT |
| GHOST + HORSE | HEADLESS, PALE, RIDER |

## 10 most difficult pairs

Every one of these meets the two-clue minimum, but the connections are laterally reached. The
full ranked list of twenty is in `pilot-quality-review.md`.

| Pair | Clues | The problem |
|---|---|---|
| HONEY + SHADOW | SPY, EYE, TREE | Nothing here is idiomatic. SPY works because espionage uses both words technically, but the player has to find espionage first. |
| DIAMOND + SHADOW | WINDOW, ECLIPSE | Two clues, both observational rather than everyday. |
| ENGINE + SHADOW | BLOCK, CAST | Two clues built on one idea: casting and blocking. |
| CROWN + ENGINE | WHEEL, TRAIN, PISTON | The hardest pair in the set. Two of the three clues are mechanic-level vocabulary. |
| GHOST + HONEY | TRAP, TOMB | TRAP is strong; TOMB rests entirely on one piece of trivia. |
| HONEY + MIRROR | COMB, DRESSING | Pure wordplay both times. Miss the pun and you get nothing. |
| BANK + SHADOW | SHADE, CLOUD | SHADE nearly gives one word away; a cloud bank is not top-of-mind. |
| HONEY + LIGHT | AMBER, CANDLE | Both sound, but there is genuinely nothing else here that is not colour. |
| IRON + SHADOW | CURTAIN, BAR | CURTAIN is excellent; BAR is geometry. |
| KEY + MOON | PIANO, SONATA | Two routes to the same reference. |

HONEY, SHADOW and ENGINE still dominate this list, which is the result the pilot was designed to
produce. The previous version of this document called HONEY + SHADOW impossible. It is not — it
is lateral, and it is now labelled as such rather than padded with colour words.

---

## 20 representative pair records

A deliberate spread — strong, average and difficult.

**LIGHT + SHADOW** — CAST · DARK · PUPPET *(shadow puppets)* · SUN

**FIRE + LIGHT** — MATCH · CANDLE · TORCH · SPARK

**LIGHT + SPRING** — BULB *(a light bulb and a spring bulb; the best pure wordplay in the set)* · DAY · CLOCK *(the clocks spring forward for an extra hour of light)*

**LIGHT + MOON** — REFLECT *(the moon makes no light of its own)* · NIGHT · PALE

**BANK + HORSE** — STABLE *(a stable holds horses; a bank should be financially stable)* · CHARGE · BET

**BANK + GHOST** — VAULT *(a bank vault and a burial vault)* · ACCOUNT · TOWN

**BANK + HEART** — BLOOD *(blood bank)* · STEAL *(rob a bank; steal a heart)* · TRUST

**BRIDGE + GHOST** — TOLL *(a toll bridge; a tolling bell)* · CROSS OVER · OTHER SIDE

**BRIDGE + HORSE** — NOSE *(the bridge of the nose; winning by a nose)* · VIOLIN *(a violin's bridge; a bow of horsehair)* · WOODEN

**CROWN + SNAKE** — COBRA *(the uraeus on the pharaoh's crown)* · EGYPT · HOOD

**CROWN + SALT** — GANDHI *(the Salt March was against the Crown's salt monopoly)* · NAVY · TAX

**HEART + IRON** — BLOOD · PUMP *(the heart is a pump; pumping iron)* · CORE

**HEART + SALT** — TEARS · PRESSURE *(salt raises blood pressure)* · EARTH *(salt of the earth)*

**ENGINE + HONEY** — DRONE *(a male bee; the sound of an engine)* · HUM · SWEET

**GHOST + SPRING** — HOLY *(the Holy Ghost; a holy spring)* · WELL · JACK

**MIRROR + SALT** — LUCK *(the two great bad-luck superstitions)* · SHOULDER · CRYSTAL

**SHADOW + SPRING** — GROUNDHOG *(sees its shadow, six more weeks of winter)* · SUN · LENGTH

**SNAKE + SPRING** — COIL · WAKE *(snakes wake from hibernation)* · SHED

**HORSE + MOON** — MARE *(the moon's dark plains are maria; a mare is a female horse)* · SHOE

**CROWN + ENGINE** — WHEEL *(the crown wheel in a car's back axle)* · TRAIN · PISTON *(the top face of a piston is its crown)*

---

## Connection types in action

| Type | Count | Example | Pair |
|---|---|---|---|
| direct_association | 130 | SHOE | HORSE + IRON |
| wordplay | 98 | MARE *(a female horse; the moon's maria)* | HORSE + MOON |
| cultural_reference | 87 | MEDUSA *(snake hair, mirrored shield)* | MIRROR + SNAKE |
| lateral_connection | 69 | SPY *(honeytrap; shadowing a target)* | HONEY + SHADOW |
| cause_and_effect | 56 | RUST *(salt rusts iron)* | IRON + SALT |
| compound_or_phrase | 32 | BURN *(burn your bridges)* | BRIDGE + FIRE |
| shared_category | 24 | DENTIST | BRIDGE + CROWN |
| word_before_after | 20 | WILD *(wildfire, wild horse)* | FIRE + HORSE |
| title_or_name | 13 | TITANIC *(Rose; the engine room)* | ENGINE + ROSE |
| contrast | 6 | HEAVY | HEART + LIGHT |
| synonym_or_related | 1 | DARLING | HEART + HONEY |

`wordplay` overtook `lateral_connection` in the repair, which is the right direction: a pun on two
real senses of a word is fairer than a chain of associations.

---

## Patterns fixed in the repair

- **Colour and tone padding is gone.** GOLD fell from 11 pairs to 2, DARK from 8 to 3, PALE from
  6 to 2, WHITE from 6 to 0. These were the clues that appeared when no genuine connection had
  been found.
- **REFLECT fell from 9 pairs to 2.** It is the definition of MIRROR, so wherever it appeared half
  the puzzle came free. It survives only where the physics is the actual point.
- **Two unplayable clues removed.** DIAMOND + SHADOW used `LIGHT` and ENGINE + HORSE used `IRON`
  — both board words. The validator and tests now fail on any clue matching a pilot word.
- **364 unique clue words across 536 clues**, up from 331 across 576. No clue word appears in more
  than four pairs; the validator warns above that.

## Patterns still worth watching before scaling

- **37 of 190 pairs carry only the two-clue minimum.** That is honest rather than generous. Those
  pairs need better clues, not more of them.
- **21 clue words appear in exactly four pairs**, mostly hub words tied to a hub target — RIVER and
  SAFE to BANK, ARCH to BRIDGE, CUT to DIAMOND, BEE to HONEY. Four is tolerable on a 20-word board
  and will not be tolerable at 50 words and 1,225 pairs.
- **Some clues lean British** — CABINET for the shadow cabinet, high-street banking behind STREET,
  the stable-door proverb behind STABLE and GATE. Worth a pass if the audience is mostly American.
- **110 of the 536 clues have not been reviewed by a second person.** They were written and
  approved by the same judgement during the repair. The CSV has empty *Reviewer Notes* and
  *Approved* columns for exactly this purpose.

---

## After the small repair

The set is 568 clues across 190 pairs: 21 pairs on two clues, 152 on three, 15 on four and 2 on
five. 186 pairs carry two clues that would be defended confidently; four do not, and they are
named in section 11 of `pilot-quality-review.md`.

The clue-format rules are unchanged and still enforced by the validator and the tests. Three
clues now use the two-word allowance: `CROSS OVER` and `OTHER SIDE` for BRIDGE + GHOST, and
nothing added by the small repair, every new clue being a single word.

Edge cases a person should rule on before the next independent check are queued in
`pilot-human-review.md` and `pilot-human-review.csv`.
