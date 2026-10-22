# Unlimited x04c: coordinator fixes and the backlog checkpoint (local, held)

2026-10-19, on branch `feature/unlimited-x04`. Nothing was pushed, merged or deployed, and no database content was changed.

**Usage:** **5 of the 6 allowed calls**, all on Opus 5.5 (each echoed `claude-opus-5-5`), about 456k tokens. No generation call was needed, because every backlog proposal already carried index-drafted text. I re-checked `get_usage` before dispatch: `extraUsage.enabled = false`, 5-hour window at 20%, weekly at 70%. The ledger is `data/unlimited/expansion/x04c-calls.json`. Each reviewer worked in its own scratch folder and saw only its own input.

## Commits (since the x04b report `c79e6ec`)

| Commit | What | Model calls |
|---|---|---|
| `550f157` | **Coordinator review of x04b:** 4 coordinator holds; Frosty and iceberg wording; 34 same-subject explanations collapsed | none |
| `46e907e` | Backlog inputs: all 187 full-strength unreviewed combinations, after dedupe | none |
| `e14dd62` | **Backlog results:** 179 playable; stale source clauses fixed everywhere; same-subject collapse built into the finder | 5 |

**Release boundary:** the release candidate is still `feature/unlimited-x04-release` at `c5fe085`, unchanged in this round, and passed all 7 browser checks earlier. Everything on `feature/unlimited-x04` after `70ab208` is checkpoint content held for review.

## 1. Coordinator holds and corrections (`550f157`, no model calls)

**Held** as *coordinator* decisions (`by: coordinator (parent review of x04b …; not an owner decision)`), and not served:
- #75 KNIGHT + NEW YORK → GOTHAM and #77 NEW YORK + PENGUIN → GOTHAM: the old New York nickname.
- #168 LONDON + VIOLIN → SHERLOCK: secondary trivia.
- #86 BEACH + BOND → JAWS: kept on record for possible future review.

The earlier 18 reviewer holds are unchanged. DARK, ONION, QUIDDITCH and HALO are still served over their unserved alternates.

**Text:**
- #57: "A chocolate Frosty from Wendy's is a thick, frozen dairy dessert you eat with a spoon, and frosty means icy cold."
- #63: "A Wendy's Frosty is a frozen dairy dessert much like soft-serve ice cream, and Frosty is the famous snowman of the Christmas song."
- #78, #82, #84: "icebergs are a hazard for ships at sea".
- 34 same-subject collapses, for example:
  - "Harry Potter wears round glasses and has a lightning-bolt scar."
  - "Luigi is Mario's green-clad brother."
  - "Frosty is the snowman who comes alive when a magic hat is placed on his head."
  - "Sherlock Holmes, the most famous fictional detective, is pictured puffing a pipe."
- Double meanings where the repeat is the point were left alone: Apollo the Moon program vs the god, "frosty" vs Frosty, and the two different Jaws.

**Checks:** the fixes reach the explanation, both lines and the route sources. The `displayed-text` test checks the real export for the old phrases and for the four coordinator holds. After this commit: script tests 71/71, unit tests 171/171, 1,000/1,000 boards. The x04b browser suite finished: **all 7 PASS**, including Daily, home/results and Friends.

## 2. Backlog checkpoint

**Selection:** I reclassified the 25 + 25 families' candidates against the **current** library, so anything accepted (382), held (47), rejected or excluded drops out automatically. That keeps BOXER + JOKE → PUNCHLINE and every hold untouched.

Exactly **187** full-strength (2+2) combinations remained: 122 from the x04 families and 65 from x04b, on 187 distinct pairs, none proposed twice. Because all were full strength and none duplicated, I sent all 187 rather than padding or trimming to a number. Five were on pairs that already serve another hint; reviewers saw that served hint as context.

**Review:** **179 PASS, 8 BORDERLINE, 0 FAIL.** The full table, with served yes/no from the real export, is attached as `x04c-187-backlog.csv` / `.md`.

| Group | Hints | Pass | Held |
|---|---|---|---|
| A | POTTER 37, STRIPES 1 | 38 | 0 |
| B | SHELL 24, PIXAR 14 | 38 | 0 |
| C | JAM 15, RING 13, KEY 8, UMBRELLA 1 | 37 | 0 |
| D | SCALE 9, SEAGULL 6, LAVA 6, PUNCH 6, PICK 5, CHIP 5, CAMPFIRE 2 | 35 | 4: bird-for-bird SEAGULL (CROW / PIGEON with FRY / SNACK) |
| E | SLAM, DECK, SAILOR, FAN, NET, HORN, WING, BOLT, OGRE, PICNIC, SONIC | 31 | 4: BIRD + HOSPITAL and BIRD + PLANE → WING, GREEN + SHREK → OGRE, HALL + SKATEBOARD → DECK |

