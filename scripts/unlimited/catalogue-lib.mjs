// The Unlimited pair catalogue: every unordered pair of word-bank words.
//
// Only populated pairs are stored (data/unlimited/library/pairs.json, with
// preferences.json and overrides.json beside it). Every other combination of
// the bank snapshot (data/unlimited/wordbank/wordbank.json) is an EMPTY pair,
// represented virtually: it is computed on demand, never written out, so the
// ~715,000 blank combinations cost nothing to keep.
//
// A pair id is "p_" + a + "__" + b in lower case, with a alphabetically before
// b and any space inside a word written as "-" (p_ice-cream__penguin). The
// original 50-word ids (p_gold__pirate) already follow this rule.
import { readFileSync, existsSync } from "node:fs";

export const PATHS = {
  bank: "data/unlimited/wordbank/wordbank.json",
  pairs: "data/unlimited/library/pairs.json",
  preferences: "data/unlimited/library/preferences.json",
  overrides: "data/unlimited/library/overrides.json",
  original: "data/unlimited/library/shortlist-50.json",
};
export const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
export const normWord = (w) => String(w ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const slug = (w) => normWord(w).toLowerCase().replace(/ /g, "-");

/** Orders two words and names their pair. Returns { a, b, id }. */
export function pairOf(x, y) {
  const [a, b] = [normWord(x), normWord(y)].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
  return { a, b, id: `p_${slug(a)}__${slug(b)}` };
}

export const pairCount = (n) => (n * (n - 1)) / 2;

/** A hint may be one word: letters only (a familiar abbreviation such as NYC is letters too). */
export function hintProblem(text, a, b) {
  const t = normWord(text);
  if (!/^[A-Z]+$/.test(t)) return "a hint is one word, letters only";
  for (const w of [a, b]) {
    const bare = normWord(w).replace(/ /g, "");
    if (t === bare) return `the hint is a target (${w})`;
    if (t.includes(bare)) return `the hint contains a target (${w})`;
    if (bare.includes(t)) return `a target contains the hint (${w})`;
  }
  return null;
}

export function loadCatalogue(paths = PATHS) {
  const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
  const bank = read(paths.bank, null);
  if (!bank) throw new Error(`no word-bank snapshot at ${paths.bank} (run scripts/unlimited/export-wordbank.mjs)`);
  const lib = read(paths.pairs, { pairs: [] });
  const prefs = read(paths.preferences, { pairs: {} });
  const original = new Set((read(paths.original, { words: [] }).words || []).map((w) => normWord(w.word ?? w)));
  return buildIndex({ words: bank.words, pairs: lib.pairs, preferences: prefs.pairs || {}, original });
}

/** Pure index over in-memory data (tests use this directly). */
export function buildIndex({ words, pairs, preferences = {}, original = new Set() }) {
  const bank = [...new Set(words.map(normWord))].sort();
  const inBank = new Set(bank);
  const byId = new Map(pairs.map((p) => [p.pair_id, p]));
  const byWord = new Map(bank.map((w) => [w, []]));
  const outside = [];
  for (const p of pairs) {
    for (const w of [p.a, p.b]) {
      if (!byWord.has(w)) { byWord.set(w, []); outside.push(w); }
      byWord.get(w).push(p);
    }
  }
  return { bank, inBank, byId, byWord, preferences, original, pairs, outside: [...new Set(outside)] };
}

export function pairState(p) {
  if (!p) return "empty";
  if (p.clues.some((c) => PLAYABLE.has(c.status))) return "playable";
  if (p.clues.some((c) => c.status === "held" || c.status === "candidate")) return "held-or-candidate";
  return p.clues.length ? "rejected-only" : "empty";
}

export function stats(ix) {
  const n = ix.bank.length;
  const states = { playable: 0, "held-or-candidate": 0, "rejected-only": 0, "empty-record": 0 };
  for (const p of ix.pairs) { const s = pairState(p); states[s === "empty" ? "empty-record" : s]++; }
  const possible = pairCount(n);
  const stored = ix.pairs.filter((p) => ix.inBank.has(p.a) && ix.inBank.has(p.b)).length;
  const coverage = wordCoverage(ix);
  const targets = coverage.filter((c) => c.playable > 0);
  return {
    bankWords: n, possiblePairs: possible, storedPairs: ix.pairs.length, storedInBank: stored, emptyPairs: possible - stored,
    states, playableHints: ix.pairs.reduce((k, p) => k + p.clues.filter((c) => PLAYABLE.has(c.status)).length, 0),
    targetWords: targets.length, targetWordsOutsideOriginal: targets.filter((c) => !ix.original.has(c.word)).length,
    wordsWithNoPlayablePair: n - targets.filter((c) => ix.inBank.has(c.word)).length, pairWordsOutsideBank: ix.outside,
  };
}

/** Per word: populated pairs, playable pairs, and empty partners left. */
export function wordCoverage(ix) {
  return ix.bank.map((w) => {
    const ps = ix.byWord.get(w) || [];
    return { word: w, original: ix.original.has(w), pairs: ps.length, playable: ps.filter((p) => pairState(p) === "playable").length, emptyPartners: ix.bank.length - 1 - ps.length };
  });
}

/** Empty (virtual) pairs, lazily. With `word`, only that word's empty partners. */
export function* emptyPairs(ix, { word = null } = {}) {
  const firsts = word ? [normWord(word)] : ix.bank;
  for (const x of firsts) {
    for (const y of ix.bank) {
      if (y === x || (!word && y < x)) continue;
      const p = pairOf(x, y);
      if (!ix.byId.has(p.id)) yield p;
    }
  }
}

/** The hint a pair would serve today (approved canonical / equal set, else strongest playable). */
export function servedHints(ix, p) {
  const playable = p.clues.filter((c) => PLAYABLE.has(c.status));
  const pref = ix.preferences[p.pair_id];
  if (pref?.status === "approved" && pref.canonical) return { rule: "canonical", hints: playable.filter((c) => c.text === pref.canonical) };
  if (pref?.status === "approved" && Array.isArray(pref.equal)) return { rule: "equal-tier", hints: playable.filter((c) => pref.equal.includes(c.text)) };
  const s = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };
  const top = playable.map((c, i) => ({ c, i })).sort((x, y) => s(y.c) - s(x.c) || x.i - y.i)[0];
  return { rule: "provisional", hints: top ? [top.c] : [] };
}

export function search(ix, text) {
  const t = normWord(text);
  const out = [];
  for (const p of ix.pairs) for (const c of p.clues) {
    const hay = [c.text, c.revealExplanation, c.wordAConnection, c.wordBConnection].map((x) => normWord(x)).join(" | ");
    if (hay.includes(t)) out.push({ pair_id: p.pair_id, a: p.a, b: p.b, text: c.text, status: c.status, revealExplanation: c.revealExplanation || "" });
  }
  return out;
}
