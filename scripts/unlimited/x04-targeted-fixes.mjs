#!/usr/bin/env node
// x04 coordinator review: targeted text fixes, no model calls. Each rule is a
// literal substitution applied to the explanation sentence AND both per-word
// lines of every matching hint, so a correction cannot leave the combined
// sentence stale. Old text goes to provenance.textCorrection (correct-text.mjs).
//   node scripts/unlimited/x04-targeted-fixes.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RULES = [
  { hint: "BOLT", from: "Bolt is a Disney movie about a superhero dog", to: "Bolt is a Disney movie about a TV-star dog who believes his fictional superpowers are real", note: "Bolt only believes his TV powers are real" },
  { hint: "SEAGULL", from: "Seagulls swarm every beach", to: "Seagulls are a familiar sight at the beach", note: "no absolute claim" },
  { hint: "SEAGULL", from: "squawk \"Mine! Mine!\".", to: "squawk \"Mine! Mine!\"", note: "no extra period after the quoted exclamation" },
  { hint: "MINT", from: "collectors pay top dollar for baseball cards in mint condition", to: "collectors describe pristine cards as being in mint condition", note: "mint condition means near-perfect, not necessarily valuable" },
  { hint: "MINT", from: "Collectors pay top dollar for baseball cards in mint condition", to: "Collectors describe pristine cards as being in mint condition", note: "mint condition means near-perfect, not necessarily valuable" },
  { hint: "PUNCH", from: "fruit punch is a sweet red drink", to: "fruit punch is a sweet fruit drink", note: "fruit punch is not always red" },
  { hint: "PUNCH", from: "Fruit punch is a sweet red drink", to: "Fruit punch is a sweet fruit drink", note: "fruit punch is not always red" },
  { hint: "CHECKMATE", from: "Checkmate ends a chess game when every escape is forbidden: any move would leave the king in check.", to: "Checkmate ends a chess game: the king is in check and there is no legal move to escape it.", note: "say explicitly that the king is in check with no legal escape" },
  { hint: "WINE", from: "Fine wine is aged in the bottle, getting better as the years pass.", to: "Some wines improve with age, resting in the bottle as the years pass.", note: "not every wine improves with age" },
  { hint: "HELICOPTER", from: "A helicopter flies like a plane, with blades that spin round and round on top.", to: "A helicopter is an aircraft whose blades spin round and round on top.", note: "describe the helicopter itself, not 'like a plane'" },
  { hint: "MURDER", from: "Murder mysteries often begin with a victim rushed to the hospital and end with a suspect in handcuffs.", to: "Picture a murder case: the victim is rushed to the hospital while police question a suspect.", note: "no unsupported generalization about murder mysteries" },
];
const FIELDS = { revealExplanation: "--why", wordAConnection: "--a", wordBConnection: "--b" };
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
let changed = 0;
for (const p of lib.pairs) for (const c of p.clues) {
  const next = {}; const notes = new Set();
  for (const r of RULES.filter((r) => r.hint === c.text)) for (const f of Object.keys(FIELDS)) {
    const cur = next[f] ?? c[f] ?? "";
    if (cur.includes(r.from)) { next[f] = cur.split(r.from).join(r.to); notes.add(r.note); }
  }
  if (!Object.keys(next).length) continue;
  const args = ["scripts/unlimited/correct-text.mjs", p.a, p.b, c.text, "--by", "main session (claude-opus-5-5), x04 coordinator review", "--note", `x04 coordinator review: ${[...notes].join("; ")}`];
  for (const [f, v] of Object.entries(next)) args.push(FIELDS[f], v);
  execFileSync(process.execPath, args, { encoding: "utf8" }); changed++;
  console.log(`${p.a} + ${p.b} ${c.text}: ${Object.keys(next).join(", ")}`);
}
console.log(`${changed} hints corrected`);
