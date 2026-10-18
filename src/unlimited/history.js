// What the Unlimited guest beta remembers, in this browser only (localStorage):
// which boards were played and how, the game in progress, and the player's
// feedback on clues. Nothing here is sent anywhere; the screens say so.
// Random boards (generate.js) are frozen here at creation (store.boards), so a
// refresh, Continue, the history list and Replay always reuse the exact board.
// Fixed-pool boards (pool.json) are never copied: their ids resolve to the pool.
// Pure functions over a plain store object, so they can be unit-tested.
export const STORE_KEY = "cv_unlimited_v1";
export const RATINGS = [
  { key: "great",     label: "Great clue" },
  { key: "confusing", label: "Confusing" },
  { key: "two_fit",   label: "Two answers fit" },
  { key: "weak",      label: "Weak link" },
];

export const emptyStore = () => ({ version: 1, played: {}, current: null, feedback: [], boards: {} });

/** A record: a plain object, never null or an array. */
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Is this a version-1 store this code can read and safely write back? Every
 * place a record is required must hold one (null and arrays are rejected):
 *   played    record of id → record          (required)
 *   current   null, or a record with a string id
 *   feedback  array of records                (optional: older stores may lack it)
 *   boards    record of id → record with a string id (optional: added with random boards)
 */
export function isValidStore(s) {
  if (!isRecord(s) || s.version !== 1) return false;
  if (!isRecord(s.played) || !Object.values(s.played).every(isRecord)) return false;
  if (s.current !== undefined && s.current !== null && !(isRecord(s.current) && typeof s.current.id === "string")) return false;
  if (s.feedback !== undefined && !(Array.isArray(s.feedback) && s.feedback.every(isRecord))) return false;
  if (s.boards !== undefined && !(isRecord(s.boards) && Object.values(s.boards).every((b) => isRecord(b) && typeof b.id === "string"))) return false;
  return true;
}

export function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (!isValidStore(s)) return emptyStore();
    return { ...emptyStore(), ...s, current: s.current ?? null, feedback: s.feedback ?? [], boards: s.boards ?? {} };
  } catch {
    return emptyStore();
  }
}

/**
 * How this browser's saved Unlimited data looks right now:
 *   "ok"          a readable store (or nothing saved yet: "empty")
 *   "unreadable"  something is saved but it is not a store this version can read
 *                 (damaged, or written by a newer version): never written over
 *   "unavailable" storage cannot be read at all (blocked or turned off)
 */
export function storageStatus() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) return "empty";
    return isValidStore(JSON.parse(raw)) ? "ok" : "unreadable";
  } catch (e) {
    return e instanceof SyntaxError ? "unreadable" : "unavailable";
  }
}

/** What the player is told when Unlimited isn't being saved (shown by UnlimitedView's SaveNotice). */
export const SAVE_HEADLINE = "Progress isn't saving in this browser. Keep this page open to avoid losing this game or your notes.";
export const SAVE_DETAIL = {
  failed: "This browser's storage is full or turned off, so Unlimited can't save right now. Anything already saved here is unchanged and nothing is deleted. If you refresh or leave, this game and any notes on it are lost; use Copy to keep your feedback. We'll try saving again the next time your progress or notes change.",
  unavailable: "This browser isn't letting Unlimited use storage (it may be turned off or blocked), so nothing can be saved. If you refresh or leave, this game and any notes on it are lost; use Copy to keep your feedback.",
  unreadable: "Unlimited games already saved in this browser couldn't be read (they may be damaged or from a newer version of the game), so nothing is saved over them and they stay as they are. New games and notes aren't kept; use Copy to keep your feedback.",
};

/**
 * Saves the store. Returns true only if it was actually written. It never
 * writes over saved data it cannot read (that would erase someone's history),
 * and a failed write (storage full or blocked) leaves what was saved before
 * exactly as it was; the caller keeps playing from memory and tells the player.
 */
export function writeStore(store) {
  const status = storageStatus();
  if (status === "unreadable" || status === "unavailable") return false;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; } catch { return false; }
}

/** The next unplayed board, in batch order (so testers can compare "puzzle 3"); null when every board has been played. */
export function nextBoard(pool, store) {
  return [...pool].sort((x, y) => x.index - y.index).find((b) => !store.played[b.id]) || null;
}

export const playedCount = (pool, store) => pool.filter((b) => store.played[b.id]).length;

/** Every board the player has finished, fixed or random. */
export const playedTotal = (store) => Object.keys(store.played).length;

/**
 * The board behind an id: a fixed-pool board (by id) or this browser's frozen
 * random board. Never re-derived from a seed, so it is exactly what was played.
 */
