import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import { pushSupport, enablePush, disablePush, currentSubscription, refreshSubscription } from "./push";
import { readPendingInvite, writePendingInvite } from "./session";
import { navigate, paths, historyState } from "../route";
import { serverOffset, timeAgo, livesLeftPhrase } from "./format";
import { MAX_LIVES } from "../game/shared";
import { StreakPanel, StreakStatus, StreakRules } from "./Streaks.jsx";
import { Icon, Spinner, FriendAvatar, PageHead, RowButton, InfoTip } from "./ui.jsx";
import FriendCreator from "./FriendCreator.jsx";
import FriendPlay from "./FriendPlay.jsx";
import FriendResult from "./FriendResult.jsx";
import { LinkReady, ShareLinkCard } from "./ShareLinks.jsx";
import "./friends.css";


// account: the shared Cluevoyance account from useAccount() (App.jsx). Friends
// has no sign-in of its own; who is playing is always that account.
// screen: which Friends screen the address names (src/route.js); every move
// between screens is a navigation, so refresh, Back/Forward and links work.
// Leaving a screen keeps its work: a puzzle in progress is kept on this
// device as it's played, and unsaved creator edits are kept as a backup that
// the creator restores next time.
// invite: a token from an invite link opened on this visit.
// onHowToPlay: opens the game's own tutorial (for someone new, before a friend's puzzle).
export default function FriendsView({ kit, account, screen = { name:"inbox" }, invite, onInviteTaken, onUnreadChange, onPlayDaily, onSignOut, onHowToPlay }) {
  // { userId, profile }, so a different account never sees the last one's name.
  const [loaded,setLoaded]   = useState(null);
  const [pendingInvite,setPendingInvite] = useState(()=>{
    if(invite){ writePendingInvite(invite); return invite; }
    return readPendingInvite();
  });

  useEffect(()=>{ if(invite) onInviteTaken?.(); },[invite, onInviteTaken]);

  const userId = account.status === "signed_in" ? account.account?.user_id : null;
  const email = account.account?.email || "";
  useEffect(()=>{
    if(!userId) return;
    let alive = true;
    api.profile()
      .then(p=>{ if(alive) setLoaded({ userId, profile:p }); })
      .catch(()=>{ if(alive) setLoaded({ userId, profile:null }); });
    refreshSubscription().catch(()=>{});
    return ()=>{ alive = false; };
  },[userId]);
  const profile = loaded && loaded.userId === userId ? loaded.profile : undefined;
  const setProfile = useCallback((p)=>setLoaded({ userId, profile:p }),[userId]);

  const dismissInvite = useCallback(()=>{ writePendingInvite(null); setPendingInvite(null); },[]);
  const toInbox = useCallback(()=>navigate(paths.friends()),[]);
  const toPlay = useCallback((id, opts)=>navigate(paths.play(id), opts),[]);
  const toResult = useCallback((id, opts)=>navigate(paths.result(id), opts),[]);
  // The friend's name travels with the address's history entry; a creator
  // opened by address alone looks it up (CreatorRoute).
  const toCreate = useCallback((friend)=>navigate(paths.make(friend.friendship_id), { state:{ friendName:friend.friend_name } }),[]);

  if(account.status === "checking" || (userId && profile === undefined)){
    return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub" style={{textAlign:"center",padding:30}}>Opening Friends…</p></div></div>;
  }
  if(!userId){
    return <SignIn pendingInvite={pendingInvite} account={account} onPlayDaily={onPlayDaily} screen={screen}/>;
  }
  if(!profile){
    return <NameStep onSaved={setProfile} pendingInvite={pendingInvite} onJoined={dismissInvite}/>;
  }

  if(screen.name === "create"){
    // Sent: the hub replaces the creator in history, so Back doesn't reopen it.
    return <CreatorRoute key={screen.id} kit={kit} friendshipId={screen.id} onBack={toInbox}
      sender={profile.display_name}
      onSent={()=>navigate(paths.friends(), { replace:true })}/>;
  }
  if(screen.name === "play"){
    return <FriendPlay key={screen.id} kit={kit} puzzleId={screen.id} onBack={toInbox}
      onMakeBack={toCreate} onOpenResult={toResult} onHowToPlay={onHowToPlay}/>;
  }
  if(screen.name === "result"){
    return <FriendResult key={screen.id} kit={kit} puzzleId={screen.id} onBack={toInbox}
      onMake={toCreate} onPlay={toPlay}/>;
  }

  return (
    <Inbox
      profile={profile}
      email={email}
      onSignOut={onSignOut}
      pendingInvite={pendingInvite}
      onDismissInvite={dismissInvite}
      onUnreadChange={onUnreadChange}
      onProfile={setProfile}
      onPlay={toPlay}
      onResult={toResult}
      onCreate={toCreate}
      onCreateForNew={()=>navigate(paths.makeForNew())}
    />
  );
}

