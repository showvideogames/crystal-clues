import { beforeEach, describe, expect, it } from "vitest";
import {
  initialMode, livesRows, progressDifficulty, progressLivesUsed, readFinal, readProgress,
  finalMatches, resultRowKey, resultWords, reviewBoard, shareText, writeFinal,
} from "./dailyResults.js";
import { dailyCopy, friendsCopy } from "../home/copy.js";

const PUZZLE = {
  id: 42, date: "2026-10-13", title: "Elements", clues: ["HEAT", "TALL", "BLUE", "WILD"],
  cards: Object.fromEntries(["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((id) => [id, { id, words: ["A", "B", "C", "D"] }])),
  solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 1, 2, 3], extraCards: ["c5", "c6", "c7"] },
};

beforeEach(() => localStorage.clear());

describe("which screen a puzzle opens on", () => {
  it("finished → review at the difficulty it was played at", () => {
    expect(initialMode({ record: { solved: true, difficulty: "expert" }, progress: null, daily: true, preference: "easy" }))
      .toEqual({ mode: "review", difficulty: "expert" });
    expect(initialMode({ record: { solved: false }, progress: null, daily: true, preference: "easy" }).difficulty).toBe("standard");
  });
  it("a game in progress resumes at its own difficulty, whatever the preference now is", () => {
    const progress = { difficulty: "standard", totalSlots: 5, slots: [], clues: [] };
    expect(initialMode({ record: null, progress, daily: true, preference: "hardcore" })).toEqual({ mode: "play", difficulty: "standard" });
  });
  it("older saves knew only their card count", () => {
    expect(progressDifficulty({ totalSlots: 6 })).toBe("expert");
    expect(progressDifficulty({ difficulty: "easy", totalSlots: 7 })).toBe("hardcore");
  });
  it("not started: today's asks for a difficulty, an archive puzzle starts at the preference", () => {
    expect(initialMode({ record: null, progress: null, daily: true, preference: "easy" })).toEqual({ mode: "setup", difficulty: "easy" });
    expect(initialMode({ record: null, progress: null, daily: false, preference: "easy" })).toEqual({ mode: "play", difficulty: "easy" });
  });
});

describe("saved progress", () => {
  it("only an unfinished, well-formed save is resumable", () => {
    localStorage.setItem("clover_progress_42", JSON.stringify({ totalSlots: 5, slots: [], clues: [], lives: 2 }));
    expect(readProgress(42)).toBeTruthy();
    expect(progressLivesUsed(readProgress(42))).toBe(1);
    localStorage.setItem("clover_progress_42", JSON.stringify({ totalSlots: 5, slots: [], clues: [], lost: true }));
    expect(readProgress(42)).toBe(null);
    localStorage.setItem("clover_progress_42", "not json");
    expect(readProgress(42)).toBe(null);
  });
  it("a save without lives counts none used", () => {
    expect(progressLivesUsed({ totalSlots: 5 })).toBe(0);
  });
});

