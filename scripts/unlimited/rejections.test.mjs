// node --test scripts/unlimited/rejections.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

test("owner rejections match either word order and normalised hint text", () => {
  const entries = loadRejections();
  assert.equal(rejectionFor(entries, "ELVIS", "egypt", " memphis ")?.decision, "rejected");
  assert.equal(rejectionFor(entries, "RULER", "DOUGH", "GINGERBREAD")?.decision, "rejected");
  assert.equal(rejectionFor(entries, "CHAMPAGNE", "GUN", "SHOT")?.decision, "held");
  assert.equal(rejectionFor(entries, "DOUGH", "RULER", "MEASURING"), null);
  assert.equal(rejectionFor(entries, "SCIENCE", "GOLD", "ALCHEMY"), null, "SCIENCE + a metal is the kept ALCHEMY pattern");
});

test("a recorded combination is never served: library status and client export agree", () => {
  const entries = loadRejections();
  const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
  for (const e of entries) {
    const c = lib.pairs.find((p) => p.pair_id === e.pair_id)?.clues.find((x) => x.text === e.hint);
    if (c) assert.equal(c.status, e.decision, `${e.pair_id} ${e.hint}`);
  }
  const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
  for (const p of client.pairs) for (const h of p.hints) assert.equal(rejectionFor(entries, p.a, p.b, h.text), null, `${p.id} ${h.text}`);
});

test("catalogue add refuses a recorded combination", () => {
  const r = spawnSync(process.execPath, [resolve("scripts/unlimited/catalogue.mjs"), "add", "EGYPT", "ELVIS", "MEMPHIS", "--by", "owner", "--why", "x"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /recorded as rejected/);
});
