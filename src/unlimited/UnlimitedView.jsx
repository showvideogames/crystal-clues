// Cluevoyance Unlimited — guest beta at /unlimited (src/route.js).
//
// A local pool of checked boards (pool.json, built by scripts/unlimited), the
// familiar board (GameView, Unlimited mode), and after each game "Why these
// clues worked": one entry per clue with the pair and both sides, a rating
// per clue and a note per puzzle. Everything the player does is saved in this
// browser only (history.js); the screens say so, and the feedback can be
// copied or downloaded. No account, no server, no payment, no homepage link.
import { useCallback, useMemo, useState } from "react";
import { DIFF_OPTIONS, DIFFICULTY_LABELS, MAX_LIVES } from "../game/shared";
import { Icon, PageHead, Sheet } from "../friends/ui.jsx";
import POOL from "./pool.json";
import { RATINGS, readStore, writeStore, nextBoard, playedCount, startBoard, finishBoard, rateClue, notePuzzle, feedbackFor, feedbackText, feedbackJson } from "./history.js";
import "../friends/friends.css";
import "./unlimited.css";

const boards = [...POOL.boards].sort((x, y) => x.index - y.index);
const byId = new Map(boards.map((b) => [b.id, b]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const livesPhrase = (n) => `${n} ${n === 1 ? "life" : "lives"}`;

const dailyPreference = () => {
  try { const saved = JSON.parse(localStorage.getItem("clover_difficulty")); return DIFF_OPTIONS.some((o) => o.key === saved) ? saved : "standard"; }
  catch { return "standard"; }
};

async function copyText(text){
  try { if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function download(name, text){
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

export default function UnlimitedView({ kit, onHome, onHowToPlay }) {
  const { GameView } = kit;
  const [store, setStore] = useState(readStore);
  const update = useCallback((fn)=>setStore((s)=>writeStore(fn(s))),[]);
  const current = store.current ? byId.get(store.current.id) || null : null;
  const [screen, setScreen] = useState(()=>(current ? "play" : "lobby"));
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(null);   // the result of the game on screen, once over
  const [showWhy, setShowWhy] = useState(false);
  const [choice, setChoice] = useState(dailyPreference);

  const next = useMemo(()=>nextBoard(boards, store),[store]);
  const played = playedCount(boards, store);

  const start = useCallback((board, difficulty, opts)=>{
    update((s)=>startBoard(s, board, difficulty, opts));
    setFinished(null); setShowWhy(false); setRun((r)=>r + 1); setScreen("play");
  },[update]);

  const currentDifficulty = store.current?.difficulty || null;
  const handleFinished = useCallback((result)=>{
    if(!current) return;
    update((s)=>finishBoard(s, current, result));
    setFinished({ ...result, board: current, difficulty: currentDifficulty || result.difficulty });
  },[current, currentDifficulty, update]);

  // Leaving mid-game keeps the game (GameView saved its progress); the lobby offers Continue.
  const leave = useCallback(()=>{ setShowWhy(false); setScreen("lobby"); },[]);

  if(screen === "play" && (current || finished)){
    const board = current || finished.board;
    const difficulty = currentDifficulty || finished?.difficulty || "standard";
    const puzzle = { id:`unlimited-${board.id}-v${board.version}`, title:board.title, date:today(), clues:board.clues, cards:board.cards, solution:board.solution };
    const afterNext = next && next.id !== board.id ? next : null;
    const endControls = (
      <div className="end-ctrls" data-testid="ul-end">
        <button type="button" className="end-btn primary" onClick={()=>setShowWhy(true)} data-testid="ul-why">
          <Icon name="eye" size={18}/>Why these clues
        </button>
        {afterNext
          ? <button type="button" className="end-btn" onClick={()=>start(afterNext, difficulty)} data-testid="ul-next"><Icon name="next" size={18}/>Next puzzle</button>
          : <button type="button" className="end-btn" onClick={leave} data-testid="ul-back">Back to Unlimited</button>}
      </div>
    );
    return (
      <div className="fr-game-shell ul-shell">
        <div className="fr-playbar">
          <button type="button" className="fr-back" onClick={leave}><Icon name="back" size={18}/>Unlimited</button>
          <span className="grow"/>
          <span className="fr-chip" data-testid="ul-chip">Puzzle {board.index} of {boards.length} · {DIFFICULTY_LABELS[difficulty]}{store.current?.replay ? " · replay" : ""}</span>
        </div>
        <GameView key={`${board.id}-${run}`} puzzle={puzzle} difficulty={difficulty} unlimited
          onFinished={handleFinished} endControls={endControls}/>
        {showWhy && finished && (
          <WhySheet board={board} result={finished} store={store} update={update} onClose={()=>setShowWhy(false)}
            onNext={afterNext ? ()=>start(afterNext, difficulty) : null}/>
        )}
      </div>
    );
  }

  return (
    <Lobby store={store} update={update} next={next} played={played} current={current} choice={choice} setChoice={setChoice}
      onStart={(board, diff, opts)=>start(board, diff, opts)} onContinue={()=>{ setFinished(null); setScreen("play"); }}
      onHome={onHome} onHowToPlay={onHowToPlay}/>
  );
}

function Lobby({ store, next, played, current, choice, setChoice, onStart, onContinue, onHome, onHowToPlay }){
  const [copied,setCopied] = useState("");
  const total = boards.length;
  const notes = store.feedback.length;
  const copy = async ()=>{ setCopied((await copyText(feedbackText(store))) ? "Copied ✓" : "Copy failed"); setTimeout(()=>setCopied(""), 2500); };
  return (
    <div className="fr-wrap">
      <div className="fr-page fr-choose ul-lobby">
        <PageHead onBack={onHome} backLabel="Home" title="Unlimited"
          sub={`Guest beta · ${played} of ${total} ${total === 1 ? "puzzle" : "puzzles"} played on this device`}/>
        <p className="fr-help ul-beta-note">A test batch of {total} puzzles, built from a 50-word shortlist. Nothing is sent anywhere: your games and notes stay in this browser.</p>

        {current ? (
          <div className="fr-card ul-card">
            <p className="fr-lede">Puzzle {current.index} is in progress on {DIFFICULTY_LABELS[store.current.difficulty]}.</p>
            <button type="button" className="fr-btn primary" onClick={onContinue} data-testid="ul-continue"><span className="fr-btn-ico"><Icon name="play"/></span>Continue puzzle {current.index}</button>
          </div>
        ) : next ? (
          <>
            <div className="fr-eyebrow" id="ul-diff-label">Choose your difficulty</div>
            <div className="lobby-diff-opts" role="radiogroup" aria-labelledby="ul-diff-label">
              {DIFF_OPTIONS.map((opt)=>(
                <button key={opt.key} type="button" role="radio" aria-checked={choice === opt.key}
                  className={`lobby-diff-opt${choice === opt.key ? " active" : ""}${opt.key === "standard" ? " recommended" : ""}`}
                  onClick={()=>setChoice(opt.key)}>
                  <span className="lobby-diff-icon" aria-hidden="true">{opt.icon}</span>
                  <span className="lobby-diff-text">
                    <span className="lobby-diff-name">{opt.name}{opt.key === "standard" && <span className="lobby-recommended-tag">Recommended</span>}</span>
                    <span className="lobby-diff-desc">{opt.desc}</span>
                  </span>
                  <span className="lobby-diff-check" aria-hidden="true">{choice === opt.key ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            <button type="button" className="fr-btn primary" onClick={()=>onStart(next, choice)} data-testid="ul-start">
              <span className="fr-btn-ico"><Icon name="play"/></span>Play puzzle {next.index}
            </button>
          </>
        ) : (
          <div className="fr-card ul-card">
            <p className="fr-lede">You've played all {total} beta puzzles on this device. New ones arrive in later batches.</p>
            <p className="fr-help">You can replay any of them; a replay is recorded as a replay, never as a new result.</p>
          </div>
        )}

        {played > 0 && (
          <section className="ul-section" aria-labelledby="ul-played-h">
            <h2 className="fr-eyebrow" id="ul-played-h">Played</h2>
            <ul className="ul-played">
              {boards.filter((b)=>store.played[b.id]).map((b)=>{
                const p = store.played[b.id];
                return (
                  <li key={b.id} className="ul-played-row">
                    <span className="ul-played-text">
                      <b>Puzzle {b.index}</b> · {DIFFICULTY_LABELS[p.difficulty] || p.difficulty} · {p.outcome === "won" ? (p.livesUsed ? `solved, ${livesPhrase(p.livesUsed)} used` : "solved, no lives lost") : "not solved"}{p.replays ? ` · replayed ${p.replays}×` : ""}
                    </span>
                    {!current && <button type="button" className="fr-btn secondary sm" onClick={()=>onStart(b, choice, { replay:true })}>Replay</button>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="ul-section fr-card ul-card" aria-labelledby="ul-fb-h">
          <h2 className="fr-eyebrow" id="ul-fb-h">Your feedback</h2>
          <p className="fr-help" data-testid="ul-feedback-count">{notes === 0 ? "No notes yet. After each puzzle, rate its clues under “Why these clues”." : `${notes} ${notes === 1 ? "note" : "notes"}, saved on this device only — not sent anywhere. Copy or download it to share.`}</p>
          {notes > 0 && (
            <div className="fr-row">
              <button type="button" className="fr-btn secondary sm" onClick={copy} data-testid="ul-copy">{copied || "Copy"}</button>
              <button type="button" className="fr-btn secondary sm" onClick={()=>download(`cluevoyance-unlimited-feedback-${today()}.json`, feedbackJson(store))} data-testid="ul-download">Download</button>
            </div>
          )}
        </section>

        <p className="fr-foot">New to Cluevoyance? <button type="button" className="fr-link" onClick={onHowToPlay}>How to play</button></p>
      </div>
    </div>
  );
}

// After the game: each clue with its pair and both sides, a rating per clue,
// a note for the puzzle. Saved as tapped, in this browser only.
function WhySheet({ board, result, store, update, onClose, onNext }){
  const ctx = { board, difficulty: result.difficulty, outcome: result.won ? "won" : "lost", livesUsed: result.livesUsed };
  const mine = feedbackFor(store, board);
  const ratingAt = (pos) => mine.find((f)=>f.position === pos)?.rating || null;
  const [note,setNote] = useState(()=>mine.find((f)=>f.position === null)?.note || "");
  // Every keystroke is saved at once (the store is small and local), so closing,
  // Next, Copy or Download right after typing never loses or exports a stale note.
  const changeNote = (text)=>{ setNote(text); update((s)=>notePuzzle(s, { ...ctx, note:text })); };
  const [copied,setCopied] = useState("");
  const copy = async ()=>{ setCopied((await copyText(feedbackText(store))) ? "Copied ✓" : "Copy failed"); setTimeout(()=>setCopied(""), 2500); };
  const livesLeft = MAX_LIVES - (result.livesUsed || 0);
  return (
    <Sheet labelledBy="ul-why-title" className="ul-why" onClose={onClose}
      head={<h2 className="fr-sheet-title" id="ul-why-title">Why these clues worked</h2>}>
      <p className="fr-lede ul-why-result" data-testid="ul-why-result">
        {result.won ? `Solved on ${DIFFICULTY_LABELS[result.difficulty]}${livesLeft === MAX_LIVES ? ", no lives lost." : ` with ${livesPhrase(result.livesUsed)} used.`}` : `Not solved on ${DIFFICULTY_LABELS[result.difficulty]}. Here is how the clues were meant to work.`}
      </p>
      <ol className="ul-why-list">
        {board.reveal.map((r)=>(
          <li key={r.position} className="ul-why-item" data-testid="ul-why-item">
            <div className="ul-why-clue">{r.clue}</div>
            <div className="ul-why-pair">{r.wordA} + {r.wordB}</div>
            <p className="ul-why-side"><b>{r.wordA}</b> — {r.wordAConnection}</p>
            <p className="ul-why-side"><b>{r.wordB}</b> — {r.wordBConnection}</p>
            {r.reference?.source && <p className="ul-why-source">From {r.reference.source}</p>}
            <div className="ul-rate" role="group" aria-label={`Rate the clue ${r.clue}`}>
              {RATINGS.map((o)=>(
                <button key={o.key} type="button" className={`ul-rate-btn${ratingAt(r.position) === o.key ? " on" : ""}`}
                  aria-pressed={ratingAt(r.position) === o.key}
                  onClick={()=>update((s)=>rateClue(s, { ...ctx, position:r.position, rating:o.key }))}>{o.label}</button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <label className="fr-label" htmlFor="ul-note">Anything else about this puzzle?</label>
      <textarea id="ul-note" className="fr-input ul-note" rows={3} maxLength={500} value={note} placeholder="Optional. For example: which card you nearly placed instead."
        onChange={(e)=>changeNote(e.target.value)}/>
      <p className="fr-help ul-saved-note">Saved on this device only — nothing is sent. Copy it to share with the Cluevoyance team.</p>
      <div className="fr-row ul-why-actions">
        <button type="button" className="fr-btn secondary sm" onClick={copy} data-testid="ul-why-copy">{copied || "Copy all feedback"}</button>
        {onNext ? <button type="button" className="fr-btn primary sm" onClick={onNext} data-testid="ul-why-next">Next puzzle</button>
          : <button type="button" className="fr-btn quiet sm" onClick={onClose}>Close</button>}
      </div>
    </Sheet>
  );
}
