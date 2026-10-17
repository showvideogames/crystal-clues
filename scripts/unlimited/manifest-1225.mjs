#!/usr/bin/env node
// The exhaustive pair manifest: every unordered pair of the approved 50-word
// shortlist (50 × 49 / 2 = 1,225), with its current state from the pair
// library. Read-only over the library; makes no calls, changes no data.
//   node scripts/unlimited/manifest-1225.mjs [--out data/unlimited/library/manifest-1225.json]
//
// Pair states (one per pair, in this order of precedence):
//   playable       at least one hint passed the blind review and has player text (ai_reviewed / human_approved)
//   held_only      reviewed, no playable hint, but at least one held hint: a bestAvailable candidate exists
//   rejected_only  reviewed, every hint failed: needs a repair pass
//   candidate      authored, blind review not yet run
//   hole           no library record at all: needs authoring
//
// Batch assignments are PERSISTENT: the first run assigns every hole to a
// fixed batch (u04, u05, … in pair-id order, 40 per batch) and every later run
// reads the previous manifest and keeps each pair's plannedBatch exactly as it
// was, whether or not the pair has since been authored, reviewed or closed. A
// pair is never reassigned. Each pair also carries a lifecycle:
//   planned → authored → reviewed → closed (closed = reviewed with no playable
//   hint after its repair pass, keeping a bestAvailableCandidate; set by a
//   person through overrides/closures, not here).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const BATCH_SIZE = 40;
export const FIRST_BATCH = 4;
const strength = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };

/**
 * Pure: builds the manifest from the shortlist words, the library, the pool
 * and (optionally) the previous manifest whose assignments must be kept.
 */
