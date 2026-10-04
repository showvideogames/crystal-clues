import { useState } from "react";
import { guestHistorySummary } from "./localHistory";
import "./account.css";

/**
 * "Bring your progress with you?" — shown once, after the first sign-in on a
 * browser that already holds guest history. Add my progress uploads the wins
 * into the account; Start fresh leaves the account clean. Either way this
 * browser's guest record is cleared afterwards, so nothing is ever merged
 * silently and nothing can be imported twice.
 */
export default function ImportPrompt({ onAdd, onStartFresh }) {
  const [busy, setBusy] = useState(false);
  const { wins, played, maxStreak } = guestHistorySummary();
  const noun = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  return (
    <div className="cv-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cv-import-title" data-testid="import-prompt">
      <div className="cv-modal">
        <h2 id="cv-import-title">Bring your progress with you?</h2>
        <p>
          This browser has played Cluevoyance before: {noun(wins, "win", "wins")}
          {played > wins ? ` out of ${noun(played, "game", "games")}` : ""}
          {maxStreak > 1 ? `, best streak ${maxStreak}` : ""}.
        </p>
        <p className="cv-muted">
          Add it to your account and it follows you to every device. Start fresh and your account begins empty. Losses only ever counted as totals and stay behind either way.
        </p>
        <div className="cv-row">
          <button
            type="button"
            className="cv-btn"
            data-testid="import-add"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onAdd(); } finally { setBusy(false); } }}
          >
            Add my progress
          </button>
          <button type="button" className="cv-btn cv-btn-quiet" data-testid="import-start-fresh" disabled={busy} onClick={onStartFresh}>
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}
