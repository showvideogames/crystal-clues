// The Random-Pair Pilot Beta keeps to itself: every key it writes starts with
// PILOT_NS, normal Unlimited / Daily / account keys are never touched, nothing
// goes to the network, and missing data never falls back to normal Unlimited.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../../App.jsx";
import { parsePath } from "../../route.js";
import { STORE_KEY } from "../history.js";
import { PILOT } from "./data.js";
import PilotBetaView from "./PilotBetaView.jsx";
import { PILOT_NS, PILOT_STATE_KEY, pilotDataId, pilotProgressKey, emptyPilotState, writePilotState, readPilotState, finishPilotBoard, ratePilotClue, advancePilot, pilotExportJson } from "./storage.js";

// What normal play may have saved: none of it may change.
const NORMAL = {
  [STORE_KEY]: JSON.stringify({ version: 1, played: { x: { outcome: "won" } }, current: null, feedback: [], boards: {} }),
  clover_stats: JSON.stringify({ played: 3, streak: 2 }),
  clover_completions: JSON.stringify({ 42: { solved: true } }),
  clover_progress_42: JSON.stringify({ lives: 2 }),
  clover_difficulty: JSON.stringify("expert"),
  cv_account_plays: JSON.stringify({ user_id: "u", plays: [], unsynced: [] }),
};
const snapshot = () => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
function expectOnlyPilotKeysChanged(before) {
  const after = snapshot();
  for (const [k, v] of Object.entries(before)) if (!k.startsWith(PILOT_NS)) expect(after[k], k).toBe(v);
  for (const k of Object.keys(after)) if (!(k in before)) expect(k.startsWith(PILOT_NS), `new key ${k}`).toBe(true);
}

let root, host, fetchSpy;
const advance = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fetchSpy = vi.fn(() => { throw new Error("Unexpected network request"); });
  vi.stubGlobal("fetch", fetchSpy);
  localStorage.clear();
  for (const [k, v] of Object.entries(NORMAL)) localStorage.setItem(k, v);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("pilot beta storage", () => {
  it("every key is in the pilot namespace and never a normal key", () => {
    const id = pilotDataId(PILOT.data._metadata);
    for (const k of [PILOT_STATE_KEY, pilotProgressKey(id, "pilot-001")]) {
      expect(k.startsWith("cluevoyance:pilot-beta:v1:")).toBe(true);
      expect(Object.keys(NORMAL)).not.toContain(k);
      expect(k.startsWith("clover_") || k.startsWith("cv_")).toBe(false);
    }
  });

  it("a whole run of state changes writes only the pilot namespace", () => {
    const before = snapshot();
    const data = PILOT.data;
    const id = pilotDataId(data._metadata);
    let s = emptyPilotState(id);
    for (const b of data.boards) {
      s = finishPilotBoard(s, b, { won: true, livesUsed: 1, difficulty: "standard" });
      s = ratePilotClue(s, b.id, 0, "up");
      s = advancePilot(s, data.boards.length);
      expect(writePilotState(s)).toBe(true);
    }
    expect(s.current).toBe(data.boards.length);
    expect(advancePilot(s, data.boards.length).current).toBe(data.boards.length); // no looping
    expect(readPilotState(id)).toEqual(s);
    expect(JSON.parse(pilotExportJson(s, data)).boards).toHaveLength(data.boards.length);
    expectOnlyPilotKeysChanged(before);
  });

  it("new pilot data starts a fresh run", () => {
    writePilotState({ ...emptyPilotState("old"), current: 3 });
    expect(readPilotState("new")).toEqual(emptyPilotState("new"));
  });
});

