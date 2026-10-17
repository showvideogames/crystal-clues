#!/usr/bin/env node
// Shortlist coverage: which of the 50 words are targets in the live pool, in a
// candidate batch, and in the library's playable pairs, before and after a batch.
//   node scripts/unlimited/coverage.mjs [--candidate data/unlimited/boards/beta-02/boards.json] [--out file.md]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const CAND = arg("candidate", null);
const OUT = arg("out", null);
const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word);
const live = JSON.parse(readFileSync("src/unlimited/pool.json", "utf8")).boards;
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8")).pairs;
const cand = CAND && existsSync(CAND) ? JSON.parse(readFileSync(CAND, "utf8")).boards : [];
const count = (boards) => { const u = Object.fromEntries(words.map((w) => [w, 0])); for (const b of boards) for (const r of b.reveal) { u[r.wordA]++; u[r.wordB]++; } return u; };
const liveUse = count(live), candUse = count(cand);
const playableWords = new Set(lib.filter((p) => p.playableHints > 0).flatMap((p) => [p.a, p.b]));
const bySource = {};
for (const p of lib) { bySource[p.source] = bySource[p.source] || { pairs: 0, playable: 0 }; bySource[p.source].pairs++; if (p.playableHints > 0) bySource[p.source].playable++; }
const uncoveredLive = words.filter((w) => !liveUse[w]);
const uncoveredAfter = words.filter((w) => !liveUse[w] && !candUse[w]);
const newlyCovered = words.filter((w) => !liveUse[w] && candUse[w]);
const lines = [
  `# Shortlist coverage (${new Date().toISOString().slice(0, 10)})`, "",
  `Live pool: ${live.length} boards (${live.map((b) => b.id).join(", ")}). Candidate batch: ${cand.length ? `${cand.length} boards from ${CAND}` : "none"}.`, "",
  "| Measure | Before (live beta-01) | After (live + candidate) |", "|---|---|---|",
  `| shortlist words used as a target | ${words.length - uncoveredLive.length} of ${words.length} | ${words.length - uncoveredAfter.length} of ${words.length} |`,
  `| words never a target | ${uncoveredLive.length}: ${uncoveredLive.join(" ") || "none"} | ${uncoveredAfter.length}: ${uncoveredAfter.join(" ") || "none"} |`,
  `| newly covered by the candidate batch | — | ${newlyCovered.length}: ${newlyCovered.join(" ") || "none"} |`,
  `| shortlist words with a playable library pair | ${playableWords.size} of ${words.length} | |`, "",
  "## Library by source", "", "| source | pairs | with a playable hint |", "|---|---|---|",
  ...Object.entries(bySource).map(([s, v]) => `| ${s} | ${v.pairs} | ${v.playable} |`), "",
  "## Target use per word (live / candidate)", "",
  words.map((w) => `${w}:${liveUse[w]}/${candUse[w]}`).join(" "), "",
];
const text = lines.join("\n");
if (OUT) writeFileSync(OUT, text + "\n");
console.log(text);
