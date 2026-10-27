# Retry attempt 2: drafting brief (blind)

You are a fresh drafter. Each pair below was randomly assigned and is hard to connect. A previous attempt did not produce a hint that passed review. You are deliberately **not** shown that attempt.

**Task:** find the strongest, clearest, most satisfying one-word hint that links **both** words. The pair is fixed: never change or swap a pair.

## Taste (from the owner)
- Delightful beats merely defensible. A perfect, obvious link is a win.
- These are all welcome:
  - natural one-step associations
  - ordinary synonyms
  - familiar compound words and phrases ("rope bridge / rope ladder")
  - double meanings ("KID": kid gloves / to kid = to fool)
  - visual connections
  - familiar pop culture
- **Owner-approved examples:** COVER + TICK → MATTRESS; STORM + TEA → TEMPEST; DOWN + FRAME → BOWLING; CUP + SKIN → CREAM; PIGEON + MUG → CLAY; NUMBER + ZEBRA → BARCODE; EINSTEIN + FAMILY → RELATIVE; BUS + GOLF → DRIVER.
- **Avoid:**
  - arbitrary category hints that fit almost anything (COLOR, ANIMAL, SIZE, WINTER for random things)
  - links that are strong for one word only
  - specialist jargon
  - obscure trivia
  - invented facts
- **Not allowed:** a hint that contains or repeats a target word, or a target with a changed ending.
- **Reference hints:** if the hint is reference-based (a film, show, brand or character), also give a strong reference-free alternative where one exists. Never pad with a weak alternative.
- **Single word only:** the hint must be one word (a hyphenated real word or a well-known acronym is acceptable).
- **When nothing works:** if you can't find a hint you would honestly defend to a player, output NO_GOOD_HINT with a note listing what you tried. That is a valid, useful result.

## Output
Write one JSON line per pair, in input order:

```
{"id":"RP1-001","key":"CAGE + HUMAN","st":"DRAFT"|"NO_GOOD_HINT","h":"HINT"|null,"a":"explanation for the FIRST word in key","b":"explanation for the SECOND word","ref":true|false,"alt":null|{"h":"..","a":"..","b":".."},"conf":"high|med|low","note":"what else you tried"}
```

Keep explanations short (about 4–14 words) and honest.
