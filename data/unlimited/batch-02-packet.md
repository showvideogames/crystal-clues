# Cluevoyance Unlimited — content batch 02 packet (candidate, not released)

Written 2026-10-17 while the owner playtests beta-01. Branch `feature/unlimited-batch-02` from
released main 82babc0, local only. **The live pool (`src/unlimited/pool.json`) and
`boards/beta-01` are byte-identical to the release** (sha256 prefixes `a13d209d0640af9b` and
`6d7b29c0c65e518d`), player history keys are unchanged, nothing is pushed or deployed. No UI
change. No whole-board semantic check of any kind.

## 1. What was done

1. Coverage baseline from the live eight boards: 36 of 50 shortlist words are targets; 14 never
   are (STAR DRAGON ROBOT APPLE BEAR BELL CARD GLASS RING ROCK SHARK TRAIN WATER CASTLE), and
   those 14 had no library pair at all.
2. Authored batch `library/batches/u03-second-batch.json`: 28 new pairs covering every one of
   the 14 and several once-used words. Author kept 46 hints with full player text, recorded 5
   variants and rejected 72 with reasons. Raw file preserved as written.
3. Blind review `library/reviews/u03-blind-review.json` by a fresh subagent that saw only
   `u03-blind-input.json` (pair + 123 unlabeled hints, author labels sealed in
   `u03-blind-key.json`), under the owner's corrected rubric from the start. Raw file preserved.
4. Merge by verdict only (`merge-review.mjs`), owner override re-applied (FINGER stays held),
   readable packet `library/review-packet-u03-second-batch.md`.
5. Candidate boards `boards/beta-02/` assembled with the new `--exclude-boards` option: the 32
   pairs beta-01 serves are excluded, so these are new content, not reshuffles or rotations.
   Seed chosen by `pick-seed.mjs` (seed 1; seeds 1–30 all reach 8 boards under the 3-uses cap
   and all cover the same 14 words). Structural and judging checks: 8/8 pass
   (`boards/beta-02/check-output.txt`).

## 2. The 123 hints, reconciled

| Author label | Blind verdict | Final status | Count |
|---|---|---|---|
| retained (46) | PASS | ai_reviewed (playable) | 37 |
| retained | BORDERLINE | held | 9 |
| rejected (72) | FAIL | rejected | 53 |
| rejected | BORDERLINE | held | 15 |
| rejected | PASS | held: needs player text | 4 (ATM, BOXING, TONE, CLEAR for GLASS+ICE) |
| variant (5) | BORDERLINE | held | 4 (DESKTOP, CHINESE, IRON, BUCKET) |
| variant | PASS | held: needs player text | 1 (DEBIT) |
| **total** | 42 PASS / 28 BORDERLINE / 53 FAIL | 37 playable / 33 held / 53 rejected | **123** |

The five "passed but no text" hints are not served; text can be written for any the parent
wants (as was done for CREEPY, JERRY and MUFASA) without a new review. The reviewer itself
flagged TONE as a judgement call. Nothing carries `human_approved`.

Per-pair detail with every reason: `library/review-packet-u03-second-batch.md`. Pairs with no
passing hint: ROBOT+ROCK (METAL and DANCE borderline, both lean ROBOT). Pairs with one passing
hint: 16 (kept; there is no minimum). Reviewer judgement calls worth a second opinion: TONE
(bell/ring), MELT passing while BUCKET/OZ are borderline, DECK vs ALICE (card/queen), JAWS
borderline (ocean only a setting), VENOM borderline on the Komodo fact, ARCTIC passing at
a=1 as a variant of POLAR, CHURCH for bell/castle borderline, POOL flagged british_only.

## 3. Coverage

| Measure | Before (live beta-01) | After review (PASS-eligible pairs) | After candidate selection (beta-02) |
|---|---|---|---|
| shortlist words with a playable pair | 36 of 50 | 50 of 50 | — |
| shortlist words that are a target | 36 of 50 | — | 50 of 50 (live + beta-02) |
| newly covered | — | 14: all of STAR DRAGON ROBOT APPLE BEAR BELL CARD GLASS RING ROCK SHARK TRAIN WATER CASTLE | 14: the same 14 |

