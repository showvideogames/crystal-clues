#!/usr/bin/env node
// Pilot: proposes other pairs for an approved hint from the related-word index
// (data/unlimited/related/groups.json + hint-routes.json). It keeps the
// connection that made the original good: each candidate takes one word from
// each of two different routes (meanings) of the hint, or two words from one
// shared work when a route allows it. Proposals are only candidates: every one
// still goes through content review (the index never approves anything).
//   node scripts/unlimited/related-variations.mjs [--hint FROZEN] [--checkpoint x04] [--cap 14] [--batch <out.json>] [--json <out.json>]
// Checks: every index word is a bank word; each hint's seed pairs are regenerated
// (recall). Each candidate is classified: hint rule, owner rejection/hold,
// "never" pairs, already in the library with this hint, an owner request, or new.
// New candidates whose two words are not both weak (strength 2 + 1 at least) are
// eligible for review; --cap keeps at most that many per hint, taken round-robin
// across route combinations so one combination cannot crowd out the rest.
import { readFileSync, writeFileSync } from "node:fs";
import { loadCatalogue, pairOf, hintProblem, normWord, PLAYABLE, servedHints } from "./catalogue-lib.mjs";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

const GROUPS = "data/unlimited/related/groups.json";
const ROUTES = "data/unlimited/related/hint-routes.json";
const REQUESTS = "data/unlimited/expansion/x03-requests.json";
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const cap = Number(arg("cap", 14));
const only = arg("hint") ? normWord(arg("hint")) : null;

