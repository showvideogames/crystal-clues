#!/usr/bin/env node
// Review input and APPEND-ONLY merge for variation batches (x03: owner
// variations and related-index proposals), which may add a hint to a pair that
// is already in the library. merge-review.mjs replaces a pair's whole entry, so
// it must not be used for these.
//   node scripts/unlimited/variation-review.mjs input <batch.json>... --out <input.json> --key <key.json>
//   node scripts/unlimited/variation-review.mjs merge <review.json> <key.json>
// input: per pair, each hint with the explanation and the two per-word lines
// players see after the game; for a pair already in the library, its currently
// served hint(s) as context ("is there a clearly better hint?"), never scored.
// Author types, routes and strengths go only to the key.
// merge: PASS -> ai_reviewed, BORDERLINE -> held, FAIL -> rejected (never
// human_approved). A hint already recorded for the pair is left untouched and
// reported. Run apply-overrides.mjs afterwards (owner rejections win).
import { readFileSync, writeFileSync } from "node:fs";
import { PATHS, loadCatalogue, servedHints, normWord, PLAYABLE } from "./catalogue-lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null; };
const files = rest.filter((x, i) => !x.startsWith("--") && !rest[i - 1]?.startsWith("--"));
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const STATUS = { PASS: "ai_reviewed", BORDERLINE: "held", FAIL: "rejected" };

if (cmd === "input") {
  const ix = loadCatalogue();
  const input = { _instructions: "Score every hint for the pair it sits under. 'already_served' is context only: do not score it.", pairs: [] };
  const key = { batches: [], hints: [] };
  for (const f of files) {
    const batch = read(f);
    key.batches.push({ file: f, batch: batch._metadata.batch });
    for (const p of batch.pairs) {
      let entry = input.pairs.find((x) => x.pair_id === p.pair_id);
      if (!entry) {
        const lib = ix.byId.get(p.pair_id);
        const served = lib ? servedHints(ix, lib).hints : [];
        entry = { pair_id: p.pair_id, a: p.a, b: p.b, hints: [], ...(served.length ? { already_served: served.map((c) => ({ text: c.text, explanation: c.revealExplanation })) } : {}) };
        input.pairs.push(entry);
      }
      for (const c of p.clues) {
        if (entry.hints.some((h) => h.text === c.text)) continue;
        entry.hints.push({ text: c.text, explanation: c.revealExplanation, lines: { [p.a]: c.wordAConnection, [p.b]: c.wordBConnection } });
        key.hints.push({ pair_id: p.pair_id, a: p.a, b: p.b, batch: batch._metadata.batch, ...c });
      }
    }
  }
  input.pairs.sort((x, y) => x.pair_id.localeCompare(y.pair_id));
  writeFileSync(flag("out"), JSON.stringify(input, null, 1) + "\n");
  writeFileSync(flag("key"), JSON.stringify(key, null, 1) + "\n");
  console.log(`${flag("out")}: ${input.pairs.length} pairs, ${input.pairs.reduce((n, p) => n + p.hints.length, 0)} hints (${input.pairs.filter((p) => p.already_served).length} pairs already in the library)`);
} else if (cmd === "merge") {
  const [reviewPath, keyPath] = files;
  const review = read(reviewPath); const key = read(keyPath);
  const lib = read(PATHS.pairs);
  const counts = { ai_reviewed: 0, held: 0, rejected: 0, newPairs: 0, kept: [] };
  const meta = review._metadata || {};
  for (const rp of review.pairs) for (const h of rp.hints) {
    const k = key.hints.find((x) => x.pair_id === rp.pair_id && x.text === h.text);
    if (!k) { console.warn(`not in the key: ${rp.pair_id} ${h.text}`); continue; }
    let p = lib.pairs.find((x) => x.pair_id === rp.pair_id);
    if (!p) { p = { pair_id: k.pair_id, a: k.a, b: k.b, source: k.batch, pairNote: rp.pair_note || null, reviewerBestAvailable: null, playableHints: 0, clues: [] }; lib.pairs.push(p); counts.newPairs++; }
    if (p.clues.some((c) => normWord(c.text) === normWord(h.text))) { counts.kept.push(`${p.pair_id} ${h.text}`); continue; }
    const status = STATUS[h.verdict] || "held";
    counts[status]++;
    p.clues.push({
      text: normWord(h.text), status, heldReason: status === "held" ? "review: borderline" : null,
      type: k.type, wordAConnection: k.wordAConnection, wordBConnection: k.wordBConnection, revealExplanation: k.revealExplanation, reference: k.reference || null,
      provenance: {
        source: k.batch, ...(k.request ? { request: k.request } : {}), ...(k.routes ? { routes: k.routes, strength: k.strength } : {}),
        blindReview: { reviewer: meta.reviewer || "x03-reviewer", model: meta.model || null, date: meta.date || null, verdict: h.verdict, mechanism: h.mechanism, delight: h.delight, a: h.connection_to_a, b: h.connection_to_b, fairness: h.fairness, recognizability: h.recognizability, better_hint: h.better_hint || null, flags: h.flags || [], reason: h.reason, fix: h.fix || null },
      },
    });
    p.playableHints = p.clues.filter((c) => PLAYABLE.has(c.status)).length;
  }
  lib.pairs.sort((x, y) => x.pair_id.localeCompare(y.pair_id));
  lib._metadata.merges = [...(lib._metadata.merges || []), { review: reviewPath, key: keyPath, appendOnly: true, ai_reviewed: counts.ai_reviewed, held: counts.held, rejected: counts.rejected, newPairs: counts.newPairs }];
  writeFileSync(PATHS.pairs, JSON.stringify(lib, null, 2) + "\n");
  console.log(`appended: ai_reviewed ${counts.ai_reviewed}, held ${counts.held}, rejected ${counts.rejected}; ${counts.newPairs} new pairs; already recorded (untouched): ${counts.kept.length}${counts.kept.length ? ` ${counts.kept.join(", ")}` : ""}`);
} else {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
}
