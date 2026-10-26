# Random-pair pilot RP1 (250 pairs): results

**Status: pilot only.** Nothing has been imported into normal Unlimited or published, and the owner has not approved any of it. The beta playtest is on branch `feature/unlimited-random-pilot-beta`. It is not pushed or merged.

## 1. Sourcing

| Step | Detail |
|---|---|
| Word list | The 810-word working list (`inputs/pilot-working-810-words.json`, sha256 `0dae5832…`). It is the same list as `origin/main`. |
| Universe | 327,645 unordered pairs. **Claude partition** (SHA-256(pair_key) odd, per `partition-rule.json`): 164,051. |
| Exclusions | 50,897 keys. Sources: the handoff `canonical-exclusions.json` (50,890), the served and master catalogue at 020008d, the codex 26 Oct pass (2,907), pending editorial work, PR32, calibration, Claude's review-500, the 10-22 candidates, and 3 stray local keys. Excluded in the Claude partition: 10,756. Available: 153,295. |
| Selection | seed `cluevoyance-claude-random-pilot-250-001-2026-10-26`. The 250 pairs with the lowest SHA-256(seed\|pair_key) were taken. There was **no** filtering by difficulty, coverage or hint. |
| Result | 377 distinct words; no word appears more than 3 times; no same-root pairs. See `assignment.json` (it also holds the next cursor rank). |

The handoff was reconciled first:
- The 473-entry release candidate still has 0 overlaps with the served catalogue (11,212) and the master catalogue (11,531) at 020008d, and with the pending, PR32 and calibration lists. All 500 review-500 keys are already in the canonical exclusions.
- A scan of every local Cluevoyance worktree found 17,796 pair keys. Only 3 were missing from the canonical exclusions, and those 3 were added for this draw.

## 2. Hints

| Stage | Result |
|---|---|
| Attempt 1: Claude drafts, 10 checkpoints of 25 (`draft/cp-01…10`) | 193 drafted; 57 marked NO_GOOD_HINT (not forced) |
| Independent review of attempt 1: 4 separate reviewer agents (`review/cp-*.review.jsonl`) | PASS 156 · FIX 10 · RESCUE 7 · FAIL 77 |
| Attempt 2: blind fresh drafter on the 77 failures (`retry1/draft-a2-*`) | 57 drafted, 20 NO_GOOD_HINT |
| Independent review of attempt 2 (`retry1/review-a2-*`) | PASS 31 · FIX 2 · RESCUE 1 · FAIL 43 |
| Coordinator override (`coordinator-overrides.json`) | 1: TEA + VIDEO GAME served HIGH instead of STEAM, because STEAM contains the letters TEA |
| **Reviewed and playable** | **207 / 250 (82.8%)**: 173 from attempt 1, 34 from attempt 2 |
| **Unresolved: hard-pair list** | **43**, each with both attempts preserved (`retry-queue.json`) |

**Files:**
- `pilot-results.json` keeps, for every pair: the original draft, every review, each attempt and the final text.
- `beta-input.json` holds only the reviewed, playable clues.

**Reference hints:** 19 of the 207 primaries are reference-based. 7 have a strong reference-free alternative. 12 have none, because none strong was found and none was forced: TIN, SURFER, LANDING, OCTOPUS, OLIVE, BOTTOM, IRON, GOLDEN, BBC, STERLING, STRONG, DEAD. Several of those are generic on one side and reference-based only on the other.

**Repeated hint words** across different pairs: HEAD ×3, plus 18 hint words used twice. Every beta board still has four distinct hints.

## 3. The 43 unresolved pairs (kept, never swapped)

| | | | |
|---|---|---|---|
| CAGE + HUMAN | CLOTHING + PICKLE | CAMEL + EASTER | SHAKESPEARE + SUNDAY |
| BOXER + FRANCE | JAR + LINK | BACK + ISLAND | SALSA + WAND |
| CHAIR + DESERT | BELT + PYRAMID | CACTUS + VOICE | OIL + SHELF |
| FAMILY + TROLL | BAND + VACUUM | CHIMNEY + TURN | EGYPT + TURTLE |
| SANTA + SHAKESPEARE | BRUSH + PLANET | ANGEL + CASE | MINE + SATURN |
| SPICE + SUBWAY | DESSERT + PURSE | DEGREE + GUM | TITANIC + YARN |
| HONEY + MUSHROOM | CAMERA + MOTHER | DRUM + MARVEL | FILM + PURSE |
| CAVE + TRIANGLE | BATH + LADDER | ITALY + MAPLE | TEMPLE + WITCH |
| HOLLYWOOD + PORT | DOOR + PENCIL | HEEL + SALT | SNOWMAN + SQUIRREL |
| MIRROR + SQUIRREL | KIWI + TANK | FROST + THANKSGIVING | CAMOUFLAGE + THREAD |
| BONE + DRESS | GENIUS + SKATE | PIPE + SHOW | |

## 4. Reproduce

```
node scripts/assign-pairs.cjs <handoffDir> .          # rebuilds assignment.json (same seed → same 250)
node scripts/merge-pilot.cjs .                        # rebuilds pilot-results / retry-queue / beta-input
# beta branch:  npm run pilot-beta:build -- --input <path>/beta-input.json
```
