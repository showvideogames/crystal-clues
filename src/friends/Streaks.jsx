import { formatDeadline, formatCountdown } from "./format";
import { FRIEND_STREAK_HELP, SOLVE_STREAK_HELP } from "./streakClock";
import { Icon, InfoTip } from "./ui.jsx";

// The two streaks a friendship shares, named the same way everywhere:
//   Friend Streak — 24-hour periods in a row in which either friend finished
//                   at least one friend puzzle (a finished loss counts).
//   Solve Streak  — friend puzzles solved in a row, whoever played them.
//                   A finished loss resets it.
// The numbers and deadlines come from the server (friend_daily_status);
// nothing here calculates a streak.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function StreakPanel({ friendStreak = 0, solveStreak = 0, friendName }) {
  const withWho = friendName ? ` with ${friendName}` : "";
  return (
    <div className="fr-streaks" role="group" aria-label={`Streaks${withWho}`}>
      <div className={`fr-streak${friendStreak ? "" : " zero"}`} role="img" data-streak="friend"
        aria-label={`Friend Streak: ${plural(friendStreak, "day", "days")}. ${FRIEND_STREAK_HELP}`} title={FRIEND_STREAK_HELP}>
        <span className="fr-streak-ico" aria-hidden="true">🔥</span>
        <span className="fr-streak-num" aria-hidden="true">{friendStreak}</span>
        <span className="fr-streak-lbl" aria-hidden="true">Friend Streak</span>
      </div>
      <div className={`fr-streak${solveStreak ? "" : " zero"}`} role="img" data-streak="solve"
        aria-label={`Solve Streak: ${plural(solveStreak, "puzzle", "puzzles")} solved in a row. ${SOLVE_STREAK_HELP}`} title={SOLVE_STREAK_HELP}>
        <span className="fr-streak-ico" aria-hidden="true">⭐</span>
        <span className="fr-streak-num" aria-hidden="true">{solveStreak}</span>
        <span className="fr-streak-lbl" aria-hidden="true">Solve Streak</span>
      </div>
    </div>
  );
}

// The Friend Streak in one short line with its countdown, straight from the
// server's status; the details (exact times, what counts) sit behind ⓘ.
// Two different clocks, never confused:
//   "Next day in …"      this period already counts; playing now is fine
//   "… left to keep it"  nothing finished yet this period
// The timing rules themselves live in the migration; nothing here computes them.
//   status: { daily_streak, deadline_at, done_this_period, next_period_at }
//   justCounted: true/false right after a finish (did it add a day?), else undefined
export function StreakStatus({ status, now, justCounted, center = false }) {
  const cls = `fr-status${center ? " center" : ""}`;
  if(!status || !status.daily_streak || !status.deadline_at){
    return (
      <div className={cls} data-deadline="none">
        <span className="fr-status-ico idle" aria-hidden="true">✦</span>
        <span className="fr-status-line"><b>Finish a puzzle to start a Friend Streak</b></span>
        <InfoTip label="About the Friend Streak">Either of you can finish one, win or lose. {FRIEND_STREAK_HELP}</InfoTip>
      </div>
    );
  }
  const deadline = <time dateTime={status.deadline_at}>{formatDeadline(status.deadline_at, { now })}</time>;
  if(status.done_this_period){
    const headline = justCounted === true ? "Friend Streak +1" : justCounted === false ? "Already kept" : "Streak kept";
    const nextIn = new Date(status.next_period_at).getTime() - now;
    return (
      <div className={`${cls} safe`} data-deadline={status.deadline_at}>
        <span className="fr-status-ico" aria-hidden="true"><Icon name="check" size={14}/></span>
        <span className="fr-status-line">
          <b>{headline}</b>
          <span className="fr-clock" data-clock="next">Next day in <strong className="fr-clock-val fr-countdown">{formatCountdown(nextIn)}</strong></span>
        </span>
        <InfoTip label="About your Friend Streak">
          You can still play now; it just won't add a day yet. A puzzle finished from{" "}
          <time dateTime={status.next_period_at}>{formatDeadline(status.next_period_at, { now })}</time> grows it
          to {status.daily_streak + 1}. It's safe until {deadline}.
        </InfoTip>
      </div>
    );
  }
  const left = new Date(status.deadline_at).getTime() - now;
  return (
    <div className={`${cls}${left < 6*3600e3 ? " urgent" : " due"}`} data-deadline={status.deadline_at}>
      <span className="fr-status-ico" aria-hidden="true"><Icon name="clock" size={14}/></span>
      <span className="fr-status-line">
        <span className="fr-clock" data-clock="keep"><strong className="fr-clock-val fr-countdown">{formatCountdown(left)}</strong> left to keep your streak</span>
      </span>
      <InfoTip label="About your Friend Streak">Finish a puzzle by {deadline}. Either of you, win or lose.</InfoTip>
    </div>
  );
}

export function StreakRules() {
  return (
    <ul className="fr-rules">
      <li><b>🔥 Friend Streak</b> — {FRIEND_STREAK_HELP} You share it with that friend.</li>
      <li>Each period is 24 hours. The clock starts when your streak starts, and the deadline is the same moment for both of you, wherever you are — shown here in your own time.</li>
      <li>Once a puzzle is finished in a period, that period is counted. More puzzles in the same period are welcome, but they don't add a day or carry over. Miss a whole period and it goes back to 0.</li>
      <li><b>⭐ Solve Streak</b> — {SOLVE_STREAK_HELP}</li>
      <li>Making, sending or opening a puzzle doesn't count — only finishing one.</li>
    </ul>
  );
}
