#!/usr/bin/env node
// Reconciles the owner's x03 requests (data/unlimited/expansion/x03-requests.json)
// against the bank snapshot, the library, preferences, overrides and rejections.
//   node scripts/unlimited/x03-requests.mjs check [--md <out.md>]    the checklist (read-only)
//   node scripts/unlimited/x03-requests.mjs apply                    adds owner_add / owner_add_held items not yet present
//   node scripts/unlimited/x03-requests.mjs review-batch <out.json>  writes the "review" items not yet in the library as an authored batch
// apply goes through catalogue.mjs add (so the bank, hint-rule and rejection checks
// apply) and never edits an existing hint. Owner hints on a new pair become its
// preferred hint; requests.equalSets become approved equal sets (all members served).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PATHS, loadCatalogue, pairOf, hintProblem, normWord, PLAYABLE } from "./catalogue-lib.mjs";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

const REQ = "data/unlimited/expansion/x03-requests.json";
const TAG = process.env.TAG || "x03";
const NOTE = process.env.NOTE || "x03 owner additions (2026-10-19)";
const req = JSON.parse(readFileSync(process.env.REQUESTS || REQ, "utf8"));
const CLIENT = new Map(JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8")).pairs.map((p) => [p.id, p]));
const [cmd, ...rest] = process.argv.slice(2);
const today = () => new Date().toISOString().slice(0, 10);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function clueOf(ix, it) {
  const { id } = pairOf(it.a, it.b);
  return { id, pair: ix.byId.get(id) || null, clue: ix.byId.get(id)?.clues.find((c) => c.text === normWord(it.hint)) || null };
}
const isX03 = (c) => String(c.provenance?.note || "").startsWith(TAG) || String(c.provenance?.source || "").startsWith(TAG);

function status(ix, rejections, overrides, it) {
  const missing = [it.a, it.b].filter((w) => !ix.inBank.has(normWord(w)));
  if (missing.length) return { key: "missing bank word", detail: missing.join(", ") };
  const { id, clue } = clueOf(ix, it);
  if (it.hint === "*") {
    const hold = overrides.find((o) => o.pair_id === id && o.status === "hold_pair");
    return hold ? { key: "held", detail: `pair hold (overrides.json, ${hold.by}): ${hold.reason.slice(0, 120)}…` } : { key: "NOT HELD", detail: "expected a hold_pair override" };
  }
  const rec = rejectionFor(rejections, it.a, it.b, it.hint);
  if (it.intent === "rejected" || it.intent === "held") {
    if (!rec || rec.decision !== it.intent) return { key: `NOT RECORDED`, detail: `expected ${it.intent} in rejections.json` };
    return { key: it.intent === "rejected" ? "rejected (recorded)" : "held (recorded)", detail: `${rec.reason}${clue ? `; library hint status ${clue.status}` : "; not in the library"}` };
  }
  if (it.intent === "pending") return { key: clue ? "pending (recorded, held)" : "pending owner decision", detail: it.note || "" };
  const rule = hintProblem(it.hint, normWord(it.a), normWord(it.b));
  if (rule) return { key: "not added", detail: `hint rule: ${rule}` };
  if (rec) return { key: rec.decision, detail: rec.reason };
  if (!clue) return { key: it.intent === "review" ? "pending review" : "NOT ADDED", detail: "" };
  // Served = present among the pair's choices in the real client export (what boards can show).
  const served = !!CLIENT.get(id)?.hints.some((h) => h.text === clue.text);
  const r = clue.provenance?.blindReview;
  const verdict = r ? ` ${r.verdict} ${r.a}/${r.b}/${r.fairness}${r.delight != null ? ` d${r.delight}` : ""}` : "";
  if (!isX03(clue)) return { key: "already present", detail: `${clue.provenance?.source || "?"}, ${clue.status}${served ? ", served" : ", not served"}` };
  if (clue.status === "human_approved") return { key: "added (owner)", detail: served ? "served" : "playable, not the served choice" };
  if (clue.status === "candidate" || clue.status === "held") return { key: it.intent === "review" ? "held after review" : "added, held", detail: `${clue.heldReason || ""}${verdict}` };
  if (clue.status === "ai_reviewed") return { key: "added (review PASS)", detail: `${verdict.trim()}${served ? ", served" : ", playable, not the served choice"}` };
  return { key: `review ${clue.status}`, detail: `${clue.heldReason || ""}${verdict}` };
}

function checklist() {
  const ix = loadCatalogue();
  const rejections = loadRejections();
  const overrides = readJson(PATHS.overrides).overrides;
  return req.items.map((it) => ({ ...it, ...status(ix, rejections, overrides, it) }));
}

if (cmd === "check") {
  const rows = checklist();
  const counts = {};
  for (const r of rows) counts[r.key] = (counts[r.key] || 0) + 1;
  const md = ["| Ref | Pair | Hint | Requested as | Status | Detail |", "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.ref} | ${r.a} + ${r.b} | ${r.hint} | ${r.intent} | **${r.key}** | ${String(r.detail).replace(/\|/g, "/")} |`)].join("\n");
  const i = rest.indexOf("--md");
  if (i >= 0) writeFileSync(rest[i + 1], md + "\n");
  console.log(md);
  console.log("\n" + JSON.stringify(counts));
} else if (cmd === "apply") {
  const CLI = resolve("scripts/unlimited/catalogue.mjs");
  const equal = req.equalSets || {};
  for (const it of req.items.filter((x) => x.intent === "owner_add" || x.intent === "owner_add_held")) {
    const ix = loadCatalogue();
    const { id, pair, clue } = clueOf(ix, it);
    if (clue) { console.log(`present: ${it.ref} ${it.a} + ${it.b} → ${it.hint}`); continue; }
    if ([it.a, it.b].some((w) => !ix.inBank.has(normWord(w)))) { console.log(`missing bank word: ${it.ref}`); continue; }
    const rule = hintProblem(it.hint, normWord(it.a), normWord(it.b));
    if (rule) { console.log(`hint rule, kept in the ledger: ${it.ref} ${it.hint}: ${rule}`); continue; }
    const approve = it.intent === "owner_add";
    const prefer = approve && !equal[id] && !pair && !ix.preferences[id];
    const args = [CLI, "add", it.a, it.b, it.hint, "--by", "owner", "--type", "owner", "--why", it.why, "--a", it.links?.[it.a] ?? "", "--b", it.links?.[it.b] ?? "", "--note", `${NOTE}, ${it.ref}`];
    if (approve) args.push("--approve");
    if (prefer) args.push("--prefer");
    console.log(execFileSync(process.execPath, args, { encoding: "utf8" }).trim());
    if (!approve) {
      const lib = readJson(PATHS.pairs);
      const c = lib.pairs.find((p) => p.pair_id === id).clues.find((x) => x.text === normWord(it.hint));
      c.heldReason = `owner-requested; held: ${it.note}`;
      writeFileSync(PATHS.pairs, JSON.stringify(lib, null, 2) + "\n");
    }
  }
  const pr = readJson(PATHS.preferences);
  for (const [id, members] of Object.entries(equal)) {
    const cur = pr.pairs[id];
    if (cur?.status === "approved" && cur.canonical) { console.log(`equal set for ${id} skipped: approved canonical ${cur.canonical} (owner decision needed)`); continue; }
    pr.pairs[id] = { status: "approved", equal: members, by: "owner", date: today(), reason: `${NOTE}: the owner listed these as separate hints for one pair; all are served, varied per board` };
    console.log(`equal set ${id}: ${members.join(", ")}`);
  }
  writeFileSync(PATHS.preferences, JSON.stringify(pr, null, 2) + "\n");
} else if (cmd === "review-batch") {
  const out = rest[0];
  if (!out) { console.error("usage: review-batch <out.json>"); process.exit(2); }
  const ix = loadCatalogue();
  const rejections = loadRejections();
  const byPair = new Map();
  const skipped = [];
  for (const it of req.items.filter((x) => x.intent === "review")) {
    const { id, clue } = clueOf(ix, it);
    const why = [it.a, it.b].some((w) => !ix.inBank.has(normWord(w))) ? "missing bank word"
      : hintProblem(it.hint, normWord(it.a), normWord(it.b)) || (rejectionFor(rejections, it.a, it.b, it.hint) ? "recorded rejection/hold" : clue ? "already in the library" : !it.why ? "no text" : null);
    if (why) { skipped.push(`${it.ref} ${it.a} + ${it.b} → ${it.hint}: ${why}`); continue; }
    const { a, b } = pairOf(it.a, it.b);
    if (!byPair.has(id)) byPair.set(id, { pair_id: id, a, b, request: [], clues: [], variants: [], rejected: [] });
    const p = byPair.get(id);
    p.request.push(it.ref);
    p.clues.push({ text: normWord(it.hint), type: "owner-variation", wordAConnection: it.links[a] ?? it.links[it.a], wordBConnection: it.links[b] ?? it.links[it.b], revealExplanation: it.why, reference: null, request: it.ref });
  }
  writeFileSync(out, JSON.stringify({ _metadata: { batch: process.env.BATCH || "x03-v", source: process.env.REQUESTS || REQ, prepared: today(), note: "owner variations to review (x03 brief section 3, plus ORIOLE)" }, pairs: [...byPair.values()] }, null, 1) + "\n");
  console.log(`${out}: ${byPair.size} pairs, ${[...byPair.values()].reduce((n, p) => n + p.clues.length, 0)} hints; skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
} else {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
}
