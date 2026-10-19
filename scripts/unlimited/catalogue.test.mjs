// node --test scripts/unlimited/catalogue.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pairOf, hintProblem, buildIndex, stats, emptyPairs, servedHints, pairState, pairCount, search, loadCatalogue } from "./catalogue-lib.mjs";

const CLI = resolve("scripts/unlimited/catalogue.mjs");
const clue = (text, status, a = 2, b = 2, f = 2) => ({ text, status, revealExplanation: `${text} explained`, provenance: { blindReview: { verdict: status === "ai_reviewed" ? "PASS" : "BORDERLINE", a, b, fairness: f } } });

test("pair ids: alphabetical, lower case, spaces as hyphens; the library already follows the rule", () => {
  assert.deepEqual(pairOf("pirate", "Gold"), { a: "GOLD", b: "PIRATE", id: "p_gold__pirate" });
  assert.deepEqual(pairOf("penguin", "ice  cream"), { a: "ICE CREAM", b: "PENGUIN", id: "p_ice-cream__penguin" });
  const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
  for (const p of lib.pairs) assert.equal(pairOf(p.a, p.b).id, p.pair_id, p.pair_id);
});

test("hint rule: one word of letters (NYC allowed), never containing or inside a target", () => {
  assert.equal(hintProblem("NYC", "APPLE", "BIG"), null);
  assert.equal(hintProblem("AMBUSH", "CALCULATOR", "CAMOUFLAGE"), null);
  assert.match(hintProblem("ICE AGE", "MAMMOTH", "SQUIRREL"), /one word/);
  assert.match(hintProblem("T-REX", "DINOSAUR", "KING"), /one word/);
  assert.match(hintProblem("FIRE", "FIREFIGHTER", "HOSE"), /target contains the hint/);
  assert.match(hintProblem("SUNFLOWER", "SUN", "SEED"), /contains a target/);
  assert.match(hintProblem("ICECREAM", "ICE CREAM", "CONE"), /target/);
});

test("empty pairs are virtual: counted and listed without being stored", () => {
  const words = ["ANT", "BEE", "CAT", "DOG", "EEL"];
  const ix = buildIndex({ words, pairs: [{ pair_id: "p_ant__bee", a: "ANT", b: "BEE", clues: [clue("HILL", "ai_reviewed")] }, { pair_id: "p_cat__dog", a: "CAT", b: "DOG", clues: [clue("PET", "held")] }], original: new Set(["ANT", "BEE"]) });
  const s = stats(ix);
  assert.equal(s.possiblePairs, pairCount(5)); assert.equal(s.possiblePairs, 10);
  assert.equal(s.emptyPairs, 8);
  assert.equal(s.states.playable, 1); assert.equal(s.states["held-or-candidate"], 1);
  assert.equal(s.targetWords, 2); assert.equal(s.targetWordsOutsideOriginal, 0); assert.equal(s.wordsWithNoPlayablePair, 3);
  const all = [...emptyPairs(ix)].map((p) => p.id);
  assert.equal(all.length, 8); assert.equal(new Set(all).size, 8);
  assert.ok(!all.includes("p_ant__bee") && !all.includes("p_cat__dog"));
  assert.deepEqual([...emptyPairs(ix, { word: "cat" })].map((p) => p.id), ["p_ant__cat", "p_bee__cat", "p_cat__eel"]);
  assert.equal(pairState(ix.byId.get("p_cat__dog")), "held-or-candidate");
  assert.equal(pairState(undefined), "empty");
  assert.equal(search(ix, "hill").length, 1);
});

test("served hint: an approved canonical wins, otherwise the strongest playable hint", () => {
  const p = { pair_id: "p_gold__pirate", a: "GOLD", b: "PIRATE", clues: [clue("DOUBLOON", "ai_reviewed"), clue("TREASURE", "ai_reviewed"), clue("COIN", "ai_reviewed", 2, 1), clue("BOOTY", "held")] };
  assert.deepEqual(servedHints(buildIndex({ words: ["GOLD", "PIRATE"], pairs: [p] }), p).hints.map((c) => c.text), ["DOUBLOON"]);
  const ix = buildIndex({ words: ["GOLD", "PIRATE"], pairs: [p], preferences: { p_gold__pirate: { status: "approved", canonical: "TREASURE" } } });
  assert.deepEqual(servedHints(ix, p), { rule: "canonical", hints: [p.clues[1]] });
});

