import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";
import { refreshSubscription } from "./push";
import { readPendingInvite, writePendingInvite } from "./session";
import { navigate, paths, historyState } from "../route";
import { serverOffset, timeAgo, livesLeftPhrase } from "./format";
import { MAX_LIVES } from "../game/shared";
import { StreakPanel, StreakStatus, StreakRules } from "./Streaks.jsx";
import { Icon, Spinner, Avatar, PageHead, RowButton, Sheet } from "./ui.jsx";
import FriendCreator from "./FriendCreator.jsx";
import FriendPlay from "./FriendPlay.jsx";
import FriendResult from "./FriendResult.jsx";
import { LinkReady, SentLinks } from "./ShareLinks.jsx";
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
// me: the player's profile as the header knows it (it changes when they edit
// their name or avatar from the account menu). onOpenSettings: the Settings
// sheet, where the Friends notifications live.
export default function FriendsView({ kit, account, screen = { name:"inbox" }, invite, me, onInviteTaken, onUnreadChange, onProfileChange, onPlayDaily, onHowToPlay, onOpenSettings }) {
  // { userId, profile }, so a different account never sees the last one's name.
  const [loaded,setLoaded]   = useState(null);
  const [pendingInvite,setPendingInvite] = useState(()=>{
    if(invite){ writePendingInvite(invite); return invite; }
    return readPendingInvite();
  });

  useEffect(()=>{ if(invite) onInviteTaken?.(); },[invite, onInviteTaken]);

  const userId = account.status === "signed_in" ? account.account?.user_id : null;
  useEffect(()=>{
    if(!userId) return;
    let alive = true;
    api.profile()
      .then(p=>{ if(alive) setLoaded({ userId, profile:p }); })
      .catch(()=>{ if(alive) setLoaded({ userId, profile:null }); });
    refreshSubscription().catch(()=>{});
    return ()=>{ alive = false; };
  },[userId]);
  const own = loaded && loaded.userId === userId ? loaded.profile : undefined;
  // A newer copy from the header (an edit made in the account menu) wins.
  const profile = own && me && me.id === own.id ? { ...own, ...me } : own;
  const setProfile = useCallback((p)=>{ setLoaded({ userId, profile:p }); onProfileChange?.(p); },[userId, onProfileChange]);
  // Opening a puzzle or a result is what marks it seen (on the server, so on
  // every device). Re-read the count so the header's dot follows at once.
  const onViewed = useCallback(()=>{
    api.inbox().then(d=>{ onUnreadChange?.(d.unread || 0); onProfileChange?.(d.me || null); }).catch(()=>{});
  },[onUnreadChange, onProfileChange]);

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
      onMakeBack={toCreate} onOpenResult={toResult} onHowToPlay={onHowToPlay} onViewed={onViewed}/>;
  }
  if(screen.name === "result"){
    return <FriendResult key={screen.id} kit={kit} puzzleId={screen.id} onBack={toInbox}
      onMake={toCreate} onPlay={toPlay} onViewed={onViewed}/>;
  }

  return (
    <Inbox
      profile={profile}
      detailId={screen.name === "details" ? screen.id : null}
      pendingInvite={pendingInvite}
      onDismissInvite={dismissInvite}
      onUnreadChange={onUnreadChange}
      onPlay={toPlay}
      onResult={toResult}
      onCreate={toCreate}
      onCreateForNew={()=>navigate(paths.makeForNew())}
      onOpenSettings={onOpenSettings}
    />
  );
}

