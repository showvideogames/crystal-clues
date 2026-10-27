// Random-Pair Pilot Beta at /beta (src/route.js): reached by direct
// address only, linked from no menu. NOT normal Unlimited:
//   - a finite, fixed list of boards built at build time from the pilot library
//     only (pilot-boards.json, scripts/unlimited/build-pilot-beta.mjs), played in
//     order 1..M, then "Pilot complete" (no looping, no regeneration);
//   - if that data is missing or empty, it says so: never normal Unlimited's clues;
//   - each board starts with the same difficulty choice as normal Unlimited
//     (remembered under this beta's own key); switching mid-board restarts that
//     board's attempt after a warning (never skips it);
//   - the board is the game's own (GameView, Unlimited mode) with its progress
//     kept under this beta's storage namespace (storage.js), and the results,
//     ratings and export live there too. Nothing is written to normal Unlimited's
//     history, Daily stats or streaks, and nothing is sent to any server.
import { useCallback, useRef, useState } from "react";
import { DIFF_OPTIONS, DIFFICULTY_LABELS } from "../../game/shared";
import { Icon, Sheet } from "../../friends/ui.jsx";
import { useFitCardWords } from "../fitWords.js";
import { PILOT } from "./data.js";
import { pilotDataId, pilotProgressKey, clearPilotProgress, readPilotState, writePilotState, finishPilotBoard, advancePilot, ratePilotClue, pilotExportJson,
  readPilotDifficulty, writePilotDifficulty, pilotBoardStart, startPilotBoard } from "./storage.js";
import "../../friends/friends.css";
import "../unlimited.css";
import "./pilot-beta.css";

// Boards begun before difficulty was offered have no recorded start; record it at
// the finish so the finished board keeps its level once its progress is cleared.
const keepStart = (s, boardId, difficulty)=> s.started?.[boardId] ? s
  : { ...s, started: { ...(s.started || {}), [boardId]: { difficulty: difficulty || "standard", attempt: 1, legacy: true } } };

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
  // The beta's own remembered level (never normal Unlimited's or Daily's).
  const [pref, setPref] = useState(()=>readPilotDifficulty());
  const [changing, setChanging] = useState(false);
  // The board finished on screen just now stays on screen (its win, its answer); a
  // board finished before a reload shows a short summary in its place.
  const [finishedHere, setFinishedHere] = useState(null);
  const board = data.boards[state.current] || null;
  const result = board ? state.results[board.id] : null;
  const shellRef = useRef(null);
  useFitCardWords(shellRef, [state.current, !!result]);

  const handleFinished = useCallback((r)=>{ if(!board) return; setFinishedHere(board.id); update((s)=>finishPilotBoard(keepStart(s, board.id, r.difficulty), board, r)); },[board, update]);
  const next = useCallback(()=>{
    setShowWhy(false); setFinishedHere(null);
    if(board) clearPilotProgress(dataId, board.id);
    update((s)=>advancePilot(s, total));
  },[update, total, board, dataId]);
  const start = board ? pilotBoardStart(state, dataId, board.id) : null;
  const inPlay = !!start && !result;
  // The board just finished here keeps showing (its win, its answer) on the level
  // and attempt it was played on: that start stays recorded after the finish.
  const shown = start;
  const choose = (d)=>{ setPref(d); writePilotDifficulty(d); };
  const startBoard = ()=>{ if(board) update((s)=>startPilotBoard(s, board.id, pref)); };
  // Switching an unfinished board: a fresh attempt of the same board on the new level
  // (normal Unlimited never changes a board's level mid-play). Results and ratings stay.
  const restartOn = (d)=>{
    if(!board || !inPlay) return;
    choose(d);
    clearPilotProgress(dataId, board.id);
    update((s)=>startPilotBoard(s, board.id, d, start));
    setChanging(false);
  };
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
      ) : !shown ? (
        <div className="fr-card pb-card" data-testid="pb-start">
          <p className="fr-lede">Board {state.current + 1}: choose your difficulty.</p>
          <DifficultyChoice value={pref} onChange={choose} labelId="pb-diff-label"/>
          <button type="button" className="fr-btn primary" onClick={startBoard} data-testid="pb-start-btn">
            <span className="fr-btn-ico"><Icon name="play"/></span>Start board {state.current + 1} on {DIFFICULTY_LABELS[pref]}
          </button>
        </div>
      ) : (
        <GameView key={`${dataId}-${board.id}-${shown.attempt}`} puzzle={puzzle} difficulty={shown.difficulty} unlimited
          progressStorageKey={pilotProgressKey(dataId, board.id)} onFinished={handleFinished} endControls={endControls}/>
      )}
      <p className="fr-help pb-foot">
        {inPlay ? <>{DIFFICULTY_LABELS[start.difficulty]} · <button type="button" className="fr-link" onClick={()=>setChanging(true)} data-testid="pb-change-diff">Change difficulty</button> · </> : null}
        saved in this browser only · <button type="button" className="fr-link" onClick={exportRatings} data-testid="pb-export">Export ratings (JSON)</button>
      </p>
      {changing && inPlay && (
        <ChangeSheet boardNumber={state.current + 1} current={start.difficulty} onRestart={restartOn} onClose={()=>setChanging(false)}/>
      )}
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

