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

// Random boards: frozen snapshots in the store, and compatibility with fixed-pool history.
import { resolveBoard, recentPairIds, playedTotal, feedbackJson } from "./history.js";
import { generateBoard } from "./generate.js";
import LIBRARY from "./random-library.json";
import POOL from "./pool.json";

describe("random boards in the history store", () => {
  beforeEach(() => localStorage.clear());
  const poolById = new Map(POOL.boards.map((b) => [b.id, b]));
  const rnd = (seed) => generateBoard(LIBRARY, { seed, createdAt: `2026-10-18T18:0${seed % 10}:00.000Z` });

  it("reads a store written before random boards (no boards map) without losing anything", () => {
    const old = { version: 1, played: { "beta-01-001": { outcome: "won", livesUsed: 1, difficulty: "standard", finishedAt: "2026-10-17T20:00:00.000Z", version: 1, replays: 0 } },
      current: { id: "beta-02-008", version: 1, difficulty: "easy", replay: false, startedAt: "2026-10-17T21:00:00.000Z" }, feedback: [{ puzzleId: "beta-01-001", version: 1, position: 0, rating: "great" }] };
    localStorage.setItem(STORE_KEY, JSON.stringify(old));
    const s = readStore();
    expect(s.played).toEqual(old.played);
    expect(s.current).toEqual(old.current);
    expect(s.feedback).toEqual(old.feedback);
    expect(s.boards).toEqual({});
    expect(resolveBoard(poolById, s, s.current.id)).toBe(poolById.get("beta-02-008")); // an in-progress fixed board still resolves
    expect(resolveBoard(poolById, s, "beta-01-001").reveal).toEqual(poolById.get("beta-01-001").reveal); // frozen pool snapshot
  });

  it("freezes a random board on start; refresh, Continue and Replay resolve the exact same object", () => {
    const b = rnd(11);
    let s = startBoard(emptyStore(), b, "hardcore");
    writeStore(s);
    const reread = readStore();                       // a refresh
    expect(resolveBoard(poolById, reread, reread.current.id)).toEqual(b);
    s = finishBoard(reread, b, { won: true, livesUsed: 1, difficulty: "hardcore" });
    const other = rnd(12);
    s = startBoard(s, { ...other, id: b.id, clues: ["X", "Y", "Z", "W"] }, "easy", { replay: true }); // a different board under the same id must not replace the snapshot
    expect(s.boards[b.id]).toEqual(b);
    s = finishBoard(s, b, { won: false, livesUsed: 3, difficulty: "easy" });
    expect(s.played[b.id]).toMatchObject({ outcome: "won", replays: 1 });
    expect(playedTotal(s)).toBe(1);
  });

  it("knows the pairs of the last boards (for avoiding repeats) and exports the boards it played", () => {
    let s = emptyStore();
    const bs = [rnd(21), rnd(22), rnd(23), rnd(24)];
    for (const b of bs) s = finishBoard(startBoard(s, b, "standard"), b, { won: true, livesUsed: 0, difficulty: "standard" });
    const recent = recentPairIds(s, 3);
    expect(recent.size).toBeGreaterThan(0);
    for (const r of bs[3].reveal) expect(recent.has(r.pairId)).toBe(true);
    const json = JSON.parse(feedbackJson(s));
    expect(Object.keys(json.boards).sort()).toEqual(bs.map((b) => b.id).sort());
    expect(json.boards[bs[0].id]).toEqual(bs[0]);
  });

  it("the fixed pool is untouched: live beta-01/02 boards keep their ids and snapshots", () => {
    const ids = POOL.boards.map((b) => b.id);
    expect(ids.filter((id) => id.startsWith("beta-01")).length).toBe(8);
    expect(ids.filter((id) => id.startsWith("beta-02")).length).toBe(8);
    expect(POOL.boards.every((b) => !b.kind)).toBe(true);
  });
});

// Storage full, blocked or unreadable: never lose or overwrite what is saved, and report it.
import { storageStatus } from "./history.js";
import { vi, afterEach } from "vitest";

describe("saving when storage is full, blocked or unreadable", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  const saved = () => ({ version: 1, played: { "beta-01-001": { outcome: "won", livesUsed: 0, difficulty: "standard", finishedAt: "2026-10-17T20:00:00.000Z", version: 1, replays: 0 } }, current: null, feedback: [], boards: {} });

  it("reports a successful save", () => {
    expect(storageStatus()).toBe("empty");
    expect(writeStore(saved())).toBe(true);
    expect(storageStatus()).toBe("ok");
  });

  it("a full storage (QuotaExceededError) fails the save and leaves the saved history exactly as it was", () => {
    writeStore(saved());
    const before = localStorage.getItem(STORE_KEY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); });
    const bigger = startBoard(readStore(), { id: "r-test", version: 1, kind: "random", reveal: [], clues: [], createdAt: "2026-10-18T19:00:00.000Z" }, "standard");
    expect(writeStore(bigger)).toBe(false);
    vi.restoreAllMocks();
    expect(localStorage.getItem(STORE_KEY)).toBe(before);
    expect(readStore().played).toEqual(saved().played);
  });

  it("never writes over saved data it cannot read (damaged, or from a newer version)", () => {
    for (const raw of ["{not json", JSON.stringify({ version: 2, played: { x: 1 }, boards: { r1: {} } })]) {
      localStorage.setItem(STORE_KEY, raw);
      expect(storageStatus()).toBe("unreadable");
      expect(writeStore(saved())).toBe(false);
      expect(localStorage.getItem(STORE_KEY)).toBe(raw);
    }
  });

  it("blocked storage (reads throw) is reported as unavailable and nothing is attempted", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    const set = vi.spyOn(Storage.prototype, "setItem");
    expect(storageStatus()).toBe("unavailable");
    expect(writeStore(saved())).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(readStore()).toEqual(emptyStore()); // play continues from memory
  });
});
