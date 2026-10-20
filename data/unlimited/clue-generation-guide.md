# Cluevoyance Unlimited — how to write clues for a word pair

This is the working method for generating pair clues. It supersedes any earlier informal
guidance. It covers what a clue may and may not be, the five brainstorming passes every pair
gets, and how reference clues are judged.

---

## 1. Clue collision rules

These are the rules. Earlier drafts banned any clue that matched a word in the pool. **That was
wrong and has been removed.**

1. A clue **may** be identical to another word in the overall word pool.
2. A clue **may** be identical to a different visible card word in the current puzzle. This is
   intentional and can give the player useful deduction or misdirection.
3. A clue **must not** be identical to either of the two target words it points toward.
4. Within one generated puzzle, the same clue text cannot be assigned to two different clue
   positions.
5. The same clue may exist in any number of pair records in the master database.
6. Cross-pair repetition is resolved during board generation, by selecting a conflict-free
   combination of clues.
7. Never delete an otherwise strong clue merely because it appears in another pair record.
8. There is no global clue-frequency ceiling in the master data.

### The worked example

> **HONEY + SHADOW → MOON** is valid, because of *honeymoon* and *moon shadow*.
>
> MOON may even appear as a different visible card word in the same puzzle. That is allowed, and
> it may help the player work out the correct arrangement.
>
> MOON would be invalid **only** if MOON were one of that clue's own two target words.

Rules 1–3 and 8 are enforced by `validate-pilot.mjs`. Rule 4 lives in
`scripts/unlimited/puzzle-clue-rules.mjs` and is tested there; it applies at selection time, not
to the master data.

---

## 2. Clue format

- One or two words. A two-word clue must be a familiar phrase.
- Uppercase, at most 18 characters including the space.
- Not equal to either of its own two target words.
- Proper nouns are allowed. Character and franchise names are allowed.

---

## 3. The five brainstorming passes

Every word pair gets all five, in order, before anything is ranked. A pair is not finished
because the first pass produced something usable.

1. **Direct and common associations.** The obvious literal links.
2. **Compounds, phrases, and words before or after.** `honey-moon`, `moon-shadow`, `key-stone`,
   `shadow-box`. Run the clue word in front of and behind each target.
3. **Alternate meanings, homophones, spelling variants, and wordplay.** Every target word has more
   senses than the first one that comes to mind: BRIDGE is a card game, a dental appliance, a
   ship's deck, part of a nose and part of a violin. Homophones count: BELL → BELLE, carat →
   CARROT.
4. **Cultural and reference-based connections.** See section 4. This pass is not optional and not
   a fallback.
5. **Lateral, surprising, or metaphorical connections.** Saved for last so it does not crowd out
   the passes above, and ranked accordingly.

---

## 4. References are a core method, not an exception

Cultural references are a major part of the fun of Cluevoyance. Treat this pass with the same
seriousness as the literal ones.

### Owner examples

| Pair | Clue | Why it works |
|---|---|---|
| DINOSAUR + FRIEND | **BARNEY** | Barney is a dinosaur, and the song is "I love you, you love me" — he is the friend. |
| BELL + ROSE | **BELLE** | Belle is a homophone of bell, and her story turns on the enchanted rose. |
| ROSE + MONSTER | **BEAST** | The enchanted rose is Beauty and the Beast's, and a beast is a monster. |
| ROSE + SHADOW | **SONIC** | Amy Rose and Shadow the Hedgehog are both Sonic characters. |

### Owner playtest calibration (Deb West, 2026-10-19)

| Pair | Clue | Owner reaction | Lesson |
|---|---|---|---|
| EINSTEIN + FAMILY | **RELATIVE** | "Einstein for Relative is CHEF'S KISS"; the game was "SO FUN" / "AMAZING" | Familiar knowledge used indirectly (Einstein → relativity → RELATIVE) for an aha payoff is excellent, not inherently weak. |
| BUS + GOLF | **DRIVER** | "10/10 hint" | A clear double meaning wins. Other words also fitting one side is not a reason to exclude it. |
| LAKE + SWORD | EXCALIBUR | Held: the owner does not connect Excalibur to the lake | A legend detail most players won't link to the target is a hold, even when it is true. |
| SPEAKER + SWORD | EXCALIBUR | Rejected: a talking Excalibur is Soul Eater trivia | Inventive stretches are welcome; obscure adaptation trivia does not justify them. |

Indirect is fine; it is obscure or unsupported routes that fail. A clue still has to be factually right on both sides (RECENT + COCKROACH → LARVAE was rejected because cockroaches have no larval stage).

### Synonyms (2026-10-20)

