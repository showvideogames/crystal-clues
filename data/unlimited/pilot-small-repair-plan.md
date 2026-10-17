# Cluevoyance Unlimited — small repair plan for the 20-word pilot

Written before any dataset change. Scope is exactly the deficiencies named in
`pilot-independent-review.md` / `pilot-independent-review.json`. No word is removed or replaced,
no expansion to 50 or 100 words, no application, Supabase, website or deployment change, and
nothing is committed or pushed.

Source of truth for the dataset is `data/unlimited/batches/*.json`; the batches currently
reproduce `pilot-pair-clues-20.json` exactly (verified: 190 pairs, 536 clues, 0 differences), so
edits are made in the batches and the dataset is rebuilt with `build-pilot.mjs`.

**Target state:** every one of the 190 pairs holds at least 2 clues that would be rated PASS by the
independent rubric, 2–5 clues per pair, every genuinely good distinct clue retained up to five,
borderline-but-defensible laterals allowed as lower-ranked alternatives, all six FAIL clues gone.

---

## 1. The 19 pairs currently below two PASS clues

P/B/F is the independent reviewer's PASS / BORDERLINE / FAIL count on the clues as they stand.
An asterisk marks a clue written in the previous repair and never independently checked before
this review.

| # | Pair | Current clues | P/B/F |
|---|---|---|---|
| 1 | BANK + GHOST | VAULT\* B5, ACCOUNT\* B4, TOWN B6 | 0/3/0 |
| 2 | BANK + MIRROR | CHECK\* B5, SILVER\* P7 | 1/1/0 |
| 3 | BRIDGE + MIRROR | DOUBLE B5, VENICE\* B6 | 0/2/0 |
| 4 | BRIDGE + SHADOW | TROLL B6, UNDER B7, ARCH B6 | 0/3/0 |
| 5 | CROWN + ENGINE | WHEEL\* B4, TRAIN B6, PISTON\* F4 | 0/2/1 |
| 6 | CROWN + MIRROR | QUEEN P10, VANITY B6, GOLD B5 | 1/2/0 |
| 7 | DIAMOND + MIRROR | SCRATCH B7, GLASS P8 | 1/1/0 |
| 8 | FIRE + MOON | RING P8, NIGHT B5, LANTERN\* B6 | 1/2/0 |
| 9 | GHOST + HONEY | TRAP P9, TOMB\* B3 | 1/1/0 |
| 10 | GHOST + MOON | NIGHT B5, WALK\* P10, HAUNT B6 | 1/2/0 |
| 11 | HEART + SHADOW | SECRET B5, DOUBT\* B7 | 0/2/0 |
| 12 | HONEY + MIRROR | COMB\* P10, DRESSING\* B7 | 1/1/0 |
| 13 | HONEY + MOON | WEDDING P10, MONTH B7 | 1/1/0 |
| 14 | HONEY + SHADOW | SPY\* B7, EYE\* B7, TREE\* B5 | 0/3/0 |
| 15 | KEY + MOON | PIANO P8, SONATA B7 | 1/1/0 |
| 16 | KEY + SHADOW | DOOR B7, CABINET\* B6 | 0/2/0 |
| 17 | KEY + SNAKE | FLUTE P10, CHARM B7 | 1/1/0 |
| 18 | MIRROR + ROSE | BEAUTY P10, VANITY F4 | 1/0/1 |
| 19 | ROSE + SHADOW | SHADE P9, DUSK B5 | 1/1/0 |

---

## 2. The 18 pairs still below two PASS clues after the recommended restorations

Restoration fixes exactly one of the nineteen.

**Fixed by restoration alone — BANK + MIRROR.** Restoring WATER (river bank plus still water as a
mirror) gives it SILVER P + WATER P = two PASS clues. No new writing required.

**Still deficient, new writing required — the other 18:**

BANK + GHOST · BRIDGE + MIRROR · BRIDGE + SHADOW · CROWN + ENGINE · CROWN + MIRROR ·
DIAMOND + MIRROR · FIRE + MOON · GHOST + HONEY · GHOST + MOON · HEART + SHADOW ·
HONEY + MIRROR · HONEY + MOON · HONEY + SHADOW · KEY + MOON · KEY + SHADOW · KEY + SNAKE ·
MIRROR + ROSE · ROSE + SHADOW

