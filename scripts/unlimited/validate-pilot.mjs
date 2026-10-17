#!/usr/bin/env node
// Deterministic structural validation of the pilot dataset.
//
//   node scripts/unlimited/validate-pilot.mjs
//
// Exits 1 if any ERROR is found. Warnings never fail the run.
// This checks structural completeness and obvious data faults only.
// It deliberately makes no judgement about whether a clue is any good.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "data", "unlimited");

const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const wordsDoc = read("pilot-words-20.json");
const dataset = read("pilot-pair-clues-20.json");
const schema = read("pair-clue-schema.json");

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------------------------------------------------------------------------
// Minimal JSON Schema checker covering the keywords used by our schema file.
// ---------------------------------------------------------------------------
function resolve(ref) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], schema);
}
function checkSchema(node, sch, path) {
  if (sch.$ref) return checkSchema(node, resolve(sch.$ref), path);
  if (sch.type === "object") {
    if (typeof node !== "object" || node === null || Array.isArray(node))
      return err(`schema: ${path} should be an object`);
    for (const r of sch.required || [])
      if (!(r in node)) err(`schema: ${path} is missing required property "${r}"`);
    if (sch.additionalProperties === false)
      for (const k of Object.keys(node))
        if (!(k in (sch.properties || {}))) err(`schema: ${path} has unexpected property "${k}"`);
    for (const [k, sub] of Object.entries(sch.properties || {}))
      if (k in node) checkSchema(node[k], sub, `${path}.${k}`);
  } else if (sch.type === "array") {
    if (!Array.isArray(node)) return err(`schema: ${path} should be an array`);
    if (sch.minItems != null && node.length < sch.minItems)
      err(`schema: ${path} has ${node.length} items, minimum is ${sch.minItems}`);
    if (sch.maxItems != null && node.length > sch.maxItems)
      err(`schema: ${path} has ${node.length} items, maximum is ${sch.maxItems}`);
    if (sch.items) node.forEach((it, i) => checkSchema(it, sch.items, `${path}[${i}]`));
  } else if (sch.type === "string") {
    if (typeof node !== "string") return err(`schema: ${path} should be a string`);
    if (sch.pattern && !new RegExp(sch.pattern).test(node))
      err(`schema: ${path} value "${node}" does not match ${sch.pattern}`);
    if (sch.minLength != null && node.length < sch.minLength)
      err(`schema: ${path} is shorter than ${sch.minLength} characters`);
    if (sch.maxLength != null && node.length > sch.maxLength)
      err(`schema: ${path} is longer than ${sch.maxLength} characters`);
    if (sch.enum && !sch.enum.includes(node)) err(`schema: ${path} value "${node}" is not an allowed value`);
  } else if (sch.type === "integer") {
    if (!Number.isInteger(node)) return err(`schema: ${path} should be an integer`);
    if (sch.minimum != null && node < sch.minimum) err(`schema: ${path} is below ${sch.minimum}`);
    if (sch.maximum != null && node > sch.maximum) err(`schema: ${path} is above ${sch.maximum}`);
  } else if (sch.enum) {
    if (!sch.enum.includes(node)) err(`schema: ${path} value "${node}" is not an allowed value`);
  }
}
checkSchema(dataset, schema, "root");

// ---------------------------------------------------------------------------
const words = wordsDoc.words;
const N = words.length;
const EXPECTED_PAIRS = (N * (N - 1)) / 2;
const ALLOWED_TYPES = schema.definitions.connectionType.enum;
const REFERENCE_TYPES = schema.definitions.reference.properties.referenceType.enum;
const RECOGNIZABILITY = schema.definitions.reference.properties.recognizability.enum;

// Words
if (N !== 20) err(`expected exactly 20 pilot words, found ${N}`);
const wordIds = new Set(words.map((w) => w.id));
if (wordIds.size !== N) err(`word ids are not unique (${wordIds.size} unique of ${N})`);
const displays = new Set(words.map((w) => w.display));
if (displays.size !== N) err(`display spellings are not unique`);
for (const w of words) {
  const expectedId = `w_${w.normalized}`;
  if (w.id !== expectedId) err(`word ${w.display}: id "${w.id}" is not deterministic, expected "${expectedId}"`);
  if (w.display.toLowerCase() !== w.normalized)
    err(`word ${w.display}: normalized "${w.normalized}" does not match the display spelling`);
  if (!w.reason || w.reason.trim().length < 10) err(`word ${w.display}: missing a selection reason`);
}

// Pairs
const pairs = dataset.pairs;
if (pairs.length !== EXPECTED_PAIRS) err(`expected ${EXPECTED_PAIRS} pair records, found ${pairs.length}`);

