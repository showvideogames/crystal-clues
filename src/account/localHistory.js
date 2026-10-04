// Browser-side history: the guest's record and the signed-in account's cache.
//
// GUEST (exactly what the game has always kept; untouched until the player
// chooses to sign in):
//   clover_completions   { [puzzleId]: { solved:true, livesUsed, difficulty, solvedAt } }  wins only
//   clover_stats         the counters shown in the Stats overlay
// Not history (left alone in every mode): clover_progress_<id> (a puzzle in
// progress), clover_difficulty, clover_tutorial_seen.
//
// ACCOUNT CACHE (signed in): cv_account_plays = { user_id, plays:[...], unsynced:[...] }
// A mirror of the server's plays rows so archive and stats render at once
// and offline; unsynced holds plays whose record_play call failed and are
// replayed on the next load.
//
// The import decision: "Add my progress" uploads the guest completions and
// then clears the guest keys; "Start fresh" just clears them. Either way the
// browser's history is the account's from then on, so a later sign-in on
// this browser only ever asks about games played as a NEW guest after a
// sign-out. No device record, no server-side flag: clearing IS the record.

export const GUEST_COMPLETIONS_KEY = "clover_completions";
export const GUEST_STATS_KEY = "clover_stats";
export const ACCOUNT_CACHE_KEY = "cv_account_plays";

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // private mode / quota: ignore, as the game always has
  }
};
const remove = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    // ignore
  }
};

// ── Guest ──

export function readGuestCompletions() {
  const v = read(GUEST_COMPLETIONS_KEY, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function readGuestStats() {
  const v = read(GUEST_STATS_KEY, null);
  return v && typeof v === "object" ? v : null;
}

/** Is there anything worth offering to import? */
export function guestHistoryExists() {
  if (Object.keys(readGuestCompletions()).length > 0) return true;
  const stats = readGuestStats();
  return !!(stats && Number(stats.totalPlayed) > 0);
}

/** A summary for the prompt: how many wins would move, how many games the counters know of. */
export function guestHistorySummary() {
  const completions = readGuestCompletions();
  const stats = readGuestStats() || {};
  return {
    wins: Object.values(completions).filter((c) => c && c.solved).length,
    played: Number(stats.totalPlayed) || 0,
    maxStreak: Number(stats.maxStreak) || 0,
  };
}

const DIFFICULTIES = new Set(["easy", "standard", "expert", "hardcore"]);

/**
 * The guest completions as import_plays() elements. Only real wins with a
 * numeric puzzle id are included; nothing is fabricated. Losses exist only
 * as counters in clover_stats and cannot be attributed to a puzzle, so they
 * are not imported (the one piece of guest data the import leaves behind).
 */
export function guestCompletionsToPlays(completions = readGuestCompletions()) {
  const out = [];
  for (const [id, c] of Object.entries(completions)) {
    if (!c || c.solved !== true) continue;
    const puzzleId = Number(id);
    if (!Number.isSafeInteger(puzzleId) || puzzleId <= 0) continue;
    const lives = Math.min(3, Math.max(0, Number(c.livesUsed) || 0));
    const difficulty = DIFFICULTIES.has(c.difficulty) ? c.difficulty : "standard";
    const finished = typeof c.solvedAt === "string" && !Number.isNaN(Date.parse(c.solvedAt)) ? c.solvedAt : null;
    out.push({ puzzle_id: puzzleId, solved: true, lives_used: lives, difficulty, finished_at: finished });
  }
  return out;
}

/** After the import decision, and on sign-out: this browser starts over as a guest. */
export function clearGuestHistory() {
  remove(GUEST_COMPLETIONS_KEY);
  remove(GUEST_STATS_KEY);
}

// ── Account cache ──

export function readAccountCache(userId) {
  const v = read(ACCOUNT_CACHE_KEY, null);
  if (!v || typeof v !== "object" || v.user_id !== userId) return { user_id: userId, plays: [], unsynced: [] };
  return {
    user_id: userId,
    plays: Array.isArray(v.plays) ? v.plays : [],
    unsynced: Array.isArray(v.unsynced) ? v.unsynced : [],
  };
}

export function writeAccountCache(cache) {
  write(ACCOUNT_CACHE_KEY, cache);
}

export function clearAccountCache() {
  remove(ACCOUNT_CACHE_KEY);
}
