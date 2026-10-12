// Small shared pieces for the Friends screens: the page heading, icons,
// the avatar, a busy spinner and the ⓘ help tip. Styles live in friends.css.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const paths = {
  back:    <path d="M15 5l-7 7 7 7"/>,
  next:    <path d="M9 5l7 7-7 7"/>,
  play:    <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>,
  pause:   <><rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/></>,
  plus:    <path d="M12 5v14M5 12h14"/>,
  check:   <path d="M5 12.5l4.5 4.5L19 7.5"/>,
  dice:    <><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/></>,
  clock:   <><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></>,
  help:    <><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.7"/><circle cx="12" cy="16.9" r=".9" fill="currentColor" stroke="none"/></>,
  bell:    <><path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5z"/><path d="M10 19.5a2 2 0 004 0"/></>,
  // Making a puzzle: a card in front of another, with a plus.
  cards:   <><path d="M9 5.5V5a2 2 0 012-2h7a2 2 0 012 2v10a2 2 0 01-2 2h-.5"/><rect x="4" y="7" width="12" height="14" rx="2"/><path d="M10 11v6M7 14h6"/></>,
  link:    <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></>,
  close:   <path d="M6 6l12 12M18 6L6 18"/>,
  history: <><path d="M4.5 12a7.5 7.5 0 102.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8v4l2.5 1.5"/></>,
  restart: <><path d="M5 12a7 7 0 107-7H8.5"/><path d="M11 2L8 5l3 3"/></>,
  eye:     <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></>,
};

export function Icon({ name, size = 20, className = "" }) {
  return (
    <svg className={`fr-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export const Spinner = () => <span className="fr-spinner" aria-hidden="true"/>;

export { Avatar } from "./Avatar.jsx";

// Back row, decorative title, one plain line underneath.
export function PageHead({ onBack, backLabel = "Friends", title, sub, children }) {
  return (
    <header className="fr-head">
      {onBack && (
        <button type="button" className="fr-back" onClick={onBack}>
          <Icon name="back" size={18}/>{backLabel}
        </button>
      )}
      <h1 className="fr-h1">{title}</h1>
      {sub && <p className="fr-lede">{sub}</p>}
      {children}
    </header>
  );
}

// A quiet full-width row: icon bubble, label (and an optional second line), chevron.
export function RowButton({ icon, label, detail, onClick, open, dot, className = "", ...rest }) {
  return (
    <button type="button" className={`fr-rowbtn ${className}`} onClick={onClick} aria-expanded={open} {...rest}>
      {icon && <span className="fr-rowbtn-ico"><Icon name={icon} size={18}/></span>}
      <span className="fr-rowbtn-text">
        <span className="fr-rowbtn-label">{label}{dot && <span className="fr-dot-new" aria-label="new"/>}</span>
        {detail && <span className="fr-rowbtn-detail">{detail}</span>}
      </span>
      <Icon name="next" size={18} className={`fr-rowbtn-chev${open ? " open" : ""}`}/>
    </button>
  );
}

// ⓘ next to a label, for an optional explanation. Tap or click toggles it
// (phones), a mouse shows it on hover, the keyboard on focus; Escape or a tap
// elsewhere closes it. Essential instructions stay on the page, not in here.
export function InfoTip({ label, children }) {
  const [pinned,setPinned]   = useState(false);
  const [hovered,setHovered] = useState(false);
  const [focused,setFocused] = useState(false);
  const wrap = useRef(null);
  const pop = useRef(null);
  const id = useId();
  const open = pinned || hovered || focused;
  // Keep the bubble on screen: shift it left by however much it would overflow.
  useLayoutEffect(()=>{
    const el = pop.current;
    if(!open || !el) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const over = r.right - (document.documentElement.clientWidth - 12);
    const room = r.left - 12;
    if(over > 0) el.style.transform = `translateX(${-Math.min(over, Math.max(0, room))}px)`;
  },[open]);
  useEffect(()=>{
    if(!open) return undefined;
    const away = (e)=>{ if(!wrap.current?.contains(e.target)){ setPinned(false); setHovered(false); setFocused(false); } };
    const esc = (e)=>{ if(e.key === "Escape"){ setPinned(false); setHovered(false); setFocused(false); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return ()=>{ document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  },[open]);
  return (
    <span className="fr-tip" ref={wrap}
      onPointerEnter={(e)=>{ if(e.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={(e)=>{ if(e.pointerType === "mouse") setHovered(false); }}>
      <button type="button" className="fr-tip-btn" aria-label={label} aria-expanded={open} aria-controls={id}
        onClick={()=>{ setPinned(p=>!(p || hovered || focused)); setHovered(false); setFocused(false); }}
        onFocus={(e)=>{ if(e.currentTarget.matches(":focus-visible")) setFocused(true); }}
        onBlur={()=>setFocused(false)}>
        <span aria-hidden="true">i</span>
      </button>
      <span ref={pop} id={id} role="tooltip" className={`fr-tip-pop${open ? " open" : ""}`} hidden={!open}>{children}</span>
    </span>
  );
}
