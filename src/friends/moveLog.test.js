// The replay's move log: batching and exactly-once saving across a refresh,
// and rebuilding a game from a log, honestly, when parts are missing.
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createMoveRecorder, buildReplay, packBoard, rotateBoard, rotateClues, recordedGuessResult } from "./moveLog";

// A fake server with save_friend_moves' rules: a cursor per session.
function fakeServer() {
  const log = [];
  const cursors = {};
  const calls = [];
  const save = vi.fn(async ({ session, from, actions }) => {
    calls.push({ session, from, n: actions.length });
    const cur = cursors[session] || 0;
    if (from + actions.length <= cur) return { stored: cur };
    if (from > cur) log.push({ k: "gap" }, ...actions);
    else log.push(...actions.slice(cur - from));
    cursors[session] = from + actions.length;
    return { stored: from + actions.length };
  });
  return { log, save, calls };
}
const flushTimers = async () => { await vi.runAllTimersAsync(); };

describe("createMoveRecorder", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  test("batches moves instead of one request each, and sends at once after a guess", async () => {
    const srv = fakeServer();
    let t = 1000;
    const rec = createMoveRecorder("p1", srv.save, { now: () => t });
    rec.record({ k: "s", b: ["a:0"], c: ["A", "B", "C", "D"] });
    for (let i = 0; i < 5; i++) { t += 300; rec.record({ k: "t", s: 1 }); }
    expect(srv.save).not.toHaveBeenCalled();
    t += 9000; rec.record({ k: "g", n: 1 });
    await flushTimers();
    expect(srv.save).toHaveBeenCalledTimes(1);
    expect(srv.log.map((a) => a.k)).toEqual(["s", "t", "t", "t", "t", "t", "g"]);
    expect(srv.log[1].d).toBe(300);
    expect(srv.log[6].d).toBe(5000);   // long waits are capped
    rec.dispose();
  });

  test("a refresh mid-play: unsent moves from the old page go first, nothing is duplicated", async () => {
    const srv = fakeServer();
    // Page 1 sends one batch, but the reply is lost; then two more moves and the page reloads.
    let page1Open = true;   // a closed tab's script stops running
    const lossy = vi.fn(async (b) => {
      if (!page1Open) return new Promise(() => {});
      await srv.save(b);
      throw Object.assign(new Error("offline"), { code: "network" });
    });
    const page1 = createMoveRecorder("p1", lossy);
    page1.record({ k: "s", b: ["a:0"], c: ["A", "B", "C", "D"] });
    page1.record({ k: "t", s: 0 });
    await page1.flush();
    page1.record({ k: "m", a: 0, b: 4 });
    page1Open = false;      // (no dispose: the tab just went away)
    const page2 = createMoveRecorder("p1", srv.save);
    page2.record({ k: "s", b: ["a:1"], c: ["A", "B", "C", "D"] });
    page2.record({ k: "g", n: 1 });
    await flushTimers();
    expect(srv.log.map((a) => a.k)).toEqual(["s", "t", "m", "s", "g"]);
    // Everything acknowledged: nothing left waiting in this browser.
    expect(Object.keys(localStorage).filter((k) => k.startsWith("cv-moves:p1:") && JSON.parse(localStorage.getItem(k)).pending.length)).toEqual([]);
    page2.dispose();
  });

  test("a finished puzzle that no longer takes moves drops what's waiting", async () => {
    const save = vi.fn(async () => { throw Object.assign(new Error("closed"), { code: "moves_closed" }); });
    const rec = createMoveRecorder("p2", save);
    rec.record({ k: "t", s: 0 });
    await rec.flush();
    rec.record({ k: "t", s: 0 });
    await flushTimers();
    expect(save).toHaveBeenCalledTimes(1);
    expect(Object.keys(localStorage).some((k) => k.startsWith("cv-moves:p2:"))).toBe(false);
  });
});

// ── buildReplay ─────────────────────────────────────────────────────────

const CLUES = ["TOP", "RIGHT", "BOTTOM", "LEFT"];
const IDS = ["k1", "k2", "k3", "k4", "k5"];
const start = IDS.map((cardId, i) => ({ cardId, orientation: i % 4 }));
const asGuess = (slots, clues, n, correct, lives) => ({
  guess_no: n, board: slots.slice(0, 4), extras: slots.slice(4), clues, correct, lives_left: lives,
});
function viewWith(guesses, outcome = "won") {
  return {
    card_order: IDS, clues: CLUES, guesses, outcome, lives_used: 1, max_lives: 3,
    solution: { slotCards: ["k1", "k2", "k3", "k4"], orientations: [0, 0, 0, 0] },
  };
}

