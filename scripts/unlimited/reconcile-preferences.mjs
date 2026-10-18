// Reconcile the blind reviewer's explicit FINAL best-available pick into the
// preferred-choice field (data/unlimited/library/preferences.json) so that board
// assembly serves the reviewer's named strongest hint instead of whatever a
// numerical tie-break lands on. Parent rule (2026-10-17): a numerical tie is not
// editorial equality; an explicit reviewer preference wins over library order.
//
//   node scripts/unlimited/reconcile-preferences.mjs [--dry]
//
// For every pair with at least one playable (PASS) hint and no existing approved
// preference:
//   - best = correctionBestAvailable || reviewerBestAvailable (saved reviewer evidence;
//     never the derived finalBestAvailable)
//   - if best is a playable hint and differs from the provisional top candidate
//     (hintChoices with no preference), record an approved canonical preference
//     with basis "reviewer_final_best_available", noting whether the two were a
//     numerical tie or an override of a higher-scored hint.
//   - if best equals the provisional top candidate, record nothing (stable already).
//   - if best is NOT playable although PASS hints exist, flag a contradiction and
//     leave the pair provisional (never promote a held/rejected hint).
// Existing approved entries are never touched; proposed entries are listed as open.
// Output: preferences.json (unless --dry) and preference-reconciliation.md.
import { readFileSync, writeFileSync } from "node:fs";
import { hintChoices } from "./assemble-boards.mjs";

const playableOf = (p) => p.clues.filter((c) => c.status === "ai_reviewed" || c.status === "human_approved");
const score = (c) => { const b = c.provenance?.blindReview || {}; return `${(b.a ?? 0)}/${(b.b ?? 0)}/${(b.fairness ?? 0)}`; };
const strength = (c) => { const b = c.provenance?.blindReview || {}; return ((b.a ?? 0) + (b.b ?? 0)) * 10 + (b.fairness ?? 0); };

// Pure reconciliation: returns the new entries without touching prefPairs.
// Approved entries (owner, parent or earlier reconciliation) always take
// precedence and are never rewritten; held/rejected hints are never promoted.
export function reconcile(pairs, prefPairs = {}, date = new Date().toISOString().slice(0, 10)) {
const entries = {};
const added = [], same = [], contradictions = [], open = [], kept = [];
for (const p of pairs) {
  const existing = prefPairs[p.pair_id];
  if (existing && existing.status === "approved") { kept.push(p.pair_id); continue; }
  if (existing && existing.status === "proposed") open.push(`${p.pair_id}: proposed ${existing.canonical || (existing.equal || []).join("/")} (${existing.by || "?"})`);
  const playable = playableOf(p);
  if (!playable.length) continue;
  // Saved reviewer evidence only. finalBestAvailable is derived (it records what
  // the tie-break would serve), so reading it first hid explicit reviewer picks
  // (root cause of the missing SMOKEY and DRACULA entries, 2026-10-18).
  const best = p.correctionBestAvailable || p.reviewerBestAvailable;
  if (!best || !best.text) continue;
  const provisional = hintChoices(p, playable, {}).hints[0];
  const bestClue = playable.find((c) => c.text === best.text);
  if (!bestClue) {
    const held = p.clues.find((c) => c.text === best.text);
    contradictions.push(`${p.pair_id} (${p.a}+${p.b}): reviewer best_available ${best.text} is ${held ? held.status : "not in the library"} while ${playable.map((c) => c.text).join("/")} passed; left provisional (${provisional.text}). why: ${best.why || ""}`);
    continue;
  }
  if (bestClue.text === provisional.text) { same.push(p.pair_id); continue; }
  const tie = strength(bestClue) === strength(provisional);
  const entry = {
    status: "approved",
    canonical: bestClue.text,
    by: "parent standing rule 2026-10-17: explicit FINAL reviewer best_available wins over the numerical tie-break",
    date,
    basis: "reviewer_final_best_available",
    reviewer: best.reviewer || null,
    reason: best.why || null,
    evidence: {
      displaced: provisional.text,
      scores: { [bestClue.text]: score(bestClue), [provisional.text]: score(provisional) },
      numericalTie: tie,
      note: tie ? "equal blind scores; library order would have served the displaced hint" : "reviewer named a lower-scored PASS hint as strongest; recorded as the reviewer's editorial call, flagged for the parent",
    },
  };
  entries[p.pair_id] = entry;
  added.push(`${tie ? "tie" : "OVERRIDE"} ${p.pair_id} (${p.a}+${p.b}): ${bestClue.text} ${score(bestClue)} replaces ${provisional.text} ${score(provisional)} — ${best.why || ""}`);
}

return { entries, added, same, contradictions, open, kept };
}

const isMain = !!process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("reconcile-preferences.mjs");
if (isMain) {
const DRY = process.argv.includes("--dry");
const LIB = "data/unlimited/library/pairs.json";
const PREF = "data/unlimited/library/preferences.json";
const OUT = "data/unlimited/library/preference-reconciliation.md";
const DATE = new Date().toISOString().slice(0, 10);
const lib = JSON.parse(readFileSync(LIB, "utf8"));
const pref = JSON.parse(readFileSync(PREF, "utf8"));
pref.pairs ||= {};
const { entries, added, same, contradictions, open, kept } = reconcile(lib.pairs, pref.pairs, DATE);
if (!DRY) Object.assign(pref.pairs, entries);
if (!DRY) {
  pref._metadata.reconciled = { date: DATE, rule: "reviewer_final_best_available -> canonical when it differs from the provisional top candidate; contradictions left provisional", added: added.length };
  writeFileSync(PREF, JSON.stringify(pref, null, 2) + "\n");
}
const lines = [
  `# Preference reconciliation — ${DATE}${DRY ? " (dry run)" : ""}`,
  "",
  "Rule (parent): the blind reviewer's explicit FINAL best_available is the served choice when it is a PASS hint; numerical ties are not editorial equality. Nothing here changes verdicts, statuses or live boards.",
  "",
  `- pairs with an existing approved preference (untouched): ${kept.length}`,
  `- pairs where the reviewer's pick already was the provisional top candidate: ${same.length}`,
  `- preferences added: ${added.length} (${added.filter((l) => l.startsWith("tie")).length} ties, ${added.filter((l) => l.startsWith("OVERRIDE")).length} overrides of a higher-scored hint)`,
  `- contradictions flagged (reviewer prefers a non-PASS hint; left provisional): ${contradictions.length}`,
  `- proposed entries still open: ${open.length}`,
  "",
  "## Added", "", ...added.map((l) => `- ${l}`),
  "", "## Contradictions (unresolved, for the parent)", "", ...(contradictions.length ? contradictions.map((l) => `- ${l}`) : ["- none"]),
  "", "## Proposed entries not applied", "", ...(open.length ? open.map((l) => `- ${l}`) : ["- none"]),
];
writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`kept ${kept.length}, same ${same.length}, added ${added.length} (ties ${added.filter((l) => l.startsWith("tie")).length}), contradictions ${contradictions.length}, open ${open.length} -> ${OUT}${DRY ? " (dry)" : ""}`);
}