// The creator by address: the friend's name comes with the history entry,
// or — opened directly, after a refresh in another tab, from a link — from
// the inbox, which also proves the friendship is this account's.
function CreatorRoute({ kit, friendshipId, onBack, onSent, sender }) {
  // /friends/make/new: a puzzle for someone new, shared by link.
  const forNew = friendshipId === "new";
  const known = historyState().friendName;
  const [friend,setFriend] = useState(()=> forNew ? { friendship_id:null, friend_name:null, share:true }
    : known ? { friendship_id:friendshipId, friend_name:known } : null);
  const [link,setLink] = useState(null);
  const [error,setError] = useState("");
  useEffect(()=>{
    if(friend) return;
    let alive = true;
    api.inbox().then(data=>{
      if(!alive) return;
      const f = data.friends.find(x=>x.friendship_id === friendshipId);
      if(f) setFriend({ friendship_id:f.friendship_id, friend_name:f.friend_name });
      else setError("That friend isn't in your Friends list.");
    }).catch(err=>{ if(alive) setError(err.message); });
    return ()=>{ alive = false; };
  },[friend, friendshipId]);
  if(error){
    return <div className="fr-wrap"><div className="fr-page">
      <div className="fr-msg err">{error}</div>
      <button className="fr-btn secondary" onClick={onBack}>Back to Friends</button>
    </div></div>;
  }
  if(!friend) return <div className="fr-wrap"><div className="fr-page"><p className="fr-sub">Opening…</p></div></div>;
  if(link) return <LinkReady link={link} sender={sender} onDone={()=>navigate(paths.friends(), { replace:true })}/>;
  return <FriendCreator kit={kit} friend={friend} onBack={onBack} onSent={onSent} onShared={setLink}/>;
}

// ═══════════════════════════════════════════════════════════════
//  SIGN IN — the one shared Cluevoyance sign-in (the same as the header's
//  Sign in). There is no separate Friends login.
// ═══════════════════════════════════════════════════════════════

// Who an invite link is from, for the screens before it's accepted.
// Readable without signing in (the token is the secret); null until known.
function useInviteInfo(token) {
  const [info,setInfo] = useState(null);
  useEffect(()=>{
    if(!token) return undefined;
    let alive = true;
    api.inviteInfo(token).then(i=>{ if(alive) setInfo({ token, ...i }); }).catch(()=>{});
    return ()=>{ alive = false; };
  },[token]);
  return info && info.token === token ? info : null;
}

// An invite that can't be used any more: the one essential message about it.
function StaleInvite({ info }) {
  if(!info || info.status === "open" || info.status === "accepted" || info.status === "not_found" || info.status === "own") return null;
  return <div className="fr-msg note">That invite link can't be used any more. Ask {info.inviter_name} for a new one.</div>;
}

