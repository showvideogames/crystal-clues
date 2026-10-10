import { livesLeftPhrase } from "./format";
import { StreakPanel, StreakStatus } from "./Streaks.jsx";
import { Icon } from "./ui.jsx";

const CRYSTAL_BALL = "/assets/crystal-ball-star.webp";
// A few small sparkles around the ball on a win (position, size, delay).
const SPARKLES = [
  { left:"14%", top:"22%", "--s":"14px", animationDelay:"0s" },
  { left:"80%", top:"14%", "--s":"10px", animationDelay:".5s" },
  { left:"86%", top:"62%", "--s":"16px", animationDelay:"1s" },
  { left:"9%",  top:"70%", "--s":"9px",  animationDelay:"1.4s" },
];

// The solver's results sheet for a finished friend puzzle: shown right after
// the finish, and again from the Results button whenever they come back to it.
//   result: { outcome, lives_used, friendship } (the server's record)
//   justCounted: whether that finish added a Friend Streak day; undefined when reopened later
export function ResultSheet({ result, creator, maxLives, now, justCounted, onMakeBack, onClose, closeLabel = "See the board", onBack }) {
  const won = result.outcome === "won";
  return (
    <div className="fr-done" role="dialog" aria-modal="true" aria-labelledby="fr-done-title">
      <div className={`fr-done-card${won ? " won" : " lost"}`}>
        <div className="fr-done-hero" aria-hidden="true">
          <img className="fr-done-ball" src={CRYSTAL_BALL} alt="" width="118" height="133"/>
          {won && SPARKLES.map((p, i)=><span key={i} className="fr-sparkle" style={p}/>)}
        </div>
        <div className="fr-done-text">
          <h2 className="fr-done-title" id="fr-done-title">{won ? `You read ${creator}'s mind!` : "The veil stayed closed"}</h2>
          <p className="fr-done-sub">
            {won
              ? `Solved ${livesLeftPhrase(result.lives_used, maxLives)}. ${creator} will see your guesses.`
              : `All ${maxLives} lives used — the answer is on the board. ${creator} will see how close you got.`}
          </p>
        </div>
        <StreakPanel friendStreak={result.friendship.daily_streak} solveStreak={result.friendship.team_win_streak} friendName={creator}/>
        <StreakStatus status={result.friendship} now={now} justCounted={justCounted}/>
        <button className="fr-btn primary" onClick={onMakeBack}>
          <span className="fr-btn-ico"><Icon name="pencil"/></span>Make one for {creator}
        </button>
        <div className="fr-row fr-done-links">
          <button className="fr-btn quiet" onClick={onClose}>{closeLabel}</button>
          {onBack && <button className="fr-btn quiet" onClick={onBack}>Back to Friends</button>}
        </div>
      </div>
    </div>
  );
}

// Reopens the sheet. Lives in the screen's top bar or heading.
export function ResultsButton({ onClick }) {
  return (
    <button type="button" className="fr-btn secondary sm fr-results-btn" onClick={onClick}>
      <Icon name="check" size={16}/>Results
    </button>
  );
}
