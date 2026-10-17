# Cluevoyance Unlimited — puzzle generation and quality-control plan

Audit date: 2026-10-15. Read-only: nothing in the game, the database, the word bank or
production was changed. The only files written are this report and
`wordbank-export-2026-10-15.json` (a complete, dated read of the live word bank).

Sections 1–6 are the deliverable you asked for. Section 7 is "what to do first". Section 8 holds
the technical detail for the next Claude session. Numbers labelled **measured** were read from the
live database or the files in this repository today. Anything labelled **assumption** is my
estimate and should be checked before money depends on it.

---

## 1. What we already have, and the most important gaps

### How a Cluevoyance puzzle actually works (from the code)

- A puzzle is **7 cards of 4 words each** (28 words). Four cards belong on the board, in a ring;
  three are extras. The player may see 0–3 of the extras depending on difficulty.
- There are **4 clues**, one per side of the ring. Each clue links exactly **two words**: the
  outward-facing word of each of the two cards on that side. So a puzzle has **8 "live" words**
  (two per answer card) and **20 decoy words** (the other two words on each answer card, plus the
  12 words on the extra cards). Because cards rotate, any word on an answer card can be turned to
  face any clue, so the "inner" words are decoys too.
- The player has **3 lives**. Each Submit judges all four slots: a right card in the right
  orientation turns green and locks; wrong ones turn red and cost a life. The game refuses to
  let a player resubmit a placement it has already marked wrong.
- Judging is exact: the stored answer card in the stored orientation. There is no notion of
  "an equally good alternative answer" in the code. Fairness therefore lives entirely in the
  content.

### What the difficulty settings change (measured, `src/game/shared.js`)

| Setting | What changes | What does not change |
|---|---|---|
| Easy | 4 cards, no extras | clues, words, lives (always 3) |
| Standard | 4 cards + 1 extra card | same |
| Expert | 4 cards + 2 extras | same |
| Hardcore | 4 cards + 3 extras | same |

Every stored puzzle carries exactly 3 extras; difficulty only decides how many are dealt. So
today "difficulty" is a **rule** knob (more decoy cards), never a **content** knob.

### How puzzles are made today

- **Daily**: the `/admin` page (open to anyone during the beta) deals 7 random cards from the
  word bank (a fair shuffle; every word equally likely, no word twice in a deal), then a person
  writes 4 clues for whichever edge pairs they can connect, and publishes it to a date.
  Measured: 65 puzzles, all published, dates 2026-04-08 to 2026-10-14, all stored as
  "standard", 48 authored by Sam West, 7 by Deb, 3 credited to "ChatGPT 🤖".
- **Friends**: the same deal-then-write flow on a simplified creator; the server validates the
  structure (4 clues, 7 complete cards, 20-character clue limit, 18-character word limit) and
  judges every guess server-side. That server validator is reusable for Unlimited.
- The word bank (measured today): **1,196 words**, no duplicates, lengths 3–12, seven entries
  with spaces (ICE CREAM, LOCH NESS, NEW YORK, SCUBA DIVER, VIDEO GAME, STAR WARS, NEW YEAR).
  It is still growing: 1,080 on Oct 4, 1,132 on Oct 13, 1,196 today.

### Word-bank verification (the old 1,000-row bug)

- The paged loader in `src/game/wordBank.js` reads by id until an empty page and refuses to
  return a partial bank; it is unit-tested, and the Oct 13 live check saw all 1,132 words through
  the real client path. Nothing in the current code caps at 1,000 any more.
- Today I read the table directly through the Supabase CLI's read-only query path (the route
  recorded in the project notes) rather than through the browser. Count 1,196, 1,196 distinct ids,
  1,196 distinct spellings when uppercased and trimmed, ids 1568–2781 (gaps mean words were deleted
  over time). The export is saved as `data/unlimited/wordbank-export-2026-10-15.json`.
- The pilot's input file `source-wordbank-visible-1000.json` is still the truncated list. The
  20 pilot words all sit inside it, so the pilot data is fine, but **nothing new should select
  from that file**. Re-export before every generation run; the bank changes weekly.
- One more measured fact worth knowing: the 65 daily puzzles contain 1,820 card words, 880
  distinct; 70 of those words are not in the bank at all (typed by hand in the editor). The daily
  flow does not require bank words, so the bank is a convenience, not the vocabulary.

### What exists for Unlimited (all local, untracked, nothing deployed)

