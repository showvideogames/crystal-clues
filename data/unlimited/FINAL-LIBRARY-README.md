# Cluevoyance Unlimited: full 1,225-pair library (final)

Local only. Nothing pushed, merged, exported or deployed; the live site still serves the same 16 boards. Paid extras were off throughout.

## Counts

| | Count |
|---|---|
| Words | 50 |
| Unordered pairs | 1225 (all reviewed: 1225) |
| Pairs with a playable hint | 981 |
| Held-only pairs (best available kept, not served) | 185 |
| Rejected-only pairs | 59 |
| Hints, total | 2960 |
| Hints, playable | 1633 |
| Hints, held | 692 |
| Hints, rejected | 635 |
| Approved preferred choices | 150 (reviewer-basis 146, parent/owner editorial 4; labelled overrides of a higher score 8) |
| Proposed preferences not applied | 12 |

## Provenance

- u01-u26 (and the 2026-10-17 pilot re-review): authored and blind-reviewed by claude-fable-5-1. u26 was recovered from a complete review file written before a 429 on the reviewer's final reply.
- u27-u32: authored by the main session on claude-opus-5-5; each blind reviewer dispatched with model=opus and echoed claude-opus-5-5, verified before merge.
- Every hint carries provenance.blindReview (or correctionReview for the 3 u04 correction-only hints) with its model. Parent/owner text corrections carry provenance.textCorrection; calibrations carry provenance.calibration; human decisions live in overrides.json.

## Corrections 2026-10-18 (parent review of the beta-03 clues)

Root cause, fix, regression tests and the 15 masked reviewer picks: library/reconciliation-root-cause.md. Parent texts for ECLIPSE (MOON+SHADOW) and GARDEN (ROSE+SNAKE) carry provenance.textCorrection.

## Files

- library/pairs.json, manifest-1225.json, preferences.json, overrides.json, model-boundary.json, preference-reconciliation.md, completeness-audit.txt, script-tests.txt
- library/batches: every authored and batch file; library/reviews: every sealed blind input, key and raw review; library/checkpoints and review packets per batch
- boards/beta-01, beta-02 (prior 16, unchanged) and boards/beta-03 (local candidate pack: boards.json, check-output.txt, candidate-tables.md, pool-candidate-simulated.json)
- scripts/unlimited: the full pipeline and its tests
