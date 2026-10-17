#!/usr/bin/env node
// Applies explicit human overrides (data/unlimited/library/overrides.json) to
// the pair library AFTER a merge. An override never raises a hint to playable
// (that is what the blind review is for); it can hold a passed hint out of
// the beta with a stated reason, or release a hold that was itself an
// override. Each applied override is recorded on the hint as `override`.
//   node scripts/unlimited/apply-overrides.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const LIB = "data/unlimited/library/pairs.json";
const OVR = "data/unlimited/library/overrides.json";
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const overrides = existsSync(OVR) ? JSON.parse(readFileSync(OVR, "utf8")).overrides : [];
let applied = 0;
for (const o of overrides) {
  const p = lib.pairs.find((x) => x.pair_id === o.pair_id);
  const c = p?.clues.find((x) => x.text === o.text);
  if (!c) { console.warn(`override target not in library: ${o.pair_id} ${o.text}`); continue; }
  if (o.status === "held") {
    c.status = "held"; c.heldReason = `override: ${o.reason}`;
  } else if (o.status === "release" && c.override) {
    c.status = c.provenance?.blindReview?.verdict === "PASS" ? "ai_reviewed" : "held"; c.heldReason = c.status === "held" ? "blind review: borderline" : null;
  } else { console.warn(`override for ${o.pair_id} ${o.text} ignored: it can only hold, or release a previous override`); continue; }
  c.override = { by: o.by, date: o.date, status: o.status, reason: o.reason };
  applied++;
}
for (const p of lib.pairs) p.playableHints = p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved").length;
writeFileSync(LIB, JSON.stringify(lib, null, 2) + "\n");
console.log(`applied ${applied} override(s); library ${lib.pairs.length} pairs, ${lib.pairs.reduce((n, p) => n + p.playableHints, 0)} playable hints`);
