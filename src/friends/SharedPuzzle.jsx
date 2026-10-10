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
// it. Afterwards, signing in or up saves the result and makes you friends
// with the sender. All the rules are in the share-links migration.
//   account: useAccount() (App.jsx)

const until = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function SharedPuzzle({ kit, token, account, onHowToPlay, onPlayDaily }) {
  const key = useMemo(()=>guestKey(),[]);
  const [state,setState] = useState(null);
  const [error,setError] = useState("");
  const [tick,setTick] = useState(0);
  const [askName,setAskName] = useState(false);
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

  const claim = useCallback(async ()=>{
    setSaving(true); setSaveError("");
    try {
      const r = await api.claimShared(token, key);
      navigate(paths.result(r.puzzle_id), { replace:true });
    } catch(err){
      if(err.code === "no_profile"){ setAskName(true); setSaving(false); return; }
      setSaveError(err.message); setSaving(false);
    }
  },[token, key]);

  // The one offer after the game: sign in (or up) if needed, then save.
  const startSave = useCallback(async ()=>{
    if(!signedIn){
      rememberSaveIntent(token);   // finished when this tab comes back signed in
      await account.signIn();      // still here: unavailable, account.message says why
      return;
    }
    claim();
  },[signedIn, token, account, claim]);

  // Back from signing in after tapping "Save…": finish the save, exactly once.
  const finished = state?.status === "yours" && !!state.puzzle?.finished_at;
  const saveOnReturn = useRef(hasSaveIntent(token));
  useEffect(()=>{
    if(!(signedIn && finished && saveOnReturn.current)) return;
    saveOnReturn.current = false;
    clearSaveIntent();
    Promise.resolve().then(claim);
  },[signedIn, finished, claim]);

  // Already saved to this account: it lives in Friends now.
  useEffect(()=>{
    if(state?.status === "saved_yours") navigate(paths.result(state.puzzle_id), { replace:true });
  },[state]);

  const source = useMemo(()=>({
    open: async ()=>{
      const s = await api.openShared(token, key);
      if(s.status !== "yours"){ setState(s); throw new Error("This puzzle isn't available here any more."); }
      return s.puzzle;
    },
    guess: (g)=>api.guessShared(token, key, g),
  }),[token, key]);

  if(error) return <Note title="Couldn't open this puzzle" text={error} onPlayDaily={onPlayDaily}/>;
  if(!state || !settled) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub" style={{textAlign:"center",padding:30}}>Opening puzzle…</p></div></div>;

  if(askName){
    return <SaveName creator={creator} onSaved={()=>{ setAskName(false); claim(); }}/>;
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
            guest={{
              backLabel:"Today's puzzle",
              saveLabel: saving ? "Saving…" : `Save your result and become friends with ${creator}`,
              onSave: saving ? ()=>{} : startSave,
            }}/>
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

// Signed in for the first time to save: a name for Friends, then the save.
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
          <p className="fr-sub">{creator} will see it on puzzles you send.</p>
        </div>
        <form className="fr-card" onSubmit={save}>
          <label className="fr-label" htmlFor="fr-name">Your name</label>
          <input id="fr-name" className="fr-input" maxLength={24} value={name} autoFocus autoComplete="given-name"
            onChange={e=>setName(e.target.value)} placeholder="e.g. Deb"/>
          {error && <div className="fr-msg err" style={{marginTop:10}}>{error}</div>}
          <button className="fr-btn primary" style={{marginTop:12}} disabled={busy || !name.trim()} aria-busy={busy}>
            {busy ? <><Spinner/>Saving…</> : `Save and become friends with ${creator}`}</button>
        </form>
      </div>
    </div>
  );
}
