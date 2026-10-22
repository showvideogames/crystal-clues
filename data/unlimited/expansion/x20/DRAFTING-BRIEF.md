# x20 drafting brief (Cluevoyance Unlimited)

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
- Every candidate must include at least one word from YOUR word list: under-covered words in the proposed core list (the number in brackets is how many served pairs it has now: favour low numbers; this list does not restrict the bank, the partner can be any bank word). The other word can be any bank word (data/unlimited/expansion/x20/bank.txt).
- Vary families widely: sports and teams, food, animals, science and space, history and myth, TV and film, music, brands, holidays, jobs, body, home, weather, places. A few BAND or VIDEO GAME pairs are welcome, not required.
- Check EVERY candidate before writing it: node scripts/unlimited/x14-check.mjs <WORD> <WORD> <HINT>. Keep only lines that print OK.
- Use no other files or tools beyond: this brief, your word list, bank.txt, and the checker. No web, no paid APIs, no other repository files.
- Scratch files: another drafter runs at the same time. Put every temporary file (checker lists, helper scripts) ONLY in your own folder, C:\Users\leviw\AppData\Local\Temp\claude\C--Users-leviw-crystal-clues\180baece-9d2f-4022-a383-58f3561a9405\scratchpad\agents\x20-drafter-<your letter> (create it), and give each file an agent-specific name (for example x20-drafter-a-check-1.txt). Never write anywhere else in the scratchpad. In x19 two drafters overwrote each other's shared c1.txt.

## Notes from x16 to x19
- Every word on your list now has at least 4 served pairs; favour the lowest numbers, but only where a genuinely good route exists.
- Many obvious hints are already taken (the checker says "pair already has a record"); look for fresh angles rather than repeating a hint already used on many pairs (for example PICK, PIXAR, LAVA, PENGUIN, JAM, FROZEN).
- Do not use the singular or plural form of a target as the hint (x17's DIE for DICE was held for this).
- A hyphen is allowed inside a conventional spelling (WALL-E, CROCK-POT, HEIGH-HO, X-MEN); write brand and title names in their usual form.
- Do not build new pairs on the Back to the Future dog named Einstein (three such hints are familiarity-held). This is a familiarity concern about that one detail, not a ban on the words.
- Parent cleanups were mostly per-word lines that defined the target without naming the hint, overstated a fact ("every", "first", "always", "all"), or added scene details that are not in the source. Write each line so it names the hint's link to that target and states only what is true; qualify when needed ("classic U.S. quarters", "where daylight saving is observed", "American robins").
- The parent prefers the plain, widely known bridge when one exists (RELATIVITY, DEAD, ASH, ARES, STRING, SATELLITE, SANDERSON) and holds hints that need niche knowledge (quark flavors, turnip lanterns). A clever hint should still be accessible.

## Output
Write plain lines (no header) to your output file, one candidate per line:
HINT|WORD1|WORD2|explanation sentence|line for WORD1|line for WORD2|theme
theme is one short lowercase word (sports, food, story, film, music, science, brand, double, scene, place, history, game, band, ...). Do not use the | character inside the text. Save progress as you go. Finish with a short summary: count, families covered, and your 5 favourites.

## The owner's request for this batch
"Keep coming up with the best most clever answers ... Looking at the words and thinking of 10/10 hints." Diverse common-knowledge lateral connections and inventive answers for harder pairs are both welcome; never pad to reach a number.