// Signed out. Someone who arrived from a link learns who it's from and the
// one thing to do; new players are told to choose Sign up on the next page.
function SignIn({ pendingInvite, account, onPlayDaily, screen }) {
  const [busy,setBusy] = useState(false);
  const info = useInviteInfo(pendingInvite);
  const signIn = async ()=>{
    setBusy(true);
    // The sign-in returns to this address (an invite waits in storage).
    await account.signIn();
    // Still here: sign-in is unavailable, and account.message says so.
    setBusy(false);
  };
  const invitedBy = info?.status === "open" ? info.inviter_name : null;
  const forPuzzle = screen?.name === "play" || screen?.name === "result";
  const title = invitedBy ? `${invitedBy} invited you to play`
    : forPuzzle ? "A friend sent you a puzzle"
    : "Play with friends";
  const sub = invitedBy ? `Solve the puzzles ${invitedBy} makes for you, and make some back.`
    : forPuzzle ? "Sign in to open it."
    : "Make a puzzle for a friend and solve the one they make you.";

  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <div className="fr-hero">
          <div className="fr-hero-ball">🔮</div>
          <h1 className="fr-title">{title}</h1>
          <p className="fr-sub">{sub}</p>
        </div>
        <StaleInvite info={info}/>
        <div className="fr-card">
          {account.message && <div className="fr-msg err">{account.message}</div>}
          <button className="fr-btn primary" onClick={signIn} disabled={busy} aria-busy={busy}>
            {busy ? <><Spinner/>Opening sign-in…</> : "Sign in or sign up"}</button>
          <p className="fr-help" style={{margin:0,textAlign:"center"}}>New here? Choose <b>Sign up</b> on the next page.</p>
        </div>
        <p className="fr-foot"><button className="fr-link" onClick={onPlayDaily}>Not now — play today's puzzle</button></p>
      </div>
    </div>
  );
}

// First visit after signing in: a name, and — arriving from an invite — the
// same tap joins that friend (no separate Accept step).
function NameStep({ onSaved, pendingInvite, onJoined }) {
  const [name,setName] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const info = useInviteInfo(pendingInvite);
  const invitedBy = info?.status === "open" ? info.inviter_name : null;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const profile = await api.setName(name);
      if(invitedBy){
        // If joining fails, the invite stays and the hub offers it with the reason.
        try { await api.acceptInvite(pendingInvite); onJoined?.(); } catch { /* shown on the hub */ }
      }
      onSaved(profile);
    }
    catch(err){ setError(err.message); setBusy(false); }
  };
  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <div className="fr-hero">
          <div className="fr-hero-ball">✨</div>
          <h1 className="fr-title">What's your name?</h1>
          <p className="fr-sub">{invitedBy ? `${invitedBy} will see it on puzzles you send.` : "Friends see it on puzzles you send."}</p>
        </div>
        <StaleInvite info={info}/>
        <form className="fr-card" onSubmit={save}>
          <label className="fr-label" htmlFor="fr-name">Your name</label>
          <input id="fr-name" className="fr-input" maxLength={24} value={name} autoFocus autoComplete="given-name"
            onChange={e=>setName(e.target.value)} placeholder="e.g. Deb"/>
          {error && <div className="fr-msg err" style={{marginTop:10}}>{error}</div>}
          <button className="fr-btn primary" style={{marginTop:12}} disabled={busy || !name.trim()} aria-busy={busy}>
            {busy ? <><Spinner/>Saving…</> : invitedBy ? `Join ${invitedBy}` : "Continue"}</button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  INBOX
// ═══════════════════════════════════════════════════════════════