How far each is from the bar once restorations are applied:

| Pair | PASS after restore | New PASS clues needed |
|---|---|---|
| BRIDGE + SHADOW | 0 | 2 |
| HEART + SHADOW | 0 | 2 |
| HONEY + SHADOW | 0 | 2 |
| KEY + SHADOW | 0 | 2 |
| BANK + GHOST | 1 (VANISH) | 1 |
| BRIDGE + MIRROR | 1 (WATER) | 1 |
| CROWN + ENGINE | 1 (POWER) | 1 |
| CROWN + MIRROR | 1 (QUEEN) | 1 |
| DIAMOND + MIRROR | 1 (GLASS) | 1 |
| FIRE + MOON | 1 (RING) | 1 |
| GHOST + HONEY | 1 (TRAP) | 1 |
| GHOST + MOON | 1 (WALK) | 1 |
| HONEY + MIRROR | 1 (COMB) | 1 |
| HONEY + MOON | 1 (WEDDING) | 1 |
| KEY + MOON | 1 (PIANO) | 1 |
| KEY + SNAKE | 1 (FLUTE) | 1 |
| MIRROR + ROSE | 1 (BEAUTY) | 1 |
| ROSE + SHADOW | 1 (SHADE) | 1 |

Four pairs need two new PASS clues each and fourteen need one, so the floor is **22 new PASS
clues**. Extra clues will be written only where a genuinely good idea exists.

---

## 3. The six current FAIL clues — all to be removed

| Pair | Clue | Why it fails | Pair after removal |
|---|---|---|---|
| CROWN + ENGINE | **PISTON** | A piston crown is specialist mechanic vocabulary; no player reaches CROWN. | 2 clues, 0 PASS — restore POWER, then write. |
| DIAMOND + GHOST | **FOREVER** | "A Diamond Is Forever" is strong, but the ghost half is a joke the explanation makes. | CURSE P, TOWER P — already clears the bar; restore VANISH to 3. |
| GHOST + SPRING | **JACK** | Spring-heeled Jack is Victorian obscurity; JACK evokes no ghost today. | HOLY P, WELL P — clears the bar; restore RISE to 3. |
| HORSE + KEY | **GATE** | True within-pair semantic duplicate of STABLE — same proverb, near-identical explanation. | BOLT P10, STABLE P10 — clears the bar on two. See section 6. |
| HORSE + SNAKE | **VENOM** | Antivenom produced in horses is veterinary trivia. | REAR P, GRASS P — clears the bar on two. |
| MIRROR + ROSE | **VANITY** | A rose placed on the table the mirror stands on. Proximity, not connection. | BEAUTY P only — needs restoration plus new writing. |

Removing a FAIL never takes a pair below the two-clue schema minimum.

---

## 4. The 13 firm restoration recommendations

Each already exists in `removed_clue_reviews`, was rated PASS by the independent reviewer, is
distinct inside its pair, is not one of the 20 pilot words, and keeps its pair at or under five
clues. All 13 will be restored.

| # | Pair | Clue | Size now → after |
|---|---|---|---|
| 1 | BANK + CROWN | GOLD | 3 → 4 |
| 2 | BANK + GHOST | VANISH | 3 → 4 (5 once the new clue lands) |
| 3 | BANK + LIGHT | SWITCH | 3 → 4 |
| 4 | BANK + MIRROR | WATER | 2 → 3 |
| 5 | BANK + MOON | SILVER | 2 → 3 |
| 6 | BANK + SPRING | RIVER | 2 → 3 |
| 7 | BRIDGE + CROWN | LONDON | 3 → 4 |
| 8 | BRIDGE + HONEY | NIAGARA | 3 → 4 |
| 9 | BRIDGE + MIRROR | WATER | 2 → 3 |
| 10 | CROWN + ENGINE | POWER | 3 → 3 (PISTON leaves first) |
| 11 | DIAMOND + GHOST | VANISH | 3 → 3 (FOREVER leaves first) |
| 12 | DIAMOND + HORSE | RING | 2 → 3 |
| 13 | GHOST + SPRING | RISE | 3 → 3 (JACK leaves first) |

