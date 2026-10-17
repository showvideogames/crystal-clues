#!/usr/bin/env node
// Selects pilot pairs (both words in the 50-word shortlist) for a FRESH blind
// review and writes the reviewer's input: pair + every current pilot hint for
// it, texts only. The 2026-10 independent review scores are provenance only;
// they are used here just to pre-filter which pairs are worth the reviewer's
// time (a pair needs one prior PASS of 8+), and they go to the key file, never
// to the reviewer.
//   node scripts/unlimited/pilot-blind-select.mjs <max-pairs> <out-input.json> <out-key.json>
import { readFileSync, writeFileSync } from "node:fs";
const [maxArg, inPath, keyPath] = process.argv.slice(2);
if (!inPath || !keyPath) { console.error("usage: pilot-blind-select.mjs <max-pairs> <input-out> <key-out>"); process.exit(2); }
const MAX = Number(maxArg) || 36;
const DATA = "data/unlimited";
const shortlist = new Set(JSON.parse(readFileSync(`${DATA}/library/shortlist-50.json`, "utf8")).words.map((w) => w.word));
const pilot = JSON.parse(readFileSync(`${DATA}/pilot-pair-clues-20.json`, "utf8")).pairs;
const prior = JSON.parse(readFileSync(`${DATA}/pilot-independent-review.json`, "utf8")).clue_reviews;
const priorIdx = new Map(prior.map((r) => [`${r.pair_id}|${r.text}`, r]));

const candidates = [];
for (const p of pilot) {
  if (!shortlist.has(p.a.display) || !shortlist.has(p.b.display)) continue;
  const oneWord = p.clues.filter((c) => !/\s/.test(c.text));           // one-word hints only (owner rule)
  const scored = oneWord.map((c) => ({ c, r: priorIdx.get(`${p.pair_id}|${c.text}`) || null }));
  const best = Math.max(0, ...scored.map((s) => (s.r && s.r.verdict === "PASS" ? s.r.total : 0)));
  if (best < 8) continue;
  const strength = scored.reduce((n, s) => n + (s.r && s.r.verdict === "PASS" && s.r.total >= 9 ? 1 : 0), 0);
  candidates.push({ p, scored, best, strength });
}
// Strongest pairs first; then spread the words so no word dominates the sample.
candidates.sort((x, y) => y.strength - x.strength || y.best - x.best || x.p.pair_id.localeCompare(y.p.pair_id));
const used = new Map();
const picked = [];
for (const c of candidates) {
  if (picked.length >= MAX) break;
  const ua = used.get(c.p.a.display) || 0, ub = used.get(c.p.b.display) || 0;
  if (ua >= 5 || ub >= 5) continue;
  used.set(c.p.a.display, ua + 1); used.set(c.p.b.display, ub + 1);
  picked.push(c);
}
const input = { _instructions: "Score every hint for the pair it sits under. Do not look for any other file about these pairs.", pairs: [] };
const key = { source: "pilot-pair-clues-20.json + pilot-independent-review.json (provenance only)", pairs: [] };
for (const { p, scored } of picked) {
  input.pairs.push({ pair_id: p.pair_id, a: p.a.display, b: p.b.display, hints: scored.map((s) => s.c.text) });
  key.pairs.push({ pair_id: p.pair_id, hints: scored.map((s) => ({ text: s.c.text, author: "pilot", prior: s.r ? { verdict: s.r.verdict, total: s.r.total, a: s.r.scores.connection_to_a, b: s.r.scores.connection_to_b } : null, needsHumanReview: !!s.c.needsHumanReview })) });
}
writeFileSync(inPath, JSON.stringify(input, null, 2));
writeFileSync(keyPath, JSON.stringify(key, null, 2));
console.log(`pilot blind input: ${picked.length} pairs, ${input.pairs.reduce((n, p) => n + p.hints.length, 0)} hints (from ${candidates.length} eligible) -> ${inPath}`);
console.log("word usage:", [...used.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(" "));
