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

/** A hint as stored and shown: normWord, with a curly apostrophe (’ ‘ ʼ) written as a straight one. */
export const normHint = (t) => normWord(t).replace(/[‘’ʼ]/g, "'");
/** Letters and digits only: how two spellings of one hint are compared (AC/DC = ACDC, CAP'N = CAPN). */
export const hintKey = (t) => normHint(t).replace(/[^A-Z0-9]/g, "");
const HINT_SHAPE = /^[A-Z0-9](?:[A-Z0-9]|[/'](?=[A-Z0-9]))*$/;

/**
 * A hint is one word: letters (a familiar abbreviation such as NYC is letters too), plus the
 * conventional spellings the owner allowed (2026-10-19): digits (K9), a slash (AC/DC) and an
 * apostrophe (CAP'N). A slash or apostrophe sits only between two letters or digits, never
 * doubled, leading or trailing; a hint needs at least one letter. Spaces, hyphens and any
 * other characters are refused. Target checks compare letters and digits only.
 */
export function hintProblem(text, a, b) {
  const t = normHint(text);
  if (!HINT_SHAPE.test(t) || !/[A-Z]/.test(t)) return "a hint is one word: letters, with digits, a slash or an apostrophe only inside a conventional spelling (K9, AC/DC, CAP'N)";
  const key = hintKey(t);
  for (const w of [a, b]) {
    const bare = hintKey(w);
    if (key === bare) return `the hint is a target (${w})`;
    if (key.includes(bare)) return `the hint contains a target (${w})`;
    if (bare.includes(key)) return `a target contains the hint (${w})`;
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

// ---------------------------------------------------------------------------
// Coverage and attempts (read-only). Three separate questions:
//   - pair evidence: what has ever been recorded for a pair (unseen / candidate-only /
//     reviewed-or-decided), and whether a recorded generation batch produced any of it;
//   - current state: is the pair served now, playable but not served, or not playable;
//   - attempt decision: for each hint, the active status, who decided it (read from the
//     decision's own `by` provenance, not from which file it sits in) and why.
// An owner-rejections entry (rejections.json) on a pair with no library record still counts
// as seen and decided, never as untried or generated. A rejected or held hint never closes
// its pair; only an explicit pair restriction (generationHold) does. Superseded overrides
// are inactive and kept as history. The advisory kind is triage only: it never makes a
// hint playable and does not prove that either connection is true.
const HUMAN_SOURCES = new Set(["owner-discovery", "friend-play", "coordinator-suggestion", "coordinator-editorial"]);
export const ADVISORY_KINDS = ["owner-decision", "factual", "rule", "unsupported", "familiarity-or-difficulty", "unclassified"];

/** Who made a decision, from its `by` text: owner / coordinator / main-session / other. */
export function deciderOf(by) {
  const s = String(by || "");
  if (/^owner\b/i.test(s)) return "owner";
  if (/^(coordinator|parent)\b|coordinator brief/i.test(s)) return "coordinator";
  if (/main session|editorial bar/i.test(s)) return "main-session";
  return s ? "other" : "unknown";
}

const reviewOf = (c) => c.provenance?.correctionReview || c.provenance?.blindReview || null;

/** The decision in force for a library hint: an override if any, else the review, else pending. */
export function activeDecision(c) {
  if (c.override) return { status: c.status, by: c.override.by, decider: deciderOf(c.override.by), reason: c.override.reason || c.heldReason || null, via: c.override.via || "overrides.json" };
  const r = reviewOf(c);
  if (r) return { status: c.status, by: r.reviewer || r.model || "independent review", decider: "reviewer", reason: r.reason || c.heldReason || null, via: "review" };
  return { status: c.status, by: c.provenance?.addedBy || null, decider: c.status === "candidate" ? "pending" : "unknown", reason: c.heldReason || null, via: c.provenance?.via || null };
}

/** Advisory triage for a hint that is not playable (null when playable). Never proof, never a promotion. */
export function adviseKind({ status, decider, flags = [], reason = "" }) {
  if (PLAYABLE.has(status)) return null;
  if (decider === "owner") return "owner-decision";
  const f = new Set(flags || []); const r = String(reason || "");
  if (f.has("wrong_fact") || /\b(factually incorrect|false|inaccurate|invent|not true|misdescrib|incorrect|overstat)/i.test(r)) return "factual";
  // "synonym_of_target" is a reviewer note, not a rule (synonym audit 2026-10-20), so it is not triaged as one.
  if (["contains_target", "not_pg"].some((x) => f.has(x)) || /two-word|two words|run together|letters only|contains a target|substring/i.test(r)) return "rule";
  if (f.has("one_sided") || f.has("phrase_join_weak") || /only via|only through|does not point|doesn't point|no real link|not a real|one-sided|weak link/i.test(r)) return "unsupported";
  if (["obscure", "dated", "needs_explanation", "better_hint_exists", "generic", "uncertain"].some((x) => f.has(x)) || /obscure|niche|familiar|recogni|trivia|remember|depends on|second step|two-step|detour|click|instant|leap|reach|fits (many|any|several)|better hint|secondary|takes a moment/i.test(r)) return "familiarity-or-difficulty";
  return "unclassified";
}

function rejectionsByPair(rejections) {
  const m = new Map();
  for (const e of rejections) { const id = pairOf(e.a, e.b).id; if (!m.has(id)) m.set(id, []); m.get(id).push(e); }
  return m;
}

/** Historical evidence for a pair (stored record and/or owner-rejections entries). */
export function pairEvidence(p, rejs = []) {
  const clues = p?.clues || [];
  if (!clues.length && !rejs.length) return { evidence: "unseen", generated: false, rejectionOnly: false };
  const decided = rejs.length > 0 || clues.some((c) => c.status !== "candidate" || c.override || reviewOf(c));
  const generated = clues.some((c) => c.provenance?.source && !HUMAN_SOURCES.has(c.provenance.source));
  return { evidence: decided ? "reviewed-or-decided" : "candidate-only", generated, rejectionOnly: !clues.length };
}

/** Current state: served / playable-unserved / not-playable / none (no library record). */
export function currentState(ix, p) {
  if (!p) return "none";
  if (!p.clues.some((c) => PLAYABLE.has(c.status))) return "not-playable";
  return !p.generationHold && servedHints(ix, p).hints.length ? "served" : "playable-unserved";
}

function attemptFromClue(p, c, rejs, overrides) {
  const d = activeDecision(c); const r = reviewOf(c);
  const t = hintKey(c.text);
  const kept = c.override?.history || [];
  const extra = overrides.filter((o) => o.superseded && o.pair_id === p.pair_id && hintKey(o.text) === t && !kept.some((h) => h.date === o.date && h.by === o.by && h.status === o.status));
  return {
    text: c.text, inLibrary: true, status: c.status, decision: d,
    advisory: adviseKind({ status: c.status, decider: d.decider, flags: r?.flags, reason: [c.heldReason, c.override?.reason, r?.reason].filter(Boolean).join(" | ") }),
    review: r ? { verdict: r.verdict, a: r.a, b: r.b, fairness: r.fairness, delight: r.delight ?? null, flags: r.flags || [], reason: r.reason || null } : null,
    source: c.provenance?.source || null, addedBy: c.provenance?.addedBy || null, explanation: c.revealExplanation || "",
    recorded: rejs.filter((e) => hintKey(e.hint) === t), history: [...kept, ...extra],
  };
}

function attemptFromRejection(e) {
  const decider = deciderOf(e.by);
  return {
    text: normHint(e.hint), inLibrary: false, status: e.decision, decision: { status: e.decision, by: e.by, decider, reason: e.reason, via: "rejections.json" },
    advisory: adviseKind({ status: e.decision, decider, reason: e.reason }), review: null, source: null, addedBy: null, explanation: "", recorded: [e], history: [],
  };
}

/** Every hint ever recorded for a pair, deduplicated by hint text across the library and rejections.json. */
export function pairAttempts(ix, x, y, { rejections = [], overrides = [] } = {}) {
  const { a, b, id } = pairOf(x, y);
  const p = ix.byId.get(id);
  const rejs = rejectionsByPair(rejections).get(id) || [];
  const attempts = (p?.clues || []).map((c) => attemptFromClue(p, c, rejs, overrides));
  for (const e of rejs) if (!attempts.some((t) => hintKey(t.text) === hintKey(e.hint))) attempts.push(attemptFromRejection(e));
  const state = currentState(ix, p);
  return {
    a, b, id, inBank: ix.inBank.has(a) && ix.inBank.has(b), ...pairEvidence(p, rejs), state,
    open: !p?.generationHold, restriction: p?.generationHold || null,
    served: state === "served" ? servedHints(ix, p).hints.map((c) => c.text) : [], attempts,
  };
}

/** Pair-level coverage over the whole bank, with rejection-only pairs reconciled. */
export function coverageSummary(ix, rejections = []) {
  const byPair = rejectionsByPair(rejections);
  const inBankPair = (a, b) => ix.inBank.has(normWord(a)) && ix.inBank.has(normWord(b));
  const ev = { "candidate-only": 0, "reviewed-or-decided": 0 };
  const state = { served: 0, "playable-unserved": 0, "not-playable": 0 };
  let generated = 0, stored = 0, restricted = 0, openUnserved = 0;
  for (const p of ix.pairs) {
    if (!inBankPair(p.a, p.b)) continue;
    stored++;
    const e = pairEvidence(p, byPair.get(p.pair_id) || []); ev[e.evidence]++; if (e.generated) generated++;
    const s = currentState(ix, p); state[s]++;
    if (p.generationHold) restricted++; else if (s !== "served") openUnserved++;
  }
  const rejectionOnly = [...byPair.entries()].filter(([id]) => !ix.byId.has(id));
  const rejectionOnlyInBank = rejectionOnly.filter(([, es]) => inBankPair(es[0].a, es[0].b));
  ev["reviewed-or-decided"] += rejectionOnlyInBank.length;
  const possible = pairCount(ix.bank.length);
  const seen = stored + rejectionOnlyInBank.length;
  return {
    possiblePairs: possible,
    evidence: { unseen: possible - seen, ...ev, generatedByARecordedBatch: generated },
    rejectionOnlyPairs: { inBank: rejectionOnlyInBank.length, outsideBank: rejectionOnly.length - rejectionOnlyInBank.length, entries: rejectionOnly.reduce((n, [, es]) => n + es.length, 0) },
    current: { ...state, noLibraryRecord: possible - stored },
    seenButNotServed: { open: openUnserved + rejectionOnlyInBank.length, pairRestricted: restricted },
  };
}

/** Non-playable attempts across the catalogue (held + candidate by default; `all` adds rejected). */
export function listHolds(ix, { rejections = [], overrides = [], kind = null, unserved = false, decider = null, all = false } = {}) {
  const pairs = new Map(ix.pairs.map((p) => [p.pair_id, [p.a, p.b]]));
  for (const e of rejections) { const q = pairOf(e.a, e.b); if (!pairs.has(q.id)) pairs.set(q.id, [q.a, q.b]); }
  const out = [];
  for (const [id, [a, b]] of pairs) {
    const info = pairAttempts(ix, a, b, { rejections, overrides });
    if (unserved && info.state === "served") continue;
    for (const t of info.attempts) {
      if (PLAYABLE.has(t.status) || (!all && t.status === "rejected")) continue;
      if (kind && t.advisory !== kind) continue;
      if (decider && t.decision.decider !== decider) continue;
      out.push({ pair_id: id, a, b, pairState: info.state, ...t });
    }
  }
  return out.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.text.localeCompare(y.text));
}