Cross-pair repetition is explicitly **not** a reason to refuse any of these. WATER, SILVER, RIVER,
VANISH and RING each already appear elsewhere; that is a board-selection concern for the
generator, not a semantic defect, and the review is explicit that deleting good clues to hold a
global frequency ceiling is what produced the thin pairs in the first place. No global clue
frequency ceiling will be enforced by deletion in this pass.

---

## 5. The 10 optional restoration recommendations — judged one at a time

Each is decided on its own merits in Phase 2: restore only if genuinely playable and distinct
inside its pair.

| # | Pair | Clue | Reviewer verdict | Size now → after | Question to settle |
|---|---|---|---|---|---|
| 1 | DIAMOND + HONEY | RING | BORDERLINE | 3 → 4 | Is "the person you call honey" a real hop or a pet-name stretch? |
| 2 | FIRE + KEY | START | PASS | 3 → 4 | Plain but bidirectional; does it beat the retained ESCAPE? |
| 3 | HEART + IRON | COLD | PASS | 3 → 4 | Good clue; the pair is already strong at three. |
| 4 | HONEY + HORSE | OATS | PASS | 2 → 3 | Pair is on two clues; everyday on both sides. |
| 5 | HORSE + SALT | WATER | PASS | 2 → 3 | Two real idioms; pair is on two clues. |
| 6 | IRON + SNAKE | COIL | PASS | 2 → 3 | Concrete on both sides; pair is on two clues. |
| 7 | KEY + SHADOW | SKELETON | BORDERLINE | 2 → 3 | Exact for KEY, reaching for SHADOW; pair needs new writing anyway. |
| 8 | LIGHT + MOON | SILVER | PASS | 3 → 4 | Fair both ways; does it duplicate the retained PALE? |
| 9 | MIRROR + MOON | REFLECT | PASS | 3 → 4 | Half-defines MIRROR; is that disqualifying for a rank-4 alternative? |
| 10 | MIRROR + ROSE | TINT | BORDERLINE | 2 → 3 | Exact for ROSE, weak for MIRROR; pair needs new writing anyway. |

---

## 6. The semantic duplicate in HORSE + KEY

Current clues: BOLT P10, STABLE P10, GATE F7.

STABLE and GATE encode the *same proverb* — locking the door after the horse has bolted — and
their explanations differ by one word ("stable door" / "gate"). The existing test
`no duplicate clue text within a pair` compares text, not meaning, so both pass it.

**Resolution: keep STABLE, remove GATE.** STABLE is the stronger of the two because the canonical
English form of the proverb is *stable door*, and because STABLE carries a genuine second sense
(steady, unchanging) that GATE does not. GATE additionally collides with the lock-and-door idea
already carried by BOLT.

The pair then holds BOLT P10 + STABLE P10 — two independently passing clues — so it **clears the
bar without a replacement**. The brief's instruction is to replace the duplicate *if the pair
needs another strong clue*, and on the reviewer's own scoring it does not. A third clue will be
added only if a genuinely good idea survives brainstorming; padding it back to three would be
exactly the fault this repair exists to correct.

---

## 7. Every pair requiring new writing

Eighteen pairs, hardest first. The four at the top have zero PASS clues even after restoration
and are written first, as the review recommends.

### Tier 1 — zero PASS after restoration, two new PASS clues needed each

