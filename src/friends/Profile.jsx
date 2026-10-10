import { useState } from "react";
import { api } from "./client";
import { AVATARS, avatarKey } from "./avatars";
import { Avatar, Spinner } from "./ui.jsx";

// Your profile, at the foot of the Friends hub: avatar, name, a simple avatar
// picker, sign-out. The choice is saved to the account, so friends see it too.

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
          <Avatar name={name} avatar={a.key} size={60}/>
        </label>
      ))}
    </div>
  );
}

function EditName({ profile, onProfile }) {
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState(profile.display_name);
  const [error,setError] = useState("");
  if(!editing) return <button className="fr-textbtn" onClick={()=>{ setName(profile.display_name); setEditing(true); }}>Change name</button>;
  return (
    <span style={{display:"inline-flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
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

export function ProfileCard({ profile, email, onProfile, onSignOut }) {
  const [picking,setPicking] = useState(false);
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
    <section className="fr-card fr-profile" aria-label="Your profile">
      <div className="fr-friend-head">
        <Avatar name={profile.display_name} avatar={profile.avatar} size={56}/>
        <div style={{minWidth:0}}>
          <div className="fr-friend-name">{profile.display_name}</div>
          {email && <div className="fr-friend-status fr-ellipsis">{email}</div>}
        </div>
      </div>
      <div className="fr-profile-actions">
        <button className="fr-textbtn" onClick={()=>setPicking(p=>!p)} aria-expanded={picking}>{picking ? "Done" : "Change avatar"}</button>
        <EditName profile={profile} onProfile={onProfile}/>
        {onSignOut && <button className="fr-textbtn muted" onClick={onSignOut}>Sign out</button>}
      </div>
      {picking && <>
        <AvatarPicker name={profile.display_name} value={profile.avatar} onPick={pick} disabled={busy}/>
        <p className="fr-help" style={{margin:0}} role="status">{busy ? <><Spinner/> Saving…</> : "Friends see it next to your name."}</p>
      </>}
      {error && <div className="fr-msg err">{error}</div>}
    </section>
  );
}
