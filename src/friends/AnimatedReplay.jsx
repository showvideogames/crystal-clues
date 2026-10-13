import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { friendPuzzleForGame } from "./puzzle";
import { describeStep, recordedGuessResult } from "./moveLog";

// "Watch … guesses": the finished puzzle played back on the real board from
// its move log (moveLog.js) — every turn, move, swap, Rotate, Shuffle and
// Reset in the order it happened, and each Submit through the game's own
// reveal with the recorded result. Nothing here talks to the server: the
// board answers Submit from the recorded guesses, so watching changes no
// score, result, streak or notification, and a win isn't celebrated again.
//   plan: buildReplay(view, log)
//
// Controls: Play/Pause, Restart (back to the beginning, paused), Previous
// guess (back to the last completed guess — or the one before, if that's
// where it stands — paused there), and the speed (0.5×, 1×, 2×; changing it
// never restarts anything). Going back doesn't rewind animations: it cancels
// everything still pending and mounts a fresh board at that point, rebuilt
// from the recorded guesses, so nothing from before can play on afterwards.

// Pacing, in milliseconds at 1× (0.5× doubles and 2× halves every number
// here). The time the player spent thinking is not replayed at all: each
// move animates, then a short pause, then the next. A Submit plays the
// game's own reveal (its own timing, not scaled).
const PACING = {
  pause: 350,        // after each move, before the next
  pauseStill: 700,   // the same with reduced motion (moves land at once, so a longer look)
  glide: 480,        // one card gliding to its new place (a swap)
  bigGlide: 620,     // several cards at once (Reset, a board that jumps)
  noteBeat: 600,     // a caption-only step ("Came back to the puzzle")
  start: 350,        // the freshly mounted board settles before the first move
};
// Once a guess and all its animations have finished, its result stays up
// this long before the next move: reading time, the same at every speed.
const GUESS_HOLD = 2000;
const SPEEDS = [0.5, 1, 2];

// A wait that ends early, resolving false, when the run is cancelled.
const wait = (ms, signal) => new Promise((resolve)=>{
  if(signal.aborted) return resolve(false);
  const stop = ()=>{ clearTimeout(t); resolve(false); };
  const t = setTimeout(()=>{ signal.removeEventListener("abort", stop); resolve(true); }, ms);
  signal.addEventListener("abort", stop, { once:true });
});
// Settles when `promise` does, or at once when the run is cancelled.
const orCancel = (promise, signal) => Promise.race([
  Promise.resolve(promise),
  new Promise((resolve)=>{ if(signal.aborted) resolve(); else signal.addEventListener("abort", ()=>resolve(), { once:true }); }),
]);
// True once playing; false if the run is cancelled first.
const untilPlaying = (c, signal) => c.playing ? Promise.resolve(!signal.aborted)
  : new Promise((resolve)=>{
    if(signal.aborted) return resolve(false);
    c.resume = ()=>resolve(!signal.aborted);
    signal.addEventListener("abort", ()=>resolve(false), { once:true });
  });

// The words the board shows under a completed (wrong) guess, as the game says them.
function verdict(view, k) {
  const g = view.guesses[k - 1], prev = view.guesses[k - 2];
  const gained = g.correct.length - (prev ? prev.correct.length : 0);
  const l = g.lives_left;
  return gained > 0 ? `${gained} confirmed! ${l} ${l === 1 ? "life" : "lives"} left.`
    : `Not quite — ${l} ${l === 1 ? "life" : "lives"} remaining.`;
}

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced,setReduced] = useState(()=>!!window.matchMedia?.(query).matches);
  useEffect(()=>{
    const mq = window.matchMedia?.(query);
    if(!mq) return undefined;
    const on = ()=>setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return ()=>mq.removeEventListener?.("change", on);
  },[]);
  return reduced;
}

