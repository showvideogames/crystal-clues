// Pilot beta difficulty: the same four levels and card rules as normal Unlimited,
// chosen before a board starts, remembered under the beta's own key, and a
// mid-board switch restarts the SAME board only after a warning, keeping ratings.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../../App.jsx";
import { DIFF_OPTIONS, DIFFICULTY_EXTRA } from "../../game/shared";
import { STORE_KEY } from "../history.js";
import { PILOT } from "./data.js";
import PilotBetaView from "./PilotBetaView.jsx";
import { PILOT_NS, PILOT_STATE_KEY, PILOT_DIFFICULTY_KEY, pilotDataId, pilotProgressKey, emptyPilotState, writePilotState, finishPilotBoard, ratePilotClue, advancePilot, readPilotDifficulty } from "./storage.js";

const NORMAL = {
  [STORE_KEY]: JSON.stringify({ version: 1, played: {}, current: null, feedback: [], boards: {} }),
  clover_difficulty: JSON.stringify("expert"),
  clover_stats: JSON.stringify({ played: 3, streak: 2 }),
};
const data = PILOT.data;
const id = pilotDataId(data._metadata);
let root, host;
const render = async () => { await act(async () => root.render(createElement(PilotBetaView, { kit: { GameView }, onHome: () => {} }))); };
const click = async (el) => { await act(async () => el.click()); };
const $ = (sel) => document.querySelector(sel);
// Cards the player can see on the board: four board slots plus the level's extras.
const visibleCards = () => host.querySelectorAll(".cslot, .eslot").length;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  localStorage.clear();
  for (const [k, v] of Object.entries(NORMAL)) localStorage.setItem(k, v);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("pilot beta difficulty", () => {
  it("offers normal Unlimited's levels before a board starts, Standard by default (not Daily's saved level)", async () => {
    await render();
    expect(host.querySelector("[data-testid=pb-start]")).toBeTruthy();
    expect(host.querySelector(".cslot")).toBeNull(); // no board until a level is chosen
    for (const o of DIFF_OPTIONS) expect(host.querySelector(`[data-testid=pb-diff-${o.key}]`), o.key).toBeTruthy();
    expect(host.querySelector("[data-testid=pb-diff-standard]").getAttribute("aria-checked")).toBe("true");
    expect(readPilotDifficulty()).toBe("standard"); // clover_difficulty "expert" is not borrowed
  });

  it("Hardcore uses Hardcore's card rule (3 extras), Standard uses 1; same board either way", async () => {
    const counts = {};
    for (const level of ["standard", "hardcore"]) {
      for (const k of Object.keys(localStorage)) if (k.startsWith(PILOT_NS) && k !== PILOT_DIFFICULTY_KEY) localStorage.removeItem(k);
      await render();
      await click(host.querySelector(`[data-testid=pb-diff-${level}]`));
      await click(host.querySelector("[data-testid=pb-start-btn]"));
      counts[level] = visibleCards();
      expect(host.querySelector("[data-testid=pb-count]").textContent).toBe(`Board 1 of ${data.boards.length}`);
      expect(host.textContent).toContain(data.boards[0].clues[0]);
      await act(async () => root.unmount()); root = createRoot(host);
    }
    expect(counts.hardcore - counts.standard).toBe(DIFFICULTY_EXTRA.hardcore - DIFFICULTY_EXTRA.standard);
    expect(counts.hardcore).toBe(4 + DIFFICULTY_EXTRA.hardcore);
    expect(JSON.parse(localStorage.getItem(PILOT_DIFFICULTY_KEY))).toBe("hardcore");
    expect(localStorage.getItem("clover_difficulty")).toBe(NORMAL.clover_difficulty);
  });

  it("switching mid-board warns first, restarts the same board on Hardcore, and keeps ratings and results", async () => {
    // Board 1 finished and rated; board 2 in progress from before difficulty existed (Standard).
    const [b1, b2] = data.boards;
    let s = emptyPilotState(id);
    s = finishPilotBoard(s, b1, { won: true, livesUsed: 0, difficulty: "standard" });
    s = ratePilotClue(s, b1.id, 2, "down");
    s = advancePilot(s, data.boards.length);
    writePilotState(s);
    const { slotCards, orientations, extraCards } = b2.solution;
    localStorage.setItem(pilotProgressKey(id, b2.id), JSON.stringify({
      totalSlots: 5, slots: [...slotCards.map((cardId, i) => ({ cardId, orientation: (orientations[i] + 1) % 4 })), { cardId: extraCards[0], orientation: 0 }],
      clues: b2.clues, lives: 2, locked: [], wrong: [], knownBad: [], guessHistory: [],
    }));
    await render();
    // The board resumes as saved (GameView re-saves it on load in its own format).
    const resumed = JSON.parse(localStorage.getItem(pilotProgressKey(id, b2.id)));
    expect(resumed).toMatchObject({ lives: 2, totalSlots: 5, difficulty: "standard" });
    expect(host.querySelector("[data-testid=pb-count]").textContent).toBe(`Board 2 of ${data.boards.length}`);
    expect(visibleCards()).toBe(4 + DIFFICULTY_EXTRA.standard);
    await click(host.querySelector("[data-testid=pb-change-diff]"));
    await click($("[data-testid=pb-diff-hardcore]"));
    // The warning comes before anything is reset.
    expect($("[data-testid=pb-restart-warning]").textContent).toContain("restarts board 2 on Hardcore");
    expect($("[data-testid=pb-restart-warning]").textContent).toContain("not skipped");
    expect(JSON.parse(localStorage.getItem(pilotProgressKey(id, b2.id)))).toEqual(resumed);
    await click($("[data-testid=pb-restart-confirm]"));
    await vi.advanceTimersByTimeAsync(50);
    expect(host.querySelector("[data-testid=pb-count]").textContent).toBe(`Board 2 of ${data.boards.length}`);
    expect(visibleCards()).toBe(4 + DIFFICULTY_EXTRA.hardcore);
    const st = JSON.parse(localStorage.getItem(PILOT_STATE_KEY));
    expect(st.current).toBe(1);
    expect(st.started[b2.id]).toMatchObject({ difficulty: "hardcore", attempt: 2 });
    expect(st.switches).toEqual([expect.objectContaining({ boardId: b2.id, from: "standard", to: "hardcore" })]);
    expect(st.ratings[b1.id]).toEqual({ 2: "down" });
    expect(st.results[b1.id]).toMatchObject({ won: true });
    // Only beta keys changed; normal Unlimited, Daily level and stats are untouched.
    for (const k of Object.keys(NORMAL)) expect(localStorage.getItem(k), k).toBe(NORMAL[k]);
    for (const k of Object.keys(localStorage)) if (!(k in NORMAL)) expect(k.startsWith(PILOT_NS), k).toBe(true);
  });

  it("cancelling the change keeps the attempt exactly as it was", async () => {
    await render();
    await click(host.querySelector("[data-testid=pb-start-btn]"));
    const before = localStorage.getItem(PILOT_STATE_KEY);
    await click(host.querySelector("[data-testid=pb-change-diff]"));
    await click($("[data-testid=pb-diff-hardcore]"));
    const keep = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Keep Standard");
    await click(keep);
    expect(localStorage.getItem(PILOT_STATE_KEY)).toBe(before);
    expect(visibleCards()).toBe(4 + DIFFICULTY_EXTRA.standard);
  });
});
