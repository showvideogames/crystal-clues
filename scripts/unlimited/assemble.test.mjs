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
  assert.equal(ch.rule, "provisional");
  assert.equal(ch.provisional, true);
  assert.equal(ch.hints.length, 1, "exactly one provisional candidate, never a set to vary among");
});

test("without a preference: ONE stable provisional candidate; a score tie is broken by library order, never at random", () => {
  const p = pairs()[2];                                   // ROLL and EASTER tie at the best score
  const ch = hintChoices(p, p.clues, {});
  assert.equal(ch.rule, "provisional");
  assert.deepEqual(ch.hints.map((h) => h.text), ["ROLL"], "the first in library order among the tie");
  for (let i = 0; i < 20; i++) assert.deepEqual(hintChoices(p, p.clues, {}).hints.map((h) => h.text), ["ROLL"]);
  // The same tie in the other library order picks the other hint: the order is the tie-break, not chance.
  const q = pair("EGG", "SPRING", [hint("EASTER"), hint("ROLL"), hint("CHICK", 2, 1)]);
  assert.deepEqual(hintChoices(q, q.clues, {}).hints.map((h) => h.text), ["EASTER"]);
  // Every assembled board records the choice as provisional.
  for (let seed = 1; seed <= 10; seed++) {
    const res = assembleBatch({ pairs: pairs(), words: WORDS, seed, count: 1, maxTarget: 3, batch: "t" });
    const r = res.boards[0].reveal.find((x) => x.pairId === "p_egg__spring");
    assert.equal(r.clue, "ROLL"); assert.equal(r.hintChoice.rule, "provisional"); assert.equal(r.hintChoice.provisional, true);
  }
});

test("an approved equal set restricts variation to that set", () => {
  const p = pairs()[2];
  const prefs = { [p.pair_id]: { status: "approved", equal: ["ROLL"] } };
  const ch = hintChoices(p, p.clues, prefs);
  assert.equal(ch.rule, "equal-tier");
  assert.deepEqual(ch.hints.map((h) => h.text), ["ROLL"]);
});

test("an approved equal set with no playable member gives NO choice, never an unapproved fallback", () => {
  const p = pair("EGG", "SPRING", [hint("ROLL", 2, 2, 2, "held"), hint("EASTER"), hint("CHICK", 2, 1)]);
  const playable = p.clues.filter((c) => c.status === "ai_reviewed");          // only EASTER and CHICK
  const prefs = { [p.pair_id]: { status: "approved", equal: ["ROLL"] } };
  const ch = hintChoices(p, playable, prefs);
  assert.equal(ch.rule, "equal-tier");
  assert.deepEqual(ch.hints, []);
  assert.match(ch.note, /no approved equal hint/);
  // And the assembler then leaves the pair out of the board rather than serving EASTER.
  const ps = [p, ...pairs().filter((x) => x.pair_id !== p.pair_id), pair("W0", "W1", [hint("X")]), pair("W2", "W3", [hint("Y")])];
  for (let seed = 1; seed <= 10; seed++) {
    const res = assembleBatch({ pairs: ps, words: [...WORDS, "W1", "W3"], seed, count: 2, maxTarget: 3, batch: "t", preferences: prefs });
    for (const b of res.boards) assert.ok(!b.reveal.some((r) => r.pairId === "p_egg__spring"), "EGG+SPRING is never served from an unapproved fallback");
  }
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
