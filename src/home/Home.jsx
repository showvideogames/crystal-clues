// The front page: two equal ways in (today's puzzle, a puzzle for a friend),
// the Friends list beneath them, and Archive / How to Play as quiet links.
// Every number on it is real: the daily button follows this browser's (or the
// account's) saved progress, and "puzzles waiting" is the Friends inbox count,
// shown only once it has been fetched.
import { dailyCopy, friendsCopy } from "./copy.js";
import "./home.css";

const CRYSTAL_BALL = "/assets/crystal-ball-star.webp";

const ICONS = {
  calendar: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="6.5" width="24" height="21" rx="5" className="hm-ico-fill"/>
      <path d="M4 12.5h24" className="hm-ico-line"/>
      <path d="M10.5 4v5M21.5 4v5" className="hm-ico-line"/>
      <rect x="9" y="16" width="4" height="3.4" rx="1" className="hm-ico-dot"/>
      <rect x="14" y="16" width="4" height="3.4" rx="1" className="hm-ico-dot"/>
      <rect x="19" y="16" width="4" height="3.4" rx="1" className="hm-ico-dot soft"/>
      <rect x="9" y="21" width="4" height="3.4" rx="1" className="hm-ico-dot soft"/>
      <rect x="14" y="21" width="4" height="3.4" rx="1" className="hm-ico-dot"/>
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="12.5" y="5.5" width="14" height="19" rx="3" transform="rotate(10 19.5 15)" className="hm-ico-fill soft"/>
      <rect x="5.5" y="7.5" width="14" height="19" rx="3" transform="rotate(-8 12.5 17)" className="hm-ico-fill"/>
      <path d="M12.5 11.5l1.3 3.6 3.6 1.3-3.6 1.3-1.3 3.6-1.3-3.6-3.6-1.3 3.6-1.3z" className="hm-ico-star"/>
    </svg>
  ),
  friends: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="12" cy="11" r="4.6" className="hm-ico-solid"/>
      <path d="M3.8 25.5c.7-4.8 3.9-7.7 8.2-7.7s7.5 2.9 8.2 7.7z" className="hm-ico-solid"/>
      <circle cx="22.4" cy="12.3" r="3.6" className="hm-ico-solid soft"/>
      <path d="M20.3 18.3c4.3-.6 7.3 1.9 7.9 6.2h-6.4c-.2-2.4-.7-4.4-1.5-6.2z" className="hm-ico-solid soft"/>
    </svg>
  ),
  chevron: <svg viewBox="0 0 24 24" aria-hidden="true" className="hm-chev"><path d="M9 5l7 7-7 7"/></svg>,
};

function Action({ kind = "primary", icon, title, sub, onClick, testId, busy }){
  return (
    <button type="button" className={`hm-action ${kind}`} onClick={onClick} data-testid={testId} aria-busy={busy || undefined}>
      <span className="hm-action-ico">{ICONS[icon]}</span>
      <span className="hm-action-text">
        <span className="hm-action-title">{title}</span>
        {sub && <span className="hm-action-sub">{sub}</span>}
      </span>
      {ICONS.chevron}
    </button>
  );
}

export default function Home({ daily, friendsEnabled, friends, onDaily, onMakePuzzle, onFriends, onArchive, onHowToPlay }){
  const d = dailyCopy(daily);
  return (
    <main className="hm" aria-labelledby="hm-tagline">
      <div className="hm-inner">
        <div className="hm-hero" aria-hidden="true">
          <span className="hm-glow"/>
          <img className="hm-ball" src={CRYSTAL_BALL} alt="" width="353" height="399"/>
          <span className="hm-spark s1">✦</span><span className="hm-spark s2">✦</span>
          <span className="hm-spark s3">✧</span><span className="hm-spark s4">✦</span>
        </div>
        <h1 className="hm-tagline" id="hm-tagline">A little mystery.<br/>A little friendly rivalry.</h1>

        <div className="hm-actions">
          <div className="hm-main">
            <Action icon="calendar" title={d.title} sub={d.sub} onClick={onDaily} testId="home-daily" busy={daily.status === "loading"}/>
            {friendsEnabled && (
              <Action icon="cards" title="Make a Friend a Puzzle" sub="Create it. Send it. Watch them solve." onClick={onMakePuzzle} testId="home-make"/>
            )}
          </div>
          {friendsEnabled && (
            <Action kind="outline" icon="friends" title="Your Friends" sub={friendsCopy(friends)} onClick={onFriends} testId="home-friends"/>
          )}
        </div>

        <nav className="hm-links" aria-label="More">
          <button type="button" className="hm-link" onClick={onArchive}>Archive</button>
          <span className="hm-link-sep" aria-hidden="true"/>
          <button type="button" className="hm-link" onClick={onHowToPlay}>How to Play</button>
        </nav>
      </div>
    </main>
  );
}