| Piece | Status |
|---|---|
| Product notes (postgame "why these clues worked" reveal, clue snapshotting, review rules) | written, not built |
| Clue-writing guide (five brainstorming passes, references as a core method, asymmetry defect) | written; good |
| 20-word pilot: 190 pairs, 570 clues, 376 distinct clue texts | built; passes its structural validator; 34 tests pass |
| Author self-audit, independent re-score, "small repair" | done; the key measured finding: self-approved clues passed an independent reviewer **73.6%** of the time vs **86.6%** for clues scored by someone else |
| Human-review queue (228 clues, CSV + HTML) | generated; the CSV has **0 of 228 decisions** filled in. The HTML tool stores decisions only in the browser it was opened in, so if you did mark things there I cannot see it |
| Scripts: collision rules, pair enumerator, dataset builder, structural validator, review-CSV builder | working |
| Board generator, decoy selection, ambiguity check, Unlimited screens, reveal screen, database tables, player history, serving/repeat logic, reporting, metrics | **not started** |

### The most important gaps

1. **The pilot clued the wrong unit of work.** It wrote clues for *every pair* of 20 words
   (190 pairs). A real puzzle needs only 4 good pairs plus 20 decoys. Clueing all pairs forces
   work on pairs that have no natural link (HONEY + SHADOW, CROWN + ENGINE) and those are
   exactly the ones that came out weak. Scaling that method to 50 words means 1,225 pairs,
   most of them unnecessary. The fix is cheap: keep the data format, change the goal from
   "every pair" to "a library of good pairs".
2. **Nothing checks a whole board.** All existing quality work is per clue, in isolation. The
   fairness problems players will actually hit are board-level: a decoy word that fits a clue as
   well as the intended word, or a target word that fits the neighbouring clue too. No existing
   check looks at the 20 decoys at all.
3. **No real-game check exists.** The judging code (`bestSubmit`) lives inside `App.jsx`, so no
   script can currently prove "this stored board is winnable as stored" without a browser.
4. **The 20-word pilot cannot fill one board.** A board needs 28 distinct words; the pilot has
   20. Decoys must come from the wider bank, which means decoy selection is part of generation,
   not an afterthought.
5. **Self-approval was measured at 13 points optimistic.** Any plan where the writer also approves
   is known not to work here.
6. **No player history anywhere for Unlimited**, so repeat avoidance has nothing to read.
7. **Play data is tiny**: 27 recorded plays on the server, 26 of them wins, almost all by two
   people on Hardcore. Nothing can be learned from it yet about difficulty or fairness.

---

## 2. Recommended generation and approval process (plain English)

### The recommendation in one paragraph

Generate puzzles **ahead of time into a checked pool**, in batches of about 50. Use a model for
the two things only a reader can do (propose clues for word pairs; estimate how strongly a clue
pulls toward every word on a board), use plain code for everything that is a rule (structure,
collisions, decoy selection, repeat avoidance, winnability), and use **people** for the one
thing neither can do: play the puzzle and say whether it felt fair. Keep the existing pilot
data as the first entries in a "pair library" and stop writing clues for every pair.

Why a pool and not on-demand: a puzzle must be playable the instant a paying player taps "Next";
a model call plus checks takes seconds and sometimes fails; a bad puzzle must be retirable before
anyone else sees it; and reviewing a batch is far cheaper in your time than reviewing a trickle.
On-demand generation only makes sense once the pool is draining faster than batches refill it,
and the cost figures below show that is unlikely at beta scale.

### The pipeline, stage by stage

| Stage | Who does it | What it does | Why |
|---|---|---|---|
| A. Word pool | code + you | Filter the bank (single common words first; flag proper nouns, spaced entries, very long words), then you approve a pool of ~150 words for the pilot | Familiar words are the single biggest fairness lever |
| B. Pair clues | model, then code | For each pool word, ask for its best partners *from the pool* with 1–2 clues each (word-first, not all-pairs). Code applies the existing collision rules and format checks | Produces only pairs that have a real link; reuses `puzzle-clue-rules.mjs` and the schema |
| C. Independent score | a second model prompt (or second model) with a different rubric | Scores each clue on both sides separately, flags one-sidedness, obscurity, "explanation does the work" | Known to be optimistic; its job is to cut the obvious failures cheaply, not to approve |
| D. Board assembly | code only | Pick 4 pairs with 8 distinct words and 4 distinct clue texts; fill the 8 inner slots and 3 extra cards with decoys from the pool; produce the exact JSON shape the game already stores | Deterministic, testable, reusable |
| E. Board ambiguity audit | model | For each clue, rate how well it fits *all 28 words* on the board. A puzzle fails if a decoy fits a clue nearly as well as a target, or a target fits a neighbouring clue better than its own | This is the fairness check that does not exist today |
| F. Real-game check | code | Run the stored answer through the actual judging logic and the server validator; a headless browser solves one board per batch end-to-end | Proves "winnable as stored", catches orientation and extra-card mistakes |
| G. Human play | you + 2–3 testers | Play the batch at Standard; after each one answer two taps: "fair?" and "which clue was weakest?" | The only evidence that matters |
| H. Publish to pool | code | Store the board plus a frozen snapshot of each clue's explanation (the notes' snapshotting rule) with status `approved` | Later edits to the library never rewrite a puzzle someone played |