Library after the batch: 76 pairs (12 u01, 36 pilot, 28 u03), 65 with a playable hint, 122
playable hints. Of beta-02's 32 pairs, 26 are u03 pairs and 6 are previously reviewed library
pairs that beta-01 did not use. Full table: `library/coverage-after-u03.md`.

## 4. Candidate boards (beta-02, seed 1, cap 3, beta-01 pairs excluded)

| Board | Hints | Pairs |
|---|---|---|
| beta-02-001 | WARDROBE / CHESS / WEDDING / SKY | LION+WITCH, CASTLE+KING, BELL+RING, MOON+STAR |
| beta-02-002 | MELT / TOWER / CARIBBEAN / FROST | WATER+WITCH, BELL+CASTLE, OCEAN+PIRATE, GLASS+ICE |
| beta-02-003 | SCALES / LOAN / ELVIS / CLEAR | DRAGON+SNAKE, BANK+SHARK, KING+STAR, GLASS+WATER |
| beta-02-004 | OLYMPIC / ARTIFICIAL / FORGE / HEARTS | GOLD+RING, HEART+ROBOT, FIRE+IRON, CARD+QUEEN |
| beta-02-005 | WAR / SLAY / BLOOD / POLAR | HORSE+ROSE, DRAGON+KNIGHT, BANK+HEART, BEAR+ICE |
| beta-02-006 | SKIP / EVE / REEF / PRINCESS | ROCK+WATER, APPLE+SNAKE, OCEAN+SHARK, CASTLE+DRAGON |
| beta-02-007 | PAVLOV / COMPUTER / POOH / SONG | BELL+DOG, APPLE+MOUSE, BEAR+HONEY, BRIDGE+KEY |
| beta-02-008 | CUT / BURN / TRACK / CREDIT | DIAMOND+ROSE, FIRE+HEART, HORSE+TRAIN, BANK+CARD |

Checks on every board: four one-word hints distinct after normalisation and ≤ 20 characters;
28 distinct words; 4 distinct answer cards + 3 distinct extras; each hint differs from both of
its targets; the reveal snapshot matches the words facing each hint; `bestSubmit` accepts the
answer at all four rotations and refuses a turned card, an extra card and swapped cards; a
locked slot is never undone; the deal never starts solved at any difficulty over 25 seeds;
lives 3→2→1→0 and known-bad transitions. Zero pairs shared with beta-01. Ten were requested;
eight is what the pair supply allows under the caps without padding.

## 4b. Genuine owner playtest feedback (human; kept apart from every AI review)

Recorded in `playtest/owner-feedback.json`, exactly as relayed:

| At (UTC) | Puzzle | Difficulty | Outcome | Lives used | Note |
|---|---|---|---|---|---|
| 2026-10-17T21:23:53.635Z | beta-01-001 v1 | Hardcore | won | 0 | "Fun! It was basic, a little easy. But maybe that's to be expected." |

Nothing on the live board or in the rules changed from this one play. It did prompt
`library/editorial-tags.json`: an explicitly subjective easy / medium / challenging tag on each
retained hint beta-02 would use (no mechanic, no threshold, not used by any script), so that a
later mix can lean on clever, less immediate but still clean connections. By those tags beta-02
runs 13 easy, 16 medium, 3 challenging across its 32 hints (counted by script); each board
carries at least one medium or challenging hint. Hardcore keeps its meaning: three extra cards, never harder
clue content. Mix decisions wait for more plays.

## 5. For the parent to decide

- Whether beta-02 (or a subset) becomes the next release. Releasing it would mean appending
  these eight boards to the pool (ids `beta-02-001…008`, new indices 9–16) so beta-01 ids,
  versions and player history stay untouched; the lobby would read "0 of 16". Not done here.
- Whether to write player text for any of the five passed-without-text hints.
- The reviewer's judgement calls above, and the PG check on nothing in this batch (no alcohol,
  violence or adult references; SLAY is the fairy-tale sense).
