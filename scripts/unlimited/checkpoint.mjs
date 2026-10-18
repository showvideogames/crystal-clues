#!/usr/bin/env node
// Writes the per-batch checkpoint from the data on disk (library, review,
// manifest): totals before/after, verdict counts, pairs without a PASS with
// their best available, every pair's playable hints, reviewer judgement
// notes and usage. Read-only over the data; the checkpoint is the only output.
//   node scripts/unlimited/checkpoint.mjs u05 --review data/unlimited/library/reviews/u05-blind-review.json --usage "96,327 subagent tokens, 5.4 min" [--before path/to/manifest-before.json]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const argv = process.argv.slice(2);
const batch = argv[0];
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
if (!batch) { console.error("usage: checkpoint.mjs <batch> --review <file> [--usage text] [--before manifest.json]"); process.exit(2); }
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const man = JSON.parse(readFileSync("data/unlimited/library/manifest-1225.json", "utf8"));
const review = JSON.parse(readFileSync(arg("review"), "utf8"));
const before = arg("before") && existsSync(arg("before")) ? JSON.parse(readFileSync(arg("before"), "utf8")) : null;
const pairs = lib.pairs.filter((p) => p.source === batch);
const verdicts = {};
for (const rp of review.pairs) for (const h of rp.hints) verdicts[h.verdict] = (verdicts[h.verdict] || 0) + 1;
const hintCount = review.pairs.reduce((n, p) => n + p.hints.length, 0);
const playable = pairs.filter((p) => p.playableHints > 0), heldOnly = pairs.filter((p) => p.playableHints === 0 && p.clues.some((c) => c.status === "held")), rejectedOnly = pairs.filter((p) => p.playableHints === 0 && !p.clues.some((c) => c.status === "held"));
const stretchPassed = pairs.flatMap((p) => p.clues.filter((c) => c.stretch && c.status === "ai_reviewed").map((c) => `${c.text} (${p.a}+${p.b})`));
const stretchTotal = pairs.reduce((n, p) => n + p.clues.filter((c) => c.stretch).length, 0);
const needText = pairs.flatMap((p) => p.clues.filter((c) => c.status === "held" && /needs player/.test(c.heldReason || "")).map((c) => `${p.a}+${p.b} ${c.text}`));
const s = man.summary, b = before?.summary;
const row = (label, k) => `| ${label} | ${b ? b[k] : "—"} | ${s[k]} |`;
const lines = [
  `# Checkpoint ${batch} — ${new Date().toISOString().slice(0, 10)}`, "",
  "Nothing from this batch is served; no live board changed. Statuses come from the blind verdict only; nothing is human-approved.", "",
  "## Library totals", "", "| | before | after |", "|---|---|---|",
  row("pairs authored / reviewed", "reviewed"), row("playable pairs", "playable"), row("held-only (best available exists)", "held_only"), row("rejected-only", "rejected_only"), row("holes", "hole"), "",
  `## ${batch}: ${pairs.length} pairs, ${hintCount} hints reviewed`, "",
  `Verdicts: **${verdicts.PASS || 0} PASS / ${verdicts.BORDERLINE || 0} BORDERLINE / ${verdicts.FAIL || 0} FAIL**. Pair outcome: **${playable.length} playable, ${heldOnly.length} held-only, ${rejectedOnly.length} rejected-only**. Stretch-labelled hints: ${stretchTotal}, of which passed: ${stretchPassed.length}${stretchPassed.length ? ` (${stretchPassed.join(", ")})` : ""}.`,
  needText.length ? `PASS but held for missing player text: ${needText.join(", ")}.` : "No PASS is held for missing text.", "",
  "### Pairs without a PASS (best available in brackets, never served automatically)", "",
  ...(heldOnly.concat(rejectedOnly).map((p) => `- ${p.a}+${p.b} [${p.reviewerBestAvailable?.text || "—"}: ${p.reviewerBestAvailable?.why || ""}]`) || []), ...(heldOnly.length + rejectedOnly.length ? [] : ["- none"]), "",
  "### All pairs: playable | best available", "",
  ...pairs.map((p) => `- ${p.a}+${p.b}: ${p.clues.filter((c) => c.status === "ai_reviewed").map((c) => c.text).join(" ") || "—"} | ${p.reviewerBestAvailable?.text || "—"}`), "",
  "### Reviewer notes (per pair)", "", ...review.pairs.filter((rp) => rp.pair_note).map((rp) => `- ${rp.a}+${rp.b}: ${rp.pair_note}`), "",
  "## Usage", "", `Blind review subagent: ${arg("usage", "see task notification")}. Paid extras OFF; no paid API.`, "",
  `Raw files: batches/${batch}-batch.json (author), reviews/${batch}-blind-input.json, -key.json, -review.json; packet library/review-packet-${batch}.md.`, "",
];
mkdirSync("data/unlimited/library/checkpoints", { recursive: true });
const out = `data/unlimited/library/checkpoints/${batch}.md`;
writeFileSync(out, lines.join("\n"));
console.log(`${out}: ${pairs.length} pairs, ${playable.length} playable / ${heldOnly.length} held-only / ${rejectedOnly.length} rejected-only; verdicts ${JSON.stringify(verdicts)}`);
