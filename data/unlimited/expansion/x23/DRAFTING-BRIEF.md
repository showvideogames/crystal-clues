# x23 drafting brief (Cluevoyance Unlimited)

A puzzle hint is ONE word that points at TWO target words at once; after the game the player sees a one-sentence explanation and one short line per target word. Your job: draft about 100 NEW, genuinely good candidates. Quality over count: stop early rather than pad.

## Owner taste (calibration)
- Indirect familiar knowledge with an aha payoff is excellent: EINSTEIN + FAMILY -> RELATIVE ("chef's kiss"); BUS + GOLF -> DRIVER ("10/10", a clean double meaning). Place or property plus a category works: ANTARCTICA + ROOSTER -> PENGUIN.
- Good routes: double meanings, familiar pop culture (films, TV, games, bands, brands, sports teams), stories and fairy tales, scenes, shared properties. Phrase joins (each target completes a familiar phrase) are allowed but should not dominate.
- A familiar British or regional word many Americans know is fine (flag it honestly); still fail obscure trivia or niche fandom, false facts, one-sided links, a hint that equals, contains or is contained in a target, plurals of a target, more than one word (conventional spellings like K9, AC/DC, CAP'N are allowed). PG, general U.S. audience.
- A hint that names one sense of ONE target is fine if it honestly reaches BOTH.
- Honest explanations: never turn an association into a false fact ("some snakes have fangs", not "snakes have fangs"; say "in stories" for tropes).
- Accuracy check on EVERY line before you write it (explanation and both per-word lines): connect the HINT to that target, do not merely define the target; avoid unsupported always / every / first / only / current superlatives ("a typical honeybee colony has a queen", not "every hive"); no invented scene details (the Turtles shout Cowabunga, not "while eating pizza"); never treat a brand or character name as literal biology (Mr. Clean has a bald head; the bald eagle is named bald, it is not featherless). Keep each line concise and factual. Clever stretches are still welcome; universal familiarity is not required.
- Harder pairs are welcome when a satisfying, explainable route exists: do some creative work on awkward-looking pairs, but do not force them.

## Scope
- Every candidate must include at least one word from YOUR word list: under-covered words in the owner-accepted 810-word working proposal (alphabetical, not a ranking; you do not need to open it; the number in brackets is how many served pairs it has now: favour low numbers; this list does not restrict the bank, the partner can be any bank word). The other word can be any bank word (data/unlimited/expansion/x23/bank.txt).
- Vary families widely: sports and teams, food, animals, science and space, history and myth, TV and film, music, brands, holidays, jobs, body, home, weather, places. A few BAND or VIDEO GAME pairs are welcome, not required.
- Check EVERY candidate before writing it: node scripts/unlimited/x14-check.mjs <WORD> <WORD> <HINT>. Keep only lines that print OK.
- Use no other files or tools beyond: this brief, your word list, bank.txt, and the checker. No web, no paid APIs, no other repository files.
- Scratch files: another drafter runs at the same time. Put every temporary file (checker lists, helper scripts) ONLY in your own folder, C:\Users\leviw\AppData\Local\Temp\claude\C--Users-leviw-crystal-clues\1056bb3e-f86e-4fb9-b7e2-598ae51074ef\scratchpad\agents\x23-drafter-<your letter> (create it), and give each file an agent-specific name (for example x23-drafter-a-check-1.txt). Never write anywhere else in the scratchpad. In x19 two drafters overwrote each other's shared c1.txt.

## Notes from x16 to x22
- Your list now covers working-list words with 0 to 5 served pairs; favour the lowest numbers, but only where a genuinely good route exists. Words with 0 or 1 served pairs are new to the priority list, not necessarily hard: look for their everyday senses first.
- Many obvious hints are already taken (the checker says "pair already has a record"); look for fresh angles rather than repeating a hint already used on many pairs (for example RING, PITCH, CHIP, PUNCH, JAM, FROZEN, PICK, PIXAR, LAVA).
- Some pairs are reserved for coordinator review (the checker says "reserved"); skip them.
- Do not use the singular or plural form of a target, or another form of it (x21's DIVING for SCUBA DIVER was held), as the hint.
- A hyphen is allowed inside a conventional spelling (WALL-E, CROCK-POT, HEIGH-HO, X-MEN, 1-UP, POST-IT); write brand and title names in their usual form.
- Do not build new pairs on the Back to the Future dog named Einstein (a familiarity concern about that one detail, not a ban on the words).
- Per-word accuracy: name the hint's link to that target in each line; no unsupported "every", "first", "always", "all", "most"; no invented scene details; qualify where needed ("classic U.S. quarters", "where daylight saving is observed", "American robins", "a sandy beach"). In x20 the parent fixed lines such as a hit (singles, doubles, triples and home runs, not merely reaching base), an expiration date (a printed label, not exactly when food goes bad) and Smokey Bear (promotes wildfire prevention; not "named for smoke").
- The parent accepts signature scenes, familiar facts and valid compound bridges even when another target sense exists (LAWN, LAMP, ROD, CAESAR, NARUTO), and prefers the plain canonical bridge when one exists (FEED for INTERNET + TROLL, ARES, STRING, SATELLITE). Niche-only knowledge (quark flavors) is held. A clever hint should still be accessible.
- Familiarity: a moderate familiarity is fine. Keep player text clean: do not put reviewer-facing asides such as "(fans will know this)" or "(an older film)" in the explanation or lines; mention the needed fandom only in the summary you report.
- In x21 the parent preferred the canonical, plain bridge when one existed (JACK for FROST + GIANT, RAPTOR for EAGLE + HAWK, MASTER for PUPIL + YODA, FILLING for MIDDLE + OREO, AIR for SCUBA DIVER + SKY) and kept the film- or fandom-specific hint as a valid alternative. Look for the canonical bridge first.
- In x22 the parent accepted shared familiar phrases and scenes (MEDICAL for DOCTOR + HISTORY, CONDITION for COMIC + MINT, SHELL for SHIELD + TURTLE): two unrelated meanings are not required. It preferred the direct, canonical route over a niche or story-detail one: FLASH over CARD for CAMERA + MEMORY, BRIDGE over SUNLIGHT for STONE + TROLL, BONEHEAD over YORICK for FOOL + SKULL, DUMBO over JUMBO for CIRCUS + JET, and TREASURE for PIRATE + SILVER through silver coins rather than Long John Silver. BOWLER for BOWLING + HAT is held: a hint that is another form of a target word (bowler / bowling, diving / diver) stays out.

## Output
Write plain lines (no header) to your output file, one candidate per line:
HINT|WORD1|WORD2|explanation sentence|line for WORD1|line for WORD2|theme
theme is one short lowercase word (sports, food, story, film, music, science, brand, double, scene, place, history, game, band, ...). Do not use the | character inside the text. Save progress as you go. Finish with a short summary: count, families covered, and your 5 favourites.

## The owner's request for this batch
"Keep coming up with the best most clever answers ... Looking at the words and thinking of 10/10 hints." Diverse common-knowledge lateral connections and inventive answers for harder pairs are both welcome; never pad to reach a number.
