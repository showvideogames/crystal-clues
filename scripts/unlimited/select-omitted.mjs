#!/usr/bin/env node
// Picks strong combinations a checkpoint's capped round-robin left out, for the
// next review (x04 coordinator review: "use best quality and route diversity,
// not alphabetical endpoints"). Input: a finder --json file (current library).
// Only class "new" candidates with both words at strength 2 qualify (anything
// already in the library with that hint, an owner request or rejection is
// excluded by the finder's classification). Order:
//   1. one candidate for every route combination that has NO library pair yet,
//   2. then round-robin across hints, preferring candidates whose words are not
//      yet targets of that hint (new words beat repeats of the same word),
// until --max. Writes a review batch (variation-review.mjs input format).
//   node scripts/unlimited/select-omitted.mjs <candidates.json> --max 40 --name x04b-o --batch <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const src = JSON.parse(readFileSync(process.argv[2], "utf8"));
const MAX = Number(arg("max", 40));
const picked = []; const pickedIds = new Set();
const state = src.hints.map((h) => {
  const inLib = h.candidates.filter((c) => c.class.startsWith("in library"));
  const used = new Map(); for (const c of inLib) for (const w of [c.a, c.b]) used.set(w, (used.get(w) || 0) + 1);
  return { hint: h.hint, covered: new Set(inLib.map((c) => c.routes)), used, pool: h.candidates.filter((c) => c.class === "new" && c.strength[0] === 2 && c.strength[1] === 2) };
});
const novelty = (s, c) => (s.used.get(c.a) || 0) + (s.used.get(c.b) || 0);   // lower = fresher words
const take = (s, c, reason) => { picked.push({ ...c, reason }); pickedIds.add(`${c.hint}|${c.pair_id}`); s.used.set(c.a, (s.used.get(c.a) || 0) + 1); s.used.set(c.b, (s.used.get(c.b) || 0) + 1); s.covered.add(c.routes); };
// 1. uncovered route combinations
for (const s of state) {
  const combos = [...new Set(s.pool.map((c) => c.routes))].filter((r) => !s.covered.has(r));
  for (const r of combos) { if (picked.length >= MAX) break; const best = s.pool.filter((c) => c.routes === r).sort((x, y) => novelty(s, x) - novelty(s, y) || x.pair_id.localeCompare(y.pair_id))[0]; take(s, best, "route combination with no library pair yet"); }
}
// 2. fresh words, round-robin across hints
let progress = true;
while (picked.length < MAX && progress) {
  progress = false;
  for (const s of state) {
    if (picked.length >= MAX) break;
    const rest = s.pool.filter((c) => !pickedIds.has(`${c.hint}|${c.pair_id}`)).sort((x, y) => novelty(s, x) - novelty(s, y) || x.pair_id.localeCompare(y.pair_id));
    if (rest.length && novelty(s, rest[0]) === 0) { take(s, rest[0], "both words new for this hint"); progress = true; }
  }
}
const byPair = new Map();
for (const c of picked) {
  if (!byPair.has(c.pair_id)) byPair.set(c.pair_id, { pair_id: c.pair_id, a: c.a, b: c.b, clues: [], variants: [], rejected: [] });
  byPair.get(c.pair_id).clues.push({ text: c.hint, type: "related-index", wordAConnection: c.links[c.a], wordBConnection: c.links[c.b], revealExplanation: c.why, reference: null, routes: c.routes, strength: c.strength, selection: c.reason });
}
if (arg("batch")) writeFileSync(arg("batch"), JSON.stringify({ _metadata: { batch: arg("name", "omitted"), source: process.argv[2], prepared: new Date().toISOString().slice(0, 10), max: MAX, note: "strong combinations the capped round-robin left out" }, pairs: [...byPair.values()] }, null, 1) + "\n");
const counts = {}; for (const c of picked) counts[c.hint] = (counts[c.hint] || 0) + 1;
console.log(JSON.stringify({ picked: picked.length, uncovered: picked.filter((c) => c.reason.startsWith("route")).length, byHint: counts }));
for (const c of picked) console.log(`  ${c.hint.padEnd(8)} ${c.a} + ${c.b} [${c.routes}] ${c.reason}`);
