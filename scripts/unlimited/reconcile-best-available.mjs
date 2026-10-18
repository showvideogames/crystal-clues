#!/usr/bin/env node
// Bookkeeping pass over the library (no review, no status change):
//  • finalBestAvailable on every pair = what would actually be served if the
//    pair were used now: the preference-driven choice (canonical / equal set /
//    stable provisional top candidate, the same rule the assembler uses) when a
//    playable hint exists; otherwise the latest reviewer's best-available pick
//    among the pair's non-playable hints. Stale per-review picks never drive
//    assembly (the assembler calls hintChoices, never these fields).
//  • reviewerBestAvailable keeps the ORIGINAL blind reviewer's pick; a
//    correction review's pick (made over a subset of hints) moves to
//    correctionBestAvailable instead of overwriting it.
//   node scripts/unlimited/reconcile-best-available.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { hintChoices } from "./assemble-boards.mjs";
const LIB = "data/unlimited/library/pairs.json";
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const prefs = existsSync("data/unlimited/library/preferences.json") ? JSON.parse(readFileSync("data/unlimited/library/preferences.json", "utf8")).pairs : {};
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
// Original blind picks per batch review file (source → file).
const reviewFiles = { "u01-first-sample": "u01-blind-review-v2.json", "pilot-2026-10": "u02-pilot-blind-review-v2.json", "u03-second-batch": "u03-blind-review.json", u04: "u04-blind-review.json", u05: "u05-blind-review.json", u06: "u06-blind-review.json", u07: "u07-blind-review.json", u08: "u08-blind-review.json" };
const corrections = { u04: "u04-correction-review.json" };
const loaded = {};
const pick = (file) => { if (!file) return null; if (!loaded[file]) { const p = `data/unlimited/library/reviews/${file}`; loaded[file] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { pairs: [] }; } return loaded[file]; };
let restored = 0, finals = 0;
for (const p of lib.pairs) {
  const orig = pick(reviewFiles[p.source])?.pairs.find((x) => x.pair_id === p.pair_id);
  const corr = pick(corrections[p.source])?.pairs.find((x) => x.pair_id === p.pair_id);
  if (orig?.best_available?.text) {
    if (!p.reviewerBestAvailable || p.reviewerBestAvailable.correction) { p.reviewerBestAvailable = { text: orig.best_available.text, why: orig.best_available.why || null, reviewer: pick(reviewFiles[p.source])._metadata?.reviewer || "blind-subagent" }; restored++; }
  }
  if (corr?.best_available?.text) p.correctionBestAvailable = { text: corr.best_available.text, why: corr.best_available.why || null, reviewer: pick(corrections[p.source])._metadata?.reviewer || "correction-subagent", note: "chosen over the corrected subset of hints only" };
  const playable = p.clues.filter((c) => PLAYABLE.has(c.status));
  if (playable.length) {
    const ch = hintChoices(p, playable, prefs);
    p.finalBestAvailable = { text: ch.hints[0]?.text || null, basis: ch.rule, provisional: !!ch.provisional, alternatives: playable.filter((c) => c !== ch.hints[0]).map((c) => c.text) };
  } else {
    const candidates = p.clues.filter((c) => c.status === "held");
    const named = [p.correctionBestAvailable?.text, p.reviewerBestAvailable?.text].find((t) => t && p.clues.some((c) => c.text === t));
    const strength = (c) => { const b = c.provenance?.correctionReview || c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };
    const best = named ? p.clues.find((c) => c.text === named) : candidates.sort((x, y) => strength(y) - strength(x))[0] || null;
    p.finalBestAvailable = best ? { text: best.text, basis: "reviewer-best-available (not playable)", status: best.status, stretch: !!best.stretch } : { text: null, basis: "no hint" };
  }
  finals++;
}
lib._metadata.bestAvailable = "finalBestAvailable = the hint that would be served now (preference rule over playable hints) or the reviewer's best non-playable hint; reviewerBestAvailable = the original blind reviewer's pick; correctionBestAvailable = a correction review's pick over its subset. None of these drives assembly.";
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`finalBestAvailable set on ${finals} pairs; original reviewer picks restored on ${restored}`);