export function buildManifest({ words, lib, pool, previous = null, now = new Date().toISOString() }) {
  const sorted = [...words].sort();
  const byId = new Map(lib.pairs.map((p) => [p.pair_id, p]));
  const pendingBatches = new Set((pool._metadata?.batches || []).filter((b) => b.appended).map((b) => b.batch));
  const batchOf = (id) => id.replace(/-\d+$/, "");
  const servedIn = {}, pendingIn = {};
  for (const b of pool.boards) for (const r of b.reveal) {
    const bucket = pendingBatches.has(batchOf(b.id)) ? pendingIn : servedIn;
    (bucket[r.pairId] = bucket[r.pairId] || []).push(`${b.id}:${r.clue}`);
  }
  const prevById = new Map((previous?.pairs || []).map((p) => [p.pair_id, p]));

  const pairs = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    const id = `p_${a.toLowerCase()}__${b.toLowerCase()}`;
    const p = byId.get(id);
    const prev = prevById.get(id);
    const row = { pair_id: id, a, b };
    if (!p) { row.state = "hole"; row.lifecycle = "planned"; }
    else {
      const counts = { ai_reviewed: 0, held: 0, rejected: 0, candidate: 0, human_approved: 0 };
      for (const c of p.clues) counts[c.status] = (counts[c.status] || 0) + 1;
      row.source = p.source; row.hints = p.clues.length; row.counts = counts;
      row.playable = p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").map((c) => c.text);
      if (row.playable.length) row.state = "playable";
      else if (counts.held) row.state = "held_only";
      else if (counts.rejected && !counts.candidate) row.state = "rejected_only";
      else row.state = "candidate";
      row.lifecycle = row.state === "candidate" ? "authored" : (prev?.lifecycle === "closed" ? "closed" : "reviewed");
      if (!row.playable.length) {
        const held = p.clues.filter((c) => c.status === "held").sort((x, y) => strength(y) - strength(x));
        if (held[0]) row.bestAvailableCandidate = { text: held[0].text, verdict: held[0].provenance?.blindReview?.verdict || null, reason: held[0].provenance?.blindReview?.reason || held[0].heldReason || null, heldReason: held[0].heldReason || null };
      }
      if (p.generationHold) row.generationHold = p.generationHold.reason;
    }
    if (servedIn[id]) row.servedLiveIn = servedIn[id];
    if (pendingIn[id]) row.pendingLocalIn = pendingIn[id];
    // Persistent assignment: keep what the previous manifest said, whatever the pair's state is now.
    if (prev?.plannedBatch) { row.plannedBatch = prev.plannedBatch; row.assignedAt = prev.assignedAt || previous._metadata?.generated || now; }
    pairs.push(row);
  }
  // First-time assignment only for pairs that have none yet: holes, in pair-id order, 40 per batch,
  // continuing after the highest batch already assigned.
  const assignedBatches = pairs.filter((p) => p.plannedBatch).map((p) => Number(p.plannedBatch.slice(1)));
  let batchNo = assignedBatches.length ? Math.max(...assignedBatches) : FIRST_BATCH;
  let inBatch = assignedBatches.length ? pairs.filter((p) => p.plannedBatch === `u${String(batchNo).padStart(2, "0")}`).length : 0;
  if (inBatch >= BATCH_SIZE) { batchNo++; inBatch = 0; }
  for (const p of pairs) {
    if (p.plannedBatch || p.state !== "hole") continue;
    if (inBatch >= BATCH_SIZE) { batchNo++; inBatch = 0; }
    p.plannedBatch = `u${String(batchNo).padStart(2, "0")}`; p.assignedAt = now; inBatch++;
  }
  const tally = (k) => pairs.filter((p) => p.state === k).length;
  const batches = {};
  for (const p of pairs) if (p.plannedBatch) { const b = (batches[p.plannedBatch] = batches[p.plannedBatch] || { pairs: 0, hole: 0, candidate: 0, playable: 0, held_only: 0, rejected_only: 0 }); b.pairs++; b[p.state]++; }
  const summary = {
    words: sorted.length, pairs: pairs.length,
    authored: pairs.filter((p) => p.state !== "hole").length,
    reviewed: pairs.filter((p) => p.state !== "hole" && p.state !== "candidate").length,
    playable: tally("playable"), held_only: tally("held_only"), rejected_only: tally("rejected_only"), candidate: tally("candidate"), hole: tally("hole"),
    closed: pairs.filter((p) => p.lifecycle === "closed").length,
    withBestAvailableCandidate: pairs.filter((p) => p.bestAvailableCandidate).length,
    underGenerationHold: pairs.filter((p) => p.generationHold).length,
    servedLive: pairs.filter((p) => p.servedLiveIn).length,
    pendingLocal: pairs.filter((p) => p.pendingLocalIn).length,
    coveredByAnyBoard: pairs.filter((p) => p.servedLiveIn || p.pendingLocalIn).length,
    boards: { released: pool.boards.filter((b) => !pendingBatches.has(batchOf(b.id))).length, pendingLocal: pool.boards.filter((b) => pendingBatches.has(batchOf(b.id))).length, pendingBatches: [...pendingBatches] },
    hints: { total: lib.pairs.reduce((n, p) => n + p.clues.length, 0), playable: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").length, 0), held: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "held").length, 0), rejected: lib.pairs.reduce((n, p) => n + p.clues.filter((c) => c.status === "rejected").length, 0) },
    perWordHoles: Object.fromEntries(sorted.map((w) => [w, pairs.filter((p) => p.state === "hole" && (p.a === w || p.b === w)).length])),
    batches,
  };
  return { _metadata: { title: "Exhaustive pair manifest for the approved 50-word shortlist", generated: now, library: "data/unlimited/library/pairs.json", states: "playable | held_only | rejected_only | candidate | hole", lifecycle: "planned | authored | reviewed | closed", assignments: "plannedBatch is assigned once and never changes on later runs", note: "bestAvailableCandidate is the strongest non-playable hint, kept separate from playable eligibility; it is never published automatically" }, summary, pairs };
}

const isMain = process.argv[1] && /manifest-1225\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const OUT = arg("out", "data/unlimited/library/manifest-1225.json");
  const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word);
  const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
  const pool = JSON.parse(readFileSync("src/unlimited/pool.json", "utf8"));
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const manifest = buildManifest({ words, lib, pool, previous });
  if (previous) {
    const moved = manifest.pairs.filter((p) => { const q = previous.pairs.find((x) => x.pair_id === p.pair_id); return q?.plannedBatch && q.plannedBatch !== p.plannedBatch; });
    if (moved.length) { console.error(`refusing to write: ${moved.length} assignment(s) would change`); process.exit(1); }
  }
  writeFileSync(OUT, JSON.stringify(manifest, null, 1) + "\n");
  const { perWordHoles, batches, ...rest } = manifest.summary;
  console.log(JSON.stringify(rest, null, 1));
  console.log("batches:", Object.entries(batches).map(([k, v]) => `${k}:${v.pairs}(hole ${v.hole}, playable ${v.playable}, held ${v.held_only}, cand ${v.candidate})`).join(" "));
  console.log("holes per word:", Object.entries(perWordHoles).map(([w, n]) => `${w}:${n}`).join(" "));
  console.log(`-> ${OUT}`);
}
