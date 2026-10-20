# Blind reviewer brief: template (future reviews)

Fill in <BATCH>, <ID>, <N> and <DATE>; adapt the batch description paragraph. Earlier briefs (x03-x12) are kept as they were run; this template is the current wording.

Changed 2026-10-20 after the synonym-rule audit (data/unlimited/clue-generation-guide.md, "Synonyms"): the old FAIL item "a plain synonym ... of a target" was an assistant-written review rule, not an owner requirement or a game rule. The structural rules are unchanged and live in code (scripts/unlimited/catalogue-lib.mjs hintProblem: one word, never equal to, containing or contained in a target).

---

You are an independent reviewer of word-puzzle hints for Cluevoyance Unlimited: a single one-word hint must point at TWO target words at once, and the player has to work out which two words on a board of 28 it links. You did not draft these and must judge them on their merits. Read exactly one file and nothing else: C:\Users\leviw\cluevoyance-unlimited\data\unlimited\library\reviews\<BATCH>-r<ID>-input.json . Do not open any other file, do not search the repository, do not use the web or any paid API. Review every hint of every pair in the input (<N> hints on <N> pairs); before finishing, confirm your output has the same pair_ids and hint texts as the input. Write the output file as early as you can and keep it valid JSON at every save. If you hit a usage limit, stop without retrying and report the exact message.

Model echo (required): in _metadata.model write the exact model ID you are running as, copied from your own system prompt (for example the string after "The exact model ID is"). Do not guess; if your system prompt does not state one, write "not stated".

Each hint comes with the explanation sentence and the two short per-word lines that players see after the game. During play they see only the hint word.

These pairs were drafted for a new batch: band names and songs (BAND), video game titles and characters (VIDEO GAME), and double meanings, brands and familiar characters. Expect a real share of weak or forced ones; judge each strictly on its own. Hints may use conventional spellings with digits, a slash or an apostrophe (K9, AC/DC, CAP'N); that is allowed.

Ask of every hint:
1. Does the hint naturally bring BOTH targets to mind, at least once the player thinks of the right sense?
2. Is the connection familiar enough for a general U.S. audience?
3. Is there a clearly better hint for this pair? If so, name it in better_hint. A better hint existing is a reason for BORDERLINE only when this one is clearly weaker AND unremarkable; two genuinely good hints for one pair can both PASS.
4. Does the explanation reveal a real, true connection rather than invent one? Are the per-word lines accurate?
5. Is this a satisfying clue, even if easy?

The owner's current standard (latest calibration, 2026-10-19/20):
- Indirect familiar knowledge with an aha payoff is EXCELLENT, not weak. Her favourite: EINSTEIN + FAMILY -> RELATIVE ("chef's kiss": Einstein -> relativity -> relative). BUS + GOLF -> DRIVER is a "10/10 hint" (a clear double meaning; other words also fitting one side is NOT a reason to fail it). A place or property plus a category is fine: ANTARCTICA + ROOSTER -> PENGUIN ("a rooster is a bird; penguins are the birds of Antarctica").
- What fails: obscure adaptation or fandom trivia (a talking Excalibur from an anime was rejected), a legend detail most players would not link (LAKE + SWORD -> EXCALIBUR was held), factual errors (cockroaches have no larvae), and lazy or one-sided links.
- Older but still widely known references (classic rock bands, classic arcade games, cereal mascots) are fine for a general U.S. audience. Pop culture, brands, sports teams and characters are welcome.
- Clever but fair: the link should CLICK and feel satisfying once explained, without a long defence. An excellent obvious hint beats forced novelty. A clear, easy clue can be satisfying: a low delight score alone is not a reason to fail it.
- Phrase-joins (each target completes a familiar phrase, compound or ___ blank, for example a band name that simply contains the target word) are not banned but should not dominate: PASS one only when the phrase is instantly familiar and the pairing is genuinely satisfying.
- PG and accessible to a general U.S. audience: fail niche fandom, British-only usage, crude or sensitive material.
- FAIL: wrong facts (in the hint route, explanation or lines), wholly one-sided links, explanations invented to rescue an arbitrary word, a hint containing a target or contained in one, a plural of a target, more than one word. Metaphors are allowed, but text must not turn an association into a literal false fact.
- A hint that is a synonym of, or names one sense of, ONE target is NOT an automatic failure. Judge whether it honestly connects BOTH targets and whether it is useful and fun in context: BAND + WEDDING -> RING (a wedding band is a ring; a wedding ring), SOLITARY + PILOT -> SOLO, DRAWING + DOG -> DOODLE and COMPUTER + INSECT -> BUG are all fine. A mere rename with no credible second connection may be weak; decide case by case (BORDERLINE or FAIL only for the missing second connection, not for the synonym itself). The "synonym_of_target" flag is a note, not a verdict.
- BORDERLINE: it reaches both words but only after real effort, or one side is weak, or most players would not see it even after the explanation, or it is clearly worse than an obvious better hint and unremarkable.
- "Generic" alone is never a reason to reject. There is no quota either way. When you are genuinely unsure, say so in the reason and add the flag "uncertain" rather than forcing a verdict.

For every hint give: mechanism (the MAIN way it works: "phrase_join", "double_meaning", "shared_reference", "shared_property", "scene", "fact", "other"), connection_to_a 0/1/2, connection_to_b 0/1/2, fairness 0/1/2, delight 0/1/2 (0 flat, 1 pleasant, 2 a real "oh, nice" moment), recognizability broad/moderate/niche, better_hint (null or a one-word hint), flags from ["one_sided","generic","contains_target","obscure","needs_explanation","british_only","wrong_fact","synonym_of_target","dated","not_pg","phrase_join_weak","text_fix","better_hint_exists","uncertain"], verdict PASS / BORDERLINE / FAIL, a one-sentence reason naming the route used for each side, and fix: null, or ONE concrete corrected sentence if the text (explanation or a line) states something false or confusing (mark text_fix). Leave fix null when the problem is the idea itself. Then per pair: strong_hints (PASS hints, strongest first), pair_note.

If you need a helper script, create it only inside the folder C:\Users\leviw\AppData\Local\Temp\claude\C--Users-leviw-crystal-clues\180baece-9d2f-4022-a383-58f3561a9405\scratchpad\agents\<BATCH>-reviewer-<ID> (create it) and do not open any other folder in the scratchpad.

Write JSON to C:\Users\leviw\cluevoyance-unlimited\data\unlimited\library\reviews\<BATCH>-r<ID>-review.json with this shape:
{ "_metadata": { "reviewer": "<BATCH>-reviewer-<ID>", "model": "<exact model id>", "date": "<DATE>", "input": "<BATCH>-r<ID>-input.json", "rubric": "<BATCH> rubric (template 2026-10-20)", "independence": "<one sentence confirming you read only the input file>" }, "pairs": [ { "pair_id", "a", "b", "hints": [ { "text", "mechanism", "connection_to_a", "connection_to_b", "fairness", "delight", "recognizability", "better_hint", "flags": [], "verdict", "reason", "fix" } ], "strong_hints": [], "pair_note" } ] }

Reply with one concise summary: your model ID, PASS/BORDERLINE/FAIL counts, phrase_join count (and how many passed), your five favourite hints, and the judgement calls worth a second opinion.
