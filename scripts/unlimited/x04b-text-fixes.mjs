#!/usr/bin/env node
// x04b reviewer text fixes, applied as clause rules to the explanation sentence
// AND both per-word lines of every matching hint (so sibling pairs sharing a
// clause are fixed together), and to the route source (x04b-build-routes.mjs)
// so regenerated proposals cannot bring the old wording back. Old text goes to
// provenance.textCorrection. No model calls.
//   node scripts/unlimited/x04b-text-fixes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (hint, from, to, note) => [{ hint, from, to, note }, { hint, from: cap(from), to: cap(to), note }];
const RULES = [
  ...both("PIXAR", "Toy Story was Pixar's first movie", "Toy Story was Pixar's first feature film", "Pixar made shorts before Toy Story"),
  ...both("APOLLO", "Apollo is the Greek god of the sun", "Apollo is the Greek god of light, often linked with the sun", "Helios is the sun god; Apollo is the god of light"),
  ...both("FROSTY", "Frosty comes to life when he puts on a magic hat", "Frosty comes to life when the children place a magic silk hat on his head", "in the song the children put the hat on him"),
  ...both("FROSTY", "Frosty's magic hat brings him to life", "Frosty's magic silk hat brings him to life", "consistent with the song"),
  ...both("FROSTY", "a Wendy's Frosty is a thick chocolate shake", "a Wendy's Frosty is a thick, frozen chocolate dessert you eat with a spoon", "a Frosty is not quite a shake"),
  ...both("PHARAOH", "pharaohs were buried in pyramids", "many pharaohs, especially in the Old Kingdom, were buried in pyramids", "later pharaohs were buried in the Valley of the Kings"),
  ...both("SHELL", "a crunchy taco shell", "a crunchy taco comes in a hard shell", "sentence fragment"),
  ...both("RAINBOW", "a rainbow shows every color", "a rainbow spreads sunlight into a band of colors", "a rainbow does not show every color"),
  ...both("JAWS", "Jaws is the steel-toothed James Bond villain", "Jaws is the steel-toothed henchman from the James Bond films", "Jaws is a henchman, not the main villain"),
  ...both("GOTHAM", "the Batcave is hidden beneath Gotham", "the Batcave is hidden beneath Wayne Manor, just outside Gotham City", "the Batcave is under Wayne Manor"),
];
// Whole-sentence rewrites where both clauses said the same thing.
const WHOLE = [
  { pair: "p_ghost__story", hint: "CAMPFIRE", why: "Telling ghost stories is a classic campfire tradition.", note: "the explanation repeated itself" },
  { pair: "p_london__street", hint: "SHERLOCK", why: "Sherlock Holmes is London's most famous detective, and he lives at 221B Baker Street.", note: "the explanation repeated itself" },
  { pair: "p_gold__leprechaun", hint: "RAINBOW", why: "A leprechaun guards a pot of gold at the end of the rainbow.", note: "the explanation repeated itself" },
];
const FIELDS = { revealExplanation: "--why", wordAConnection: "--a", wordBConnection: "--b" };
const by = "main session (claude-opus-5-5), x04b reviewer fix";
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
let changed = 0;
for (const p of lib.pairs) for (const c of p.clues) {
  const next = {}; const notes = new Set();
  for (const r of RULES.filter((r) => r.hint === c.text)) for (const f of Object.keys(FIELDS)) {
    const cur = next[f] ?? c[f] ?? "";
    if (cur.includes(r.from)) { next[f] = cur.split(r.from).join(r.to); notes.add(r.note); }
  }
  const w = WHOLE.find((x) => x.pair === p.pair_id && x.hint === c.text);
  if (w) { next.revealExplanation = w.why; notes.add(w.note); }
  if (!Object.keys(next).length) continue;
  const args = ["scripts/unlimited/correct-text.mjs", p.a, p.b, c.text, "--by", by, "--note", `x04b review: ${[...notes].join("; ")}`];
  for (const [f, v] of Object.entries(next)) if (v !== c[f]) args.push(FIELDS[f], v);
  if (args.length === 9) continue;
  execFileSync(process.execPath, args, { encoding: "utf8" }); changed++;
  console.log(`${p.a} + ${p.b} ${c.text}: ${Object.keys(next).join(", ")}`);
}
// Route source: lower-case clause forms live in the builder.
const SRC = "scripts/unlimited/x04b-build-routes.mjs";
let src = readFileSync(SRC, "utf8"); let srcChanged = 0;
for (const r of RULES) if (src.includes(r.from)) { src = src.split(r.from).join(r.to); srcChanged++; }
writeFileSync(SRC, src);
console.log(`${changed} hints corrected; ${srcChanged} source clause rules applied`);
