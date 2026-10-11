import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { friendPuzzleForGame } from "./puzzle";
import { describeStep, recordedGuessResult } from "./moveLog";

// "Watch … guesses": the finished puzzle played back on the real board from
// its move log (moveLog.js) — every turn, move, swap, Rotate, Shuffle and
// Reset in the order it happened, and each Submit through the game's own
// reveal with the recorded result. Nothing here talks to the server: the
// board answers Submit from the recorded guesses, so watching changes no
// score, result, streak or notification.
//   plan: buildReplay(view, log)

// Pacing, in milliseconds at 1× (2× halves every number here). The time the
// player spent thinking is not replayed at all: each move animates, then a
// short pause, then the next. A Submit plays the game's own reveal (its own
// timing, not scaled), and its result then stays up for guessHold.
// Tune these after playtesting.
const PACING = {
  pause: 350,        // after each move, before the next
  pauseStill: 700,   // the same with reduced motion (moves land at once, so a longer look)
  guessHold: 1000,   // a guess's result stays up this long once its reveal has finished
  glide: 480,        // one card gliding to its new place (a swap)
  bigGlide: 620,     // several cards at once (Reset, a board that jumps)
  noteBeat: 600,     // a caption-only step ("Came back to the puzzle")
  start: 350,        // the freshly mounted board settles before the first move
};
const SPEEDS = [1, 2];
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
// Resolves at once while playing; otherwise when Play is pressed again.
const untilPlaying = (c)=> c.playing ? Promise.resolve() : new Promise(r=>{ c.resume = r; });

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
  const [run,setRun] = useState(0);            // remounts the board for Replay
  const [status,setStatus] = useState("ready"); // ready | playing | paused | done
  const [speed,setSpeed] = useState(1);
  const [caption,setCaption] = useState("");
  const [index,setIndex] = useState(-1);
  const apiRef = useRef(null);
  const ctl = useRef({ run:0, playing:false, speed:1, resume:null });
  const barRef = useRef(null);
  const fitRef = useRef(null);
  const [fit,setFit] = useState({ scale:1, height:0 });
  const who = solverName === "You" ? "You" : solverName;

  useEffect(()=>{ ctl.current.speed = speed; },[speed]);

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
  // Leaving the page stops the loop.
  useEffect(()=>()=>{ ctl.current.run += 1; ctl.current.resume?.(); },[]);

  const puzzle = useMemo(()=>friendPuzzleForGame(view),[view]);
  // The board's Submit, answered from the record: no server call.
  const friend = useMemo(()=>({
    puzzle:{ ...view, guesses:[] },
    submitGuess:({ guessNo })=>Promise.resolve(recordedGuessResult(view, guessNo)),
    onFinished:()=>{},
    onStale:()=>{},
  }),[view]);
  const replay = useMemo(()=>({ init:plan.init, apiRef, still }),[plan.init, still]);

  const perform = useCallback(async (step)=>{
    const api = apiRef.current;
    const k = ctl.current.speed;
    const final = step.kind === "guess" && step.n === view.guesses.length;
    switch(step.kind){
      case "tap": return api.tap(step.s);
      case "swap": return api.swap(step.a, step.b, PACING.glide / k);
      case "rotate": return api.rotate();
      case "shuffle": return api.shuffle(step.slots);
      case "reset": return api.reset(step.slots, step.clues, PACING.bigGlide / k);
      case "jump": return api.setBoard(step.slots, step.clues, PACING.bigGlide / k);
      case "resume":
        if(step.moved) return api.setBoard(step.slots, step.clues, PACING.bigGlide / k);
        return sleep(PACING.noteBeat / k);
      // Resolves after the reveal has finished and its result has been held.
      case "guess": return api.submit(PACING.guessHold / k, final);
      default: return undefined;
    }
  },[view.guesses.length]);

  const playLoop = useCallback(async (myRun)=>{
    const c = ctl.current;
    const alive = ()=>c.run === myRun;
    // Let the freshly mounted board settle before the first move.
    await sleep(PACING.start / c.speed);
    for(let i = 0; i < plan.steps.length; i++){
      await untilPlaying(c);
      if(!alive()) return;
      const step = plan.steps[i];
      // A short pause after the previous move (a guess's hold already was one).
      // The recorded wait (step.d) is deliberately ignored.
      if(i && plan.steps[i-1].kind !== "guess") await sleep((still ? PACING.pauseStill : PACING.pause) / c.speed);
      await untilPlaying(c);
      if(!alive() || !apiRef.current) return;
      setIndex(i);
      setCaption(describeStep(step, { firstGuessDone:step.firstGuessDone }));
      await perform(step);
      if(!alive()) return;
    }
    c.playing = false;
    setStatus("done");
    setCaption(view.outcome === "won" ? `${who} solved it` : "Out of lives — the answer is revealed");
  },[plan, perform, still, view.outcome, who]);

  const start = ()=>{
    // Panel to the top; the board fits beneath it.
    barRef.current?.scrollIntoView({ block:"start", behavior: still ? "auto" : "smooth" });
    const c = ctl.current;
    c.run += 1;
    c.playing = true;
    c.resume?.();
    setRun(c.run);
    setIndex(-1);
    setCaption("");
    setStatus("playing");
    playLoop(c.run);
  };
  const pause = ()=>{ ctl.current.playing = false; setStatus("paused"); };
  const resume = ()=>{
    barRef.current?.scrollIntoView({ block:"start", behavior: still ? "auto" : "smooth" });
    ctl.current.playing = true; ctl.current.resume?.(); setStatus("playing"); };

  const total = plan.steps.length;
  // The guess being worked towards (or just submitted).
  const guessNow = Math.min(view.guesses.length, 1 + plan.steps.slice(0, Math.max(0, index)).filter(s=>s.kind === "guess").length);
  const mainLabel = status === "playing" ? "Pause" : status === "paused" ? "Play" : status === "done" ? "Replay" : "Play";
  const onMain = status === "playing" ? pause : status === "paused" ? resume : start;

  return (
    <div className="fr-anim">
      {plan.missing && (
        <p className="fr-anim-note">Some moves weren't recorded (it may have been played in another browser),
          so in places the board jumps straight to the guess that was submitted.</p>
      )}
      <div className="fr-card fr-anim-bar" ref={barRef}>
        <div className="fr-anim-top">
          <div className="fr-replay-step">{index < 0 ? "Every move, in order" : `Guess ${guessNow} of ${view.guesses.length}`}</div>
          <button type="button" className={`fr-playall${status === "playing" ? " on" : ""}`} onClick={onMain}
            aria-label={status === "playing" ? "Pause the replay" : status === "done" ? "Replay from the start" : "Play the replay"}>
            <Icon name={status === "playing" ? "pause" : status === "done" ? "restart" : "play"} size={14}/>{mainLabel}
          </button>
        </div>
        <div className="fr-anim-caption" aria-live="polite">{caption || (index < 0 ? `Watch ${who === "You" ? "your" : `${who}'s`} play` : " ")}</div>
        <div className="fr-anim-row">
          <div className="fr-anim-progress" role="progressbar" aria-label="Replay progress"
            aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(0, index + 1)}>
            <span style={{ width:`${total ? ((index + 1) / total) * 100 : 0}%` }}/>
          </div>
          {(status === "playing" || status === "paused") && (
            <button type="button" className="fr-anim-small" onClick={start} aria-label="Replay from the start">
              <Icon name="restart" size={15}/>
            </button>
          )}
          <div className="fr-anim-speed" role="group" aria-label="Speed">
            {SPEEDS.map(s=>(
              <button key={s} type="button" className={speed === s ? "on" : ""} aria-pressed={speed === s}
                onClick={()=>setSpeed(s)}>{s}×</button>
            ))}
          </div>
        </div>
      </div>
      <div className={`fr-replay-game${still ? " still" : ""}`} aria-hidden="true"
        style={{ height: fit.height ? fit.height * fit.scale : undefined }}>
        <div ref={fitRef} className="fr-replay-fit" style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}>
          <GameView key={`replay-${run}`} puzzle={puzzle} difficulty={view.difficulty} friend={friend} replay={replay}/>
        </div>
      </div>
    </div>
  );
}
