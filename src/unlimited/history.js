// What the Unlimited guest beta remembers, in this browser only (localStorage):
// which boards were played and how, the game in progress, and the player's
// feedback on clues. Nothing here is sent anywhere; the screens say so.
// Pure functions over a plain store object, so they can be unit-tested.
export const STORE_KEY = "cv_unlimited_v1";
export const RATINGS = [
  { key: "great",     label: "Great clue" },
  { key: "confusing", label: "Confusing" },
  { key: "two_fit",   label: "Two answers fit" },
  { key: "weak",      label: "Weak link" },
];

export const emptyStore = () => ({ version: 1, played: {}, current: null, feedback: [] });

export function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (!s || s.version !== 1 || typeof s.played !== "object") return emptyStore();
    return { ...emptyStore(), ...s, feedback: Array.isArray(s.feedback) ? s.feedback : [] };
  } catch {
    return emptyStore();
  }
}

export function writeStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode or quota: the game still plays */ }
  return store;
}

/** The next unplayed board, in batch order (so testers can compare "puzzle 3"); null when every board has been played. */
export function nextBoard(pool, store) {
  return [...pool].sort((x, y) => x.index - y.index).find((b) => !store.played[b.id]) || null;
}

export const playedCount = (pool, store) => pool.filter((b) => store.played[b.id]).length;

export function startBoard(store, board, difficulty, { replay = false } = {}) {
  return { ...store, current: { id: board.id, version: board.version, difficulty, replay, startedAt: new Date().toISOString() } };
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

/** The feedback as JSON (for Download), with the played list for context. */
export function feedbackJson(store) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), storage: "this browser only", played: store.played, feedback: store.feedback }, null, 2);
}
