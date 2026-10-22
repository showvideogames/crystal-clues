#!/usr/bin/env node
// OFFLINE feasibility experiment for a strict per-player hint cooldown (owner idea,
// 2026-10-19: "a same word hint can't show up within the 100 games"). Nothing here
// changes the app. Every board is made by the app's own generateBoard and checked
// with validateBoard; strategies only change which served choices a board may use.
//
// Hint event = a hint text actually DISPLAYED on a board the player was dealt
// (normalised like the generator: trimmed, upper case). Hints that were merely
// available, or served for a pair that was not dealt, do not count.
//
// Strategies:
//   baseline   what ships: uniform over eligible pairs, last 3 boards' pairs avoided when possible
//   recent10   the earlier soft experiment: drop pairs whose served hints were ALL shown in the
//              last 10 boards, unless fewer than 40 pairs would remain
//   strictN    strict cooldown: a hint displayed in the player's last N boards may not be displayed
//              again. A pair is dealable only through its non-cooling served choices (an equal set
//              keeps its other members; a canonical pair such as BOXER + JOKE -> PUNCHLINE simply
//              sits out, it never falls back to an unserved or held hint). If no valid board can be
//              built, that is recorded as a FAILURE and the player's run stops; the rule is never broken.
//
//   node scripts/unlimited/cooldown-experiment.mjs [--players 40] [--games 300] [--lib label=path ...] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { generateBoard, validateBoard, norm } from "../../src/unlimited/generate.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };
const PLAYERS = Number(opt("players", 40)), GAMES = Number(opt("games", 300));
const libs = argv.flatMap((a, i) => (a === "--lib" ? [argv[i + 1]] : [])).map((s) => { const [label, path] = s.split("="); return { label, lib: JSON.parse(readFileSync(path, "utf8")) }; });
if (!libs.length) libs.push({ label: "current", lib: JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8")) });

// Reviewer evidence for quality comparisons (not used for selection).
const pairsLib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const evidence = new Map();
for (const p of pairsLib.pairs) for (const c of p.clues) evidence.set(`${p.pair_id}|${norm(c.text)}`, { status: c.status, r: c.provenance?.blindReview || null });

function capacity(lib) {
  const perHint = new Map();
  for (const p of lib.pairs) for (const h of p.hints) perHint.set(norm(h.text), (perHint.get(norm(h.text)) || 0) + 1);
  const counts = [...perHint.values()].sort((a, b) => b - a);
  const H = perHint.size;
  return {
    eligiblePairs: lib.pairs.length, distinctServedHints: H, hintsPerBoard: 4,
    pairsWithEqualSets: lib.pairs.filter((p) => p.hints.length > 1).length,
    hintsServingOnePair: counts.filter((n) => n === 1).length, busiest: [...perHint].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h, n]) => `${h} ${n}`),
    // A strict window of N boards can hold up to 4N cooling hints; a new board needs 4 more.
    theoreticalMaxStrictWindow: Math.floor((H - 4) / 4),
    worstCaseFreeHintsAt: Object.fromEntries([10, 25, 50, 100].map((n) => [n, H - 4 * n])),
  };
}

function dealable(lib, cooling) {
  const out = [];
  for (const p of lib.pairs) {
    const hints = p.hints.filter((h) => !cooling.has(norm(h.text)));
    if (hints.length === p.hints.length) out.push(p); else if (hints.length) out.push({ ...p, hints });
  }
  return out;
}

