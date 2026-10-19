# Unlimited x04b: targeted fixes, PUNCHLINE, and the next 25 families (local, held)

2026-10-19. Nothing was pushed, merged or deployed, and no database content was changed.

**Model usage:**
- x04b: **6 of the 10 allowed calls**, all on Opus 5.5 (each echoed `claude-opus-5-5`), about 600k tokens: 1 index check and 5 reviewers.
- The targeted fixes and the owner's PUNCHLINE change used **no model calls**.
- Before dispatch I re-checked `get_usage`: `extraUsage.enabled = false`, 5-hour window at 13%, weekly at 69%.
- The ledger is in `data/unlimited/expansion/x04b-calls.json`.
- Each agent worked in its own scratch folder and was told not to open others. All six reported reading only their instructions and their own input file.

## Branches and release boundaries

| Branch | Content | Status |
|---|---|---|
| **`feature/unlimited-x04-release`** at `c5fe085`, worktree `C:\Users\leviw\cluevoyance-x04-release` | Release candidate: corrections and supplement (up to `70ab208`), the reveal-widths test, the lint fix, and **the coordinator text fixes for release-candidate pairs** (CHECKMATE, WINE, HELICOPTER, MURDER), plus `displayed-text.test.mjs`. No checkpoint content. | **Ready for release review.** Full browser evidence (below). |
| `feature/unlimited-x04` at the commit after this report | Everything above, plus the x04 checkpoint (175 playable), the targeted fixes, PUNCHLINE, the x04b index and these results | Held for coordinator review |

Commits on `feature/unlimited-x04` since the last report:

| Commit | What |
|---|---|
| `ddba43f` | **Targeted fixes** (18 hints, explanation sentence and both lines), the owner's **PUNCHLINE**, fixed source clauses, sentence template, `displayed-text.test.mjs` |
| `5a0fa24` | The PUNCHLINE check skips cleanly where that checkpoint pair isn't exported |
| `7389173` | **x04b index:** 25 scene / pop-culture / visual families, better review selection, omitted-strong queue |
| `620fb6d` | Omitted-strong ties broken by a stable hash; 200 review inputs |
| `b1abf4e` | **x04b results:** 182 playable, 25 reviewer text fixes, client export 1,688 → 1,866 |

## 1. Targeted fixes (no content calls)

`scripts/unlimited/x04-targeted-fixes.mjs` applies each rule to the **explanation sentence and both per-word lines**, so a correction can't leave the combined sentence stale. Old text is kept in `provenance.textCorrection`.

| Hint(s) | Now reads |
|---|---|
| BOLT ×3 (still held) | "Bolt is a Disney movie about a TV-star dog who believes his fictional superpowers are real, and …" |
| SEAGULL | "Seagulls are a familiar sight at the beach, and …"; "… the seagulls in Finding Nemo squawk "Mine! Mine!"" (no extra period) |
| MINT + CARD (×2) | "Collectors describe pristine cards as being in mint condition." |
| PUNCH + FRUIT (×4) | "Fruit punch is a sweet fruit drink." |
| CHECKMATE (owner) | "Checkmate ends a chess game: the king is in check and there is no legal move to escape it." |
| WINE (owner) | "Some wines improve with age, resting in the bottle as the years pass." |
| HELICOPTER (owner) | "A helicopter is an aircraft whose blades spin round and round on top." |
| MURDER (owner) | "Picture a murder case: the victim is rushed to the hospital while police question a suspect." |

**Owner correction:** BOXER + JOKE serves **PUNCHLINE** as its preferred hint: "A joke ends with a punchline; a boxer throws a punch." It is recorded as an owner decision with the owner's words as provenance. PUNCH stays in that pair's research record but is never served for it. The other PUNCH pairs (BOXER + FRUIT, BOXER + PAPER, FRUIT + JOKE and so on) are unchanged. Neither BOXER nor JOKE is inside PUNCHLINE, so the hint rule passes.

**Regression check:** `scripts/unlimited/displayed-text.test.mjs` runs against the real client export and checks four things:
1. Every served hint shows exactly the library's current text in all three fields.
2. Every recorded correction is actually in place.
3. Each corrected phrase is gone from everything players can see.
4. BOXER + JOKE serves only PUNCHLINE, as an owner decision with provenance.