### Reasons to reject, revise or hold

- **Reject** (never serve): a clue equals one of its own two target words; two clue positions share
  a clue text; a decoy fits a clue at least as well as a target; a clue needs an explanation to
  work at all; a reference marked niche is one of the two words' only route; content you would
  not put in front of a stranger (see the daily puzzles' `9/11` and `EPSTEIN ISLAND` clues: those
  are fine for family play, and a decision for a paid product).
- **Revise** (fix one thing, re-run checks): one weak clue in an otherwise good board (swap the
  pair); a decoy that is a near-synonym of a target (swap the decoy); a clue that is fair but
  British/American-only (swap the clue text).
- **Hold** (keep, do not serve yet): the ambiguity audit and a human disagree; a board uses a
  word already heavy in the pool; a batch's playtest sample has not been played.

### What should be code and what genuinely needs judgement

- **Code**: format, collisions, distinctness, decoy selection, board assembly, winnability,
  repeat avoidance, pool stocking, retirement, reports, metrics. All of it already has a shape
  in the repository (shared.js, the Friends validator, the pilot scripts).
- **Model**: proposing clues; scoring clue strength per side; the board-level fit matrix.
- **Human**: the word pool; playing a sample of each batch; ruling on held boards; the
  content/tone bar.

Do not use a model's approval of its own output, or two models agreeing, as the pass. Section 8
describes how to measure the checks themselves against known-good and deliberately broken boards.

---

## 3. Good versus problematic puzzles and clues, with examples

### What makes a Cluevoyance clue good (derived from the mechanics)

A clue is a single word that must pull toward **two** specific words at once, while 20 other
words on the board try to catch it. The pleasure is the click when one idea reaches both words.
So a good clue is:

- **Two-sided**: it reaches both target words by itself. "SANDBOX: CRAB + SHOVEL" (daily, Oct 14)
  reaches both; "PIG: BANK + IRON" (pilot; piggy bank, pig iron) is the model case.
- **One idea, not two facts**: "BULB: LIGHT + SPRING" is one word with two meanings;
  "CAR: ENGINE + MIRROR" is two things that happen to be on a car.
- **Reachable before the reveal**: "GROUNDHOG: SHADOW + SPRING" needs only the famous custom;
  "PISTON: CROWN + ENGINE" needs a mechanic's vocabulary.
- **Decoy-safe on its board**: the clue must fit its two targets clearly better than any of the
  other 26 words sitting there.

### Confusing in a good way vs unfair

The corner rule is what makes the game deduce rather than guess: each answer card must satisfy
**two** clues at once (its top and its left, say), so a word that fits one clue beautifully but
leaves the neighbouring clue unmatched is a legitimate red herring. Example from the Oct 7 daily:
clue BLACK links MARBLE + NIGHT, and SHADOW sits on an answer card as an inner word. Turning
SHADOW to face BLACK is tempting, but then that card's other edge no longer matches HUNTING. That
is confusing in a good way: the board itself tells you it is wrong.

It becomes unfair when the decoy satisfies **both** of its clues, or when a decoy is on an extra
card (which has no second clue to contradict it) and fits as well as the target. Example from the
Oct 14 daily: clue AQUARIUM links OCTOPUS + PRISON. GLASS and MONSTER are decoys on the same
board; a player who reads AQUARIUM as "a glass box" has a perfectly reasonable alternative, and
the only way to find out is to spend a life. (My judgement, not a measurement.)

### The right standard for "one right answer"

The code requires one exact answer. The content standard should **not** be mathematical
uniqueness, which no semantic puzzle can prove. It should be **clear dominance with a margin**:
for every clue, both targets fit obviously; every decoy fits noticeably less; and every target
fits its own clue better than the neighbouring one. The lives and per-slot feedback are the
tolerance for the rest: one near-miss costs a life and teaches; two unresolvable readings make
the puzzle a coin flip, and that is the thing to reject.