export default function AnimatedReplay({ kit, view, plan, solverName }) {
  const { GameView } = kit;
  const still = useReducedMotion();
  // The board on screen: a fresh one per run, mounted at guess `at` (0 = the start).
  const [mount,setMount] = useState({ run:0, at:0 });
  const [status,setStatus] = useState("ready"); // ready | playing | paused | done
  const [phase,setPhase] = useState("idle");    // idle | move | pause | reveal | hold (for tests and styling)
  const [speed,setSpeed] = useState(1);
  const [caption,setCaption] = useState("");
  const [index,setIndex] = useState(-1);
  const apiRef = useRef(null);
  // run: bumps whenever the board is replaced; abort cancels that run's waits;
  // next: the step to play next; done: guesses completed so far; atCheckpoint:
  // nothing has happened since the last completed guess (or the start).
  const ctl = useRef({ run:0, playing:false, speed:1, resume:null, abort:new AbortController(),
    looping:false, next:0, done:0, atCheckpoint:true });
  const barRef = useRef(null);
  const fitRef = useRef(null);
  const [fit,setFit] = useState({ scale:1, height:0 });
  const who = solverName === "You" ? "You" : solverName;
  const total = plan.steps.length;
  const guessCount = view.guesses.length;
  // The step index of each guess: guessStep[n] for guess n.
  const guessStep = useMemo(()=>{
    const at = [];
    plan.steps.forEach((s, i)=>{ if(s.kind === "guess") at[s.n] = i; });
    return at;
  },[plan.steps]);

  // The whole board — tray, controls and Submit included — fits on screen
  // under the sticky panel, so no move happens out of sight on a phone.
  useEffect(()=>{
    const inner = fitRef.current;
    if(!inner) return undefined;
    const scroller = inner.closest(".fr-wrap") || document.body;
    const measure = ()=>{
      const natural = inner.offsetHeight;
      // Visible height below the app header, minus the sticky panel.
      const screen = window.visualViewport?.height || window.innerHeight;
      const top = Math.max(0, scroller.getBoundingClientRect().top);
      const room = screen - top - (barRef.current?.offsetHeight || 0) - 24;
      const scale = natural ? Math.max(.6, Math.min(1, room / natural)) : 1;
      setFit(f=> Math.abs(f.scale - scale) > .01 || Math.abs(f.height - natural) > 2 ? { scale, height:natural } : f);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    window.addEventListener("resize", measure);
    return ()=>{ ro.disconnect(); window.removeEventListener("resize", measure); };
  },[]);
  // Leaving the page cancels everything still pending. (A fresh controller on
  // every mount: React's development double-mount runs this cleanup once.)
  useEffect(()=>{
    const c = ctl.current;
    c.abort = new AbortController();
    return ()=>{ c.run += 1; c.playing = false; c.looping = false; c.abort.abort(); };
  },[]);

  const puzzle = useMemo(()=>friendPuzzleForGame(view),[view]);
  // The board's Submit, answered from the record: no server call. Mounted at
  // guess k, the board already holds the first k guesses.
  const friend = useMemo(()=>({
    puzzle:{ ...view, guesses:view.guesses.slice(0, mount.at) },
    submitGuess:({ guessNo })=>Promise.resolve(recordedGuessResult(view, guessNo)),
    onFinished:()=>{},
    onStale:()=>{},
  }),[view, mount.at]);
  const replay = useMemo(()=>({ init:plan.init, apiRef, still,
    feedback: mount.at ? verdict(view, mount.at) : "" }),[plan.init, still, view, mount.at]);

  const perform = useCallback((step)=>{
    const api = apiRef.current;
    const k = ctl.current.speed;
    const final = step.kind === "guess" && step.n === guessCount;
    switch(step.kind){
      case "tap": return api.tap(step.s);
      case "swap": return api.swap(step.a, step.b, PACING.glide / k);
      case "rotate": return api.rotate();
      case "shuffle": return api.shuffle(step.slots);
      case "reset": return api.reset(step.slots, step.clues, PACING.bigGlide / k);
      case "jump": return api.setBoard(step.slots, step.clues, PACING.bigGlide / k);
      case "resume":
        if(step.moved) return api.setBoard(step.slots, step.clues, PACING.bigGlide / k);
        return new Promise(r=>setTimeout(r, PACING.noteBeat / k));
      // Resolves once the reveal and its last animation have finished.
      case "guess": return api.submit(0, final);
      default: return undefined;
    }
  },[guessCount]);

  const playLoop = useCallback(async (myRun, from, signal)=>{
    const c = ctl.current;
    const live = ()=>!signal.aborted && c.run === myRun;
    // Let the freshly mounted board settle before the first move.
    if(!await wait(PACING.start / c.speed, signal)) return;
    for(let i = from; i < plan.steps.length; i++){
      if(!await untilPlaying(c, signal)) return;
      const step = plan.steps[i];
      // A short pause after the previous move (a guess's hold already was one).
      // The recorded wait (step.d) is deliberately ignored.
      if(i && plan.steps[i-1].kind !== "guess"){
        setPhase("pause");
        if(!await wait((still ? PACING.pauseStill : PACING.pause) / c.speed, signal)) return;
        if(!await untilPlaying(c, signal)) return;
      }
      if(!live() || !apiRef.current) return;
      c.atCheckpoint = false;
      setIndex(i);
      setCaption(describeStep(step, { firstGuessDone:step.firstGuessDone }));
      setPhase(step.kind === "guess" ? "reveal" : "move");
      await orCancel(perform(step), signal);
      if(!live()) return;
      c.next = i + 1;
      if(step.kind === "guess"){
        c.done = step.n;
        c.atCheckpoint = true;
        setPhase("hold");
        if(!await wait(GUESS_HOLD, signal)) return;
      }
    }
    c.playing = false;
    c.looping = false;
    setPhase("idle");
    setStatus("done");
    setCaption(view.outcome === "won" ? `${who} solved it` : "Out of lives — the answer is revealed");
  },[plan, perform, still, view.outcome, who]);

  // A fresh board at guess k (0 = the start), paused. Everything the last
  // board had pending is cancelled first.
  const jumpTo = useCallback((k)=>{
    const c = ctl.current;
    c.abort.abort();
    c.abort = new AbortController();
    c.run += 1;
    c.playing = false;
    c.looping = false;
    c.resume = null;
    c.next = k ? guessStep[k] + 1 : 0;
    c.done = k;
    c.atCheckpoint = true;
    setMount({ run:c.run, at:k });
    setIndex(k ? guessStep[k] : -1);
    setCaption(k ? describeStep(plan.steps[guessStep[k]]) : "");
    setPhase("idle");
    setStatus(k ? "paused" : "ready");
  },[guessStep, plan.steps]);

  const toTop = ()=>barRef.current?.scrollIntoView({ block:"start", behavior: still ? "auto" : "smooth" });
  const play = ()=>{
    toTop();
    const c = ctl.current;
    if(status === "done") jumpTo(0);
    c.playing = true;
    setStatus("playing");
    if(c.looping) { c.resume?.(); return; }
    c.looping = true;
    playLoop(c.run, c.next, c.abort.signal);
  };
  const pause = ()=>{ ctl.current.playing = false; setStatus("paused"); };
  const restart = ()=>jumpTo(0);
  const previous = ()=>{
    const c = ctl.current;
    jumpTo(Math.max(0, c.atCheckpoint ? c.done - 1 : c.done));
  };
  const changeSpeed = (s)=>{ ctl.current.speed = s; setSpeed(s); };

  const atStart = index < 0;
  // The guess being worked towards (or just submitted).
  const guessNow = Math.min(guessCount, 1 + plan.steps.slice(0, Math.max(0, index)).filter(s=>s.kind === "guess").length);
  const mainLabel = status === "playing" ? "Pause" : status === "done" ? "Replay" : "Play";

  return (
    <div className="fr-anim" data-phase={phase} data-status={status}>
      {plan.missing && (
        <p className="fr-anim-note">Some moves weren't recorded (it may have been played in another browser),
          so in places the board jumps straight to the guess that was submitted.</p>
      )}
      <div className="fr-card fr-anim-bar" ref={barRef}>
        <div className="fr-anim-top">
          <div className="fr-replay-step">{atStart ? "Every move, in order" : `Guess ${guessNow} of ${guessCount}`}</div>
          <div className="fr-anim-speed" role="group" aria-label="Speed">
            {SPEEDS.map(s=>(
              <button key={s} type="button" className={speed === s ? "on" : ""} aria-pressed={speed === s}
                onClick={()=>changeSpeed(s)}>{s}×</button>
            ))}
          </div>
        </div>
        <div className="fr-anim-caption" aria-live="polite">{caption || (atStart ? `Watch ${who === "You" ? "your" : `${who}'s`} play` : " ")}</div>
        <div className="fr-anim-progress" role="progressbar" aria-label="Replay progress"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(0, index + 1)}>
          <span style={{ width:`${total ? ((index + 1) / total) * 100 : 0}%` }}/>
        </div>
        <div className="fr-anim-transport">
          <button type="button" className="fr-anim-btn" onClick={restart} disabled={atStart && status !== "playing"}
            aria-label="Restart the replay">
            <Icon name="restart" size={15}/>Restart
          </button>
          <button type="button" className="fr-anim-btn" onClick={previous} disabled={atStart && status !== "playing"}
            aria-label="Previous guess">
            <Icon name="prev" size={15}/>Previous guess
          </button>
          <button type="button" className={`fr-playall${status === "playing" ? " on" : ""}`} onClick={status === "playing" ? pause : play}
            aria-label={status === "playing" ? "Pause the replay" : status === "done" ? "Replay from the start" : "Play the replay"}>
            <Icon name={status === "playing" ? "pause" : status === "done" ? "restart" : "play"} size={14}/>{mainLabel}
          </button>
        </div>
      </div>
      <div className={`fr-replay-game${still ? " still" : ""}`} aria-hidden="true"
        style={{ height: fit.height ? fit.height * fit.scale : undefined }}>
        <div ref={fitRef} className="fr-replay-fit" style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}>
          <GameView key={`replay-${mount.run}`} puzzle={puzzle} difficulty={view.difficulty} friend={friend} replay={replay}/>
        </div>
      </div>
    </div>
  );
}
