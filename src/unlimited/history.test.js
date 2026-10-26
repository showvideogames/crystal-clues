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
import V1 from "./fixtures/generator-v1-board.json";

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

  it("a game saved by the released generator 1 (extras from the original 50) never changes when the library grows", () => {
    const v1 = V1.board;
    const before = JSON.stringify(v1);
    // in progress, as the released build saved it; then a refresh under the new library
    localStorage.setItem(STORE_KEY, JSON.stringify(startBoard(emptyStore(), v1, "expert")));
    let s = readStore();
    expect(JSON.stringify(resolveBoard(poolById, s, s.current.id))).toBe(before);   // Continue: same board
    const fresh = rnd(31);                                                             // a new game uses the new library
    expect(fresh.generator).toBe(3); expect(fresh.id).not.toBe(v1.id);                // 3: the board-word rule (2026-10-22)
    s = finishBoard(s, v1, { won: true, livesUsed: 2, difficulty: "expert" });
    s = startBoard(s, { ...fresh, id: v1.id }, "easy", { replay: true });              // Replay: snapshot kept
    expect(JSON.stringify(s.boards[v1.id])).toBe(before);
    expect(writeStore(s)).toBe(true);
    expect(JSON.stringify(readStore().boards[v1.id])).toBe(before);
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

// Malformed saved data: never read as history, never written over.
import { isValidStore } from "./history.js";

describe("malformed saved data stays untouched", () => {
  beforeEach(() => localStorage.clear());
  const entry = { outcome: "won", livesUsed: 0, difficulty: "standard", finishedAt: "2026-10-17T20:00:00.000Z", version: 1, replays: 0 };
  const good = { version: 1, played: { "beta-01-001": entry }, current: null, feedback: [], boards: {} };
  const MALFORMED = {
    "top level null": null,
    "top level array": [good],
    "version as text": { ...good, version: "1" },
    "played null": { ...good, played: null },
    "played array": { ...good, played: [entry] },
    "played missing": { version: 1, current: null, feedback: [] },
    "played entry null": { ...good, played: { "beta-01-001": null } },
    "played entry array": { ...good, played: { "beta-01-001": [entry] } },
    "current array": { ...good, current: ["beta-01-001"] },
    "current without id": { ...good, current: { difficulty: "easy" } },
    "feedback null": { ...good, feedback: null },
    "feedback record": { ...good, feedback: { 0: {} } },
    "feedback item null": { ...good, feedback: [null] },
    "boards null": { ...good, boards: null },
    "boards array": { ...good, boards: [{ id: "r-1" }] },
    "boards entry null": { ...good, boards: { "r-1": null } },
    "boards entry array": { ...good, boards: { "r-1": [] } },
    "boards entry without id": { ...good, boards: { "r-1": { clues: [] } } },
  };

  for (const [name, value] of Object.entries(MALFORMED)) {
    it(`${name}: reported unreadable, not read as history, never overwritten`, () => {
      const raw = JSON.stringify(value);
      localStorage.setItem(STORE_KEY, raw);
      expect(isValidStore(value)).toBe(false);
      expect(storageStatus()).toBe("unreadable");
      expect(readStore()).toEqual(emptyStore());          // play continues from an empty in-memory store
      const next = finishBoard(startBoard(readStore(), board(1), "standard"), board(1), { won: true, livesUsed: 0, difficulty: "standard" });
      expect(writeStore(next)).toBe(false);               // refused
      expect(localStorage.getItem(STORE_KEY)).toBe(raw);   // byte-identical
    });
  }

  it("valid stores still load and save: today's, one without boards, one without feedback", () => {
    const withoutBoards = { version: 1, played: { "beta-01-001": entry }, current: { id: "beta-02-008", version: 1, difficulty: "easy" }, feedback: [] };
    const withoutFeedback = { version: 1, played: {}, current: null };
    for (const v of [good, withoutBoards, withoutFeedback]) {
      expect(isValidStore(v)).toBe(true);
      localStorage.setItem(STORE_KEY, JSON.stringify(v));
      expect(storageStatus()).toBe("ok");
      const s = readStore();
      expect(s.played).toEqual(v.played);
      expect(Array.isArray(s.feedback) && s.boards && typeof s.boards === "object").toBe(true);
      expect(writeStore(s)).toBe(true);
    }
  });
});

// Board-word rule (generator 3): new fallback games skip clashing pool boards; saved boards never change.
import { nextFallbackBoard } from "./history.js";
import { boardHintClashes } from "./generate.js";
import V2CLASH from "./fixtures/generator-v2-clash-board.json";

describe("board-word rule and the boards a player already has", () => {
  beforeEach(() => localStorage.clear());
  const poolById = new Map(POOL.boards.map((b) => [b.id, b]));
  const done = { won: true, livesUsed: 0, difficulty: "standard" };
  const CLASHING = ["beta-01-002", "beta-03-005", "beta-03-008", "beta-03-012", "beta-03-013"]; // QUEEN, NIGHT, BEAR, FISH, MOON

  it("a new fallback game skips the pool boards whose hint equals one of their own words", () => {
    expect(POOL.boards.filter((b) => boardHintClashes(b).length).map((b) => b.id).sort()).toEqual(CLASHING);
    let s = emptyStore(); const served = [];
    for (let b = nextFallbackBoard(POOL.boards, s); b; b = nextFallbackBoard(POOL.boards, s)) { served.push(b.id); s = finishBoard(startBoard(s, b, "standard"), b, done); }
    expect(served).toHaveLength(POOL.boards.length - CLASHING.length);
    expect(served.filter((id) => CLASHING.includes(id))).toEqual([]);
    expect(served[0]).toBe("beta-01-001"); expect(served[1]).toBe("beta-01-003"); // batch order otherwise kept
    expect(nextBoard(POOL.boards, s).id).toBe("beta-01-002");                   // the plain pool order is unchanged
  });

  it("when every unplayed pool board clashes there is no fallback board (null, as for an empty pool)", () => {
    expect(nextFallbackBoard(POOL.boards.filter((b) => CLASHING.includes(b.id)), emptyStore())).toBeNull();
    expect(nextFallbackBoard([], emptyStore())).toBeNull();
  });

  it("refresh, Continue, history and Replay still resolve a clashing pool board exactly", () => {
    const moon = poolById.get("beta-03-013");
    const before = JSON.stringify(moon);
    expect(boardHintClashes(moon).map((c) => c.clue)).toEqual(["MOON"]);
    writeStore(startBoard(emptyStore(), moon, "expert"));
    let s = readStore();
    expect(resolveBoard(poolById, s, s.current.id)).toBe(moon);
    s = startBoard(finishBoard(s, moon, done), moon, "easy", { replay: true });
    expect(resolveBoard(poolById, s, "beta-03-013")).toBe(moon);
    expect(JSON.stringify(moon)).toBe(before);
  });

  it("a saved generator-2 board whose hints equal two of its decoys comes back unchanged on Continue and Replay", () => {
    const v2 = V2CLASH.board;
    const before = JSON.stringify(v2);
    expect(v2.generator).toBe(2);
    expect(boardHintClashes(v2).map((c) => c.clue)).toEqual(["BAG", "NET"]);
    localStorage.setItem(STORE_KEY, JSON.stringify(startBoard(emptyStore(), v2, "standard")));
    let s = readStore();
    expect(JSON.stringify(resolveBoard(poolById, s, s.current.id))).toBe(before);       // Continue
    s = finishBoard(s, v2, done);
    const again = generateBoard(LIBRARY, { seed: v2.seed, createdAt: v2.createdAt });  // the same seed today
    expect(again.id).toBe(v2.id); expect(again.generator).toBe(3); expect(boardHintClashes(again)).toEqual([]);
    s = startBoard(s, again, "easy", { replay: true });                                // Replay: the snapshot wins
    expect(JSON.stringify(s.boards[v2.id])).toBe(before);
    expect(JSON.stringify(resolveBoard(poolById, s, v2.id))).toBe(before);
    expect(writeStore(s)).toBe(true);
    expect(JSON.stringify(readStore().boards[v2.id])).toBe(before);
  });
});
