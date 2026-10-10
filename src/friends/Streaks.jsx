import { formatDeadline, formatCountdown } from "./format";
import { FRIEND_STREAK_HELP, SOLVE_STREAK_HELP } from "./streakClock";
import { Icon } from "./ui.jsx";

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

// What the Friend Streak needs now, straight from the server's status, with
// one prominent countdown. Two different clocks, never confused:
//   "Next streak day starts in …"   the period is already counted; playing
//                                   now is fine but adds no day until then
//   "Time left to keep your streak" nothing finished yet this period
// "Kept" only when this period is already counted.
//   status: { daily_streak, deadline_at, done_this_period, next_period_at }
//   justCounted: true/false right after a finish (did it add a day?), else undefined
export function StreakStatus({ status, now, justCounted, center = false }) {
  const cls = `fr-status${center ? " center" : ""}`;
  if(!status || !status.daily_streak || !status.deadline_at){
    return (
      <div className={cls} data-deadline="none">
        <span className="fr-status-ico idle" aria-hidden="true">✦</span>
        <span className="fr-status-text"><b>Finish a puzzle to start a Friend Streak</b>
          <small>Either of you, win or lose.</small></span>
      </div>
    );
  }
  const deadline = <time dateTime={status.deadline_at}>{formatDeadline(status.deadline_at, { now })}</time>;
  if(status.done_this_period){
    // This 24-hour period is already counted; a finish from next_period_at
    // (and before the deadline) adds the next one.
    const headline = justCounted === true ? "Friend Streak +1" : justCounted === false ? "Streak already kept" : "Streak kept";
    const nextIn = new Date(status.next_period_at).getTime() - now;
    return (
      <div className={`${cls} safe`} data-deadline={status.deadline_at}>
        <span className="fr-status-ico" aria-hidden="true"><Icon name="check" size={14}/></span>
        <span className="fr-status-text"><b>{headline}</b>
          <span className="fr-clock" data-clock="next">
            <span className="fr-clock-lbl">Next streak day starts in</span>
            <span className="fr-clock-val fr-countdown">{formatCountdown(nextIn)}</span>
          </span>
          <small>You can still play now. Finishing a puzzle from <time dateTime={status.next_period_at}>{formatDeadline(status.next_period_at, { now })}</time> grows
            it to {status.daily_streak + 1}. It's safe until {deadline}.</small></span>
      </div>
    );
  }
  const left = new Date(status.deadline_at).getTime() - now;
  return (
    <div className={`${cls}${left < 6*3600e3 ? " urgent" : " due"}`} data-deadline={status.deadline_at}>
      <span className="fr-status-ico" aria-hidden="true"><Icon name="clock" size={14}/></span>
      <span className="fr-status-text"><b>Keep your Friend Streak going</b>
        <span className="fr-clock" data-clock="keep">
          <span className="fr-clock-lbl">Time left to keep your streak</span>
          <span className="fr-clock-val fr-countdown">{formatCountdown(left)}</span>
        </span>
        <small>Finish a puzzle by {deadline}. Either of you, win or lose.</small></span>
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