// The same difficulty choice as normal Unlimited's lobby (DIFF_OPTIONS, its markup and
// its .fr-choose styles).
function DifficultyChoice({ value, onChange, labelId, exclude = null }){
  return (
    <div className="fr-choose pb-diff">
      <div className="fr-eyebrow" id={labelId}>Choose your difficulty</div>
      <div className="lobby-diff-opts" role="radiogroup" aria-labelledby={labelId}>
        {DIFF_OPTIONS.filter((o)=>o.key !== exclude).map((opt)=>(
          <button key={opt.key} type="button" role="radio" aria-checked={value === opt.key} data-testid={`pb-diff-${opt.key}`}
            className={`lobby-diff-opt${value === opt.key ? " active" : ""}${opt.key === "standard" ? " recommended" : ""}`}
            onClick={()=>onChange(opt.key)}>
            <span className="lobby-diff-icon" aria-hidden="true">{opt.icon}</span>
            <span className="lobby-diff-text">
              <span className="lobby-diff-name">{opt.name}{opt.key === "standard" && <span className="lobby-recommended-tag">Recommended</span>}</span>
              <span className="lobby-diff-desc">{opt.desc}</span>
            </span>
            <span className="lobby-diff-check" aria-hidden="true">{value === opt.key ? "✓" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Changing level on a board already in play: says plainly that the attempt restarts
// (same board, same clues; cards back to the start, lives back to full; ratings and
// earlier results kept), and only restarts after the player confirms.
function ChangeSheet({ boardNumber, current, onRestart, onClose }){
  const [pick, setPick] = useState(null);
  return (
    <Sheet labelledBy="pb-change-title" className="pb-change" onClose={onClose}
      head={<h2 className="fr-sheet-title" id="pb-change-title">Change difficulty</h2>}>
      <p className="fr-help">Board {boardNumber} is in progress on {DIFFICULTY_LABELS[current]}.</p>
      <DifficultyChoice value={pick} onChange={setPick} labelId="pb-change-label" exclude={current}/>
      {pick && (
        <div className="fr-card pb-warn" role="alert" data-testid="pb-restart-warning">
          <p className="fr-lede">Switching restarts board {boardNumber} on {DIFFICULTY_LABELS[pick]}.</p>
          <p className="fr-help">It is the same board with the same clues; it is not skipped. Your cards go back to the start and your lives reset to full, as a new attempt. Your clue ratings and earlier boards' results are kept.</p>
        </div>
      )}
      <div className="fr-row ul-why-actions">
        <button type="button" className="fr-btn quiet sm" onClick={onClose}>Keep {DIFFICULTY_LABELS[current]}</button>
        <button type="button" className="fr-btn primary sm" disabled={!pick} onClick={()=>pick && onRestart(pick)} data-testid="pb-restart-confirm">
          {pick ? `Restart on ${DIFFICULTY_LABELS[pick]}` : "Choose a level"}
        </button>
      </div>
    </Sheet>
  );
}
