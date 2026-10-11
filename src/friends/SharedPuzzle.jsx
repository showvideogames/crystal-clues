import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./client";
import { guestKey, rememberSaveIntent, hasSaveIntent, clearSaveIntent } from "./guestKey";
import { navigate, paths } from "../route";
import { Spinner } from "./ui.jsx";
import FriendPlay from "./FriendPlay.jsx";
import ChooseDifficulty from "./ChooseDifficulty.jsx";
import "./friends.css";

// A puzzle someone made for you and texted as a link: /p/<code>. No account
// needed. Opening it only reads; tapping Play starts it in this browser
// (guestKey.js), and only this browser can carry on, see the result, or save
// it. Afterwards the one offer is "Make one for <sender>": it saves the
// result to your account (signing in or up first if needed), connects you
// with the sender (once; the server reuses an existing friendship) and opens
// the creator for your puzzle back. All the rules are in the share-links
// migration; nothing here starts a Friend Streak.
//   account: useAccount() (App.jsx)

const until = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function SharedPuzzle({ kit, token, account, onHowToPlay, onPlayDaily }) {
  const key = useMemo(()=>guestKey(),[]);
  const [state,setState] = useState(null);
  const [error,setError] = useState("");
  const [tick,setTick] = useState(0);
  const [step,setStep] = useState(null);   // before making one back: "account" (why to sign in) or "name"
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState("");
  const signedIn = account.status === "signed_in";
  const settled = account.status !== "checking";

  useEffect(()=>{
    if(!settled) return undefined;
    let alive = true;
    api.openShared(token, key)
      .then(s=>{ if(alive){ setState(s); setError(""); } })
      .catch(err=>{ if(alive) setError(err.message); });
    return ()=>{ alive = false; };
  },[token, key, tick, settled, signedIn]);

  const creator = state?.creator_name || state?.puzzle?.creator_name || "Your friend";

  // Save the result to this account, then straight on to making one back.
  // The intent to make one survives the sign-in round trip and a refresh
  // until this succeeds.
  const saveAndMake = useCallback(async ()=>{
    setSaving(true); setSaveError("");
    try {
      const r = await api.claimShared(token, key);
      clearSaveIntent();
      navigate(paths.make(r.friendship_id), { replace:true, state:{ friendName:creator, savedShared:true } });
    } catch(err){
      setSaving(false);
      if(err.code === "no_profile"){ setStep("name"); return; }
      clearSaveIntent();
      setSaveError(err.message);
    }
  },[token, key, creator]);

  // The one offer after the game. Signed out: first, why an account.
  const makeOne = useCallback(()=>{
    if(saving) return;
    if(!signedIn){ setStep("account"); return; }
    saveAndMake();
  },[saving, signedIn, saveAndMake]);
  const signInToMake = useCallback(async ()=>{
    rememberSaveIntent(token);   // finished when this tab comes back signed in
    await account.signIn();      // still here: unavailable, account.message says why
  },[token, account]);

  // Back from signing in after tapping "Make one…": carry on, exactly once.
  // Otherwise a result already saved to this account lives in Friends now.
  const finished = state?.status === "yours" && !!state.puzzle?.finished_at;
  const saved = state?.status === "saved_yours";
  const resume = useRef(hasSaveIntent(token));
  useEffect(()=>{
    if(!signedIn) return;
    if((finished || saved) && resume.current){
      resume.current = false;
      Promise.resolve().then(saveAndMake);
    } else if(saved && !saving){
      navigate(paths.result(state.puzzle_id), { replace:true });
    }
  },[signedIn, finished, saved, saving, saveAndMake, state]);

  const source = useMemo(()=>({
    open: async ()=>{
      const s = await api.openShared(token, key);
      if(s.status !== "yours"){ setState(s); throw new Error("This puzzle isn't available here any more."); }
      return s.puzzle;
    },
    guess: (g)=>api.guessShared(token, key, g),
    saveMoves: (batch)=>api.saveSharedMoves(token, key, batch),
  }),[token, key]);

  if(error) return <Note title="Couldn't open this puzzle" text={error} onPlayDaily={onPlayDaily}/>;
  if(!state || !settled) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub" style={{textAlign:"center",padding:30}}>Opening puzzle…</p></div></div>;

  if(saving) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub" style={{textAlign:"center",padding:30}}>Saving your result…</p></div></div>;
  if(step === "name"){
    return <SaveName creator={creator} onSaved={()=>{ setStep(null); saveAndMake(); }}/>;
  }
  if(step === "account" && !signedIn){
    return <AccountStep creator={creator} account={account} onSignIn={signInToMake} onBack={()=>setStep(null)}/>;
  }

  switch(state.status){
    case "available":
      return (
        <ChooseDifficulty creator={creator} title={state.title}
          heading={`${creator} made you a puzzle`}
          sub={state.title ? `“${state.title}”` : null}
          startLabel="Play"
          note={`No account needed. Your game is saved in this browser until ${until(state.expires_at)}.`}
          onStart={(choice)=>api.startShared(token, key, choice)}
          onChosen={()=>setTick(t=>t+1)} onHowToPlay={onHowToPlay}/>
      );
    case "yours":
      return (
        <>
          {saveError && <div className="fr-page" style={{paddingBottom:0}}><div className="fr-msg err">{saveError}</div></div>}
          {account.message && <div className="fr-page" style={{paddingBottom:0}}><div className="fr-msg err">{account.message}</div></div>}
          <FriendPlay key={state.puzzle.id} kit={kit} puzzleId={state.puzzle.id} source={source}
            onBack={onPlayDaily} onHowToPlay={onHowToPlay}
            guest={{ backLabel:"Today's puzzle", onMake:makeOne }}/>
        </>
      );
    case "taken":
      return <Note title="This puzzle was started in another browser"
        text={`A game is saved in the browser where it was started. Open the link there to carry on. Stuck? Ask ${creator} to send you a fresh link.`}
        onPlayDaily={onPlayDaily}/>;
    case "expired":
      return <Note title="This link has expired"
        text={`Puzzle links work for 30 days. Ask ${creator} for a new one.`} onPlayDaily={onPlayDaily}/>;
    case "revoked":
      return <Note title="This link isn't shared any more"
        text={`${creator} stopped sharing it. Ask them for a new one.`} onPlayDaily={onPlayDaily}/>;
    case "saved":
      return <Note title="This puzzle has been saved to an account"
        text={signedIn ? "It's saved to a different account." : "Sign in to see it in Friends."}
        action={signedIn ? null : { label:"Sign in", onClick:()=>account.signIn() }} onPlayDaily={onPlayDaily}/>;
    case "own":
      return <Note title="This is your link"
        text="Send it to the person you made it for. You'll see their guesses in Friends when they finish."
        action={{ label:"Go to Friends", onClick:()=>navigate(paths.friends()) }} onPlayDaily={onPlayDaily}/>;
    case "saved_yours":
      return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub" style={{textAlign:"center",padding:30}}>Opening…</p></div></div>;
    default:
      return <Note title="This link doesn't work"
        text="Check the whole link was copied, or ask for a new one." onPlayDaily={onPlayDaily}/>;
  }
}

