// A finished official puzzle (today's or an archive one), as the player can
// come back to it: which screen it opens on, the board it ended on, the share
// text, and the rows of the "Lives used" charts.
//
// Storage (this browser):
//   clover_progress_<id>   a puzzle in progress (App.jsx GameView writes it)
//   clover_final_<who>_<id>  the round a player's FIRST attempt finished with:
//                          { owner, difficulty, solved, livesUsed, slots, clues, guessHistory, finishedAt }
//                          <who> is the signed-in account's id, or "guest". One per
//                          player, so on a shared browser one player's guesses are
//                          never shown or shared as another's.
//   clover_final_<id>      the same, from before <who> was added (2026-10-13).
// Whose a saved round is must be KNOWN, not guessed from a matching result:
//   an account   its own key; only that account's first finish writes it
//   a guest      a round saved in the same call as the guest's completion,
//                so both carry the identical finishedAt (the guest
//                completion is cleared on every sign-in and sign-out)
// Anything else (an old-key round for an account, a guest round from another
// finish) is not shown or shared: the summary line stands in.
// The guesses exist only in the browser the puzzle was finished in: the
// account's server record (plays) holds the result, not the guesses.
// The result itself (won or not, lives used, difficulty) is the completion
// record (clover_completions, or the account's plays), so it's the same on
// every device; the final board is a nicety for this browser, and the screens
// fall back to the answer laid out at the right difficulty without it.
import { DIFFICULTY_EXTRA, MAX_LIVES } from "./shared.js";
import { dailyName } from "./dailyNumber.js";

const read = (k, fallback = null) => {
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
    // private mode / quota: the result still stands, only the exact board is lost
  }
};

export const progressKey = (id) => `clover_progress_${id}`;
export const finalKey = (id, who) => (who ? `clover_final_${who}_${id}` : `clover_final_${id}`);

const DIFFICULTIES = Object.keys(DIFFICULTY_EXTRA);
const BY_SLOTS = Object.fromEntries(DIFFICULTIES.map((d) => [4 + DIFFICULTY_EXTRA[d], d]));
export const isDifficulty = (d) => DIFFICULTIES.includes(d);

/** A saved game in progress, or null when there's none worth resuming. */
export function readProgress(id) {
  const p = read(progressKey(id));
  if (!p || typeof p !== "object" || p.solved || p.lost) return null;
  if (!Array.isArray(p.slots) || !Array.isArray(p.clues) || !BY_SLOTS[p.totalSlots]) return null;
  return p;
}

/** The difficulty a saved game was being played at (older saves only knew their card count). */
export function progressDifficulty(p) {
  if (!p) return null;
  if (isDifficulty(p.difficulty) && 4 + DIFFICULTY_EXTRA[p.difficulty] === p.totalSlots) return p.difficulty;
  return BY_SLOTS[p.totalSlots] || null;
}

/** How many lives a game in progress has used so far. */
export function progressLivesUsed(p) {
  const lives = Number(p?.lives);
  return p && Number.isFinite(lives) ? Math.min(MAX_LIVES, Math.max(0, MAX_LIVES - lives)) : 0;
}

/**
 * Does a saved round belong to this result? Same outcome, difficulty and lives,
 * and the guesses add up: every wrong guess costs a life, so a win took
 * livesUsed + 1 guesses (the last all right) and a loss took MAX_LIVES.
 */
export function finalMatches(f, record) {
  if (!f || !record || !Array.isArray(f.guessHistory)) return false;
  const used = Number(record.livesUsed) || 0;
  if (!!f.solved !== !!record.solved || Number(f.livesUsed) !== used) return false;
  if (isDifficulty(record.difficulty) && f.difficulty !== record.difficulty) return false;
  const g = f.guessHistory;
  if (g.length !== (record.solved ? used + 1 : MAX_LIVES)) return false;
  const right = (row) => Array.isArray(row) && row.flat().length === 4 && row.flat().every((c) => c === "🔮");
  return record.solved ? right(g[g.length - 1]) : !right(g[g.length - 1]);
}

/**
 * The round this player finished this puzzle with, when this browser kept it
 * AND it is provably theirs (see the storage notes above); otherwise null.
 *   who     the signed-in account's id, or null for a guest
 *   record  the result being shown (a guest's carries its finishedAt)
 */
export function readFinal(id, who, record) {
  if (!record) return null;
  const ok = (f) => f && typeof f === "object" && Array.isArray(f.slots) && finalMatches(f, record);
  if (who) {
    const own = read(finalKey(id, who));
    return ok(own) && own.owner === who ? own : null;
  }
  // A guest: the round saved together with this very completion, under either key.
  const at = record.finishedAt;
  if (!at) return null;
  for (const f of [read(finalKey(id, "guest")), read(finalKey(id))]) {
    if (ok(f) && (f.owner ?? "guest") === "guest" && f.finishedAt === at) return f;
  }
  return null;
}

/** Saves the round a player's first attempt finished with (recordFirstFinish only calls this once per player). */
export function writeFinal(id, who, data) {
  write(finalKey(id, who || "guest"), { ...data, owner: who || "guest" });
}

