#!/usr/bin/env node
// Produces the reviewer-facing CSV and prints the statistics used in the report.
//
//   node scripts/unlimited/build-review.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "data", "unlimited");
const dataset = JSON.parse(readFileSync(join(DATA, "pilot-pair-clues-20.json"), "utf8"));
const pairs = dataset.pairs;

const cell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = ["Word A", "Word B"];
for (let i = 1; i <= 5; i++) header.push(`Clue ${i}`, `Explanation ${i}`);
header.push("Reviewer Notes", "Approved");

const rows = pairs.map((p) => {
  const r = [p.a.display, p.b.display];
  for (let i = 0; i < 5; i++) {
    const c = p.clues[i];
    r.push(c ? c.text : "", c ? c.explanation : "");
  }
  r.push("", "");
  return r.map(cell).join(",");
});

// A BOM keeps Excel happy when it opens the file by double-click.
writeFileSync(join(DATA, "pilot-pair-clues-20.csv"), "﻿" + [header.map(cell).join(","), ...rows].join("\r\n") + "\r\n");
console.log(`wrote data/unlimited/pilot-pair-clues-20.csv (${rows.length} rows)`);

// ---------------------------------------------------------------------------
const total = pairs.reduce((s, p) => s + p.clues.length, 0);
const dist = {};
for (const p of pairs) dist[p.clues.length] = (dist[p.clues.length] || 0) + 1;

const types = {};
for (const p of pairs) for (const c of p.clues) types[c.type] = (types[c.type] || 0) + 1;

const clueFreq = {};
for (const p of pairs) for (const c of p.clues) clueFreq[c.text] = (clueFreq[c.text] || 0) + 1;

// How often each pilot word ends up needing a lateral_connection clue: a rough
// proxy for which words were hard to write for.
const lateralByWord = {};
for (const p of pairs) {
  const n = p.clues.filter((c) => c.type === "lateral_connection").length;
  for (const w of [p.a.display, p.b.display]) lateralByWord[w] = (lateralByWord[w] || 0) + n;
}

console.log(`\ntotal clues      ${total}`);
console.log(`avg per pair     ${(total / pairs.length).toFixed(2)}`);
console.log(`distribution     ${[2, 3, 4, 5].map((n) => `${n} clues: ${dist[n] || 0}`).join("  |  ")}`);
console.log(`\nconnection types:`);
for (const [k, v] of Object.entries(types).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(3)}  ${((v / total) * 100).toFixed(1)}%`);

console.log(`\nmost reused clue words:`);
for (const [k, v] of Object.entries(clueFreq).sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`unique clue words: ${Object.keys(clueFreq).length} across ${total} clues`);

console.log(`\nlateral-clue load per word (higher = harder to write for):`);
for (const [k, v] of Object.entries(lateralByWord).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(10)} ${v}`);
