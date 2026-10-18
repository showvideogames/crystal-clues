# Reconciliation root cause and omission report (2026-10-18)

## Root cause

scripts/unlimited/reconcile-preferences.mjs chose its evidence as finalBestAvailable || correctionBestAvailable || reviewerBestAvailable. finalBestAvailable is not reviewer evidence: reconcile-best-available.mjs (run after u08) wrote it as whatever hintChoices would serve, which is the provisional numeric tie-break. On every pair that script touched, the derived value (CAMP, VAMPIRE and so on) shadowed the saved reviewer pick (SMOKEY, DRACULA and so on), so those pairs looked already reconciled and no canonical entry was written.

## Fix (narrow)

- Evidence is now correctionBestAvailable || reviewerBestAvailable only. Approved entries (owner, parent, earlier reconciliation) are still never rewritten; held or rejected hints are still never promoted.
- reconcile() is exported as a pure function; scripts/unlimited/reconcile.test.mjs adds 7 regression tests: CAMP must not mask SMOKEY, VAMPIRE must not mask DRACULA, approved-override precedence, a held pick is reported and not promoted, correction evidence first, a lower-scored pick is kept as a labelled override, idempotence.
- finalBestAvailable recomputed from the corrected preferences on all 1,225 pairs (it had last been computed after u08); no other library field changed.

## Masked eligible reviewer picks found and recorded (15; matches the independent enumeration exactly)

- p_apple__bell: TEACHER over SCHOOL (TEACHER 2/1/1, SCHOOL 1/2/2, labelled override)
- p_apple__heart: RED over CORE (RED 2/2/2, CORE 2/2/2, tie)
- p_apple__honey: SWEET over CRISP (SWEET 1/2/1, CRISP 2/2/2, labelled override)
- p_apple__moon: NEWTON over HARVEST (NEWTON 2/1/1, HARVEST 2/2/2, labelled override)
- p_apple__rose: BLOSSOM over RED (BLOSSOM 2/2/2, RED 2/2/2, tie)
- p_apple__witch: POISON over SNOW (POISON 2/2/2, SNOW 2/2/2, tie)
- p_bank__bridge: RIVER over CANAL (RIVER 2/2/2, CANAL 2/2/2, tie)
- p_bank__fire: SAFE over BREAK (SAFE 2/2/2, BREAK 2/2/2, tie)
- p_bank__salt: DEPOSIT over WORTH (DEPOSIT 2/2/2, WORTH 2/2/2, tie)
- p_bat__castle: DRACULA over VAMPIRE (DRACULA 2/2/2, VAMPIRE 2/2/2, tie); parent-confirmed, reviews/u06-blind-review.json (blind-subagent-6, claude-fable-5-1)
- p_bat__night: NOCTURNAL over DARK (NOCTURNAL 2/2/2, DARK 2/2/2, tie)
- p_bat__wolf: VAMPIRE over FANGS (VAMPIRE 2/2/2, FANGS 2/2/2, tie)
- p_bear__cat: CLAWS over PAWS (CLAWS 2/2/2, PAWS 2/2/2, tie)
- p_bear__fire: SMOKEY over CAMP (SMOKEY 2/2/2, CAMP 2/2/2, tie); parent-confirmed, reviews/u07-blind-review.json (blind-subagent-7, claude-fable-5-1)
- p_bear__lion: OZ over ZOO (OZ 2/2/2, ZOO 2/2/2, tie)

Only beta-03-005 and beta-03-011 used any of these pairs; no live board did.

## Reviewer picks deliberately not recorded (5)

- p_apple__fish (APPLE+FISH): reviewer best_available PIE is held while SAUCE passed; left provisional (SAUCE). why: Compound on both sides; fish pie is the only recognizability risk.
- p_apple__light (APPLE+LIGHT): reviewer best_available NEWTON is held while GREEN passed; left provisional (GREEN). why: Only hint; a knowledgeable player gets both, a casual one gets only APPLE.
- p_apple__rock (APPLE+ROCK): reviewer best_available CORE is held while CANDY passed; left provisional (CANDY). why: Certain for APPLE and defensible for ROCK; HARD does not reach APPLE at all.
- p_night__star (NIGHT+STAR): reviewer best_available VANGOGH is held while SKY/GAZING passed; left provisional (SKY). why: A single famous work titled with both ideas.
- p_pirate__shadow (PIRATE+SHADOW): reviewer best_available PETERPAN is held while PETER passed; left provisional (PETER). why: Full name makes the shared story unmistakable.

Each is a pick the reviewer named that is held (by override or as BORDERLINE) while another hint passed; promoting it would bypass eligibility. PIE (APPLE+FISH) is held by an earlier parent override; NEWTON (APPLE+LIGHT) and CORE (APPLE+ROCK) are BORDERLINE; VANGOGH and PETERPAN are run-together names kept held and ineligible. A dry run of the corrected reconciliation reports 0 further additions.
