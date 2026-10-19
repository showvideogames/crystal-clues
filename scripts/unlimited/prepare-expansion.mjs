#!/usr/bin/env node
// Checks drafted expansion batches before review and writes the review-ready batch files.
//   node scripts/unlimited/prepare-expansion.mjs <batch-name> <authored.json>... [--exclude-original]
//   (e.g. x01 x01-a-authored.json ...). --exclude-original drops any pair using an original-50 word
//   (x02: bring uncovered words in, so the original 50 stop dominating the targets).
// For each authored file it writes <same dir>/<batch>-batch.json and prints a report.
// Mechanical rules only (quality is the reviewer's job):
//   - both targets must be in the word-bank snapshot, distinct, and not both original-50 words;
//   - a, b, pair_id are rewritten to the catalogue form (pairOf);
//   - a pair already in the library (including owner discoveries) is dropped: it is never re-reviewed or overwritten;
//   - a pair drafted twice across files is kept in the first file only;
//   - a hint must be one word, letters only, not containing or contained in a target (hintProblem);
//     a failing hint is dropped with the reason; a pair left with no hint is dropped.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadCatalogue, pairOf, hintProblem, normWord } from "./catalogue-lib.mjs";

const excludeOriginal = process.argv.includes("--exclude-original");
const [batchName, ...files] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!batchName || !files.length) { console.error("usage: prepare-expansion.mjs <batch-name> <authored.json>..."); process.exit(2); }
const ix = loadCatalogue();
const seen = new Map();
const report = { batch: batchName, files: [], dropped: [], hintsDropped: [] };
for (const file of files) {
  const src = JSON.parse(readFileSync(file, "utf8"));
  const name = src._metadata?.batch || file;
  const pairs = [];
  for (const p of src.pairs || []) {
    const { a, b, id } = pairOf(p.a, p.b);
    const why = !ix.inBank.has(a) || !ix.inBank.has(b) ? `not in the word bank: ${[a, b].filter((w) => !ix.inBank.has(w)).join(", ")}`
      : a === b ? "same word twice"
      : ix.original.has(a) && ix.original.has(b) ? "both original-50 words (already covered)"
      : excludeOriginal && (ix.original.has(a) || ix.original.has(b)) ? "uses an original-50 word (excluded in this batch)"
      : ix.byId.has(id) ? "already in the library (kept as it is)"
      : seen.has(id) ? `also drafted in ${seen.get(id)} (kept there)` : null;
    if (why) { report.dropped.push({ file: name, pair: `${a} + ${b}`, why }); continue; }
    const swap = normWord(p.a) !== a;
    const clues = [];
    for (const c of p.clues || []) {
      const text = normWord(c.text);
      const problem = hintProblem(text, a, b);
      if (problem) { report.hintsDropped.push({ file: name, pair: `${a} + ${b}`, hint: text, why: problem }); continue; }
      if (clues.some((x) => x.text === text)) continue;
      clues.push({ ...c, text, ...(swap ? { wordAConnection: c.wordBConnection, wordBConnection: c.wordAConnection } : {}) });
    }
    if (!clues.length) { report.dropped.push({ file: name, pair: `${a} + ${b}`, why: "no hint left after the rule checks" }); continue; }
    seen.set(id, name);
    pairs.push({ ...p, pair_id: id, a, b, clues, variants: [], rejected: [] });
  }
  const out = join(dirname(file), `${name}-batch.json`);
  writeFileSync(out, JSON.stringify({ _metadata: { ...src._metadata, batch: name, preparedFrom: file, prepared: new Date().toISOString().slice(0, 10) }, pairs }, null, 1) + "\n");
  const words = new Set(pairs.flatMap((p) => [p.a, p.b]));
  report.files.push({ file: name, drafted: (src.pairs || []).length, kept: pairs.length, hints: pairs.reduce((n, p) => n + p.clues.length, 0), targets: words.size, outsideOriginal: [...words].filter((w) => !ix.original.has(w)).length, model: src._metadata?.model || null, out });
}
const all = [...seen.keys()];
report.total = { pairs: all.length };
console.log(JSON.stringify(report, null, 1));
