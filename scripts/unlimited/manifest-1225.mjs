#!/usr/bin/env node
// The exhaustive pair manifest: every unordered pair of the approved 50-word
// shortlist (50 × 49 / 2 = 1,225), with its current state from the pair
// library. Read-only over the library; makes no calls, changes no data.
//   node scripts/unlimited/manifest-1225.mjs [--out data/unlimited/library/manifest-1225.json]
// Pair states (one per pair, in this order of precedence):
//   playable       at least one hint passed the blind review and has player text (ai_reviewed / human_approved)
//   held_only      reviewed, no playable hint, but at least one held hint (borderline or awaiting text): a bestAvailable candidate exists
//   rejected_only  reviewed, every hint failed: needs a repair pass
//   candidate      authored, blind review not yet run
//   hole           no library record at all: needs authoring
// Pairs under a generation hold are counted in their state and flagged.
import { readFileSync, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg("out", "data/unlimited/library/manifest-1225.json");
const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word).sort();
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const byId = new Map(lib.pairs.map((p) => [p.pair_id, p]));
// The bundled pool may hold boards that are released AND boards appended
// locally but not yet released (pool._metadata.batches entries with an
// "appended" stamp). Served-live counts only the released ones.
const pool = JSON.parse(readFileSync("src/unlimited/pool.json", "utf8"));
const pendingBatches = new Set((pool._metadata.batches || []).filter((b) => b.appended).map((b) => b.batch));
const releasedBoards = pool.boards.filter((b) => !pendingBatches.has(b.id.replace(/-\d+$/, "")));
const pendingBoards = pool.boards.filter((b) => pendingBatches.has(b.id.replace(/-\d+$/, "")));
const servedIn = {}, pendingIn = {};
for (const b of releasedBoards) for (const r of b.reveal) (servedIn[r.pairId] = servedIn[r.pairId] || []).push(`${b.id}:${r.clue}`);
for (const b of pendingBoards) for (const r of b.reveal) (pendingIn[r.pairId] = pendingIn[r.pairId] || []).push(`${b.id}:${r.clue}`);
const strength = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };

const pairs = [];
for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
  const a = words[i], b = words[j];
  const id = `p_${a.toLowerCase()}__${b.toLowerCase()}`;
  const p = byId.get(id);
  const row = { pair_id: id, a, b };
  if (!p) { row.state = "hole"; pairs.push(row); continue; }
  const counts = { ai_reviewed: 0, held: 0, rejected: 0, candidate: 0, human_approved: 0 };
  for (const c of p.clues) counts[c.status] = (counts[c.status] || 0) + 1;
  row.source = p.source; row.hints = p.clues.length; row.counts = counts;
  row.playable = p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").map((c) => c.text);
  if (row.playable.length) row.state = "playable";
  else if (counts.held) row.state = "held_only";
  else if (counts.rejected && !counts.candidate) row.state = "rejected_only";
  else row.state = "candidate";
  // The best available non-playable hint, kept apart from playable eligibility (never auto-published).
  if (!row.playable.length) {
    const held = p.clues.filter((c) => c.status === "held").sort((x, y) => strength(y) - strength(x));
    if (held[0]) row.bestAvailableCandidate = { text: held[0].text, verdict: held[0].provenance?.blindReview?.verdict || null, reason: held[0].provenance?.blindReview?.reason || held[0].heldReason || null, heldReason: held[0].heldReason || null };
  }
  if (p.generationHold) row.generationHold = p.generationHold.reason;
  if (servedIn[id]) row.servedLiveIn = servedIn[id];
  if (pendingIn[id]) row.pendingLocalIn = pendingIn[id];
  pairs.push(row);
}
// Planned authoring batches for the holes: fixed, resumable chunks of 40 in
// pair-id order (u04, u05, …). A batch is "done" when every pair in it has a
// library record and a blind verdict; re-running never reassigns a pair.
const BATCH_SIZE = 40;
let n = 0;
for (const p of pairs.filter((x) => x.state === "hole")) { p.plannedBatch = `u${String(4 + Math.floor(n / BATCH_SIZE)).padStart(2, "0")}`; n++; }
const tally = (k) => pairs.filter((p) => p.state === k).length;
const summary = {
  words: words.length, pairs: pairs.length,
  authored: pairs.filter((p) => p.state !== "hole").length,
  reviewed: pairs.filter((p) => p.state !== "hole" && p.state !== "candidate").length,
  playable: tally("playable"), held_only: tally("held_only"), rejected_only: tally("rejected_only"), candidate: tally("candidate"), hole: tally("hole"),
  withBestAvailableCandidate: pairs.filter((p) => p.bestAvailableCandidate).length,
  underGenerationHold: pairs.filter((p) => p.generationHold).length,
  servedLive: pairs.filter((p) => p.servedLiveIn).length,                       // released boards only (production)
  pendingLocal: pairs.filter((p) => p.pendingLocalIn).length,                   // appended locally, not released
  coveredByAnyBoard: pairs.filter((p) => p.servedLiveIn || p.pendingLocalIn).length,
  boards: { released: releasedBoards.length, pendingLocal: pendingBoards.length, pendingBatches: [...pendingBatches] },
  hints: { total: lib.pairs.reduce((n, p) => n + p.clues.length, 0), playable: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").length, 0), held: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "held").length, 0), rejected: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "rejected").length, 0) },
  perWordHoles: Object.fromEntries(words.map((w) => [w, pairs.filter((p) => p.state === "hole" && (p.a === w || p.b === w)).length])),
  plannedBatches: Object.entries(pairs.filter((p) => p.plannedBatch).reduce((acc, p) => { acc[p.plannedBatch] = (acc[p.plannedBatch] || 0) + 1; return acc; }, {})).map(([k, v]) => `${k}:${v}`),
};
writeFileSync(OUT, JSON.stringify({ _metadata: { title: "Exhaustive pair manifest for the approved 50-word shortlist", generated: new Date().toISOString(), library: "data/unlimited/library/pairs.json", states: "playable | held_only | rejected_only | candidate | hole", note: "bestAvailableCandidate is the strongest non-playable hint, kept separate from playable eligibility; it is never published automatically" }, summary, pairs }, null, 1) + "\n");
console.log(JSON.stringify({ ...summary, perWordHoles: undefined }, null, 1));
console.log("holes per word:", Object.entries(summary.perWordHoles).map(([w, n]) => `${w}:${n}`).join(" "));
console.log(`-> ${OUT}`);
