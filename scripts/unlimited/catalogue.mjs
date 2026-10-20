#!/usr/bin/env node
// Search and grow the Unlimited pair catalogue (every unordered pair of bank words;
// empty pairs are virtual, see catalogue-lib.mjs).
//
//   node scripts/unlimited/catalogue.mjs stats
//   node scripts/unlimited/catalogue.mjs show <WORD> <WORD>
//   node scripts/unlimited/catalogue.mjs word <WORD>
//   node scripts/unlimited/catalogue.mjs thin [--limit 30] [--new]        words with the fewest playable pairs
//   node scripts/unlimited/catalogue.mjs empty [--word W] [--limit 40]    empty pairs (no record yet)
//   node scripts/unlimited/catalogue.mjs search <TEXT>                   hints and explanations
//   node scripts/unlimited/catalogue.mjs coverage                         pair evidence vs current state (read-only)
//   node scripts/unlimited/catalogue.mjs attempts <WORD> <WORD> [--json] every hint ever recorded for the pair, with the active decision
//   node scripts/unlimited/catalogue.mjs holds [--kind K] [--by D] [--unserved] [--all] [--limit N] [--json]
//        non-playable attempts; K = owner-decision|factual|rule|unsupported|familiarity-or-difficulty|unclassified
//        (advisory triage only: never proof, never a promotion); D = owner|coordinator|main-session|reviewer|pending
//   node scripts/unlimited/catalogue.mjs add <WORD> <WORD> <HINT> --by <owner|friend|name> --why "<short explanation>"
//        [--a "<link to first word>"] [--b "<link to second word>"] [--note "<where it came from>"]
//        [--approve]   owner only: records the owner's decision that it is playable (overrides.json, human_approved)
//        [--prefer]    owner only: also makes it the pair's preferred hint (preferences.json)
//
// `add` records an owner or friend-play discovery. Without --approve the hint is a
// "candidate": kept with its provenance, not served until a review or the owner
// approves it. Nothing here edits an existing hint's text, review or status.
// A pair + hint the owner rejected or held (rejections.json) is refused.
import { readFileSync, writeFileSync } from "node:fs";
import { PATHS, loadCatalogue, pairOf, pairState, stats, wordCoverage, emptyPairs, servedHints, search, hintProblem, normWord, PLAYABLE, coverageSummary, pairAttempts, listHolds, ADVISORY_KINDS, normHint, hintKey } from "./catalogue-lib.mjs";
import { REJECTIONS, loadRejections, rejectionFor } from "./rejections-lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); const v = rest[i + 1]; if (v === undefined || v.startsWith("--")) flags[k] = true; else { flags[k] = v; i++; } }
  else args.push(rest[i]);
}
const ix = loadCatalogue();
const out = (o) => console.log(typeof o === "string" ? o : JSON.stringify(o, null, 2));
const need = (cond, msg) => { if (!cond) { console.error(msg); process.exit(2); } };
const today = () => new Date().toISOString().slice(0, 10);
const readOverrides = () => JSON.parse(readFileSync(PATHS.overrides, "utf8")).overrides || [];

function showPair(p) {
  const served = servedHints(ix, p);
  const lines = [`${p.a} + ${p.b}  (${p.pair_id}) — ${pairState(p)}; served: ${served.hints.map((c) => c.text).join(" / ") || "none"} [${served.rule}]${p.generationHold ? `; GENERATION HOLD: ${p.generationHold.reason}` : ""}`];
  if (p.pairNote) lines.push(`  note: ${p.pairNote}`);
  for (const c of p.clues) {
    const r = c.provenance?.correctionReview || c.provenance?.blindReview;
    const score = r ? ` ${r.verdict} ${r.a}/${r.b}/${r.fairness}${r.model ? ` ${r.model}` : ""}` : "";
    lines.push(`  ${PLAYABLE.has(c.status) ? "●" : "○"} ${c.text.padEnd(14)} ${c.status}${score}${c.heldReason ? ` — ${c.heldReason}` : ""}`);
    if (c.revealExplanation) lines.push(`      “${c.revealExplanation}”`);
    const src = c.provenance?.source; const by = c.provenance?.addedBy;
    lines.push(`      from ${src || "?"}${by ? ` (added by ${by})` : ""}${c.override ? `; override ${c.override.status} by ${c.override.by}` : ""}`);
  }
  return lines.join("\n");
}

