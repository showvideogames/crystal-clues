import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as dailyResults from "../src/game/dailyResults.js";
import { solutionForClues, bestSubmit, CW_FROM, vw } from "../src/game/shared.js";

const { initialMode, reviewBoard } = dailyResults;
const localBoardJudging = dailyResults.localBoardJudging ?? (() => false);
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const rotateBody = app.split("const handleRotate = useCallback(()=>{")[1].split("},[")[0];
// Card slots are [NW, NE, SE, SW]; each word array is [N, E, S, W].
const visibleWords = {
  a: ["GRAVE", "SALAD", "TUBE", "LADDER"],
  b: ["GATE", "CASE", "BEARD", "CONTRACT"],
  c: ["GENIUS", "LUXURY", "BUFFALO", "MOSQUITO"],
  d: ["TROPHY", "DIET", "RECORD", "BOSS"],
};
const turns = [0, 1, 2, 3];
const puzzle = {
  clues: ["CEMETERY", "CHANEL", "SPRINGSTEEN", "CORPORATE"],
  solution: { slotCards: ["a", "b", "c", "d"], orientations: turns, extraCards: ["e", "f", "g"] },
  cards: Object.fromEntries(Array.from("abcdefg", (id, i) => [id, { id, words: visibleWords[id] &&
    [0, 1, 2, 3].map((edge) => visibleWords[id][(edge + turns[i]) % 4]) }])),
};
const slotsFor = (answer) => answer.slotCards.map((cardId, i) => ({ cardId, orientation: answer.orientations[i] }));
const rotate = (clues) => CW_FROM.map((i) => clues[i]);
const doubled = rotate(rotate(puzzle.clues));
const edgePairs = (slots) => [[0, 1], [1, 2], [2, 3], [3, 0]].map((indices, edge) =>
  indices.map((i) => vw(puzzle.cards[slots[i].cardId], slots[i].orientation)[edge]));
const loss = { solved: false, difficulty: "hardcore", livesUsed: 3 };

for (const [mode, daily] of [["Daily", true], ["Archive", false]]) {
  test(`${mode}: rotate is blocked from submit through the last answer flip`, () => {
    for (const [phase, lives, lost, canRotate] of [
      ["grey", 1, false, false], ["revealing", 1, false, false],
      ["done", 0, false, false], [null, 0, false, false],
      ["done", 1, false, true], [null, 0, true, true],
    ]) {
      let turns = 0;
      new Function("tutorialActive", "rotateAnimating", "localJudging", "friendJudging",
        "friendPuzzle", "solved", "lost", "setRotateAnimating", "setClueRotatePhase",
        "rotateTimer", "clueRotateTimer", "setTimeout", "applyRotate", "record", rotateBody)(
        false, false, localBoardJudging(phase, lives, lost), false, null, false, lost,
        () => {}, () => {}, {}, {}, (f) => f(), () => turns++, () => {},
      );
      assert.equal(turns, Number(canRotate), `phase=${phase}, lives=${lives}, lost=${lost}`);
    }
    assert.equal(initialMode({ daily, record: loss }).mode, "review");
  });

  test(`${mode}: twice-rotated answer stays aligned and stale saved loss is repaired only in display`, () => {
    const expected = solutionForClues(puzzle.solution, doubled, puzzle.clues);
    const extras = ["g", "e", "f"].map((cardId) => ({ cardId, orientation: 3 }));
    const original = [...slotsFor(puzzle.solution), ...extras];
    assert.deepEqual(doubled, ["SPRINGSTEEN", "CORPORATE", "CEMETERY", "CHANEL"]);
    assert.deepEqual(edgePairs(original), [
      ["GRAVE", "GATE"], ["CASE", "LUXURY"], ["BUFFALO", "RECORD"], ["BOSS", "LADDER"],
    ]);
    const final = { slots: original, clues: doubled, guessHistory: [["old"]] };
    const savedBytes = JSON.stringify(final);
    const reviewed = reviewBoard(puzzle, loss, final);
    assert.deepEqual(reviewed.clues, doubled);
    assert.deepEqual(reviewed.slots, [...slotsFor(expected), ...extras]);
    assert.deepEqual(edgePairs(reviewed.slots), [
      ["BUFFALO", "RECORD"], ["BOSS", "LADDER"], ["GRAVE", "GATE"], ["CASE", "LUXURY"],
    ]);
    assert.equal(bestSubmit(reviewed.slots, puzzle.solution, new Set(), doubled, puzzle.clues).correct.size, 4);
    assert.deepEqual(reviewed.guessHistory, final.guessHistory);
    assert.equal(JSON.stringify(final), savedBytes);

    const legitimate = { ...final, slots: [...slotsFor(expected), ...extras] };
    assert.deepEqual(reviewBoard(puzzle, loss, legitimate).slots, legitimate.slots);
    const unfamiliar = { ...final, slots: original.map((s, i) => i === 0 ? { ...s, orientation: 3 } : s) };
    assert.deepEqual(reviewBoard(puzzle, loss, unfamiliar).slots, unfamiliar.slots);
    assert.deepEqual(reviewBoard(puzzle, { ...loss, solved: true }, final).slots, final.slots);
    assert.deepEqual(reviewBoard(puzzle, loss, null).clues, puzzle.clues);
  });
}
