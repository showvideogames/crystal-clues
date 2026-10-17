#!/usr/bin/env node
// Merges blind review verdicts into the pair library.
//
//   node scripts/unlimited/merge-review.mjs <review.json> <key.json> [<authored-batch.json>]
//
// Status of every hint comes from the BLIND verdict, never from the author:
//   PASS        -> ai_reviewed   (playable in the beta pool)
//   BORDERLINE  -> held          (kept with its reasons; not served)
//   FAIL        -> rejected      (kept for the record; not served)
// A hint the author had rejected but the reviewer passed becomes ai_reviewed
// only if player-facing text exists for it; otherwise it is held with the
// reason "passed blind review; needs player-facing text", so the gap is visible.
// Nothing here ever writes human_approved: that status is a person's to set.
//
// The library is data/unlimited/library/pairs.json. Re-running for the same
// pair replaces that pair's entry (resumable; order is by pair_id).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const [reviewPath, keyPath, batchPath] = process.argv.slice(2);
if (!reviewPath || !keyPath) { console.error("usage: merge-review.mjs <review.json> <key.json> [batch.json]"); process.exit(2); }
const LIB = "data/unlimited/library/pairs.json";
const review = JSON.parse(readFileSync(reviewPath, "utf8"));
const key = JSON.parse(readFileSync(keyPath, "utf8"));
const batch = batchPath ? JSON.parse(readFileSync(batchPath, "utf8")) : null;
const pilot = JSON.parse(readFileSync("data/unlimited/pilot-pair-clues-20.json", "utf8")).pairs;
const pilotIdx = new Map(pilot.map((p) => [p.pair_id, p]));
const batchIdx = new Map((batch?.pairs || []).map((p) => [p.pair_id, p]));
const keyIdx = new Map(key.pairs.map((p) => [p.pair_id, new Map(p.hints.map((h) => [h.text, h]))]));

const lib = existsSync(LIB) ? JSON.parse(readFileSync(LIB, "utf8")) : { _metadata: { title: "Cluevoyance Unlimited pair library", statuses: "candidate | ai_reviewed | held | rejected | human_approved (never set by scripts)" }, pairs: [] };
const libIdx = new Map(lib.pairs.map((p) => [p.pair_id, p]));
const STATUS = { PASS: "ai_reviewed", BORDERLINE: "held", FAIL: "rejected" };
const counts = { ai_reviewed: 0, held: 0, rejected: 0, needsText: 0, pairs: 0 };

for (const rp of review.pairs) {
  const k = keyIdx.get(rp.pair_id) || new Map();
  const src = batchIdx.get(rp.pair_id) || pilotIdx.get(rp.pair_id);
  if (!src) { console.warn(`no source record for ${rp.pair_id}; skipped`); continue; }
  const a = src.a.display || src.a, b = src.b.display || src.b;
  // Player-facing text: from the authored clues, or from text written after the
  // review for a hint the reviewer passed (batch.laterText; the verdict came first).
  const textFor = (t) => {
    const c = (src.clues || []).find((x) => x.text === t) || (src.laterText || []).find((x) => x.text === t);
    return c ? { type: c.type, wordAConnection: c.wordAConnection, wordBConnection: c.wordBConnection, revealExplanation: c.revealExplanation, reference: c.reference || null, ...(c.stretch ? { stretch: true } : {}) } : null;
  };
  const clues = rp.hints.map((h) => {
    const kh = k.get(h.text) || {};
    const text = textFor(h.text);
    let status = STATUS[h.verdict] || "held";
    let heldReason = null;
    if (status === "ai_reviewed" && !text) { status = "held"; heldReason = "passed blind review; needs player-facing text"; counts.needsText++; }
    if (status === "held" && !heldReason) heldReason = h.verdict === "BORDERLINE" ? "blind review: borderline" : "blind review verdict missing";
    if (status === "ai_reviewed" && kh.needsHumanReview) { status = "held"; heldReason = "pilot author flagged needsHumanReview"; }
    counts[status]++;
    return {
      text: h.text, status, heldReason,
      ...(text || {}),
      provenance: {
        source: kh.author === "pilot" ? "pilot-2026-10" : (batch?._metadata?.batch || "authored"),
        authorLabel: kh.author || null, authorReason: kh.reason || kh.of ? (kh.reason || `variant of ${kh.of}`) : null,
        prior: kh.prior || null,
        blindReview: { reviewer: review._metadata?.reviewer || "blind-subagent", date: review._metadata?.date || null, verdict: h.verdict, a: h.connection_to_a, b: h.connection_to_b, fairness: h.fairness, recognizability: h.recognizability, flags: h.flags || [], reason: h.reason },
      },
    };
  });
  // Playable hints first, strongest first (both sides, then fairness).
  const score = (c) => (c.status === "ai_reviewed" ? 100 : 0) + (c.provenance.blindReview.a + c.provenance.blindReview.b) * 10 + (c.provenance.blindReview.fairness || 0);
  clues.sort((x, y) => score(y) - score(x));
  // The reviewer's own "best available" (the hint it would serve if forced to use the pair,
  // PASS or not) is kept apart from playable eligibility and never promotes a hint.
  const reviewerBestAvailable = rp.best_available?.text ? { text: rp.best_available.text, why: rp.best_available.why || null, reviewer: review._metadata?.reviewer || "blind-subagent" } : null;
  const entry = { pair_id: rp.pair_id, a, b, source: batch && batchIdx.has(rp.pair_id) ? batch._metadata.batch : "pilot-2026-10", pairNote: rp.pair_note || null, reviewerBestAvailable, playableHints: clues.filter((c) => c.status === "ai_reviewed").length, clues };
  if (libIdx.has(rp.pair_id)) Object.assign(libIdx.get(rp.pair_id), entry); else { lib.pairs.push(entry); libIdx.set(rp.pair_id, entry); }
  counts.pairs++;
}
lib.pairs.sort((x, y) => x.pair_id.localeCompare(y.pair_id));
lib._metadata.updated = new Date().toISOString().slice(0, 10);
lib._metadata.merges = [...(lib._metadata.merges || []), { review: reviewPath, key: keyPath, batch: batchPath || null, ...counts }];
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`merged ${counts.pairs} pairs: ai_reviewed ${counts.ai_reviewed}, held ${counts.held} (${counts.needsText} need player text), rejected ${counts.rejected}`);
console.log(`library now ${lib.pairs.length} pairs, ${lib.pairs.reduce((n, p) => n + p.playableHints, 0)} playable hints, ${lib.pairs.filter((p) => p.playableHints > 0).length} playable pairs`);