describe("buildReplay", () => {
  test("replays turns, swaps (bonus cards too), Rotate and Reset exactly, then the guess", () => {
    let s = start.map((x) => ({ ...x }));
    const tap = (b, i) => b.map((x, j) => (j === i ? { ...x, orientation: (x.orientation + 1) % 4 } : x));
    const swap = (b, i, j) => { const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n; };
    const afterTap = tap(s, 2);
    const afterSwap = swap(afterTap, 1, 4);
    const rotated = rotateBoard(afterSwap);
    const clues1 = rotateClues(CLUES);
    const final = swap(rotated, 0, 3);
    const actions = [
      { k: "s", b: packBoard(s), c: CLUES, d: 0 },
      { k: "t", s: 2, d: 400 },
      { k: "m", a: 1, b: 4, d: 9000 },
      { k: "r", d: 100 },
      { k: "z", b: packBoard(afterSwap), c: CLUES, d: 300 },   // undo the rotate
      { k: "r", d: 300 },
      { k: "m", a: 0, b: 3, d: 300 },
      { k: "g", n: 1, d: 500 },
    ];
    const view = viewWith([asGuess(final, clues1, 1, [0, 1, 2, 3], 3)]);
    const plan = buildReplay(view, { actions });
    expect(plan.missing).toBe(false);
    expect(plan.init.slots).toEqual(s);
    expect(plan.steps.map((st) => st.kind)).toEqual(["tap", "swap", "rotate", "reset", "rotate", "swap", "guess"]);
    expect(plan.steps.at(-2).slots).toEqual(final);
    expect(plan.steps.at(-2).clues).toEqual(clues1);
    expect(plan.steps[1].d).toBe(5000);   // capped
  });

  test("a refresh shows as coming back; a board that was restored differently glides there", () => {
    const moved = [start[1], start[0], ...start.slice(2)];
    const actions = [
      { k: "s", b: packBoard(start), c: CLUES },
      { k: "s", b: packBoard(start), c: CLUES, d: 4000 },   // same board after a refresh
      { k: "m", a: 0, b: 1 },
      { k: "s", b: packBoard(start), c: CLUES, d: 4000 },   // resumed from an older save
      { k: "g", n: 1 },
    ];
    const plan = buildReplay(viewWith([asGuess(start, CLUES, 1, [0, 1, 2, 3], 3)]), { actions });
    expect(plan.steps.map((st) => [st.kind, !!st.moved])).toEqual([["resume", false], ["swap", false], ["resume", true], ["guess", false]]);
    expect(plan.steps[1].slots).toEqual(moved);
    expect(plan.missing).toBe(false);
  });

  test("missing moves: jumps to the recorded guess board and says so; never invents moves", () => {
    const g1 = [start[2], start[1], start[0], ...start.slice(3)];
    const actions = [
      { k: "s", b: packBoard(start), c: CLUES },
      { k: "gap" },
      { k: "t", s: 0 },                // after a gap the board is unknown: skipped
      { k: "g", n: 1 },
      // the last batch (with guess 2) never arrived
    ];
    const g2 = [start[0], ...start.slice(1)];
    const view = viewWith([asGuess(g1, CLUES, 1, [1], 2), asGuess(g2, CLUES, 2, [0, 1, 2, 3], 2)]);
    const plan = buildReplay(view, { actions });
    expect(plan.missing).toBe(true);
    expect(plan.steps.map((st) => st.kind)).toEqual(["jump", "guess", "jump", "guess"]);
    expect(plan.steps[0].slots).toEqual(g1);
  });

  test("older games without a log keep the guess-by-guess replay", () => {
    expect(buildReplay(viewWith([asGuess(start, CLUES, 1, [0, 1, 2, 3], 3)]), null)).toBe(null);
    expect(buildReplay(viewWith([asGuess(start, CLUES, 1, [0, 1, 2, 3], 3)]), { actions: [] })).toBe(null);
  });

  test("the pretend server answers with the recorded result, and the answer only on the last guess", () => {
    const view = viewWith([asGuess(start, CLUES, 1, [1], 2), asGuess(start, CLUES, 2, [0, 1, 2, 3], 2)]);
    expect(recordedGuessResult(view, 1)).toMatchObject({ guess_no: 1, correct: [1], lives_left: 2, solution: null, outcome: null });
    expect(recordedGuessResult(view, 2)).toMatchObject({ guess_no: 2, outcome: "won", solution: view.solution });
  });
});
