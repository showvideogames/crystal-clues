// Return-path safety for the sign-in round trip (copied from Rainbow,
// src/lib/safePath.ts; originally the shared-accounts-poc kit).
//
// Before the browser leaves for the shared sign-in page, the path the player
// was on is remembered so they land back on it afterwards. Only a path on
// THIS origin is ever accepted; anything else silently becomes the home
// page. A full URL is never stored or followed.

export function safeInternalPath(candidate, ownOrigin, fallback = "/") {
  if (typeof candidate !== "string") return fallback;
  const value = candidate.trim();
  if (value === "" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  let resolved;
  try {
    resolved = new URL(value, ownOrigin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== new URL(ownOrigin).origin) return fallback;
  return resolved.pathname + resolved.search + resolved.hash;
}

const RETURN_KEY = "cv-auth-return-to";

/** Remember where the player is, before leaving for the sign-in page. Same tab only. */
export function rememberReturnPath(ownOrigin = window.location.origin) {
  const here = window.location.pathname + window.location.search;
  const safe = safeInternalPath(here, ownOrigin);
  try {
    sessionStorage.setItem(RETURN_KEY, safe.startsWith("/auth/") ? "/" : safe);
  } catch {
    // storage blocked: the player simply lands on the home page
  }
}

/** Read it back once. Always re-validated: storage is not trusted. */
export function takeReturnPath(ownOrigin = window.location.origin) {
  let stored = null;
  try {
    stored = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
  return safeInternalPath(stored, ownOrigin);
}
