// @vitest-environment node
// The judging and the opening deal, now exported from shared.js so scripts
// (scripts/unlimited) can prove a stored board is winnable with the game's own
// logic. These replay the tutorial-style sample puzzle through them.
import { describe, it, expect } from "vitest";
import { CW_FROM, bestSubmit, biasedShuffle, isClueRotation } from "./shared.js";

const PUZZLE = {
  clues: ["HEAT", "TALL", "BLUE", "WILD"],
  cards: {
    c1: { id: "c1", words: ["BLAZE", "RIVER", "CAVE", "WOLF"] },
    c2: { id: "c2", words: ["EMBER", "PEAK", "STORM", "RIVER"] },
    c3: { id: "c3", words: ["CLIFF", "TOWER", "OCEAN", "BOULDER"] },
    c4: { id: "c4", words: ["THUNDER", "BUSH", "SKY", "STORM"] },
    c5: { id: "c5", words: ["FROST", "PINE", "HAWK", "DUNE"] },
  },
  solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 1, 2, 3], extraCards: ["c5"] },
};
const answerSlots = (s = PUZZLE.solution) => s.slotCards.map((cardId, i) => ({ cardId, orientation: s.orientations[i] }));
// The board turned one quarter clockwise, cards and clues together (what the Rotate button does).
const rotateBoard = (slots, clues) => ({
  slots: CW_FROM.map((i) => ({ cardId: slots[i].cardId, orientation: (slots[i].orientation + 1) % 4 })),
  clues: CW_FROM.map((i) => clues[i]),
});

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

describe("bestSubmit", () => {
  it("accepts the stored answer in the stored orientation", () => {
    const r = bestSubmit(answerSlots(), PUZZLE.solution, new Set(), PUZZLE.clues, PUZZLE.clues);
    expect([...r.correct].sort()).toEqual([0, 1, 2, 3]);
    expect(r.wrong.size).toBe(0);
  });

  it("accepts the answer at every whole-board rotation", () => {
    let { slots, clues } = { slots: answerSlots(), clues: [...PUZZLE.clues] };
    for (let k = 0; k < 4; k++) {
      const r = bestSubmit(slots, PUZZLE.solution, new Set(), clues, PUZZLE.clues);
      expect(r.correct.size).toBe(4);
      ({ slots, clues } = rotateBoard(slots, clues));
    }
  });

  it("marks only the misplaced or turned slots wrong", () => {
    const slots = answerSlots();
    slots[2] = { ...slots[2], orientation: (slots[2].orientation + 1) % 4 }; // right card, wrong turn
    slots[3] = { cardId: "c5", orientation: 0 };                                 // an extra card on the board
    const r = bestSubmit(slots, PUZZLE.solution, new Set(), PUZZLE.clues, PUZZLE.clues);
    expect([...r.correct].sort()).toEqual([0, 1]);
    expect([...r.wrong].sort()).toEqual([2, 3]);
  });

  it("judges the whole guess wrong if a locked slot would come unlocked", () => {
    const slots = answerSlots();
    slots[0] = { cardId: "c5", orientation: 0 };
    const r = bestSubmit(slots, PUZZLE.solution, new Set([0]), PUZZLE.clues, PUZZLE.clues);
    expect(r.correct.size).toBe(0);
    expect(r.wrong.size).toBe(4);
  });

  it("a correct card facing the wrong way is wrong", () => {
    const slots = answerSlots().map((s) => ({ ...s, orientation: (s.orientation + 2) % 4 }));
    const r = bestSubmit(slots, PUZZLE.solution, new Set(), PUZZLE.clues, PUZZLE.clues);
    expect(r.correct.size).toBe(0);
  });
});

describe("isClueRotation", () => {
  it("recognises every rotation of the clues and nothing else", () => {
    let clues = [...PUZZLE.clues];
    for (let k = 0; k < 4; k++) {
      expect(isClueRotation(clues, PUZZLE.clues)).toBe(true);
      clues = CW_FROM.map((i) => clues[i]);
    }
    expect(isClueRotation(["TALL", "HEAT", "BLUE", "WILD"], PUZZLE.clues)).toBe(false);
    expect(isClueRotation(["HEAT", "TALL", "BLUE"], PUZZLE.clues)).toBe(false);
  });
});

describe("biasedShuffle", () => {
  it("deals every card once, with a legal orientation, and never starts nearly solved", () => {
    const ids = ["c1", "c2", "c3", "c4", "c5"];
    const rng = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const slots = biasedShuffle(ids, PUZZLE.solution, rng);
      expect(slots.map((s) => s.cardId).sort()).toEqual([...ids].sort());
      for (const s of slots) expect([0, 1, 2, 3]).toContain(s.orientation);
      const correct = PUZZLE.solution.slotCards.filter((id, si) => slots[si].cardId === id && slots[si].orientation === PUZZLE.solution.orientations[si]).length;
      expect(correct).toBeLessThan(4);
    }
  });

  it("is reproducible from a seed", () => {
    const ids = ["c1", "c2", "c3", "c4", "c5"];
    expect(biasedShuffle(ids, PUZZLE.solution, mulberry32(3))).toEqual(biasedShuffle(ids, PUZZLE.solution, mulberry32(3)));
  });
});
