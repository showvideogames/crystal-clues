#!/usr/bin/env node
// Appends a checked batch to the app's bundled pool (src/unlimited/pool.json)
// behind the boards already there. Existing boards are kept byte-for-byte as
// JSON objects (verified before writing), so their ids, versions, indices and
// every player's history keyed by id stay valid. The new boards keep their
// stable ids and get the next indices and titles.
//   node scripts/unlimited/append-pool.mjs data/unlimited/boards/beta-02/boards.json
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const src = process.argv[2];
if (!src) { console.error("usage: append-pool.mjs <boards.json>"); process.exit(2); }
try { execFileSync(process.execPath, ["scripts/unlimited/check-boards.mjs", src], { stdio: "pipe" }); }
catch (e) { console.error(String(e.stdout || e.message)); console.error("refusing to append: the batch does not pass check-boards"); process.exit(1); }
const POOL = "src/unlimited/pool.json";
const pool = JSON.parse(readFileSync(POOL, "utf8"));
const existingJson = JSON.stringify(pool.boards);
const { _metadata, boards } = JSON.parse(readFileSync(src, "utf8"));
const have = new Set(pool.boards.map((b) => b.id));
const dup = boards.filter((b) => have.has(b.id)).map((b) => b.id);
if (dup.length) { console.error(`refusing to append: ids already in the pool: ${dup.join(", ")}`); process.exit(1); }
let index = Math.max(...pool.boards.map((b) => b.index));
const appended = boards.map((b) => { index += 1; return { id: b.id, version: b.version, index, title: `Unlimited ${index}`, status: b.status, humanApproved: !!b.humanApproved,
  clues: b.clues, cards: b.cards, solution: b.solution,
  reveal: b.reveal.map((r) => ({ position: r.position, clue: r.clue, wordA: r.wordA, wordB: r.wordB, wordAConnection: r.wordAConnection, wordBConnection: r.wordBConnection, revealExplanation: r.revealExplanation, reference: r.reference, pairId: r.pairId })) }; });
const next = { _metadata: { ...pool._metadata, batches: [...(pool._metadata.batches || [{ batch: pool._metadata.batch, seed: pool._metadata.seed, boards: pool.boards.length }]), { batch: _metadata.batch, seed: _metadata.seed, boards: boards.length, appended: new Date().toISOString(), source: src }], boards: pool.boards.length + appended.length }, boards: [...pool.boards, ...appended] };
if (JSON.stringify(next.boards.slice(0, pool.boards.length)) !== existingJson) { console.error("refusing to write: existing boards would change"); process.exit(1); }
writeFileSync(POOL, JSON.stringify(next, null, 1) + "\n");
console.log(`appended ${appended.length} boards (${appended[0].id}…${appended[appended.length - 1].id}, indices ${appended[0].index}–${appended[appended.length - 1].index}) behind ${pool.boards.length} existing boards -> ${POOL}`);
