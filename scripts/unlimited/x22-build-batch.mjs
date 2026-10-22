#!/usr/bin/env node
// Builds the x22 batch from the two drafters' line files (data/unlimited/expansion/x22/rows-a.txt,
// rows-b.txt). Line: HINT|WORD|WORD|explanation|line for first word|line for second word|theme.
// Strict dedupe as in x13: any pair with an existing record or a rejections.json entry is left
// out, a pair reserved for coordinator review (reserved-pairs.mjs) is left out, and a pair proposed
// twice keeps only its first row.
//   node scripts/unlimited/x14-build-batch.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadCatalogue, pairOf, hintProblem } from "./catalogue-lib.mjs";
import { loadRejections } from "./rejections-lib.mjs";
import { reservedPairIds } from "./reserved-pairs.mjs";
const ix = loadCatalogue();
const rejected = new Set(loadRejections().map((e) => pairOf(e.a, e.b).id));
const reserved = reservedPairIds(); // x11 animal x SHIP proposal pairs: the parent decides, batches never store them
const pairs = []; const out = [];
for (const k of ["a", "b"]) {
  const f = `data/unlimited/expansion/x22/rows-${k}.txt`;
  if (!existsSync(f)) { console.log(`missing ${f}`); continue; }
  for (const line of readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split("|");
    if (parts.length !== 7) { out.push({ drafter: k, line, reason: "not 7 fields" }); continue; }
    const [hint, x, y, why, lx, ly, theme] = parts.map((s) => s.trim());
    const { a, b, id } = pairOf(x, y);
    const no = (r) => out.push({ drafter: k, line: `${hint} ${a} + ${b}`, reason: r });
    const miss = [a, b].filter((w) => !ix.inBank.has(w)); if (miss.length) { no(`not in the bank: ${miss.join(", ")}`); continue; }
    const p = hintProblem(hint, a, b); if (p) { no(p); continue; }
    if (ix.byId.has(id)) { no("pair already has a record"); continue; }
    if (rejected.has(id)) { no("pair has a rejections.json entry"); continue; }
    if (reserved.has(id)) { no("pair is reserved for coordinator review (x11 animal x SHIP proposal)"); continue; }
    if (pairs.some((q) => q.pair_id === id)) { no("pair already proposed in this batch"); continue; }
    const lines = { [x.toUpperCase()]: lx, [y.toUpperCase()]: ly };
    pairs.push({ pair_id: id, a, b, theme: theme.toLowerCase(), drafter: `x22-drafter-${k}`, clues: [{ text: hint.toUpperCase(), type: "x22-proposal", wordAConnection: lines[a], wordBConnection: lines[b], revealExplanation: why, reference: null }], variants: [], rejected: [] });
  }
}
writeFileSync("data/unlimited/library/batches/x22-batch.json", JSON.stringify({ _metadata: { batch: "x22", prepared: "2026-10-20", note: "candidates from two independent drafting calls (x22-drafter-a, -b) on thin-coverage shortlisted words; unseen pairs only" }, pairs }, null, 1) + "\n");
const th = {}; for (const p of pairs) th[p.theme] = (th[p.theme] || 0) + 1;
console.log(`${pairs.length} kept; ${out.length} left out; themes ${JSON.stringify(th)}`);
for (const o of out) console.log(`  out [${o.drafter}] ${o.line}: ${o.reason}`);
