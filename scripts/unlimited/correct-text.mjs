#!/usr/bin/env node
// Corrects the player-facing text of one existing hint, keeping the old text in
// provenance.textCorrection (status, verdict and scores are untouched).
//   node scripts/unlimited/correct-text.mjs <WORD> <WORD> <HINT> --by <who> --note "<why>"
//        [--why "<explanation sentence>"] [--a "<link to first word>"] [--b "<link to second word>"]
// --a / --b follow the order the words were typed. Only the fields given change.
import { readFileSync, writeFileSync } from "node:fs";
import { PATHS, pairOf, normWord } from "./catalogue-lib.mjs";

const flags = {}; const args = [];
const rest = process.argv.slice(2);
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else args.push(rest[i]);
}
const fail = (m) => { console.error(m); process.exit(2); };
if (args.length !== 3 || !flags.by || !flags.note || !(flags.why || flags.a || flags.b)) fail('usage: correct-text.mjs <WORD> <WORD> <HINT> --by <who> --note "<why>" [--why ..] [--a ..] [--b ..]');
const { a, id } = pairOf(args[0], args[1]);
const typed = normWord(args[0]) === a;
const lib = JSON.parse(readFileSync(PATHS.pairs, "utf8"));
const c = lib.pairs.find((p) => p.pair_id === id)?.clues.find((x) => x.text === normWord(args[2]));
if (!c) fail(`${id} has no hint ${normWord(args[2])}`);
const next = { revealExplanation: flags.why, wordAConnection: typed ? flags.a : flags.b, wordBConnection: typed ? flags.b : flags.a };
const from = {}, to = {};
for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== c[k]) { from[k] = c[k]; to[k] = v; c[k] = v; }
if (!Object.keys(to).length) fail("nothing to change");
c.provenance = c.provenance || {};
const entry = { by: flags.by, date: new Date().toISOString().slice(0, 10), from, to, note: `${flags.note}; player-facing text only; verdict and status unchanged` };
// Keep an earlier correction (AQUARIUM-style single object) as history.
const prev = c.provenance.textCorrection;
c.provenance.textCorrection = entry;
if (prev) c.provenance.textCorrectionHistory = [...(c.provenance.textCorrectionHistory || []), prev];
writeFileSync(PATHS.pairs, JSON.stringify(lib, null, 2) + "\n");
console.log(`${id} ${c.text}: ${JSON.stringify(to)}`);