**Served:**
- **175** new pairs are served, and the client export grows from 1,862 to **2,037**.
- All 1,862 previously exported pairs serve exactly what they did before.
- Four accepted proposals stay unserved alternates, keeping their earlier hint: FRUIT + PAPER (PUNCH), HOGWARTS + OWL (HEDWIG), PIANO + REPTILE (SCALES), BASKETBALL + TENNIS (NET).

**For your judgment:**
- **Sailor Moon consistency:** MOON + SEA and MOON + SHIP → SAILOR **passed**. BOAT + MOON and KNOT + MOON were held earlier for the same Sailor Moon route. I didn't override the reviewer; please decide one way for all four.
- **Flat but fair:** many backlog passes scored delight 1, for example PHONE + WEDDING → RING, LOCK + MAP → KEY, EGG + SNAIL → SHELL and SPELL + WIZARD → POTTER. They're correct and easy, but not memorable.
- **Uncertain:** MARIO + SEA → SHELL (both sides need a step), CHOCOLATE + HOT → LAVA (FUDGE may be sharper), OCEAN + SNACK → SEAGULL.

## 3. What the backlog teaches us

1. **The index finds valid variations very efficiently.** Of 187, 96% passed, with zero factual failures after fixes. That's because "full strength on both sides" is a good predictor of quality.
2. **But the backlog concentrates in a few high-yield hints.** A single-franchise route (POTTER: any two of WAND, OWL, BROOM, GLASSES, HOGWARTS…) or a very polysemous word (SHELL, RING, JAM) yields dozens of strong pairs. Under the current **uniform sampler** that turns into hint repetition. 200 simulated players × 30 boards (`x04c-sampler.json`):

| | Distinct targets / 30 boards | Repeated pairs | Repeated hint showings (other pair) | Most times one hint seen | Top hints (share of boards) |
|---|---|---|---|---|---|
| Before backlog (1,862), current sampler | 140.2 | 2.94 | 12.9 (9.9) | 3.0 | SEA 4.3%, PITCH 3.4%, SHELL 3.3% |
| **With backlog (2,037), current sampler** | 146.3 | 2.74 | **16.9 (14.2)** | 3.9 | **POTTER 8.7%, SHELL 7.5%**, JAM 5.1% |
| With backlog, light recent-history (offline only) | 147.3 | 1.27 | 8.0 (6.8) | 2.2 | POTTER 5.3%, SHELL 4.9%, RING 4.0% |
| With backlog, hint-first (offline only) | 133.9 | 4.58 | 6.1 (1.6) | 2.2 | none above 0.8%; 111 pairs never shown |

Busiest served hints after the backlog: **POTTER 42, SHELL 40, RING 27, JAM 24, PIXAR 21, PICK 20, SEA 19, LAVA 18, KEY 18, FROZEN 16.**

No cap and no sampler change were applied, as instructed. This is the decision the data now points to: release the backlog only together with a repetition-aware selection, such as the recent-history approach, or release it in slices.

3. **Pair-only text fixes leak back.** The backlog regenerated three wordings I had already fixed on specific pairs, because the route source still had them: lava "about as hot as anything gets", the "Chocolate chip cookies." fragment, and the hospital wing. From now on, every fix is applied as a rule to all matching hints **and** both route builders (`x04c-text-fixes.mjs`), and the `displayed-text` test checks the real export for each corrected phrase.
4. **A template rule now prevents repeated subjects.** `collapse-lib.mjs` merges "X …, and X …" into "X … and …" only when both clauses share the same named subject. It never merges articles ("A nut … / A snail …") or possessives ("Harry Potter's owl"), and it is covered by unit tests. My first version was too eager. Its 50 changes were undone exactly from provenance before the corrected rule was applied: 30 collapses, plus a guarded pronoun pass for 12 possessive repeats (Harry Potter → his, Pixar → its).
5. **Remaining polish candidates:** 25 served explanations still repeat a lead word. Most are deliberate double meanings (Buzz Aldrin vs Buzz Lightyear, Apollo); a few read slightly stiffly ("Pixar made Cars, and its Finding Nemo …").

## Tests (backlog content, `e14dd62`)

| Check | Result |
|---|---|
| Content script tests | 72 / 72 (adds the collapse tests and the extended displayed-text checks) |
| vitest | 171 / 171 |
| `check-random` | 1,000 / 1,000 |
| Browser (port 5192): random-check, long-words, reveal-widths, storage-failure, daily-smoke, home-results, guest | **all 7 PASS** (completed after the report was first sent) |

## Backlog still available

Nothing reviewed here is lost: rejected and held items stay recorded with reasons. The index still has **2,714** lower-strength "new" combinations across the 50 families, which were never proposed (they involve a strength-1 word). There are no further full-strength combinations left in these families. The next useful content step would be new families. Given the concentration above, those should be chosen to *spread* hints (families that yield a few excellent pairs each) rather than more of the high-yield kind.
