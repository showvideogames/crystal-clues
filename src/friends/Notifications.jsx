import { useEffect, useState } from "react";
import { api } from "./client";
import { pushSupport, enablePush, disablePush, currentSubscription } from "./push";
import { Icon, Spinner } from "./ui.jsx";
import "./friends.css";

// Friends notifications, in the app's Settings sheet (App.jsx loads this only
// for a signed-in player with a Friends name). profile: get_my_profile().
export default function FriendsNotifications({ profile, onProfile }) {
  return (
    <section className="fr-scope fr-settings-notify" aria-labelledby="fr-notify-title">
      <div className="settings-title" id="fr-notify-title">Friends notifications</div>
      <NotificationSettings profile={profile} onProfile={onProfile}/>
    </section>
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
      setError("This browser couldn't turn on notifications. Your inbox in Friends still shows everything.");
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
