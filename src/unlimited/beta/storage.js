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
  }, null, 2);
}