const seenPairIds = new Set();
const seenUnordered = new Set();
const appearances = new Map(words.map((w) => [w.id, 0]));

for (const p of pairs) {
  const where = p.pair_id || "<no id>";

  if (p.a.id === p.b.id) err(`${where}: self-pair`);
  if (!wordIds.has(p.a.id)) err(`${where}: unknown word "${p.a.id}"`);
  if (!wordIds.has(p.b.id)) err(`${where}: unknown word "${p.b.id}"`);

  // Canonical ordering is what makes reversed duplicates impossible.
  if (!(p.a.id < p.b.id)) err(`${where}: not in canonical order (${p.a.id} should sort before ${p.b.id})`);

  const expectedId = `p_${p.a.id.replace(/^w_/, "")}__${p.b.id.replace(/^w_/, "")}`;
  if (p.pair_id !== expectedId) err(`${where}: pair id is not deterministic, expected "${expectedId}"`);

  if (seenPairIds.has(p.pair_id)) err(`${where}: duplicate pair id`);
  seenPairIds.add(p.pair_id);

  // Order-independent duplicate check, belt and braces alongside the canonical check.
  const unordered = [p.a.id, p.b.id].sort().join("|");
  if (seenUnordered.has(unordered)) err(`${where}: this word combination already appears in another record`);
  seenUnordered.add(unordered);

  appearances.set(p.a.id, appearances.get(p.a.id) + 1);
  appearances.set(p.b.id, appearances.get(p.b.id) + 1);

  // Display text must match the word list, so the CSV and the game agree.
  const byId = new Map(words.map((w) => [w.id, w.display]));
  if (byId.get(p.a.id) !== p.a.display) err(`${where}: display "${p.a.display}" does not match the word list`);
  if (byId.get(p.b.id) !== p.b.display) err(`${where}: display "${p.b.display}" does not match the word list`);

  // Clues
  const clues = p.clues;
  if (clues.length < 2) err(`${where}: has ${clues.length} clues, minimum is 2`);
  if (clues.length > 5) err(`${where}: has ${clues.length} clues, maximum is 5`);

  const ranks = clues.map((c) => c.rank);
  const expectedRanks = clues.map((_, i) => i + 1);
  if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks))
    err(`${where}: ranks are ${ranks.join(",")}, expected ${expectedRanks.join(",")}`);

  const texts = clues.map((c) => c.text);
  if (new Set(texts).size !== texts.length) err(`${where}: repeats a clue word within the pair`);

  const explanations = clues.map((c) => c.explanation.trim().toLowerCase());
  if (new Set(explanations).size !== explanations.length)
    warn(`${where}: two clues share an identical explanation`);

  for (const c of clues) {
    const at = `${where} clue ${c.rank}`;
    if (!c.text || !c.text.trim()) err(`${at}: empty clue text`);
    if (!c.explanation || !c.explanation.trim()) err(`${at}: missing explanation`);
    if (!ALLOWED_TYPES.includes(c.type)) err(`${at}: connection type "${c.type}" is not allowed`);
    // The ONLY collision that disqualifies a clue is with its own two targets. A clue that is
    // some other word in the pool is allowed on purpose: HONEY + SHADOW -> MOON works through
    // honeymoon and moon shadow, and MOON being visible elsewhere on the board is useful
    // deduction or misdirection rather than a fault. Repetition across pair records is a
    // board-generation concern, resolved by picking a conflict-free combination at selection
    // time, never by deleting a good clue from the master data.
    if (c.text === p.a.display || c.text === p.b.display)
      err(`${at}: clue "${c.text}" is one of its own two target words`);
    if (!/^[A-Z]+(?: [A-Z]+)?$/.test(c.text))
      err(`${at}: clue "${c.text}" is not one or two uppercase words`);
    if (c.text.length > 18) err(`${at}: clue "${c.text}" is ${c.text.length} characters; the limit is 18`);
    if (!c.type || !c.type.trim()) err(`${at}: missing connection type`);
    if (c.explanation.trim().length < 20) warn(`${at}: explanation is very short`);

    // --- player-facing connection fields ------------------------------------
    const aConn = (c.wordAConnection || "").trim();
    const bConn = (c.wordBConnection || "").trim();
    const reveal = (c.revealExplanation || "").trim();
    if (!aConn) err(`${at}: missing wordAConnection`);
    if (!bConn) err(`${at}: missing wordBConnection`);
    if (!reveal) err(`${at}: missing revealExplanation`);
    if (aConn && bConn && aConn.toLowerCase() === bConn.toLowerCase())
      err(`${at}: wordAConnection and wordBConnection are identical`);

    // A connection that is only the clue word back again explains nothing.
    const bare = (s) => s.replace(/[^a-z ]/gi, "").trim().toLowerCase();
    for (const [label, text] of [["wordAConnection", aConn], ["wordBConnection", bConn], ["revealExplanation", reveal]])
      if (text && bare(text) === c.text.toLowerCase())
        err(`${at}: ${label} is circular - it is only the clue word again`);

    // Alignment: the fields are per-side, so a straight swap is the failure worth catching.
    // Flagged only when each side names the OTHER target and not its own.
    const names = (s, w) => new RegExp(`\\b${w}`, "i").test(s);
    if (
      aConn && bConn &&
      names(aConn, p.b.display) && !names(aConn, p.a.display) &&
      names(bConn, p.a.display) && !names(bConn, p.b.display)
    )
      warn(`${at}: wordAConnection and wordBConnection look swapped relative to ${p.a.display}/${p.b.display}`);

    // --- optional reference metadata ----------------------------------------
    if (c.reference) {
      const r = c.reference;
      if (!REFERENCE_TYPES.includes(r.referenceType))
        err(`${at}: reference.referenceType "${r.referenceType}" is not allowed`);
      if (!RECOGNIZABILITY.includes(r.recognizability))
        err(`${at}: reference.recognizability "${r.recognizability}" is not allowed`);
      if ("source" in r && (!r.source || !r.source.trim())) err(`${at}: reference.source is empty`);
      // A niche reference is fine as a lower-ranked alternative but must not be foundational.
      if (r.recognizability === "niche" && c.rank <= 2)
        warn(`${at}: niche reference is ranked ${c.rank}; niche clues should not be foundational`);
    }

    if (c.needsHumanReview && !c.needsHumanReview.trim())
      err(`${at}: needsHumanReview is present but empty`);
  }
}

