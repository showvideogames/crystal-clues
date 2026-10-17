#!/usr/bin/env node
// Tries seeds for a candidate batch and reports, per seed, how many boards the
// assembler reaches under the caps and how many shortlist words the batch
// would newly cover (words never a target in the live pool). Read-only.
//   node scripts/unlimited/pick-seed.mjs [--from 1] [--to 30] [--max-target 3] [--exclude-boards data/unlimited/boards/beta-01/boards.json]
import { readFileSync } from "node:fs";
import { assembleBatch } from "./assemble-boards.mjs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const FROM = Number(arg("from", 1)), TO = Number(arg("to", 30)), MAX = Number(arg("max-target", 3));
const EXCLUDE = arg("exclude-boards", "data/unlimited/boards/beta-01/boards.json");
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word);
const live = JSON.parse(readFileSync("src/unlimited/pool.json", "utf8")).boards;
const excludePairs = new Set(JSON.parse(readFileSync(EXCLUDE, "utf8")).boards.flatMap((b) => b.reveal.map((r) => r.pairId)));
const liveWords = new Set(live.flatMap((b) => b.reveal.flatMap((r) => [r.wordA, r.wordB])));
const rows = [];
for (let seed = FROM; seed <= TO; seed++) {
  const res = assembleBatch({ pairs: lib.pairs, words, seed, count: 10, maxTarget: MAX, batch: "pick", excludePairs });
  const fresh = new Set(res.boards.flatMap((b) => b.reveal.flatMap((r) => [r.wordA, r.wordB])).filter((w) => !liveWords.has(w)));
  rows.push({ seed, boards: res.boards.length, newlyCovered: fresh.size, words: [...fresh].sort().join(" ") });
}
rows.sort((x, y) => y.boards - x.boards || y.newlyCovered - x.newlyCovered || x.seed - y.seed);
for (const r of rows.slice(0, 8)) console.log(`seed ${String(r.seed).padStart(2)}: ${r.boards} boards, newly covered ${r.newlyCovered}${r.words ? `: ${r.words}` : ""}`);
console.log(`best: seed ${rows[0].seed}`);
