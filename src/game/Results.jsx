// The results of a finished official puzzle, and the player's own stats.
// Three separate things, top to bottom:
//   Your result              this puzzle: won or not, lives used, Share / View Board
//   Everyone on this puzzle  other players' results, same puzzle AND same difficulty
//   Your overall stats       played, win %, streak, and your own "Lives used"
// mode "stats" (the header's Stats button) shows only the last one.
//
// Opening or closing this never touches the game: it reads the saved result
// and the counters, and the only thing it can start is a practice replay,
// which the player picks on purpose and which records nothing.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DIFFICULTY_LABELS, MAX_LIVES } from "./shared.js";
import { livesRows, percent, resultRowKey, shareText } from "./dailyResults.js";
import "./results.css";

const formatDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
const livesPhrase = (n) => `${n} ${n === 1 ? "life" : "lives"}`;

// Copies with the Clipboard API, falling back to a hidden textarea.
async function copyText(text){
  try {
    if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); return true; }
  } catch {
    // fall through to the textarea
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// A horizontal "Lives used" chart. Bars are sized against the largest row;
// an empty row draws no bar at all, only its 0. `mine` marks the player's row.
function LivesChart({ title, rows, mine, unit, label }){
  const max = Math.max(1, ...rows.map(r=>r.count));
  return (
    <figure className="rs-chart">
      <figcaption className="rs-chart-title">{title}</figcaption>
      <ul className="rs-chart-rows" aria-label={label}>
        {rows.map(r=>{
          const isMine = r.key === mine;
          const what = r.key === "X" ? "not solved" : `${livesPhrase(Number(r.key))} used`;
          return (
            <li key={r.key} className={`rs-chart-row${r.key === "X" ? " miss" : ""}${isMine ? " mine" : ""}${r.count === 0 ? " zero" : ""}`}
              aria-label={`${what}: ${r.count} ${r.count === 1 ? unit[0] : unit[1]}${isMine ? " (your result)" : ""}`}>
              <span className="rs-chart-key" aria-hidden="true">{r.label}</span>
              <span className="rs-chart-track" aria-hidden="true">
                {r.count > 0 && <span className="rs-chart-bar" style={{ width:`max(6px, calc((100% - 34px) * ${(r.count / max).toFixed(4)}))` }}/>}
                <span className="rs-chart-count">{r.count}</span>
              </span>
              {isMine && <span className="rs-you" aria-hidden="true">You</span>}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Figure({ value, label, sub }){
  return (
    <div className="rs-fig">
      <span className="rs-fig-val">{value}</span>
      <span className="rs-fig-lbl">{label}</span>
      {sub && <span className="rs-fig-sub">{sub}</span>}
    </div>
  );
}

// Everyone on this puzzle, at the player's difficulty. `load` resolves to the
// counts (puzzle_result_summary) or rejects; null means there's nothing to ask.
function EveryoneSection({ load, difficulty, mine, counted }){
  const [state,setState] = useState(()=>({ status: load ? "loading" : "unavailable" }));
  const [attempt,setAttempt] = useState(0);
  const diffName = DIFFICULTY_LABELS[difficulty] || difficulty;
  useEffect(()=>{
    if(!load) return undefined;
    let alive = true;
    load().then(
      data=>{ if(alive) setState({ status:"ready", data }); },
      ()=>{ if(alive) setState({ status:"error" }); });
    return ()=>{ alive = false; };
  },[load, attempt]);
  const retry = ()=>{ setState({ status:"loading" }); setAttempt(a=>a+1); };
  const d = state.data;
  return (
    <section className="rs-sec" aria-labelledby="rs-everyone">
      <h3 className="rs-h" id="rs-everyone">Everyone on this puzzle</h3>
      <p className="rs-sub">{diffName} only · signed-in players, one result each</p>
      {state.status === "unavailable" && <p className="rs-state">Other players' results aren't available for this puzzle.</p>}
      {state.status === "loading" && <p className="rs-state" role="status"><span className="rs-spin" aria-hidden="true"/>Loading other players' results…</p>}
      {state.status === "error" && (
        <div className="rs-state err" role="alert">
          Couldn't load other players' results.
          <button type="button" className="rs-btn quiet sm" onClick={retry}>Try again</button>
        </div>
      )}
      {state.status === "ready" && (d.players > 0 ? (
        <>
          <div className="rs-figs two">
            <Figure value={d.players} label={d.players === 1 ? "Player finished" : "Players finished"}/>
            <Figure value={`${percent(d.solved, d.players)}%`} label="Solved" sub={`${d.solved} of ${d.players}`}/>
          </div>
          <LivesChart title="Lives used" rows={livesRows(d)} mine={counted ? mine : null}
            unit={["player","players"]} label={`Lives used by players on ${diffName}`}/>
          {d.players < 5 && <p className="rs-note">A small group so far: {d.players === 1 ? "one player" : `${d.players} players`}.</p>}
        </>
      ) : (
        <p className="rs-state">No signed-in player has finished this puzzle on {diffName} yet.</p>
      ))}
      {state.status !== "unavailable" && !counted && (
        <p className="rs-note">Guest results aren't counted here, so yours isn't included. Sign in to add future results.</p>
      )}
    </section>
  );
}

function OverallSection({ stats, mine, headingId }){
  const played = stats.totalPlayed || 0;
  return (
    <section className="rs-sec" aria-labelledby={headingId}>
      <h3 className="rs-h" id={headingId}>Your overall stats</h3>
      {played === 0 ? (
        <p className="rs-state">No puzzles finished yet. Your stats start with your first finished puzzle.</p>
      ) : (
        <>
          <div className="rs-figs">
            <Figure value={played} label="Played"/>
            <Figure value={`${percent(stats.totalWon || 0, played)}%`} label="Win %"/>
            <Figure value={stats.currentStreak || 0} label="Streak" sub={`Best ${stats.maxStreak || 0}`}/>
          </div>
          <LivesChart title="Lives used" rows={livesRows(stats.livesUsedDist)} mine={mine}
            unit={["puzzle","puzzles"]} label="Lives used across your finished puzzles"/>
        </>
      )}
    </section>
  );
}

/**
 *   puzzle       the official puzzle (title, date)
 *   record       { solved, livesUsed, difficulty } — required in "result" mode
 *   guessHistory the finished round's guesses, for the share grid (may be empty)
 *   stats        personal counters (loadStats)
 *   loadSummary  () => Promise<counts>, or null when there's no server record
 *   counted      whether this player's result is among those counts (signed in)
 *   onViewBoard / onPractice / onClose
 */
export default function Results({ mode = "result", puzzle, record, guessHistory = [], stats, loadSummary, counted,
  onClose, onViewBoard, onPractice }){
  const titleId = useId();
  const closeRef = useRef(null);
  const [copied,setCopied] = useState(null);   // null | "ok" | "fail"
  const closing = useRef(onClose);
  useEffect(()=>{ closing.current = onClose; });
  useEffect(()=>{
    const opener = document.activeElement;
    closeRef.current?.focus({ preventScroll:true });
    const esc = (e)=>{ if(e.key === "Escape") closing.current(); };
    document.addEventListener("keydown", esc);
    return ()=>{
      document.removeEventListener("keydown", esc);
      if(opener && document.contains(opener)) opener.focus?.({ preventScroll:true });
    };
  },[]);
  const share = useCallback(async ()=>{
    const ok = await copyText(shareText(puzzle, record, guessHistory));
    setCopied(ok ? "ok" : "fail");
    setTimeout(()=>setCopied(null), 2500);
  },[puzzle, record, guessHistory]);

  const isResult = mode === "result" && !!record;
  const used = record ? (record.solved ? Math.min(MAX_LIVES - 1, Math.max(0, Number(record.livesUsed) || 0)) : MAX_LIVES) : 0;
  const diffName = record ? (DIFFICULTY_LABELS[record.difficulty] || record.difficulty) : "";
  const mine = isResult ? resultRowKey(record) : null;

  return (
    <div className="rs-scope rs-backdrop" onClick={onClose}>
      <div className="rs-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e=>e.stopPropagation()}>
        <header className="rs-head">
          <h2 className="rs-title" id={titleId}>{isResult ? "Results" : "Your stats"}</h2>
          <button ref={closeRef} type="button" className="rs-close" onClick={onClose} aria-label={isResult ? "Close results" : "Close stats"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>
        <div className="rs-body">
          {isResult && (
            <section className={`rs-mine ${record.solved ? "won" : "lost"}`} aria-labelledby="rs-mine-h">
              <h3 className="rs-h rs-h-mine" id="rs-mine-h">Your result</h3>
              <p className="rs-puzzle">
                <span className="rs-puzzle-title">{puzzle.title || "Daily puzzle"}</span>
                <span className="rs-puzzle-meta">{formatDate(puzzle.date)}<span className="rs-chip">{diffName}</span></span>
              </p>
              <div className="rs-outcome">
                <span className="rs-outcome-word">{record.solved ? "Solved" : "Not solved"}</span>
                <span className="rs-lives" aria-label={`${used} of ${MAX_LIVES} lives used`}>
                  <span className="rs-stars" aria-hidden="true">
                    {Array.from({ length:MAX_LIVES }, (_, i)=><span key={i} className={`rs-star${i >= MAX_LIVES - used ? " used" : ""}`}>⭐</span>)}
                  </span>
                  <span aria-hidden="true">{record.solved && used === 0 ? "No lives lost" : `${used} of ${MAX_LIVES} lives used`}</span>
                </span>
              </div>
              <div className="rs-actions">
                <button type="button" className="rs-btn primary" onClick={share}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13"/></svg>
                  Share Results
                </button>
                {onViewBoard && (
                  <button type="button" className="rs-btn secondary" onClick={onViewBoard}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>
                    View Board
                  </button>
                )}
              </div>
              <p className="rs-copied" role="status" aria-live="polite">
                {copied === "ok" ? "Copied — paste it anywhere to share." : copied === "fail" ? "Couldn't copy here. Try again from another browser." : ""}
              </p>
              {onPractice && (
                <button type="button" className="rs-link" onClick={onPractice}>Replay for practice — won't change this result</button>
              )}
            </section>
          )}
          {isResult && (
            <EveryoneSection load={loadSummary} difficulty={record.difficulty} mine={mine} counted={counted}/>
          )}
          <OverallSection stats={stats} mine={mine} headingId={`${titleId}-overall`}/>
        </div>
      </div>
    </div>
  );
}
