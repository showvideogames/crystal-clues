#!/usr/bin/env node
// Prepares the consolidated offline batch (2026-10-22 snapshot, unique-candidate-picks.csv) for the
// normal append-only merge. No model calls; nothing in the batch is rewritten.
//   node scripts/unlimited/import-consolidated.mjs <path/to/unique-candidate-picks.csv>
// Every pick is classified once, in this order (the first rule that applies wins):
//   owner-queue      the pair is in the owner-approved queue: handled separately, never merged here
//   calibration      the pair is in the owner calibration notes (not for integration)
//   off-bank / hint-rule / target-form    the normal x14-check rules, plus the brief's "another form of
//                    a target" rule (BOWLER / BOWLING, DIVING / DIVER)
//   owner-rejection  rejections.json has an entry on the pair (same hint, or the pair already decided)
//   reserved         reserved for coordinator review (reserved-pairs.mjs)
//   duplicate        the pair already holds this hint (any spelling, any status): skipped
//   set-aside        imports/consolidated-1022/editorial-set-aside.json (kept for later review)
//   alternative      a different hint for a pair already in the library: appended, never replacing
//   new-pair         an unseen pair
// Writes the batch (library/batches/consolidated-1022-batch.json, with each hint's source record), a
// review + key in the variation-review format built from the batch's own independent PASS evidence,
// and the ledger (imports/consolidated-1022/ledger.csv, one row per pick). Then run:
//   node scripts/unlimited/variation-review.mjs merge data/unlimited/library/reviews/consolidated-1022-review.json data/unlimited/library/reviews/consolidated-1022-key.json
//   node scripts/unlimited/apply-overrides.mjs && node scripts/unlimited/export-random-library.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadCatalogue, pairOf, hintProblem, hintKey, normHint } from "./catalogue-lib.mjs";
import { loadRejections } from "./rejections-lib.mjs";
import { reservedPairIds } from "./reserved-pairs.mjs";

const BATCH = "consolidated-1022";
const DIR = `data/unlimited/imports/${BATCH}`;
const src = process.argv[2];
if (!src) { console.log("usage: import-consolidated.mjs <unique-candidate-picks.csv>"); process.exit(2); }