A hint that is a synonym of, or names one sense of, ONE target is not an automatic failure. What matters is an honest connection to BOTH targets and whether the clue is useful and fun: BAND + WEDDING -> RING, SOLITARY + PILOT -> SOLO, DRAWING + DOG -> DOODLE and COMPUTER + INSECT -> BUG are all served. A mere rename with no credible second connection may be weak, case by case. The structural rules (one word; never equal to, containing or contained in a target) are separate and unchanged. Reviewer briefs: data/unlimited/reviewer-brief-template.md.

### What the reference pass must actively consider

Fictional characters · characters in the same franchise · character relationships · famous people ·
actors · films and television · books · games · songs and musicians · mythology and folklore ·
sports · brands and mascots · famous objects, places or events · catchphrases · famous first or
last names · homophones · altered spellings · and two concepts appearing in the same recognizable
work.

### Reference quality rules

- **Do not penalise a clue for being cultural rather than literal.**
- Reward recognition, cleverness, and the satisfying "Ohhh!" after the reveal.
- A broad, delightful reference may rank **above** a dull literal clue.
- A niche but accurate reference may stay as a lower-ranked alternative.
- Extremely obscure trivia must not be one of a pair's two foundational clues. The validator warns
  when a clue marked `recognizability: "niche"` is ranked 1 or 2.
- **Verify uncertain factual claims.** A reference that turns out to be wrong is worse than no
  reference.
- Do not require an elaborate chain of facts. One hop per side.
- Proper nouns, character names and franchise names are all allowed.
- Homophones such as BELL → BELLE are encouraged.
- A reference clue still has to make a legitimate connection to **both** target words. Being a
  good reference does not excuse a one-sided clue.

### Reference metadata

A reference clue may carry optional `reference` metadata:

```json
"reference": {
  "referenceType": "fictional_character",
  "source": "Beauty and the Beast",
  "recognizability": "broad"
}
```

`referenceType` is one of: `fictional_character`, `franchise_pair`, `film_or_tv`, `book`, `game`,
`song_or_musician`, `famous_person`, `mythology_or_folklore`, `sport`, `brand_or_mascot`,
`famous_object_place_or_event`, `catchphrase`, `name_or_homophone`.
`recognizability` is `broad`, `moderate` or `niche`.

### Connection types

The `type` enum now includes `cultural_reference`, `fictional_character`, `title_or_name` and
`homophone_wordplay` alongside the original literal types. Existing records keep their original
type; a clue is only retyped when the new type genuinely describes it better. Do not force every
reference into a new type when an existing one is already accurate.

---

## 5. Ranking

1. The clearest and most satisfying clue.
2. The next strongest.
3–5. Increasingly lateral but still valid alternatives.

A pair carries two to five clues. At least two should be clues you would defend to a stranger.
Never pad a pair to five.

---

## 6. The recurring defect to avoid

The most common real fault in this corpus is **asymmetry**: the clue is a term of art on one side
and a plain modifier on the other. *Shadowing* a target but a *honey*trap; the *shadow* cabinet but
a *cabinet* key; a *dressing* table but honey *dressing*.

A compound is a legitimate source of clues — PIG for pig iron and piggy bank is among the best in
the set — but only when **both** targets are reached that way. When one side gets the compound and
the other gets the plain everyday sense, the clue pulls hard in one direction and will not find
its second word.

Other things to avoid:

- Generic colours, moods, materials and visual resemblances.
- "Both of these are found on a car / at night / in a garden."
- A clue that half-defines one of its own targets (REFLECT for MIRROR, HAUNT for GHOST).
- An explanation that justifies the clue using a form of the target word.
- An explanation that *invents* the connection rather than reporting one that already exists.

---

## 7. Explanations

Every clue carries four pieces of text:

| Field | Audience | Job |
|---|---|---|
| `explanation` | internal | How the clue reaches both words. Never shown to a player. |
| `wordAConnection` | player | One friendly sentence on the link to word A. |
| `wordBConnection` | player | The same for word B. |
| `revealExplanation` | player | The short line shown in the postgame "Why these clues worked" section. |

`wordAConnection` and `wordBConnection` are **per-side** and must match the canonical `a`/`b`
ordering of the record. Batch files are stored in canonical order for exactly this reason, and
`build-pilot.mjs` swaps the two fields if a batch is ever authored the other way round.

Player-facing text should be concise and friendly rather than academic, explain both sides
explicitly, name the work or character for a reference, avoid overexplaining an obvious clue, and
preserve the satisfying reveal. Audit criticism never goes in these fields; it belongs in the
audit files.

**Never manufacture a connection to make a weak clue look valid.** If either side cannot be
explained cleanly, set `needsHumanReview` with the reason. That puts the clue in the human-review
queue; it does not hide it from the data.