if (cmd === "stats") {
  out(stats(ix));
} else if (cmd === "show") {
  need(args.length === 2, "usage: show <WORD> <WORD>");
  const { a, b, id } = pairOf(args[0], args[1]);
  for (const w of [a, b]) if (!ix.inBank.has(w)) console.log(`note: ${w} is not in the word bank snapshot`);
  const p = ix.byId.get(id);
  out(p ? showPair(p) : `${a} + ${b}  (${id}) — empty: no hints yet`);
} else if (cmd === "word") {
  need(args.length === 1, "usage: word <WORD>");
  const w = normWord(args[0]);
  need(ix.inBank.has(w), `${w} is not in the word bank snapshot`);
  const ps = ix.byWord.get(w) || [];
  out(`${w}: ${ps.length} populated pairs (${ps.filter((p) => pairState(p) === "playable").length} playable), ${ix.bank.length - 1 - ps.length} empty partners`);
  for (const p of ps) out(`  ${(p.a === w ? p.b : p.a).padEnd(16)} ${pairState(p).padEnd(18)} ${servedHints(ix, p).hints.map((c) => c.text).join(" / ")}`);
} else if (cmd === "thin") {
  const limit = Number(flags.limit || 30);
  const rows = wordCoverage(ix).filter((c) => !flags.new || !c.original).sort((x, y) => x.playable - y.playable || x.pairs - y.pairs || x.word.localeCompare(y.word));
  out(`${rows.filter((r) => r.playable === 0).length} of ${rows.length} words have no playable pair yet`);
  for (const r of rows.slice(0, limit)) out(`  ${r.word.padEnd(16)} playable ${r.playable}, populated ${r.pairs}, empty partners ${r.emptyPartners}${r.original ? " (original 50)" : ""}`);
} else if (cmd === "empty") {
  const limit = Number(flags.limit || 40);
  if (flags.word) need(ix.inBank.has(normWord(flags.word)), `${normWord(flags.word)} is not in the word bank snapshot`);
  let n = 0;
  for (const p of emptyPairs(ix, { word: flags.word || null })) { if (n++ >= limit) break; out(`  ${p.a} + ${p.b}  (${p.id})`); }
  const total = flags.word ? ix.bank.length - 1 - (ix.byWord.get(normWord(flags.word)) || []).length : stats(ix).emptyPairs;
  out(`${Math.min(n, limit)} shown of ${total} empty pairs${flags.word ? ` for ${normWord(flags.word)}` : ""}`);
} else if (cmd === "search") {
  need(args.length >= 1, "usage: search <TEXT>");
  const hits = search(ix, args.join(" "));
  for (const h of hits) out(`  ${h.a} + ${h.b}: ${h.text} [${h.status}] ${h.revealExplanation}`);
  out(`${hits.length} matches`);
} else if (cmd === "coverage") {
  out(coverageSummary(ix, loadRejections()));
} else if (cmd === "attempts") {
  need(args.length === 2, "usage: attempts <WORD> <WORD>");
  const info = pairAttempts(ix, args[0], args[1], { rejections: loadRejections(), overrides: readOverrides() });
  if (flags.json) out(info);
  else {
    out(`${info.a} + ${info.b}  (${info.id})${info.inBank ? "" : " — not both in the word bank"}`);
    out(`  evidence: ${info.evidence}${info.generated ? " (includes a recorded generation batch)" : ""}${info.rejectionOnly ? " (rejections.json only)" : ""}; now: ${info.state}${info.served.length ? ` (${info.served.join(" / ")})` : ""}; ${info.open ? "open for other hints" : `pair restricted: ${info.restriction.reason}`}`);
    for (const t of info.attempts) {
      const r = t.review ? ` · review ${t.review.verdict} ${t.review.a}/${t.review.b}/${t.review.fairness}` : "";
      out(`  ${PLAYABLE.has(t.status) ? "●" : "○"} ${t.text.padEnd(14)} ${t.status} · decided by ${t.decision.decider} (${t.decision.by || "?"})${r}${t.advisory ? ` · advisory: ${t.advisory}` : ""}${t.inLibrary ? "" : " · rejections.json only"}`);
      if (t.decision.reason) out(`      why: ${t.decision.reason}`);
      if (t.explanation) out(`      “${t.explanation}”`);
      for (const h of t.history) out(`      history: ${h.status} by ${h.by} (${h.date})${h.superseded ? `, superseded by ${h.superseded.by} ${h.superseded.date}` : ""}`);
    }
  }
} else if (cmd === "holds") {
  need(!flags.kind || ADVISORY_KINDS.includes(flags.kind), `--kind is one of ${ADVISORY_KINDS.join(", ")}`);
  const rows = listHolds(ix, { rejections: loadRejections(), overrides: readOverrides(), kind: flags.kind || null, decider: flags.by || null, unserved: !!flags.unserved, all: !!flags.all });
  if (flags.json) out(rows);
  else {
    for (const r of rows.slice(0, Number(flags.limit || rows.length))) out(`  ${(r.a + " + " + r.b).padEnd(28)} ${r.text.padEnd(14)} ${r.status.padEnd(9)} ${r.decision.decider.padEnd(12)} ${(r.advisory || "").padEnd(25)} ${r.pairState}`);
    out(`${rows.length} attempts (advisory kinds are triage only)`);
  }
} else if (cmd === "add") {
  need(args.length === 3 && flags.by && flags.why, 'usage: add <WORD> <WORD> <HINT> --by <owner|friend|name> --why "<short explanation>"');
  const { a, b, id } = pairOf(args[0], args[1]);
  const missing = [a, b].filter((w) => !ix.inBank.has(w));
  need(!missing.length, `not in the word bank snapshot: ${missing.join(", ")} (add words to the bank first; the catalogue never adds them)`);
  need(a !== b, "a pair needs two different words");
  const typed = normWord(args[0]) === a;   // --a / --b follow the order the words were typed
  const text = normHint(args[2]);
  const problem = hintProblem(text, a, b);
  need(!problem, `${text}: ${problem}`);
  const recorded = rejectionFor(loadRejections(), a, b, text);
  need(!recorded, `${a} + ${b} → ${text} is recorded as ${recorded?.decision} by ${recorded?.by} (${recorded?.reason}); lift it in ${REJECTIONS} with the owner first`);
  const owner = String(flags.by).toLowerCase() === "owner";
  need(!(flags.approve || flags.prefer) || owner, "--approve and --prefer record the owner's decision; use them only with --by owner");
  const lib = JSON.parse(readFileSync(PATHS.pairs, "utf8"));
  let p = lib.pairs.find((x) => x.pair_id === id);
  if (!p) { p = { pair_id: id, a, b, source: owner ? "owner-discovery" : "friend-play", pairNote: null, reviewerBestAvailable: null, playableHints: 0, clues: [] }; lib.pairs.push(p); }
  const same = p.clues.find((c) => hintKey(c.text) === hintKey(text));
  need(!same, `${text} is already recorded for ${a} + ${b}${same && same.text !== text ? ` as ${same.text}` : ""} (see: show ${a} ${b})`);
  const c = {
    text, status: "candidate", heldReason: flags.approve ? null : "discovery: awaiting review or owner approval",
    type: flags.type || "discovery", wordAConnection: (typed ? flags.a : flags.b) || "", wordBConnection: (typed ? flags.b : flags.a) || "", revealExplanation: flags.why, reference: null,
    provenance: { source: owner ? "owner-discovery" : "friend-play", addedBy: String(flags.by), date: today(), note: flags.note || null, via: "catalogue add", blindReview: null },
  };
  p.clues.push(c);
  if (flags.approve) {
    const o = JSON.parse(readFileSync(PATHS.overrides, "utf8"));
    const entry = { pair_id: id, text, status: "human_approved", by: "owner", date: today(), reason: flags.note ? `${flags.note}: ${flags.why}` : flags.why };
    o.overrides.push(entry);
    writeFileSync(PATHS.overrides, JSON.stringify(o, null, 2) + "\n");
    c.status = "human_approved"; c.override = { by: entry.by, date: entry.date, status: entry.status, reason: entry.reason };
  }
  if (flags.prefer) {
    const pr = JSON.parse(readFileSync(PATHS.preferences, "utf8"));
    need(!(pr.pairs[id]?.status === "approved"), `${id} already has an approved preference (${pr.pairs[id]?.canonical || pr.pairs[id]?.equal}); change it by hand with the owner`);
    pr.pairs[id] = { status: "approved", canonical: text, by: "owner", date: today(), reason: flags.note || flags.why };
    writeFileSync(PATHS.preferences, JSON.stringify(pr, null, 2) + "\n");
  }
  p.playableHints = p.clues.filter((x) => PLAYABLE.has(x.status)).length;
  lib.pairs.sort((x, y) => x.pair_id.localeCompare(y.pair_id));
  writeFileSync(PATHS.pairs, JSON.stringify(lib, null, 2) + "\n");
  out(`added ${text} for ${a} + ${b} (${id}) as ${c.status}${flags.prefer ? ", preferred" : ""}`);
} else {
  out(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(cmd ? 2 : 0);
}