| Pair | Why it is hard | Brainstorming passes to run |
|---|---|---|
| **HONEY + SHADOW** | All three current clues are new, all three are BORDERLINE, and all three fail the same way: a compound mined for one half (honey*trap* / *shadow*ing, *eye*shadow / honey-coloured, bee *tree* / any tree's shade). DARK, SUN and GOLD were correctly cut and must not come back as filler. | Alternate senses of both words; beekeeping and light-and-dark as a *shared activity* rather than a shared colour; idiom and proverb; recognizable titles; cause and effect; contrast. SPY may stay as a lower-ranked lateral but **cannot count** toward the two required strong clues. |
| **BRIDGE + SHADOW** | TROLL points hard at BRIDGE and barely at SHADOW; UNDER is a bare preposition; ARCH is "solid objects cast shadows", true of everything. | BRIDGE as card game, dental work, nautical deck, musical section, nose, spanning a gap; SHADOW as follower, understudy, eclipse, silhouette, the overhang of the past. |
| **HEART + SHADOW** | Both clues work only on the figurative sense of SHADOW, and nothing touches HEART as an organ, so the pair is abstract on both sides at once. | HEART as organ, playing-card suit, centre, courage; SHADOW as medical imaging, eclipse, a following figure, silhouette. Find one idea reaching a concrete sense of at least one word. |
| **KEY + SHADOW** | DOOR is one-sided and CABINET is UK politics against a weak KEY reach. | KEY as musical key, map key, keystone, keyboard, island key, answer key, key light; SHADOW as the photographic and stage-lighting counterpart, a following figure, a silhouette. |

### Tier 2 — one PASS after restoration, one new PASS clue needed each

| Pair | Where the gap is | Brainstorming passes to run |
|---|---|---|
| **BANK + GHOST** | VAULT and ACCOUNT both point at BANK and reach GHOST by a step; TOWN is the reverse. VANISH gives one fair clue. | BANK as river bank, sandbank, balance sheet, blood bank, memory bank; GHOST as the sheeted figure, ghost ship, ghostwriter, ghost town, A Christmas Carol. |
| **BRIDGE + MIRROR** | DOUBLE only works once the explanation supplies the water; VENICE is art history. WATER gives one fair clue. | Bridge of a nose, of spectacles, of a violin, of a ship; mirror as wing mirror, rear-view, looking-glass, symmetry. |
| **CROWN + ENGINE** | All three retained clues are drivetrain or royal-train jargon; PISTON is removed. POWER gives one fair clue. | Non-mechanical readings of ENGINE (engine of growth, search engine, fire engine, siege engine); CROWN as monarchy, tooth, top of the head, coin, crowning achievement. |
| **CROWN + MIRROR** | QUEEN is excellent; VANITY is set dressing and GOLD is material padding. | Fairy tale beyond Snow White; crown as tooth or top of the head; mirror as the thing that shows you yourself — coronation, portrait, image, likeness. |
| **DIAMOND + MIRROR** | SCRATCH is one-sided; GLASS passes. | Cutting and polishing as a shared craft; facet, reflection, silvering, jeweller's tools, fakes and forgery. |
| **FIRE + MOON** | RING passes; NIGHT is mood-only and LANTERN is regionally specific. | Eclipse, harvest, the space programme, myth and legend, werewolf, Apollo, the two things people look up at. |
| **GHOST + HONEY** | TRAP passes; TOMB is trivia on one side and setting on the other. | Bees and the dead (telling the bees), preservation, sweetness as a lure, folk custom, Halloween, sticky and ensnaring. |
| **GHOST + MOON** | WALK passes; NIGHT is mood and HAUNT half-defines GHOST. | Pale and full-moon clichés are banned as padding — look for shared *language*: crescent, phase, eclipse, howling, séance, the man in the moon, lunar. |
| **HONEY + MIRROR** | COMB is excellent; DRESSING is a salad the explanation had to find. | The beauty routine as a genuine shared activity, face mask, reflection, glass jar, golden light, bee's-eye vision. |
| **HONEY + MOON** | WEDDING passes; MONTH is an etymology lesson. | The designated easy pair — find the second obvious one: harvest, June, bee, sweetness, the compound read another way. |
| **KEY + MOON** | PIANO and SONATA are the same referent twice (Moonlight Sonata), so the pair effectively has one clue. SONATA stays only as a lower-ranked alternative. | KEY as map legend, island key, keystone, answer key, low-key; MOON as lunar, tide, phase, crescent, landing. |
| **KEY + SNAKE** | FLUTE passes; CHARM is one-sided. | Snake as pipe-clearing tool, rattler, Eden, Medusa; KEY as keyhole, keyring, keyboard, keystone, quay homophone. |
| **MIRROR + ROSE** | BEAUTY passes; VANITY is removed as a FAIL. | Rose-tinted glasses, compass rose, rose window, Alice Through the Looking-Glass, symmetry, thorn, English rose, the colour of the glass itself. |
| **ROSE + SHADOW** | SHADE passes; DUSK is mood on both sides. | Gardening as a shared activity (roses and shade are a real gardener's problem), thorn, silhouette, twilight, the rose in shadow as an image, Rose as a name. |

### Rules every new clue must satisfy

- one or two words, uppercase, at most 18 characters including the space;
- never equal to any of the 20 pilot words (FIRE MOON BANK SPRING LIGHT HEART IRON CROWN HORSE
  SHADOW KEY SALT ROSE DIAMOND GHOST HONEY SNAKE BRIDGE MIRROR ENGINE) and never equal to either
  target word;
- a concise explanation that *confirms* an existing bridge rather than inventing one;
- an accurate connection type from the schema enum;
- no generic colour, mood, material or visual-resemblance clues;
- no clue whose explanation justifies it using a form of one of its own target words;
- asymmetry is the priority defect to avoid: both halves must be reached the same way, not one
  through a compound and the other through a plain everyday sense.

---

## 8. Human-review queue (added at the owner's request)

The owner will personally judge edge cases while the queue stays under 500 items. Two files are
produced after the repair, organized primarily by pair:

- `data/unlimited/pilot-human-review.csv`
- `data/unlimited/pilot-human-review.md`

They are a filtered queue, not the whole dataset. A clue enters the queue if any of the following
is true:

1. the independent reviewer rated it BORDERLINE;
2. the author audit and the independent reviewer disagreed about it;
3. it is an optional restoration (accepted or rejected);
4. it was newly written in this repair;
5. it belongs to a pair that was below the two-PASS minimum;
6. it is a final HONEY + SHADOW candidate;
7. the author is personally uncertain about it;
8. it sits in a pair where two clues may be semantic duplicates.

Every queued clue carries word A, word B, clue text, rank, explanation, connection type, origin
(retained / restored / newly written), the previous reviewer verdict where one exists, the reason
it needs human review, an AI recommendation of KEEP / REJECT / UNSURE, and blank HUMAN DECISION
and HUMAN NOTES columns. The header states the four decision values (KEEP, REJECT, LOWER,
REWRITE) and that a blank decision is **not** approval. Exact pair and clue counts are reported
when the queue is built; if it exceeds 150 clues for a 20-word pilot the cause is explained
before the queue is expanded any further.

---

## 9. Ordering and ranking policy

Within each pair, rank 1 is the clearest and most satisfying clue, rank 2 the next strongest, and
ranks 3–5 increasingly lateral but still valid alternatives. Restored and newly written clues take
whatever rank their quality earns; they are not appended to the end by default.

## 10. Files this repair will touch

- `data/unlimited/pilot-pair-clues-20-before-small-repair.json` (new — snapshot taken first)
- `data/unlimited/batches/*.json` (edited — the authoring source)
- `data/unlimited/pilot-pair-clues-20.json` (rebuilt)
- `data/unlimited/pilot-pair-clues-20.csv` (rebuilt)
- `data/unlimited/pilot-review.md` (updated)
- `data/unlimited/pilot-quality-review.md` (updated)
- `data/unlimited/pilot-small-repair-plan.md` (this file)
- `data/unlimited/pilot-small-repair-author-check.json` (new — author self-check, Phase 6)
- `data/unlimited/pilot-human-review.csv` and `pilot-human-review.md` (new — Phase 8)

Left untouched as historical review evidence: `pilot-independent-review.json`,
`pilot-independent-review.md`, `pilot-clue-quality-audit.json`,
`pilot-pair-clues-20-before-quality-repair.json`, `pair-clue-schema.json`, `pilot-words-20.json`.
`src/App.jsx`, Supabase, the live site and deployment are out of scope.
