#!/usr/bin/env node
// Coordinator review of x04b (2026-10-19): targeted text cleanup, no model calls.
//  - Frosty (#57, #63) and iceberg (#78/#82/#84) wording, as clause rules across
//    the explanation and both lines, plus the route source;
//  - explanations that name the same subject twice in one sentence collapsed
//    naturally (both targets still explained). Double-meaning pairs where the
//    repeat IS the point (Apollo the program vs the god, "frosty" vs Frosty,
//    the two different Jaws) are deliberately left alone.
// Old text goes to provenance.textCorrection.
//   node scripts/unlimited/x04b-coordinator-fixes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (hint, from, to, note) => [{ hint, from, to, note }, { hint, from: cap(from), to: cap(to), note }];
const RULES = [
  ...both("FROSTY", "a Wendy's Frosty is a thick, frozen chocolate dessert you eat with a spoon", "a chocolate Frosty from Wendy's is a thick, frozen dairy dessert you eat with a spoon", "#57: specify the chocolate Frosty; frozen dairy dessert"),
  ...both("FROSTY", "a Wendy's Frosty is a soft-serve ice cream treat", "a Wendy's Frosty is a frozen dairy dessert much like soft-serve ice cream", "#63: not definitively soft-serve ice cream"),
  ...both("ICEBERG", "icebergs are a danger to every ship", "icebergs are a hazard for ships at sea", "#78/#82/#84: no absolute claim"),
];
const WHOLE = {
  "p_ball__mirror|DISCO": "A disco ball is covered in tiny mirrors and spins over the dance floor.",
  "p_blue__fast|SONIC": "Sonic is a famously fast blue hedgehog.",
  "p_blue__ring|SONIC": "Sonic is a blue hedgehog who collects golden rings.",
  "p_fast__video-game|SONIC": "Sonic is Sega's famously fast video game hedgehog.",
  "p_ring__video-game|SONIC": "Sonic, Sega's video game hedgehog, collects golden rings.",
  "p_broom__hogwarts|POTTER": "Harry Potter studies at Hogwarts and flies a broom at Quidditch.",
  "p_glasses__lightning|POTTER": "Harry Potter wears round glasses and has a lightning-bolt scar.",
  "p_owl__wizard|POTTER": "Harry Potter, the world's most famous boy wizard, gets his mail from his owl Hedwig.",
  "p_spell__wizard|POTTER": "Harry Potter, the world's most famous boy wizard, learns to cast spells.",
  "p_brother__green|LUIGI": "Luigi, one of the Super Mario Bros., wears green.",
  "p_brother__mario|LUIGI": "Luigi is Mario's younger brother, one of the Super Mario Bros.",
  "p_green__mario|LUIGI": "Luigi is Mario's green-clad brother.",
  "p_mario__mushroom|LUIGI": "Luigi is Mario's younger brother and grows big by eating a Super Mushroom.",
  "p_car__monster|PIXAR": "Pixar made both Cars and Monsters, Inc.",
  "p_car__robot|PIXAR": "Pixar made Cars, and WALL-E, the story of a lonely little robot.",
  "p_fish__lamp|PIXAR": "Pixar, whose logo is a hopping desk lamp, made Finding Nemo about a lost clownfish.",
  "p_fish__monster|PIXAR": "Pixar made Finding Nemo, about a lost clownfish, and Monsters, Inc.",
  "p_lamp__rat|PIXAR": "Pixar, whose logo is a hopping desk lamp, made Ratatouille about a rat who cooks.",
  "p_detective__london|SHERLOCK": "Sherlock Holmes, the most famous fictional detective, lives on Baker Street in London.",
  "p_detective__pipe|SHERLOCK": "Sherlock Holmes, the most famous fictional detective, is pictured puffing a pipe.",
  "p_detective__suspect|SHERLOCK": "Sherlock Holmes, the most famous fictional detective, unmasks the guilty suspect.",
  "p_hat__pipe|SHERLOCK": "Sherlock Holmes is pictured in a deerstalker hat, puffing a pipe.",
  "p_london__pipe|SHERLOCK": "Sherlock Holmes lives on Baker Street in London and is pictured puffing a pipe.",
  "p_london__violin|SHERLOCK": "Sherlock Holmes lives on Baker Street in London and plays the violin.",
  "p_disney__honey|POOH": "Winnie the Pooh, a beloved Disney character, loves honey.",
  "p_marvel__spider|PARKER": "Peter Parker is Marvel's Spider-Man.",
  "p_spider__superhero|PARKER": "Peter Parker leads a double life as the superhero Spider-Man.",
  "p_green__layer|OGRE": "Shrek is a big green ogre who says ogres are like onions: they have layers.",
  "p_layer__shrek|OGRE": "Shrek, the world's most famous ogre, says ogres are like onions: they have layers.",
  "p_beach__shark|JAWS": "Jaws, the classic shark movie, made beachgoers afraid to swim.",
  "p_shark__swimming|JAWS": "Jaws, the classic shark movie, scared a generation out of swimming in the ocean.",
  "p_christmas__snowman|FROSTY": "Frosty the Snowman is a Christmas classic.",
  "p_hat__snowman|FROSTY": "Frosty is the snowman who comes alive when a magic hat is placed on his head.",
  "p_christmas__ear|ELF": "Pointy-eared elves are a Christmas tradition.",
  "p_ear__santa|ELF": "Pointy-eared elves help Santa get ready for Christmas.",
  "p_egypt__mummy|PHARAOH": "Pharaohs ruled ancient Egypt and were preserved as mummies.",
  "p_smell__vampire|GARLIC": "Garlic has a strong smell and is said to keep vampires away.",
};
const FIELDS = { revealExplanation: "--why", wordAConnection: "--a", wordBConnection: "--b" };
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
let changed = 0;
for (const p of lib.pairs) for (const c of p.clues) {
  if (!["x04b-p", "x04b-o"].includes(c.provenance?.source)) continue;
  const next = {}; const notes = new Set();
  for (const r of RULES.filter((r) => r.hint === c.text)) for (const f of Object.keys(FIELDS)) {
    const cur = next[f] ?? c[f] ?? "";
    if (cur.includes(r.from)) { next[f] = cur.split(r.from).join(r.to); notes.add(r.note); }
  }
  const w = WHOLE[`${p.pair_id}|${c.text}`];
  if (w) { next.revealExplanation = w; notes.add("same subject named twice; collapsed naturally"); }
  const args = ["scripts/unlimited/correct-text.mjs", p.a, p.b, c.text, "--by", "main session (claude-opus-5-5), coordinator review of x04b", "--note", `coordinator review: ${[...notes].join("; ")}`];
  for (const [f, v] of Object.entries(next)) if (v !== c[f]) args.push(FIELDS[f], v);
  if (args.length === 8) continue;   // nothing to change for this hint
  execFileSync(process.execPath, args, { encoding: "utf8" }); changed++;
}
// Route sources: the ship clause lives in the builder; the Frosty dessert clauses came from the index review.
const B = "scripts/unlimited/x04b-build-routes.mjs";
let b = readFileSync(B, "utf8"); for (const r of RULES) b = b.split(r.from).join(r.to); writeFileSync(B, b);
const A = "scripts/unlimited/x04b-apply-index-review.mjs";
let a = readFileSync(A, "utf8");
if (!a.includes("coordinator: Frosty dessert")) a = a.replace("for (const h of routes.hints.filter((x) => x.checkpoint === \"x04b\")) h.routes = h.routes.filter((r) => r.words.length);",
  "// coordinator: Frosty dessert wording (#57, #63)\nset(\"FROSTY\", \"CHOCOLATE\", { clause: \"a chocolate Frosty from Wendy's is a thick, frozen dairy dessert you eat with a spoon\" });\nset(\"FROSTY\", \"ICE CREAM\", { clause: \"a Wendy's Frosty is a frozen dairy dessert much like soft-serve ice cream\" });\nfor (const h of routes.hints.filter((x) => x.checkpoint === \"x04b\")) h.routes = h.routes.filter((r) => r.words.length);");
writeFileSync(A, a);
console.log(`${changed} hints corrected`);
