// A signed-in player's history: the server's `plays` rows, mirrored in the
// account cache, and the stats/completions the game derives from them.
//
// Nothing is stored twice: the Stats overlay and the archive calendar are
// computed from plays with the same shapes the guest code already uses
// (normalizeStats / clover_completions), so App.jsx renders either source
// through one path.

import { supabase } from "./supabaseClient";
import {
  clearGuestHistory,
  guestCompletionsToPlays,
  guestLossCount,
  readAccountCache,
  writeAccountCache,
} from "./localHistory";
import { refreshAccount } from "./platformSignIn";

const pad2 = (n) => String(n).padStart(2, "0");
export const localISODate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  return localISODate(dt);
}

const EMPTY_STATS = () => ({
  currentStreak: 0,
  maxStreak: 0,
  lastSolvedDate: null,
  totalPlayed: 0,
  totalWon: 0,
  livesUsedDist: { 0: 0, 1: 0, 2: 0, X: 0 },
  difficultyWins: { easy: 0, standard: 0, expert: 0, hardcore: 0 },
});

/**
 * Stats in the exact shape of the guest counters (DEFAULT_STATS / normalizeStats
 * in App.jsx), derived from plays:
 *   totalPlayed   every finished puzzle (win or loss), plus imported guest losses
 *   totalWon      solved rows
 *   livesUsedDist wins by lives used (capped at 2, as the overlay shows), X = losses
 *   difficultyWins solved rows by difficulty
 *   streak        consecutive puzzle DATES with a win. The current streak is
 *                 the run ending today or yesterday (the guest rule, keyed on
 *                 the puzzle's date rather than the day it was solved, so a
 *                 phone and a laptop agree).
 */
export function deriveStats(plays, today = localISODate(), extras = {}) {
  const stats = EMPTY_STATS();
  // Guest losses that came over with "Add my progress": a count, shown where
  // the guest saw it (Played, Win %, the X bar).
  const importedLosses = Math.max(0, Number(extras.importedLosses) || 0);
  stats.totalPlayed += importedLosses;
  stats.livesUsedDist.X += importedLosses;
  const solvedDates = new Set();
  for (const p of plays || []) {
    stats.totalPlayed += 1;
    if (p.solved) {
      stats.totalWon += 1;
      const key = String(Math.min(2, Math.max(0, Number(p.lives_used) || 0)));
      stats.livesUsedDist[key] += 1;
      if (stats.difficultyWins[p.difficulty] !== undefined) stats.difficultyWins[p.difficulty] += 1;
      if (p.puzzle_date) solvedDates.add(p.puzzle_date);
    } else {
      stats.livesUsedDist.X += 1;
    }
  }
  const dates = [...solvedDates].sort();
  stats.lastSolvedDate = dates.length ? dates[dates.length - 1] : null;

  // longest run of consecutive dates
  let run = 0;
  let prev = null;
  for (const d of dates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > stats.maxStreak) stats.maxStreak = run;
    prev = d;
  }
  // current run: must end today or yesterday
  const end = solvedDates.has(today) ? today : solvedDates.has(addDays(today, -1)) ? addDays(today, -1) : null;
  if (end) {
    let cur = 0;
    let d = end;
    while (solvedDates.has(d)) {
      cur += 1;
      d = addDays(d, -1);
    }
    stats.currentStreak = cur;
  }
  return stats;
}

/** Completions in the guest shape ({ [puzzleId]: { solved, livesUsed, difficulty, solvedAt } }), wins only. */
export function deriveCompletions(plays) {
  const out = {};
  for (const p of plays || []) {
    if (!p.solved) continue;
    out[String(p.puzzle_id)] = {
      solved: true,
      livesUsed: Number(p.lives_used) || 0,
      difficulty: p.difficulty,
      solvedAt: p.finished_at,
    };
  }
  return out;
}

// ── Server + cache ──

function rpcOutcome(res) {
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return row?.outcome ?? null;
}

