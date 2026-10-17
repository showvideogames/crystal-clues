# Cluevoyance Unlimited — guest beta notes (2026-10-17)

What the first guest beta is, what it is not, and the small-pool rules it runs under.
Owner decisions recorded here override the 2026-10-15 plan where they differ.

## Scope (owner-approved)

- Same board rules as the daily game: 7 cards, 4 clues, 3 lives; Easy / Standard / Expert /
  Hardcore = 0–3 extra cards dealt. Judged in the browser with the game's own `bestSubmit`.
- Guest access at `/unlimited`, no account, no payment gate, no homepage link. History and
  feedback live in this browser only (`localStorage`), and the screen says so.
- Postgame **"Why these clues worked"**: one entry per clue with the pair and the two sides,
  plus per-clue feedback buttons and a free-text note. Feedback can be copied or downloaded.
- **No whole-board semantic review.** The owner's words: "I don't think we need to pay
  attention to the other words on the board at all … Don't have two of the same hint."
  The only cross-clue rule is four distinct hint texts per puzzle (uppercase, trimmed,
  inner spaces collapsed). Unintended associations are assessed through playtest feedback.
- Pair hints: about three strong one-word hints per pair is a soft goal, never a quota or cap.
  A pair with one strong hint is kept, never padded. Superficial variants are recorded, not
  served twice.

## Statuses (kept distinct; scripts never set human_approved)

| Status | Meaning |
|---|---|
| `candidate` | authored, not yet blind-reviewed |
| `ai_reviewed` | passed a fresh blind review (pair + hint only, no author text); playable in the beta |
| `held` | borderline, or passed but lacks player-facing text, or flagged by the pilot author |
| `rejected` | failed the blind review; kept for the record |
| `human_approved` | a person's decision; nothing in this beta carries it |

Historical scores from the 2026-10 independent pilot review are **provenance only**. Every
hint served in the beta went through a new blind review in this session (`library/reviews/`).

## Small-beta repetition limits

Fifty words cannot support the 2026-10-15 plan's large-pool targets (a word as a target in at
most 1 in 15 puzzles, a hint text in at most 1 in 25). With 10 boards × 8 target words over 50
words the average word is a target 1.6 times. The rules actually applied:

- per batch (assembler): a clued pair at most once; a hint text at most once; a word as a
  target at most 3 times (`--max-target`); 28 distinct words on every board;
- what that produced on 2026-10-17: the library had 39 playable pairs (12 newly authored and
  blind-reviewed, 36 pilot pairs re-reviewed blind; 48 pairs in all). With the 3-uses cap the
  assembler reaches **8 boards** (seed 6; a 30-seed sweep found no seed giving more), because
  the pilot pairs concentrate on 18 words. Raising the cap to 4 only added one board, so the
  cap stays at 3. Two more boards need roughly six more reviewed pairs on the under-used new
  words (ROBOT, TRAIN, APPLE, STAR, DRAGON, CASTLE, ROCK, SHARK, BEAR, BELL, GLASS, RING,
  WATER, LION): a reviewer decision, not taken here;
- per player (app): a puzzle is served once; boards are served in batch order so testers can
  compare "puzzle 3" with each other; a game in progress is resumed, not re-dealt;
- when every board has been played: the lobby says so ("You've played all N beta puzzles on
  this device"), offers a labelled **Replay** of any puzzle (recorded as a replay, never
  counted twice), and keeps Copy / Download for feedback. That message is also the signal that
  the pool is too small for the testers' appetite.

## Not in this beta

Accounts, server history, cross-device sync, a database table, payment, homepage promotion,
on-demand generation, and any board-level semantic audit (removed by owner decision).
