import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./client";
import { DIFFICULTY_LABELS } from "../game/shared";
import { livesLeftPhrase } from "./format";
import { Icon } from "./ui.jsx";
import { ResultSheet, ResultsButton } from "./ResultSheet.jsx";
import { useServerNow } from "./streakClock";
import { friendPuzzleForGame } from "./puzzle";
import ChooseDifficulty from "./ChooseDifficulty.jsx";

// Solving a friend's puzzle on the familiar board. The browser never has the
// answer: each Submit is judged and recorded by the server, which returns
// the answer only once the puzzle is over (a win, or all lives used).
//
// The same screen plays a puzzle shared by link (SharedPuzzle.jsx): then
// `source` opens and judges it through the link, and `guest` replaces the
// friend-only actions with the one offer to save the result.
//   source: { open(), guess(g) }        default: this account's friend puzzle
//   guest:  { saveLabel, onSave, backLabel }

export default function FriendPlay({ kit, puzzleId, onBack, onMakeBack, onOpenResult, onHowToPlay, source, guest }) {
  const { GameView } = kit;
  const [view,setView] = useState(null);
  const [error,setError] = useState("");
  const [loadCount,setLoadCount] = useState(0);
  const [done,setDone] = useState(null);       // the final server result, for the overlay
  const [showDone,setShowDone] = useState(false);
  const serverNow = useServerNow(done?.friendship?.server_now || view?.friendship?.server_now);

  const open = source?.open;
  const load = useCallback(async ()=>{
    try { setView(await (open ? open() : api.open(puzzleId))); setError(""); }
    catch(err){ setError(err.message); }
  },[puzzleId, open]);

  useEffect(()=>{
    const t = setTimeout(load, 0);
    return ()=>clearTimeout(t);
  },[load, loadCount]);

  // Your own puzzle: its result page shows its status and, later, the guesses.
  const isCreator = view?.role === "creator";
  useEffect(()=>{ if(isCreator) onOpenResult(puzzleId, { replace:true }); },[isCreator, puzzleId, onOpenResult]);

  const friend = useMemo(()=> view && view.role === "solver" && !view.finished_at ? {
    puzzle:view,
    submitGuess:(g)=> source ? source.guess(g) : api.guess(view.id, g),
    onFinished:(result)=>{ setDone(result); setShowDone(true); },
    // Another tab or device moved the puzzle on: reload the server's truth.
    onStale:()=>setLoadCount(c=>c+1),
  } : null,[view, source]);

  if(error){
    return <div className="fr-wrap"><div className="fr-page">
      <div className="fr-msg err">{error}</div>
      <button className="fr-btn secondary" onClick={onBack}>{guest ? "Back" : "Back to Friends"}</button>
    </div></div>;
  }
  if(!view) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub">Opening puzzle…</p></div></div>;
  if(isCreator) return null;
  if(!view.difficulty && !view.finished_at){
    return <ChooseDifficulty puzzleId={view.id} creator={view.creator_name} title={view.title}
      onBack={onBack} onChosen={()=>setLoadCount(c=>c+1)} onHowToPlay={onHowToPlay}/>;
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
  // The results sheet: the finish just played here, or — opening a puzzle
  // finished earlier — the same sheet from the server's record of it, with
  // the friendship's streaks as they stand now.
  const result = done || (finished ? { outcome:view.outcome, lives_used:view.lives_used, friendship:view.friendship } : null);

  return (
    <div className="fr-game-shell">
      <div className="fr-playbar">
        <button type="button" className="fr-back" onClick={onBack}><Icon name="back" size={18}/>{guest?.backLabel || "Friends"}</button>
        <span className="grow"/>
        <span className="fr-chip">{creator}'s puzzle{view.difficulty && <span>· {DIFFICULTY_LABELS[view.difficulty]}</span>}</span>
        {result && !showDone && <ResultsButton onClick={()=>setShowDone(true)}/>}
      </div>

      {finished ? (
        <>
          <div className="fr-page fr-banner" style={{paddingBottom:0}}>
            <p className="fr-lede" style={{textAlign:"center"}}>
              {view.outcome === "won" ? `You solved it ${livesLeftPhrase(view.lives_used, view.max_lives)}.` : "The veil stayed closed — here's the answer."}
            </p>
            {guest ? (
              <button className="fr-btn primary" onClick={guest.onSave}>{guest.saveLabel}</button>
            ) : (
              <div className="fr-row">
                <button className="fr-btn secondary" onClick={()=>onOpenResult(view.id)}>Your guesses</button>
                <button className="fr-btn primary" onClick={makeBack}>Make one for {creator}</button>
              </div>
            )}
          </div>
          <GameView key={`admire-${view.id}`} puzzle={puzzle} difficulty={view.difficulty} admireMode sandbox/>
        </>
      ) : (
        <GameView key={`${view.id}-${loadCount}`} puzzle={puzzle} difficulty={view.difficulty} friend={friend}/>
      )}

      {showDone && result && (
        <ResultSheet result={result} creator={creator} maxLives={view.max_lives} now={serverNow} justCounted={counted}
          onMakeBack={makeBack} onClose={()=>setShowDone(false)} onBack={guest ? null : onBack}
          primary={guest ? { label:guest.saveLabel, onClick:guest.onSave } : null}/>
      )}
    </div>
  );
}
