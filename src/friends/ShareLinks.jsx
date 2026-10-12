import { useState } from "react";
import { api } from "./client";
import { timeAgo, livesLeftPhrase } from "./format";
import { paths } from "../route";
import { Icon, Spinner, PageHead, InfoTip } from "./ui.jsx";

// The sender's side of puzzles shared by link: the link once it's made, and
// one card per link in Friends with where it stands and the one thing to do.
// The rules (30 days, first browser to start, fresh link, stop sharing) are
// in the share-links migration; the sender sees them in short here.

const MAX_LIVES = 3;
const shareUrl = (token) => `${window.location.origin}${paths.shared(token)}`;
const until = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const forWhom = (label) => label || "them";

// Copy / Share for one link.
export function LinkBox({ token, sender, label }) {
  const link = shareUrl(token);
  const [copied,setCopied] = useState(false);
  const [error,setError] = useState("");
  const copy = async ()=>{
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 2000); }
    catch { setError("Couldn't copy. Press and hold the link to copy it."); }
  };
  const share = ()=>navigator.share?.({
    title:"Cluevoyance", text:`${sender ? `${sender} made you` : "Here's"} a Cluevoyance puzzle${label ? `, ${label}` : ""}:`, url:link,
  }).catch(()=>{});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div className="fr-linkbox">
        <input className="fr-input" readOnly value={link} onFocus={e=>e.target.select()} aria-label="Puzzle link"/>
        <button className="fr-btn secondary sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        {typeof navigator.share === "function" && <button className="fr-btn secondary sm" onClick={share}>Share</button>}
      </div>
      {error && <div className="fr-msg err">{error}</div>}
    </div>
  );
}

// Right after "Get link": the link to text, and what it does.
export function LinkReady({ link, sender, onDone }) {
  const who = forWhom(link.label);
  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <PageHead title="Your link is ready" sub={`Text it to ${who}. They can play right away, no account needed. When they finish, they can make one back for you.`}/>
        <LinkBox token={link.token} sender={sender} label={link.label}/>
        <p className="fr-help" style={{margin:0,display:"flex",alignItems:"center"}}>
          Works until {until(link.expires_at)}.
          <InfoTip label="About puzzle links">
            The first browser that taps Play keeps the game; others who open the link can't take over.
            You'll see their guesses here when they finish. If they make one back, you're connected in Friends.
            If they get stuck, send a fresh link from Friends.
          </InfoTip>
        </p>
        <button className="fr-btn primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

// One link in Friends: one status message (the purple bar) and its action.
export function ShareLinkCard({ link, sender, now, onResult, onChanged }) {
  // A finished game is a result to watch, whatever became of its link: stopping
  // or expiring only turns the link off for the guest. "closed" = the link no longer works.
  const state = link.finished_at ? "finished" : link.state;
  const closed = link.state === "revoked" || link.state === "expired";
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [fresh,setFresh] = useState(null);
  const who = forWhom(link.label);
  const run = async (what, fn)=>{
    setBusy(what); setError("");
    try { await fn(); } catch(err){ setError(err.message); } finally { setBusy(""); }
  };
  const refresh = ()=>run("fresh", async ()=>{ setFresh(await api.refreshShareLink(link.puzzle_id)); onChanged?.(); });
  const stop = ()=>run("stop", async ()=>{
    const finished = state === "finished";
    if(!window.confirm(finished ? "Stop sharing? The link stops working right away. You keep their result and can still watch their guesses." : "Stop sharing? The link stops working right away.")) return;
    await api.stopShareLink(link.puzzle_id); onChanged?.();
  });

  let status, action = null;
  switch(state){
    case "waiting":
      status = `Link sent ${timeAgo(link.sent_at, now)} · not started yet`;
      break;
    case "playing":
      status = `${link.label || "They"} started playing`;
      break;
    case "finished":
      status = link.outcome === "won"
        ? `${link.label || "They"} solved it ${livesLeftPhrase(link.lives_used, MAX_LIVES)}`
        : `${link.label || "They"} finished · didn't solve it`;
      action = (
        <button className="fr-btn primary" onClick={()=>onResult(link.puzzle_id)}>
          <span className="fr-btn-ico"><Icon name="play"/></span>Watch {link.label ? `${link.label}'s` : "their"} guesses
        </button>
      );
      break;
    default: // expired
      status = `The link expired before ${who} finished`;
  }
  const canRefresh = state !== "finished";
  const shownToken = fresh?.token || (state === "waiting" ? link.token : null);

  return (
    <section className={`fr-card fr-friend${state === "finished" && !link.seen_result ? " new" : ""}`} aria-label={`Puzzle link for ${who}`}>
      <div className="fr-friend-head">
        <span className="fr-share-ico" aria-hidden="true"><Icon name="pencil" size={20}/></span>
        <div style={{minWidth:0}}>
          <div className="fr-friend-name">{link.label ? `For ${link.label}` : "Puzzle link"}</div>
          {link.title && <div className="fr-friend-status">“{link.title}”</div>}
        </div>
        {state === "finished" && !link.seen_result && <span className="fr-dot-new" aria-label="New"/>}
      </div>
      <div className="fr-waiting" role="status"><Icon name={state === "finished" ? "check" : "clock"} size={18}/><span>{status}</span></div>
      {action}
      {shownToken && <LinkBox token={shownToken} sender={sender} label={link.label}/>}
      {fresh && <div className="fr-msg ok">New link ready. Text it to {who}; the old one no longer works.</div>}
      {error && <div className="fr-msg err">{error}</div>}
      <div className="fr-row fr-share-actions">
        {canRefresh && !fresh && state !== "waiting" && (
          <button className="fr-btn secondary sm" onClick={refresh} disabled={!!busy} aria-busy={busy === "fresh"}>
            {busy === "fresh" ? <><Spinner/>Making…</> : "Send a fresh link"}
          </button>
        )}
        {state === "finished" && closed
          ? <span className="fr-help" style={{margin:"0 4px"}}>{link.state === "revoked" ? "Sharing stopped" : "Link expired"} · you keep this result</span>
          : <button className="fr-textbtn muted" onClick={stop} disabled={!!busy}>Stop sharing</button>}
        {state === "playing" && !fresh && (
          <InfoTip label="If they're stuck">
            A game stays in the browser where it was started. If {who} can't get back to it, send a fresh link:
            the old one stops working and they start again.
          </InfoTip>
        )}
      </div>
    </section>
  );
}
