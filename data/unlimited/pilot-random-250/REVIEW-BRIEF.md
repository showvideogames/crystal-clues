# Independent review brief: random-pair pilot (RP1)

You are the independent reviewer. You did not draft these hints. Judge every drafted row honestly.

## The game
Cluevoyance boards show word cards. A one-word **hint** must link **both** target words of a pair. Players see only the hint; after solving, a reveal shows a one-line explanation for each word.

## Owner taste (calibration)
- The goal is **delightful** connections, not merely defensible ones. A perfect, obvious hint is a win; do not penalise it for being easy.
- Natural one-step associations, ordinary synonyms, familiar phrases and compounds, visual connections, double meanings and familiar pop culture are welcome. Literal textbook definitions are not required.
- Fail anything **flimsy**: an arbitrary link that could fit almost anything ("SIZE", "ANIMAL", "COLOR" for random items), invented facts, obscure trivia, specialist jargon when a familiar hint exists, or a link that only works for one word.
- Unfamiliar does not mean bad. Owner-approved examples: COVER + TICK → MATTRESS; STORM + TEA → TEMPEST; DOWN + FRAME → BOWLING; JACK + STADIUM → GIANTS; CLEAN + VOLCANO → STEAM; CUP + SKIN → CREAM; PIGEON + MUG → CLAY; FOX + ORDER → CHICKEN; NUMBER + ZEBRA → BARCODE; EINSTEIN + FAMILY → RELATIVE; BUS + GOLF → DRIVER.
- **Owner fails:** obscure adaptation trivia (SPEAKER + SWORD → EXCALIBUR via an anime), legend details players won't link, and factual errors.
- The hint must not repeat a target word, contain one, or be a target with a changed ending (MEMORY → MEMORIAL fails).
- **Reference-based hints** (film, TV, brand, character, book) should come with a strong **reference-free alternative** where one exists. Do not demand a weak alternative just to fill the slot.
- The pairs were drawn at random. **Never** suggest replacing a pair. Judge only the two target words, not other board words.

## For each row output one JSON line

```
{"id":"RP1-001","verdict":"PASS|FIX|FAIL|RESCUE","hint":"<final primary>","a":"<final wordA explanation>","b":"<final wordB explanation>","alt":null | {"h":"..","a":"..","b":".."},"factual_check":"ok|uncertain: ...","reason":"<one short sentence>"}
```

**Verdicts:**
- **PASS:** the drafted hint and explanations are good as written. Copy them through unchanged.
- **FIX:** the hint is good, but an explanation or alternative needs a correction, a clearer wording, or removal. Give the corrected text.
- **FAIL:** the hint is flimsy, wrong or unfamiliar, and you have no clearly better hint. The pair goes to the retry queue. Set hint to null.
- **RESCUE:** the drafter's hint fails or is missing (NO_GOOD_HINT), but you found a hint you would PASS yourself. Give it with both explanations. Use it only for clearly strong hints.

**Rules for the text:**
- Keep explanations short (about 4–14 words), honest and specific to the word.
- If a claim is a fact you are not sure of, say "uncertain" in `factual_check`. Do not guess.
- Do not invent facts.

Write only the JSONL lines to the output file named in your task, one per input row, in input order. Do not write anywhere else.