function parseCSV(s) {
  const rows = []; let r = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n") { r.push(f); rows.push(r); r = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  const head = rows.shift();
  return rows.filter((x) => x.length > 1).map((x) => Object.fromEntries(head.map((k, i) => [k, x[i]])));
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const raw = readFileSync(src, "utf8");
const picks = parseCSV(raw);
const ix = loadCatalogue(); const rejections = loadRejections(); const reserved = reservedPairIds();
const setAside = JSON.parse(readFileSync(`${DIR}/editorial-set-aside.json`, "utf8")).entries;
const setAsideFor = (id, h) => setAside.find((e) => { const [x, y] = e.pair.split(" + "); return pairOf(x, y).id === id && hintKey(e.hint) === hintKey(h); });
const OWNER_QUEUE = ["BELL + BOAT", "BELL + WATER", "CALCULATOR + HIGH", "CLOCK + HIGH", "MOUSE + QUEEN"].map((k) => pairOf(...k.split(" + ")).id);
const CALIBRATION = ["LIMOUSINE + SUGAR", "CLOUD + LAWYER"].map((k) => pairOf(...k.split(" + ")).id);
// The brief's "another form of a target" rule (x21 DIVING for SCUBA DIVER, x22 BOWLER for BOWLING).
const stem = (w) => w.replace(/[^A-Z]/g, "").replace(/(IEST|IER|IES|INGS|ING|ERS|ER|ED|ES|S|Y|LY)$/, "");
const targetForm = (h, a, b) => { const s = stem(hintKey(h)); return s.length >= 3 && [a, b].some((w) => w.split(" ").some((t) => stem(t) === s)); };

const ledger = []; const batchPairs = new Map(); const reviewPairs = new Map(); const keyHints = [];
const counts = {};
for (const p of picks) {
  const prov = JSON.parse(p.provenance);
  const first = prov[0]; const rec = JSON.parse(first.full_original_record);
  const [x, y] = p.pair_key.split(" + "); const { a, b, id } = pairOf(x, y);
  const hint = normHint(p.selected_hint);
  const lines = { [normHint(rec.word_a)]: rec.link_a, [normHint(rec.word_b)]: rec.link_b };
  const evidence = prov.flatMap((r) => JSON.parse(r.independent_evidence || "[]"));
  const row = { pair_id: id, a, b, hint, candidate_id: prov.map((r) => r.candidate_id).join(" / "), source: prov.map((r) => r.source).join(" / "), outcome: null, reason: "" };
  const lib = ix.byId.get(id);
  const rj = rejections.filter((e) => e.pair_id === id);
  let why;
  if (OWNER_QUEUE.includes(id)) row.outcome = "owner-queue", row.reason = "pair is in the owner-approved queue; see OWNER-QUEUE-PROPOSALS.md";
  else if (CALIBRATION.includes(id)) row.outcome = "calibration", row.reason = "pair is in the owner calibration notes (not for integration)";
  else if ((why = [a, b].filter((w) => !ix.inBank.has(w))).length) row.outcome = "off-bank", row.reason = `not in the bank: ${why.join(", ")}`;
  else if ((why = hintProblem(hint, a, b))) row.outcome = "hint-rule", row.reason = why;
  else if (targetForm(hint, a, b)) row.outcome = "target-form", row.reason = "another form of a target word (brief rule, BOWLER/BOWLING precedent)";
  else if (rj.length) row.outcome = "owner-rejection", row.reason = `rejections.json: ${rj.map((e) => `${e.hint} ${e.decision} by ${e.by}`).join("; ")}`;
  else if (reserved.has(id)) row.outcome = "reserved", row.reason = "reserved for coordinator review (x11 animal x SHIP proposal)";
  else if (lib && (why = lib.clues.find((c) => hintKey(c.text) === hintKey(hint)))) row.outcome = "duplicate", row.reason = `pair already holds ${why.text} (${why.status})`;
  else if ((why = setAsideFor(id, hint))) row.outcome = "set-aside", row.reason = `${why.category}: ${why.reason}`;
  else if (evidence.length === 0 || evidence.some((e) => !/^pass/i.test(e.verdict))) row.outcome = "conflicting-review", row.reason = `independent evidence: ${evidence.map((e) => e.verdict).join("/") || "none"}`;
  else {
    row.outcome = lib ? "alternative" : "new-pair";
    if (lib) row.reason = `appended beside ${lib.clues.map((c) => `${c.text} (${c.status})`).join(", ")}; served hint unchanged`;
    const clue = {
      text: hint, type: "consolidated-import",
      wordAConnection: lines[a], wordBConnection: lines[b],
      // The batch has per-word lines only; the reveal sentence is a plain template, no new claims.
      revealExplanation: `${hint} connects ${a} and ${b}.`, reference: null,
      importRecord: {
        candidate_ids: prov.map((r) => r.candidate_id), sources: prov.map((r) => r.source),
        difficulty: rec.difficulty || null, selfReview: { status: first.self_review_status, by: first.self_reviewer || rec.reviewer || null, note: rec.review_note || null },
        alternativesNote: rec.alternatives_and_choice || rec.alternatives_considered || null, independent: evidence,
        cloudEffectiveStatus: first.cloud_effective_status || null, revealExplanation: "template (the batch has no explanation sentence)",
      },
    };
    batchPairs.set(id, { pair_id: id, a, b, clues: [clue] });
    reviewPairs.set(id, { pair_id: id, hints: [{
      text: hint, verdict: "PASS", mechanism: null, delight: null, connection_to_a: null, connection_to_b: null, fairness: null, recognizability: null,
      better_hint: null, flags: [], reason: evidence.map((e) => `${e.source.split(";")[0]}: ${e.reason}`).join(" | "), fix: null,
    }] });
    keyHints.push({ pair_id: id, a, b, batch: BATCH, request: prov.map((r) => r.candidate_id).join(" / "), ...clue });
  }
  counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  ledger.push(row);
}

const sha = createHash("sha256").update(raw).digest("hex");
const meta = { batch: BATCH, prepared: "2026-10-21", source: { file: "unique-candidate-picks.csv", sha256: sha, rows: picks.length, archive: "Cluevoyance-final-consolidated.zip", archiveSha256: "b6d51bdf14c3ee029475e5a4e4e92fb35f0874ee4250888b664526e4385d329c", snapshot: "2026-10-22T03:21:38Z offline reconciliation" }, note: "reviewed offline candidates imported append-only; holds, rejects, raw attempts, partial batches, repair proposals and the owner queue are NOT imported" };
writeFileSync(`data/unlimited/library/batches/${BATCH}-batch.json`, JSON.stringify({ _metadata: meta, pairs: [...batchPairs.values()] }, null, 1) + "\n");
writeFileSync(`data/unlimited/library/reviews/${BATCH}-review.json`, JSON.stringify({ _metadata: { reviewer: `${BATCH} independent review (external offline reviewers; per-hint source in the reason and in the batch importRecord)`, model: null, date: "2026-10-22", verdicts: "every imported pick carried only independent pass verdicts; scores were not part of that review and are left null" }, pairs: [...reviewPairs.values()] }, null, 1) + "\n");
writeFileSync(`data/unlimited/library/reviews/${BATCH}-key.json`, JSON.stringify({ batches: [{ file: `data/unlimited/library/batches/${BATCH}-batch.json`, batch: BATCH }], hints: keyHints }, null, 1) + "\n");
const cols = ["pair_id", "a", "b", "hint", "outcome", "reason", "candidate_id", "source"];
writeFileSync(`${DIR}/ledger.csv`, [cols.join(","), ...ledger.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");
writeFileSync(`${DIR}/summary.json`, JSON.stringify({ ...meta, counts }, null, 1) + "\n");
console.log(`${picks.length} picks (sha256 ${sha.slice(0, 16)}…): ${JSON.stringify(counts)}`);
