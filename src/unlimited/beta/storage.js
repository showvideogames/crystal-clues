// What the Random-Pair Pilot Beta remembers, in this browser only. Every key
// it reads or writes starts with PILOT_NS; it never touches normal Unlimited
// (cv_unlimited_v1), Daily (clover_*), account caches or any server.
// Pure functions over a plain state object, plus two tiny storage helpers.
export const PILOT_NS = "cluevoyance:pilot-beta:v1:";
export const PILOT_STATE_KEY = `${PILOT_NS}state`;

/** Identifies one built board list: new pilot data starts a fresh run. */
export const pilotDataId = (meta) => `${(meta?.pilotLibraryContentHash || "none").slice(0, 16)}-${meta?.seed ?? 0}-${meta?.boardCount ?? 0}`;

/** Where GameView keeps an unfinished pilot board (instead of clover_progress_<id>). */
export const pilotProgressKey = (dataId, boardId) => `${PILOT_NS}progress:${dataId}:${boardId}`;

/** Forgets a pilot board's saved arrangement once it is done with. */
export function clearPilotProgress(dataId, boardId, storage = globalThis.localStorage) {
  try { storage.removeItem(pilotProgressKey(dataId, boardId)); } catch { /* storage off: nothing to clear */ }
}

export const emptyPilotState = (dataId) => ({ version: 1, dataId, current: 0, results: {}, ratings: {} });

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function readPilotState(dataId, storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(PILOT_STATE_KEY));
    if (!isRecord(s) || s.version !== 1 || s.dataId !== dataId || !Number.isInteger(s.current) || s.current < 0
      || !isRecord(s.results) || !isRecord(s.ratings)) return emptyPilotState(dataId);
    return s;
  } catch {
    return emptyPilotState(dataId);
  }
}

/** Saves the state; false if this browser would not keep it (play goes on from memory). */
export function writePilotState(state, storage = globalThis.localStorage) {
  try { storage.setItem(PILOT_STATE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const finishPilotBoard = (s, board, result) => ({
  ...s,
  results: { ...s.results, [board.id]: { index: board.index, won: !!result.won, livesUsed: result.livesUsed ?? null, difficulty: result.difficulty || null, finishedAt: new Date().toISOString() } },
});

/** Moves on to the next board; never past the end (current === total means complete). */
export const advancePilot = (s, total) => ({ ...s, current: Math.min(s.current + 1, total) });

/** 👍 / 👎 for one clue; tapping the same rating again clears it. */
export function ratePilotClue(s, boardId, position, rating) {
  const mine = { ...(s.ratings[boardId] || {}) };
  if (mine[position] === rating) delete mine[position]; else mine[position] = rating;
  return { ...s, ratings: { ...s.ratings, [boardId]: mine } };
}

/** Everything this browser holds for the pilot, as a downloadable JSON string. */
export function pilotExportJson(state, data, now = new Date().toISOString()) {
  const m = data._metadata || {};
  return JSON.stringify({
    kind: "cluevoyance-pilot-beta-ratings",
    exportedAt: now,
    pilot: { placeholder: !!m.placeholder, seed: m.seed, generatorVersion: m.generatorVersion, builderVersion: m.builderVersion, pilotLibraryContentHash: m.pilotLibraryContentHash, boardCount: m.boardCount, dataId: state.dataId },
    boards: data.boards.map((b) => ({
      id: b.id, index: b.index, result: state.results[b.id] || null,
      clues: b.reveal.map((r) => ({ position: r.position, pairId: r.pairId, clue: r.clue, wordA: r.wordA, wordB: r.wordB, rating: state.ratings[b.id]?.[r.position] || null })),
    })),
    difficultySwitches: state.switches || [],
  }, null, 2);
}

// ---- Difficulty (the same four levels and rules as normal Unlimited) ----------
// Normal Unlimited asks for the difficulty before a board starts and never changes
// it mid-board. The pilot does the same: each board records the difficulty it was
// started on, and switching an unfinished board starts a fresh attempt of the SAME
// board (same cards and clues) on the new level. Results and ratings are untouched.
// The beta's preferred level is remembered under its own key, never clover_difficulty.
export const PILOT_DIFFICULTY_KEY = `${PILOT_NS}difficulty`;
const LEVELS = ["easy", "standard", "expert", "hardcore"];
export const isPilotDifficulty = (d) => LEVELS.includes(d);

export function readPilotDifficulty(storage = globalThis.localStorage) {
  try { const d = JSON.parse(storage.getItem(PILOT_DIFFICULTY_KEY)); return isPilotDifficulty(d) ? d : "standard"; }
  catch { return "standard"; }
}
export function writePilotDifficulty(d, storage = globalThis.localStorage) {
  if (!isPilotDifficulty(d)) return false;
  try { storage.setItem(PILOT_DIFFICULTY_KEY, JSON.stringify(d)); return true; } catch { return false; }
}

/** The level an unfinished board is being played on, or null if it hasn't started. */
export function pilotBoardStart(s, dataId, boardId, storage = globalThis.localStorage) {
  const started = s.started?.[boardId];
  if (started && isPilotDifficulty(started.difficulty)) return started;
  // Boards begun before difficulty was offered were all Standard; their saved
  // arrangement says so (or says nothing, which meant Standard).
  try {
    const p = JSON.parse(storage.getItem(pilotProgressKey(dataId, boardId)));
    if (p && typeof p === "object") return { difficulty: isPilotDifficulty(p.difficulty) ? p.difficulty : "standard", attempt: 1, legacy: true };
  } catch { /* unreadable progress: treat as not started */ }
  return null;
}

/** Starts (or, if already started, restarts as a fresh attempt) a board on a level. */
export function startPilotBoard(s, boardId, difficulty, prev = null, now = new Date().toISOString()) {
  const attempt = (prev?.attempt || 0) + 1;
  const switches = prev ? [...(s.switches || []), { boardId, from: prev.difficulty, to: difficulty, at: now }] : (s.switches || []);
  return { ...s, started: { ...(s.started || {}), [boardId]: { difficulty, attempt, startedAt: now } }, switches };
}
