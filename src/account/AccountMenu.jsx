import { useEffect, useRef, useState } from "react";
import "./account.css";

/**
 * The header's account control. Guest: a "Sign in" button. Signed in: a
 * small menu with the account's CURRENT email (as the server reports it),
 * Sign out, and "Delete account…" with a confirmation. Renders nothing when
 * accounts are off, so a guest-only build looks exactly like today.
 */
export default function AccountMenu({ status, account, message, onSignIn, onSignOut, onDelete, onDismissMessage }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (status === "off") return null;

  const notice = message ? (
    <div className="cv-notice" role="status" data-testid="account-message">
      <span>{message}</span>
      <button type="button" className="cv-notice-x" aria-label="Dismiss" onClick={onDismissMessage}>×</button>
    </div>
  ) : null;

  if (status !== "signed_in" || !account) {
    return (
      <>
        <button
          type="button"
          className="nbtn"
          data-testid="platform-sign-in"
          disabled={busy || status === "checking"}
          onClick={async () => { setBusy(true); try { await onSignIn(); } finally { setBusy(false); } }}
        >
          Sign in
        </button>
        {notice}
      </>
    );
  }

  const initial = (account.email || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="cv-account" ref={wrapRef}>
      <button
        type="button"
        className="gear-btn cv-avatar"
        title={account.email || "Account"}
        aria-label="Account menu"
        aria-expanded={open}
        data-testid="account-menu-button"
        onClick={() => { setOpen((v) => !v); setConfirming(false); }}
      >
        {initial}
      </button>
      {open && (
        <div className="cv-menu" data-testid="account-menu">
          <div className="cv-menu-email" data-testid="account-email">{account.email || "Signed in"}</div>
          {!confirming ? (
            <>
              <button type="button" className="cv-menu-item" data-testid="sign-out" onClick={async () => { setOpen(false); await onSignOut(); }}>
                Sign out
              </button>
              <button type="button" className="cv-menu-item cv-danger" onClick={() => setConfirming(true)}>
                Delete account…
              </button>
            </>
          ) : (
            <div className="cv-confirm">
              <p>Delete your Cluevoyance account and its history? Your shared sign-in stays; you can sign in again later with a clean slate.</p>
              <div className="cv-row">
                <button
                  type="button"
                  className="cv-btn cv-danger-btn"
                  data-testid="delete-account"
                  disabled={busy}
                  onClick={async () => { setBusy(true); try { if (await onDelete()) setOpen(false); } finally { setBusy(false); setConfirming(false); } }}
                >
                  Delete
                </button>
                <button type="button" className="cv-btn cv-btn-quiet" onClick={() => setConfirming(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      )}
      {notice}
    </div>
  );
}
