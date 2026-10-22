import { describe, it, expect } from "vitest";
import LIBRARY from "./random-library.json";
import { generateBoard, validateBoard, choosePairs, mulberry32, shuffle, norm, hintKey } from "./generate.js";
import { DIFFICULTY_EXTRA } from "../game/shared";
import BANK from "../../data/unlimited/wordbank/wordbank.json";
import V1 from "./fixtures/generator-v1-board.json";

const AT = "2026-10-18T18:00:00.000Z";
const gen = (seed, opts = {}) => generateBoard(LIBRARY, { seed, createdAt: AT, ...opts });

describe("random-library.json (served choices only)", () => {
  it("holds the complete word bank and only eligible pairs with their served hints", () => {
    expect(LIBRARY.words).toEqual(BANK.words);                       // the paged, count-verified snapshot
    expect(LIBRARY.words.length).toBe(BANK._metadata.databaseCount); // no duplicates were dropped
    expect(new Set(LIBRARY.words).size).toBe(LIBRARY.words.length);
    expect(LIBRARY._metadata.wordBank.contentHash).toBe(BANK._metadata.contentHash);
    expect(LIBRARY.pairs.length).toBe(LIBRARY._metadata.tally.eligible);
    const W = new Set(LIBRARY.words);
    for (const p of LIBRARY.pairs) {
      expect(W.has(p.a) && W.has(p.b) && p.a !== p.b).toBe(true);
      expect(p.hints.length).toBeGreaterThan(0);
      if (p.rule !== "equal-tier") expect(p.hints).toHaveLength(1); // canonical / provisional: one choice
      for (const h of p.hints) {
        expect(["ai_reviewed", "human_approved"]).toContain(h.status); // never held or rejected
        expect(norm(h.text)).not.toBe(p.a); expect(norm(h.text)).not.toBe(p.b);
        expect(h.wordAConnection && h.wordBConnection && h.revealExplanation).toBeTruthy();
      }
    }
    expect(LIBRARY.pairs.some((p) => p.id === "p_diamond__snake")).toBe(false); // generation hold
  });
});

