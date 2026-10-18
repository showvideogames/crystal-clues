#!/usr/bin/env node
// Merges a bounded CORRECTION review into the library. The original blind
// review stays on every hint as provenance.blindReview; the correction is
// recorded alongside it as provenance.correctionReview with the parent's
// calibration note, and the hint's status follows the corrected verdict.
// New candidates (hints that were not in the original review) are added from
// the batch file (clues or laterText). A correction never sets human_approved.
//   node scripts/unlimited/merge-correction.mjs <correction-review.json> <batch.json> "<calibration note>"
import { readFileSync, writeFileSync } from "node:fs";
const [reviewPath, batchPath, calibration] = process.argv.slice(2);
if (!reviewPath || !batchPath) { console.error("usage: merge-correction.mjs <review.json> <batch.json> [calibration note]"); process.exit(2); }
const LIB = "data/unlimited/library/pairs.json";
const review = JSON.parse(readFileSync(reviewPath, "utf8"));
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const STATUS = { PASS: "ai_reviewed", BORDERLINE: "held", FAIL: "rejected" };
const counts = { changed: 0, unchanged: 0, added: 0, upgraded: 0, downgraded: 0 };
const changes = [];
for (const rp of review.pairs) {
  const p = lib.pairs.find((x) => x.pair_id === rp.pair_id);
  const src = batch.pairs.find((x) => x.pair_id === rp.pair_id);
  if (!p || !src) { console.warn(`no library/batch record for ${rp.pair_id}`); continue; }
  for (const h of rp.hints) {
    const cr = { reviewer: review._metadata?.reviewer || "correction-subagent", date: review._metadata?.date || null, verdict: h.verdict, a: h.connection_to_a, b: h.connection_to_b, fairness: h.fairness, recognizability: h.recognizability, flags: h.flags || [], reason: h.reason, calibration: calibration || null };
    let c = p.clues.find((x) => x.text === h.text);
    const text = (src.clues || []).find((x) => x.text === h.text) || (src.laterText || []).find((x) => x.text === h.text);
    if (!c) {
      if (!text) { console.warn(`${rp.pair_id} ${h.text}: new hint without author text; skipped`); continue; }
      c = { text: h.text, status: "candidate", heldReason: null, type: text.type, wordAConnection: text.wordAConnection, wordBConnection: text.wordBConnection, revealExplanation: text.revealExplanation, reference: text.reference || null, ...(text.stretch ? { stretch: true } : {}), provenance: { source: batch._metadata?.batch || "authored", authorLabel: "correction-candidate", authorReason: null, prior: null, blindReview: null } };
      p.clues.push(c); counts.added++;
    }
    const before = c.status;
    let status = STATUS[h.verdict] || "held";
    let heldReason = null;
    const hasText = !!(c.wordAConnection && c.wordBConnection && c.revealExplanation) || !!text;
    if (status === "ai_reviewed" && !hasText) { status = "held"; heldReason = "passed correction review; needs player-facing text"; }
    if (status === "ai_reviewed" && text && (!c.wordAConnection || !c.wordBConnection)) Object.assign(c, { wordAConnection: text.wordAConnection, wordBConnection: text.wordBConnection, revealExplanation: text.revealExplanation, reference: text.reference || null, type: text.type });
    if (status === "held" && !heldReason) heldReason = "correction review: borderline";
    if (c.override?.status === "held") { status = "held"; heldReason = c.heldReason; }
    c.provenance.correctionReview = cr;
    if (before !== status) { changes.push(`${rp.pair_id} ${h.text}: ${before} -> ${status} (${h.verdict}: ${h.reason})`); counts.changed++; if (status === "ai_reviewed") counts.upgraded++; if (status === "rejected" || (before === "ai_reviewed" && status === "held")) counts.downgraded++; } else counts.unchanged++;
    c.status = status; c.heldReason = status === "held" ? heldReason : null;
  }
  const strength = (x) => (x.status === "ai_reviewed" ? 100 : 0) + (((x.provenance.correctionReview || x.provenance.blindReview)?.a ?? 0) + ((x.provenance.correctionReview || x.provenance.blindReview)?.b ?? 0)) * 10 + ((x.provenance.correctionReview || x.provenance.blindReview)?.fairness ?? 0);
  p.clues.sort((x, y) => strength(y) - strength(x));
  p.playableHints = p.clues.filter((x) => x.status === "ai_reviewed" || x.status === "human_approved").length;
  if (rp.best_available?.text) p.reviewerBestAvailable = { text: rp.best_available.text, why: rp.best_available.why || null, reviewer: review._metadata?.reviewer || "correction-subagent", correction: true };
}
lib._metadata.merges = [...(lib._metadata.merges || []), { correction: reviewPath, batch: batchPath, calibration: calibration || null, ...counts }];
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`correction merged: ${counts.changed} status changes (${counts.upgraded} to playable, ${counts.downgraded} down), ${counts.unchanged} unchanged, ${counts.added} new hints`);
for (const ch of changes) console.log("  " + ch);
