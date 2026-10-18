#!/usr/bin/env node
// Writes the skeleton of an authoring batch from the persisted manifest:
// pairs that already have pilot clues (2026-10 pilot, 18 shortlist words) are
// prefilled with those one-word clues (reused, never re-authored; the pilot's
// historical scores are provenance only), and every other pair gets an empty
// stub for the author to fill. No calls, no library change.
//   node scripts/unlimited/prefill-batch.mjs u05 data/unlimited/library/batches/u05-skeleton.json
import { readFileSync, writeFileSync } from "node:fs";
const [batchId, out] = process.argv.slice(2);
if (!batchId || !out) { console.error("usage: prefill-batch.mjs <batchId> <out.json>"); process.exit(2); }
const manifest = JSON.parse(readFileSync("data/unlimited/library/manifest-1225.json", "utf8"));
const pilot = new Map(JSON.parse(readFileSync("data/unlimited/pilot-pair-clues-20.json", "utf8")).pairs.map((p) => [p.pair_id, p]));
const pairs = manifest.pairs.filter((p) => p.plannedBatch === batchId);
const skeleton = { _metadata: { batch: batchId, authored: new Date().toISOString().slice(0, 10), author: "claude-session (included allowance, no API)", manifestBatch: `${batchId} from data/unlimited/library/manifest-1225.json (persisted assignment)`, rules: "One-word hints only (initialisms allowed). A hint never equals either target. About three strong hints per pair is a soft goal, never a quota or cap; a pair with one hint, or only a stretch, is kept and labelled. 'stretch': true is the author's honest flag that a link is indirect. Rejected lists hold genuine near-misses only (no CORE/PIE/CIDER-style filler). US audience, PG / non-graphic." }, pairs: [] };
let reused = 0, toAuthor = 0;
for (const p of pairs) {
  const r = pilot.get(p.pair_id);
  if (r) {
    reused++;
    skeleton.pairs.push({ pair_id: p.pair_id, a: p.a, b: p.b, status: "candidate", origin: "pilot-2026-10 clues reused (not re-authored); historical scores are provenance only",
      clues: r.clues.filter((c) => !/\s/.test(c.text)).map((c) => ({ text: c.text, type: c.type, explanation: c.explanation, wordAConnection: c.wordAConnection, wordBConnection: c.wordBConnection, revealExplanation: c.revealExplanation, ...(c.reference ? { reference: c.reference } : {}), ...(c.needsHumanReview ? { pilotFlag: c.needsHumanReview } : {}) })),
      variants: [], rejected: [] });
  } else {
    toAuthor++;
    skeleton.pairs.push({ pair_id: p.pair_id, a: p.a, b: p.b, status: "candidate", origin: "to author", clues: [], variants: [], rejected: [] });
  }
}
writeFileSync(out, JSON.stringify(skeleton, null, 2) + "\n");
console.log(`${batchId}: ${pairs.length} pairs -> ${out} (${reused} prefilled from the pilot, ${toAuthor} to author)`);
console.log("to author:", skeleton.pairs.filter((p) => p.origin === "to author").map((p) => `${p.a}+${p.b}`).join(", "));
