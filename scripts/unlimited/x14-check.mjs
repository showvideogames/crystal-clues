#!/usr/bin/env node
// Read-only check for drafters: is WORD + WORD -> HINT usable as a NEW candidate?
//   node scripts/unlimited/x14-check.mjs <WORD> <WORD> <HINT>
// OK only when both words are bank words, the hint passes the hint rule, the pair has no record
// at all (served, attempted, held or rejected), no rejections.json entry, and is not reserved
// for coordinator review (reserved-pairs.mjs).
import { loadCatalogue, pairOf, hintProblem } from "./catalogue-lib.mjs";
import { loadRejections } from "./rejections-lib.mjs";
import { reservedPairIds } from "./reserved-pairs.mjs";
const [x, y, h] = process.argv.slice(2);
if (!x || !y || !h) { console.log("usage: x14-check.mjs <WORD> <WORD> <HINT>"); process.exit(2); }
const ix = loadCatalogue(); const { a, b, id } = pairOf(x, y);
const miss = [a, b].filter((w) => !ix.inBank.has(w));
const why = miss.length ? `not in the bank: ${miss.join(", ")}` : hintProblem(h, a, b) || (ix.byId.has(id) ? `pair already has a record (${ix.byId.get(id).clues.map((c) => c.text).join(", ")})` : null) || (loadRejections().some((e) => pairOf(e.a, e.b).id === id) ? "pair has a rejections.json entry" : null) || (reservedPairIds().has(id) ? "pair is reserved for coordinator review (x11 animal x SHIP proposal)" : null);
console.log(why ? `NO ${a} + ${b} -> ${h}: ${why}` : `OK ${a} + ${b} -> ${h}`);
