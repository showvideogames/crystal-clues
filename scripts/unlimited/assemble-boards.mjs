#!/usr/bin/env node
// Seeded board assembly for Cluevoyance Unlimited. Pure code, no model calls.
//
//   node scripts/unlimited/assemble-boards.mjs --seed 20261017 --count 10 --out data/unlimited/boards/beta-01
//
// Input: the pair library (data/unlimited/library/pairs.json) and the 50-word
// shortlist. Only hints with status ai_reviewed (or human_approved) are used.
// Output: <out>/boards.json in the exact shape the game plays
// ({ clues, cards, solution }) plus, per board, a frozen "reveal" snapshot of
// each hint's player-facing text, and <out>/log.md.
//
// Rules applied (owner decisions 2026-10-17):
//   • four pairs with eight distinct target words;
//   • four hint texts distinct after normalisation (uppercase, trimmed, inner
//     spaces collapsed); a hint never equals either of its own two targets;
//   • 28 distinct words on the 7 cards; 20 decoys drawn from the shortlist
//     minus the 8 targets, with no other filtering — there is no board-level
//     semantic review;
//   • small-beta repetition limits, per batch: a clued pair at most once, a
//     hint text at most once, a word as a target at most --max-target times
//     (default 3; 10 boards × 8 targets over 50 words averages 1.6).
// Geometry (FriendCreator.jsx): clue i links [slot,edge] pairs
//   0:[0,0],[1,0]  1:[1,1],[2,1]  2:[3,2],[2,2]  3:[0,3],[3,3]
// and the visual word at edge e of a card with orientation o is words[(e-o+4)%4].
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SEED = Number(arg("seed", 20261017));
const COUNT = Number(arg("count", 10));
const MAX_TARGET = Number(arg("max-target", 3));
const OUT = arg("out", "data/unlimited/boards/beta-01");
const BATCH = arg("batch", OUT.split(/[\\/]/).pop());
const LIB = arg("library", "data/unlimited/library/pairs.json");
// --exclude-boards <boards.json>: pairs already served by that batch are not
// used again, so a new batch is new content, never a reshuffle of old boards.
const EXCLUDE = arg("exclude-boards", null);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, rng) => { const r = [...arr]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
export const normHint = (t) => String(t ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
const CLUE_LINKS = [[[0, 0], [1, 0]], [[1, 1], [2, 1]], [[3, 2], [2, 2]], [[0, 3], [3, 3]]];

// Blind-review strength of a hint, the same ordering merge-review.mjs uses.
const strength = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };

/**
 * Which hints a pair may serve, and under which rule (data/unlimited/library/preferences.json):
 *   canonical    an approved clearly-best hint: the only choice (never downgraded);
 *   equal-tier   an approved set of editorially equal hints: vary among those that are playable;
 *                if none of them is playable there is NO choice (never an unapproved fallback);
 *   provisional  no approved preference: exactly ONE candidate, chosen deterministically
 *                (best blind score, then library order, then text), marked provisional.
 *                A numerical score tie is not editorial equivalence, so nothing is random here.
 * Only entries with status "approved" are read; "proposed" entries are for the parent.
 */
export function hintChoices(p, hints, preferences = {}) {
  const pref = preferences[p.pair_id];
  if (pref && pref.status === "approved" && pref.canonical) {
    const c = hints.find((h) => h.text === pref.canonical);
    return { rule: "canonical", hints: c ? [c] : [], provisional: false, note: c ? null : `canonical ${pref.canonical} is not playable` };
  }
  if (pref && pref.status === "approved" && Array.isArray(pref.equal)) {
    const set = hints.filter((h) => pref.equal.includes(h.text));
    return { rule: "equal-tier", hints: set, provisional: false, note: set.length ? null : `no approved equal hint (${pref.equal.join("/")}) is playable` };
  }
  if (!hints.length) return { rule: "provisional", hints: [], provisional: true, note: "no playable hint" };
  const ranked = hints.map((h, i) => ({ h, i })).sort((x, y) => strength(y.h) - strength(x.h) || x.i - y.i || x.h.text.localeCompare(y.h.text));
  return { rule: "provisional", hints: [ranked[0].h], provisional: true, note: "no approved preference: stable top candidate, pending pair review" };
}

export function assembleBatch({ pairs, words, seed = SEED, count = COUNT, maxTarget = MAX_TARGET, batch = BATCH, excludePairs = new Set(), preferences = {} }) {
  const rng = mulberry32(seed);
  // Pairs under a generation hold (apply-overrides.mjs) are not used for new boards.
  const playable = pairs.filter((p) => !excludePairs.has(p.pair_id) && !p.generationHold).map((p) => ({ ...p, hints: p.clues.filter((c) => PLAYABLE.has(c.status) && normHint(c.text) !== normHint(p.a) && normHint(c.text) !== normHint(p.b)) })).filter((p) => p.hints.length > 0);
  const targetUse = new Map(), pairUsed = new Set(), hintUsed = new Set();
  const boards = [], rejections = [];
  let attempts = 0;
  while (boards.length < count && attempts < 4000) {
    attempts++;
    // Four pairs: random order, greedy, respecting the batch caps.
    const chosen = [];
    const wordsOnBoard = new Set();
    for (const p of shuffle(playable, rng)) {
      if (chosen.length === 4) break;
      if (pairUsed.has(p.pair_id)) continue;
      if (wordsOnBoard.has(p.a) || wordsOnBoard.has(p.b)) continue;
      if ((targetUse.get(p.a) || 0) >= maxTarget || (targetUse.get(p.b) || 0) >= maxTarget) continue;
      chosen.push(p); wordsOnBoard.add(p.a); wordsOnBoard.add(p.b);
    }
    // A bad draw (the random order ran into shared words) is retried, not fatal:
    // another order may still find four pairs with distinct words under the caps.
    if (chosen.length < 4) { rejections.push("a draw found fewer than four eligible pairs with distinct words under the caps (retried)"); continue; }
    // One hint per pair, distinct across the board and unused in the batch. A
    // canonical hint that collides is never swapped for a weaker one: the draw
    // is abandoned and another pair/board combination is tried.
    const hints = [], choices = [];
    const boardHints = new Set();
    let ok = true;
    for (const p of chosen) {
      const ch = hintChoices(p, p.hints, preferences);
      const free = ch.hints.filter((c) => !boardHints.has(normHint(c.text)) && !hintUsed.has(normHint(c.text)));
      if (!free.length) { ok = false; rejections.push(ch.note ? `${p.pair_id}: ${ch.note}` : ch.rule === "canonical" ? `canonical hint for ${p.pair_id} collides on this draw (never downgraded; draw retried)` : `the ${ch.rule} hint for ${p.pair_id} collides on this draw (draw retried)`); break; }
      // Only an approved equal set is varied; canonical and provisional are single candidates.
      const h = ch.rule === "equal-tier" ? free[Math.floor(rng() * free.length)] : free[0];
      boardHints.add(normHint(h.text)); hints.push(h);
      choices.push({ rule: ch.rule, provisional: ch.provisional, alternatives: p.hints.filter((c) => c !== h).map((c) => c.text) });
    }
    if (!ok) continue;
    // Targets on the ring. Each slot card gets one word from each of its two clues.
    const targets = new Set([...chosen.flatMap((p) => [p.a, p.b])]);
    const visual = [["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]]; // visual[slot][edge]
    const reveal = [];
    chosen.forEach((p, i) => {
      const flip = rng() < 0.5;
      const [[s1, e1], [s2, e2]] = CLUE_LINKS[i];
      visual[s1][e1] = flip ? p.b : p.a;
      visual[s2][e2] = flip ? p.a : p.b;
      const h = hints[i];
      reveal.push({ position: i, clue: h.text, wordA: p.a, wordB: p.b, pairId: p.pair_id, hintStatus: h.status,
        wordAConnection: h.wordAConnection || "", wordBConnection: h.wordBConnection || "", revealExplanation: h.revealExplanation || "", reference: h.reference || null,
        hintChoice: choices[i] });
    });
    // Decoys: the shortlist minus the targets; 8 inner edges + 12 extra-card words.
    const decoys = shuffle(words.filter((w) => !targets.has(w)), rng).slice(0, 20);
    if (decoys.length < 20) { rejections.push("shortlist too small for 20 decoys"); break; }
    let d = 0;
    for (let s = 0; s < 4; s++) for (let e = 0; e < 4; e++) if (!visual[s][e]) visual[s][e] = decoys[d++];
    // Card ids in a random order so the id never gives the answer away.
    const ids = shuffle(["c1", "c2", "c3", "c4", "c5", "c6", "c7"], rng);
    const cards = {}, slotCards = [], orientations = [];
    for (let s = 0; s < 4; s++) {
      const o = Math.floor(rng() * 4);
      const wordsArr = ["", "", "", ""];
      for (let e = 0; e < 4; e++) wordsArr[(e - o + 4) % 4] = visual[s][e];
      cards[ids[s]] = { id: ids[s], words: wordsArr };
      slotCards.push(ids[s]); orientations.push(o);
    }
    const extraCards = [];
    for (let x = 0; x < 3; x++) { const id = ids[4 + x]; cards[id] = { id, words: decoys.slice(8 + x * 4, 12 + x * 4) }; extraCards.push(id); }
    // Commit the batch caps.
    chosen.forEach((p) => { pairUsed.add(p.pair_id); targetUse.set(p.a, (targetUse.get(p.a) || 0) + 1); targetUse.set(p.b, (targetUse.get(p.b) || 0) + 1); });
    hints.forEach((h) => hintUsed.add(normHint(h.text)));
    const n = boards.length + 1;
    boards.push({
      id: `${batch}-${String(n).padStart(3, "0")}`, version: 1, batch, seed, index: n,
      title: `Unlimited ${n}`, status: "beta", humanApproved: false,
      clues: hints.map((h) => normHint(h.text)),
      cards, solution: { slotCards, orientations, extraCards },
      reveal,
    });
  }
  return { boards, rejections, attempts, targetUse: Object.fromEntries([...targetUse.entries()].sort()), playablePairs: playable.length };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("assemble-boards.mjs")) {
  const lib = JSON.parse(readFileSync(LIB, "utf8"));
  const words = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8")).words.map((w) => w.word);
  const excludePairs = new Set(EXCLUDE ? JSON.parse(readFileSync(EXCLUDE, "utf8")).boards.flatMap((b) => b.reveal.map((r) => r.pairId)) : []);
  const PREFS = "data/unlimited/library/preferences.json";
  const preferences = existsSync(PREFS) ? JSON.parse(readFileSync(PREFS, "utf8")).pairs : {};
  const res = assembleBatch({ pairs: lib.pairs, words, excludePairs, preferences });
  mkdirSync(OUT, { recursive: true });
  const out = { _metadata: { batch: BATCH, seed: SEED, assembled: new Date().toISOString(), library: LIB, playablePairs: res.playablePairs, maxTargetPerWord: MAX_TARGET, excludedPairsFrom: EXCLUDE, excludedPairs: excludePairs.size, rules: "distinct normalised hint texts; hint ≠ own targets; 28 distinct words; no board-level semantic review (owner decision 2026-10-17)", statuses: "status 'beta' = assembled from ai_reviewed hints; humanApproved is false until a person sets it" }, boards: res.boards };
  writeFileSync(join(OUT, "boards.json"), JSON.stringify(out, null, 2) + "\n");
  const hintCount = {}; res.boards.forEach((b) => b.clues.forEach((c) => { hintCount[c] = (hintCount[c] || 0) + 1; }));
  const log = [
    `# Batch ${BATCH} — assembly log`, "",
    `- assembled: ${out._metadata.assembled}`, `- seed: ${SEED}`, `- library: ${LIB} (${lib.pairs.length} pairs, ${res.playablePairs} with a playable hint)`,
    `- requested ${COUNT}, assembled ${res.boards.length} in ${res.attempts} attempts`,
    ...(EXCLUDE ? [`- excluded ${excludePairs.size} pairs already served by ${EXCLUDE}`] : []),
    `- caps: pair once, hint text once, word as target ≤ ${MAX_TARGET}`, "",
    "## Boards", "", ...res.boards.map((b) => `- **${b.id}** clues ${b.clues.join(" / ")} — pairs ${b.reveal.map((r) => `${r.wordA}+${r.wordB}`).join(", ")}`), "",
    "## Target use per word", "", Object.entries(res.targetUse).map(([w, n]) => `${w}:${n}`).join(" "), "",
    "## Hint text use", "", Object.entries(hintCount).filter(([, n]) => n > 1).length ? Object.entries(hintCount).filter(([, n]) => n > 1).map(([t, n]) => `${t}:${n}`).join(" ") : "every hint text used once", "",
    "## Rejections during search", "", ...(res.rejections.length ? [...new Set(res.rejections)].map((r) => `- ${r}`) : ["- none"]), "",
  ].join("\n");
  writeFileSync(join(OUT, "log.md"), log + "\n");
  console.log(`${res.boards.length}/${COUNT} boards -> ${OUT}/boards.json (seed ${SEED}, ${res.attempts} attempts)`);
  if (res.rejections.length) console.log("notes:", [...new Set(res.rejections)].join("; "));
}