describe("generateBoard", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(JSON.stringify(gen(42))).toBe(JSON.stringify(gen(42)));
    const ids = new Set(), clueSets = new Set();
    for (let s = 1; s <= 200; s++) { const b = gen(s); ids.add(b.id); clueSets.add(b.clues.join("|")); }
    expect(ids.size).toBe(200);
    expect(clueSets.size).toBeGreaterThan(195);
  });

  it("builds structurally valid boards for thousands of seeds", () => {
    const filler = new Map();
    for (let s = 1; s <= 3000; s++) {
      const b = gen(s * 7919);
      expect(validateBoard(b, LIBRARY)).toEqual([]);
      // 4 disjoint pairs → 8 targets; the other 20 words are fillers from the list
      const targets = new Set(b.reveal.flatMap((r) => [r.wordA, r.wordB]));
      const words = Object.values(b.cards).flatMap((c) => c.words);
      const fillers = words.filter((w) => !targets.has(w));
      expect(targets.size).toBe(8);
      expect(fillers).toHaveLength(20);
      for (const w of fillers) filler.set(w, (filler.get(w) || 0) + 1);
      // every difficulty deals 0..3 of the three extra cards
      for (const n of Object.values(DIFFICULTY_EXTRA)) expect(b.solution.extraCards.slice(0, n)).toHaveLength(n);
      expect(b.kind).toBe("random");
      expect(b.reveal.every((r) => r.wordAConnection && r.wordBConnection)).toBe(true);
    }
    expect(filler.size).toBe(LIBRARY.words.length); // every bank word turns up as an extra somewhere
  }, 20_000); // fixed 3,000-seed CPU loop: ~2.3 s in plain node at any library size, 4.3-5.1 s under
  // vitest with the full suite running in parallel, so the 5 s default timed out on a loaded machine.

  it("draws the 20 extras uniformly from the whole bank, multiword entries intact", () => {
    const count = new Map(LIBRARY.words.map((w) => [w, 0]));
    const N = 4000;
    for (let s = 1; s <= N; s++) {
      const b = gen(s * 104729 + 17);
      const targets = new Set(b.reveal.flatMap((r) => [r.wordA, r.wordB]));
      for (const w of Object.values(b.cards).flatMap((c) => c.words)) if (!targets.has(w)) count.set(w, count.get(w) + 1);
    }
    const nonTargets = [...count].filter(([w]) => !LIBRARY.pairs.some((p) => p.a === w || p.b === w)).map(([, n]) => n);
    const mean = nonTargets.reduce((a, n) => a + n, 0) / nonTargets.length;
    expect(mean).toBeGreaterThan(60); expect(mean).toBeLessThan(75);       // 20 of ~1,188 per board
    expect(Math.min(...nonTargets)).toBeGreaterThan(mean * 0.5);
    expect(Math.max(...nonTargets)).toBeLessThan(mean * 1.6);
    for (const w of LIBRARY.words.filter((x) => x.includes(" "))) expect(count.get(w)).toBeGreaterThan(0);
  });

  it("never changes a board saved by the released generator 1", () => {
    const b = V1.board;
    expect(b.generator).toBe(1);
    expect(Object.values(b.cards).flatMap((c) => c.words)).toHaveLength(28);
    // Its words came from the original 50; they are all still in the bank, but the
    // snapshot is the record: nothing re-derives it from today's library.
    for (const w of Object.values(b.cards).flatMap((c) => c.words)) expect(LIBRARY.words).toContain(w);
    const again = JSON.parse(JSON.stringify(b));
    expect(again).toEqual(b);
  });

  it("serves exactly the library choice for each pair (no weaker fallback)", () => {
    const byId = new Map(LIBRARY.pairs.map((p) => [p.id, p]));
    for (let s = 1; s <= 500; s++) for (const r of gen(s).reveal) {
      const p = byId.get(r.pairId);
      expect(p.hints.map((h) => norm(h.text))).toContain(r.clue);
      expect(r.hintChoice.rule).toBe(p.rule);
    }
  });

  it("avoids the pairs of recent boards when it can", () => {
    const first = gen(5);
    const avoid = new Set(first.reveal.map((r) => r.pairId));
    for (let s = 6; s < 60; s++) {
      const b = gen(s, { avoid });
      expect(b.reveal.some((r) => avoid.has(r.pairId))).toBe(false);
    }
  });

  it("has no ordering bias: pairs early and late in the library are chosen about equally", () => {
    const count = new Map(LIBRARY.pairs.map((p) => [p.id, 0]));
    // 4 pairs per board: keep about 5.2 draws per pair (6,000 boards at 4,638 pairs) so a uniform generator
    // leaves well under 1% of pairs unseen (Poisson e^-5.2 = 0.55%) at any library size.
    const N = Math.max(6000, Math.ceil((LIBRARY.pairs.length * 5.2) / 4));
    for (let s = 1; s <= N; s++) for (const r of gen(s * 104729 + 1).reveal) count.set(r.pairId, count.get(r.pairId) + 1);
    const ids = LIBRARY.pairs.map((p) => p.id);
    const avg = (xs) => xs.reduce((a, id) => a + count.get(id), 0) / xs.length;
    const early = avg(ids.slice(0, 200)), late = avg(ids.slice(-200)), all = avg(ids);
    expect(Math.abs(early - late) / all).toBeLessThan(0.12);
    expect([...count.values()].filter((v) => v === 0).length).toBeLessThan(ids.length * 0.01);
  }, 60_000); // N grows with the library (about 2.3x the 6,000-board loop at 10,725 pairs)
});

// Synthetic libraries for the rules the real library does not exercise yet.
const words50 = Array.from({ length: 50 }, (_, i) => `W${String(i).padStart(2, "0")}`);
const pair = (a, b, rule, ...texts) => ({ id: `p_${a}__${b}`.toLowerCase(), a, b, rule, hints: texts.map((t) => ({ text: t, status: "ai_reviewed", wordAConnection: "a", wordBConnection: "b", revealExplanation: "r", reference: null })) });