### Examples (real unless marked illustrative; verdicts are my judgement)

| Clue → pair | Source | Verdict | Why |
|---|---|---|---|
| TOOTHPICK → OLIVE + SWORD | daily Oct 4 | good | one object, two instantly recognisable uses |
| GODMOTHER → FAIRY + PATRON | daily Oct 4 | good | one word, two senses, both common |
| FRAME → PICTURE + CASE | daily Oct 5 | good | "picture frame" and "framed for a crime" |
| DRONE → ENGINE + HONEY | pilot | good | a drone bee and the drone of an engine |
| STEAM → ENGINE + IRON | pilot | good | steam engine, steam iron |
| AQUARIUM → OCTOPUS + PRISON | daily Oct 14 | problematic | PRISON is a stretch; GLASS on the same board fits as well |
| COCKPIT → PLANE + INSIDE | daily Oct 6 | weak | INSIDE is generic; it fits a dozen clues |
| GREEN → TENNIS + CATERPILLAR | daily Oct 6 | risky | colour clues fit many words; GREEN is already the most repeated daily clue (3 uses) |
| SHANTI → IRELAND + OCTOPUS | daily Sep 30 | unfair for strangers | only makes sense if you know the author's reference |
| JERUSALEM → MASS + BASE | daily Oct 10 | obscure | neither side is a common association |
| PISTON → CROWN + ENGINE | pilot | reject | specialist vocabulary on the CROWN side |
| GOLD → HONEY + anything | pilot (purged) | reject | "both are yellowish" is padding, not a link |
| REFLECT → MIRROR + LIGHT | pilot | giveaway | half-defines MIRROR; one slot comes free |
| SPY → HONEY + SHADOW | pilot | one-sided | reaches SHADOW directly, HONEY only via "honeytrap" |
| VANITY → MIRROR + ROSE | pilot (removed) | reject | the explanation places a rose on a table; no connection |
| STABLE and GATE → HORSE + KEY | pilot (fixed) | duplicate | same proverb twice; text-level checks miss this |
| CABINET → KEY + SHADOW | pilot | cultural assumption | "shadow cabinet" is British political vocabulary |
| *illustrative*: clue RIVER with targets BANK + BRIDGE and decoy STREAM on an extra card | — | reject at board level | the clue is fine; the board is not |

Patterns to catch automatically where possible: colour/material/mood words; a clue that is a
near-synonym of a target; the same clue text on two sides; reference clues ranked 1 or 2 while
marked niche; the same clue appearing in many library pairs (WATER is in 7, RIVER/RING/COIL in 5).

---

## 4. Difficulty

- **Harder rules** (what exists): more extra cards. Keep this exactly as it is for Unlimited; the
  four names are already understood by players and the Friends flow.
- **Harder content** (what does not exist): how direct the clues are, how tight the decoys are,
  how much lateral thinking is needed. Make this a **puzzle property** computed at generation time,
  with three tiers: Gentle (direct associations, loose decoys), Standard (one wordplay or reference
  clue, one tight decoy), Tricky (two lateral-but-fair clues, several near-miss decoys).
- "Hard" must never mean obscure or ambiguous. The reject rules apply at every tier; Tricky is
  allowed more *distance* (a pun, a well-known reference, a second meaning), not more *doubt*.
- Offer predictability by **letting the player choose the tier** or by a fixed mix (for example 3
  Gentle : 5 Standard : 2 Tricky per ten). Start with the fixed mix in the pilot, measure solve
  rates per tier, and only expose the choice if the tiers separate cleanly in the data.
- Labelling tier from clue type alone will be wrong sometimes. Treat the label as a starting
  guess and let play data (lives used at Standard) correct it.

---

## 5. Keeping Unlimited from feeling repetitive

### What the game does today

Daily deals are uniformly random from the whole bank (measured: fair shuffle, 28 distinct words
per deal). There is no repeat avoidance of any kind, by design, because one puzzle a day from
1,196 words barely overlaps. An Unlimited player playing ten a day would feel repeats fast, and
uniform randomness makes it worse: random draws repeat sooner than people expect.

### Recommended rules (served from the pool, per player)