const ix = loadCatalogue();
const rejections = loadRejections();
const groups = new Map(JSON.parse(readFileSync(GROUPS, "utf8")).groups.map((g) => [g.id, g]));
const checkpoint = arg("checkpoint");
const hints = JSON.parse(readFileSync(ROUTES, "utf8")).hints.filter((h) => (!only || h.hint === only) && (!checkpoint || h.checkpoint === checkpoint));
const requests = JSON.parse(readFileSync(REQUESTS, "utf8")).items;
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// End a sentence, without a stray period after a closing exclamation or question ("Mine! Mine!").
const end = (s) => (/[.!?]["'”]?$/.test(s) ? s : s + ".");

const problems = [];
for (const g of groups.values()) for (const m of [...g.members, ...(g.notMembers || [])]) if (!ix.inBank.has(normWord(m.word))) problems.push(`group ${g.id}: ${m.word} is not a bank word`);

function routeWords(h, r) {
  if (r.words) return r.words.map((w) => ({ ...w, word: normWord(w.word), route: r.id, kind: "listed" }));
  const g = groups.get(r.group);
  if (!g) { problems.push(`${h.hint}/${r.id}: unknown group ${r.group}`); return []; }
  return g.members.filter((m) => !(r.exclude || {})[m.word] && (!r.only || r.only.includes(m.word))).map((m) => ({ word: normWord(m.word), strength: m.strength, clause: (r.clause || {})[m.word] || m.reason, route: r.id, group: g.id, kind: g.kind, sense: m.sense || null }));
}

const out = [];
for (const h of hints) {
  const hint = normWord(h.hint);
  const routes = h.routes.map((r) => ({ ...r, members: routeWords(h, r) }));
  for (const r of routes) for (const m of r.members) if (!ix.inBank.has(m.word)) problems.push(`${hint}/${r.id}: ${m.word} is not a bank word`);
  const never = new Map((h.never || []).map((n) => { const [x, y] = n.pair.split("+"); return [pairOf(x, y).id, n.why]; }));
  const seen = new Map();
  for (let i = 0; i < routes.length; i++) for (let j = i; j < routes.length; j++) {
    if (i === j && !routes[i].sameRoute) continue;
    for (const x of routes[i].members) for (const y of routes[j].members) {
      if (x.word === y.word) continue;
      const { a, b, id } = pairOf(x.word, y.word);
      const [xa, xb] = a === x.word ? [x, y] : [y, x];
      const cand = { hint, pair_id: id, a, b, routes: `${routes[i].id}×${routes[j].id}`, strength: [xa.strength, xb.strength], score: xa.strength + xb.strength,
        links: { [a]: end(sentence(xa.clause)), [b]: end(sentence(xb.clause)) }, why: end(`${sentence(xa.clause)}, and ${xb.clause}`) };
      const prev = seen.get(id);
      if (prev && prev.score >= cand.score) continue;
      seen.set(id, cand);
    }
  }
  const cands = [...seen.values()];
  for (const c of cands) {
    const p = ix.byId.get(c.pair_id);
    const existing = p?.clues.find((x) => x.text === hint);
    const req = requests.find((r) => pairOf(r.a, r.b).id === c.pair_id && normWord(r.hint) === hint);
    const rec = rejectionFor(rejections, c.a, c.b, hint);
    const rule = hintProblem(hint, c.a, c.b);
    c.class = rule ? "hint rule" : rec ? `owner ${rec.decision}` : never.has(c.pair_id) ? "never" : existing ? `in library (${existing.status})` : req ? `owner request ${req.ref}` : "new";
    c.note = rule || rec?.reason || never.get(c.pair_id) || (req ? `requested as ${req.intent}` : null);
    if (p) c.pairServes = servedHints(ix, p).hints.map((x) => x.text);
    c.eligible = c.class === "new" && Math.min(...c.strength) >= 1 && Math.max(...c.strength) === 2;
  }
  // Recall: the seeds must come back out of the routes.
  const recall = (h.seeds || []).map((s) => { const [x, y] = s.split("+"); const id = pairOf(x, y).id; return { seed: s, found: cands.some((c) => c.pair_id === id) }; });
  // Selection for review: strongest tier first (both words at strength 2, then 2+1),
  // round-robin across route combinations within a tier, and within a combination
  // the candidate whose words have been used least for this hint so far (ties by a
  // stable hash of the pair id, never alphabetical endpoints).
  const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const chosen = []; const usedWords = new Map();
  const hcap = h.reviewCap ?? cap;
  const eligible = cands.filter((c) => c.eligible);
  for (const tier of [...new Set(eligible.map((c) => c.score))].sort((a, b) => b - a)) {
    const byCombo = new Map();
    for (const c of eligible.filter((c) => c.score === tier)) { if (!byCombo.has(c.routes)) byCombo.set(c.routes, []); byCombo.get(c.routes).push(c); }
    let progress = true;
    while (chosen.length < hcap && progress) {
      progress = false;
      for (const q of byCombo.values()) {
        if (chosen.length >= hcap || !q.length) continue;
        q.sort((x, y) => ((usedWords.get(x.a) || 0) + (usedWords.get(x.b) || 0)) - ((usedWords.get(y.a) || 0) + (usedWords.get(y.b) || 0)) || hash(x.pair_id) - hash(y.pair_id));
        const c = q.shift(); chosen.push(c); progress = true;
        for (const w of [c.a, c.b]) usedWords.set(w, (usedWords.get(w) || 0) + 1);
      }
    }
  }
  for (const c of chosen) c.forReview = true;
  out.push({ hint, checkpoint: h.checkpoint || null, reviewCap: h.reviewCap ?? cap, routes: routes.map((r) => ({ id: r.id, label: r.label, words: r.members.map((m) => m.word) })), recall, candidates: cands.sort((p, q) => (q.forReview ? 1 : 0) - (p.forReview ? 1 : 0) || q.score - p.score || p.pair_id.localeCompare(q.pair_id)) });
}

const summary = out.map((h) => {
  const n = (f) => h.candidates.filter(f).length;
  return { hint: h.hint, generated: h.candidates.length, new: n((c) => c.class === "new"), eligible: n((c) => c.eligible), forReview: n((c) => c.forReview), inLibrary: n((c) => c.class.startsWith("in library")), ownerRequests: n((c) => c.class.startsWith("owner request")), blocked: n((c) => ["hint rule", "never"].includes(c.class) || c.class.startsWith("owner rejected") || c.class.startsWith("owner held")), recall: h.recall.map((r) => `${r.seed}:${r.found ? "yes" : "NO"}`).join(" ") };
});
console.log(JSON.stringify({ problems, summary }, null, 1));
if (arg("json")) writeFileSync(arg("json"), JSON.stringify({ _metadata: { generated: new Date().toISOString().slice(0, 10), cap, sources: [GROUPS, ROUTES] }, problems, summary, hints: out }, null, 1) + "\n");
if (arg("batch")) {
  const byPair = new Map();
  for (const h of out) for (const c of h.candidates.filter((c) => c.forReview)) {
    if (!byPair.has(c.pair_id)) byPair.set(c.pair_id, { pair_id: c.pair_id, a: c.a, b: c.b, clues: [], variants: [], rejected: [] });
    byPair.get(c.pair_id).clues.push({ text: c.hint, type: "related-index", wordAConnection: c.links[c.a], wordBConnection: c.links[c.b], revealExplanation: c.why, reference: null, routes: c.routes, strength: c.strength });
  }
  writeFileSync(arg("batch"), JSON.stringify({ _metadata: { batch: arg("name", "x03-p"), source: [GROUPS, ROUTES], prepared: new Date().toISOString().slice(0, 10), cap, note: "related-word pilot proposals for review" }, pairs: [...byPair.values()] }, null, 1) + "\n");
  console.log(`${arg("batch")}: ${byPair.size} pairs`);
}