The source clauses in the route builders were fixed too, and the finder no longer adds a period after a closing "!".

**Exact checks:**

| Check | Checkpoint branch (`b1abf4e`) | Release branch (`c5fe085`) |
|---|---|---|
| Content script tests | 70 / 70 | 69 / 69 (+1 skipped: PUNCHLINE is checkpoint-only) |
| vitest | 171 / 171 | 171 / 171 |
| `check-random` (full board checker) | 1,000 / 1,000 | 1,000 / 1,000 |
| Browser: random-check, storage-failure, long-words (320/390/1280), reveal-widths (320/390/1280), Daily daily-smoke, home-results, Friends guest | see "Browser" below | **all 7 PASS** (own server, port 5193) |
| Lint | 4 existing `App.jsx` errors | same |

## 2. Selection review

- **FORK + TENT → PITCH is already served.** It came from an earlier batch: "Pitch a tent, then grab a pitchfork: farm camping." It was never missing; the finder correctly classed it as "in library". Its explanation is one of the terse older ones.
- **Omitted strong combinations:** the x04 round-robin left **150** strong (2+2) combinations unreviewed. `scripts/unlimited/select-omitted.mjs` chose **28** of them: one for each of the **25 meaning-pairs that had no library pair yet**, plus 3 bringing new words. Ties are broken by a stable hash, never alphabetically. All 28 passed review and are served:
  - PICK: GUITAR + LOCK, ICE + POCKET, DRAFT + POCKET and others
  - PITCH: BUSINESS + TENT, FORK + VOICE, BLACK + VOICE and others
  - SHELL: GAS + MARIO, SNAIL + TACO, MARIO + NUT and others
  - BOW: TIE + VIOLIN
  - RING: MARRIAGE + SATURN, PHONE + WEDDING
  - KEY: PIANO + TEST, PIE + TEST
  - JAM: CAR + PRINTER, PRINTER + TOAST
  - PUNCH: BOXING + PARTY
- **The finder's selection was fixed.** It now takes the strongest tier first, rotates across meaning-pairs, prefers words not yet used for that hint, and breaks ties by a stable hash. The old version picked within a meaning-pair alphabetically, which, for example, gave POTTER three BOWL pairs and no WAND, OWL or WIZARD.
- **Eight per family is a checkpoint size, not a cap.** This round reviewed up to 7 per family. WALRUS only had 4 eligible, so it got 4.
- **No numeric rejection target.** As asked, there's no strict editorial bar this time. Reviewers flagged uncertain calls as `uncertain` instead of forcing a verdict, and those calls are listed below. The 25 holds from the previous checkpoint are kept.

## 3. The x04b families (index extension)

The families are **POTTER, GOTHAM, OGRE, PIXAR, SHERLOCK, APOLLO, ICEBERG, PICNIC, CAMPFIRE, STRIPES, SPOTS, POOH, ELF, GARLIC, SONIC, DISCO, MIDNIGHT, JAWS, WALRUS, RAINBOW, UMBRELLA, PHARAOH, LUIGI, FROSTY, PARKER**.

They are deliberately mostly scenes, pop culture, visual analogies and shared situations, rather than more pure double meanings:
- Scenes: picnic, campfire, midnight, disco.
- Pop culture: Pixar, Potter, Gotham, Ogre/Shrek, Sherlock, Pooh, Sonic, Luigi, Parker.
- Visual analogies: walrus mustache, stripes, spots.
- Situations: umbrella in the rain, at the beach and in a cocktail.

Single-work routes may pair two elements of the same work, for example WAND + OWL → POTTER. PACMAN was dropped because "Pac-Man" would need a merged name.

**Index check (call 1)** against all 1,203 bank words found **90 missing words and 13 new meanings**:
- Stars and Stripes
- iceberg lettuce
- Gotham as New York's nickname
- the Wendy's Frosty
- Apollo Creed
- Beatrix Potter
- the Keebler elves
- the Jaws of Life
- Sonic Drive-In
- Parker Brothers
- sunspots
- burning the midnight oil
- s'mores at the campfire

It also fixed routes:
- TENT moved out of "building the fire".
- UNICORN was split from the pot-of-gold scene.
- WIND moved to rain, and FLY was added for Mary Poppins.
- GARLIC + KITCHEN and PHARAOH + SNAKE were removed.
- JOKE became CLOWN for the Joker.
- The singular "X marks the spot" was removed.
- PHOTO + CAMERA is now a never-pair.