1. Never serve a puzzle this player has played or abandoned (puzzle id history).
2. Do not serve a puzzle that shares a **clued pair** with any of the player's last 30.
3. Do not serve a puzzle that shares a **clue text** with any of the last 20.
4. Do not serve a puzzle with a **target word** seen as a target in the last 10.
5. Prefer the puzzle the player is least likely to have seen anything from (score the candidates
   by overlap with recent history and pick among the lowest, at random).
6. At the pool level: cap how often a word is a target (for example at most 1 in 15 puzzles) and
   how often a clue text appears (at most 1 in 25), so familiar words stay familiar without
   becoming the whole game.

When the pool gets small for a player, relax in order: rule 4, then 3, then 2, and tell nobody.
When even rule 1 cannot be met (they have played everything approved), show "You've played every
puzzle so far. New ones arrive every week" and offer replays of their oldest with a label. That
is also the signal that the pool is too small for current demand.

### What history to store

- **Guest**: a list of played puzzle ids with finish state, in `localStorage`, exactly as the
  daily game stores completions; the last 30 puzzles' pairs/clues/targets can be derived
  from the ids at serve time, so only ids need storing.
- **Signed-in**: a server table (one row per account per Unlimited puzzle: started, finished,
  lives, difficulty, tier, timestamps), modelled on the existing `plays` table and the Friends
  guess log so cross-device play works. Guest history imports on sign-in the same way the daily
  "Add my progress" already does.

---

## 6. Pilot plan with budget and success criteria

### Pilot 0 (no new generation at all): prove the machinery

Build 10 boards from the **existing 570 pilot clues** (4 pairs from the 190, decoys from the real
bank), run them through assembly, the ambiguity audit, the real-game check and a playtest by you.
Cost: a handful of model calls for the audit (under a dollar at list prices). Purpose: find out
whether board assembly and decoy choice work before paying for more clues.

### Pilot 1: the first real batch

| Item | Proposal |
|---|---|
| Word pool | 150 words you approve from a code-made shortlist of the 1,196 |
| Generation target | ~400 approved pairs → 60 assembled boards → 40 approved after checks |
| Difficulty mix | 12 Gentle, 20 Standard, 8 Tricky (by label) |
| Human review | you play all 40 at Standard (about 2–3 hours over a week); 2–3 friends play 15 each; everyone answers "fair?" and "weakest clue?" after each |
| Model budget (assumption) | under $40 at Opus 5.5 list prices, under $20 at Sonnet 5.5 or with the Batch API (50% off). Detail in section 8. This is an estimate from token counts, not a measurement: the earlier 20-word pilot was written inside Claude Code sessions and has no API cost record |
| Time budget | one Claude session to build the tools (section 8), one to run and review the batch |

### Go / no-go criteria

- At least 70% of assembled boards survive the automatic and model checks (if far fewer, the
  pair library or the decoy rules are wrong, not the players).
- Of the 40 played boards, at least 80% are rated "fair" by the testers, and no more than 2
  are rated unfair by two different people.
- Solve rate at Standard between 60% and 90% across testers; lives used spread across 0/1/2,
  not all 0 (too easy) or all X (too hard).
- No target word appears more than twice as a target across the 40; no clue text more than once.
- The model ambiguity audit flags at least 9 of 10 deliberately broken boards and fewer than 3 of
  10 boards the testers called fair (section 8 has the method). If it cannot, it is not a check
  and human review has to carry more.

If pilot 1 passes, the next batch is 100 boards with the same process and a 300-board pool before
Unlimited is sold. If it fails on fairness, see section 7, "what would change the recommendation".

---

## 7. What to do first, what can wait, what would change the recommendation

### First (in order)

1. **Decide the eight questions in section 9.** Three of them (reveal screen, content bar, who
   reviews) change what gets built.
