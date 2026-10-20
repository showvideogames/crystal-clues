# Cluevoyance Unlimited: PAUSED BY OWNER after X23

**Status: PAUSED BY OWNER (2026-10-20).** The owner said: "After this next batch let's put Claude on hold for Cluevoyance. Don't stop it, but once you reach a good stopping point." X23 was finished normally and this is that stopping point. Do not start X24 or make any further content (drafting or review) model calls until the owner or parent explicitly resumes the work.

## Exact checkpoint

- Worktree: `C:\Users\leviw\cluevoyance-unlimited` on DESKTOP-V3ONF8L
- Branch: `feature/unlimited-x04` (local only; nothing pushed, published or deployed)
- HEAD: the commit that adds this file, directly after `49d10e0` (X23 final checkpoint). Working tree clean at handoff.
- Commits since the X22 review checkpoint `f53cf60`:
  - `04ec2b5` X22 editorial cleanup (coordinator dispositions)
  - `811178e` X22 TREASURE (PIRATE + SILVER) silver-metal wording
  - `4e51046` 810-word working proposal saved with provenance (`data/unlimited/working-list/`)
  - `3e19449` X23 drafting checkpoint (237 unreviewed candidates)
  - `49d10e0` X23 final checkpoint (5 blind reviews merged, parent dispositions, text fixes)

## Counts at the pause

- Served export (`src/unlimited/random-library.json`): **4,638 pairs**, 4,651 served hint entries, 2,299 unique served spellings, 1,203 bank words. Content sha256 d6ab9753c910a2621e7800a107851ecb8deb5a4cf2c990b3ed28f2a3a02a7ad6. Rules: provisional 4,301, canonical 327, equal-tier 10.
- Library (`data/unlimited/library/pairs.json`): 4,957 pair records, 6,778 stored hint entries (ai_reviewed 5,137; human_approved 197; held 803; rejected 639; candidate 2, both from before X22).
- X22: 213 reviewed rows plus 5 coordinator selections; 210 pairs served; raw verdicts 204 PASS, 9 BORDERLINE, 0 FAIL.
- X23: 237 rows; 232 served, 5 held, 0 rejected; raw verdicts 233 PASS, 4 BORDERLINE, 0 FAIL. Export 4,406 -> 4,638. 7 model calls (2 drafting, 5 blind reviews), 0 duplicates, 0 recovery, no usage limit hit.
- 810-word working list coverage after X23: every word has at least 1 served pair (minimum 1, median 8); 58 words have 2 or fewer; 188 have 5 or fewer.

## Validation at the pause (all on 49d10e0)

- `node --test scripts/unlimited/*.test.mjs`: exit 0, 112/112 pass
- `npx vitest run`: exit 0, 11 files, 172 tests pass
- `node scripts/unlimited/check-random.mjs`: exit 0, 500/500 boards pass every check
- `npx eslint scripts/unlimited src/unlimited`: exit 0
- `npx eslint .`: exit 1 on the 4 existing errors in `src/App.jsx` (that file is unchanged since `87b3873`)

## Usage at the pause

Max plan, included usage only: 5-hour window 10%, weekly (all models) 90%, weekly Fable 100%; extra usage OFF throughout. Weekly reset 2026-10-22 12:00 UTC. No paid APIs, no credentials or security changes.

## Open items for the parent or owner (nothing pending in flight)

X23 held rows:

| Pair | Hint | Raw verdict | Why held |
|---|---|---|---|
| PHOENIX + PLOT | FAWKES | PASS | parent familiarity hold (repeats the earlier Fawkes concern); pair open for a better attempt |
| BATH + SCREW | ARCHIMEDES | PASS | parent familiarity hold (Archimedes screw); pair open |
| PILOT + SPIKE | SNOOPY | BORDERLINE | parent familiarity hold (Spike as Snoopy's brother); pair open |
| SUB + TUBE | PERISCOPE | BORDERLINE | **no disposition yet**; the reviewer suggests TORPEDO (torpedo tubes) |
| MEXICO + MOLE | SAUCE | BORDERLINE | **no disposition yet**; the reviewer found no better hint (GUACAMOLE contains the target) |

X22 held rows: SUNLIGHT (STONE + TROLL; BRIDGE serves), PARROT (PIRATE + SILVER; TREASURE serves), NOCTURNAL (KIWI + OWL), SKITTLES (BOWLING + TASTE), BOWLER (BOWLING + HAT), YORICK (FOOL + SKULL; BONEHEAD serves), JUMBO (CIRCUS + JET; DUMBO serves). CARD is an accepted alternate behind canonical FLASH (CAMERA + MEMORY).

Other open questions:
- BOWLER target-stem rule: BOWLER passes the code check but matches the drafting rule against another form of a target (like DIVING for SCUBA DIVER in X21). It stays held and the rule is unchanged.
- 1UP (x13, LIFE + VIDEO GAME) vs 1-UP spelling: not respelled.
- The 29 X23 served rows carrying reviewer flags are listed in `crystal-clues/unlimited-preview/x23/X23-FINAL-DECISIONS.md`. All five X23 reviewers were lenient (B and D passed every hint), so the parent's independent read was the main filter.
- Owner buffer: not touched or flushed. No owner-buffer choices were added.

## How to resume (only after an explicit resume)

1. Read-only first: confirm the branch, HEAD and a clean tree, and that no X24 files exist (`data/unlimited/expansion/x24`, `data/unlimited/library/batches/x24-batch.json`). Run `get_usage` and keep extra usage OFF.
2. Apply any parent decisions on the open items above as coordinator overrides, following `04ec2b5` and `49d10e0` (catalogue add / overrides.json / preferences.json / correct-text.mjs, then apply-overrides.mjs and export-random-library.mjs). Keep raw reviews and drafted text.
3. For X24, follow the X23 pipeline exactly:
   - word lists from the 810-word working list by served-pair count (`x23-words.cjs`)
   - copy `data/unlimited/expansion/x23/DRAFTING-BRIEF.md` and `scripts/unlimited/x23-build-batch.mjs`, changing x23 to x24
   - 2 background Opus drafters, each in its own scratch folder; never redispatch a running call
   - build, re-check every row with x14-check, send the early MD/CSV, commit the drafting checkpoint
   - `get_usage`, then review input, split into 5 parts, and 5 blind Opus reviewers with the brief template
   - merge, parent dispositions, clear accuracy fixes, test, tables, local commit, stop
4. The session scripts were in the scratchpad of session 1056bb3e: x22-cleanup.cjs, x22-table.cjs, x23-words.cjs, x23-verify.cjs, x23-early.cjs, x23-split.cjs, x23-fixes.cjs, x23-table.cjs. The scratchpad is temporary; the committed provenance above is the record.

Tables: `crystal-clues/unlimited-preview/x22/` and `crystal-clues/unlimited-preview/x23/` (X23-CANDIDATES-EARLY, X23-FINAL-DECISIONS, as MD and CSV).
