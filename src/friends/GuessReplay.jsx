import { useEffect, useMemo, useState } from "react";
import { Icon } from "./ui.jsx";

// Replays a finished friend puzzle guess by guess, exactly as submitted:
// the 2×2 board with every card's turn, where the clues sat (Rotate moves
// them), which cards were right, lives left, and the tray the player really
// had left at that guess. After a loss, a last step shows the answer.

const STEP_MS = 2600;

// startSignal: bump it to play again from guess 1 (the result screen's
// "Replay" button). Nothing plays until asked.
export default function GuessReplay({ kit, view, solverName, startSignal = 0 }) {
  const { Board, CardTile } = kit;
  const guesses = useMemo(()=>view.guesses || [],[view.guesses]);
  const lost = view.outcome === "lost";

  const steps = useMemo(()=>{
    const list = guesses.map((g, i)=>({
      kind:"guess",
      n:g.guess_no,
      clues:g.clues,
      board:g.board,
      extras:g.extras || [],
      correct:new Set(g.correct),
      livesBefore:i === 0 ? view.max_lives : guesses[i-1].lives_left,
      livesAfter:g.lives_left,
    }));
    if(lost && view.solution){
      list.push({
        kind:"answer",
        clues:view.clues,
        board:view.solution.slotCards.map((cardId, i)=>({ cardId, orientation:view.solution.orientations[i] })),
        extras:[],
        correct:new Set([0,1,2,3]),
        livesBefore:0, livesAfter:0,
      });
    }
    return list;
  },[guesses, lost, view.clues, view.solution, view.max_lives]);

  const [index,setIndex] = useState(0);
  const [playing,setPlaying] = useState(false);

  useEffect(()=>{
    if(!startSignal) return;
    const t = setTimeout(()=>{ setIndex(0); setPlaying(true); }, 0);
    return ()=>clearTimeout(t);
  },[startSignal]);

  useEffect(()=>{
    if(!playing) return;
    if(index >= steps.length - 1){
      const t = setTimeout(()=>setPlaying(false), 0);
      return ()=>clearTimeout(t);
    }
    const t = setTimeout(()=>setIndex(i=>i+1), STEP_MS);
    return ()=>clearTimeout(t);
  },[playing, index, steps.length]);

  if(!steps.length) return <p className="fr-sub">No guesses were recorded.</p>;
  const step = steps[index];
  const who = solverName === "You" ? "You" : solverName;
  const possessive = who === "You" ? "your " : `${who}'s `;

  const life = (n)=>`${n} ${n === 1 ? "life" : "lives"}`;
  let caption;
  if(step.kind === "answer"){
    caption = { label:"The answer", text:"How it fit together", sub:null };
  } else {
    const right = step.correct.size;
    const isLast = index === guesses.length - 1;
    caption = {
      label:`Guess ${step.n} of ${guesses.length}`,
      text: right === 4 ? "All four right" : `${right} of 4 right`,
      sub: right === 4
        ? `${who} solved it${step.livesAfter ? ` with ${life(step.livesAfter)} to spare` : ""}`
        : isLast && lost ? "Out of lives" : `${who} had ${life(step.livesAfter)} left`,
    };
  }
  const atEnd = index >= steps.length - 1;
  const togglePlay = ()=>{ if(atEnd){ setIndex(0); setPlaying(true); } else setPlaying(p=>!p); };
  const nextLabel = steps[index + 1]?.kind === "answer" ? "The answer" : "Next guess";

  const renderSlot = (si)=>{
    const s = step.board[si];
    const card = s && view.cards[s.cardId];
    const right = step.correct.has(si);
    return (
      <div key={si} className="cslot">
        {card && <CardTile card={card} orientation={s.orientation} locked={right} wrong={!right} noclick/>}
      </div>
    );
  };

  return (
    <div className="fr-replay">
      <div className="fr-card fr-guesscard">
        <div className="fr-replay-step" aria-live="polite">{caption.label}</div>
        <button type="button" className={`fr-playall${playing ? " on" : ""}`} onClick={togglePlay}
          aria-label={playing ? "Pause the replay" : atEnd ? "Replay every guess from the start" : "Play through every guess"}>
          <Icon name={playing ? "pause" : "play"} size={14}/>{playing ? "Pause" : atEnd ? "Replay" : "Play all"}
        </button>
        <div className="fr-replay-text">{caption.text}</div>
        {caption.sub && (
          <span className="fr-replay-stars" role="img" aria-label={`${step.livesAfter} of ${view.max_lives} lives left after this guess`}>
            {Array.from({ length:view.max_lives }, (_, i)=>(
              <span key={i} className={i >= step.livesAfter ? "gone" : ""}>⭐</span>
            ))}
          </span>
        )}
        {caption.sub && <div className="fr-replay-lives">{caption.sub}</div>}
      </div>

      <div className="fr-replay-board">
        <div key={index} className="fr-replay-anim">
          <Board clues={step.clues} renderSlot={renderSlot} compactLevel={2}/>
        </div>
      </div>

      {step.kind === "guess" && (
        <section className="fr-surface fr-tray" aria-label={`${possessive}tray at guess ${step.n}`}>
          <div className="fr-eyebrow">Left in {possessive}tray</div>
          {step.extras.length ? (
            <div className="fr-tray-row">
              <div className="fr-cardrow">
                {step.extras.map(s=>{
                  const card = view.cards[s.cardId];
                  return card ? <div key={s.cardId} className="eslot"><CardTile card={card} orientation={s.orientation} noclick/></div> : null;
                })}
              </div>
              <p className="fr-tray-note">Only the cards {who === "You" ? "you" : who} still had at this guess.</p>
            </div>
          ) : (
            <p className="fr-tray-empty">{view.difficulty === "easy" ? "No bonus cards on Easy." : "Tray empty."}</p>
          )}
        </section>
      )}

      <div className="fr-replay-controls">
        <button className="fr-btn secondary sm" onClick={()=>{ setPlaying(false); setIndex(i=>Math.max(0, i-1)); }} disabled={index === 0}>
          <Icon name="back" size={16}/>Back
        </button>
        <div className="fr-steps" role="tablist" aria-label="Guesses">
          {steps.map((st, i)=>(
            <button key={i} role="tab" aria-selected={i === index}
              className={`fr-step-dot${i === index ? " on" : ""}${i < index ? " done" : ""}${st.kind === "answer" ? " answer" : ""}`}
              onClick={()=>{ setPlaying(false); setIndex(i); }}
              aria-label={st.kind === "answer" ? "The answer" : `Guess ${st.n}`}/>
          ))}
        </div>
        <button className="fr-btn primary sm" onClick={()=>{ setPlaying(false); setIndex(i=>Math.min(steps.length-1, i+1)); }} disabled={atEnd}>
          {nextLabel}<Icon name="next" size={16}/>
        </button>
      </div>
    </div>
  );
}
