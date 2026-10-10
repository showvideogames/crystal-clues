import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import { livesLeftPhrase, timeAgo } from "./format";
import { DIFFICULTY_LABELS } from "../game/shared";
import { StreakPanel, StreakStatus } from "./Streaks.jsx";
import { Icon, PageHead } from "./ui.jsx";
import { useServerNow } from "./streakClock";
import { friendPuzzleForGame } from "./puzzle";
import GuessReplay from "./GuessReplay.jsx";
import { ResultSheet, ResultsButton } from "./ResultSheet.jsx";

// One sent puzzle, after the fact. The creator sees how the friend did and
// replays their real guesses; the solver can look back at their own. Before
// the puzzle is finished the creator sees only its status and their board —
// the server doesn't hand out guesses until then.

export default function FriendResult({ kit, puzzleId, onBack, onMake, onPlay }) {
  const { GameView } = kit;
  const [view,setView] = useState(null);
  const [error,setError] = useState("");
  const [showSheet,setShowSheet] = useState(false);
  const serverNow = useServerNow(view?.friendship?.server_now);

  const load = useCallback(async ()=>{
    try { setView(await api.open(puzzleId)); setError(""); }
    catch(err){ setError(err.message); }
  },[puzzleId]);
  useEffect(()=>{
    const t = setTimeout(load, 0);
    return ()=>clearTimeout(t);
  },[load]);

  // A solver who opens an unfinished puzzle from here goes to the board.
  const shouldPlay = view && view.role === "solver" && !view.finished_at;
  useEffect(()=>{ if(shouldPlay) onPlay(puzzleId); },[shouldPlay, puzzleId, onPlay]);

  if(error){
    return <div className="fr-wrap"><div className="fr-page">
      <div className="fr-msg err">{error}</div>
      <button className="fr-btn secondary" onClick={onBack}>Back to Friends</button>
    </div></div>;
  }
  if(!view || shouldPlay) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub">Opening…</p></div></div>;

  const mine = view.role === "creator";
  const friendName = mine ? view.solver_name : view.creator_name;
  const friend = { friendship_id:view.friendship_id, friend_name:friendName };

  if(!view.finished_at){
    return (
      <div className="fr-game-shell">
        <div className="fr-playbar">
          <button type="button" className="fr-back" onClick={onBack}><Icon name="back" size={18}/>Friends</button>
          <span className="grow"/>
          <span className="fr-chip">Your puzzle for {friendName}</span>
        </div>
        <div className="fr-page" style={{paddingBottom:0}}>
          <div className="fr-msg ok" style={{textAlign:"center"}}>
            {view.difficulty
              ? `${friendName} is playing it on ${DIFFICULTY_LABELS[view.difficulty]}.`
              : `Sent ${timeAgo(view.sent_at)} — ${friendName} hasn't started yet and will choose a difficulty first.`}
            {" "}You'll see every guess once they finish.
          </div>
        </div>
        {/* The whole puzzle as authored: four answer cards and all three bonus cards. */}
        <GameView key={`mine-${view.id}`} puzzle={friendPuzzleForGame(view, { whole:true })} difficulty="hardcore" admireMode sandbox/>
      </div>
    );
  }

  const won = view.outcome === "won";
  const played = DIFFICULTY_LABELS[view.difficulty];
  const sub = `${view.title ? `“${view.title}” · ` : ""}${mine ? `Your puzzle · ${friendName} played on ${played}` : `${friendName}'s puzzle · you played on ${played}`}`;
  const outcome = mine
    ? (won ? `${friendName} solved it ${livesLeftPhrase(view.lives_used, view.max_lives)}` : `${friendName} used all ${view.max_lives} lives`)
    : (won ? `You solved it ${livesLeftPhrase(view.lives_used, view.max_lives)}` : "This one got you");

  return (
    <div className="fr-wrap">
      <div className="fr-page" style={{paddingBottom:0}}>
        <PageHead onBack={onBack} title={mine ? `${friendName}'s guesses` : "Your guesses"} sub={sub}>
          {!mine && <ResultsButton onClick={()=>setShowSheet(true)}/>}
        </PageHead>
        <GuessReplay kit={kit} view={view} solverName={mine ? friendName : "You"}/>
      </div>
      <div className="fr-page fr-result-foot">
        <p className="fr-outcome">{outcome} <span>· finished {timeAgo(view.finished_at)}</span></p>
        <div className="fr-card fr-friend">
          <StreakPanel friendStreak={view.friendship.daily_streak} solveStreak={view.friendship.team_win_streak} friendName={friendName}/>
          <StreakStatus status={view.friendship} now={serverNow}/>
          <button className="fr-btn primary" onClick={()=>onMake(friend)}>
            <span className="fr-btn-ico"><Icon name="pencil"/></span>Make one for {friendName}
          </button>
        </div>
      </div>
      {showSheet && (
        <ResultSheet result={view} creator={friendName} maxLives={view.max_lives} now={serverNow}
          onMakeBack={()=>onMake(friend)} onClose={()=>setShowSheet(false)} closeLabel="Close"/>
      )}
    </div>
  );
}