These were applied by `x04b-apply-index-review.mjs`. Overall the finder generated 1,258 combinations, 796 eligible, and **172** were selected.

**Review (calls 2–6):** 200 proposals (172 new + 28 omitted): **182 PASS, 18 BORDERLINE, 0 FAIL.** The full table is attached as `x04b-200-proposals.csv` / `.md`. It covers targets, hint, routes, final explanation and lines, verdict, scores, flags, reviewer reason, final status, **served yes/no from the real export**, and whether the pair already serves another hint.

| Family | Reviewed | Pass | Held | Served | Uncertain flags |
|---|---|---|---|---|---|
| CAMPFIRE, ICEBERG, PICNIC, PIXAR, SONIC, SPOTS, UMBRELLA | 7 each | 7 | 0 | 7 | – |
| ELF, JAWS, MIDNIGHT, POOH | 7 each | 7 | 0 | 7 | 1 each |
| OGRE, POTTER, RAINBOW | 7 each | 7 | 0 | 6 (one pair keeps ONION / QUIDDITCH / HALO) | – |
| APOLLO, DISCO | 7 each | 6 | 1 | 6 | 1 |
| FROSTY, PHARAOH, STRIPES | 7 each | 6 | 1 | 6 | – |
| GOTHAM | 7 | 6 | 1 | 5 (BAT + KNIGHT keeps DARK) | – |
| GARLIC, SHERLOCK | 7 each | 5 | 2 | 5 | 2 / 1 |
| LUIGI | 7 | 3 | 4 | 3 | 2 |
| PARKER | 7 | 3 | 4 | 3 | 2 |
| WALRUS | 4 | 4 | 0 | 4 | – |
| Omitted strong (x04 families) | 28 | 28 | 0 | 28 | – |
| **Total** | **200** | **182** | **18** | **178** | |

**Previously served hints are untouched.** All 1,688 pairs that were already exported serve exactly what they did before (verified against the pre-merge export). The 4 accepted proposals on pairs that already served something keep the earlier hint and stay as unserved alternates: BAT + KNIGHT (DARK), LAYER + SHREK (ONION), BROOM + HOGWARTS (QUIDDITCH), GOLD + LIGHT (HALO).

**Reviewer fact fixes (25 hints, clause rules across sibling pairs and the route source):**
- Toy Story was Pixar's first *feature film*.
- Apollo is the god of *light*, often linked with the sun.
- In the song, the *children* put the magic silk hat on Frosty.
- *Many* pharaohs were buried in pyramids.
- A Frosty is eaten with a spoon.
- Taco-shell sentence fragments were fixed.
- A rainbow spreads sunlight into a band of colors.
- Jaws is a Bond *henchman*.
- The Batcave is beneath Wayne Manor.
- Three sentences that repeated themselves were rewritten.

### Strongest examples (as served)
- OWL + WHEEL → **POTTER**: Harry Potter's owl Hedwig delivers his mail, and a potter shapes clay on a spinning wheel.
- BASKET + BEAR → **PICNIC**: You pack lunch in a picnic basket, and Yogi Bear steals "pic-a-nic" baskets.
- BOXER + NASA → **APOLLO**: Apollo Creed is the champion boxer Rocky fights, and Apollo was NASA's Moon program.
- POLAR + SALAD → **ICEBERG**: Icebergs float in polar seas, and iceberg lettuce is the classic salad lettuce.
- CINDERELLA + NEW YEAR → **MIDNIGHT**: Cinderella must leave the ball by midnight, and the New Year begins at midnight.
- MOUSTACHE + SEAL → **WALRUS**: A big droopy mustache is called a walrus mustache, and the walrus is a big cousin of the seal.
- BEACH + COCKTAIL → **UMBRELLA**: A beach umbrella keeps off the sun, and a tiny paper umbrella tops a tropical cocktail.
- NEW YORK + PENGUIN → **GOTHAM**: Gotham is an old nickname for New York City, and the Penguin is a Gotham City villain.
- FISH + LAMP → **PIXAR**: Pixar's Finding Nemo follows a lost clownfish, and Pixar's logo is a hopping desk lamp.
- From the omitted queue: TIE + VIOLIN → **BOW**; GAS + MARIO → **SHELL**; PRINTER + TOAST → **JAM**; BOXING + PARTY → **PUNCH**.