/**
 * Which screen a puzzle opens on:
 *   review  it's finished: the board as it ended, with the result one tap away
 *   play    a game in progress (resumed at its own difficulty), or an archive puzzle
 *   setup   today's puzzle, not started: choose a difficulty, then Start
 */
export function initialMode({ record, progress, daily, preference }) {
  if (record) return { mode: "review", difficulty: isDifficulty(record.difficulty) ? record.difficulty : "standard" };
  const resumed = progressDifficulty(progress);
  if (resumed) return { mode: "play", difficulty: resumed };
  return { mode: daily ? "setup" : "play", difficulty: preference };
}

/** The board a finished puzzle is shown with: as it ended here, else the answer with the round's own cards. */
export function reviewBoard(puzzle, record, final) {
  const difficulty = isDifficulty(record?.difficulty) ? record.difficulty : "standard";
  const extras = (puzzle.solution.extraCards
    || Object.keys(puzzle.cards).filter((id) => !puzzle.solution.slotCards.includes(id)).slice(0, 3))
    .slice(0, DIFFICULTY_EXTRA[difficulty]);
  const total = 4 + extras.length;
  const lives = record?.solved ? Math.max(1, MAX_LIVES - (Number(record.livesUsed) || 0)) : 0;
  const okFinal = final && final.slots.length === total && Array.isArray(final.clues) && final.clues.length === 4
    && final.slots.every((s) => s && puzzle.cards[s.cardId]);
  return {
    difficulty,
    lives,
    slots: okFinal ? final.slots.map((s) => ({ cardId: s.cardId, orientation: s.orientation }))
      : [...puzzle.solution.slotCards.map((cardId, i) => ({ cardId, orientation: puzzle.solution.orientations[i] })),
         ...extras.map((cardId) => ({ cardId, orientation: 0 }))],
    clues: okFinal ? [...final.clues] : [...puzzle.clues],
    guessHistory: okFinal && Array.isArray(final.guessHistory) ? final.guessHistory : [],
  };
}

/** The headline and the line under it, from the result alone. */
export function resultWords(record){
  const used = Number(record.livesUsed) || 0;
  if(!record.solved) return { headline:"Not this time", line:`All ${MAX_LIVES} lives used` };
  if(used === 0) return { headline:"Brilliant!", line:"Solved with no lives lost" };
  if(used === 1) return { headline:"Well read!", line:"Solved with 1 life lost" };
  return { headline:"Just in time!", line:`Solved with ${`${used} ${used === 1 ? "life" : "lives"}`} lost` };
}

// Difficulty in a shared result: Easy none, then one sparkle per extra card.
const SPARKLES = { easy: "", standard: "✨", expert: "✨✨", hardcore: "✨✨✨" };

/**
 * The text "Share results" copies:
 *   Daily #12 ✨✨✨
 *   🔮⚫ 🔮⚫ 🔮🔮      one 2×2 block per guess (🔮 = a card that was right)
 *   ⚫⚫ ⚫🔮 🔮🔮
 *   Cluevoyance.com
 * The name is the puzzle's daily number from its date (dailyNumber.js, the
 * same helper the results use); before the start date, the date itself.
 * Without the guesses (finished on another device, or before this was kept)
 * a short result line takes their place.
 */
export function shareText(record, guessHistory = [], date = null) {
  const difficulty = isDifficulty(record.difficulty) ? record.difficulty : "standard";
  const name = dailyName(date);
  const head = SPARKLES[difficulty] ? `${name} ${SPARKLES[difficulty]}` : name;
  let body;
  if (guessHistory.length) {
    const top = guessHistory.map((rows) => `${rows[0][0]}${rows[0][1]}`).join(" ");
    const bottom = guessHistory.map((rows) => `${rows[1][0]}${rows[1][1]}`).join(" ");
    body = `${top}
${bottom}`;
  } else {
    const used = Number(record.livesUsed) || 0;
    body = !record.solved ? "Not solved"
      : used === 0 ? "Solved with no lives lost" : `Solved with ${used} ${used === 1 ? "life" : "lives"} lost`;
  }
  return `${head}
${body}
Cluevoyance.com`;
}

/** Rows of a "Lives used" chart, from the personal counters ({0,1,2,X}) or the puzzle summary. */
export function livesRows(source) {
  const s = source || {};
  const n = (v) => Math.max(0, Number(v) || 0);
  return [
    { key: "0", label: "0", count: n(s["0"] ?? s.lives_0) },
    { key: "1", label: "1", count: n(s["1"] ?? s.lives_1) },
    { key: "2", label: "2", count: n(s["2"] ?? s.lives_2) },
    { key: "X", label: "Not solved", count: n(s.X ?? s.not_solved) },
  ];
}

/** The row a result belongs in. */
export const resultRowKey = (record) => (!record ? null : record.solved ? String(Math.min(2, Math.max(0, Number(record.livesUsed) || 0))) : "X");

export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
