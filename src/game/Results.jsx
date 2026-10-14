// The results of a finished official puzzle, and the player's own stats, in
// one dialog:
//   summary      Daily #N · difficulty, a headline, the lives left, Share, View board
//   My stats     played, win %, current and best streak, and "Lives used"
//   This puzzle  everyone's results on this puzzle at the SAME difficulty
//   footer       the countdown to the next daily, and a practice replay
// mode "stats" (the header's Stats button) shows My stats alone.
//
// Opening, closing or switching tabs never touches the game: it reads the
// saved result and the counters, and the only thing it can start is a
// practice replay, which the player picks on purpose and which records nothing.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DIFFICULTY_LABELS, MAX_LIVES } from "./shared.js";
import { livesRows, percent, resultRowKey, resultWords, shareText } from "./dailyResults.js";
import { dailyName } from "./dailyNumber.js";
import "./results.css";

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

// Hours:minutes:seconds to the next local midnight, when the next daily opens
// (the game switches puzzles on the player's own date, src/App.jsx).
function useNextDaily(){
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{
    const t = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(t);
  },[]);
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const p = (n)=>String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

// A horizontal "Lives used" chart. Bars share one scale (the largest row);
// the "You" marker has its own column on every row, so marking a row never
// shortens it. A zero draws no bar, only its 0; a small count keeps a bar
// wide enough to read its number.
function LivesChart({ rows, mine, unit, label }){
  const max = Math.max(1, ...rows.map(r=>r.count));
  const marked = rows.some(r=>r.key === mine);
  return (
    <ul className={`rs-chart${marked ? " marked" : ""}`} aria-label={label}>
      {rows.map(r=>{
        const isMine = r.key === mine;
        const what = r.key === "X" ? "Not solved" : `${livesPhrase(Number(r.key))} used`;
        return (
          <li key={r.key} className={`rs-row${isMine ? " mine" : ""}`}
            aria-label={`${what}: ${r.count} ${r.count === 1 ? unit[0] : unit[1]}${isMine ? " (your result)" : ""}`}>
            <span className="rs-row-key" aria-hidden="true">{r.label}</span>
            <span className="rs-row-track" aria-hidden="true">
              {r.count > 0
                ? <span className="rs-row-bar" style={{ width:`max(2.4em, ${(r.count / max * 100).toFixed(2)}%)` }}>{r.count}</span>
                : <span className="rs-row-zero">0</span>}
            </span>
            {marked && <span className="rs-row-you" aria-hidden="true">{isMine ? "You" : ""}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Figures({ items }){
  return (
    <dl className={`rs-figs n${items.length}`}>
      {items.map(f=>(
        <div key={f.label} className="rs-fig">
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MyStats({ stats, mine }){
  const played = stats.totalPlayed || 0;
  if(played === 0) return <p className="rs-state">No daily puzzles finished yet. Your stats start with your first one.</p>;
  return (
    <>
      <h3 className="rs-h">Statistics</h3>
      <Figures items={[
        { label:"Played", value:played },
        { label:"Win %", value:`${percent(stats.totalWon || 0, played)}%` },
        { label:"Current streak", value:stats.currentStreak || 0 },
        { label:"Best streak", value:stats.maxStreak || 0 },
      ]}/>
      <h3 className="rs-h">Lives used</h3>
      <p className="rs-sub">Your finished daily puzzles</p>
      <LivesChart rows={livesRows(stats.livesUsedDist)} mine={mine}
        unit={["puzzle","puzzles"]} label="Lives used across your finished daily puzzles"/>
    </>
  );
}

// Everyone on this puzzle, at the player's difficulty. `load` resolves to the
// counts (puzzle_result_summary) or rejects; null means there's nothing to ask.
function ThisPuzzle({ load, difficulty, mine, counted, today }){
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
  const d = state.data;
  return (
    <>
      <h3 className="rs-h">{today ? "Today's results" : "Puzzle results"}</h3>
      <p className="rs-sub">{diffName} difficulty · signed-in players only</p>
      {state.status === "unavailable" && <p className="rs-state">Other players' results aren't available for this puzzle.</p>}
      {state.status === "loading" && <p className="rs-state" role="status"><span className="rs-spin" aria-hidden="true"/>Loading…</p>}
      {state.status === "error" && (
        <p className="rs-state err" role="alert">
          Couldn't load other players' results.
          <button type="button" className="rs-retry" onClick={()=>{ setState({ status:"loading" }); setAttempt(a=>a+1); }}>Try again</button>
        </p>
      )}
      {state.status === "ready" && (d.players > 0 ? (
        <>
          <Figures items={[
            { label:"Played", value:d.players.toLocaleString("en-US") },
            { label:"Solved", value:`${percent(d.solved, d.players)}%` },
            { label:"Perfect", value:`${percent(d.lives_0, d.players)}%` },
          ]}/>
          <h3 className="rs-h">Lives used</h3>
          <LivesChart rows={livesRows(d)} mine={counted ? mine : null}
            unit={["player","players"]} label={`Lives used by players on ${diffName}`}/>
          <p className="rs-note">
            {d.players < 10 ? `Only ${d.players === 1 ? "one player" : `${d.players} players`} so far. ` : ""}
            {counted ? "Your result is highlighted." : "Guest results aren't stored, so yours isn't counted."}
          </p>
        </>
      ) : (
        <p className="rs-state">
          No signed-in player has finished this puzzle on {diffName} yet.
          {!counted && " Guest results aren't stored."}
        </p>
      ))}
    </>
  );
}

const CrystalMark = () => (
  <svg className="rs-mark" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="10.5" r="7"/><path d="M7.5 19.5h9l-1.2-3H8.7z"/><path d="M9.6 7.4a3.2 3.2 0 012.6-1.3"/>
  </svg>
);

/**
 *   puzzle       the official puzzle (date)
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
  const tabsId = useId();
  const closeRef = useRef(null);
  const [tab,setTab] = useState("mine");
  const [copied,setCopied] = useState(null);   // null | "ok" | "fail"
  const nextDaily = useNextDaily();
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

  // The Share button answers in its own label ("Copied ✓", or "Copy failed"),
  // then goes back to "Share results"; nothing is added around it. Each click
  // restarts the timer, so repeated clicks never leave a stale label behind.
  const copiedTimer = useRef(null);
  useEffect(()=>()=>clearTimeout(copiedTimer.current),[]);
  const share = useCallback(async ()=>{
    clearTimeout(copiedTimer.current);
    setCopied(null);
    const ok = await copyText(shareText(record, guessHistory, puzzle?.date));
    setCopied(ok ? "ok" : "fail");
    copiedTimer.current = setTimeout(()=>setCopied(null), ok ? 2000 : 3500);
  },[record, guessHistory, puzzle?.date]);

  const isResult = mode === "result" && !!record;
  const used = record ? (record.solved ? Math.min(MAX_LIVES - 1, Math.max(0, Number(record.livesUsed) || 0)) : MAX_LIVES) : 0;
  const diffName = record ? (DIFFICULTY_LABELS[record.difficulty] || record.difficulty) : "";
  const mine = isResult ? resultRowKey(record) : null;
  const words = isResult ? resultWords(record) : null;
  const today = (()=>{ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const tabs = [{ key:"mine", label:"My stats" }, { key:"puzzle", label:"This puzzle" }];
  const onTabKey = (e)=>{
    const step = { ArrowRight:1, ArrowLeft:-1, Home:-9, End:9 }[e.key];
    if(!step) return;
    e.preventDefault();
    const next = step > 0 ? "puzzle" : "mine";
    setTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };

  return (
    <div className="rs-scope rs-backdrop" onClick={onClose}>
      <div className="rs-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e=>e.stopPropagation()}>
        <header className="rs-head">
          <span className="rs-brand"><CrystalMark/>Cluevoyance</span>
          <button ref={closeRef} type="button" className="rs-close" onClick={onClose} aria-label={isResult ? "Close results" : "Close stats"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>
        <div className="rs-body">
          {isResult ? (
            <section className={`rs-summary ${record.solved ? "won" : "lost"}`} aria-labelledby={titleId}>
              <p className="rs-kicker">{dailyName(puzzle?.date)} · {diffName}</p>
              <h2 className="rs-headline" id={titleId}>{words.headline}</h2>
              <p className="rs-lives">
                <span className="rs-stars" role="img" aria-label={`${MAX_LIVES - used} of ${MAX_LIVES} lives left`}>
                  {Array.from({ length:MAX_LIVES }, (_, i)=><span key={i} className={`rs-star${i >= MAX_LIVES - used ? " used" : ""}`} aria-hidden="true">★</span>)}
                </span>
                <span>{words.line}</span>
              </p>
              <button type="button" className={`rs-share${copied ? ` ${copied}` : ""}`} onClick={share}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13"/></svg>
                <span className="rs-share-label">{copied === "ok" ? "Copied ✓" : copied === "fail" ? "Copy failed" : "Share results"}</span>
              </button>
              {/* Said aloud, never shown: the layout stays exactly as it is. */}
              <span className="rs-sr" role="status" aria-live="polite">{copied === "ok" ? "Results copied. Paste them anywhere to share." : ""}</span>
              <span className="rs-sr" role="alert">{copied === "fail" ? "Couldn't copy here. Try another browser." : ""}</span>
              {onViewBoard && <button type="button" className="rs-link" onClick={onViewBoard}>View board</button>}
            </section>
          ) : (
            <h2 className="rs-headline small" id={titleId}>Your stats</h2>
          )}

          {isResult ? (
            <>
              <div className="rs-tabs" role="tablist" aria-label="Statistics">
                {tabs.map(t=>(
                  <button key={t.key} type="button" role="tab" id={`${tabsId}-${t.key}`}
                    aria-selected={tab === t.key} aria-controls={`${tabsId}-${t.key}-panel`} tabIndex={tab === t.key ? 0 : -1}
                    className={`rs-tab${tab === t.key ? " on" : ""}`} onClick={()=>setTab(t.key)} onKeyDown={onTabKey}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="rs-panel" role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
                {tab === "mine"
                  ? <MyStats stats={stats} mine={mine}/>
                  : <ThisPuzzle load={loadSummary} difficulty={record.difficulty} mine={mine} counted={counted} today={puzzle.date === today}/>}
              </div>
            </>
          ) : (
            <div className="rs-panel"><MyStats stats={stats} mine={null}/></div>
          )}

          <footer className="rs-foot">
            <p>Next daily in <b className="rs-count">{nextDaily}</b></p>
            {isResult && onPractice && <button type="button" className="rs-link" onClick={onPractice}>Replay for practice</button>}
          </footer>
        </div>
      </div>
    </div>
  );
}
