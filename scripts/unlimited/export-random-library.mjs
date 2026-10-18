#!/usr/bin/env node
// Exports the client library for random Unlimited boards (src/unlimited/random-library.json).
//   node scripts/unlimited/export-random-library.mjs
// Per eligible pair it keeps ONLY what may be served, chosen exactly as board
// assembly does (hintChoices over playable hints, preferences.json applied):
//   canonical    an approved clearly-best hint: the single choice;
//   equal-tier   an approved set of editorially equal hints: every playable member
//                (the client varies only among these); none playable → pair left out;
//   provisional  no approved preference: the single stable top candidate.
// Held and rejected hints, hints equal to a target, and pairs under a generation
// hold never reach the client. Player-facing text is copied as-is (frozen into
// each generated board's snapshot at creation).
// words: the complete word-bank snapshot (data/unlimited/wordbank/wordbank.json,
// exported page by page by export-wordbank.mjs). The 20 extra words on a board
// come from it; every target word must be in it too.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { hintChoices, normHint } from "./assemble-boards.mjs";

const LIB = "data/unlimited/library/pairs.json";
const PREF = "data/unlimited/library/preferences.json";
const WORDS = "data/unlimited/wordbank/wordbank.json";
const OUT = "src/unlimited/random-library.json";
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);

const lib = JSON.parse(readFileSync(LIB, "utf8"));
const preferences = JSON.parse(readFileSync(PREF, "utf8")).pairs || {};
const bank = JSON.parse(readFileSync(WORDS, "utf8"));
const words = bank.words;
if (words.length < 100 || new Set(words).size !== words.length || words.some((w) => w !== normHint(w) || !w)) throw new Error("the word-bank snapshot must be distinct, normalised words");
if (words.length !== bank._metadata.distinctNormalised || bank._metadata.rowCount !== bank._metadata.databaseCount) throw new Error("the word-bank snapshot is incomplete");
const W = new Set(words);

const pairs = [];
const tally = { libraryPairs: lib.pairs.length, withPlayableHint: 0, generationHold: 0, noChoice: 0, eligible: 0, rules: {} };
for (const p of lib.pairs) {
  if (!W.has(p.a) || !W.has(p.b)) throw new Error(`${p.pair_id}: word outside the word bank`);
  const playable = p.clues.filter((c) => PLAYABLE.has(c.status) && normHint(c.text) !== normHint(p.a) && normHint(c.text) !== normHint(p.b));
  if (!playable.length) continue;
  tally.withPlayableHint++;
  if (p.generationHold) { tally.generationHold++; continue; }
  const ch = hintChoices(p, playable, preferences);
  if (!ch.hints.length) { tally.noChoice++; continue; }
  tally.eligible++; tally.rules[ch.rule] = (tally.rules[ch.rule] || 0) + 1;
  pairs.push({
    id: p.pair_id, a: p.a, b: p.b, rule: ch.rule,
    hints: ch.hints.map((h) => ({
      text: normHint(h.text), status: h.status,
      wordAConnection: h.wordAConnection || "", wordBConnection: h.wordBConnection || "",
      revealExplanation: h.revealExplanation || "", reference: h.reference || null,
    })),
  });
}
pairs.sort((x, y) => x.id.localeCompare(y.id));
const body = { words, pairs };
const contentHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
let commit = null; try { commit = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* not a checkout */ }
const out = { _metadata: { purpose: "client library for random Unlimited boards; only served choices", sourceCommit: commit, sources: [LIB, PREF, WORDS], wordBank: { fetchedAt: bank._metadata.fetchedAt, databaseCount: bank._metadata.databaseCount, contentHash: bank._metadata.contentHash }, contentHash, tally }, ...body };
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`${OUT}: ${pairs.length} eligible pairs, ${words.length} words, content sha256 ${contentHash.slice(0, 16)}… | ${JSON.stringify(tally)}`);
