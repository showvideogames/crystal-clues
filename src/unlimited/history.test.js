import { describe, it, expect, beforeEach } from "vitest";
import { STORE_KEY, emptyStore, readStore, writeStore, nextBoard, startBoard, finishBoard, rateClue, notePuzzle, feedbackText, feedbackFor } from "./history.js";

const board = (index) => ({ id: `beta-01-00${index}`, version: 1, index, reveal: [
  { position: 0, clue: "HOWL", wordA: "MOON", wordB: "WOLF" }, { position: 1, clue: "TIDE", wordA: "MOON", wordB: "OCEAN" },
  { position: 2, clue: "EASTER", wordA: "EGG", wordB: "SPRING" }, { position: 3, clue: "SIMBA", wordA: "KING", wordB: "LION" } ] });
const pool = [board(2), board(1), board(3)];

describe("Unlimited history store", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty and survives a bad or missing value", () => {
    expect(readStore()).toEqual(emptyStore());
    localStorage.setItem(STORE_KEY, "{not json");
    expect(readStore()).toEqual(emptyStore());
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 7 }));
    expect(readStore()).toEqual(emptyStore());
  });

  it("serves boards in batch order, once each, then none", () => {
    let s = emptyStore();
    expect(nextBoard(pool, s).index).toBe(1);
    s = finishBoard(startBoard(s, board(1), "standard"), board(1), { won: true, livesUsed: 1, difficulty: "standard" });
    expect(nextBoard(pool, s).index).toBe(2);
    s = finishBoard(startBoard(s, board(2), "easy"), board(2), { won: false, livesUsed: 3, difficulty: "easy" });
    s = finishBoard(startBoard(s, board(3), "hardcore"), board(3), { won: true, livesUsed: 0, difficulty: "hardcore" });
    expect(nextBoard(pool, s)).toBeNull();
    expect(s.played["beta-01-002"]).toMatchObject({ outcome: "lost", livesUsed: 3, difficulty: "easy", replays: 0 });
    expect(s.current).toBeNull();
  });

  it("a replay is counted and never overwrites the first result", () => {
    let s = finishBoard(startBoard(emptyStore(), board(1), "standard"), board(1), { won: false, livesUsed: 3, difficulty: "standard" });
    s = finishBoard(startBoard(s, board(1), "standard", { replay: true }), board(1), { won: true, livesUsed: 0, difficulty: "standard" });
    expect(s.played["beta-01-001"].outcome).toBe("lost");
    expect(s.played["beta-01-001"].replays).toBe(1);
    expect(s.played["beta-01-001"].lastReplay.outcome).toBe("won");
  });

  it("keeps one rating per clue and one note per puzzle, and toggles a repeated rating off", () => {
    const ctx = { board: board(1), difficulty: "standard", outcome: "won", livesUsed: 1 };
    let s = rateClue(emptyStore(), { ...ctx, position: 0, rating: "confusing" });
    s = rateClue(s, { ...ctx, position: 0, rating: "two_fit" });
    s = rateClue(s, { ...ctx, position: 2, rating: "great" });
    s = notePuzzle(s, { ...ctx, note: " MOON appears twice? " });
    s = notePuzzle(s, { ...ctx, note: "Loved SIMBA" });
    expect(feedbackFor(s, board(1))).toHaveLength(3);
    expect(feedbackFor(s, board(1)).find((f) => f.position === 0)).toMatchObject({ clue: "HOWL", pair: "MOON + WOLF", rating: "two_fit", difficulty: "standard" });
    expect(feedbackFor(s, board(1)).find((f) => f.position === null).note).toBe("Loved SIMBA");
    s = rateClue(s, { ...ctx, position: 2, rating: "great" });
    expect(feedbackFor(s, board(1)).some((f) => f.position === 2)).toBe(false);
    const text = feedbackText(s);
    expect(text).toContain("beta-01-001 v1 · standard · won with 1 life used");
    expect(text).toContain("clue 1 HOWL (MOON + WOLF): Two answers fit");
    expect(text).toContain("note: Loved SIMBA");
    expect(text).toContain("this device only");
  });

  it("round-trips through localStorage", () => {
    const s = rateClue(startBoard(emptyStore(), board(1), "expert"), { board: board(1), position: 1, rating: "weak", difficulty: "expert", outcome: "won", livesUsed: 2 });
    writeStore(s);
    expect(readStore()).toEqual(s);
  });
});
