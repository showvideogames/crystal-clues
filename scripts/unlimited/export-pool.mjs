#!/usr/bin/env node
// Copies an assembled, checked batch into the app's bundled pool
// (src/unlimited/pool.json). Run check-boards.mjs first; this refuses a batch
// whose boards fail the structural check.
//   node scripts/unlimited/export-pool.mjs data/unlimited/boards/beta-01/boards.json
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const src = process.argv[2] || "data/unlimited/boards/beta-01/boards.json";
try { execFileSync(process.execPath, ["scripts/unlimited/check-boards.mjs", src], { stdio: "pipe" }); }
catch (e) { console.error(String(e.stdout || e.message)); console.error("refusing to export: the batch does not pass check-boards"); process.exit(1); }
const { _metadata, boards } = JSON.parse(readFileSync(src, "utf8"));
const pool = {
  _metadata: { batch: _metadata.batch, seed: _metadata.seed, exported: new Date().toISOString(), source: src, boards: boards.length,
    note: "Guest beta pool. Every hint passed a blind review (ai_reviewed); humanApproved is false on every board until a person sets it." },
  boards: boards.map((b) => ({ id: b.id, version: b.version, index: b.index, title: b.title, status: b.status, humanApproved: !!b.humanApproved,
    clues: b.clues, cards: b.cards, solution: b.solution,
    reveal: b.reveal.map((r) => ({ position: r.position, clue: r.clue, wordA: r.wordA, wordB: r.wordB, wordAConnection: r.wordAConnection, wordBConnection: r.wordBConnection, revealExplanation: r.revealExplanation, reference: r.reference, pairId: r.pairId })) })),
};
writeFileSync("src/unlimited/pool.json", JSON.stringify(pool, null, 1) + "\n");
console.log(`exported ${boards.length} boards from ${_metadata.batch} -> src/unlimited/pool.json`);
