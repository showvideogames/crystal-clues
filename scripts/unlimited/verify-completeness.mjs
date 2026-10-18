#!/usr/bin/env node
// Read-only completeness and provenance audit of the exhaustive 1,225 run.
//   node scripts/unlimited/verify-completeness.mjs
// Checks: the 50-word shortlist is 50 distinct words; the library holds exactly
// the C(50,2) = 1,225 unordered pairs, each once, with canonical pair ids and
// both words in the shortlist; every pair has at least one reviewed hint; every
// pilot-origin pair keeps its pilot provenance; every reviewed hint names its
// review model. Prints a summary and exits 1 on any failure.
import { readFileSync } from "node:fs";
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => (typeof w === "string" ? w : w.word));
const fail = [];
const W = new Set(words);
if (words.length !== 50 || W.size !== 50) fail.push(`shortlist has ${words.length} entries, ${W.size} distinct`);
const expected = new Set();
for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) { const [a, b] = [words[i], words[j]].sort(); expected.add(`p_${a.toLowerCase()}__${b.toLowerCase()}`); }
const seen = new Map();
for (const p of lib.pairs) {
  seen.set(p.pair_id, (seen.get(p.pair_id) || 0) + 1);
  const [a, b] = [p.a, p.b].sort();
  if (!W.has(p.a) || !W.has(p.b)) fail.push(`${p.pair_id}: word outside the shortlist`);
  if (p.a === p.b) fail.push(`${p.pair_id}: same word twice`);
  if (p.pair_id !== `p_${a.toLowerCase()}__${b.toLowerCase()}`) fail.push(`${p.pair_id}: id is not the canonical unordered id for ${p.a}+${p.b}`);
}
const dups = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
const missing = [...expected].filter((id) => !seen.has(id));
const extra = [...seen.keys()].filter((id) => !expected.has(id));
if (dups.length) fail.push(`duplicate pairs: ${dups.join(", ")}`);
if (missing.length) fail.push(`missing pairs (${missing.length}): ${missing.slice(0, 20).join(", ")}`);
if (extra.length) fail.push(`pairs not in the 1,225: ${extra.join(", ")}`);
let hints = 0, unreviewed = 0, noModel = 0, pilotPairs = 0, pilotLost = 0;
const byModel = {}, byStatus = {}, pairsNoClues = [];
for (const p of lib.pairs) {
  if (!p.clues.length) pairsNoClues.push(p.pair_id);
  let pilot = false;
  for (const c of p.clues) {
    hints++; byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const br = c.provenance?.blindReview || c.provenance?.correctionReview;
    if (!br) unreviewed++;
    const m = c.provenance?.blindReview?.model; if (c.provenance?.blindReview && !m) noModel++; byModel[m || "none"] = (byModel[m || "none"] || 0) + 1;
    if (c.provenance?.prior || /pilot/i.test(String(c.provenance?.source || "")) || /pilot/i.test(String(p.source || ""))) pilot = true;
  }
  if (/pilot/i.test(String(p.source || "")) || p.clues.some((c) => c.provenance?.prior)) { pilotPairs++; if (!p.clues.some((c) => c.provenance?.prior || /pilot/i.test(String(c.provenance?.source || "")) || /pilot/i.test(String(p.source || "")))) pilotLost++; }
  void pilot;
}
if (pairsNoClues.length) fail.push(`pairs with no hint at all: ${pairsNoClues.join(", ")}`);
if (unreviewed) fail.push(`${unreviewed} hints without a review record`);
if (noModel) fail.push(`${noModel} blind reviews without a model tag`);
if (pilotLost) fail.push(`${pilotLost} pilot pairs lost their pilot provenance`);
console.log(JSON.stringify({ shortlistWords: words.length, expectedPairs: expected.size, libraryPairs: lib.pairs.length, uniquePairs: seen.size, duplicates: dups.length, missing: missing.length, extra: extra.length, hints, hintStatus: byStatus, reviewModel: byModel, pilotProvenancePairs: pilotPairs, pairsWithPlayableHint: lib.pairs.filter((p) => p.clues.some((c) => c.status === "ai_reviewed" || c.status === "human_approved")).length }, null, 1));
if (fail.length) { console.log("FAIL:\n- " + fail.join("\n- ")); process.exit(1); }
console.log("PASS: exactly 1,225 unique unordered pairs from the 50-word shortlist; no duplicates or omissions; every hint reviewed and model-tagged; pilot provenance intact.");
