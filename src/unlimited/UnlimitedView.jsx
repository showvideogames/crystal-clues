// Cluevoyance Unlimited — guest beta at /unlimited (src/route.js).
//
// Play and Next put together a RANDOM board in the browser (generate.js) from
// the served-choice library (random-library.json: checked pairs and their
// chosen hints, built by scripts/unlimited). The board is frozen in this
// browser's history the moment it is created, so a refresh, Continue, the
// played list and Replay always reuse that exact board. Boards from the earlier
// fixed pool (pool.json) stay playable from history under their old ids.
// The familiar board (GameView, Unlimited mode), and after each game "Why these
// clues worked": one entry per clue with the pair and both sides, a rating
// per clue and a note per puzzle. Everything the player does is saved in this
// browser only (history.js); the screens say so, and the feedback can be
// copied or downloaded. No account, no server, no payment, no homepage link.
import { useCallback, useRef, useState } from "react";
import { DIFF_OPTIONS, DIFFICULTY_LABELS, MAX_LIVES } from "../game/shared";
import { Icon, PageHead, Sheet } from "../friends/ui.jsx";
import POOL from "./pool.json";
import LIBRARY from "./random-library.json";
import { generateBoard, freshSeed, validateBoard } from "./generate.js";
import { useFitCardWords } from "./fitWords.js";
import { RATINGS, SAVE_HEADLINE, SAVE_DETAIL, readStore, writeStore, storageStatus, nextBoard, playedTotal, resolveBoard, recentPairIds, startBoard, finishBoard, rateClue, notePuzzle, feedbackFor, feedbackText, feedbackJson } from "./history.js";
import "../friends/friends.css";
import "./unlimited.css";

const boards = [...POOL.boards].sort((x, y) => x.index - y.index);
const byId = new Map(boards.map((b) => [b.id, b]));
const isRandom = (b) => b?.kind === "random";
const shortWhen = (iso) => { try { return new Date(iso).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); } catch { return ""; } };
const boardName = (b) => (isRandom(b) ? "Random puzzle" : `Puzzle ${b.index}`);

/**
 * A new random board, checked before it is offered. A fresh secure seed each
 * time; pairs from the last few random boards are avoided when possible. If the
 * library somehow cannot make one, the next unplayed fixed board is the fallback.
 */
