#!/usr/bin/env node
// OFFLINE selection experiment (x04 phase 3). Nothing here changes the app's
// sampler. Every board is still made by the app's own generateBoard (four
// disjoint pairs, four distinct hints, served choices only, 20 extras uniform
// from the full bank, the last 3 boards' pairs avoided when possible); the
// strategies differ only in WHICH eligible pairs that call may choose from:
//   current   all eligible pairs (what ships today: uniform over pairs)
//   hintFirst for each served hint, one of its pairs at random, so every hint
//             is equally likely regardless of how many pairs share it
//   recent    pairs whose served hints were all shown in the player's last
//             K boards are left out when at least 40 pairs remain
//   node scripts/unlimited/sampler-experiment.mjs [--players 200] [--boards 30] [--recent 10]
//        [--lib label=path ...] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { generateBoard, mulberry32, validateBoard } from "../../src/unlimited/generate.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };
const PLAYERS = Number(opt("players", 200)), BOARDS = Number(opt("boards", 30)), K = Number(opt("recent", 10));
const libs = argv.flatMap((a, i) => (a === "--lib" ? [argv[i + 1]] : [])).map((s) => { const [label, path] = s.split("="); return { label, lib: JSON.parse(readFileSync(path, "utf8")) }; });
if (!libs.length) libs.push({ label: "current candidate", lib: JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8")) });

function strategyPairs(name, lib, rng, history) {
  if (name === "current") return lib.pairs;
  if (name === "hintFirst") {
    const byHint = new Map();
    for (const p of lib.pairs) for (const h of p.hints) { if (!byHint.has(h.text)) byHint.set(h.text, []); byHint.get(h.text).push(p); }
    const picked = new Map();
    for (const ps of byHint.values()) { const p = ps[Math.floor(rng() * ps.length)]; picked.set(p.id, p); }
    return [...picked.values()];
  }
  if (name === "recent") {
    const recentHints = new Set(history.slice(-K).flat());
    const fresh = lib.pairs.filter((p) => !p.hints.every((h) => recentHints.has(h.text)));
    return fresh.length >= 40 ? fresh : lib.pairs;
  }
  throw new Error(name);
}

function run(label, lib, name) {
  const hintUse = new Map(), targetUse = new Map(), pairUse = new Map(), per = [], samples = [];
  let boards = 0, invalid = 0, seed = 1;
  for (let pl = 0; pl < PLAYERS; pl++) {
    const rng = mulberry32(0x9e3779b9 ^ pl);
    const recentPairs = [], hintHistory = [], seenT = new Set(), seenH = new Map(), hintPairs = new Map(), seenP = new Set();
    let repPairs = 0, repHints = 0, repHintsOther = 0, gapSum = 0, gaps = 0; const lastSeen = new Map();
    const seq = [];
    for (let i = 0; i < BOARDS; i++) {
      const pairs = strategyPairs(name, lib, rng, hintHistory);
      const b = generateBoard({ ...lib, pairs }, { seed: (seed++ * 2654435761) >>> 0, avoid: new Set(recentPairs.slice(-3).flat()), createdAt: "2026-10-19T00:00:00.000Z" });
      boards++;
      if (validateBoard(b, lib).length) invalid++;
      recentPairs.push(b.reveal.map((r) => r.pairId)); hintHistory.push(b.clues);
      if (pl < 3 && i < 10) seq.push(b.reveal.map((r) => `${r.clue} (${r.wordA}+${r.wordB})`).join(", "));
      for (const r of b.reveal) {
        for (const w of [r.wordA, r.wordB]) { targetUse.set(w, (targetUse.get(w) || 0) + 1); seenT.add(w); }
        pairUse.set(r.pairId, (pairUse.get(r.pairId) || 0) + 1); if (seenP.has(r.pairId)) repPairs++; seenP.add(r.pairId);
        const h = r.clue; hintUse.set(h, (hintUse.get(h) || 0) + 1);
        if (seenH.has(h)) { repHints++; if (!hintPairs.get(h).has(r.pairId)) repHintsOther++; gapSum += i - lastSeen.get(h); gaps++; }
        seenH.set(h, (seenH.get(h) || 0) + 1); if (!hintPairs.has(h)) hintPairs.set(h, new Set()); hintPairs.get(h).add(r.pairId); lastSeen.set(h, i);
      }
    }
    per.push({ targets: seenT.size, hints: seenH.size, repPairs, repHints, repHintsOther, maxHint: Math.max(...seenH.values()), meanGap: gaps ? gapSum / gaps : null });
    if (seq.length) samples.push({ player: pl + 1, first10Boards: seq });
  }
  const avg = (f) => +(per.reduce((a, p) => a + (f(p) ?? 0), 0) / per.length).toFixed(2);
  const top = (m, n) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([w, c]) => `${w} ${(100 * c / boards).toFixed(1)}%`);
  const shown = pairUse.size;
  // Coverage bias: share of all hint showings taken by the 10 most-shown hints, and pairs never shown.
  const hintTotal = [...hintUse.values()].reduce((a, n) => a + n, 0);
  const top10Share = [...hintUse.values()].sort((a, b) => b - a).slice(0, 10).reduce((a, n) => a + n, 0) / hintTotal;
  return {
    library: label, strategy: name, boards, invalidBoards: invalid,
    perPlayer: { distinctTargets: avg((p) => p.targets), repeatedPairs: avg((p) => p.repPairs), distinctHints: avg((p) => p.hints), repeatedHintShowings: avg((p) => p.repHints), sameHintDifferentPair: avg((p) => p.repHintsOther), mostTimesOneHint: avg((p) => p.maxHint), boardsBetweenHintRepeats: avg((p) => p.meanGap) },
    concentration: { topHints: top(hintUse, 6), top10HintsShareOfShowings: `${(100 * top10Share).toFixed(1)}%`, topTargets: top(targetUse, 5) },
    coverage: { eligiblePairs: lib.pairs.length, pairsShownAtLeastOnce: shown, pairsNeverShown: lib.pairs.length - shown, distinctTargetsShown: targetUse.size },
    samples,
  };
}

const results = [];
for (const { label, lib } of libs) for (const s of ["current", "hintFirst", "recent"]) results.push(run(label, lib, s));
for (const r of results) console.log(`${r.library.padEnd(22)} ${r.strategy.padEnd(9)} invalid ${r.invalidBoards} | targets ${r.perPlayer.distinctTargets} | rep pairs ${r.perPlayer.repeatedPairs} | rep hints ${r.perPlayer.repeatedHintShowings} (other pair ${r.perPlayer.sameHintDifferentPair}) | max hint ${r.perPlayer.mostTimesOneHint} | gap ${r.perPlayer.boardsBetweenHintRepeats} | top ${r.concentration.topHints.slice(0, 3).join(", ")} | top10 ${r.concentration.top10HintsShareOfShowings} | never shown ${r.coverage.pairsNeverShown}/${r.coverage.eligiblePairs}`);
if (opt("json", null)) writeFileSync(opt("json"), JSON.stringify({ _metadata: { players: PLAYERS, boardsPerPlayer: BOARDS, recentWindow: K, note: "offline experiment; the app's sampler is unchanged" }, results }, null, 1) + "\n");
