// Signing in to Cluevoyance with the shared account.
//
// Cluevoyance has ONE sign-in method: the shared identity provider (WorkOS
// AuthKit), wired into this project's Supabase Auth as the custom OIDC
// provider `custom:platform`. Ported from Rainbow (src/lib/platformSignIn.ts),
// minus Rainbow's device identity: Cluevoyance guests live in localStorage.
//
//   signInWithPlatform      leave for the hosted sign-in page (after checking
//                           it is reachable, so an outage never strands the
//                           player on a browser error page)
//   handleCallback          runs ONLY on /auth/callback: swaps the one-time
//                           code for a LOCAL session and strips the code from
//                           the address bar
//   ensureAccount           asks the server to create/refresh the account
//                           behind this session (ensure_account RPC). An auth
//                           user that did not come through the shared sign-in
//                           is NOT a Cluevoyance account and is signed out
//                           again locally
//   signOutOfCluevoyance    local sign-out: this game, this browser. The
//                           shared session and other games are untouched.
//                           The browser becomes a brand-new guest
//   deleteMyAccount         self-service deletion of the local account
//
// Nothing here names a provider brand, a project or a domain: the discovery
// URL and the feature switch are configuration (src/game/config.js).

import { ACCOUNTS_ENABLED, PLATFORM_DISCOVERY_URL } from "../game/config";
import { AUTH_STORAGE_KEY, supabase } from "./supabaseClient";
import { rememberReturnPath, takeReturnPath } from "./safePath";
import { clearAccountCache, clearGuestHistory } from "./localHistory";

export const PLATFORM_PROVIDER = "custom:platform";
export const HUB_UNAVAILABLE = "Sign-in is temporarily unavailable. You can keep playing and try again later.";
export const NOT_CLUEVOYANCE_ACCOUNT = "That sign-in is not a Cluevoyance account.";

export function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

/** Plain reachability test of the identity provider: no credentials, nothing read. */
export async function hubIsReachable(timeoutMs = 8000) {
  if (!PLATFORM_DISCOVERY_URL) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(PLATFORM_DISCOVERY_URL, { mode: "no-cors", credentials: "omit", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Leave for the shared sign-in page. Returns an error message, or null when the redirect is under way. */
export async function signInWithPlatform() {
  if (!ACCOUNTS_ENABLED || !supabase) return HUB_UNAVAILABLE;
  if (!(await hubIsReachable())) return HUB_UNAVAILABLE;
  rememberReturnPath();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: PLATFORM_PROVIDER,
    options: { redirectTo: callbackUrl(), scopes: "openid email profile" },
  });
  return error ? error.message : null;
}

/**
 * Runs ONLY on /auth/callback. Exchanges the one-time code for a local
 * session. The code and any error text are removed from the address bar
 * (and history) immediately, whatever happens next. Guest history is never
 * touched here: a failed callback leaves the browser exactly as it was.
 */
export async function handleCallback() {
  const returnTo = takeReturnPath();
  const url = new URL(window.location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const pick = (k) => url.searchParams.get(k) ?? fromHash.get(k);

  const code = pick("code");
  const errorCode = pick("error_code") ?? pick("error");
  const errorMessage = pick("error_description");

  window.history.replaceState(null, "", "/auth/callback");

  if (errorCode) return { ok: false, errorCode, errorMessage: errorMessage ?? errorCode, returnTo };
  if (!code) return { ok: false, errorCode: "missing_code", errorMessage: "No sign-in code was returned.", returnTo };
  if (!supabase) return { ok: false, errorCode: "not_configured", errorMessage: HUB_UNAVAILABLE, returnTo };

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return { ok: false, errorCode: error.code ?? "exchange_failed", errorMessage: error.message, returnTo };
  }
  forgetHubTokens();
  return { ok: true, returnTo };
}

/**
 * After a sign-in Supabase hands the page the identity provider's own access
 * token and keeps it in browser storage. Cluevoyance has no use for it.
 * Remove it at once; the local session is untouched.
 */
export function forgetHubTokens() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored && (stored.provider_token || stored.provider_refresh_token)) {
      delete stored.provider_token;
      delete stored.provider_refresh_token;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    // storage unavailable: nothing was kept, so nothing to remove
  }
}

// ── The current account: one client-side source, fed by the server ──
//
// Whatever ensure_account() last returned IS the account the app shows.
// Anything that displays account details reads this, never the auth user
// object, whose email is stale after a change at the shared provider.

let currentAccount = null;
const listeners = new Set();

function publishAccount(account) {
  currentAccount = account;
  for (const l of listeners) l(account);
}

export function getCurrentAccount() {
  return currentAccount;
}

const toAccount = (row) => ({
  user_id: row.user_id,
  global_user_id: row.global_user_id,
  email: row.email ?? null,
  created_at: row.created_at,
  imported_losses: Number(row.imported_losses) || 0,
});

/** Re-read the account row (my_account) and publish it; used after an import changed it. */
export async function refreshAccount() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_account");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.user_id) return null;
  const account = toAccount(row);
  publishAccount(account);
  return account;
}

export function subscribeToCurrentAccount(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The server's answer to "is this session a Cluevoyance account?", creating
 * the account on first sight. Reasons: ok | not_signed_in |
 * not_platform_linked | unavailable. On `unavailable` the session is KEPT so
 * the player can try again (the sign-in itself succeeded).
 */
export async function ensureAccount() {
  if (!supabase) return { ok: false, account: null, reason: "unavailable", message: HUB_UNAVAILABLE };
  const { data, error } = await supabase.rpc("ensure_account");
  if (error) return { ok: false, account: null, reason: "unavailable", message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  switch (row?.outcome) {
    case "ok": {
      if (!row.user_id) break;
      const account = toAccount(row);
      publishAccount(account);
      return { ok: true, account, reason: "ok", message: "" };
    }
    case "not_platform_linked":
      publishAccount(null);
      await supabase.auth.signOut({ scope: "local" });
      return { ok: false, account: null, reason: "not_platform_linked", message: NOT_CLUEVOYANCE_ACCOUNT };
    case "not_signed_in":
      publishAccount(null);
      return { ok: false, account: null, reason: "not_signed_in", message: "Not signed in." };
  }
  return { ok: false, account: null, reason: "unavailable", message: "No account row was returned." };
}

/**
 * LOCAL sign-out: this game, this browser. The shared session at the
 * provider is untouched (other games stay signed in). The browser then
 * starts over as a brand-new guest: the account's cached history and any
 * guest keys are cleared, so a shared computer never shows one person's
 * games to the next.
 */
export async function signOutOfCluevoyance() {
  try {
    if (supabase) await supabase.auth.signOut({ scope: "local" });
  } finally {
    publishAccount(null);
    clearAccountCache();
    clearGuestHistory();
  }
}

/**
 * Delete the signed-in account and its plays. The shared identity survives;
 * signing in again creates a fresh, empty account with the same global id.
 */
export async function deleteMyAccount() {
  if (!supabase) return { ok: false, message: HUB_UNAVAILABLE };
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) return { ok: false, message: error.message };
  if (data !== true) return { ok: false, message: "This session is not a Cluevoyance account." };
  // The auth user is gone server-side; drop the stored session first so
  // signOut finds nothing to revoke and makes no request with a dead token.
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  await signOutOfCluevoyance();
  return { ok: true };
}
