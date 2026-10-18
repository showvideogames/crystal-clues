// The exhaustive manifest: exactly 1,225 unique pairs, persistent batch
// assignments across reruns (before and after pairs are completed), and
// lifecycle/state bookkeeping.
//   node --test scripts/unlimited/manifest.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildManifest, BATCH_SIZE } from "./manifest-1225.mjs";

const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word);
const emptyPool = { _metadata: { batches: [] }, boards: [] };
const hint = (text, verdict = "PASS", status = "ai_reviewed") => ({ text, status, wordAConnection: "a", wordBConnection: "b", revealExplanation: text, provenance: { blindReview: { verdict, a: 2, b: 2, fairness: 2 } } });

test("exactly 1,225 unique pairs over the 50 words, each word in 49 pairs", () => {
  const m = buildManifest({ words, lib: { pairs: [] }, pool: emptyPool });
  assert.equal(m.pairs.length, 1225);
  assert.equal(new Set(m.pairs.map((p) => p.pair_id)).size, 1225);
  for (const w of words) assert.equal(m.pairs.filter((p) => p.a === w || p.b === w).length, 49);
  for (const p of m.pairs) assert.ok(p.a < p.b, "canonical order");
  assert.equal(m.summary.hole, 1225);
});

test("first run assigns every hole to fixed batches of 40 from u04 in pair-id order", () => {
  const m = buildManifest({ words, lib: { pairs: [] }, pool: emptyPool, now: "2026-10-17T00:00:00Z" });
  assert.ok(m.pairs.every((p) => p.plannedBatch));
  assert.equal(m.pairs[0].plannedBatch, "u04");
  assert.equal(m.pairs[BATCH_SIZE - 1].plannedBatch, "u04");
  assert.equal(m.pairs[BATCH_SIZE].plannedBatch, "u05");
  const sizes = Object.values(m.summary.batches).map((b) => b.pairs);
  assert.ok(sizes.slice(0, -1).every((n) => n === BATCH_SIZE));
  assert.equal(sizes.reduce((a, b) => a + b, 0), 1225);
});

test("assignments persist across reruns, before and after a pair is authored, reviewed and completed", () => {
  const first = buildManifest({ words, lib: { pairs: [] }, pool: emptyPool, now: "2026-10-17T00:00:00Z" });
  const target = first.pairs.find((p) => p.plannedBatch === "u05");
  // The pair is authored (candidate) …
  const asCandidate = { pairs: [{ pair_id: target.pair_id, a: target.a, b: target.b, source: "t", clues: [{ text: "X", status: "candidate" }] }] };
  const second = buildManifest({ words, lib: asCandidate, pool: emptyPool, previous: first, now: "2026-10-18T00:00:00Z" });
  const t2 = second.pairs.find((p) => p.pair_id === target.pair_id);
  assert.equal(t2.state, "candidate"); assert.equal(t2.lifecycle, "authored");
  assert.equal(t2.plannedBatch, "u05", "assignment kept after authoring");
  assert.equal(t2.assignedAt, "2026-10-17T00:00:00Z", "original assignment time kept");
  // … then reviewed and playable, and then served on a board.
  const asPlayable = { pairs: [{ pair_id: target.pair_id, a: target.a, b: target.b, source: "t", clues: [hint("X")] }] };
  const pool = { _metadata: { batches: [{ batch: "beta-01" }] }, boards: [{ id: "beta-01-001", index: 1, reveal: [{ pairId: target.pair_id, clue: "X", wordA: target.a, wordB: target.b }] }] };
  const third = buildManifest({ words, lib: asPlayable, pool, previous: second, now: "2026-10-19T00:00:00Z" });
  const t3 = third.pairs.find((p) => p.pair_id === target.pair_id);
  assert.equal(t3.state, "playable"); assert.equal(t3.lifecycle, "reviewed");
  assert.equal(t3.plannedBatch, "u05", "assignment kept after completion");
  assert.deepEqual(t3.servedLiveIn, ["beta-01-001:X"]);
  // Nothing else moved, and the batch's own tally shows one completed pair.
  for (const p of third.pairs) assert.equal(p.plannedBatch, first.pairs.find((q) => q.pair_id === p.pair_id).plannedBatch);
  assert.equal(third.summary.batches.u05.playable, 1);
  assert.equal(third.summary.batches.u05.hole, BATCH_SIZE - 1);
  assert.equal(third.summary.hole, 1224);
  assert.equal(third.summary.pairs, 1225);
});

test("a pair that already has a record on the first run gets no batch; reruns never assign it one", () => {
  const lib = { pairs: [{ pair_id: "p_apple__bank", a: "APPLE", b: "BANK", source: "t", clues: [hint("X")] }] };
  const first = buildManifest({ words, lib, pool: emptyPool });
  const p = first.pairs.find((x) => x.pair_id === "p_apple__bank");
  assert.equal(p.state, "playable"); assert.equal(p.plannedBatch, undefined);
  assert.equal(first.pairs.filter((x) => x.plannedBatch).length, 1224);
  const second = buildManifest({ words, lib, pool: emptyPool, previous: first });
  assert.equal(second.pairs.find((x) => x.pair_id === "p_apple__bank").plannedBatch, undefined);
});

test("held-only pairs carry a bestAvailableCandidate and are never counted playable; released vs pending coverage is separate", () => {
  const lib = { pairs: [{ pair_id: "p_apple__bank", a: "APPLE", b: "BANK", source: "t", clues: [hint("WEAK", "BORDERLINE", "held"), hint("BAD", "FAIL", "rejected")] }, { pair_id: "p_apple__bat", a: "APPLE", b: "BAT", source: "t", clues: [hint("OK")] }] };
  const pool = { _metadata: { batches: [{ batch: "beta-01" }, { batch: "beta-02", appended: "2026-10-17" }] }, boards: [
    { id: "beta-01-001", index: 1, reveal: [{ pairId: "p_apple__bat", clue: "OK" }] },
    { id: "beta-02-001", index: 9, reveal: [{ pairId: "p_apple__bat", clue: "OK" }] } ] };
  const m = buildManifest({ words, lib, pool });
  const held = m.pairs.find((x) => x.pair_id === "p_apple__bank");
  assert.equal(held.state, "held_only");
  assert.deepEqual(held.playable, []);
  assert.equal(held.bestAvailableCandidate.text, "WEAK");
  assert.equal(m.summary.servedLive, 1); assert.equal(m.summary.pendingLocal, 1);
  assert.deepEqual(m.summary.boards, { released: 1, pendingLocal: 1, pendingBatches: ["beta-02"] });
});
