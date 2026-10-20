#!/usr/bin/env node
// x06 checkpoint table: the 51 reviewed candidates + the x05 owner pairs (9 approved hints),
// with final text, review verdict/ratings, and served vs stored choices from the real export.
//   node scripts/unlimited/x06-table.mjs <out-dir> [<previous export to compare>]
import { readFileSync, writeFileSync } from "node:fs";
const [out, prevPath] = process.argv.slice(2);
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
const C = new Map(client.pairs.map((p) => [p.id, p]));
const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const md = (r) => "| " + r.map((v) => String(v ?? "").replace(/\|/g, "/")).join(" | ") + " |";
const H = ["#", "Section", "Hint", "Target A", "Target B", "Final explanation", "Line for A", "Line for B", "Decision", "Verdict", "A/B/fair", "Delight", "Recognizability", "Flags", "Reviewer reason", "Served for this pair (real export)", "Stored options for this pair"];
const rows = []; let n = 0;
const add = (section, p, c) => {
  const b = c.provenance?.blindReview;
  const served = C.get(p.pair_id)?.hints.map((h) => h.text) || [];
  rows.push([++n, section, c.text, p.a, p.b, c.revealExplanation, c.wordAConnection, c.wordBConnection,
    c.status === "human_approved" ? "owner decision (approved)" : c.status === "ai_reviewed" ? "accepted (review PASS)" : `held (${c.heldReason || c.status})`,
    b?.verdict || "owner (no review)", b ? `${b.a}/${b.b}/${b.fairness}` : "", b?.delight ?? "", b?.recognizability || "", (b?.flags || []).join(" "), b?.reason || "",
    served.length ? served.join(" / ") : "none", p.clues.map((x) => `${x.text} (${x.status})`).join("; ")]);
};
for (const p of lib.pairs) for (const c of p.clues) if (c.provenance?.source === "x06") add("x06 reviewed candidate", p, c);
for (const p of lib.pairs) for (const c of p.clues) if (String(c.provenance?.note || "").startsWith("x05")) add("x05 owner pair", p, c);
writeFileSync(`${out}/x06-checkpoint-table.csv`, [H, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n");
writeFileSync(`${out}/x06-checkpoint-table.md`, "# x06 checkpoint: 51 reviewed candidates + the x05 owner pairs\n\nServed = the real client export (`src/unlimited/random-library.json`).\n\n" + md(H) + "\n" + md(H.map(() => "---")) + "\n" + rows.map(md).join("\n") + "\n");
const x06 = rows.filter((r) => r[1].startsWith("x06")), own = rows.filter((r) => r[1].startsWith("x05"));
let changed = 0;
if (prevPath) { const prev = new Map(JSON.parse(readFileSync(prevPath, "utf8")).pairs.map((p) => [p.id, p.hints.map((h) => h.text).join("/")])); for (const p of client.pairs) if (prev.has(p.id) && prev.get(p.id) !== p.hints.map((h) => h.text).join("/")) changed++; }
console.log(JSON.stringify({ x06: x06.length, pass: x06.filter((r) => r[9] === "PASS").length, held: x06.filter((r) => r[8].startsWith("held")).length, served: x06.filter((r) => r[15] !== "none").length, ownerHints: own.length, ownerPairs: new Set(own.map((r) => r[3] + r[4])).size, previouslyServedPairsChanged: changed, exportPairs: client.pairs.length }));