function newBoard(store){
  const avoid = recentPairIds(store, 3);
  for(let i = 0; i < 5; i++){
    const b = generateBoard(LIBRARY, { seed: freshSeed(), avoid });
    if(b && !store.boards?.[b.id] && validateBoard(b, LIBRARY).length === 0) return b;
  }
  return nextBoard(boards, store);
}
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
  // "ok", or why this browser is not keeping Unlimited right now: "failed" (a save
  // failed: storage full or blocked), "unreadable" (saved data we must not write
  // over) or "unavailable" (storage off). Play continues from memory either way.
  const [saved, setSaved] = useState(()=>{ const st = storageStatus(); return st === "unreadable" || st === "unavailable" ? st : "ok"; });
  const storeRef = useRef(store);
  const update = useCallback((fn)=>{
    const next = fn(storeRef.current);
    storeRef.current = next;
    setStore(next);
    if(writeStore(next)) setSaved("ok");
    else { const st = storageStatus(); setSaved(st === "unreadable" || st === "unavailable" ? st : "failed"); }
  },[]);
  const current = resolveBoard(byId, store, store.current?.id);
  const [screen, setScreen] = useState(()=>(current ? "play" : "lobby"));
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(null);   // the result of the game on screen, once over
  const [showWhy, setShowWhy] = useState(false);
  const [choice, setChoice] = useState(dailyPreference);
  const [failed, setFailed] = useState(false);

  const played = playedTotal(store);

  const start = useCallback((board, difficulty, opts)=>{
    update((s)=>startBoard(s, board, difficulty, opts));
    setFinished(null); setShowWhy(false); setRun((r)=>r + 1); setScreen("play");
  },[update]);

  // Play and Next: always a new random board (frozen on start), never a re-roll of one already saved.
  const playNew = useCallback((difficulty)=>{
    const b = newBoard(store);
    if(!b){ setFailed(true); setShowWhy(false); setScreen("lobby"); return; }
    setFailed(false); start(b, difficulty);
  },[store, start]);

  const currentDifficulty = store.current?.difficulty || null;
  const handleFinished = useCallback((result)=>{
    if(!current) return;
    update((s)=>finishBoard(s, current, result));
    setFinished({ ...result, board: current, difficulty: currentDifficulty || result.difficulty });
  },[current, currentDifficulty, update]);

  // Leaving mid-game keeps the game (GameView saved its progress); the lobby offers Continue.
  const leave = useCallback(()=>{ setShowWhy(false); setScreen("lobby"); },[]);

  // Long bank words (SCUBA DIVER, THANKSGIVING) are fitted on narrow phones; see fitWords.js.
  const shellRef = useRef(null);
  useFitCardWords(shellRef, [screen, current?.id, finished?.board?.id, run]);

  if(screen === "play" && (current || finished)){
    const board = current || finished.board;
    const difficulty = currentDifficulty || finished?.difficulty || "standard";
    const puzzle = { id:`unlimited-${board.id}-v${board.version}`, title:board.title, date:today(), clues:board.clues, cards:board.cards, solution:board.solution };
    const endControls = (
      <div className="end-ctrls" data-testid="ul-end">
        <button type="button" className="end-btn primary" onClick={()=>setShowWhy(true)} data-testid="ul-why">
          <Icon name="eye" size={18}/>Why these clues
        </button>
        <button type="button" className="end-btn" onClick={()=>playNew(difficulty)} data-testid="ul-next"><Icon name="next" size={18}/>Next puzzle</button>
      </div>
    );
    return (
      <div className="fr-game-shell ul-shell" ref={shellRef}>
        <div className="fr-playbar">
          <button type="button" className="fr-back" onClick={leave}><Icon name="back" size={18}/>Unlimited</button>
          <span className="grow"/>
          <span className="fr-chip" data-testid="ul-chip" data-board-id={board.id}>{isRandom(board) ? "Random puzzle" : `Puzzle ${board.index} of ${boards.length}`} · {DIFFICULTY_LABELS[difficulty]}{store.current?.replay ? " · replay" : ""}</span>
        </div>
        <SaveNotice state={saved}/>
        <GameView key={`${board.id}-${run}`} puzzle={puzzle} difficulty={difficulty} unlimited
          onFinished={handleFinished} endControls={endControls}/>
        {showWhy && finished && (
          <WhySheet board={board} result={finished} store={store} update={update} saved={saved} onClose={()=>setShowWhy(false)}
            onNext={()=>playNew(difficulty)}/>
        )}
      </div>
    );
  }

  return (
    <Lobby store={store} update={update} saved={saved} played={played} current={current} choice={choice} setChoice={setChoice} failed={failed}
      onPlay={(diff)=>playNew(diff)} onReplay={(board, diff)=>start(board, diff, { replay:true })} onContinue={()=>{ setFinished(null); setScreen("play"); }}
      onHome={onHome} onHowToPlay={onHowToPlay}/>
  );
}

/**
 * Said plainly when this browser is not keeping Unlimited, so nothing promises a
 * resume that won't happen. One short line (it must not crowd the board on a
 * phone); "Why?" opens the explanation, which differs by cause.
 */
function SaveNotice({ state }){
  const [open, setOpen] = useState(false);
  if(state === "ok") return null;
  return (
    <div className="ul-save-notice" role="alert" data-testid="ul-save-notice" data-state={state}>
      <p className="ul-save-head">{SAVE_HEADLINE}{" "}
        <button type="button" className="ul-save-why" aria-expanded={open} aria-controls="ul-save-detail"
          onClick={()=>setOpen((o)=>!o)} data-testid="ul-save-why">{open ? "Hide" : "Why?"}</button>
      </p>
      <p id="ul-save-detail" className="ul-save-detail" data-testid="ul-save-detail" hidden={!open}>{SAVE_DETAIL[state] || SAVE_DETAIL.failed}</p>
    </div>
  );
}

