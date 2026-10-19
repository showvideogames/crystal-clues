#!/usr/bin/env node
// Collapses existing explanations of the form "<S> ..., and <S> ..." (same
// subject named twice) with collapse-lib, for the given batch sources.
//   node scripts/unlimited/collapse-fix.mjs x04c-b [more sources]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { collapse } from "./collapse-lib.mjs";
const sources = new Set(process.argv.slice(2));
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
let n = 0;
for (const p of lib.pairs) for (const c of p.clues) {
  if (!sources.has(c.provenance?.source)) continue;
  const parts = c.revealExplanation.replace(/\.$/, "").split(", and ");
  if (parts.length !== 2) continue;
  const joined = collapse(parts[0], parts[1].charAt(0).toUpperCase() + parts[1].slice(1));
  if (!joined) continue;
  const why = joined + ".";
  if (why === c.revealExplanation) continue;
  execFileSync(process.execPath, ["scripts/unlimited/correct-text.mjs", p.a, p.b, c.text, "--by", "main session (claude-opus-5-5), coordinator review", "--note", "same subject named twice; collapsed (collapse-lib)", "--why", why]);
  n++; console.log(`${c.text}: ${why}`);
}
console.log(`${n} explanations collapsed`);