// Every possible pair present exactly once
for (let i = 0; i < N; i++)
  for (let j = i + 1; j < N; j++) {
    const [x, y] = words[i].id < words[j].id ? [words[i], words[j]] : [words[j], words[i]];
    const id = `p_${x.id.replace(/^w_/, "")}__${y.id.replace(/^w_/, "")}`;
    if (!seenPairIds.has(id)) err(`missing pair record: ${id}`);
  }

// Each word in exactly N-1 pairs
for (const [id, count] of appearances)
  if (count !== N - 1) err(`word ${id} appears in ${count} pairs, expected ${N - 1}`);

// Metadata agreement
const totalClues = pairs.reduce((s, p) => s + p.clues.length, 0);
if (dataset._metadata.pair_count !== pairs.length) err(`metadata pair_count disagrees with the data`);
if (dataset._metadata.total_clues !== totalClues) err(`metadata total_clues disagrees with the data`);

// ---------------------------------------------------------------------------
const dist = {};
for (const p of pairs) dist[p.clues.length] = (dist[p.clues.length] || 0) + 1;
const types = {};
for (const p of pairs) for (const c of p.clues) types[c.type] = (types[c.type] || 0) + 1;

// Reuse across pair records is EXPECTED and is not a defect. There is deliberately no global
// frequency ceiling in the master data, and no clue is ever deleted for being popular. The
// count below is reported for board generation, which resolves collisions by choosing a
// conflict-free combination for each puzzle. It is information, not a warning.
const clueFreq = new Map();
for (const p of pairs)
  for (const c of p.clues) clueFreq.set(c.text, (clueFreq.get(c.text) || 0) + 1);
const reused = [...clueFreq].filter(([, n]) => n > 4).sort((a, b) => b[1] - a[1]);

console.log(`words            ${N}`);
console.log(`pairs            ${pairs.length} (expected ${EXPECTED_PAIRS})`);
console.log(`clues            ${totalClues}`);
console.log(`avg clues/pair   ${(totalClues / pairs.length).toFixed(2)}`);
console.log(`clue count spread ${Object.entries(dist).sort().map(([k, v]) => `${k}:${v}`).join("  ")}`);
console.log(`connection types  ${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`distinct clues   ${clueFreq.size} across ${totalClues} clue records`);
console.log(
  `reused >4 pairs  ${reused.length ? reused.map(([t, n]) => `${t}=${n}`).join(", ") : "none"}` +
    `  (expected; resolved per puzzle at selection time, never by deletion)`
);
console.log("");
if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}) - these do not fail validation:`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log("");
}
if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  x ${e}`);
  process.exit(1);
}
console.log("PASS - no structural errors.");
console.log(
  "This proves structure only. Whether a clue is any good is a judgement, recorded by hand in\n" +
    "data/unlimited/pilot-clue-quality-audit.json and summarised in pilot-quality-review.md."
);