2. **Approve a 150-word pool** from a shortlist (the next session can produce the shortlist in
   minutes from today's export; your part is a yes/no pass through a list).
3. **Pilot 0** with existing clues: assembly, ambiguity audit, real-game check, and you playing 10.
4. **Pilot 1** as above.

### Can wait

- Database tables, the Unlimited screens, the reveal screen, payment gating: build after pilot 1
  says the content is good. A pool of JSON files is enough to playtest.
- The 50-word and 100-word all-pairs datasets: **drop them**. The pair library grows by good
  pairs, not by word count squared.
- The 228-clue human-review queue: do not work through it clue by clue. Review boards instead;
  it is faster and it is the thing players see. The queue's clues get judged when they appear
  on a board.

### What would make me change the recommendation

- Testers find fewer than 60% of boards fair: switch to **human-authored clues with model
  assistance** (the model proposes, you choose, exactly like the daily flow), and accept a slower
  pool.
- The ambiguity audit cannot tell broken boards from good ones: drop it, keep the structural
  checks, and rely on playtests plus player reports.
- Demand outruns batches (players burning through 50-board batches in days): add on-demand
  generation with the same checks, queued in the background, never in the request path.
- You cannot give ~3 hours per batch: shrink batches to 20 and recruit two regular testers.

---

## 8. Technical detail for the implementing session

### 8.1 Facts the next session must not rediscover

- Live word bank 2026-10-15: 1,196 rows, export in `data/unlimited/wordbank-export-2026-10-15.json`.
  Read path that worked today (read-only): from a checkout that has `supabase/.temp/linked-project.json`
  for ref `qszqparrqyhegfznyaby`:
  `env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked --project-ref qszqparrqyhegfznyaby --output-format json --file <sql>`.
  The shell's `SUPABASE_ACCESS_TOKEN` only sees the Rainbow project; unsetting it lets the CLI
  use its own login. `tools/hosted.mjs export` is the other read-only path but needs a valid
  personal token. Production reads need the owner's go-ahead each time.
- Puzzle JSON shape (what the game stores and plays): `{ clues:[4], cards:{id:{id,words:[4]}},
  solution:{ slotCards:[4 ids TL,TR,BR,BL], orientations:[4], extraCards:[3 ids] } }`. Visual
  word at edge e for orientation o is `words[(e - o + 4) % 4]` (`vw` in shared.js). Clue i links
  `[slot,edge]` pairs `[[0,0],[1,0]], [[1,1],[2,1]], [[3,2],[2,2]], [[0,3],[3,3]]` (FriendCreator.jsx).
- Judging: `bestSubmit` in `src/App.jsx` (exact card+orientation per slot, accounts for whole-board
  rotation). It is not exported. First refactor: move `bestSubmit`, `biasedShuffle` and
  `isClueRotation` into `src/game/shared.js` (pure, no React) so scripts can call the real logic.
  That is the one game-code change this plan needs, and it changes no behaviour.
- Server validator worth copying for the offline checker: `friend_validate_board` in
  `supabase/migrations/20260926090000_friend_puzzles.sql` (4 clues ≤ 20 chars, cards complete,
  words ≤ 18 chars, orientations 0–3, distinct card ids).
- Existing reusable scripts: `scripts/unlimited/puzzle-clue-rules.mjs` (selection predicates),
  `validate-pilot.mjs` (schema + structure), `build-pilot.mjs` (batches → dataset),
  `pair-enumerate.mjs` (pair maths), `pilot.test.mjs` (34 tests, passing today).
- Pilot clue data: `data/unlimited/pilot-pair-clues-20.json` (190 pairs, 570 clues). Treat it as
  the seed of the pair library; its strongest 25 and weakest 25 are listed in
  `pilot-independent-review.md` sections 6–7 and make a ready-made calibration set.
- The human-review HTML keeps decisions in `localStorage` under its own key; if the owner used it,
  export from that browser before assuming the queue is unreviewed.

### 8.2 Ordered implementation plan

1. **Refactor for testability** (small PR, behaviour-neutral): export `bestSubmit`,
   `biasedShuffle`, `isClueRotation` from `src/game/shared.js`; add unit tests that replay the
   tutorial puzzle and one real daily puzzle through them.
2. **Word-pool tool** `scripts/unlimited/pool-shortlist.mjs`: reads the dated export; filters out
   spaced entries and length > 10; flags proper nouns and "common vs rare" with a word-frequency
   list or one model pass (the bank is all caps, so capitalisation heuristics are useless);
   writes a CSV the owner marks yes/no; builds `pool-150.json` from the yeses.
3. **Pair library v2**: keep `pair-clue-schema.json`, add per-clue `status`
   (`candidate|scored|approved|rejected|held`), `source` (`pilot|model:<id>|human`), `scores`
   (per-side 0–2, obscurity, explanation-dependence, verdict, reviewer id) and `tier`. Write a
   migration script that imports the 570 pilot clues as `approved` with their independent-review
   verdicts attached.
4. **Candidate generation** `scripts/unlimited/generate-pairs.mjs`: word-first. One request per
   pool word: "given this word and this pool, list up to 10 partners with 1–2 clues each that
   reach both words directly", using the clue-writing guide as the system prompt, structured
   output matching the clue schema, Batch API for the 50% discount, resumable by word with a
   state file so a failed batch re-runs only its failures. Structural checks reuse the rules
   module immediately on ingest.
5. **Independent scorer** `scripts/unlimited/score-clues.mjs`: a different prompt and rubric from
   the generator (score each side separately, then fairness, obscurity, explanation-dependence),
   never shown the generator's explanation first. Calibrate before trusting: run it on the
   independent review's 25 strongest, 25 weakest and 6 FAILs plus 30 synthetic breaks (clue
   replaced by a target word; clue replaced by a colour; two clues swapped between pairs) and
   report precision/recall against those labels. Target: catches ≥ 90% of synthetic breaks and
   ≥ 80% of the 25 weakest, passes ≥ 90% of the 25 strongest. Record the calibration result in
   the batch log every time the prompt or model changes.
