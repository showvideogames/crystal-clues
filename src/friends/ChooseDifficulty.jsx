import { useState } from "react";
import { DIFF_OPTIONS } from "../game/shared";
import { api } from "./client";
import { Icon, Spinner, PageHead, InfoTip } from "./ui.jsx";

// The recipient's start screen for a friend puzzle: the daily lobby's four
// difficulty levels, meaning the same thing (how many of the creator's three
// bonus cards are dealt). The choice is stored with the attempt and locked.

const dailyPreference = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("clover_difficulty"));
    return DIFF_OPTIONS.some((o) => o.key === saved) ? saved : "standard";
  } catch {
    return "standard";
  }
};

// A puzzle shared by link uses the same screen with its own heading, a
// "Play" button, and onStart in place of the friend-puzzle call.
export default function ChooseDifficulty({ puzzleId, creator, title, onChosen, onBack, onHowToPlay,
  heading, sub, onStart, startLabel = "Start puzzle", note, backLabel }) {
  const [choice, setChoice] = useState(dailyPreference);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await (onStart ? onStart(choice) : api.chooseDifficulty(puzzleId, choice));
      onChosen();
    } catch (err) {
      setBusy(false);
      // Already started elsewhere (another tab or device): load that game.
      if (err.code === "difficulty_locked" || err.code === "already_finished" || err.code === "taken") onChosen();
      else setError(err.message);
    }
  };

  return (
    <div className="fr-wrap">
      <div className="fr-page fr-choose">
        <PageHead onBack={onBack} backLabel={backLabel} title={heading || title || `${creator}'s puzzle`}
          sub={sub !== undefined ? sub : title ? `Made for you by ${creator}` : null}/>

        <div className="fr-eyebrow"><span id="fr-diff-label">Choose your difficulty</span><InfoTip label="About difficulty">
          {creator} made three bonus cards that don't belong on the board. Your difficulty sets how many of them you're dealt.
        </InfoTip></div>
        <div className="lobby-diff-opts" role="radiogroup" aria-labelledby="fr-diff-label">
          {DIFF_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={choice === opt.key}
              className={`lobby-diff-opt${choice === opt.key ? " active" : ""}${opt.key === "standard" ? " recommended" : ""}`}
              onClick={() => setChoice(opt.key)}
            >
              <span className="lobby-diff-icon" aria-hidden="true">{opt.icon}</span>
              <span className="lobby-diff-text">
                <span className="lobby-diff-name">{opt.name}{opt.key === "standard" && <span className="lobby-recommended-tag">Recommended</span>}</span>
                <span className="lobby-diff-desc">{opt.desc}</span>
              </span>
              <span className="lobby-diff-check" aria-hidden="true">{choice === opt.key ? "✓" : ""}</span>
            </button>
          ))}
        </div>
        <p className="fr-choose-note"><b>You can't change it once you start.</b></p>
        {error && <div className="fr-msg err">{error}</div>}
        <button className="fr-btn primary" type="button" onClick={start} disabled={busy} aria-busy={busy}>
          {busy ? <><Spinner/>Dealing…</> : <><span className="fr-btn-ico"><Icon name="play"/></span>{startLabel}</>}
        </button>
        {note && <p className="fr-help" style={{margin:0,textAlign:"center"}}>{note}</p>}
        {onHowToPlay && (
          <p className="fr-foot" style={{marginTop:0}}>New to Cluevoyance? <button type="button" className="fr-link" onClick={onHowToPlay}>How to play</button></p>
        )}
      </div>
    </div>
  );
}
