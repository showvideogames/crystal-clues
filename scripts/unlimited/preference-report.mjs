#!/usr/bin/env node
// What the preferences file would change, board by board, without changing
// anything: for the live pool and a pending batch, each served hint versus
// the hint the preference rules would pick. Owner/parent-approved entries and
// the session's proposed entries are reported separately.
//   node scripts/unlimited/preference-report.mjs [--pending data/unlimited/boards/beta-02/boards.json] [--out file.md]
import { readFileSync, writeFileSync } from "node:fs";
import { hintChoices } from "./assemble-boards.mjs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const PENDING = arg("pending", "data/unlimited/boards/beta-02/boards.json");
const OUT = arg("out", null);
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const prefs = JSON.parse(readFileSync("data/unlimited/library/preferences.json", "utf8")).pairs;
const live = JSON.parse(readFileSync("src/unlimited/pool.json", "utf8")).boards.filter((b) => b.index <= 8);
const pending = JSON.parse(readFileSync(PENDING, "utf8")).boards;
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
const lines = [`# Preference review (${new Date().toISOString().slice(0, 10)})`, "", "Live snapshots are never changed by preferences; the live table is for information. Pending boards are local, not released.", ""];
const section = (title, boards, note) => {
  lines.push(`## ${title}`, "", note, "", "| Board | Pair | Served | Rule now | Would serve under APPROVED prefs | Change? | Under PROPOSED prefs too | Change? |", "|---|---|---|---|---|---|---|---|");
  let changesApproved = 0, changesProposed = 0;
  for (const b of boards) for (const r of b.reveal) {
    const p = lib.pairs.find((x) => x.pair_id === r.pairId);
    const hints = p.clues.filter((c) => PLAYABLE.has(c.status));
    const approvedOnly = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v.status === "approved"));
    const allAsApproved = Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, { ...v, status: "approved" }]));
    const a = hintChoices(p, hints, approvedOnly), q = hintChoices(p, hints, allAsApproved);
    const fmt = (ch) => ch.rule === "canonical" ? (ch.hints[0]?.text || "(none playable)") : `vary: ${ch.hints.map((h) => h.text).join("/")}`;
    const chA = ch => (ch.rule === "canonical" ? ch.hints[0]?.text !== r.clue : !ch.hints.some((h) => h.text === r.clue));
    const cA = chA(a), cP = chA(q);
    if (cA) changesApproved++; if (cP) changesProposed++;
    const hold = p.generationHold ? " (pair now under generation hold)" : "";
    lines.push(`| ${b.id} | ${r.wordA}+${r.wordB}${hold} | **${r.clue}** | ${r.hintChoice?.rule || "top-score (pre-preferences)"} | ${fmt(a)} | ${cA ? "YES" : "no"} | ${fmt(q)} | ${cP ? "YES" : "no"} |`);
  }
  lines.push("", `Hints that would change: ${changesApproved} under approved preferences (owner/parent), ${changesProposed} if the proposed entries were approved too.`, "");
};
section("Live beta-01 (information only; snapshots fixed)", live, "The owner's explicit preference (GOLD+PIRATE → TREASURE) concerns beta-01-002, which keeps DOUBLOON as played and recorded.");
section(`Pending ${PENDING}`, pending, "These boards are local only. A 'YES' means re-assembling with the preference would serve a different hint; the pair's other hints stay in the library.");
lines.push("## Preference entries", "", "| Pair | Status | Canonical | Equal set | By | Reason |", "|---|---|---|---|---|---|");
for (const [id, v] of Object.entries(prefs)) lines.push(`| ${id} | ${v.status} | ${v.canonical || ""} | ${(v.equal || []).join("/")} | ${v.by} | ${v.reason} |`);
lines.push("", "## Generation holds", "", ...lib.pairs.filter((p) => p.generationHold).map((p) => `- ${p.pair_id}: ${p.generationHold.reason} (by ${p.generationHold.by}, ${p.generationHold.date})`), "");
const text = lines.join("\n");
if (OUT) writeFileSync(OUT, text + "\n");
console.log(text);
