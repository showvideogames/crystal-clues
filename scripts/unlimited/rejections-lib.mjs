// Owner rejections and holds for specific pair + hint combinations
// (data/unlimited/library/rejections.json). An entry may name a pair that is
// not in the library yet, so a drafter, the catalogue or a re-review cannot
// bring the combination back by itself:
//   - apply-overrides.mjs sets a matching library hint to "rejected" / "held";
//   - catalogue.mjs add and prepare-expansion.mjs refuse a matching hint;
//   - export-random-library.mjs refuses to export one as a served choice.
// Lifting an entry is a person's decision: edit the file with the owner.
import { readFileSync, existsSync } from "node:fs";
import { pairOf, normWord } from "./catalogue-lib.mjs";

export const REJECTIONS = "data/unlimited/library/rejections.json";
export const DECISIONS = new Set(["rejected", "held"]);

export function loadRejections(path = REJECTIONS) {
  if (!existsSync(path)) return [];
  const entries = JSON.parse(readFileSync(path, "utf8")).entries || [];
  for (const e of entries) {
    if (!DECISIONS.has(e.decision)) throw new Error(`${path}: ${e.a} + ${e.b} ${e.hint}: decision must be rejected or held`);
    if (pairOf(e.a, e.b).id !== e.pair_id) throw new Error(`${path}: ${e.a} + ${e.b}: pair_id should be ${pairOf(e.a, e.b).id}`);
    if (!e.reason) throw new Error(`${path}: ${e.pair_id} ${e.hint}: a reason is required`);
  }
  return entries;
}

/** The recorded decision for this pair (either word order) and hint, or null. */
export function rejectionFor(entries, x, y, hint) {
  const { id } = pairOf(x, y);
  const t = normWord(hint);
  return entries.find((e) => e.pair_id === id && normWord(e.hint) === t) || null;
}