test("the real catalogue: full bank, every library pair inside it, owner examples recorded", () => {
  const ix = loadCatalogue();
  const s = stats(ix);
  const snap = JSON.parse(readFileSync("data/unlimited/wordbank/wordbank.json", "utf8"))._metadata;
  assert.equal(s.bankWords, snap.databaseCount);              // the paged, count-verified snapshot
  assert.equal(s.possiblePairs, pairCount(snap.databaseCount));
  assert.deepEqual(s.pairWordsOutsideBank, []);
  for (const [id, hint] of [["p_food__zombie", "BRAINS"], ["p_apple__big", "NYC"], ["p_calculator__camouflage", "AMBUSH"], ["p_dinosaur__friend", "BARNEY"], ["p_christmas__robot", "EVE"]]) {
    const p = ix.byId.get(id);
    const c = p.clues.find((x) => x.text === hint);
    assert.equal(c.status, "human_approved"); assert.equal(c.provenance.source, "owner-discovery");
    assert.deepEqual(servedHints(ix, p).hints.map((x) => x.text), [hint]);
  }
  assert.ok(!ix.inBank.has("PURPLE"));   // reported missing, never added
});

test("add: friend discoveries wait as candidates; only the owner can approve; missing words are refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "cv-cat-"));
  mkdirSync(join(dir, "data/unlimited/wordbank"), { recursive: true }); mkdirSync(join(dir, "data/unlimited/library"), { recursive: true });
  writeFileSync(join(dir, "data/unlimited/wordbank/wordbank.json"), JSON.stringify({ words: ["CAMOUFLAGE", "CALCULATOR", "DINOSAUR", "ICE CREAM", "PENGUIN"] }));
  const existing = { pair_id: "p_dinosaur__penguin", a: "DINOSAUR", b: "PENGUIN", clues: [clue("BIRD", "ai_reviewed")] };
  writeFileSync(join(dir, "data/unlimited/library/pairs.json"), JSON.stringify({ _metadata: {}, pairs: [existing] }));
  writeFileSync(join(dir, "data/unlimited/library/preferences.json"), JSON.stringify({ _metadata: {}, pairs: {} }));
  writeFileSync(join(dir, "data/unlimited/library/overrides.json"), JSON.stringify({ _metadata: {}, overrides: [] }));
  writeFileSync(join(dir, "data/unlimited/library/shortlist-50.json"), JSON.stringify({ words: [] }));
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: dir, encoding: "utf8" });
  const read = (f) => JSON.parse(readFileSync(join(dir, "data/unlimited/library", f), "utf8"));

  let r = run("add", "penguin", "ice cream", "TUXEDO", "--by", "friend (game night)", "--why", "Penguins look like they wear tuxedos; ice cream sandwich? no", "--a", "A penguin's tuxedo.", "--b", "x");
  assert.equal(r.status, 0, r.stderr);
  let c = read("pairs.json").pairs.find((p) => p.pair_id === "p_ice-cream__penguin").clues[0];
  assert.equal(c.status, "candidate"); assert.equal(c.provenance.source, "friend-play");
  assert.equal(c.wordBConnection, "A penguin's tuxedo.");   // --a follows the typed order (penguin), stored under b
  r = run("add", "penguin", "ice cream", "CONE", "--by", "friend", "--why", "x", "--approve");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /owner/);
  r = run("add", "purple", "dinosaur", "BARNEY", "--by", "owner", "--why", "x", "--approve");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /PURPLE/);
  r = run("add", "dinosaur", "penguin", "BIRD", "--by", "owner", "--why", "x");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /already recorded/);
  r = run("add", "camouflage", "calculator", "AMBUSH", "--by", "owner", "--why", "Concealment and a calculated attack.", "--approve", "--prefer");
  assert.equal(r.status, 0, r.stderr);
  c = read("pairs.json").pairs.find((p) => p.pair_id === "p_calculator__camouflage").clues[0];
  assert.equal(c.status, "human_approved");
  assert.equal(read("overrides.json").overrides[0].status, "human_approved");
  assert.equal(read("preferences.json").pairs.p_calculator__camouflage.canonical, "AMBUSH");
  // the existing pair and its review are untouched
  assert.deepEqual(read("pairs.json").pairs.find((p) => p.pair_id === "p_dinosaur__penguin"), existing);
  // show / empty work against the same files
  assert.match(execFileSync(process.execPath, [CLI, "show", "ice cream", "penguin"], { cwd: dir, encoding: "utf8" }), /TUXEDO\s+candidate/);
  assert.match(execFileSync(process.execPath, [CLI, "empty", "--word", "dinosaur"], { cwd: dir, encoding: "utf8" }), /3 shown of 3 empty pairs/);
});