// The creator by address: the friend's name comes with the history entry,
// or — opened directly, after a refresh in another tab, from a link — from
// the inbox, which also proves the friendship is this account's.
function CreatorRoute({ kit, friendshipId, onBack, onSent, sender }) {
  // /friends/make/new: a puzzle for a friend, sent as a link (they needn't have an account yet).
  const forNew = friendshipId === "new";
  const { friendName:known, savedShared } = historyState();
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
  // Arriving from a puzzle they played by link (SharedPuzzle.jsx): say once what just happened.
  const notice = savedShared && friend.friend_name
    ? `Your result is saved, and you're connected with ${friend.friend_name}. Now make one back.` : null;
  return <FriendCreator kit={kit} friend={friend} notice={notice} onBack={onBack} onSent={onSent} onShared={setLink}/>;
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
  const title = invitedBy ? `${invitedBy} wants to trade puzzles with you`
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

// One short line for a friend's row: the most useful thing to know right now.
// (Everything else about them is in their details.)
function rowStatus(f, now) {
  const inc = f.incoming, lf = f.last_finished;
  if(inc) return inc.started
    ? `You're partway through${inc.guesses ? ` · ${inc.guesses} guess${inc.guesses === 1 ? "" : "es"} in` : ""}`
    : `Sent you a puzzle · ${timeAgo(inc.sent_at, now)}`;
  if(f.unseen_result) return f.unseen_result.outcome === "won" ? "Solved your puzzle" : "Finished your puzzle";
  if(f.outgoing) return f.outgoing.started ? "Started your puzzle" : `Waiting to play · ${timeAgo(f.outgoing.sent_at, now)}`;
  if(lf?.by_me) return lf.outcome === "won" ? "You solved their puzzle · your turn" : "Their puzzle got you · your turn";
  if(lf) return lf.outcome === "won" ? `Solved your last puzzle ${livesLeftPhrase(lf.lives_used, MAX_LIVES)}` : "Didn't solve your last puzzle";
  return "No puzzles yet";
}

// Something here needs them: a puzzle they haven't opened, or a result they haven't watched.
const hasNews = (f) => (!!f.incoming && !f.incoming.seen) || !!f.unseen_result;

// Their puzzle can be played (or resumed); yours can be made unless one of
// yours is still with them. Playing theirs never blocks making yours.
function FriendButtons({ f, onPlay, onResult, onCreate, watch = true }) {
  const name = f.friend_name;
  const inc = f.incoming;
  return <>
    {inc ? (
      <button className="fr-mini primary" onClick={()=>onPlay(inc.puzzle_id)}
        aria-label={`${inc.started ? "Resume" : "Play"} ${name}'s puzzle`}>
        <Icon name="play" size={16}/>{inc.started ? "Resume" : "Play"}
      </button>
    ) : watch && f.unseen_result ? (
      <button className="fr-mini primary" onClick={()=>onResult(f.unseen_result.puzzle_id)} aria-label={`Watch ${name}'s guesses`}>
        <Icon name="play" size={16}/>Watch
      </button>
    ) : null}
    {!f.outgoing && (
      <button className="fr-mini secondary" onClick={()=>onCreate(f)} aria-label={`Make Puzzle for ${name}`}>
        <Icon name="cards" size={18}/>Make Puzzle
      </button>
    )}
  </>;
}

function StreakChips({ f }) {
  return <>
    {f.daily_streak > 0 && <span className="fr-chipline" title="Friend Streak">
      <span aria-hidden="true">🔥</span>{f.daily_streak}<span className="sr-only"> day Friend Streak</span></span>}
    {f.team_win_streak > 0 && <span className="fr-chipline" title="Solve Streak">
      <span aria-hidden="true">⭐</span>{f.team_win_streak}<span className="sr-only"> puzzle Solve Streak</span></span>}
  </>;
}

const NewTag = ({ children = "New" }) => <span className="fr-new"><span className="fr-dot-new" aria-hidden="true"/>{children}</span>;

// One friend in the list. The avatar, name and status open their details;
// the buttons act directly.
function FriendRow({ f, avatar, now, onOpen, onPlay, onResult, onCreate }) {
  const name = f.friend_name;
  const news = hasNews(f);
  const buttons = !!f.incoming || !!f.unseen_result || !f.outgoing;
  return (
    <li className={`fr-frow${news ? " new" : ""}`} data-fid={f.friendship_id}
      onClick={(e)=>{ if(!e.target.closest("button")) onOpen(f); }}>
      <button type="button" className="fr-frow-main" onClick={()=>onOpen(f)} aria-haspopup="dialog">
        <Avatar name={name} avatar={avatar} size={44} className="fr-frow-lead"/>
        <span className="fr-frow-line">
          <span className="fr-frow-name">{name}</span>
          <StreakChips f={f}/>
          {news && <NewTag/>}
        </span>
        <span className="fr-frow-status">{rowStatus(f, now)}<span className="sr-only">. Open {name}'s details</span></span>
      </button>
      {buttons && <div className="fr-frow-actions"><FriendButtons f={f} onPlay={onPlay} onResult={onResult} onCreate={onCreate}/></div>}
    </li>
  );
}

// A friend's details: a sheet over the list (so closing it leaves the list
// exactly where it was). Streaks in full, the replay, past puzzles, the rules.
// Opening it marks nothing as seen: only opening a puzzle or a result does.
function FriendDetails({ f, avatar, now, onClose, onPlay, onResult, onCreate }) {
  const name = f.friend_name;
  const [history,setHistory] = useState(null);
  const [showHistory,setShowHistory] = useState(false);
  const [showRules,setShowRules] = useState(false);
  const toggleHistory = async ()=>{
    const next = !showHistory;
    setShowHistory(next);
    if(next && !history){
      try { setHistory(await api.history(f.friendship_id)); } catch { setHistory([]); }
    }
  };
  // The latest result of theirs on your puzzle stays one tap away, watched or not.
  const replayId = f.unseen_result?.puzzle_id
    || (f.last_finished && !f.last_finished.by_me ? f.last_finished.puzzle_id : null);
  const out = f.outgoing;
  const counted = f.last_finished || f.daily_streak || f.team_win_streak;

  return (
    <Sheet className="fr-details" labelledBy="fr-details-title" onClose={onClose} head={<>
      <Avatar name={name} avatar={avatar} size={52}/>
      <div style={{minWidth:0,flex:1}}>
        <h2 className="fr-modal-title" id="fr-details-title">{name}</h2>
        <div className="fr-sub">{rowStatus(f, now)}</div>
      </div>
    </>}>
        {(f.incoming || !out) && <div className="fr-row fr-details-actions"><FriendButtons f={f} watch={false} onPlay={onPlay} onResult={onResult} onCreate={onCreate}/></div>}
        {out && (
          <div className="fr-waiting" role="status"><Icon name="clock" size={18}/>
            <span>{out.started ? `${name} has started your puzzle` : `Your puzzle for ${name} · sent ${timeAgo(out.sent_at, now)}, not started yet`}</span>
          </div>
        )}

        {counted ? <>
          <StreakPanel friendStreak={f.daily_streak} solveStreak={f.team_win_streak} friendName={name}/>
          <StreakStatus status={f} now={now}/>
        </> : <p className="fr-sub">Finish a puzzle with {name} to start your streaks.</p>}

        <div className="fr-list">
          {replayId && (
            <RowButton icon="play" label={`Watch ${name}'s guesses`} dot={!!f.unseen_result}
              detail={f.unseen_result ? "New result · not watched yet" : "Their last finished puzzle"}
              onClick={()=>onResult(replayId)}/>
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
          <RowButton icon="help" label="How streaks work" open={showRules} onClick={()=>setShowRules(o=>!o)}/>
          {showRules && <div className="fr-list-body"><StreakRules/></div>}
        </div>
    </Sheet>
  );
}

function Inbox({ profile, detailId, pendingInvite, onDismissInvite, onUnreadChange, onPlay, onResult, onCreate, onCreateForNew, onOpenSettings }) {
  const [inbox,setInbox] = useState(null);
  const [links,setLinks] = useState([]);   // puzzles shared by link, not yet saved to an account
  const [avatars,setAvatars] = useState({}); // friends' chosen avatars by account id; no entry = the default ball
  const [offset,setOffset] = useState(0);
  const [error,setError] = useState("");
  const [now,setNow] = useState(()=>Date.now());

  const refresh = useCallback(async ()=>{
    try {
      const [data, shared, picked] = await Promise.all([api.inbox(), api.shareLinks().catch(()=>null), api.avatars().catch(()=>null)]);
      setInbox(data);
      if(shared) setLinks(shared);
      if(picked) setAvatars(picked);
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

  // Details are an address of their own (/friends/details/:id), so Back closes
  // them and a refresh keeps them open. Opened from the list, closing goes
  // back to that same entry; opened directly, it replaces itself with the list.
  const detail = detailId && inbox ? inbox.friends.find(f=>f.friendship_id === detailId) || null : null;
  useEffect(()=>{ if(detailId && inbox && !detail) navigate(paths.friends(), { replace:true }); },[detailId, inbox, detail]);
  const openDetails = useCallback((f)=>navigate(paths.friendDetails(f.friendship_id), { state:{ fromList:true } }),[]);
  const closeDetails = useCallback(()=>{
    if(historyState().fromList) window.history.back();
    else navigate(paths.friends(), { replace:true });
  },[]);
  // Closing hands the focus back to the row it came from.
  const lastDetail = useRef(null);
  useEffect(()=>{
    if(detailId){ lastDetail.current = detailId; return; }
    const fid = lastDetail.current;
    lastDetail.current = null;
    if(fid) document.querySelector(`[data-fid="${CSS.escape(fid)}"] .fr-frow-main`)?.focus({ preventScroll:true });
  },[detailId]);

  const serverNow = now + offset;
  const inviteDone = useCallback(()=>{ onDismissInvite(); refresh(); },[onDismissInvite, refresh]);
  const hasFriends = !!inbox?.friends.length;

  return (
    <div className="fr-wrap">
      <div className="fr-page fr-hub">
        <header className="fr-hub-head">
          <h1 className="fr-h1">Friends</h1>
          {/* Sending a puzzle is the invitation: they play from the link with no
              account, and making one back connects you (SharedPuzzle.jsx). */}
          <button className="fr-btn primary fr-make-btn" onClick={onCreateForNew}>
            <Icon name="cards" size={20}/>Make a puzzle for a friend
          </button>
        </header>

        {/* Invitation links sent before puzzles did the inviting still work. */}
        {pendingInvite && <AcceptInvite token={pendingInvite} onDone={inviteDone} onDismiss={onDismissInvite}/>}
        {error && <div className="fr-msg err">{error} <button className="fr-link" onClick={refresh}>Try again</button></div>}

        {inbox === null && !error && <p className="fr-sub">Loading…</p>}
        {inbox && !hasFriends && !links.length && !pendingInvite && (
          <p className="fr-sub" style={{textAlign:"center"}}>Make a puzzle and text them the link. Friends you trade puzzles with show up here.</p>
        )}
        {hasFriends && (
          <ul className="fr-flist" aria-label="Your friends">
            {inbox.friends.map(f=>(
              <FriendRow key={f.friendship_id} f={f} now={serverNow} avatar={avatars[f.friend_id]}
                onOpen={openDetails} onPlay={onPlay} onResult={onResult} onCreate={onCreate}/>
            ))}
          </ul>
        )}

        {links.length > 0 && (
          <SentLinks links={links} sender={profile.display_name} now={serverNow} onResult={onResult} onChanged={refresh}/>
        )}

        {onOpenSettings && (
          <p className="fr-hub-foot">
            <button className="fr-textbtn muted" onClick={onOpenSettings}><Icon name="bell" size={16}/>Notification settings</button>
          </p>
        )}
      </div>
      {detail && (
        <FriendDetails f={detail} avatar={avatars[detail.friend_id]} now={serverNow} onClose={closeDetails}
          onPlay={onPlay} onResult={onResult} onCreate={onCreate}/>
      )}
    </div>
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
        <Avatar name={info?.inviter_name} avatar={info?.inviter_avatar}/>
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
