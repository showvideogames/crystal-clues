# Offline Cluevoyance reconciliation

OFFLINE ONLY. Not current-repository deduplicated, owner approved, cold-player tested, or integrated.

Snapshot: 2026-10-22T03:21:38.494856+00:00
8,632 base records; 8,626 canonical unique pairs; 6 overlap keys (3 identical hint, 3 competing hints).

## Counting and status rules
- Pair identity uses Unicode NFKC, uppercase, collapsed whitespace, and sorted targets. Hint identity uses NFKC/uppercase/whitespace only; punctuation is retained.
- Finalized cloud checkpoint is counted once, regardless of historical batch sizes. Active producer batches count only with exactly 200 structurally complete rows. Partial batches are not counted.
- Review copies, reservations, repairs and addenda add zero new pairs. Repairs retain their own provenance and verdicts; no best hint is selected by this report.
- Independent review matches candidate ID, canonical pair AND exact normalized hint. Source SHA-256 must also match when provided by the reviewer. Self-review remains separately recorded. No independent pass is transferred from old hint to repaired hint.
- Inventory and known-pair checks use saved noncurrent artifacts only. This is not a current-repository validation or full semantic rereview.
- Snapshot inputs and SHA-256 manifest are retained. Rerunning refresh.py creates another immutable run; latest-run.txt is only a pointer.

## Summary
```json
{
  "scope": "OFFLINE ONLY. Not current-repository deduplicated, owner approved, cold-player tested, or integrated.",
  "snapshot_utc": "2026-10-22T03:21:38.494856+00:00",
  "base_records": 8632,
  "canonical_unique_pairs": 8626,
  "duplicate_excess_records": 6,
  "overlap_pair_keys": 6,
  "identical_hint_overlap_keys": 3,
  "competing_hint_overlap_keys": 3,
  "base_records_by_source": {
    "cloud": 4632,
    "m-p": 1400,
    "q-s": 1400,
    "t-z": 1200
  },
  "base_records_with_independent_evidence": 8232,
  "base_records_without_independent_evidence": 400,
  "independent_verdict_counts_evidence_records": {
    "pass": 3070,
    "hold": 581,
    "reject": 201
  },
  "base_independent_verdict_evidence_counts_not_unique_pairs": {
    "PASS_EDITORIAL": 3599,
    "HOLD_COLD_TEST_OR_REWORK": 771,
    "REJECT_HINT_PAIR_OPEN": 262,
    "hold": 499,
    "pass": 2908,
    "reject": 195
  },
  "base_self_review_status_counts": {
    "SELF_REVIEWED_CANDIDATE": 4825,
    "HOLD_REWORK": 1064,
    "REJECTED_HINT_PAIR_OPEN": 143,
    "candidate": 1999,
    "reject": 125,
    "hold": 476
  },
  "cloud_effective_status_counts": {
    "CANDIDATE_FOR_PARENT_REVIEW": 3453,
    "HOLD_REWORK": 911,
    "REJECTED_HINT_PAIR_OPEN": 268
  },
  "reservation_records": 111,
  "reservation_unique_pairs": 111,
  "reservations_absent_from_base": [
    "PENCIL + WORK",
    "PLANE + PORT"
  ],
  "repair_provenance_records_not_new_pairs": 509,
  "repair_unique_pairs_not_new_pairs": 309,
  "saved_inventory_word_count": 1203,
  "sanity_issue_counts": {},
  "skipped_active_or_partial_files": [
    {
      "file": "cluevoyance-parallel/m-p/batch-08-reviewed.csv",
      "reason": "105 rows; requires 200"
    },
    {
      "file": "cluevoyance-parallel/q-s/batch-08.csv",
      "reason": "51 rows; requires 200"
    }
  ],
  "conservative_unique_dispositions": {
    "hold": 2070,
    "candidate": 6192,
    "reject": 364
  },
  "unique_disposition_policy": "Competing hints always held; identical hints require all source dispositions candidate for pick inclusion. Repair/annotation pairs are held for explicit amendment reconciliation; no repair supersedes a base hint automatically."
}
```

## Overlap keys
- MUSTARD + SAUSAGE: CONDIMENT (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); CONDIMENT (cluevoyance-parallel/m-p/batch-03-reviewed.csv)
- OCTOPUS + PLATE: SEAFOOD (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); CALAMARI (cluevoyance-parallel/m-p/batch-05-reviewed.csv)
- PASS + TEST: GRADE (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); EXAM (cluevoyance-parallel/m-p/batch-06-reviewed.csv)
- SALT + SEA: BRINE (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); BRINE (cluevoyance-parallel/q-s/batch-01.csv)
- UNIVERSE + WAVE: LIGHT (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); GRAVITY (cluevoyance-parallel/t-z/batch-03.csv)
- WHEEL + WING: AIRPLANE (cluevoyance-reconciliation/runs/20261022T032138.150456Z/cloud/ALL-REVIEWED-CANDIDATES.csv); AIRPLANE (cluevoyance-parallel/t-z/batch-05.csv)
