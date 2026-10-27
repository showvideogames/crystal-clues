// The Random-Pair Pilot Beta builder: finite, no pair reused, every board valid,
// only pilot pairs, reproducible from the recorded seed.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateBoard, hintKey, validateBoard, mulberry32, shuffle } from "../generate.js";
import { buildPilotBoards, pilotLibraryBody } from "./pilot.js";
import RANDOM_LIBRARY from "../random-library.json";
import PILOT_LIBRARY from "./pilot-library.json";
import PILOT_BOARDS from "./pilot-boards.json";

const BANK = RANDOM_LIBRARY.words;

/** n synthetic rows over a limited word pool (so words repeat and some pairs clash). */
function rows(n, poolSize, seed = 7) {
  const rng = mulberry32(seed);
  const pool = shuffle(BANK, rng).slice(0, poolSize);
  const out = []; const seen = new Set();
  while (out.length < n) {
    const a = pool[Math.floor(rng() * pool.length)], b = pool[Math.floor(rng() * pool.length)];
    const k = [a, b].sort().join("|");
    if (a === b || seen.has(k)) continue;
    seen.add(k);
    out.push({ pilot_id: `t${out.length}`, pair_key: k, a, b, hint: `TESTHINT${out.length}`, wordAConnection: "x", wordBConnection: "y",
      alternatives: out.length % 3 ? [] : [{ text: `ALT${out.length}`, wordAConnection: "x", wordBConnection: "y" }], reference: false });
  }
  return out;
}
function library(input, extra = {}) {
  const body = pilotLibraryBody(input, BANK);
  return { _metadata: { contentHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"), ...extra }, ...body };
}

function expectValidPilotRun(lib, out) {
  const pilotIds = new Set(lib.pairs.map((p) => p.id));
  const used = new Set();
  // Finite: at most one board per four pairs, and the count is recorded.
  expect(out.boards.length).toBeGreaterThan(0);
  expect(out.boards.length).toBeLessThanOrEqual(Math.floor(lib.pairs.length / 4));
  expect(out._metadata.boardCount).toBe(out.boards.length);
  out.boards.forEach((b, i) => {
    expect(b.index).toBe(i + 1);
    expect(validateBoard(b, lib)).toEqual([]);
    const ids = b.reveal.map((r) => r.pairId);
    // Only pilot pairs, none used twice across the whole run.
    ids.forEach((id) => { expect(pilotIds.has(id)).toBe(true); expect(used.has(id)).toBe(false); used.add(id); });
    // Four disjoint pairs: eight distinct target words.
    const targets = new Set(b.reveal.flatMap((r) => [r.wordA, r.wordB]));
    expect(targets.size).toBe(8);
    // Four distinct hints.
    expect(new Set(b.clues.map(hintKey)).size).toBe(4);
    // 20 fillers from the full word bank, none of them a target.
    const all = Object.values(b.cards).flatMap((c) => c.words);
    const fillers = all.filter((w) => !targets.has(w));
    expect(all).toHaveLength(28);
    expect(new Set(all).size).toBe(28);
    expect(fillers).toHaveLength(20);
    fillers.forEach((w) => expect(BANK).toContain(w));
    // Each served hint is the pair's one pilot hint (alternatives are never served).
    b.reveal.forEach((r) => expect(lib.pairs.find((p) => p.id === r.pairId).hints.map((h) => h.text)).toEqual([r.clue]));
  });
  expect(out._metadata.usedPairCount).toBe(used.size);
  const leftover = lib.pairs.filter((p) => !used.has(p.id));
  expect(out._metadata.leftoverPairs.map((p) => p.id)).toEqual(leftover.map((p) => p.id));
  // Stopped only because no further board can be made without reusing a pair.
  expect(generateBoard({ ...lib, pairs: leftover }, { seed: 1, createdAt: "2026-10-26T00:00:00.000Z" })).toBeNull();
}

describe("pilot beta builder", () => {
  it("uses every pair at most once and stops when no board is left", () => {
    const lib = library(rows(90, 60));
    expectValidPilotRun(lib, buildPilotBoards(lib, { seed: 99 }));
  });

  it("with all-disjoint pairs, uses all of them (n/4 boards)", () => {
    const words = shuffle(BANK, mulberry32(3)).slice(0, 80);
    const input = Array.from({ length: 40 }, (_, i) => ({ pilot_id: `d${i}`, a: words[2 * i], b: words[2 * i + 1], hint: `TESTHINT${i}`, wordAConnection: "", wordBConnection: "", alternatives: [], reference: false }));
    const lib = library(input);
    const out = buildPilotBoards(lib, { seed: 5 });
    expectValidPilotRun(lib, out);
    expect(out.boards).toHaveLength(10);
    expect(out._metadata.leftoverPairCount).toBe(0);
  });

  it("is reproducible from the recorded seed", () => {
    const lib = library(rows(50, 70));
    expect(JSON.stringify(buildPilotBoards(lib, { seed: 11 }))).toBe(JSON.stringify(buildPilotBoards(lib, { seed: 11 })));
    expect(buildPilotBoards(lib, { seed: 11 })._metadata).toMatchObject({ seed: 11, generatorVersion: 2, pairCount: 50, pilotLibraryContentHash: lib._metadata.contentHash });
  });

  it("puts alternatives in the reveal text only, and rejects bad input", () => {
    const body = pilotLibraryBody([{ pilot_id: "x", a: BANK[0], b: BANK[1], hint: "TESTHINT", alternatives: [{ text: "Other" }], reference: true }], BANK);
    expect(body.pairs[0].hints).toHaveLength(1);
    expect(body.pairs[0].hints[0]).toMatchObject({ text: "TESTHINT", revealExplanation: "Alternative: OTHER", reference: true });
    expect(body.pairs[0].rule).toBe("provisional");
    expect(() => pilotLibraryBody([{ pilot_id: "x", a: "NOTAWORDXYZ", b: BANK[1], hint: "H" }], BANK)).toThrow(/word bank/);
    expect(() => pilotLibraryBody([{ pilot_id: "x", a: BANK[0], b: BANK[1], hint: BANK[0] }], BANK)).toThrow(/equals/);
    expect(() => pilotLibraryBody([{ pilot_id: "x", a: BANK[0], b: BANK[1], hint: "H" }, { pilot_id: "x", a: BANK[2], b: BANK[3], hint: "I" }], BANK)).toThrow(/duplicate/);
    expect(() => pilotLibraryBody([], BANK)).toThrow();
  });

  it("the committed pilot-boards.json is exactly what the committed pilot library and seed give", () => {
    const m = PILOT_BOARDS._metadata;
    expect(m.pilotLibraryContentHash).toBe(PILOT_LIBRARY._metadata.contentHash);
    expect(m.placeholder).toBe(!!PILOT_LIBRARY._metadata.placeholder);
    expect(PILOT_LIBRARY.words).toEqual(BANK);
    const rebuilt = buildPilotBoards(PILOT_LIBRARY, { seed: m.seed });
    expect(rebuilt).toEqual(PILOT_BOARDS);
    expectValidPilotRun(PILOT_LIBRARY, PILOT_BOARDS);
    // None of normal Unlimited's pairs is on a pilot board.
    const normal = new Set(RANDOM_LIBRARY.pairs.map((p) => p.id));
    PILOT_BOARDS.boards.forEach((b) => b.reveal.forEach((r) => expect(normal.has(r.pairId)).toBe(false)));
  });
});
