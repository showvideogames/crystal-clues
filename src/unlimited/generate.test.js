import { describe, it, expect } from "vitest";
import LIBRARY from "./random-library.json";
import { generateBoard, validateBoard, choosePairs, mulberry32, shuffle, norm, hintKey, hintWordClashes, GENERATOR_VERSION } from "./generate.js";
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
        expect(h.wordAConnection && h.wordBConnection).toBeTruthy(); // the explanation sentence is optional (shown only when present)
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
      expect(hintWordClashes(b.clues, words)).toEqual([]); // no hint equals a target or a decoy (generator 3)
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
    const free = new Map(LIBRARY.words.map((w) => [w, 0]));   // boards on which the word was not a target
    const N = 4000;
    for (let s = 1; s <= N; s++) {
      const b = gen(s * 104729 + 17);
      const targets = new Set(b.reveal.flatMap((r) => [r.wordA, r.wordB]));
      for (const w of LIBRARY.words) if (!targets.has(w)) free.set(w, free.get(w) + 1);
      for (const w of Object.values(b.cards).flatMap((c) => c.words)) if (!targets.has(w)) count.set(w, count.get(w) + 1);
    }
    // Every bank word, scaled to N boards on which it was free to be an extra: almost every word is now some
    // pair's target (5 never are after the consolidated import), so a never-target subset would be too small.
    const nonTargets = LIBRARY.words.map((w) => (count.get(w) * N) / free.get(w));
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

