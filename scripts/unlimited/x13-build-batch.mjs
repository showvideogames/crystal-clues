#!/usr/bin/env node
// Builds the x13 candidate batch from x13-rows.mjs (main-session drafting, no model calls).
// Stricter than x12: any pair with ANY existing record (served, attempted, held, rejected)
// or a rejections.json entry is left out, so every candidate is an unseen pair.
// Rows themed "skip" are brainstorm notes kept for the record, never built.
//   node scripts/unlimited/x13-build-batch.mjs
import { writeFileSync } from "node:fs";
import { loadCatalogue, pairOf, hintProblem } from "./catalogue-lib.mjs";
import { loadRejections } from "./rejections-lib.mjs";
import { ROWS } from "./x13-rows.mjs";

const ix = loadCatalogue();
const rejected = new Set(loadRejections().map((e) => pairOf(e.a, e.b).id));
const pairs = []; const skipped = []; let notes = 0;
for (const line of ROWS.split("\n")) {
  const [hint, x, y, why, lx, ly, theme] = line.split("|");
  if (theme === "skip") { notes++; continue; }
  const { a, b, id } = pairOf(x, y);
  const out = (r) => skipped.push({ hint, pair: `${a} + ${b}`, reason: r });
  const missing = [a, b].filter((w) => !ix.inBank.has(w));
  if (missing.length) { out(`not in the bank: ${missing.join(", ")}`); continue; }
  const problem = hintProblem(hint, a, b); if (problem) { out(problem); continue; }
  if (ix.byId.has(id)) { out(`pair already has a record (${ix.byId.get(id).clues.map((c) => `${c.text} ${c.status}`).join(", ")})`); continue; }
  if (rejected.has(id)) { out("pair has a rejections.json entry"); continue; }
  if (pairs.some((q) => q.pair_id === id)) { out("duplicate pair in this batch"); continue; }
  const lines = { [x]: lx, [y]: ly };
  pairs.push({ pair_id: id, a, b, theme, clues: [{ text: hint, type: "x13-proposal", wordAConnection: lines[a], wordBConnection: lines[b], revealExplanation: why, reference: null }], variants: [], rejected: [] });
}
writeFileSync("data/unlimited/library/batches/x13-batch.json", JSON.stringify({ _metadata: { batch: "x13", prepared: "2026-10-20", note: "independent candidates drafted by the main session (no model calls), on unseen pairs only; preferring words kept in both shortlist cores" }, pairs }, null, 1) + "\n");
const t = (k) => pairs.filter((p) => p.theme === k).length;
console.log(`${ROWS.split("\n").length} rows (${notes} brainstorm notes not built); ${pairs.length} kept (band ${t("band")}, video game ${t("game")}, story ${t("story")}, double ${t("double")}); ${skipped.length} left out`);
for (const s of skipped) console.log(`  out ${s.hint} ${s.pair}: ${s.reason}`);
