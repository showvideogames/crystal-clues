// Random-Pair Pilot Beta at /unlimited-beta (src/route.js): reached by direct
// address only, linked from no menu. NOT normal Unlimited:
//   - a finite, fixed list of boards built at build time from the pilot library
//     only (pilot-boards.json, scripts/unlimited/build-pilot-beta.mjs), played in
//     order 1..M, then "Pilot complete" (no looping, no regeneration);
//   - if that data is missing or empty, it says so: never normal Unlimited's clues;
//   - the board is the game's own (GameView, Unlimited mode) with its progress
//     kept under this beta's storage namespace (storage.js), and the results,
//     ratings and export live there too. Nothing is written to normal Unlimited's
//     history, Daily stats or streaks, and nothing is sent to any server.
import { useCallback, useRef, useState } from "react";
import { DIFFICULTY_LABELS } from "../../game/shared";
import { Icon, Sheet } from "../../friends/ui.jsx";
import { useFitCardWords } from "../fitWords.js";
import { PILOT } from "./data.js";
import { pilotDataId, pilotProgressKey, clearPilotProgress, readPilotState, writePilotState, finishPilotBoard, advancePilot, ratePilotClue, pilotExportJson } from "./storage.js";
import "../../friends/friends.css";
import "../unlimited.css";
import "./pilot-beta.css";

const DIFFICULTY = "standard";
const RATES = [{ key: "up", label: "👍", name: "Good clue" }, { key: "down", label: "👎", name: "Bad clue" }];

