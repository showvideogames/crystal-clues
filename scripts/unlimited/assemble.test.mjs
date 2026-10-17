// Preferred-hint selection and generation holds in the assembler.
//   node --test scripts/unlimited/assemble.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { assembleBatch, hintChoices } from "./assemble-boards.mjs";

const hint = (text, a = 2, b = 2, fairness = 2, status = "ai_reviewed") => ({ text, status, wordAConnection: `${text} a`, wordBConnection: `${text} b`, revealExplanation: text, provenance: { blindReview: { a, b, fairness } } });
const pair = (a, b, clues) => ({ pair_id: `p_${a.toLowerCase()}__${b.toLowerCase()}`, a, b, source: "t", clues });
// Enough words for one board: 8 targets + 20 decoys.
const WORDS = ["GOLD", "PIRATE", "LION", "WITCH", "EGG", "SPRING", "CAT", "MOUSE", ...Array.from({ length: 24 }, (_, i) => `W${i}`)];
const pairs = () => [
  pair("GOLD", "PIRATE", [hint("DOUBLOON"), hint("TREASURE"), hint("COIN", 2, 1)]),
  pair("LION", "WITCH", [hint("WARDROBE"), hint("NARNIA")]),
  pair("EGG", "SPRING", [hint("ROLL"), hint("EASTER"), hint("CHICK", 2, 1)]),
  pair("CAT", "MOUSE", [hint("CHASE"), hint("TOM", 2, 1)]),
];

test("an approved canonical hint is the only choice; a proposed one is not read", () => {
  const p = pairs()[0];
  const approved = { [p.pair_id]: { status: "approved", canonical: "TREASURE" } };
  assert.deepEqual(hintChoices(p, p.clues, approved).hints.map((h) => h.text), ["TREASURE"]);
  const proposed = { [p.pair_id]: { status: "proposed", canonical: "TREASURE" } };
  const ch = hintChoices(p, p.clues, proposed);
  assert.equal(ch.rule, "top-score");
  assert.deepEqual(ch.hints.map((h) => h.text).sort(), ["DOUBLOON", "TREASURE"]);
});

test("without a preference the assembler varies among the top-scoring hints only", () => {
  const p = pairs()[2];
  assert.deepEqual(hintChoices(p, p.clues, {}).hints.map((h) => h.text).sort(), ["EASTER", "ROLL"]);
});

test("an approved equal set restricts variation to that set", () => {
  const p = pairs()[2];
  const prefs = { [p.pair_id]: { status: "approved", equal: ["ROLL"] } };
  assert.deepEqual(hintChoices(p, p.clues, prefs).hints.map((h) => h.text), ["ROLL"]);
});

test("the canonical hint wins on every assembled board, for every seed", () => {
  const prefs = { p_gold__pirate: { status: "approved", canonical: "TREASURE" } };
  for (let seed = 1; seed <= 25; seed++) {
    const res = assembleBatch({ pairs: pairs(), words: WORDS, seed, count: 1, maxTarget: 3, batch: "t", preferences: prefs });
    assert.equal(res.boards.length, 1);
    const r = res.boards[0].reveal.find((x) => x.pairId === "p_gold__pirate");
    assert.equal(r.clue, "TREASURE");
    assert.equal(r.hintChoice.rule, "canonical");
    assert.deepEqual(r.hintChoice.alternatives.sort(), ["COIN", "DOUBLOON"]);
  }
});

test("a canonical hint that collides is never downgraded: the pair is left out instead", () => {
  // Two pairs whose only allowed hints are the same text: they can never share a board.
  const ps = [...pairs(), pair("W0", "W1", [hint("TREASURE"), hint("OTHER")])];
  const prefs = { p_gold__pirate: { status: "approved", canonical: "TREASURE" }, p_w0__w1: { status: "approved", canonical: "TREASURE" } };
  const words = [...WORDS, "W1"];
  for (let seed = 1; seed <= 10; seed++) {
    const res = assembleBatch({ pairs: ps, words, seed, count: 2, maxTarget: 3, batch: "t", preferences: prefs });
    for (const b of res.boards) {
      const served = b.reveal.map((r) => `${r.pairId}:${r.clue}`);
      assert.ok(!served.includes("p_gold__pirate:DOUBLOON") && !served.includes("p_gold__pirate:COIN"), "GOLD+PIRATE never serves a weaker hint");
      assert.ok(!served.includes("p_w0__w1:OTHER"), "W0+W1 never serves a weaker hint");
      assert.ok(!(served.includes("p_gold__pirate:TREASURE") && served.includes("p_w0__w1:TREASURE")), "two canonical TREASUREs never share a board");
    }
  }
});

test("a pair under a generation hold is never used for a new board", () => {
  const ps = pairs();
  ps[1].generationHold = { by: "parent", reason: "test" };
  for (let seed = 1; seed <= 10; seed++) {
    const res = assembleBatch({ pairs: ps, words: WORDS, seed, count: 1, maxTarget: 3, batch: "t" });
    assert.equal(res.boards.length, 0, "three usable pairs cannot make a board");
  }
});

test("seeded assembly is reproducible", () => {
  const a = assembleBatch({ pairs: pairs(), words: WORDS, seed: 9, count: 1, maxTarget: 3, batch: "t" });
  const b = assembleBatch({ pairs: pairs(), words: WORDS, seed: 9, count: 1, maxTarget: 3, batch: "t" });
  assert.deepEqual(a.boards, b.boards);
});