describe("pilot beta screen", () => {
  it("is its own route, separate from /unlimited", () => {
    expect(parsePath("/unlimited-beta")).toEqual({ view: "unlimitedBeta" });
    expect(parsePath("/unlimited")).toEqual({ view: "unlimited" });
  });

  it("never imports normal Unlimited's library, history or screen", () => {
    for (const f of ["PilotBetaView.jsx", "data.js", "storage.js", "pilot.js"]) {
      const src = readFileSync(resolve("src/unlimited/beta", f), "utf8");
      const imports = [...src.matchAll(/(?:from|import\s*\(?)\s*["']([^"']+)["']/g)].map((m) => m[1]);
      imports.forEach((spec) => expect(spec, f).not.toMatch(/random-library\.json|pool\.json|history\.js|UnlimitedView/));
    }
  });

  it("missing data says so and shows no board", async () => {
    await act(async () => root.render(createElement(PilotBetaView, { kit: { GameView }, onHome: () => {}, pilot: { data: null, problem: "missing" } })));
    expect(host.querySelector("[data-testid=pb-missing]")).toBeTruthy();
    expect(host.querySelector(".cslot")).toBeNull();
    expect(host.textContent).toContain("Random-Pair Pilot Beta — test boards, not normal Unlimited");
  });

  it("plays board 1 to a win, then board 2, writing only pilot keys and nothing to the network", async () => {
    const before = snapshot();
    const data = PILOT.data;
    const id = pilotDataId(data._metadata);
    const b1 = data.boards[0];
    // Board 1 already arranged as solved (standard: four slot cards and one extra).
    const { slotCards, orientations, extraCards } = b1.solution;
    localStorage.setItem(pilotProgressKey(id, b1.id), JSON.stringify({
      totalSlots: 5, slots: [...slotCards.map((cardId, i) => ({ cardId, orientation: orientations[i] })), { cardId: extraCards[0], orientation: 0 }],
      clues: b1.clues, lives: 3, locked: [], wrong: [], knownBad: [], guessHistory: [],
    }));
    await act(async () => root.render(createElement(PilotBetaView, { kit: { GameView }, onHome: () => {} })));
    expect(host.textContent).toContain("Random-Pair Pilot Beta — test boards, not normal Unlimited");
    expect(host.querySelector("[data-testid=pb-count]").textContent).toBe(`Board 1 of ${data.boards.length}`);
    expect(!!host.querySelector("[data-testid=pb-placeholder]")).toBe(!!data._metadata.placeholder);
    await act(async () => button("Submit").click());
    await advance(8000);
    const st = JSON.parse(localStorage.getItem(PILOT_STATE_KEY));
    expect(st.results[b1.id]).toMatchObject({ won: true, index: 1 });
    expect(localStorage.getItem(pilotProgressKey(id, b1.id))).toBeNull();
    // The reveal shows both links for each clue; rate one.
    await act(async () => host.querySelector("[data-testid=pb-why]").click());
    expect(document.querySelectorAll("[data-testid=pb-why-item]")).toHaveLength(4);
    expect(document.body.textContent).toContain(b1.reveal[0].wordAConnection);
    await act(async () => document.querySelector("[aria-label='Good clue']").click());
    expect(JSON.parse(localStorage.getItem(PILOT_STATE_KEY)).ratings[b1.id]).toEqual({ 0: "up" });
    await act(async () => document.querySelector("[data-testid=pb-why-next]").click());
    await advance(100);
    expect(host.querySelector("[data-testid=pb-count]").textContent).toBe(`Board 2 of ${data.boards.length}`);
    expect(fetchSpy).not.toHaveBeenCalled();
    expectOnlyPilotKeysChanged(before);
  });

  it("after the last board: Pilot complete, no looping", async () => {
    const data = PILOT.data;
    writePilotState({ ...emptyPilotState(pilotDataId(data._metadata)), current: data.boards.length });
    await act(async () => root.render(createElement(PilotBetaView, { kit: { GameView }, onHome: () => {} })));
    expect(host.textContent).toContain(`Pilot complete — ${data.boards.length} boards`);
    expect(host.querySelector(".cslot")).toBeNull();
    expect(button("Export ratings (JSON)")).toBeTruthy();
  });
});
