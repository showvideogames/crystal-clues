// @vitest-environment node
import { describe, it, expect } from "vitest";
import { dealCardsFromBank } from "./shared.js";
import { shuffleArr } from "../utils/random.js";

// A small seeded generator, so these runs are repeatable. The real game uses
// Math.random; the same code runs either way (the generator is a parameter).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chi-square statistic for "every cell has the same expected count".
const chiSquare = (observed, expected) => observed.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
// A fair draw has statistic ≈ df with sd √(2·df). Five sd is a one-in-millions
// miss for a fair generator, and a real bias of a few percent is far beyond it.
const within5sd = (stat, df) => Math.abs(stat - df) < 5 * Math.sqrt(2 * df);

const BANK_SIZE = 1200;                                   // more than the live 1081, more than one page
const bank = Array.from({ length: BANK_SIZE }, (_, i) => `W${String(i).padStart(4, "0")}`);
const idFor = () => { let n = 0; return () => `c${n++}`; };
const wordsOf = (deal) => Object.values(deal.cards).flatMap((c) => c.words);

describe("Deal Random Cards", () => {
  it("deals 7 cards of 4 distinct bank words each, upright or turned", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const deal = dealCardsFromBank(bank, idFor(), rng);
      const words = wordsOf(deal);
      expect(Object.keys(deal.cards)).toHaveLength(7);
      expect(deal.slots).toHaveLength(7);
      expect(words).toHaveLength(28);
      expect(new Set(words).size).toBe(28);              // no word twice in one deal
      for (const w of words) expect(bank).toContain(w);
      for (const s of deal.slots) expect([0, 1, 2, 3]).toContain(s.orientation);
    }
  });

  it("gives every word the same chance, including the ones past the first 1000", () => {
    const rng = mulberry32(20261013);
    const DEALS = 10000;
    const count = new Map(bank.map((w) => [w, 0]));
    for (let i = 0; i < DEALS; i++) for (const w of wordsOf(dealCardsFromBank(bank, idFor(), rng))) count.set(w, count.get(w) + 1);

    const counts = [...count.values()];
    expect(Math.min(...counts)).toBeGreaterThan(0);       // every word can be drawn
    const expected = (DEALS * 28) / BANK_SIZE;            // 233 each
    expect(within5sd(chiSquare(counts, expected), BANK_SIZE - 1)).toBe(true);

    // The last 200 words (past an alphabetical cut-off at 1000) get their fair share.
    const tail = bank.slice(1000).reduce((s, w) => s + count.get(w), 0);
    const tailExpected = (DEALS * 28 * 200) / BANK_SIZE;
    expect(Math.abs(tail - tailExpected) / tailExpected).toBeLessThan(0.03);
  }, 30000);

  it("is fair in every position, not only overall", () => {
    const rng = mulberry32(7);
    const DEALS = 12000;
    const first = new Map(bank.map((w) => [w, 0]));
    const last = new Map(bank.map((w) => [w, 0]));
    for (let i = 0; i < DEALS; i++) {
      const w = wordsOf(dealCardsFromBank(bank, idFor(), rng));
      first.set(w[0], first.get(w[0]) + 1);
      last.set(w[27], last.get(w[27]) + 1);
    }
    for (const m of [first, last]) {
      expect(within5sd(chiSquare([...m.values()], DEALS / BANK_SIZE), BANK_SIZE - 1)).toBe(true);
    }
  }, 30000);

  it("turns each card to one of four orientations evenly", () => {
    const rng = mulberry32(99);
    const seen = [0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) for (const s of dealCardsFromBank(bank, idFor(), rng).slots) seen[s.orientation]++;
    expect(within5sd(chiSquare(seen, 35000 / 4), 3)).toBe(true);
  });

  it("is not seeded: two deals made one after the other differ", () => {
    const a = wordsOf(dealCardsFromBank(bank, idFor())).join();
    const b = wordsOf(dealCardsFromBank(bank, idFor())).join();
    expect(a).not.toBe(b);
  });

  it("never deals the same word twice because the bank holds it in two spellings", () => {
    const rng = mulberry32(3);
    const dirty = [...bank.slice(0, 30), "w0000", " W0001 ", "", "   "];
    for (let i = 0; i < 300; i++) {
      const words = wordsOf(dealCardsFromBank(dirty, idFor(), rng));
      expect(new Set(words).size).toBe(28);
      expect(words).not.toContain("");
    }
  });

  it("repeats words only when the bank is too small to fill 28 (the existing fallback)", () => {
    const small = bank.slice(0, 10);
    const words = wordsOf(dealCardsFromBank(small, idFor(), mulberry32(5)));
    expect(words).toHaveLength(28);
    expect(new Set(words).size).toBe(10);
    expect(dealCardsFromBank(bank.slice(0, 3), idFor())).toBeNull();
    expect(dealCardsFromBank([], idFor())).toBeNull();
  });
});

describe("the shuffle", () => {
  // Counts how often each element lands in each position over many shuffles.
  const positionStat = (shuffle, n, trials, rng) => {
    const cells = new Array(n * n).fill(0);
    for (let t = 0; t < trials; t++) shuffle(Array.from({ length: n }, (_, i) => i), rng).forEach((v, pos) => cells[v * n + pos]++);
    return chiSquare(cells, trials / n);
  };

  it("puts every element in every position equally often", () => {
    const stat = positionStat(shuffleArr, 10, 60000, mulberry32(11));
    expect(within5sd(stat, 90)).toBe(true);               // df = (n-1)^2
  });

  it("would catch a biased shuffle (a random-comparator sort fails the same check)", () => {
    const biased = (arr, rng) => [...arr].sort(() => rng() - 0.5);
    expect(within5sd(positionStat(biased, 10, 60000, mulberry32(11)), 90)).toBe(false);
  });

  it("does not change the array it is given", () => {
    const a = [1, 2, 3, 4, 5];
    shuffleArr(a, mulberry32(1));
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });
});