function run(label, lib, strategy) {
  const N = strategy.startsWith("strict") ? Number(strategy.slice(6)) : null;
  const hintUse = new Map(), pairUse = new Map(), targetUse = new Map(), per = [];
  const failures = []; const samples = []; let boards = 0, invalid = 0, exhaustive = 0, minDealable = Infinity; const times = [];
  const quality = { n: 0, owner: 0, scored: 0, both2: 0, delight2: 0, delightN: 0 };
  let seed = 7;
  for (let pl = 0; pl < PLAYERS; pl++) {
    const history = []; const seenPairs = new Set(); const seenT = new Map(); const lastSeen = new Map();
    let repPairs = 0, repHints = 0, minGap = Infinity, windowViolations = 0;
    const repHintsBy = { 30: 0, 100: 0 };
    for (let g = 0; g < GAMES; g++) {
      let pairs = lib.pairs;
      if (N) { const cooling = new Set(history.slice(-N).flat()); pairs = dealable(lib, cooling); minDealable = Math.min(minDealable, pairs.length); }
      else if (strategy === "recent10") { const rec = new Set(history.slice(-10).flat()); const fresh = lib.pairs.filter((p) => !p.hints.every((h) => rec.has(norm(h.text)))); pairs = fresh.length >= 40 ? fresh : lib.pairs; }
      const t0 = performance.now();
      const b = generateBoard({ ...lib, pairs }, { seed: (seed++ * 2654435761) >>> 0, avoid: new Set(historyPairs(history, 3)) /* the app avoids the last 3 boards' pairs */, createdAt: "2026-10-19T00:00:00.000Z" });
      times.push(performance.now() - t0);
      if (!b) { failures.push({ player: pl + 1, game: g + 1, dealablePairs: pairs.length }); break; }
      boards++;
      if (validateBoard(b, lib).length) invalid++;
      if (b.method === "exhaustive") exhaustive++;
      const hints = b.clues.map(norm);
      const entry = Object.assign([...hints], { pairIds: b.reveal.map((r) => r.pairId) });
      for (const r of b.reveal) {
        const h = norm(r.clue);
        if (lastSeen.has(h)) { repHints++; const gap = g - lastSeen.get(h); minGap = Math.min(minGap, gap); if (N && gap <= N) windowViolations++; if (gap <= 30) repHintsBy[30]++; if (gap <= 100) repHintsBy[100]++; }
        lastSeen.set(h, g); hintUse.set(h, (hintUse.get(h) || 0) + 1);
        if (seenPairs.has(r.pairId)) repPairs++; seenPairs.add(r.pairId); pairUse.set(r.pairId, (pairUse.get(r.pairId) || 0) + 1);
        for (const w of [r.wordA, r.wordB]) { seenT.set(w, (seenT.get(w) || 0) + 1); targetUse.set(w, (targetUse.get(w) || 0) + 1); }
        const ev = evidence.get(`${r.pairId}|${h}`); quality.n++;
        if (ev?.status === "human_approved") quality.owner++;
        if (ev?.r) { quality.scored++; if (ev.r.a === 2 && ev.r.b === 2) quality.both2++; if (ev.r.delight != null) { quality.delightN++; if (ev.r.delight === 2) quality.delight2++; } }
      }
      history.push(entry);
      if (pl < 2 && (g < 5 || (g >= 100 && g < 103))) samples.push({ player: pl + 1, game: g + 1, board: b.reveal.map((r) => `${r.clue} (${r.wordA}+${r.wordB})`).join(", ") });
    }
    per.push({ games: history.length, targets: seenT.size, repPairs, repHints, minGap: minGap === Infinity ? null : minGap, windowViolations, rep30: repHintsBy[30], rep100: repHintsBy[100] });
  }
  const avg = (f) => +(per.reduce((a, p) => a + (f(p) ?? 0), 0) / per.length).toFixed(2);
  const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : "n/a");
  const sorted = [...times].sort((a, b) => a - b);
  const top = [...hintUse].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h} ${(100 * n / boards).toFixed(1)}%`);
  return {
    library: label, strategy, players: PLAYERS, gamesPerPlayer: GAMES, boardsBuilt: boards, failures, invalidBoards: invalid, exhaustiveFallbackBoards: exhaustive,
    minDealablePairs: N ? minDealable : null,
    buildMs: { p50: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) },
    perPlayer: { distinctTargets: avg((p) => p.targets), repeatedPairs: avg((p) => p.repPairs), repeatedHintShowings: avg((p) => p.repHints), hintRepeatsWithin30Games: avg((p) => p.rep30), hintRepeatsWithin100Games: avg((p) => p.rep100), shortestHintGap: Math.min(...per.map((p) => p.minGap ?? Infinity)), strictWindowViolations: per.reduce((a, p) => a + p.windowViolations, 0) },
    coverage: { distinctHintsShown: hintUse.size, pairsShown: pairUse.size, pairsNeverShown: lib.pairs.length - pairUse.size, distinctTargetsShown: targetUse.size, topHints: top },
    quality: { ownerApprovedShare: pct(quality.owner, quality.n), reviewedBothSidesFullShare: pct(quality.both2, quality.scored), delight2Share: pct(quality.delight2, quality.delightN) },
    samples,
  };
}
function historyPairs(history, n) { return history.slice(-n).flatMap((b) => b.pairIds || []); }

const out = { _metadata: { generated: new Date().toISOString(), players: PLAYERS, gamesPerPlayer: GAMES, note: "offline; app sampler and persistence unchanged" }, capacity: {}, results: [] };
for (const { label, lib } of libs) {
  out.capacity[label] = capacity(lib);
  console.log(label, JSON.stringify(out.capacity[label]));
  for (const s of ["baseline", "recent10", "strict25", "strict50", "strict100"]) {
    const r = run(label, lib, s); out.results.push(r);
    console.log(`${label.padEnd(18)} ${s.padEnd(9)} built ${r.boardsBuilt} fail ${r.failures.length} invalid ${r.invalidBoards} exh ${r.exhaustiveFallbackBoards} minDealable ${r.minDealablePairs ?? "-"} | ms p50 ${r.buildMs.p50} p99 ${r.buildMs.p99} | targets ${r.perPlayer.distinctTargets} repPairs ${r.perPlayer.repeatedPairs} repHints ${r.perPlayer.repeatedHintShowings} (<=30g ${r.perPlayer.hintRepeatsWithin30Games}, <=100g ${r.perPlayer.hintRepeatsWithin100Games}) minGap ${r.perPlayer.shortestHintGap} viol ${r.perPlayer.strictWindowViolations} | hints ${r.coverage.distinctHintsShown} neverShown ${r.coverage.pairsNeverShown} | top ${r.coverage.topHints.slice(0, 3).join(", ")} | owner ${r.quality.ownerApprovedShare} full ${r.quality.reviewedBothSidesFullShare} d2 ${r.quality.delight2Share}`);
  }
}
if (opt("json", null)) writeFileSync(opt("json"), JSON.stringify(out, null, 1) + "\n");