/** Load the account's plays from the server; falls back to the cache when the server is unreachable. */
export async function loadPlays(userId) {
  const cache = readAccountCache(userId);
  if (!supabase) return { plays: cache.plays, fromCache: true };
  const { data, error } = await supabase.from("plays").select("*").eq("user_id", userId);
  if (error) return { plays: cache.plays, fromCache: true };
  writeAccountCache({ ...cache, plays: data || [] });
  return { plays: data || [], fromCache: false };
}

/** Merge one play into the cached list (same no-downgrade rule as the server). */
function mergeIntoCache(cache, play) {
  const i = cache.plays.findIndex((p) => String(p.puzzle_id) === String(play.puzzle_id));
  if (i < 0) cache.plays.push(play);
  else if (!cache.plays[i].solved) cache.plays[i] = play;
}

/**
 * Record a finished puzzle for the signed-in account. The cache is updated
 * first so the UI never waits on the network; a failed server call leaves
 * the play in `unsynced` for the next load. Returns the server outcome, or
 * 'unsynced' when the call failed.
 */
export async function recordPlay(userId, { puzzleId, puzzleDate, solved, livesUsed, difficulty }) {
  const play = {
    user_id: userId,
    puzzle_id: Number(puzzleId),
    puzzle_date: puzzleDate || null,
    solved: !!solved,
    lives_used: Math.min(3, Math.max(0, Number(livesUsed) || 0)),
    difficulty,
    finished_at: new Date().toISOString(),
    source: "play",
  };
  const cache = readAccountCache(userId);
  mergeIntoCache(cache, play);
  writeAccountCache(cache);

  const outcome = await sendPlay(play);
  if (outcome !== "ok") {
    const c = readAccountCache(userId);
    c.unsynced = c.unsynced.filter((u) => String(u.puzzle_id) !== String(play.puzzle_id)).concat([play]);
    writeAccountCache(c);
    return outcome === null ? "unsynced" : outcome;
  }
  return "ok";
}

/** null = network/transport failure (retry later); otherwise the server's outcome string. */
async function sendPlay(play) {
  if (!supabase) return null;
  try {
    const res = await supabase.rpc("record_play", {
      _puzzle_id: play.puzzle_id,
      _solved: play.solved,
      _lives_used: play.lives_used,
      _difficulty: play.difficulty,
    });
    if (res.error) return null;
    return rpcOutcome(res);
  } catch {
    return null;
  }
}

/** Replay plays that could not be sent earlier. Keeps the ones that still fail. */
export async function flushUnsynced(userId) {
  const cache = readAccountCache(userId);
  if (!cache.unsynced.length) return 0;
  const still = [];
  let sent = 0;
  for (const play of cache.unsynced) {
    const outcome = await sendPlay(play);
    if (outcome === null) still.push(play);
    else sent += 1; // 'ok', or a definitive refusal (unknown_puzzle/invalid) that retrying cannot fix
  }
  writeAccountCache({ ...readAccountCache(userId), unsynced: still });
  return sent;
}

/**
 * "Add my progress": upload this browser's guest wins and its loss count to
 * the account, then clear the guest keys. Repeating a sign-in cannot import
 * twice: the keys are gone (so the loss count is sent once), and the server
 * never overwrites a solved row anyway.
 */
export async function importGuestHistory(userId) {
  if (!supabase) return { ok: false, message: "Not configured." };
  const elements = guestCompletionsToPlays();
  const losses = guestLossCount();
  if (elements.length === 0 && losses === 0) {
    clearGuestHistory();
    return { ok: true, imported: 0, skipped: 0, losses: 0 };
  }
  const res = await supabase.rpc("import_plays", { _plays: elements, _losses: losses });
  if (res.error) return { ok: false, message: res.error.message };
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  if (row?.outcome !== "ok") return { ok: false, message: `Import refused: ${row?.outcome ?? "unknown"}` };
  clearGuestHistory();
  await loadPlays(userId);
  if (losses > 0) await refreshAccount().catch(() => null);
  return { ok: true, imported: row.imported, skipped: row.skipped, losses };
}

/** "Start fresh": keep the account clean; this browser starts over. */
export function startFresh() {
  clearGuestHistory();
}
