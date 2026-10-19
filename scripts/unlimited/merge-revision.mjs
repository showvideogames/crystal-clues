#!/usr/bin/env node
// Merges the ONE revision round of an expansion batch into the library.
//   node scripts/unlimited/merge-revision.mjs <revision-review.json> <revision-batch.json>
//
// The revision batch (written by a drafting agent that saw the first review)
// holds, per pair, only revised or replacement hints:
//   { text, kind: "text_fix" | "replacement", reason, type, wordAConnection, wordBConnection, revealExplanation }
// A fresh reviewer then judged those hints once. Here:
//   text_fix     the hint keeps its first review as provenance.blindReview; its old
//                player text moves to provenance.revision.previous; the new text
//                and the second verdict (provenance.revisionReview) decide its status.
//   replacement  a new hint for the pair, judged only by the revision reviewer
//                (stored as its blindReview, marked revisionRound: true).
// Status follows the revision verdict (PASS -> ai_reviewed, BORDERLINE -> held,
// FAIL -> rejected). Nothing is reviewed again after this: accept or hold.
// Hints not in the revision keep their first verdict. Never writes human_approved.
import { readFileSync, writeFileSync } from "node:fs";
const [reviewPath, batchPath] = process.argv.slice(2);
if (!reviewPath || !batchPath) { console.error("usage: merge-revision.mjs <revision-review.json> <revision-batch.json>"); process.exit(2); }
const LIB = "data/unlimited/library/pairs.json";
const review = JSON.parse(readFileSync(reviewPath, "utf8"));
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const STATUS = { PASS: "ai_reviewed", BORDERLINE: "held", FAIL: "rejected" };
const meta = review._metadata || {};
const counts = { textFixes: 0, replacements: 0, ai_reviewed: 0, held: 0, rejected: 0 };
const log = [];
for (const rp of review.pairs) {
  const p = lib.pairs.find((x) => x.pair_id === rp.pair_id);
  const src = batch.pairs.find((x) => x.pair_id === rp.pair_id);
  if (!p || !src) { console.warn(`no library/revision record for ${rp.pair_id}`); continue; }
  for (const h of rp.hints) {
    const rev = src.clues.find((x) => x.text === h.text);
    if (!rev) { console.warn(`${rp.pair_id} ${h.text}: not in the revision batch; skipped`); continue; }
    const verdict = { reviewer: meta.reviewer || "revision-reviewer", ...(meta.model ? { model: meta.model } : {}), date: meta.date || null, verdict: h.verdict, a: h.connection_to_a, b: h.connection_to_b, fairness: h.fairness, ...(h.delight != null ? { delight: h.delight } : {}), recognizability: h.recognizability, flags: h.flags || [], reason: h.reason };
    const text = { type: rev.type, wordAConnection: rev.wordAConnection, wordBConnection: rev.wordBConnection, revealExplanation: rev.revealExplanation, reference: rev.reference || null };
    let c = p.clues.find((x) => x.text === h.text);
    if (rev.kind === "text_fix") {
      if (!c) { console.warn(`${rp.pair_id} ${h.text}: text fix for a hint not in the library; skipped`); continue; }
      c.provenance.revision = { previous: { type: c.type, wordAConnection: c.wordAConnection, wordBConnection: c.wordBConnection, revealExplanation: c.revealExplanation }, reason: rev.reason || null, by: batch._metadata?.author || null, model: batch._metadata?.model || null, date: batch._metadata?.authored || null };
      Object.assign(c, text);
      c.provenance.revisionReview = verdict;
      counts.textFixes++;
    } else {
      if (c) { console.warn(`${rp.pair_id} ${h.text}: replacement already in the library; skipped`); continue; }
      c = { text: h.text, status: "candidate", heldReason: null, ...text, provenance: { source: batch._metadata?.batch || "revision", authorLabel: "replacement", authorReason: rev.reason || null, prior: null, revisionRound: true, author: { by: batch._metadata?.author || null, model: batch._metadata?.model || null }, blindReview: verdict } };
      p.clues.push(c);
      counts.replacements++;
    }
    const before = c.status;
    c.status = STATUS[h.verdict] || "held";
    c.heldReason = c.status === "held" ? "revision review: borderline" : null;
    counts[c.status]++;
    log.push(`${rp.pair_id} ${h.text} [${rev.kind}]: ${before} -> ${c.status} (${h.verdict}: ${h.reason})`);
  }
  const s = (x) => { const r = x.provenance.revisionReview || x.provenance.blindReview || {}; return (x.status === "ai_reviewed" || x.status === "human_approved" ? 100 : 0) + ((r.a ?? 0) + (r.b ?? 0)) * 10 + (r.fairness ?? 0); };
  p.clues.sort((x, y) => s(y) - s(x));
  p.playableHints = p.clues.filter((x) => x.status === "ai_reviewed" || x.status === "human_approved").length;
  if (rp.best_available?.text) p.correctionBestAvailable = { text: rp.best_available.text, why: rp.best_available.why || null, reviewer: meta.reviewer || "revision-reviewer", round: "revision" };
}
lib._metadata.merges = [...(lib._metadata.merges || []), { revision: reviewPath, batch: batchPath, ...counts }];
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`revision merged: ${counts.textFixes} text fixes, ${counts.replacements} replacements -> ai_reviewed ${counts.ai_reviewed}, held ${counts.held}, rejected ${counts.rejected}`);
for (const l of log) console.log("  " + l);
