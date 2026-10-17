# Cluevoyance Unlimited — exhaustive 1,225-pair plan (prepared 2026-10-17, not started)

## Authoritative direction (owner, relayed by the parent 2026-10-17)

> "the thing is, we HAVE to force bad hints. That's like the whole point of the game. Eventually we
> will have pairs for ever word. After this batch, I'd actually make all 1,225 of them. It will be
> even more since we often have more than 1 hint for a word"

Objective recorded: after the current batch (beta-02, still held), cover **all 1,225 unordered
pairs** of the approved 50-word shortlist, reusing the existing 76 pairs' work with no duplicate
calls. Three strong one-word hints per pair is a soft goal; more strong or fewer is fine. Awkward
pairs get the **best available** connection rather than being skipped, labelled honestly as a
stretch; nothing is ever marked PASS to fill a gap. The independent quality verdict and a
`bestAvailableCandidate` are kept apart from PASS-only playable eligibility; weak new hints are
never published automatically. Canonical clear-best wins; no whole-board semantic gate; PG, US,
familiar pop culture; paid extras OFF (included session and subagent capacity only).

## Current counts (manifest-1225.json, generated from the library; nothing changed)

| Count | Value |
|---|---|
| pairs in the manifest | 1,225 (50 × 49 / 2) |
| authored (library record exists) | 76 (12 u01 + 36 pilot + 28 u03) |
| blind-reviewed | 76 (all authored pairs) |
| playable (≥ 1 PASS hint with player text) | 65 |
| held-only (reviewed, no playable, a bestAvailableCandidate exists) | 11 |
| rejected-only (needs repair) | 0 |
| candidate (authored, not yet reviewed) | 0 |
| holes (no record; need authoring) | **1,149** |
| under generation hold | 1 (DIAMOND+SNAKE; playable, live snapshot untouched) |
| served on live or pending boards | 64 pairs |
| hints | 319 total: 126 playable, 101 held, 92 rejected |

The 11 held-only pairs and their best available hint: BANK+HORSE STABLE, BANK+IRON BAR,
BANK+KEY VAULT, BRIDGE+HONEY TOOTH, CROWN+HONEY QUEEN, CROWN+LIGHT LIBERTY, DIAMOND+GHOST CURSE,
GHOST+LIGHT FLICKER, ROBOT+ROCK METAL (all BORDERLINE), plus two PASS hints held for other reasons:
FISH+GOLD FINGER (owner hold) and HONEY+SPRING POLLEN (pilot author flag, awaiting a person).

## Pipeline per batch (the same pipeline already used for u01–u03; no new tooling needed)

1. **Author** (this session, included): batch file `library/batches/uNN-*.json` for the 40 holes
   the manifest assigns to `uNN` (`plannedBatch`, fixed and resumable). Every pair gets the five
   brainstorming passes; kept hints carry full player text; rejected hints carry reasons; an
   awkward pair's best attempt is marked `"stretch": true` with the reason, never dressed up.
2. **Blind input** (`blind-input.mjs`): pair + all hints, unlabeled; author labels sealed in the key.
3. **Independent blind review** (one subagent per batch, included): corrected rubric, per-side
   scores, verdict, reason. Raw file preserved.
4. **Merge** (`merge-review.mjs`): status from the verdict only; **apply-overrides**; the packet
   (`review-packet.mjs --source uNN`); **manifest** regenerated (`manifest-1225.mjs`).
5. **Checkpoint** (per batch, written to `library/checkpoints/uNN.md`): counts before/after
   (authored / reviewed / playable / held-only / rejected-only / holes), hints PASS / BORDERLINE /
   FAIL, pairs with no PASS, the subagent token usage reported by the task notification, main
   session usage note, elapsed time, and anything needing the parent.

Batching: 1,149 holes → **29 batches of 40** (u04…u32, the last one 29 pairs), assigned in
pair-id order so every batch is a fixed, resumable unit. Each batch spans many words (the
manifest shows 42–48 holes per word, spread evenly).

## Bounded repair pass (holes that stay weak)

After every **4 batches**, one repair batch: for each pair that is held-only or rejected-only,
author at most **two** new attempts (best available, labelled stretch where that is the truth),
blind-review them once, merge. After that single repair, the pair is **closed**: it keeps its
`bestAvailableCandidate` (strongest non-playable hint, with the reviewer's reason) and no further
retries are made unless the owner or parent asks. Publishing a bestAvailable hint is always an
explicit human decision (a `human_approved` status set by a person, or an approved override), never
automatic.

## Usage estimate (from the batches already run; included allowance, no paid calls)

| Measured so far | |
|---|---|
| blind review u01 (82 hints) | 104k subagent tokens, +122k for the v2 re-review |
| blind review u02 (114 hints) | 123k subagent tokens |
| blind review u03 (123 hints) | 94k subagent tokens |
| authoring per 28 pairs (u03) | about one main-session turn of ~25k output tokens plus merge/packet work |

Projection for 1,149 holes at ~4.4 hints per pair (u03's ratio): about 5,000 hints to review,
≈ 29 review subagents at ~100–150k tokens each → **≈ 3–4.5M subagent tokens**; authoring and
bookkeeping in the main session ≈ 29 × ~40k → **≈ 1.2M**. Repair passes add roughly 15%. Wall
time ≈ 25–35 minutes per batch including the review. Checkpoints make it safe to stop after any
batch and resume from the manifest.

## Board assembly afterwards (unchanged rules)

Boards keep being assembled from playable hints only, with the approved canonical preference,
the four-distinct-hints rule, 28 distinct words, structural and judging checks, and no
whole-board semantic gate. "Forced bad hints" is served by having every pair available: a pair
whose only honest hint is a stretch becomes playable only when a person approves that hint.

## Not done here

No authoring or review call was made. Live boards, hints, snapshots, history and the batch-02
hold are untouched. Execution starts when the parent directs, after the current release finishes.
