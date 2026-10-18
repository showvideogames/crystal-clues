// Random Unlimited boards, assembled in the browser from the served-choice
// library (random-library.json, built by scripts/unlimited/export-random-library.mjs).
// Pure functions: the same seed always gives the same board, so tests can pin it.
//
// A board is four pairs with eight distinct target words and four distinct
// hint texts. Each pair serves exactly the library's choice for it; only an
// approved equal-tier set is varied (randomly among its playable members).
// The 20 other words are drawn uniformly without replacement from the complete
// word bank (library.words) minus the eight targets; there is no semantic
// filtering against the rest of the board (the clue rules allow a hint to match
// another word on the board, see scripts/unlimited/puzzle-clue-rules.mjs).
// Generator 1 drew the extras from the original 50 words; boards it made keep
// their saved snapshot unchanged. Geometry is the game's own (FriendCreator.jsx):
//   clue i links [slot,edge] pairs 0:[0,0],[1,0] 1:[1,1],[2,1] 2:[3,2],[2,2] 3:[0,3],[3,3]
//   and a card with orientation o shows words[(e-o+4)%4] at edge e.
// The board is created once and frozen: the caller saves the whole object and
// never re-derives it (refresh, Continue, history and Replay reuse the snapshot).

export const GENERATOR_VERSION = 2;
const CLUE_LINKS = [[[0, 0], [1, 0]], [[1, 1], [2, 1]], [[3, 2], [2, 2]], [[0, 3], [3, 3]]];
const CARD_IDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"];
export const norm = (t) => String(t ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Uniform Fisher–Yates shuffle (a copy). */
export function shuffle(arr, rng) {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** A fresh 32-bit seed from the platform's secure random source (Math.random as a last resort). */
export function freshSeed() {
  try { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0]; } catch { return Math.floor(Math.random() * 2 ** 32); }
}

// Can these four pairs take four distinct hints? Each pair needs one of its
// served hints; a collision is resolved only within an approved equal set,
// never by serving something weaker. Returns the chosen hints or null.
function pickHints(chosen, rng) {
  const used = new Set();
  const out = [];
  // Single-choice pairs first (they cannot move), then equal sets.
  const order = chosen.map((p, i) => i).sort((x, y) => (chosen[x].hints.length - chosen[y].hints.length) || (x - y));
  const picked = new Array(chosen.length);
  for (const i of order) {
    const free = chosen[i].hints.filter((h) => !used.has(norm(h.text)));
    if (!free.length) return null;
    const h = chosen[i].rule === "equal-tier" ? free[Math.floor(rng() * free.length)] : free[0];
    used.add(norm(h.text)); picked[i] = h;
  }
  for (let i = 0; i < chosen.length; i++) out.push(picked[i]);
  return out;
}

const compatible = (p, words) => !words.has(p.a) && !words.has(p.b);

/**
 * Chooses four disjoint pairs with four distinct hints.
 * 1. Up to `tries` random draws: shuffle all eligible pairs uniformly, take them
 *    greedily (recently used pairs are skipped first, then allowed if needed).
 * 2. If every draw dead-ends, an exhaustive backtracking search over one random
 *    order finds a valid set whenever one exists (so it never gives up wrongly).
 */
export function choosePairs(pairs, rng, { avoid = new Set(), tries = 60 } = {}) {
  const pools = [pairs.filter((p) => !avoid.has(p.id)), pairs];
  for (const pool of pools) {
    if (pool.length < 4) continue;
    for (let t = 0; t < tries; t++) {
      const chosen = []; const words = new Set();
      for (const p of shuffle(pool, rng)) {
        if (chosen.length === 4) break;
        if (!compatible(p, words)) continue;
        chosen.push(p); words.add(p.a); words.add(p.b);
      }
      if (chosen.length < 4) continue;
      const hints = pickHints(chosen, rng);
      if (hints) return { chosen, hints, method: pool === pairs && avoid.size ? "random (recent pairs allowed)" : "random", tries: t + 1 };
    }
  }
  // Exhaustive fallback (dead ends are real only when no valid set exists at all).
  const order = shuffle(pairs, rng);
  const chosen = []; const words = new Set();
  const dfs = (start) => {
    if (chosen.length === 4) return !!pickHints(chosen, () => 0);
    for (let i = start; i < order.length; i++) {
      const p = order[i];
      if (!compatible(p, words)) continue;
      chosen.push(p); words.add(p.a); words.add(p.b);
      if (dfs(i + 1)) return true;
      chosen.pop(); words.delete(p.a); words.delete(p.b);
    }
    return false;
  };
  if (dfs(0)) return { chosen: [...chosen], hints: pickHints(chosen, rng), method: "exhaustive", tries: null };
  return null;
}

/**
 * Builds one random board. Returns null only if the library cannot make any
 * valid board (fewer than four disjoint pairs with distinct hints).
 *   library: { words: string[] (the word bank), pairs: [{ id, a, b, rule, hints:[{ text, ... }] }] }
 *   seed:    32-bit integer (freshSeed() in the browser; fixed in tests)
 *   avoid:   pair ids to skip when possible (e.g. the last few boards)
 */
export function generateBoard(library, { seed, avoid = new Set(), createdAt = new Date().toISOString(), idSuffix } = {}) {
  const rng = mulberry32(seed);
  const pick = choosePairs(library.pairs, rng, { avoid });
  if (!pick) return null;
  const { chosen, hints, method } = pick;
  const targets = new Set(chosen.flatMap((p) => [p.a, p.b]));
  const fillers = shuffle(library.words.filter((w) => !targets.has(w)), rng).slice(0, 20);
  if (fillers.length < 20) return null;

  const visual = [["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]];
  const reveal = [];
  chosen.forEach((p, i) => {
    const flip = rng() < 0.5;
    const [[s1, e1], [s2, e2]] = CLUE_LINKS[i];
    visual[s1][e1] = flip ? p.b : p.a;
    visual[s2][e2] = flip ? p.a : p.b;
    const h = hints[i];
    reveal.push({ position: i, clue: norm(h.text), wordA: p.a, wordB: p.b, pairId: p.id, hintStatus: h.status,
      wordAConnection: h.wordAConnection || "", wordBConnection: h.wordBConnection || "", revealExplanation: h.revealExplanation || "", reference: h.reference || null,
      hintChoice: { rule: p.rule, provisional: p.rule === "provisional", alternatives: p.hints.filter((x) => x !== h).map((x) => x.text) } });
  });
  let d = 0;
  for (let s = 0; s < 4; s++) for (let e = 0; e < 4; e++) if (!visual[s][e]) visual[s][e] = fillers[d++];
  const ids = shuffle(CARD_IDS, rng);
  const cards = {}, slotCards = [], orientations = [];
  for (let s = 0; s < 4; s++) {
    const o = Math.floor(rng() * 4);
    const w = ["", "", "", ""];
    for (let e = 0; e < 4; e++) w[(e - o + 4) % 4] = visual[s][e];
    cards[ids[s]] = { id: ids[s], words: w };
    slotCards.push(ids[s]); orientations.push(o);
  }
  const extraCards = [];
  for (let x = 0; x < 3; x++) { const id = ids[4 + x]; cards[id] = { id, words: fillers.slice(8 + x * 4, 12 + x * 4) }; extraCards.push(id); }

  const suffix = idSuffix ?? (seed >>> 0).toString(36).padStart(7, "0");
  const id = `r-${Date.parse(createdAt).toString(36)}-${suffix}`;
  return {
    id, version: 1, kind: "random", generator: GENERATOR_VERSION, library: library._metadata?.contentHash?.slice(0, 16) || null, seed: seed >>> 0, createdAt, method,
    title: "Random puzzle", status: "beta", humanApproved: false,
    clues: reveal.map((r) => r.clue), cards, solution: { slotCards, orientations, extraCards }, reveal,
  };
}

/** Structural check of a generated board (used by tests and as a guard before saving). */
export function validateBoard(board, library) {
  const errs = [];
  const W = new Set(library.words);
  const byId = new Map(library.pairs.map((p) => [p.id, p]));
  if (board.clues?.length !== 4) errs.push("four clues");
  if (new Set(board.clues.map(norm)).size !== 4) errs.push("four distinct hint texts");
  const ids = Object.keys(board.cards);
  if (ids.length !== 7) errs.push("seven cards");
  const all = ids.flatMap((k) => board.cards[k].words);
  if (all.length !== 28 || new Set(all).size !== 28) errs.push("28 distinct words");
  if (!all.every((w) => W.has(w))) errs.push("every word from the word bank");
  const { slotCards, orientations, extraCards } = board.solution;
  if (slotCards.length !== 4 || extraCards.length !== 3 || new Set([...slotCards, ...extraCards]).size !== 7) errs.push("4 slot + 3 extra cards");
  const at = (s, e) => board.cards[slotCards[s]].words[(e - orientations[s] + 4) % 4];
  const targets = new Set();
  board.reveal.forEach((r, i) => {
    const p = byId.get(r.pairId);
    if (!p) { errs.push(`${r.pairId} not an eligible pair`); return; }
    if (!p.hints.some((h) => norm(h.text) === r.clue)) errs.push(`${r.clue} is not a served choice for ${r.pairId}`);
    if (board.clues[i] !== r.clue) errs.push(`clue ${i} matches its reveal`);
    const [[s1, e1], [s2, e2]] = CLUE_LINKS[i];
    const pairOnBoard = new Set([at(s1, e1), at(s2, e2)]);
    if (!(pairOnBoard.has(p.a) && pairOnBoard.has(p.b))) errs.push(`clue ${i} faces ${p.a}+${p.b}`);
    if (norm(r.clue) === p.a || norm(r.clue) === p.b) errs.push(`clue ${i} differs from its words`);
    targets.add(p.a); targets.add(p.b);
  });
  if (targets.size !== 8) errs.push("eight distinct targets");
  return errs;
}
