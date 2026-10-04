import { useEffect, useState } from "react";
import { ensureAccount, handleCallback } from "./platformSignIn";
import "./account.css";

/**
 * /auth/callback — the ONLY page that turns a sign-in code into a session.
 *
 * The shared sign-in page sends the browser back here with a one-time code.
 * The code is exchanged for a local Cluevoyance session, the account row is
 * created or refreshed (ensure_account), and the player is returned to the
 * page they left from. Every failure lands on a sentence and a way back,
 * never a blank page. Guest history is never touched on this page.
 */

// The code is single-use and handleCallback strips it from the address bar,
// so the exchange must run exactly once per page load, however many times
// React mounts this component (StrictMode mounts effects twice in dev).
let callbackOnce = null;
const runCallbackOnce = () => (callbackOnce ??= handleCallback());

export default function AuthCallback() {
  const [failure, setFailure] = useState(null);
  const [retry, setRetry] = useState(null); // a function when the account step can be retried

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await runCallbackOnce();
      if (cancelled) return;
      if (!result.ok) {
        setFailure(result.errorMessage ?? "Sign-in did not complete.");
        return;
      }
      const finish = async () => {
        const acct = await ensureAccount();
        if (cancelled) return;
        if (!acct.ok) {
          setFailure(acct.message);
          // The sign-in itself succeeded; only the account step failed. Keep
          // the session and offer a retry (not for "not an account", which
          // has already been signed out).
          setRetry(acct.reason === "unavailable" ? () => finish : null);
          return;
        }
        window.location.replace(result.returnTo || "/");
      };
      await finish();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failure) {
    return (
      <div className="cv-callback">
        <div className="cv-callback-card" role="alert">
          <h1>Sign-in did not complete</h1>
          <p data-testid="auth-callback-error">{failure}</p>
          <p className="cv-muted">You can keep playing as a guest and try again later.</p>
          <div className="cv-row">
            {retry && (
              <button type="button" className="cv-btn" onClick={() => { setFailure(null); setRetry(null); retry()(); }}>
                Try again
              </button>
            )}
            <a className="cv-btn cv-btn-quiet" href="/">Back to the game</a>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="cv-callback" aria-busy="true" aria-label="Finishing sign-in">
      <div className="cv-spinner" />
    </div>
  );
}
