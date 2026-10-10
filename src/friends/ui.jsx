// Small shared pieces for the Friends screens: the page heading, icons,
// the friend avatar and a busy spinner. Styles live in friends.css.

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
  pencil:  <><path d="M5 19l1-4L15.5 5.5a2.1 2.1 0 013 3L9 18z"/><path d="M13.5 7.5l3 3"/></>,
  history: <><path d="M4.5 12a7.5 7.5 0 102.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8v4l2.5 1.5"/></>,
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

// A little crystal ball wearing the friend's initial.
export function FriendAvatar({ name = "?", size = 52 }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <svg className="fr-avatar" width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <defs>
        <radialGradient id="frBall" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#c7b1ff"/><stop offset=".55" stopColor="#8b5cf6"/><stop offset="1" stopColor="#5b21b6"/>
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="28" fill="#efe7fd"/>
      <path d="M17.5 41.5h21l-2.2 4.5H19.7z" fill="#f2b33d"/>
      <circle cx="28" cy="25.5" r="15" fill="url(#frBall)"/>
      <ellipse cx="22.5" cy="19" rx="4.2" ry="2.6" fill="#fff" opacity=".45" transform="rotate(-28 22.5 19)"/>
      <text x="28" y="31" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="16" fill="#fff">{initial}</text>
    </svg>
  );
}

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
