import { useCallback, useEffect, useMemo, useState } from "react";
import { api, nudgePush } from "./client";
import { DIFFICULTY_LABELS } from "../game/shared";
import { livesLeftPhrase } from "./format";
import { StreakPanel, StreakStatus } from "./Streaks.jsx";
import { Icon } from "./ui.jsx";
import { useServerNow } from "./streakClock";
import { friendPuzzleForGame } from "./puzzle";
import ChooseDifficulty from "./ChooseDifficulty.jsx";

const CRYSTAL_BALL = "/assets/crystal-ball-star.webp";
// A few small sparkles around the ball on a win (position, size, delay).
const SPARKLES = [
  { left:"14%", top:"22%", "--s":"14px", animationDelay:"0s" },
  { left:"80%", top:"14%", "--s":"10px", animationDelay:".5s" },
  { left:"86%", top:"62%", "--s":"16px", animationDelay:"1s" },
  { left:"9%",  top:"70%", "--s":"9px",  animationDelay:"1.4s" },
];

// Solving a friend's puzzle on the familiar board. The browser never has the
// answer: each Submit is judged and recorded by the server, which returns
// the answer only once the puzzle is over (a win, or all lives used).

export default function FriendPlay({ kit, puzzleId, onBack, onMakeBack, onOpenResult }) {
  const { GameView } = kit;
  const [view,setView] = useState(null);
  const [error,setError] = useState("");
  const [loadCount,setLoadCount] = useState(0);
  const [done,setDone] = useState(null);       // the final server result, for the overlay
  const [showDone,setShowDone] = useState(false);
  const serverNow = useServerNow(done?.friendship?.server_now || view?.friendship?.server_now);

  const load = useCallback(async ()=>{
    try { setView(await api.open(puzzleId)); setError(""); }
    catch(err){ setError(err.message); }
  },[puzzleId]);

  useEffect(()=>{
    const t = setTimeout(load, 0);
    return ()=>clearTimeout(t);
  },[load, loadCount]);

  // Your own puzzle: its result page shows its status and, later, the guesses.
  const isCreator = view?.role === "creator";
  useEffect(()=>{ if(isCreator) onOpenResult(puzzleId); },[isCreator, puzzleId, onOpenResult]);

  const friend = useMemo(()=> view && view.role === "solver" && !view.finished_at ? {
    puzzle:view,
    submitGuess:(g)=>api.guess(view.id, g),
    onFinished:(result)=>{ setDone(result); setShowDone(true); nudgePush(); },
    // Another tab or device moved the puzzle on: reload the server's truth.
    onStale:()=>setLoadCount(c=>c+1),
  } : null,[view]);

  if(error){
    return <div className="fr-wrap"><div className="fr-page">
      <div className="fr-msg err">{error}</div>
      <button className="fr-btn secondary" onClick={onBack}>Back to Friends</button>
    </div></div>;
  }
  if(!view) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub">Opening puzzle…</p></div></div>;
  if(isCreator) return null;
  if(!view.difficulty && !view.finished_at){
    return <ChooseDifficulty puzzleId={view.id} creator={view.creator_name} title={view.title}
      onBack={onBack} onChosen={()=>setLoadCount(c=>c+1)}/>;
  }

  const creator = view.creator_name;
  const makeBack = ()=>onMakeBack({ friendship_id:view.friendship_id, friend_name:creator });
  // Did this finish add a Friend Streak day? Compare with the streak as it
  // stood when the puzzle was opened (0 there if it had already lapsed).
  const counted = done?.friendship
    ? done.friendship.daily_streak > (view.friendship?.daily_streak ?? 0)
    : undefined;
  const finished = !!view.finished_at;
  const puzzle = friendPuzzleForGame(view);

  return (
    <div className="fr-game-shell">
      <div className="fr-playbar">
        <button type="button" className="fr-back" onClick={onBack}><Icon name="back" size={18}/>Friends</button>
        <span className="grow"/>
        <span className="fr-chip">{creator}'s puzzle{view.difficulty && <span>· {DIFFICULTY_LABELS[view.difficulty]}</span>}</span>
      </div>

      {finished ? (
        <>
          <div className="fr-page fr-banner" style={{paddingBottom:0}}>
            <p className="fr-lede" style={{textAlign:"center"}}>
              {view.outcome === "won" ? `You solved it ${livesLeftPhrase(view.lives_used, view.max_lives)}.` : "The veil stayed closed — here's the answer."}
            </p>
            <div className="fr-row">
              <button className="fr-btn secondary" onClick={()=>onOpenResult(view.id)}>Your guesses</button>
              <button className="fr-btn primary" onClick={makeBack}>Make one for {creator}</button>
            </div>
          </div>
          <GameView key={`admire-${view.id}`} puzzle={puzzle} difficulty={view.difficulty} admireMode sandbox/>
        </>
      ) : (
        <GameView key={`${view.id}-${loadCount}`} puzzle={puzzle} difficulty={view.difficulty} friend={friend}/>
      )}

      {showDone && done && (
        <div className="fr-done" role="dialog" aria-modal="true" aria-labelledby="fr-done-title">
          <div className={`fr-done-card${done.outcome === "won" ? " won" : " lost"}`}>
            <div className="fr-done-hero" aria-hidden="true">
              <img className="fr-done-ball" src={CRYSTAL_BALL} alt="" width="118" height="133"/>
              {done.outcome === "won" && SPARKLES.map((p, i)=><span key={i} className="fr-sparkle" style={p}/>)}
            </div>
            <div className="fr-done-text">
              <h2 className="fr-done-title" id="fr-done-title">{done.outcome === "won" ? `You read ${creator}'s mind!` : "The veil stayed closed"}</h2>
              <p className="fr-done-sub">
                {done.outcome === "won"
                  ? `Solved ${livesLeftPhrase(done.lives_used, view.max_lives)}. ${creator} will see your guesses.`
                  : `All ${view.max_lives} lives used — the answer is on the board. ${creator} will see how close you got.`}
              </p>
            </div>
            <StreakPanel friendStreak={done.friendship.daily_streak} solveStreak={done.friendship.team_win_streak} friendName={creator}/>
            <StreakStatus status={done.friendship} now={serverNow} justCounted={counted}/>
            <button className="fr-btn primary" onClick={makeBack}>
              <span className="fr-btn-ico"><Icon name="pencil"/></span>Make one for {creator}
            </button>
            <div className="fr-row fr-done-links">
              <button className="fr-btn quiet" onClick={()=>setShowDone(false)}>See the board</button>
              <button className="fr-btn quiet" onClick={onBack}>Back to Friends</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
