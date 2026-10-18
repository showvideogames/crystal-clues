#!/usr/bin/env node
// How varied are random Unlimited boards? Simulates players the way the app
// makes boards (UnlimitedView newBoard: a fresh seed per board, the last 3
// boards' pairs avoided when possible) and reports target and extra-word variety.
//   node scripts/unlimited/variety.mjs [--players 200] [--boards 30] [--baseline <old random-library.json>]
//        [--weight-new K]   simulation only: count each new pair K times (a proposal, never shipped by this script)
// "New" target words are words outside the original 50; a "new" pair has at least one.
import { readFileSync } from "node:fs";
import { generateBoard } from "../../src/unlimited/generate.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };
const PLAYERS = Number(opt("players", 200)), BOARDS = Number(opt("boards", 30)), K = Number(opt("weight-new", 1));
const ORIGINAL = new Set(JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word));
const isNew = (p) => !ORIGINAL.has(p.a) || !ORIGINAL.has(p.b);

function simulate(lib, label, k = 1) {
  const newPairs = lib.pairs.filter(isNew);
  const sim = k === 1 ? lib : { ...lib, pairs: [...lib.pairs, ...Array.from({ length: k - 1 }, () => newPairs).flat()] };
  let boards = 0, withNew = 0, newPairSlots = 0, newTargets = 0;
  const targetUse = new Map(), pairUse = new Map(), perPlayer = [];
  let seed = 1;
  for (let pl = 0; pl < PLAYERS; pl++) {
    const recent = []; const seenTargets = new Set(); const seenExtras = new Map(); const seenPairs = new Set();
    let repeatPairs = 0, extraRepeatsNext = 0, prevExtras = null;
    for (let i = 0; i < BOARDS; i++) {
      const avoid = new Set(recent.slice(-3).flat());
      const b = generateBoard(sim, { seed: (seed++ * 2654435761) >>> 0, avoid, createdAt: "2026-10-18T00:00:00.000Z" });
      boards++;
      const ids = b.reveal.map((r) => r.pairId); recent.push(ids);
      const targets = b.reveal.flatMap((r) => [r.wordA, r.wordB]);
      const tset = new Set(targets);
      const extras = Object.values(b.cards).flatMap((c) => c.words).filter((w) => !tset.has(w));
      const nNewPairs = b.reveal.filter((r) => !ORIGINAL.has(r.wordA) || !ORIGINAL.has(r.wordB)).length;
      if (nNewPairs) withNew++;
      newPairSlots += nNewPairs; newTargets += targets.filter((w) => !ORIGINAL.has(w)).length;
      for (const w of targets) { targetUse.set(w, (targetUse.get(w) || 0) + 1); seenTargets.add(w); }
      for (const id of ids) { pairUse.set(id, (pairUse.get(id) || 0) + 1); if (seenPairs.has(id)) repeatPairs++; seenPairs.add(id); }
      if (prevExtras) extraRepeatsNext += extras.filter((w) => prevExtras.has(w)).length;
      prevExtras = new Set(extras);
      for (const w of extras) seenExtras.set(w, (seenExtras.get(w) || 0) + 1);
    }
    perPlayer.push({ targets: seenTargets.size, extras: seenExtras.size, repeatPairs, extraRepeatsNext: extraRepeatsNext / (BOARDS - 1) });
  }
  const avg = (f) => perPlayer.reduce((a, p) => a + f(p), 0) / perPlayer.length;
  const top = [...targetUse].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([w, n]) => `${w} ${(100 * n / boards).toFixed(1)}%`);
  const newPairUse = [...pairUse].filter(([id]) => { const p = lib.pairs.find((x) => x.id === id); return p && isNew(p); }).map(([, n]) => n);
  return {
    label, pairs: lib.pairs.length, newPairs: newPairs.length, weightNew: k, words: lib.words.length,
    boardsWithANewPair: `${(100 * withNew / boards).toFixed(1)}%`, newPairsPerBoard: +(newPairSlots / boards).toFixed(2),
    newTargetShare: `${(100 * newTargets / (boards * 8)).toFixed(1)}% of target slots`,
    distinctTargetsSeen: targetUse.size, distinctNewTargetsSeen: [...targetUse.keys()].filter((w) => !ORIGINAL.has(w)).length,
    [`perPlayer${BOARDS}Boards`]: { distinctTargets: +avg((p) => p.targets).toFixed(1), distinctExtras: +avg((p) => p.extras).toFixed(1), repeatedPairs: +avg((p) => p.repeatPairs).toFixed(2), extrasSharedWithPreviousBoard: +avg((p) => p.extraRepeatsNext).toFixed(2) },
    mostFrequentTargets: top,
    newPairUsesPer1000Boards: newPairUse.length ? +(1000 * newPairUse.reduce((a, n) => a + n, 0) / newPairUse.length / boards).toFixed(2) : 0,
  };
}

const lib = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
const results = [];
const base = opt("baseline", null);
if (base) results.push(simulate(JSON.parse(readFileSync(base, "utf8")), "released (generator 1)"));
results.push(simulate(lib, "this library, uniform pairs (as shipped)"));
if (K !== 1) results.push(simulate(lib, `PROPOSAL ONLY: new pairs weighted ×${K}`, K));
console.log(JSON.stringify({ players: PLAYERS, boardsPerPlayer: BOARDS, results }, null, 1));