describe("hint choice rules", () => {
  it("varies only among an approved equal-tier set", () => {
    const lib = { words: words50, pairs: [
      pair("W00", "W01", "equal-tier", "ALPHA", "BETA"),
      pair("W02", "W03", "provisional", "GAMMA"), pair("W04", "W05", "canonical", "DELTA"), pair("W06", "W07", "provisional", "EPSILON") ] };
    const seen = new Set();
    for (let s = 1; s <= 100; s++) { const b = generateBoard(lib, { seed: s, createdAt: AT }); seen.add(b.reveal.find((r) => r.pairId === "p_w00__w01").clue); }
    expect([...seen].sort()).toEqual(["ALPHA", "BETA"]);
  });

  it("never puts two equal hint texts on a board; a single-choice collision drops the combination, not the rule", () => {
    const lib = { words: words50, pairs: [
      pair("W00", "W01", "canonical", "SAME"), pair("W02", "W03", "canonical", "SAME"),
      pair("W04", "W05", "provisional", "X1"), pair("W06", "W07", "provisional", "X2"), pair("W08", "W09", "provisional", "X3") ] };
    for (let s = 1; s <= 200; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      expect(new Set(b.clues).size).toBe(4);
      expect(b.clues.filter((c) => c === "SAME").length).toBeLessThanOrEqual(1);
    }
  });

  it("conventional spellings (K9, AC/DC, CAP'N) are kept exactly; two spellings of one hint never share a board", () => {
    expect(hintKey("AC/DC")).toBe("ACDC"); expect(hintKey("cap’n")).toBe("CAPN"); expect(norm("ac/dc")).toBe("AC/DC");
    const lib = { words: words50, pairs: [
      pair("W00", "W01", "canonical", "AC/DC"), pair("W02", "W03", "canonical", "ACDC"),
      pair("W04", "W05", "provisional", "K9"), pair("W06", "W07", "provisional", "CAP'N"), pair("W08", "W09", "provisional", "Z3") ] };
    for (let s = 1; s <= 200; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      expect(new Set(b.clues.map(hintKey)).size).toBe(4);
      expect(b.clues.includes("AC/DC") && b.clues.includes("ACDC")).toBe(false);
      for (const c of b.clues) expect(["AC/DC", "ACDC", "K9", "CAP'N", "Z3"]).toContain(c); // stored spelling, nothing stripped
      expect(validateBoard(b, lib)).toEqual([]);
    }
    const forged = generateBoard(lib, { seed: 3, createdAt: AT });
    const twin = { ...forged, clues: ["AC/DC", "ACDC", ...forged.clues.slice(2)] };
    expect(validateBoard(twin, lib)).toContain("four distinct hint texts");
  });

  it("an equal set whose members all collide yields no choice for that pair (never a fallback)", () => {
    const lib = { words: words50, pairs: [
      pair("W00", "W01", "equal-tier", "TAKEN"), pair("W02", "W03", "canonical", "TAKEN"),
      pair("W04", "W05", "provisional", "Y1"), pair("W06", "W07", "provisional", "Y2"), pair("W08", "W09", "provisional", "Y3") ] };
    for (let s = 1; s <= 100; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      const ids = b.reveal.map((r) => r.pairId);
      expect(ids.includes("p_w00__w01") && ids.includes("p_w02__w03")).toBe(false);
    }
  });

  it("falls back to an exhaustive search when random draws are exhausted, and only fails when no valid set exists", () => {
    // Hub pairs all share W00, so at most one of them fits a board; the rest must come from four disjoint pairs.
    const hub = Array.from({ length: 30 }, (_, i) => pair("W00", `W${String(i + 10).padStart(2, "0")}`, "provisional", `H${i}`));
    const only = [pair("W01", "W02", "provisional", "K1"), pair("W03", "W04", "provisional", "K2"), pair("W05", "W06", "provisional", "K3"), pair("W07", "W08", "provisional", "K4")];
    const lib = { words: words50, pairs: [...hub, ...only] };
    for (let s = 1; s <= 50; s++) {
      const pick = choosePairs(lib.pairs, mulberry32(s), { tries: 0 }); // no random draws: straight to the exhaustive search
      expect(pick.method).toBe("exhaustive");
      const words = pick.chosen.flatMap((p) => [p.a, p.b]);
      expect(new Set(words).size).toBe(8);
      expect(new Set(pick.hints.map((h) => h.text)).size).toBe(4);
    }
    expect(validateBoard(generateBoard(lib, { seed: 9, createdAt: AT }), lib)).toEqual([]);
    expect(generateBoard({ words: words50, pairs: hub }, { seed: 1, createdAt: AT })).toBeNull(); // every pair shares W00: impossible
  });

  it("shuffle is a uniform permutation (no position bias)", () => {
    const rng = mulberry32(3); const pos = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) pos[shuffle([0, 1, 2, 3], rng).indexOf(0)]++;
    for (const n of pos) expect(Math.abs(n - 10000)).toBeLessThan(500);
  });
});
