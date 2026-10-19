#!/usr/bin/env node
// x04c (backlog review) text fixes, no model calls. Clause rules applied to the
// explanation and both lines of EVERY hint with that text (any batch), and to
// both route builders, so the stale wording cannot come back through the index
// (the backlog showed that earlier pair-only fixes had left x04 source clauses
// behind). Old text goes to provenance.textCorrection.
//   node scripts/unlimited/x04c-text-fixes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (hint, from, to, note) => [{ hint, from, to, note }, { hint, from: cap(from), to: cap(to), note }];
const RULES = [
  ...both("LAVA", "lava is molten rock, about as hot as anything gets", "lava is molten rock, hot enough to glow red", "overstated; matches the x04 wording"),
  ...both("CHIP", "chocolate chip cookies", "chocolate chips stud classic cookies", "sentence fragment"),
  ...both("SHELL", "Mario players fire turtle shells at each other in Mario Kart", "in Mario Kart, racers fire Koopa turtle shells at each other", "clearer wording"),
  ...both("SHELL", "a turtle hides in its shell", "a turtle carries its shell on its back", "sea turtles cannot pull into their shells"),
  ...both("UMBRELLA", "tropical drinks come with tiny paper umbrellas", "tropical drinks are often garnished with tiny paper umbrellas", "not every tropical drink has one"),
  ...both("WING", "a hospital has a wing for each department", "big hospitals are divided into wings, like the maternity wing", "overstated; matches the x04 wording"),
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
  const args = ["scripts/unlimited/correct-text.mjs", p.a, p.b, c.text, "--by", "main session (claude-opus-5-5), x04c reviewer fix", "--note", `x04c review: ${[...notes].join("; ")}`];
  for (const [f, v] of Object.entries(next)) if (v !== c[f]) args.push(FIELDS[f], v);
  if (args.length === 8) continue;   // nothing to change for this hint
  execFileSync(process.execPath, args, { encoding: "utf8" }); changed++;
  console.log(`${p.a} + ${p.b} ${c.text}`);
}
let srcChanged = 0;
for (const SRC of ["scripts/unlimited/x04-build-routes.mjs", "scripts/unlimited/x04b-build-routes.mjs"]) {
  let src = readFileSync(SRC, "utf8");
  for (const r of RULES) if (src.includes(r.from)) { src = src.split(r.from).join(r.to); srcChanged++; }
  writeFileSync(SRC, src);
}
console.log(`${changed} hints corrected; ${srcChanged} source clause rules applied`);