describe("the finished board", () => {
  const R = "🔮", B = "⚫";
  const win2 = { solved: true, livesUsed: 2, difficulty: "hardcore" };
  const round = (guessHistory, extra = {}) => ({ ...win2, slots: [{ cardId: "c1", orientation: 0 }], clues: [], guessHistory, ...extra });
  const g2 = [[[B, R], [B, B]], [[R, R], [B, R]], [[R, R], [R, R]]];
  // Two players, same browser: identical difficulty, outcome, lives and
  // guess count; only the grids differ.
  const gA = [[[B, R], [B, B]], [[R, R], [B, R]], [[R, R], [R, R]]];
  const gB = [[[R, B], [R, B]], [[R, R], [R, B]], [[R, R], [R, R]]];
  const T1 = "2026-10-13T20:00:00.123Z", T2 = "2026-10-13T21:30:00.456Z";
  it("an account reads only its own round, never another account's identical-looking one", () => {
    writeFinal(42, "acct-a", round(gA, { finishedAt: T1 }));
    writeFinal(42, "acct-b", round(gB, { finishedAt: T2 }));
    expect(readFinal(42, "acct-a", win2).guessHistory).toEqual(gA);
    expect(readFinal(42, "acct-b", win2).guessHistory).toEqual(gB);
    expect(readFinal(42, "acct-c", win2)).toBe(null);
  });
  it("a guest reads only the round saved with their own completion", () => {
    writeFinal(42, null, round(gA, { finishedAt: T1 }));
    expect(readFinal(42, null, { ...win2, finishedAt: T1 }).guessHistory).toEqual(gA);
    // The next guest on this browser, same-looking result, finished later: not theirs.
    expect(readFinal(42, null, { ...win2, finishedAt: T2 })).toBe(null);
    expect(readFinal(42, null, win2)).toBe(null);                         // no timestamp: unprovable
    expect(readFinal(42, "acct-a", { ...win2, finishedAt: T1 })).toBe(null); // an account never reads the guest's
  });
  it("old-key rounds: only a guest's, tied by its exact finish time; never an account's", () => {
    localStorage.setItem("clover_final_42", JSON.stringify(round(gA, { finishedAt: T1 })));
    expect(readFinal(42, "acct-a", { ...win2, finishedAt: T1 })).toBe(null);
    expect(readFinal(42, "acct-b", win2)).toBe(null);
    expect(readFinal(42, null, { ...win2, finishedAt: T2 })).toBe(null);
    expect(readFinal(42, null, { ...win2, finishedAt: T1 }).guessHistory).toEqual(gA);
  });
  it("is used only when it fits the result being shown", () => {
    writeFinal(42, "acct-a", round(gA));
    expect(readFinal(42, "acct-a", { ...win2, livesUsed: 1 })).toBe(null);
    expect(readFinal(42, "acct-a", { ...win2, difficulty: "easy" })).toBe(null);
    expect(readFinal(42, "acct-a", { solved: false, livesUsed: 3, difficulty: "hardcore" })).toBe(null);
    expect(readFinal(42, "acct-a", null)).toBe(null);
  });
  it("checks the guesses add up: a win is livesUsed + 1 guesses ending all right; a loss is 3", () => {
    expect(finalMatches(round(gA), win2)).toBe(true);
    expect(finalMatches(round(gA.slice(1)), win2)).toBe(false);
    expect(finalMatches(round([[[B, R], [B, B]], [[R, R], [B, R]], [[R, B], [R, R]]]), win2)).toBe(false);
    const lost = [[[B, B], [B, B]], [[R, B], [B, B]], [[R, B], [B, R]]];
    expect(finalMatches(round(lost, { solved: false, livesUsed: 3 }), { solved: false, livesUsed: 3, difficulty: "hardcore" })).toBe(true);
  });
  it("without a saved board: the answer, the round's own extra cards and lives left", () => {
    const b = reviewBoard(PUZZLE, { solved: true, livesUsed: 2, difficulty: "standard" }, null);
    expect(b.lives).toBe(1);
    expect(b.slots).toHaveLength(5);
    expect(b.slots.slice(0, 4)).toEqual([
      { cardId: "c1", orientation: 0 }, { cardId: "c2", orientation: 1 }, { cardId: "c3", orientation: 2 }, { cardId: "c4", orientation: 3 },
    ]);
    expect(b.slots[4].cardId).toBe("c5");
    expect(reviewBoard(PUZZLE, { solved: false, livesUsed: 3, difficulty: "easy" }, null)).toMatchObject({ lives: 0, difficulty: "easy" });
    expect(reviewBoard(PUZZLE, { solved: true, livesUsed: 0, difficulty: "hardcore" }, null).slots).toHaveLength(7);
  });
  it("uses the board as it ended when it fits the round", () => {
    const final = { slots: ["c2", "c1", "c3", "c4", "c6"].map((cardId) => ({ cardId, orientation: 1 })), clues: ["TALL", "BLUE", "WILD", "HEAT"], guessHistory: [[["🔮", "⚫"], ["⚫", "⚫"]]] };
    const b = reviewBoard(PUZZLE, { solved: true, livesUsed: 1, difficulty: "standard" }, final);
    expect(b.slots[0].cardId).toBe("c2");
    expect(b.clues[0]).toBe("TALL");
    expect(b.guessHistory).toHaveLength(1);
    // A board from another difficulty is ignored.
    expect(reviewBoard(PUZZLE, { solved: true, livesUsed: 1, difficulty: "easy" }, final).slots).toHaveLength(4);
  });
});