function download(name, text){
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function BetaHead({ position, total, placeholder }){
  return (
    <header className="pb-head" data-testid="pb-head">
      {placeholder && <div className="pb-placeholder" role="alert" data-testid="pb-placeholder">PLACEHOLDER DATA — fake test hints, not the reviewed pilot</div>}
      <p className="pb-title">Random-Pair Pilot Beta — test boards, not normal Unlimited</p>
      {position && <p className="pb-count" data-testid="pb-count">Board {position} of {total}</p>}
    </header>
  );
}

export default function PilotBetaView({ kit, onHome, pilot = PILOT }){
  const { data, problem } = pilot;
  if(!data) return <Missing problem={problem} onHome={onHome}/>;
  return <PilotRun kit={kit} data={data} onHome={onHome}/>;
}

function Missing({ problem, onHome }){
  return (
    <div className="fr-wrap"><div className="fr-page pb-page">
      <BetaHead/>
      <div className="fr-card pb-card" role="alert" data-testid="pb-missing" data-problem={problem}>
        <p className="fr-lede">The pilot beta has no boards to play {problem === "empty" ? "(the board list is empty)" : problem === "invalid" ? "(the board list is damaged)" : "(the pilot data is missing)"}.</p>
        <p className="fr-help">Nothing else is shown in its place. Rebuild the pilot with <code>npm run pilot-beta:build</code>.</p>
        <button type="button" className="fr-btn secondary" onClick={onHome}>Home</button>
      </div>
    </div></div>
  );
}

function PilotRun({ kit, data, onHome }){
  const { GameView } = kit;
  const total = data.boards.length;
  const placeholder = !!data._metadata.placeholder;
  const dataId = pilotDataId(data._metadata);
  const [state, setState] = useState(()=>readPilotState(dataId));
  const [saved, setSaved] = useState(true);
  const stateRef = useRef(state);
  const update = useCallback((fn)=>{
    const next = fn(stateRef.current);
    stateRef.current = next; setState(next);
    setSaved(writePilotState(next));
  },[]);
  const [showWhy, setShowWhy] = useState(false);
  // The board finished on screen just now stays on screen (its win, its answer); a
  // board finished before a reload shows a short summary in its place.
  const [finishedHere, setFinishedHere] = useState(null);
  const board = data.boards[state.current] || null;
  const result = board ? state.results[board.id] : null;
  const shellRef = useRef(null);
  useFitCardWords(shellRef, [state.current, !!result]);

  const handleFinished = useCallback((r)=>{ if(!board) return; setFinishedHere(board.id); update((s)=>finishPilotBoard(s, board, r)); },[board, update]);
  const next = useCallback(()=>{
    setShowWhy(false); setFinishedHere(null);
    if(board) clearPilotProgress(dataId, board.id);
    update((s)=>advancePilot(s, total));
  },[update, total, board, dataId]);
  const exportRatings = ()=>download(`cluevoyance-pilot-beta-ratings-${dataId}.json`, pilotExportJson(stateRef.current, data));
  const last = state.current === total - 1;

  if(!board){
    const solved = Object.values(state.results).filter((r)=>r.won).length;
    return (
      <div className="fr-wrap"><div className="fr-page pb-page" data-testid="pb-complete">
        <BetaHead total={total} placeholder={placeholder}/>
        <div className="fr-card pb-card">
          <h1 className="fr-h1">Pilot complete — {total} boards</h1>
          <p className="fr-lede">{solved} of {total} solved. Thank you for testing.</p>
          <p className="fr-help">Your results and ratings are saved in this browser only. Download them to send to the Cluevoyance team.</p>
          <div className="fr-row">
            <button type="button" className="fr-btn primary" onClick={exportRatings} data-testid="pb-export">Export ratings (JSON)</button>
            <button type="button" className="fr-btn secondary" onClick={onHome}>Home</button>
          </div>
        </div>
      </div></div>
    );
  }

  const nextLabel = last ? "Finish pilot" : "Next board";
  const endControls = (
    <div className="end-ctrls" data-testid="pb-end">
      <button type="button" className="end-btn primary" onClick={()=>setShowWhy(true)} data-testid="pb-why"><Icon name="eye" size={18}/>Why these clues</button>
      <button type="button" className="end-btn" onClick={next} data-testid="pb-next"><Icon name="next" size={18}/>{nextLabel}</button>
    </div>
  );
  const puzzle = { id:`pilot-beta-${board.id}`, title:board.title, date:"pilot-beta", clues:board.clues, cards:board.cards, solution:board.solution };
  return (
    <div className="fr-game-shell ul-shell pb-shell" ref={shellRef}>
      <BetaHead position={state.current + 1} total={total} placeholder={placeholder}/>
      {!saved && <p className="fr-help pb-unsaved" role="alert">This browser isn't keeping the pilot's progress. Use Export ratings before closing.</p>}
      {result && finishedHere !== board.id ? (
        <div className="fr-card pb-card" data-testid="pb-finished">
          <p className="fr-lede">Board {state.current + 1} {result.won ? "solved" : "not solved"}.</p>
          {endControls}
        </div>
      ) : (
        <GameView key={`${dataId}-${board.id}`} puzzle={puzzle} difficulty={DIFFICULTY} unlimited
          progressStorageKey={pilotProgressKey(dataId, board.id)} onFinished={handleFinished} endControls={endControls}/>
      )}
      <p className="fr-help pb-foot">{DIFFICULTY_LABELS[DIFFICULTY]} · saved in this browser only · <button type="button" className="fr-link" onClick={exportRatings} data-testid="pb-export">Export ratings (JSON)</button></p>
      {showWhy && (
        <RevealSheet board={board} result={result} ratings={state.ratings[board.id] || {}} nextLabel={nextLabel}
          onRate={(pos, rating)=>update((s)=>ratePilotClue(s, board.id, pos, rating))} onClose={()=>setShowWhy(false)} onNext={next}/>
      )}
    </div>
  );
}

// The reveal: each clue with its pair and both links, a 👍 / 👎 per clue (local only).
function RevealSheet({ board, result, ratings, nextLabel, onRate, onClose, onNext }){
  return (
    <Sheet labelledBy="pb-why-title" className="ul-why" onClose={onClose}
      head={<h2 className="fr-sheet-title" id="pb-why-title">Why these clues</h2>}>
      {result && <p className="fr-lede ul-why-result">{result.won ? "Solved." : "Not solved. Here is how the clues were meant to work."}</p>}
      <ol className="ul-why-list">
        {board.reveal.map((r)=>(
          <li key={r.position} className="ul-why-item" data-testid="pb-why-item">
            <div className="ul-why-clue">{r.clue}{r.reference ? <span className="pb-ref"> · reference</span> : null}</div>
            <div className="ul-why-pair">{r.wordA} + {r.wordB}</div>
            <p className="ul-why-side"><b>{r.wordA}</b> — {r.wordAConnection}</p>
            <p className="ul-why-side"><b>{r.wordB}</b> — {r.wordBConnection}</p>
            {r.revealExplanation && <p className="ul-why-explain">{r.revealExplanation}</p>}
            <div className="ul-rate" role="group" aria-label={`Rate the clue ${r.clue}`}>
              {RATES.map((o)=>(
                <button key={o.key} type="button" className={`ul-rate-btn${ratings[r.position] === o.key ? " on" : ""}`}
                  aria-pressed={ratings[r.position] === o.key} aria-label={o.name} onClick={()=>onRate(r.position, o.key)}>{o.label}</button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="fr-row ul-why-actions">
        <button type="button" className="fr-btn quiet sm" onClick={onClose}>Close</button>
        <button type="button" className="fr-btn primary sm" onClick={onNext} data-testid="pb-why-next">{nextLabel}</button>
      </div>
    </Sheet>
  );
}
