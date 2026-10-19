// node --test scripts/unlimited/related.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "cv-related-")), "c.json");
const report = JSON.parse(execFileSync(process.execPath, [resolve("scripts/unlimited/related-variations.mjs"), "--json", out], { encoding: "utf8" }));
const full = JSON.parse(readFileSync(out, "utf8"));

test("every index word is a bank word, and every seed pair is regenerated", () => {
  assert.deepEqual(report.problems, []);
  for (const s of report.summary) assert.ok(!s.recall.includes(":NO"), `${s.hint}: ${s.recall}`);
});

test("owner rejections, never-pairs and the hint rule block candidates; FOOD + BED is never proposed", () => {
  const all = full.hints.flatMap((h) => h.candidates);
  const find = (hint, a, b) => all.find((c) => c.hint === hint && c.a === a && c.b === b);
  assert.equal(find("BEANBAG", "BED", "FOOD"), undefined, "BED is not a seat for BEANBAG");
  assert.equal(find("FROZEN", "SNOW", "SNOWMAN")?.class, "never");
  assert.equal(find("FROZEN", "FILM", "MOVIE")?.class, "never");
  assert.ok(all.filter((c) => c.forReview).every((c) => c.class === "new"), "only new candidates go to review");
  assert.ok(!all.some((c) => c.hint === "ALCHEMY" && [c.a, c.b].includes("MAGIC")), "no MAGIC route for ALCHEMY");
});

test("review selection is capped per hint and spread across route combinations", () => {
  for (const h of full.hints) {
    const chosen = h.candidates.filter((c) => c.forReview);
    assert.ok(chosen.length <= (h.hint === "FROZEN" ? 20 : 14), h.hint);
    const combos = new Set(chosen.map((c) => c.routes));
    const eligibleCombos = new Set(h.candidates.filter((c) => c.eligible).map((c) => c.routes));
    assert.ok(combos.size >= Math.min(eligibleCombos.size, chosen.length), `${h.hint}: round-robin over combinations`);
  }
});
