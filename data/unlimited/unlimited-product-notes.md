# Cluevoyance Unlimited — product notes

What the Unlimited mode is meant to do, written down so the data can be built ahead of the screens.
Nothing here is implemented yet. `App.jsx`, Supabase, the live site and deployment are all
untouched; this file is a specification, not a changelog.

---

## 1. "Why these clues worked" — the postgame reveal

### When it appears

After the player **completes a puzzle**, or when they **explicitly choose to reveal the
solution**. Never before. The whole point of a clue is the moment it clicks, and showing the
explanation early destroys it.

### What it shows

A quick overview, one entry per selected clue:

- the clue text
- its two target words
- the connection to word A
- the connection to word B
- a short, friendly combined explanation

The data behind it already exists on every clue record:

```json
{
  "rank": 1,
  "text": "MOON",
  "type": "compound_or_phrase",
  "explanation": "A honeymoon is the trip after the wedding and a moon shadow is the one the moon throws.",
  "wordAConnection": "A honeymoon is the trip after the wedding.",
  "wordBConnection": "A moon shadow is the one the moon throws.",
  "revealExplanation": "A honeymoon is the trip after the wedding and a moon shadow is the one the moon throws."
}
```

`explanation` is internal and is never shown to a player. The other three are player-facing.

### The shape for a reference clue

```json
{
  "clue": "BELLE",
  "wordA": "BELL",
  "wordB": "ROSE",
  "wordAConnection": "Belle is a homophone of bell.",
  "wordBConnection": "Belle's story features the enchanted rose.",
  "revealExplanation": "Belle sounds like \"bell\", and her story features the enchanted rose.",
  "reference": {
    "referenceType": "fictional_character",
    "source": "Beauty and the Beast",
    "recognizability": "broad"
  }
}
```

When `reference` is present the reveal should show the source — "Beauty and the Beast" — because
naming the work is most of the pleasure.

### Tone

Concise, friendly rather than academic, explicit about both sides, and never overexplaining an
obvious clue. If a clue is RIVER for BANK + BRIDGE, one line is enough.

---

## 2. Per-puzzle clue selection

Two rules govern which clues a generated puzzle may use.

1. **A clue may never equal either of its own two target words.** This is a property of the master
   data and is enforced by `validate-pilot.mjs`.
2. **Within one puzzle, the selected clue text must be unique across every clue position.** This
   is a property of the *selection*, not of the data, and is enforced at generation time.

Everything else is allowed on purpose:

- A clue may be identical to another word in the pool.
- A clue may be identical to a **different visible card word** in the same puzzle. This is
  intentional — it gives the player deduction to do, and sometimes misdirection.
  **Superseded for random Unlimited boards (owner, 2026-10-22; generator 3):** a displayed hint
  never equals any of the board's 28 words (8 targets, 20 decoys), compared with case and
  whitespace folded only. `src/unlimited/generate.js` resolves it at selection time (another
  equal-tier member, another pair combination, or the next decoy of the same seeded shuffle);
  the master data keeps such clues, and the Daily game is unchanged.
- The same clue text may appear in any number of pair records.

`HONEY + SHADOW → MOON` is the reference case: valid through *honeymoon* and *moon shadow*, and
still valid when MOON is sitting on the board as somebody else's card.

Cross-pair repetition is a **board-generation** problem, solved by picking a conflict-free
combination. It is never solved by deleting a good clue, and there is no global frequency ceiling
in the master data. `WATER` currently appears in seven pairs and that is fine.

The predicates live in `scripts/unlimited/puzzle-clue-rules.mjs`:

- `collidesWithOwnTargets(clueText, wordA, wordB)`
- `collidesWithOtherBoardWord()` — always false, stated positively so the intent survives
- `validatePuzzleClueSelection(selection)` → `{ ok, errors }`
- `clueTextFrequency(pairs)` — reported, never enforced

The board generator itself is **not** built yet.

---

## 3. Clue snapshotting

When a puzzle is generated, it must store its own copy of everything the reveal screen needs:

- selected clue ID
- clue text
- target pair
- `wordAConnection`
- `wordBConnection`
- `revealExplanation`
- reference metadata (or an explicit `null`)

**Why:** the master clue database will keep changing — clues get rewritten, reranked, removed. A
puzzle somebody completed last month must still explain itself the way it did on the day. Reading
the explanation live from the master data at reveal time would silently rewrite history, and in
the worst case would show an explanation for a clue that no longer exists.

The snapshot is written at generation time and never updated afterwards.

---

## 4. Clue quality rules that affect the product

- **References are a core method.** Not rare exceptions, not last resorts. A broad, delightful
  reference may outrank a dull literal clue. Full guidance is in `clue-generation-guide.md`.
- **A niche reference may ship as a lower-ranked alternative**, but never as one of a pair's two
  foundational clues. The validator warns when a `niche` clue is ranked 1 or 2.
- **Never manufacture a connection** to prop up a weak clue. If either side cannot be explained
  cleanly, the clue carries `needsHumanReview` with the reason and goes into the review queue.
- Pairs hold two to five clues, ranked strongest first. Padding a pair to five is a defect.

---

## 5. Human review

Edge cases are reviewed by a person, not signed off by the clue author. The queue is generated
into:

- `pilot-human-review.md` — readable and annotatable
- `pilot-human-review.csv` — spreadsheet form
- `pilot-human-review.html` — a standalone tool that opens by double-clicking, saves decisions in
  the browser and exports them back as JSON

Decisions are **KEEP**, **REJECT**, **LOWER** or **REWRITE**. A blank decision is not approval;
it means undecided.

---

## 6. Explicitly not built yet

- the Unlimited board generator
- the "Why these clues worked" screen in `App.jsx`
- the 50-word and 100-word datasets
- any Supabase schema for Unlimited

---

## 7. Word-bank source: a complete export is required first (recorded 2026-10-13)

The pilot's source list, `source-wordbank-visible-1000.json`, is the **first 1,000 words only**
(ACCESSORY..TRANSPORT). The admin loader was capped at the database's 1,000-row page and silently
dropped the rest; at the time of the check the live bank held 1,081 words (TRASH..ZOO were hidden)
and it is still growing. The loader is fixed in PR #22 (pages by `id`, never partial).

Before any further Unlimited work (the 50- and 100-word datasets, the board generator, pair
enumeration over the whole bank):

1. Take a **complete** export of the `wordbank` table, paged by `id` (or via the fixed loader), and
   record its row count and capture date.
2. Rebuild the source list from it and re-run the pair enumeration. The 20-word pilot was hand-selected
   from the 1,000-word file, so none of its words come from the hidden tail and the pilot data itself
   stays valid; what is incomplete is the pool any scaling would select from.
3. Do not treat the 1,000-word file as the bank.

No repeat-avoidance rule is part of this; that is a separate proposal.