function Lobby({ store, saved, played, current, choice, setChoice, failed, onPlay, onReplay, onContinue, onHome, onHowToPlay }){
  const [copied,setCopied] = useState("");
  const notes = store.feedback.length;
  const copy = async ()=>{ setCopied((await copyText(feedbackText(store))) ? "Copied ✓" : "Copy failed"); setTimeout(()=>setCopied(""), 2500); };
  // Played boards, newest first; each resolves to its fixed-pool board or its frozen random snapshot.
  const history = Object.entries(store.played)
    .map(([id, p])=>({ board: resolveBoard(byId, store, id), p }))
    .filter((x)=>x.board)
    .sort((x, y)=>String(y.p.lastReplay?.finishedAt || y.p.finishedAt).localeCompare(String(x.p.lastReplay?.finishedAt || x.p.finishedAt)));
  return (
    <div className="fr-wrap">
      <div className="fr-page fr-choose ul-lobby">
        <PageHead onBack={onHome} backLabel="Home" title="Unlimited"
          sub={`Guest beta · ${played} ${played === 1 ? "puzzle" : "puzzles"} played on this device`}/>
        <p className="fr-help ul-beta-note">Every puzzle is put together at random from {LIBRARY.pairs.length.toLocaleString("en-US")} checked clue pairs, with the other words drawn from all {LIBRARY.words.length.toLocaleString("en-US")} words in the game's word bank. Nothing is sent anywhere: your games and notes stay in this browser.</p>
        <SaveNotice state={saved}/>

        {current ? (
          <div className="fr-card ul-card">
            <p className="fr-lede">{boardName(current)} is in progress on {DIFFICULTY_LABELS[store.current.difficulty]}.</p>
            <button type="button" className="fr-btn primary" onClick={onContinue} data-testid="ul-continue"><span className="fr-btn-ico"><Icon name="play"/></span>Continue {isRandom(current) ? "puzzle" : `puzzle ${current.index}`}</button>
          </div>
        ) : (
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
            <button type="button" className="fr-btn primary" onClick={()=>onPlay(choice)} data-testid="ul-start">
              <span className="fr-btn-ico"><Icon name="play"/></span>Play a random puzzle
            </button>
            {failed && <p className="fr-help" role="alert" data-testid="ul-failed">A puzzle couldn't be put together just now. Please try again.</p>}
          </>
        )}

        {history.length > 0 && (
          <section className="ul-section" aria-labelledby="ul-played-h">
            <h2 className="fr-eyebrow" id="ul-played-h">Played</h2>
            <ul className="ul-played">
              {history.map(({ board:b, p })=>(
                <li key={b.id} className="ul-played-row" data-testid="ul-played-row" data-board-id={b.id}>
                  <span className="ul-played-text">
                    <b>{isRandom(b) ? `Random · ${shortWhen(b.createdAt)}` : `Puzzle ${b.index}`}</b> · {DIFFICULTY_LABELS[p.difficulty] || p.difficulty} · {p.outcome === "won" ? (p.livesUsed ? `solved, ${livesPhrase(p.livesUsed)} used` : "solved, no lives lost") : "not solved"}{p.replays ? ` · replayed ${p.replays}×` : ""}
                    {isRandom(b) && <span className="ul-played-clues"> · {b.clues.join(" · ")}</span>}
                  </span>
                  {!current && <button type="button" className="fr-btn secondary sm" onClick={()=>onReplay(b, choice)} data-testid="ul-replay">Replay</button>}
                </li>
              ))}
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
function WhySheet({ board, result, store, update, saved, onClose, onNext }){
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
      <p className="fr-help ul-saved-note" data-testid="ul-saved-note">{saved === "ok"
        ? "Saved on this device only — nothing is sent. Copy it to share with the Cluevoyance team."
        : "Not saved: this browser isn't keeping Unlimited notes right now. Use Copy to keep your feedback."}</p>
      <div className="fr-row ul-why-actions">
        <button type="button" className="fr-btn secondary sm" onClick={copy} data-testid="ul-why-copy">{copied || "Copy all feedback"}</button>
        {onNext ? <button type="button" className="fr-btn primary sm" onClick={onNext} data-testid="ul-why-next">Next puzzle</button>
          : <button type="button" className="fr-btn quiet sm" onClick={onClose}>Close</button>}
      </div>
    </Sheet>
  );
}
