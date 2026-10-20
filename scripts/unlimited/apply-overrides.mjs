#!/usr/bin/env node
// Applies explicit human overrides (data/unlimited/library/overrides.json) to
// the pair library AFTER a merge. An override never raises a hint to playable
// (that is what the blind review is for); it can hold a passed hint out of
// the beta with a stated reason, or release a hold that was itself an
// override. Each applied override is recorded on the hint as `override`.
// Owner rejections/holds from rejections.json are applied last.
//   node scripts/unlimited/apply-overrides.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadRejections } from "./rejections-lib.mjs";
const LIB = "data/unlimited/library/pairs.json";
const OVR = "data/unlimited/library/overrides.json";
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const overrides = existsSync(OVR) ? JSON.parse(readFileSync(OVR, "utf8")).overrides : [];
let applied = 0;
const history = new Map();   // superseded overrides, kept on the hint as history only
const keyOf = (id, t) => id + "|" + t;
const rec = (o) => ({ by: o.by, date: o.date, status: o.status, reason: o.reason, superseded: o.superseded });
for (const p of lib.pairs) delete p.generationHold;   // recomputed from the overrides file every run
for (const o of overrides) {
  const p = lib.pairs.find((x) => x.pair_id === o.pair_id);
  if (o.status === "hold_pair") {
    if (!p) { console.warn(`pair hold target not in library: ${o.pair_id}`); continue; }
    // Future generation only: the assembler skips the pair; nothing already assembled changes.
    p.generationHold = { by: o.by, date: o.date, reason: o.reason };
    applied++;
    continue;
  }
  const c = p?.clues.find((x) => x.text === o.text);
  if (!c) { console.warn(`override target not in library: ${o.pair_id} ${o.text}`); continue; }
  if (o.superseded) {   // a later decision replaced this one: never applied, recorded as history
    const k = keyOf(o.pair_id, o.text); history.set(k, [...(history.get(k) || []), rec(o)]); continue;
  }
  if (o.status === "held") {
    c.status = "held"; c.heldReason = `override: ${o.reason}`;
  } else if (o.status === "human_approved") {
    // A person's decision that the hint is playable. The independent scores and reasons are untouched.
    c.status = "human_approved"; c.heldReason = null;
  } else if (o.status === "coordinator_accept") {
    // A coordinator's decision that a reviewer-held hint is playable (labelled, never an owner
    // decision); the independent review (verdict, scores, reason) is left exactly as it was.
    c.status = "ai_reviewed"; c.heldReason = null;
  } else if (o.status === "release" && c.override) {
    c.status = c.provenance?.blindReview?.verdict === "PASS" ? "ai_reviewed" : "held"; c.heldReason = c.status === "held" ? "blind review: borderline" : null;
  } else { console.warn(`override for ${o.pair_id} ${o.text} ignored: it can only hold, or release a previous override`); continue; }
  c.override = { by: o.by, date: o.date, status: o.status, reason: o.reason };
  if (o.endorsed) c.override.endorsed = o.endorsed;   // a later endorsement of the same decision (e.g. the owner)
  if (history.has(keyOf(o.pair_id, o.text))) c.override.history = history.get(keyOf(o.pair_id, o.text));
  applied++;
}
// Owner rejections and holds (rejections.json) win over any review or override:
// a re-review or a new merge cannot bring a recorded combination back.
for (const e of loadRejections()) {
  const c = lib.pairs.find((x) => x.pair_id === e.pair_id)?.clues.find((x) => x.text === e.hint);
  if (!c) continue;   // not in the library: the entry still blocks catalogue add and drafting
  // Most entries are the owner's own; the few recorded by a coordinator or a fact check say so.
  const who = /^owner/.test(e.by || "") ? "owner" : "recorded";
  c.status = e.decision; c.heldReason = `${who} ${e.decision === "rejected" ? "rejection" : "hold"}: ${e.reason}`;
  c.override = { by: e.by, date: e.date, status: e.decision, reason: e.reason, via: "rejections.json" };
  if (history.has(keyOf(e.pair_id, e.hint))) c.override.history = history.get(keyOf(e.pair_id, e.hint));
  applied++;
}
for (const p of lib.pairs) p.playableHints = p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").length;
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`applied ${applied} override(s); library ${lib.pairs.length} pairs, ${lib.pairs.reduce((n, p) => n + p.playableHints, 0)} playable hints`);
