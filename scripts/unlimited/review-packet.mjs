#!/usr/bin/env node
// A readable review packet from the pair library: the shortlist, then every
// pair with its FINAL hints by status (retained = ai_reviewed, held, rejected)
// and the blind reviewer's one-line reason for each. Statuses come from the
// blind review only; the author's labels are shown as provenance.
//   node scripts/unlimited/review-packet.mjs [--source u01-first-sample|pilot-2026-10|all] [--out file.md]
import { readFileSync, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SOURCE = arg("source", "all");
const OUT = arg("out", `data/unlimited/library/review-packet-${SOURCE}.md`);
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const shortlist = JSON.parse(readFileSync("data/unlimited/library/shortlist-50.json", "utf8"));
const pairs = lib.pairs.filter((p) => SOURCE === "all" || p.source === SOURCE);

const lines = [];
lines.push(`# Cluevoyance Unlimited — review packet (${SOURCE})`, "", `Generated ${new Date().toISOString().slice(0, 10)} from data/unlimited/library/pairs.json. Every status below is the result of a fresh blind review in this session (pair + hint only, no author text). Historical pilot scores are provenance only. No hint is human-approved.`, "");
lines.push("## The 50-word shortlist", "", `Source: ${shortlist._metadata.source}`, "", "| Word | From | Why |", "|---|---|---|");
for (const w of shortlist.words) lines.push(`| ${w.word} | ${w.from} | ${w.reason} |`);
lines.push("", `## Pairs (${pairs.length})`, "", "Legend: **retained** = passed the blind review and has player-facing text (playable); **held** = borderline, or passed but still needs player text; **rejected** = failed (does not reach both words, or contains a target). *Author label* is what the author thought before the review.", "");
const totals = { ai_reviewed: 0, held: 0, rejected: 0 };
for (const p of pairs) {
  const groups = { ai_reviewed: [], held: [], rejected: [] };
  for (const c of p.clues) (groups[c.status] || groups.held).push(c);
  Object.keys(groups).forEach((k) => { totals[k] += groups[k].length; });
  lines.push(`### ${p.a} + ${p.b}`, "", `Playable hints: ${p.playableHints}.${p.pairNote ? ` Reviewer: ${p.pairNote}` : ""}`, "");
  const row = (c) => {
    const b = c.provenance.blindReview;
    const flags = b.flags?.length ? ` [${b.flags.join(", ")}]` : "";
    const author = c.provenance.authorLabel ? ` *(author: ${c.provenance.authorLabel}${c.provenance.authorReason ? ` — ${c.provenance.authorReason}` : ""})*` : "";
    const held = c.heldReason && c.status === "held" ? ` — held: ${c.heldReason}` : "";
    return `- **${c.text}** ${b.a}/${b.b} fair ${b.fairness} ${b.recognizability || ""}${flags}: ${b.reason}${held}${author}`;
  };
  if (groups.ai_reviewed.length) { lines.push("**Retained**", "", ...groups.ai_reviewed.map(row), ""); }
  if (groups.held.length) { lines.push("**Held**", "", ...groups.held.map(row), ""); }
  if (groups.rejected.length) { lines.push("**Rejected**", "", ...groups.rejected.map(row), ""); }
}
lines.push("## Totals", "", `retained ${totals.ai_reviewed} · held ${totals.held} · rejected ${totals.rejected} across ${pairs.length} pairs; ${pairs.filter((p) => p.playableHints > 0).length} pairs have at least one playable hint.`, "");
writeFileSync(OUT, lines.join("\n"));
console.log(`wrote ${OUT}: ${pairs.length} pairs, retained ${totals.ai_reviewed}, held ${totals.held}, rejected ${totals.rejected}`);