6. **Board assembler** `scripts/unlimited/assemble-boards.mjs` (pure code): choose 4 approved pairs
   with 8 distinct words and 4 distinct clue texts, respecting pool-level frequency caps; place
   them in the ring; fill the 8 inner slots and 12 extra-card words with decoys drawn from the
   pool minus the 8 targets, with a deterministic "not too close" rule (no decoy equal to a clue
   text; no decoy that is an approved partner of a target under the same clue in the library);
   random orientations; emit the game's puzzle JSON plus the explanation snapshot. Use a seeded
   random generator and log the seed with each board.
7. **Board ambiguity audit** `scripts/unlimited/audit-boards.mjs` (model): one request per board
   returning a 4×28 fit matrix (0–3) with a one-line reason for every score ≥ 2 on a non-target.
   Fail rules: any non-target scoring ≥ the lower of the two targets on its clue; any target
   scoring higher on a neighbouring clue than its own. Calibrate with 10 deliberately broken boards
   (decoy replaced by a near-synonym of a target; clue swapped onto the wrong side) and 10
   assembled boards the owner rated fair.
8. **Real-game check** `scripts/unlimited/check-boards.mjs`: run the server-validator rules in
   JS, then `bestSubmit` on the stored answer at all four board rotations, then `biasedShuffle`
   a few times to make sure the start position never equals the answer. Add one Puppeteer
   smoke test per batch using the helpers in `tests/friends/board.mjs` to drag and submit the
   solution through the real UI (sandbox mode).
9. **Playtest kit**: a local-only route (feature flag) that plays boards from a JSON file in
   sandbox mode and shows two buttons after each: "Fair / Not fair" and a clue picker for
   "weakest clue", writing answers to a local JSON. No production change.
10. **Batch runner** `scripts/unlimited/run-batch.mjs`: stages 2–8 as resumable steps with a
    per-batch log (`data/unlimited/batches-out/<date>/log.md`: counts in, counts out per stage,
    rejection reasons, calibration numbers, cost from the API usage fields).
11. **After pilot 1 passes**: database migration (`unlimited_puzzles` with status
    `approved|held|retired`, the frozen snapshot JSON, tier; `unlimited_plays` per account;
    `unlimited_reports`), a serving function that applies section 5's rules server-side, the
    Unlimited screens, the reveal screen, and the report button. Model every row rule on the
    Friends migration (immutable sent rows, RPC-only writes, `cluevoyance_uid()`).

### 8.3 Operations

- **Stocking**: pool target = the heaviest plausible player's 30-day consumption, not a global
  number, because every player sees each puzzle once. Start at 300 approved before charging;
  refill in batches of 50 whenever approved-and-unseen-by-the-median-player drops under 100.
- **Failed generation**: every stage writes its outputs and a status file; re-running a batch skips
  completed items; a stage that fails leaves the pool untouched (same rule as the word-bank
  loader: never a partial result). A batch that cannot reach 30 approved boards is reported, not
  padded.
- **Player reports**: a "Something wrong with this puzzle" button at the end (and on give-up)
  with a clue picker and three reasons (two answers fit / clue made no sense / offensive). One
  owner-confirmed report or two independent reports moves the puzzle to `held`; held puzzles
  are not served to new players.
- **Retiring without breaking a game in progress**: serve by copying the frozen snapshot into the
  player's attempt (as Friends does with sent puzzles), judge against the attempt's copy, and
  never delete a puzzle row (the daily "unused" pattern; plays reference it). Status changes only
  affect who gets it next.
- **Learning**: a weekly list of the 10 worst and 10 best puzzles by lives used, abandonment and
  reports, with their clue types and tiers. Feed confirmed patterns back into the generator
  prompt and the scorer calibration set. Keep a running "fair?" rate per batch so a drift in
  quality shows up batch by batch.