export function resolveBoard(poolById, store, id) {
  if (!id) return null;
  return poolById.get(id) || store.boards?.[id] || null;
}

/** Pair ids of the last `n` random boards created here (to avoid repeating them next). */
export function recentPairIds(store, n = 3) {
  const recent = Object.values(store.boards || {}).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, n);
  return new Set(recent.flatMap((b) => b.reveal.map((r) => r.pairId)));
}

/** Starts a game. A random board is saved whole the first time; an existing snapshot is never replaced. */
export function startBoard(store, board, difficulty, { replay = false } = {}) {
  const boards = board.kind === "random" && !store.boards?.[board.id] ? { ...(store.boards || {}), [board.id]: board } : (store.boards || {});
  return { ...store, boards, current: { id: board.id, version: board.version, difficulty, replay, startedAt: new Date().toISOString() } };
}

/** Records the end of the current game. A replay never overwrites the first result; it is counted. */
export function finishBoard(store, board, result) {
  const cur = store.current;
  const replay = !!cur?.replay;
  const prev = store.played[board.id];
  const entry = { outcome: result.won ? "won" : "lost", livesUsed: result.livesUsed, difficulty: result.difficulty, finishedAt: new Date().toISOString(), version: board.version };
  const played = { ...store.played };
  if (replay && prev) played[board.id] = { ...prev, replays: (prev.replays || 0) + 1, lastReplay: entry };
  else played[board.id] = { ...entry, replays: 0 };
  return { ...store, played, current: null };
}

/**
 * One rating per clue per puzzle (tapping another rating replaces it; the same
 * one again removes it), and one free-text note per puzzle (position null).
 */
export function rateClue(store, { board, position, rating, difficulty, outcome, livesUsed }) {
  const r = board.reveal[position];
  const rest = store.feedback.filter((f) => !(f.puzzleId === board.id && f.version === board.version && f.position === position));
  const existing = store.feedback.find((f) => f.puzzleId === board.id && f.version === board.version && f.position === position);
  if (existing && existing.rating === rating) return { ...store, feedback: rest };
  return { ...store, feedback: [...rest, { at: new Date().toISOString(), puzzleId: board.id, version: board.version, position, clue: r.clue, pair: `${r.wordA} + ${r.wordB}`, rating, difficulty, outcome, livesUsed }] };
}

export function notePuzzle(store, { board, note, difficulty, outcome, livesUsed }) {
  const rest = store.feedback.filter((f) => !(f.puzzleId === board.id && f.version === board.version && f.position === null));
  const text = String(note || "").trim();
  if (!text) return { ...store, feedback: rest };
  return { ...store, feedback: [...rest, { at: new Date().toISOString(), puzzleId: board.id, version: board.version, position: null, clue: null, pair: null, rating: "note", note: text, difficulty, outcome, livesUsed }] };
}

export const feedbackFor = (store, board) => store.feedback.filter((f) => f.puzzleId === board.id && f.version === board.version);

const ratingLabel = (k) => RATINGS.find((r) => r.key === k)?.label || k;

/** The feedback as readable lines (for Copy). */
export function feedbackText(store) {
  const lines = [`Cluevoyance Unlimited beta feedback — ${store.feedback.length} ${store.feedback.length === 1 ? "note" : "notes"}, exported ${new Date().toISOString()}`,
    "Saved on this device only; nothing was sent automatically.", ""];
  const byPuzzle = new Map();
  for (const f of store.feedback) { const k = `${f.puzzleId} v${f.version}`; if (!byPuzzle.has(k)) byPuzzle.set(k, []); byPuzzle.get(k).push(f); }
  for (const [k, items] of byPuzzle) {
    const first = items[0];
    lines.push(`${k} · ${first.difficulty} · ${first.outcome}${first.outcome === "won" ? ` with ${first.livesUsed} ${first.livesUsed === 1 ? "life" : "lives"} used` : ""}`);
    for (const f of items.sort((x, y) => (x.position ?? 9) - (y.position ?? 9))) {
      lines.push(f.position === null ? `  note: ${f.note}` : `  clue ${f.position + 1} ${f.clue} (${f.pair}): ${ratingLabel(f.rating)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The feedback as JSON (for Download), with the played list and the frozen random boards it refers to. */
export function feedbackJson(store) {
  const ids = new Set([...Object.keys(store.played), ...store.feedback.map((f) => f.puzzleId)]);
  const boards = Object.fromEntries(Object.entries(store.boards || {}).filter(([id]) => ids.has(id)));
  return JSON.stringify({ exportedAt: new Date().toISOString(), storage: "this browser only", played: store.played, feedback: store.feedback, boards }, null, 2);
}