// Owner rule (2026-10-22), generator 3: in Unlimited no displayed hint may exactly equal ANY of the 28
// board words (the 8 targets and the 20 decoys), with case and whitespace folded (norm), nothing broader.
describe("board-word rule: no hint equals a target or a decoy (generator 3)", () => {
  const boardWords = (b) => Object.values(b.cards).flatMap((c) => c.words);
  const pairIds = (b) => b.reveal.map((r) => r.pairId);
  const words29 = words50.slice(0, 29); // 8 targets + 21 others: a board uses 20 of the 21

  it("compares exactly, folding only case and whitespace (no stems, substrings, containment or punctuation)", () => {
    expect(hintWordClashes(["MOON"], ["HONEY", "MOON"])).toEqual([{ clue: "MOON", word: "MOON" }]);
    expect(hintWordClashes([" moon "], ["MOON"])).toHaveLength(1);
    expect(hintWordClashes(["ice  age"], ["ICE AGE"])).toHaveLength(1);
    expect(hintWordClashes(["Ice\tAge"], ["ice age"])).toHaveLength(1);
    expect(hintWordClashes(["FIRE"], ["FIRES", "FIREMAN", "CAMPFIRE", "FIR"])).toEqual([]);
    expect(hintWordClashes(["AC/DC", "ICEAGE"], ["ACDC", "ICE AGE"])).toEqual([]); // punctuation and spaces inside are not folded
    expect(GENERATOR_VERSION).toBe(3);
  });

  it("a hint equal to a decoy: the decoy is redrawn, the hint and all four pairs stay", () => {
    // W28 is the only hint of W00+W01 (written in lower case with spaces) and one of the 21 non-targets,
    // so without the rule it would be one of the 20 decoys on 20 boards in 21.
    const lib = { words: words29, pairs: [pair("W00", "W01", "canonical", " w28 "), pair("W02", "W03", "provisional", "G1"), pair("W04", "W05", "provisional", "G2"), pair("W06", "W07", "provisional", "G3")] };
    for (let s = 1; s <= 200; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      expect(b.clues).toContain("W28");
      expect(new Set(boardWords(b))).toEqual(new Set(words29.filter((w) => w !== "W28"))); // 28 tiles, the hint word is not one
      expect(new Set(pairIds(b)).size).toBe(4);
      expect(validateBoard(b, lib)).toEqual([]);
    }
    // With no spare word left the generator makes no board rather than drop a tile or keep the clash.
    expect(generateBoard({ ...lib, words: words29.filter((w) => w !== "W27") }, { seed: 1, createdAt: AT })).toBeNull();
  });

  it("a substring or stem of a hint is not a clash: such decoys are drawn as before", () => {
    const words = [...words50.slice(0, 8), "FIRES", "FIREMAN", "CAMPFIRE", ...words50.slice(8, 26)];
    const lib = { words, pairs: [pair("W00", "W01", "canonical", "FIRE"), pair("W02", "W03", "provisional", "G1"), pair("W04", "W05", "provisional", "G2"), pair("W06", "W07", "provisional", "G3")] };
    const seen = new Set();
    for (let s = 1; s <= 100; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      for (const w of boardWords(b)) if (w.includes("FIRE")) seen.add(w);
      expect(validateBoard(b, lib)).toEqual([]);
    }
    expect([...seen].sort()).toEqual(["CAMPFIRE", "FIREMAN", "FIRES"]);
  });

  it("a hint equal to another pair's target: an equal-tier set serves its other playable member", () => {
    // Only four pairs, so every board holds all of them and W02 is always a target.
    const lib = { words: words50, pairs: [pair("W00", "W01", "equal-tier", "w02", "ALT"), pair("W02", "W03", "canonical", "K1"), pair("W04", "W05", "provisional", "K2"), pair("W06", "W07", "provisional", "K3")] };
    for (let s = 1; s <= 100; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      expect(b.reveal.find((r) => r.pairId === "p_w00__w01").clue).toBe("ALT");
      expect(validateBoard(b, lib)).toEqual([]);
    }
  });

  it("a single-choice hint equal to another pair's target: that combination is not used; pairs are never dropped or weakened", () => {
    const lib = { words: words50, pairs: [pair("W00", "W01", "canonical", "W02"), pair("W02", "W03", "provisional", "K1"),
      pair("W04", "W05", "provisional", "K2"), pair("W06", "W07", "provisional", "K3"), pair("W08", "W09", "provisional", "K4")] };
    const used = new Set();
    for (let s = 1; s <= 200; s++) {
      const b = generateBoard(lib, { seed: s, createdAt: AT });
      const ids = pairIds(b);
      expect(ids.includes("p_w00__w01") && ids.includes("p_w02__w03")).toBe(false);
      expect(new Set(ids).size).toBe(4);
      expect(hintWordClashes(b.clues, boardWords(b))).toEqual([]);
      expect(validateBoard(b, lib)).toEqual([]);
      ids.forEach((id) => used.add(id));
    }
    expect(used.has("p_w00__w01") && used.has("p_w02__w03")).toBe(true); // each still plays, just not together
    // The exhaustive fallback applies the same rule, and only fails when no clash-free set exists.
    const four = { words: words50, pairs: lib.pairs.slice(0, 4) };
    expect(choosePairs(four.pairs, mulberry32(1), { tries: 0 })).toBeNull();
    expect(generateBoard(four, { seed: 1, createdAt: AT })).toBeNull();
    expect(choosePairs(lib.pairs, mulberry32(1), { tries: 0 }).method).toBe("exhaustive");
  });

  it("validateBoard reports a hint equal to any board word, and still reports a hint equal to its own target", () => {
    const lib = { words: words50, pairs: [pair("W00", "W01", "canonical", "Q1"), pair("W02", "W03", "provisional", "Q2"), pair("W04", "W05", "provisional", "Q3"), pair("W06", "W07", "provisional", "Q4")] };
    const b = generateBoard(lib, { seed: 7, createdAt: AT });
    expect(validateBoard(b, lib)).toEqual([]);
    const extra = b.cards[b.solution.extraCards[0]].words[0];
    const decoyClash = JSON.parse(JSON.stringify(b));
    decoyClash.clues[0] = decoyClash.reveal[0].clue = extra;
    expect(validateBoard(decoyClash, lib)).toContain(`clue ${extra} equals board word ${extra}`);
    const own = JSON.parse(JSON.stringify(b));
    own.clues[1] = own.reveal[1].clue = own.reveal[1].wordA;
    expect(validateBoard(own, lib)).toContain("clue 1 differs from its words");
  });

  it("is deterministic per seed, including boards that needed a redraw", () => {
    const lib = { words: words29, pairs: [pair("W00", "W01", "equal-tier", "W28", "W02", "ALT"), pair("W02", "W03", "canonical", "K1"), pair("W04", "W05", "provisional", "K2"), pair("W06", "W07", "provisional", "K3")] };
    for (let s = 1; s <= 50; s++) expect(JSON.stringify(generateBoard(lib, { seed: s, createdAt: AT }))).toBe(JSON.stringify(generateBoard(lib, { seed: s, createdAt: AT })));
    for (let s = 1; s <= 50; s++) expect(JSON.stringify(gen(s * 31337))).toBe(JSON.stringify(gen(s * 31337)));
  });

  it("leaves the Daily game alone: no Daily or Friends module imports the Unlimited generator", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const files = ["App.jsx", ...["game", "friends", "home", "utils"].flatMap((d) => fs.readdirSync(path.join(src, d)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${d}/${f}`))];
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(`${f}: ${/unlimited\/generate/.test(fs.readFileSync(path.join(src, f), "utf8"))}`).toBe(`${f}: false`);
  });
});

describe("exhaustive fallback", () => {
  it("never returns a set without hints, even when the seeded equal-tier pick dead-ends ({X,Y},{Y,Z},{X,Z})", () => {
    const lib = { words: words50, pairs: [pair("W00", "W01", "equal-tier", "X", "Y"), pair("W02", "W03", "equal-tier", "Y", "Z"),
      pair("W04", "W05", "equal-tier", "X", "Z"), pair("W06", "W07", "canonical", "K")] };
    let found = 0; // the greedy feasibility check can still miss this set for some orders (null, as before); a found set must carry its hints
    for (let s = 1; s <= 1000; s++) {
      const pick = choosePairs(lib.pairs, mulberry32(s), { tries: 0 }); // straight to the exhaustive search
      if (!pick) continue;
      found++;
      expect(pick.method).toBe("exhaustive");
      expect(pick.hints).toHaveLength(4);
      expect(new Set(pick.hints.map((h) => hintKey(h.text))).size).toBe(4);
      expect(JSON.stringify(choosePairs(lib.pairs, mulberry32(s), { tries: 0 }))).toBe(JSON.stringify(pick)); // deterministic
    }
    expect(found).toBeGreaterThan(100);
    for (let s = 1; s <= 200; s++) expect(validateBoard(generateBoard(lib, { seed: s, createdAt: AT }), lib)).toEqual([]);
  });
});
