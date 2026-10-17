#!/usr/bin/env node
// Assembles data/unlimited/batches/*.json into the canonical pilot dataset.
//
//   node scripts/unlimited/build-pilot.mjs
//
// Batch files use a loose authoring format: { a, b, clues:[{text,type,explanation}] }
// where a/b are bare normalized words in whatever order they were written.
// This script is the single place that decides canonical order, pair ids and ranks,
// so the output is deterministic no matter how the batches were authored.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "data", "unlimited");
const BATCHES = join(DATA, "batches");

const wordsDoc = JSON.parse(readFileSync(join(DATA, "pilot-words-20.json"), "utf8"));
const byNormalized = new Map(wordsDoc.words.map((w) => [w.normalized, w]));

const batchFiles = readdirSync(BATCHES).filter((f) => f.endsWith(".json")).sort();
if (!batchFiles.length) {
  console.error("No batch files found in data/unlimited/batches");
  process.exit(1);
}

const pairs = [];
const seen = new Map(); // pair_id -> source batch file

for (const file of batchFiles) {
  const batch = JSON.parse(readFileSync(join(BATCHES, file), "utf8"));
  for (const raw of batch) {
    const wa = byNormalized.get(raw.a);
    const wb = byNormalized.get(raw.b);
    if (!wa) throw new Error(`${file}: unknown word "${raw.a}"`);
    if (!wb) throw new Error(`${file}: unknown word "${raw.b}"`);
    if (wa.id === wb.id) throw new Error(`${file}: self-pair on "${raw.a}"`);

    // Canonical order: alphabetical by word id. Author order is irrelevant.
    const [first, second] = wa.id < wb.id ? [wa, wb] : [wb, wa];
    // ...with one exception. wordAConnection / wordBConnection are per-side, so if the batch
    // was authored in the reverse order they have to travel with their word. The batches are
    // all stored canonically today, so this is a safety net for future authoring, not a fixup.
    const flip = !(wa.id < wb.id);
    const pair_id = `p_${first.id.replace(/^w_/, "")}__${second.id.replace(/^w_/, "")}`;

    if (seen.has(pair_id)) {
      throw new Error(`${file}: duplicate pair ${pair_id} (already in ${seen.get(pair_id)})`);
    }
    seen.set(pair_id, file);

    pairs.push({
      pair_id,
      a: { id: first.id, display: first.display },
      b: { id: second.id, display: second.display },
      clues: raw.clues.map((c, i) => {
        const out = {
          rank: i + 1,
          text: c.text,
          type: c.type,
          explanation: c.explanation,
          wordAConnection: flip ? c.wordBConnection : c.wordAConnection,
          wordBConnection: flip ? c.wordAConnection : c.wordBConnection,
          revealExplanation: c.revealExplanation,
        };
        // Optional, so they are emitted only when the author supplied them.
        if (c.reference) out.reference = c.reference;
        if (c.needsHumanReview) out.needsHumanReview = c.needsHumanReview;
        return out;
      }),
    });
  }
}

pairs.sort((x, y) => x.pair_id.localeCompare(y.pair_id));

const n = wordsDoc.words.length;
const out = {
  _metadata: {
    title: "Cluevoyance Unlimited - 20-word pair-clue pilot",
    schema: "pair-clue-schema.json",
    generated_from: batchFiles,
    word_count: n,
    pair_count: pairs.length,
    expected_pair_count: (n * (n - 1)) / 2,
    clue_text_rule:
      "One uppercase word, or a familiar two-word phrase, up to 18 characters including the space. The game does not enforce a length in code (EditableClueTab only trims and uppercases). A clue may never be one of the twenty pilot words: a board word used as a clue is unplayable.",
    quality_note:
      "Every clue here survived the hand audit recorded in pilot-clue-quality-audit.json. That audit is editorial judgement, not something the validator can prove; validate-pilot.mjs checks structure only.",
    total_clues: pairs.reduce((s, p) => s + p.clues.length, 0),
  },
  pairs,
};

writeFileSync(join(DATA, "pilot-pair-clues-20.json"), JSON.stringify(out, null, 2));

console.log(`batches merged   ${batchFiles.length}`);
console.log(`pairs            ${pairs.length} of ${out._metadata.expected_pair_count} expected`);
console.log(`clues            ${out._metadata.total_clues}`);
if (pairs.length !== out._metadata.expected_pair_count) {
  const missing = [];
  const ids = new Set(pairs.map((p) => p.pair_id));
  const ws = wordsDoc.words;
  for (let i = 0; i < ws.length; i++)
    for (let j = i + 1; j < ws.length; j++) {
      const [x, y] = ws[i].id < ws[j].id ? [ws[i], ws[j]] : [ws[j], ws[i]];
      const id = `p_${x.id.replace(/^w_/, "")}__${y.id.replace(/^w_/, "")}`;
      if (!ids.has(id)) missing.push(id);
    }
  console.log(`MISSING (${missing.length}): ${missing.join(", ")}`);
}
