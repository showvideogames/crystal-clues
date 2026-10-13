import { useState } from "react";
import { api } from "./client";
import { AVATARS, avatarKey } from "./avatars";
import { Avatar, Sheet, Spinner } from "./ui.jsx";
import "./friends.css";

// Your Friends profile — avatar and name — edited from the header's account
// menu (App.jsx loads this on demand). The choice is saved to the account, so
// friends see it too.

// Seven pictures in one group. Real radio inputs, so the keyboard and screen
// readers get the arrow-key behaviour for free. The default ball wears your
// initial here exactly as it will elsewhere.
export function AvatarPicker({ name, value, onPick, disabled }) {
  const current = avatarKey(value);
  return (
    <div className="fr-avpick" role="radiogroup" aria-label="Choose your avatar">
      {AVATARS.map((a)=>(
        <label key={a.key} className="fr-avopt">
          <input type="radio" name="fr-avatar" value={a.key} checked={current === a.key} disabled={disabled}
            aria-label={a.key === "ball" ? "Crystal ball with your initial" : a.label}
            onChange={()=>onPick(a.key)}/>
          <Avatar name={name} avatar={a.key} size={56}/>
        </label>
      ))}
    </div>
  );
}

function EditName({ profile, onProfile }) {
  const [name,setName] = useState(profile.display_name);
  const [busy,setBusy] = useState(false);
  const [saved,setSaved] = useState(false);
  const [error,setError] = useState("");
  const changed = name.trim() && name.trim() !== profile.display_name;
  const save = async (e)=>{
    e.preventDefault();
    if(!changed) return;
    setBusy(true); setError(""); setSaved(false);
    try { onProfile(await api.setName(name)); setSaved(true); }
    catch(err){ setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{display:"flex",flexDirection:"column",gap:6}}>
      <label className="fr-label" htmlFor="fr-profile-name" style={{margin:"0 0 0 2px"}}>Your name</label>
      <div className="fr-linkbox">
        <input id="fr-profile-name" className="fr-input" maxLength={24} value={name} autoComplete="given-name"
          onChange={e=>{ setName(e.target.value); setSaved(false); }}/>
        <button className="fr-btn secondary sm" disabled={busy || !changed} aria-busy={busy}>{busy ? <><Spinner/>Saving…</> : "Save"}</button>
      </div>
      <span className="fr-help" style={{margin:"0 2px"}} role="status">{saved ? "Saved." : "Friends see it on puzzles you send."}</span>
      {error && <div className="fr-msg err">{error}</div>}
    </form>
  );
}

export default function ProfileDialog({ profile, email, onProfile, onClose }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const pick = async (key)=>{
    if(key === avatarKey(profile.avatar)) return;
    setBusy(true); setError("");
    try { onProfile(await api.setAvatar(key)); }
    catch(err){ setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <Sheet labelledBy="fr-profile-title" onClose={onClose} head={<>
      <Avatar name={profile.display_name} avatar={profile.avatar} size={48}/>
      <div style={{minWidth:0,flex:1}}>
        <h2 className="fr-modal-title" id="fr-profile-title">{profile.display_name}</h2>
        {email && <div className="fr-sub fr-ellipsis">{email}</div>}
      </div>
    </>}>
      <EditName profile={profile} onProfile={onProfile}/>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <span className="fr-label" style={{margin:"0 0 0 2px"}}>Your avatar</span>
        <AvatarPicker name={profile.display_name} value={profile.avatar} onPick={pick} disabled={busy}/>
        {busy && <span className="fr-help" style={{margin:0}} role="status"><Spinner/> Saving…</span>}
      </div>
      {error && <div className="fr-msg err">{error}</div>}
      <button className="fr-btn primary" onClick={onClose}>Done</button>
    </Sheet>
  );
}