describe("share text", () => {
  const grid = [[["🔮", "⚫"], ["⚫", "⚫"]], [["🔮", "⚫"], ["⚫", "🔮"]], [["🔮", "🔮"], ["🔮", "🔮"]]];
  // The beta baseline: 2026-04-08 is Daily #1 (src/game/dailyNumber.js).
  it("Daily #N, one sparkle per extra card, a block per guess, the site", () => {
    expect(shareText({ solved: true, livesUsed: 2, difficulty: "hardcore" }, grid, "2026-04-08"))
      .toBe("Daily #1 ✨✨✨\n🔮⚫ 🔮⚫ 🔮🔮\n⚫⚫ ⚫🔮 🔮🔮\nCluevoyance.com");
    expect(shareText({ solved: true, livesUsed: 0, difficulty: "easy" }, grid.slice(2), "2026-04-14")).toBe("Daily #7\n🔮🔮\n🔮🔮\nCluevoyance.com");
    expect(shareText({ solved: true, livesUsed: 0, difficulty: "standard" }, grid.slice(2), "2026-04-14").split("\n")[0]).toBe("Daily #7 ✨");
    expect(shareText({ solved: true, livesUsed: 0, difficulty: "expert" }, grid.slice(2), "2026-04-14").split("\n")[0]).toBe("Daily #7 ✨✨");
  });
  it("a loss shares its guesses too", () => {
    const lost = [[["⚫", "⚫"], ["⚫", "⚫"]], [["🔮", "⚫"], ["⚫", "⚫"]], [["🔮", "⚫"], ["⚫", "⚫"]]];
    expect(shareText({ solved: false, livesUsed: 3, difficulty: "standard" }, lost, "2026-10-13"))
      .toBe("Daily #189 ✨\n⚫⚫ 🔮⚫ 🔮⚫\n⚫⚫ ⚫⚫ ⚫⚫\nCluevoyance.com");
  });
  it("never invents a number: before the start the date; the result when the guesses weren't kept", () => {
    expect(shareText({ solved: true, livesUsed: 1, difficulty: "expert" }, [], "2026-04-07"))
      .toBe("Daily Apr 7, 2026 ✨✨\nSolved with 1 life lost\nCluevoyance.com");
    expect(shareText({ solved: false, livesUsed: 3, difficulty: "easy" })).toBe("Daily puzzle\nNot solved\nCluevoyance.com");
  });
});

describe("result headline", () => {
  it("names a perfect solve, other wins and a loss", () => {
    expect(resultWords({ solved: true, livesUsed: 0 })).toEqual({ headline: "Brilliant!", line: "Solved with no lives lost" });
    expect(resultWords({ solved: true, livesUsed: 1 }).line).toBe("Solved with 1 life lost");
    expect(resultWords({ solved: true, livesUsed: 2 }).line).toBe("Solved with 2 lives lost");
    expect(resultWords({ solved: false, livesUsed: 3 }).headline).toBe("Not this time");
  });
});

describe("Lives used charts", () => {
  it("reads personal counters and puzzle summaries alike, with Not solved last", () => {
    expect(livesRows({ 0: 2, 1: 0, 2: 1, X: 3 }).map((r) => [r.label, r.count])).toEqual([["0", 2], ["1", 0], ["2", 1], ["Not solved", 3]]);
    expect(livesRows({ players: 4, lives_0: 1, lives_1: 1, lives_2: 0, not_solved: 2 }).map((r) => r.count)).toEqual([1, 1, 0, 2]);
    expect(livesRows(null).every((r) => r.count === 0)).toBe(true);
  });
  it("puts a result in its row", () => {
    expect(resultRowKey({ solved: true, livesUsed: 2 })).toBe("2");
    expect(resultRowKey({ solved: false, livesUsed: 3 })).toBe("X");
    expect(resultRowKey(null)).toBe(null);
  });
});

describe("front page copy", () => {
  it("the daily button follows the saved state", () => {
    expect(dailyCopy({ status: "new" }).title).toBe("Play Today's Puzzle");
    expect(dailyCopy({ status: "progress", difficulty: "standard", livesUsed: 1 }))
      .toEqual({ title: "Continue Today's Puzzle", sub: "Standard · 1 life used so far" });
    expect(dailyCopy({ status: "done", record: { solved: true, livesUsed: 2, difficulty: "standard" } }))
      .toEqual({ title: "View Today's Results", sub: "Solved on Standard · 2 lives used" });
    expect(dailyCopy({ status: "done", record: { solved: false, livesUsed: 3, difficulty: "easy" } }).sub).toBe("Not solved · Easy");
  });
  it("Friends shows a count only when there is a real one", () => {
    expect(friendsCopy(null)).toBe("Trade puzzles with friends");
    expect(friendsCopy({ waiting: 0, results: 0 })).toBe("Trade puzzles with friends");
    expect(friendsCopy({ waiting: 2, results: 1 })).toBe("2 puzzles waiting");
    expect(friendsCopy({ waiting: 1 })).toBe("1 puzzle waiting");
    expect(friendsCopy({ waiting: 0, results: 1 })).toBe("1 new result to watch");
  });
});