function Note({ title, text, action, onPlayDaily }) {
  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <div className="fr-hero">
          <div className="fr-hero-ball">🔮</div>
          <h1 className="fr-title">{title}</h1>
          <p className="fr-sub">{text}</p>
        </div>
        {action && <button className="fr-btn primary" onClick={action.onClick}>{action.label}</button>}
        <p className="fr-foot"><button className="fr-link" onClick={onPlayDaily}>Play today's puzzle</button></p>
      </div>
    </div>
  );
}

// "Make one for …" while signed out: one short reason, then the shared
// sign-in, which returns here and carries on (rememberSaveIntent).
function AccountStep({ creator, account, onSignIn, onBack }) {
  const [busy,setBusy] = useState(false);
  // Back from the sign-in page via the browser's Back button: tappable again.
  useEffect(()=>{
    const reset = (e)=>{ if(e.persisted) setBusy(false); };
    window.addEventListener("pageshow", reset);
    return ()=>window.removeEventListener("pageshow", reset);
  },[]);
  const go = async ()=>{ setBusy(true); await onSignIn(); setBusy(false); };
  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <div className="fr-hero">
          <div className="fr-hero-ball">✨</div>
          <h1 className="fr-title">Make one for {creator}</h1>
          <p className="fr-sub">Sign up so your puzzle can reach {creator}. It also saves your result and connects you with {creator}.</p>
        </div>
        <div className="fr-card">
          {account.message && <div className="fr-msg err">{account.message}</div>}
          <button className="fr-btn primary" onClick={go} disabled={busy} aria-busy={busy}>
            {busy ? <><Spinner/>Opening sign-in…</> : "Sign up or sign in"}</button>
          <p className="fr-help" style={{margin:0,textAlign:"center"}}>New here? Choose <b>Sign up</b> on the next page.</p>
        </div>
        <p className="fr-foot"><button className="fr-link" onClick={onBack}>Back to the board</button></p>
      </div>
    </div>
  );
}

// Signed in for the first time: a name for Friends, then on to making one back.
function SaveName({ creator, onSaved }) {
  const [name,setName] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const save = async (e)=>{
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.setName(name); onSaved(); }
    catch(err){ setError(err.message); setBusy(false); }
  };
  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <div className="fr-hero">
          <div className="fr-hero-ball">✨</div>
          <h1 className="fr-title">What's your name?</h1>
          <p className="fr-sub">{creator} will see it on the puzzle you make.</p>
        </div>
        <form className="fr-card" onSubmit={save}>
          <label className="fr-label" htmlFor="fr-name">Your name</label>
          <input id="fr-name" className="fr-input" maxLength={24} value={name} autoFocus autoComplete="given-name"
            onChange={e=>setName(e.target.value)} placeholder="e.g. Deb"/>
          {error && <div className="fr-msg err" style={{marginTop:10}}>{error}</div>}
          <button className="fr-btn primary" style={{marginTop:12}} disabled={busy || !name.trim()} aria-busy={busy}>
            {busy ? <><Spinner/>Saving…</> : "Continue"}</button>
        </form>
      </div>
    </div>
  );
}
