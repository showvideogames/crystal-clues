#!/usr/bin/env node
// Candidate batch from the strongest eligible connections only. Pure code, no
// model calls, no board-level semantic review. It ranks each playable pair by
// the blind scores of the hint it would actually serve (hintChoices: approved
// canonical / equal-tier / stable provisional top), keeps pairs at or above a
// strength floor, removes every pair already served by earlier batches, and
// hands the rest to the unchanged assembler (same geometry, distinct-hint and
// repetition rules). Seeds are tried in order; the first seed that reaches the
// requested count wins (deterministic).
//
//   node scripts/unlimited/assemble-strongest.mjs --count 16 --out data/unlimited/boards/beta-03 \
//     --exclude data/unlimited/boards/beta-01/boards.json,data/unlimited/boards/beta-02/boards.json \
//     [--min-strength 42] [--max-target 3] [--seeds 1-200]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { assembleBatch, hintChoices, normHint } from "./assemble-boards.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const COUNT = Number(arg("count", 16));
const OUT = arg("out", "data/unlimited/boards/beta-03");
const BATCH = OUT.split(/[\\/]/).pop();
const MIN = Number(arg("min-strength", 42)); // (a+b)*10+fairness: 42 = 2/2/2, 41 = 2/2/1
const MAX_TARGET = Number(arg("max-target", 3));
const [S0, S1] = arg("seeds", "1-200").split("-").map(Number);
const EXCL = (arg("exclude", "") || "").split(",").filter(Boolean);

const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => (typeof w === "string" ? w : w.word));
const preferences = JSON.parse(readFileSync("data/unlimited/library/preferences.json", "utf8")).pairs || {};
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
const strength = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };

const excludedPairs = new Set();
const priorHints = new Set();
for (const f of EXCL) for (const b of JSON.parse(readFileSync(f, "utf8")).boards) for (const r of b.reveal) { excludedPairs.add(r.pairId); priorHints.add(normHint(r.clue)); }

// Keep a pair only if the hint it would serve is strong; offer the assembler
// only that hint (or the approved equal set), so the batch serves the best clue.
const pool = [];
const tally = { playablePairs: 0, excludedPrior: 0, belowFloor: 0, noChoice: 0, kept: 0 };
for (const p of lib.pairs) {
  if (p.generationHold) continue;
  const hints = p.clues.filter((c) => PLAYABLE.has(c.status) && normHint(c.text) !== normHint(p.a) && normHint(c.text) !== normHint(p.b));
  if (!hints.length) continue;
  tally.playablePairs++;
  if (excludedPairs.has(p.pair_id)) { tally.excludedPrior++; continue; }
  const ch = hintChoices(p, hints, preferences);
  if (!ch.hints.length) { tally.noChoice++; continue; }
  const served = ch.hints.filter((h) => strength(h) >= MIN);
  if (!served.length) { tally.belowFloor++; continue; }
  tally.kept++;
  pool.push({ ...p, clues: served });
}

let res = null, seedUsed = null;
for (let s = S0; s <= S1; s++) {
  const r = assembleBatch({ pairs: pool, words, seed: s, count: COUNT, maxTarget: MAX_TARGET, batch: BATCH, excludePairs: new Set(), preferences });
  if (r.boards.length >= COUNT) { res = r; seedUsed = s; break; }
  if (!res || r.boards.length > res.boards.length) { res = r; seedUsed = s; }
}
mkdirSync(OUT, { recursive: true });
const out = { _metadata: { batch: BATCH, seed: seedUsed, assembled: new Date().toISOString(), selection: `strongest eligible: served hint blind strength >= ${MIN} ((a+b)*10+fairness), canonical/preferred choice only, pairs from ${EXCL.join(" + ") || "none"} excluded`, tally, maxTargetPerWord: MAX_TARGET, rules: "distinct normalised hint texts; hint ≠ own targets; 28 distinct words; no board-level semantic review (owner decision 2026-10-17)", statuses: "local candidate for parent review; not exported, not published", reusedHintTextsFromPriorBatches: res.boards.flatMap((b) => b.reveal.map((r) => r.clue)).filter((h) => priorHints.has(normHint(h))) }, boards: res.boards };
writeFileSync(`${OUT}/boards.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`seed ${seedUsed}: ${res.boards.length}/${COUNT} boards | pool ${pool.length} strong pairs | tally ${JSON.stringify(tally)} | prior hint texts reused: ${out._metadata.reusedHintTextsFromPriorBatches.length}`);
if (res.boards.length < COUNT) process.exitCode = 2;
