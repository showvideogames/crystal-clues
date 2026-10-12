import { useState } from "react";
import { api } from "./client";
import { timeAgo, livesLeftPhrase } from "./format";
import { paths } from "../route";
import { Icon, Spinner, PageHead, InfoTip } from "./ui.jsx";

// The sender's side of puzzles shared by link: the link once it's made, and
// one compact row per link in Friends with where it stands and what to do.
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

// Copy (and, where the phone offers it, Share) as two small buttons, for a link row.
function CopyShare({ token, sender, label }) {
  const link = shareUrl(token);
  const [copied,setCopied] = useState(false);
  const [error,setError] = useState("");
  const copy = async ()=>{
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 2000); }
    catch { setError(`Couldn't copy. The link is ${link}`); }
  };
  const share = ()=>navigator.share?.({
    title:"Cluevoyance", text:`${sender ? `${sender} made you` : "Here's"} a Cluevoyance puzzle${label ? `, ${label}` : ""}:`, url:link,
  }).catch(()=>{});
  return <>
    <button className="fr-mini secondary" onClick={copy}><Icon name="link" size={16}/>{copied ? "Copied ✓" : "Copy link"}</button>
    {typeof navigator.share === "function" && <button className="fr-mini secondary" onClick={share}>Share</button>}
    {error && <div className="fr-msg err" style={{flexBasis:"100%"}}>{error}</div>}
  </>;
}

// Is there a finished result here the sender hasn't watched yet?
const unwatchedLink = (l) => !!l.finished_at && !l.seen_result;

// One link in Friends, as a compact row: who it's for, one status line, and
// its actions. A finished game stays a result to watch whatever became of its
// link: stopping or expiring only turns the link off for the guest.
export function ShareLinkRow({ link, sender, now, onResult, onChanged }) {
  const state = link.finished_at ? "finished" : link.state;
  const closed = link.state === "revoked" || link.state === "expired";
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [fresh,setFresh] = useState(null);
  const who = forWhom(link.label);
  const isNew = unwatchedLink(link);
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

  let status;
  switch(state){
    case "waiting":  status = `Sent ${timeAgo(link.sent_at, now)} · not started yet`; break;
    case "playing":  status = "Started playing"; break;
    case "finished":
      status = link.outcome === "won" ? `Solved it ${livesLeftPhrase(link.lives_used, MAX_LIVES)}` : "Finished · didn't solve it";
      if(closed) status += link.state === "revoked" ? " · sharing stopped" : " · link expired";
      break;
    default:         status = "The link expired before they finished";
  }
  const shownToken = fresh?.token || (state === "waiting" ? link.token : null);

  return (
    <li className="fr-frow" aria-label={`Puzzle link for ${who}`}>
      <div className="fr-frow-main as-text">
        <span className="fr-frow-lead" aria-hidden="true"><Icon name="link" size={22}/></span>
        <span className="fr-frow-line">
          <span className="fr-frow-name">{link.label ? `For ${link.label}` : "Puzzle link"}</span>
          {isNew && <span className="fr-new"><span className="fr-dot-new" aria-hidden="true"/>New result</span>}
        </span>
        <span className="fr-frow-status">{status}{link.title ? <> · “{link.title}”</> : null}</span>
      </div>
      <div className="fr-frow-actions">
        {state === "finished" && (
          <button className="fr-mini primary" onClick={()=>onResult(link.puzzle_id)}
            aria-label={`Watch ${link.label ? `${link.label}'s` : "their"} guesses`}>
            <Icon name="play" size={16}/>Watch
          </button>
        )}
        {shownToken && <CopyShare token={shownToken} sender={sender} label={link.label}/>}
        {state !== "finished" && state !== "waiting" && !fresh && (
          <button className="fr-mini secondary" onClick={refresh} disabled={!!busy} aria-busy={busy === "fresh"}>
            {busy === "fresh" ? <><Spinner/>Making…</> : "Send a fresh link"}
          </button>
        )}
        {!closed && <button className="fr-textbtn muted fr-mini-text" onClick={stop} disabled={!!busy}>Stop sharing</button>}
        {state === "playing" && !fresh && (
          <InfoTip label="If they're stuck">
            A game stays in the browser where it was started. If {who} can't get back to it, send a fresh link:
            the old one stops working and they start again.
          </InfoTip>
        )}
      </div>
      {fresh && <div className="fr-msg ok fr-frow-note">New link ready. Text it to {who}; the old one no longer works.</div>}
      {error && <div className="fr-msg err fr-frow-note">{error}</div>}
    </li>
  );
}

// "Sent puzzle links": one compact, expandable section. It opens by itself
// while a finished result there is still unwatched, and says so when closed.
export function SentLinks({ links, sender, now, onResult, onChanged }) {
  const [choice,setChoice] = useState(null);   // null: follow the news; true/false: the player's own choice
  const fresh = links.filter(unwatchedLink).length;
  const open = choice ?? fresh > 0;
  return (
    <section className="fr-links" aria-label="Sent puzzle links">
      <button type="button" className="fr-links-head" aria-expanded={open} aria-controls="fr-links-list" onClick={()=>setChoice(!open)}>
        <span className="fr-links-title">Sent puzzle links <span className="fr-links-count">{links.length}</span></span>
        {fresh > 0 && <span className="fr-new"><span className="fr-dot-new" aria-hidden="true"/>{fresh === 1 ? "1 new result" : `${fresh} new results`}</span>}
        <Icon name="next" size={18} className={`fr-rowbtn-chev${open ? " open" : ""}`}/>
      </button>
      {open && (
        <ul className="fr-flist" id="fr-links-list">
          {links.map(l=>(
            <ShareLinkRow key={l.puzzle_id} link={l} sender={sender} now={now} onResult={onResult} onChanged={onChanged}/>
          ))}
        </ul>
      )}
    </section>
  );
}