### Weakest playable, worth your judgment (reviewer flagged `uncertain` or one side scored 1)
- SYRUP + TOY → **ELF**: Buddy the Elf pours syrup on his spaghetti… The payoff depends on having seen Elf.
- DISNEY + HONEY → **POOH**: DISNEY is a broad umbrella word.
- PUMPKIN + SNACK → **MIDNIGHT**: PUMPKIN reads as Halloween first.
- BEACH + BOND → **JAWS**: the Bond henchman is a 1970s reference.
- LONDON + VIOLIN → **SHERLOCK**: not every casual player knows Holmes plays the violin.
- PRESS + SMELL → **GARLIC**: a garlic press.
- CANE + ZEBRA / TIGER / REFEREE → **STRIPES**: the board shows CANE, not CANDY CANE.
- DICE / GIRAFFE / LADYBUG + SUN → **SPOTS**: sunspots take a moment.
- GHOST + TENT / WOOD → **CAMPFIRE**: the ghost side needs the "ghost stories" step.
- SPELL + WIZARD → **POTTER**: fair but flat.
- MOUSTACHE + POLAR → **WALRUS**: POLAR reads as polar bear first.

### Held (reviewer BORDERLINE)
- LUIGI with GHOST ×3 (Luigi's Mansion), and MARIO + MUSHROOM (TOAD is better, and already served)
- PARKER: GAME + SPIDER and GAME + WEB (Parker Brothers), NEWSPAPER / PHOTO + WEB
- GARLIC: BULB + VAMPIRE and POWDER + SMELL
- SHERLOCK: DETECTIVE + SUSPECT (better: ALIBI) and LONDON + STREET
- GOTHAM: CAVE + KNIGHT (better: BATMAN)
- APOLLO: SUN + THEATER
- STRIPES: CANE + STAR (better: CHRISTMAS)
- DISCO: MIRROR + SUIT
- FROSTY: HAT + MUG
- PHARAOH: GOD + KING (better: ZEUS)

**What this batch teaches us:** scene and pop-culture families produce more varied, more satisfying clues than polysemy families. They fail where they lean on a secondary trait of a franchise: Luigi's Mansion, Parker Brothers, the Daily Bugle, the Bond henchman. Families with one dominant meaning (WALRUS, ICEBERG) are small, and that's fine.

## Sampling budget, not a cap

"7 per family" (and 4 for WALRUS) is **only this checkpoint's review sample**. It is not a limit on how many pairs a hint may have, and it is not stored anywhere as a rule.
- **All candidates are saved:** `data/unlimited/related/x04b-candidates.json` holds every combination the finder generated for these 25 families: **1,258** generated, **796** eligible, **172** reviewed in this checkpoint. **624 eligible candidates are unreviewed, 65 of them with both words at full strength.** Each carries its routes, strengths, drafted text and class.
- **They stay eligible.** The same file feeds `select-omitted.mjs`, which picked this checkpoint's 28 omitted-strong reviews from the x04 families, and it can queue the x04b remainder for a future review the same way. The x04 families also still have **122 unreviewed strong combinations** in `x04-candidates-after.json`.
- **Library and exporter:** they store and serve any number of pairs per hint. Nothing caps pairs per hint, consistent with the brief.
- **WALRUS got 4 because only 4 of its 6 combinations were eligible.** The other 2 pair two strength-1 words, which the finder deliberately doesn't propose.

## Current metrics

| | Release branch (`c5fe085`) | Checkpoint branch (`b1abf4e`) |
|---|---|---|
| Eligible pairs in the client export | 1,515 | 1,866 |
| Bank words | 1,203 | 1,203 |
| Approved equal sets | 6 | 8 |
| Content calls this checkpoint | — | 6 of 10 (about 600k tokens) |

## Browser evidence

**Checkpoint content (`b1abf4e`, port 5192): 4 of 7 checks done so far, all PASS:**
- random-check (phone + desktop)
- long-words (320/390/1280)
- reveal-widths (320/390/1280)
- storage-failure

**Still running when this report was sent:** Daily daily-smoke, home-results, Friends guest. I didn't interrupt them; their results will be reported when they finish.

**Release branch (`c5fe085`, port 5193): all 7 PASS.**