### 8.4 Measures and their limits

| Measure | What it tells you | What it does not |
|---|---|---|
| Completion rate per puzzle | whether people finish | why they did not (bored, stuck, interrupted) |
| Abandonment (started, progress saved, never finished) | friction | needs ≥ 20 plays per puzzle to mean anything |
| Lives used distribution at Standard | difficulty as experienced | low solve rate alone cannot separate "hard" from "unfair"; pair it with fairness votes |
| Per-slot wrong guesses (the game already records which slot was wrong on each guess) | which clue or decoy costs lives | which of the two words on that side was the problem; the report picker covers that |
| Repeated wrong placements (the knownBad set) | players flailing | whether the clue or the decoys caused it |
| Fairness votes and reports | the only direct fairness signal | small, self-selected, and your family knows the author's mind |
| Repeat exposure (target words / clue texts seen per player per week) | whether the pool feels fresh | whether players noticed |
| Time to solve | engagement and tier calibration | interruptions on phones make it noisy |

Current sample sizes are tiny (27 server plays, mostly two people on Hardcore); no conclusion
about difficulty or fairness can be drawn from them yet.

### 8.5 Cost evidence

**Measured**: none for generation. The 20-word pilot was authored inside Claude Code sessions, so
no per-token cost exists for it. Hosting (Vercel, Supabase, WorkOS) plans and limits were not
inspected; they are not in the repository.

**Official pricing** (platform.claude.com/docs/en/about-claude/pricing, read 2026-10-15; per
million tokens; Batch API is 50% off both sides):

| Model | Input | Output | Batch input | Batch output |
|---|---|---|---|---|
| Claude Opus 5.5 | $4 | $20 | $2 | $10 |
| Claude Sonnet 5.5 | $2 | $10 | $1 | $5 |
| Claude Haiku 5.5 (prompts ≤ 100k) | $0.10 | $0.50 | $0.05 | $0.25 |

**Assumption** (token counts are guesses to be replaced by the usage fields of the first real run):

| Pilot 1 stage | Requests | Tokens in / out (approx.) | Opus 5.5 list | Opus 5.5 batch |
|---|---|---|---|---|
| Pair generation, 150 words | 150 | 2k / 3k each → 0.3M / 0.45M | ~$10 | ~$5 |
| Scoring ~1,000 candidate clues | 1,000 | 1.5k / 0.3k → 1.5M / 0.3M | ~$12 | ~$6 |
| Board audit, 60 boards + 20 calibration | 80 | 2.5k / 1.5k → 0.2M / 0.12M | ~$3 | ~$2 |
| Retries and calibration reruns (×1.5) | | | ~$38 total | ~$20 total |

So the model spend for a 40-board batch is tens of dollars, and under $1 per approved puzzle;
your review time, not tokens, is the scarce input. A 300-board pool is roughly 8 such batches.
The unknown that matters for monetisation is not generation cost but **how many puzzles a paying
player consumes per month**, which only the pilot's testers can hint at.

---

## 9. Decisions I need from you

1. **Same board rules for Unlimited?** (3 lives; Easy–Hardcore = extra cards.) I recommend yes.
2. **Is the postgame "why these clues worked" reveal part of v1?** It needs player-ready text per
   clue, which the generator must produce and the reviewer must read. I recommend yes, one line
   per clue, because it turns a lost life into a laugh.
3. **Content bar.** The daily puzzles include `9/11` and `EPSTEIN ISLAND` as clues. Fine for a
   family beta; decide the bar for paying strangers, and whether references should lean US,
   UK or neutral.
4. **Who plays the pilot batches**, and how many hours a week you can give to playing boards. The
   whole plan is sized around ~3 hours per 40-board batch.
5. **The 228-clue review queue**: did you mark decisions in the HTML tool? If not, I recommend
   retiring the queue in favour of board-level review.
6. **Word pool**: will you approve a 150-word shortlist (my recommendation), or should the
   session pick it alone?
7. **Guest access to Unlimited** (a free taste of N puzzles, or sign-in only). This decides whether
   guest history must be stored and imported.
8. **Pool size before charging**: 300 approved boards is my proposal; it sets the number of
   batches and review hours before launch.

---

## 10. Checkpoint

- Repository state: unchanged apart from this file and the word-bank export, both in the
  untracked `data/unlimited/` folder. No commits, no pushes, no database or production changes,
  no model-generation calls were made.
- The only external call made today was a read of the official pricing page.
- Everything in section 8.1 was verified against the live database or the files on disk today.
