// Where App.jsx's four history functions (loadStats, loadCompletions,
// updateStats, saveCompletion) get their answer from:
//
//   guest      the game's own localStorage code, passed in unchanged
//   signed in  the account's plays (cache mirror of the server), derived into
//              the same shapes, and every finish recorded through record_play
//
// App.jsx keeps its guest functions exactly as they were and routes through
// these; a guest never reaches the account branch.

import { getCurrentAccount } from "./platformSignIn";
import { readAccountCache } from "./localHistory";
import { deriveCompletions, deriveStats, recordPlay } from "./plays";

function accountPlays() {
  const account = getCurrentAccount();
  return account ? { account, plays: readAccountCache(account.user_id).plays } : null;
}

export function loadStatsFor(guestLoad) {
  const a = accountPlays();
  return a ? deriveStats(a.plays) : guestLoad();
}

export function loadCompletionsFor(guestLoad) {
  const a = accountPlays();
  return a ? deriveCompletions(a.plays) : guestLoad();
}

/**
 * A puzzle was finished. Guest: the counters update as always. Account: the
 * play is recorded (cache first, then the server, retried later on failure)
 * and the stats are re-derived.
 */
export function recordFinishFor({ won, livesUsed, difficulty, puzzle }, guestUpdate) {
  const a = accountPlays();
  if (!a) return guestUpdate();
  const id = Number(puzzle?.id);
  if (Number.isSafeInteger(id) && id > 0) {
    recordPlay(a.account.user_id, {
      puzzleId: id,
      puzzleDate: puzzle.date || null,
      solved: !!won,
      livesUsed,
      difficulty,
    }).catch(() => {});
  }
  return deriveStats(readAccountCache(a.account.user_id).plays);
}

/** Guest: write clover_completions as always. Account: recordFinishFor already recorded the win. */
export function saveCompletionFor(guestSave) {
  if (getCurrentAccount()) return;
  guestSave();
}
