#!/usr/bin/env node
// Builds the input for a BLIND clue review from an authored batch: every hint
// the author kept AND every hint the author rejected, shuffled together per
// pair, with no explanations, ranks, types, reasons or author verdicts. The
// reviewer therefore scores each hint on its own and cannot be led by the
// author. The author's own labels are written to a separate key file that the
// reviewer must not open; merge-review.mjs joins the two afterwards.
//   node scripts/unlimited/blind-input.mjs <batch.json> <out-input.json> <out-key.json>
import { readFileSync, writeFileSync } from "node:fs";
const [batchPath, inPath, keyPath] = process.argv.slice(2);
if (!batchPath || !inPath || !keyPath) { console.error("usage: blind-input.mjs <batch> <input-out> <key-out>"); process.exit(2); }
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
// Deterministic shuffle (seeded by the pair id) so the file is reproducible.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const shuffle = (arr, seed) => { const r = [...arr]; let x = seed || 1; for (let i = r.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) >>> 0; const j = x % (i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const input = { _instructions: "Score every hint for the pair it sits under. Do not look for any other file about these pairs.", pairs: [] };
const key = { batch: batch._metadata?.batch, pairs: [] };
for (const p of batch.pairs) {
  const all = [
    ...p.clues.map((c) => ({ text: c.text, author: "retained" })),
    ...(p.variants || []).map((v) => ({ text: v.text, author: "variant", of: v.of })),
    ...(p.rejected || []).map((r) => ({ text: r.text, author: "rejected", reason: r.reason })),
  ];
  const order = shuffle(all, hash(p.pair_id));
  input.pairs.push({ pair_id: p.pair_id, a: p.a, b: p.b, hints: order.map((h) => h.text) });
  key.pairs.push({ pair_id: p.pair_id, hints: order });
}
writeFileSync(inPath, JSON.stringify(input, null, 2));
writeFileSync(keyPath, JSON.stringify(key, null, 2));
console.log(`blind input: ${input.pairs.length} pairs, ${input.pairs.reduce((n, p) => n + p.hints.length, 0)} hints -> ${inPath}`);