// One line under the title: the most useful thing to do right now. Waiting
// on a friend isn't repeated here; each friend's card says it, once.
function inboxLede(friends) {
  const by = (a) => friends.filter((f) => f.next_action === a).map((f) => f.friend_name);
  const list = (names) => names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`;
  if (by("play").length) return by("play").length === 1 ? `A puzzle from ${by("play")[0]} is waiting for you.` : `Puzzles from ${list(by("play"))} are waiting for you.`;
  if (by("see_result").length) return `${list(by("see_result"))} finished your puzzle.`;
  if (by("make_back").length) return `Your turn to make one for ${list(by("make_back"))}.`;
  return "Trade puzzles and keep your streaks going together.";
}

function Inbox({ profile, email, onSignOut, pendingInvite, onDismissInvite, onUnreadChange, onProfile, onPlay, onResult, onCreate, onCreateForNew }) {
  const [inbox,setInbox] = useState(null);
  const [links,setLinks] = useState([]);   // puzzles shared by link, not yet saved to an account
  const [offset,setOffset] = useState(0);
  const [error,setError] = useState("");
  const [now,setNow] = useState(()=>Date.now());
  const [open,setOpen] = useState(null);   // which "More" row is expanded

  const refresh = useCallback(async ()=>{
    try {
      const [data, shared] = await Promise.all([api.inbox(), api.shareLinks().catch(()=>null)]);
      setInbox(data);
      if(shared) setLinks(shared);
      setOffset(serverOffset(data.server_now));
      setNow(Date.now());
      setError("");
      onUnreadChange?.(data.unread || 0);
    } catch(err){
      setError(err.message);
    }
  },[onUnreadChange]);

  useEffect(()=>{
    // First load, then every 30 seconds while the inbox is on screen.
    const tick = ()=>{ if(document.visibilityState === "visible") refresh(); };
    const first = setTimeout(tick, 0);
    const poll = setInterval(tick, 30000);
    const clock = setInterval(()=>setNow(Date.now()), 30000);
    document.addEventListener("visibilitychange", tick);
    return ()=>{ clearTimeout(first); clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", tick); };
  },[refresh]);

  const serverNow = now + offset;
  const inviteDone = useCallback(()=>{ onDismissInvite(); refresh(); },[onDismissInvite, refresh]);
  const toggle = (key)=>setOpen(o=>o === key ? null : key);
  const hasFriends = !!inbox?.friends.length;

  return (
    <div className="fr-wrap">
      <div className="fr-page">
        <PageHead title="Friends" sub={inbox ? inboxLede(inbox.friends) : " "}/>

        {pendingInvite && <AcceptInvite token={pendingInvite} onDone={inviteDone} onDismiss={onDismissInvite}/>}
        {error && <div className="fr-msg err">{error} <button className="fr-link" onClick={refresh}>Try again</button></div>}

        {inbox === null && !error && <p className="fr-sub">Loading…</p>}
        {inbox && !hasFriends && !pendingInvite && (
          <div className="fr-card fr-friend" style={{alignItems:"center",textAlign:"center"}}>
            <div className="fr-hero-ball" aria-hidden="true">🔮</div>
            <div>
              <div className="fr-friend-name">Trade puzzles with a friend</div>
              <p className="fr-sub" style={{marginTop:6}}>Send an invite link. Once they accept, you can make each other puzzles.</p>
            </div>
            <div style={{width:"100%"}}><InvitePanel primary/></div>
            <button className="fr-link" onClick={onCreateForNew}>Or make a puzzle and text the link</button>
          </div>
        )}
        {inbox?.friends.map(f=>(
          <FriendCard key={f.friendship_id} f={f} now={serverNow}
            onPlay={onPlay} onResult={onResult} onCreate={onCreate}/>
        ))}

        {links.length > 0 && <>
          <div className="fr-eyebrow">Puzzle links you've sent</div>
          {links.map(l=>(
            <ShareLinkCard key={l.puzzle_id} link={l} sender={profile.display_name} now={serverNow}
              onResult={onResult} onChanged={refresh}/>
          ))}
        </>}

        <div className="fr-eyebrow">More with friends</div>
        <div className="fr-list">
          <RowButton icon="pencil" label="Make one for someone new" detail="Text them a link. No account needed to play."
            onClick={onCreateForNew}/>
          {hasFriends && <>
            <RowButton icon="plus" label="Invite another friend" detail="Share a link to start a puzzle exchange"
              open={open === "invite"} onClick={()=>toggle("invite")}/>
            {open === "invite" && <div className="fr-list-body"><InvitePanel/></div>}
          </>}
          <RowButton icon="help" label="How streaks work" detail="Friend Streak and Solve Streak"
            open={open === "rules"} onClick={()=>toggle("rules")}/>
          {open === "rules" && <div className="fr-list-body"><StreakRules/></div>}
        </div>
        <NotificationSettings profile={profile} onProfile={onProfile}/>

        <p className="fr-foot">
          Signed in as <b>{profile.display_name}</b>{email ? <> ({email})</> : null}<br/>
          <EditName profile={profile} onProfile={onProfile}/>
          {onSignOut && <> · <button className="fr-link" onClick={onSignOut}>Sign out</button></>}
        </p>
      </div>
    </div>
  );
}

function FriendCard({ f, now, onPlay, onResult, onCreate }) {
  const [history,setHistory] = useState(null);
  const [showHistory,setShowHistory] = useState(false);
  const name = f.friend_name;

  const toggleHistory = async ()=>{
    const next = !showHistory;
    setShowHistory(next);
    if(next && !history){
      try { setHistory(await api.history(f.friendship_id)); } catch { setHistory([]); }
    }
  };

  const primary = (icon, label, onClick)=>(
    <button className="fr-btn primary" onClick={onClick}>
      <span className="fr-btn-ico"><Icon name={icon}/></span>{label}
    </button>
  );
  // A new friendship: where their puzzles will show up, and the one thing to do.
  let status = `Connected · ${name}'s puzzles will appear here.`;
  let action = null;
  const makeLabel = f.draft ? `Finish your puzzle for ${name}` : `Make one for ${name}`;
  const isNew = (f.incoming && !f.incoming.seen) || !!f.unseen_result;
  switch(f.next_action){
    case "play":
      status = f.incoming.started
        ? `You're partway through${f.incoming.guesses ? ` · ${f.incoming.guesses} guess${f.incoming.guesses===1?"":"es"} in` : ""}`
        : `Sent you a puzzle · ${timeAgo(f.incoming.sent_at, now)}`;
      action = primary("play", f.incoming.started ? `Continue ${name}'s puzzle` : `Play ${name}'s puzzle`, ()=>onPlay(f.incoming.puzzle_id));
      break;
    case "see_result":
      status = f.unseen_result.outcome === "won" ? "Solved your puzzle" : "Finished your puzzle";
      action = primary("play", `Watch ${name}'s guesses`, ()=>onResult(f.unseen_result.puzzle_id));
      break;
    case "waiting":
      // One message, in the status bar. "Started" is the server's record:
      // they chose a difficulty or made a guess; opening it isn't starting.
      status = null;
      action = (
        <div className="fr-waiting" role="status"><Icon name="clock" size={18}/>
          <span>{f.outgoing.started
            ? `${name} has started your puzzle`
            : `Sent ${timeAgo(f.outgoing.sent_at, now)} · waiting for ${name} to start`}</span>
        </div>
      );
      break;
    case "make_back": {
      const lf = f.last_finished;
      status = lf.outcome === "won" ? `You solved their puzzle ${livesLeftPhrase(lf.lives_used, MAX_LIVES)} · your turn` : "Their puzzle got you · your turn";
      action = primary("pencil", makeLabel, ()=>onCreate(f));
      break;
    }
    default: {
      const lf = f.last_finished;
      if(lf && !lf.by_me) status = lf.outcome === "won" ? `Solved your last puzzle ${livesLeftPhrase(lf.lives_used, MAX_LIVES)}` : "Didn't solve your last puzzle";
      action = primary("pencil", makeLabel, ()=>onCreate(f));
    }
  }

  // The creator's replay of the friend's real guesses stays one tap away.
  const replayId = f.unseen_result?.puzzle_id
    || (f.last_finished && !f.last_finished.by_me ? f.last_finished.puzzle_id : null);

  return (
    <section className={`fr-card fr-friend${isNew ? " new" : ""}`} aria-label={name}>
      <div className="fr-friend-head">
        <FriendAvatar name={name}/>
        <div style={{minWidth:0}}>
          <div className="fr-friend-name">{name}</div>
          {status && <div className="fr-friend-status">{status}</div>}
        </div>
        {isNew && <span className="fr-dot-new" aria-label="New"/>}
      </div>
      {action}
      {/* Streaks appear once there's something to count: no zeros and rules for a new friend. */}
      {(f.last_finished || f.daily_streak || f.team_win_streak) ? <>
        <StreakPanel friendStreak={f.daily_streak} solveStreak={f.team_win_streak} friendName={name}/>
        <StreakStatus status={f} now={now}/>
      </> : null}
      <div className="fr-card-rows">
        {replayId && f.next_action !== "see_result" && (
          <RowButton icon="play" label={`Watch ${name}'s guesses`} dot={!!f.unseen_result} onClick={()=>onResult(replayId)}/>
        )}
        <RowButton icon="history" label="Past puzzles" open={showHistory} onClick={toggleHistory}/>
        {showHistory && (
          <div className="fr-history">
            {history === null && <p className="fr-sub" style={{padding:"8px"}}>Loading…</p>}
            {history?.length === 0 && <p className="fr-sub" style={{padding:"8px"}}>No puzzles yet.</p>}
            {history?.map(h=>{
              const label = h.direction === "sent" ? `You → ${name}` : `${name} → you`;
              const result = !h.finished_at ? "Not finished yet" : h.outcome === "won" ? `Solved · ${h.lives_used} ${h.lives_used===1?"life":"lives"} used` : "Not solved";
              return (
                <button key={h.puzzle_id} className="fr-history-item"
                  onClick={()=> h.finished_at || h.direction === "sent" ? onResult(h.puzzle_id) : onPlay(h.puzzle_id)}>
                  <span className={`fr-dot${!h.finished_at ? " open" : h.outcome === "lost" ? " lost" : ""}`}/>
                  <span><b>{label}</b><small>{result}</small></span>
                  <span className="when">{timeAgo(h.sent_at, now)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function AcceptInvite({ token, onDone, onDismiss }) {
  const [info,setInfo] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(()=>{
    let alive = true;
    api.inviteInfo(token).then(i=>{
      if(!alive) return;
      // Already accepted (on another device, or a double tap): nothing to ask.
      if(i.status === "accepted") onDone();
      else setInfo(i);
    }).catch(err=>{ if(alive) setError(err.message); });
    return ()=>{ alive = false; };
  },[token, onDone]);
  if(!info && !error) return null;
  if(info?.status === "own"){
    return <div className="fr-msg note">That's your own invite link — send it to a friend. <button className="fr-link" onClick={onDismiss}>OK</button></div>;
  }
  if(info?.status === "accepted") return null;
  if(info && info.status !== "open"){
    return <div className="fr-msg note">That invite link can't be used any more — ask for a new one. <button className="fr-link" onClick={onDismiss}>OK</button></div>;
  }
  const accept = async ()=>{
    setBusy(true); setError("");
    try { await api.acceptInvite(token); onDone(); }
    catch(err){ setError(err.message); setBusy(false); }
  };
  return (
    <section className="fr-card fr-friend new">
      <div className="fr-friend-head">
        <FriendAvatar name={info?.inviter_name || "?"}/>
        <div>
          <div className="fr-friend-name">{info?.inviter_name} invited you</div>
          <div className="fr-friend-status">Solve each other's puzzles.</div>
        </div>
      </div>
      {error && <div className="fr-msg err">{error}</div>}
      <button className="fr-btn primary" onClick={accept} disabled={busy} aria-busy={busy}>{busy ? <><Spinner/>Joining…</> : `Join ${info?.inviter_name}`}</button>
      <button className="fr-textbtn muted" style={{alignSelf:"center",marginTop:-8}} onClick={onDismiss}>Not now</button>
    </section>
  );
}

// Makes a one-friend invite link, then offers copy and share.
function InvitePanel({ primary = false }) {
  const [link,setLink] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [copied,setCopied] = useState(false);
  const make = async ()=>{
    setBusy(true); setError("");
    try {
      const inv = await api.createInvite();
      setLink(`${window.location.origin}/?invite=${inv.token}`);
    } catch(err){ setError(err.message); }
    finally { setBusy(false); }
  };
  const copy = async ()=>{
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 2000); }
    catch { setError("Couldn't copy — press and hold the link to copy it."); }
  };
  const share = ()=>navigator.share?.({ title:"Cluevoyance", text:"Let's trade Cluevoyance puzzles:", url:link }).catch(()=>{});
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {!link ? (
        <button className={`fr-btn ${primary ? "primary" : "secondary"}`} onClick={make} disabled={busy} aria-busy={busy}>
          {busy ? <><Spinner/>Making a link…</> : "Invite a friend"}</button>
      ) : (
        <>
          <div className="fr-linkbox">
            <input className="fr-input" readOnly value={link} onFocus={e=>e.target.select()} aria-label="Invite link"/>
            <button className="fr-btn secondary sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
            {typeof navigator.share === "function" && <button className="fr-btn secondary sm" onClick={share}>Share</button>}
          </div>
          <p className="fr-help" style={{margin:0,display:"flex",alignItems:"center"}}>
            <button className="fr-link" onClick={make}>New link</button>
            <InfoTip label="About invite links">Each link works for one friend and expires in 14 days.</InfoTip>
          </p>
        </>
      )}
      {error && <div className="fr-msg err">{error}</div>}
    </div>
  );
}

function NotificationSettings({ profile, onProfile }) {
  const [support,setSupport] = useState(()=>pushSupport());
  const [on,setOn] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [expanded,setExpanded] = useState(false);

  useEffect(()=>{
    let alive = true;
    currentSubscription().then(sub=>{ if(alive) setOn(!!sub && Notification.permission === "granted"); });
    return ()=>{ alive = false; };
  },[]);

  const turnOn = async ()=>{
    setBusy(true); setError("");
    try {
      const result = await enablePush();
      if(result === "on") setOn(true);
      else if(result === "denied") setSupport("denied");
      else setError("Notifications weren't turned on. You can try again any time.");
    } catch {
      setError("This browser couldn't turn on notifications. Your inbox here still shows everything.");
    } finally { setBusy(false); }
  };
  const turnOff = async ()=>{
    setBusy(true);
    await disablePush().catch(()=>{});
    setOn(false); setBusy(false); setExpanded(false);
  };
  const setPref = async (key, value)=>{
    try { onProfile(await api.setPrefs({ [key]:value })); }
    catch(err){ setError(err.message); }
  };

  let line, action = null, details = null;
  if(support === "ios-home-screen"){
    line = "Notifications need the Home Screen app";
    action = <button className="fr-textbtn" onClick={()=>setExpanded(e=>!e)} aria-expanded={expanded}>How</button>;
    details = <p className="fr-sub">Tap <b>Share</b>, then <b>Add to Home Screen</b>, open Cluevoyance from that icon, and turn notifications on here (iOS 16.4 or later).</p>;
  } else if(support === "unsupported"){
    line = "This browser can't show notifications";
  } else if(support === "denied"){
    line = "Notifications are blocked in this browser's settings";
  } else if(support === "unconfigured"){
    line = "Notifications aren't set up here yet";
  } else if(!on){
    line = "Notifications are off";
    action = <button className="fr-textbtn" onClick={turnOn} disabled={busy} aria-busy={busy}>{busy ? <><Spinner/>Turning on…</> : "Turn on"}</button>;
  } else {
    line = "Notifications are on";
    action = <button className="fr-textbtn" onClick={()=>setExpanded(e=>!e)} aria-expanded={expanded}>{expanded ? "Done" : "Choose"}</button>;
    details = <>
      <label className="fr-toggle"><input type="checkbox" checked={profile.notify_new_puzzle}
        onChange={e=>setPref("newPuzzle", e.target.checked)}/>
        <span>New puzzles<small>When a friend sends you one.</small></span></label>
      <label className="fr-toggle"><input type="checkbox" checked={profile.notify_results}
        onChange={e=>setPref("results", e.target.checked)}/>
        <span>Results<small>When a friend finishes your puzzle.</small></span></label>
      <label className="fr-toggle"><input type="checkbox" checked={profile.notify_reminders}
        onChange={e=>setPref("reminders", e.target.checked)}/>
        <span>Friend Streak reminder<small>About 3 hours before it would end, only if nobody has finished a puzzle that period.</small></span></label>
      <p className="fr-help" style={{margin:"2px 0 0"}}>Notifications never include clues or answers. <button className="fr-link" onClick={turnOff} disabled={busy}>Turn off on this device</button></p>
    </>;
  }
  return (
    <div>
      <div className="fr-notify"><Icon name="bell" size={18}/><span className="grow">{line}</span>{action}</div>
      {expanded && details && <div style={{padding:"0 4px 4px"}}>{details}</div>}
      {error && <div className="fr-msg err">{error}</div>}
    </div>
  );
}

function EditName({ profile, onProfile }) {
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState(profile.display_name);
  const [error,setError] = useState("");
  if(!editing) return <button className="fr-link" onClick={()=>{ setName(profile.display_name); setEditing(true); }}>Change name</button>;
  return (
    <span style={{display:"inline-flex",gap:6,alignItems:"center",marginTop:6}}>
      <input className="fr-input" style={{minHeight:40,padding:"6px 10px",fontSize:15,width:150}} maxLength={24}
        value={name} onChange={e=>setName(e.target.value)} aria-label="Display name"/>
      <button className="fr-link" onClick={async ()=>{
        try { onProfile(await api.setName(name)); setEditing(false); setError(""); }
        catch(err){ setError(err.message); }
      }}>Save</button>
      {error && <span style={{color:"var(--fr-bad)"}}>{error}</span>}
    </span>
  );
}
