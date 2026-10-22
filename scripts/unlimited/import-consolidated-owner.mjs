#!/usr/bin/env node
// Replays the owner decisions for the consolidated-1022 import branch, in order, with the existing tools:
//   add      catalogue.mjs add <A> <B> <HINT> --by owner --approve [--prefer] (refuses duplicates and recorded rejections)
//   approve  an existing hint becomes human_approved by the owner (overrides.json) and, with prefer, the pair's
//            canonical hint (preferences.json); optional owner text goes through correct-text.mjs
//   hold     an owner hold in rejections.json (the hint is never served for that pair)
// Then labels owner-added hints with the import's content labels. Run after the import merge and the line
// swaps, before apply-overrides.mjs and export-random-library.mjs:
//   node scripts/unlimited/import-consolidated-owner.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PATHS, pairOf, normHint, hintKey } from "./catalogue-lib.mjs";
import { REJECTIONS } from "./rejections-lib.mjs";

const DIR = "data/unlimited/imports/consolidated-1022";
const { decisions } = JSON.parse(readFileSync(`${DIR}/owner-decisions.json`, "utf8"));
const LABELS = Object.entries(JSON.parse(readFileSync(`${DIR}/content-labels.json`, "utf8")).labels).map(([k, re]) => [k, new RegExp(re)]);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, j) => writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
const run = (script, args) => {
  const r = spawnSync(process.execPath, [`scripts/unlimited/${script}`, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${script} ${args.slice(0, 3).join(" ")}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};

const added = [];
for (const d of decisions) {
  const [x, y] = d.pair; const { id, a } = pairOf(x, y); const hint = normHint(d.hint);
  if (d.action === "add") {
    console.log(run("catalogue.mjs", ["add", x, y, hint, "--by", "owner", "--approve", ...(d.prefer ? ["--prefer"] : []), "--why", d.why, "--a", d.a, "--b", d.b, "--note", d.note]));
    added.push({ id, hint });
  } else if (d.action === "approve") {
    const lib = read(PATHS.pairs);
    const c = lib.pairs.find((p) => p.pair_id === id)?.clues.find((h) => hintKey(h.text) === hintKey(hint));
    if (!c) throw new Error(`${id} has no ${hint} to approve`);
    if (d.text) console.log(run("correct-text.mjs", [x, y, c.text, "--by", "owner", "--note", `owner text ${d.date}`, "--why", d.text.why, "--a", d.text.a, "--b", d.text.b]));
    const o = read(PATHS.overrides);
    if (!o.overrides.some((e) => e.pair_id === id && e.text === c.text && e.status === "human_approved" && e.by === "owner" && !e.superseded))
      o.overrides.push({ pair_id: id, text: c.text, status: "human_approved", by: "owner", date: d.date, reason: d.reason });
    write(PATHS.overrides, o);
    if (d.prefer) {
      const pr = read(PATHS.preferences);
      const cur = pr.pairs[id];
      if (cur?.status === "approved" && cur.canonical !== c.text) throw new Error(`${id} already prefers ${cur.canonical || cur.equal}; change it with the owner`);
      pr.pairs[id] = { status: "approved", canonical: c.text, by: "owner", date: d.date, reason: `${d.reason}${d.replaces ? `; ${d.replaces} stays stored, no longer served` : ""}` };
      write(PATHS.preferences, pr);
    }
    console.log(`approved ${c.text} for ${id}${d.prefer ? ", preferred" : ""}`);
  } else if (d.action === "hold") {
    const r = read(REJECTIONS);
    if (!r.entries.some((e) => e.pair_id === id && hintKey(e.hint) === hintKey(hint)))
      r.entries.push({ a, b: pairOf(x, y).b, pair_id: id, hint, decision: "held", by: "owner", date: d.date, reason: d.reason });
    write(REJECTIONS, r);
    console.log(`owner hold ${hint} for ${id}`);
  } else throw new Error(`unknown action ${d.action}`);
}

// Content labels on owner-added hints (same rules as the import; labels only, nothing is held by them).
const lib = read(PATHS.pairs); let labelled = 0;
for (const { id, hint } of added) {
  const p = lib.pairs.find((q) => q.pair_id === id); const c = p.clues.find((h) => h.text === hint);
  const t = [p.a, p.b, c.text, c.wordAConnection, c.wordBConnection].join(" | ").toUpperCase();
  const flags = LABELS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (flags.length) { c.contentFlags = flags; labelled++; }
}
write(PATHS.pairs, lib);
console.log(`${decisions.length} owner decisions replayed; ${added.length} owner hints added (${labelled} labelled)`);
