// This browser's private guest key for puzzles shared by link. It's random,
// made here, kept only in this browser, and never part of a link: the
// server stores only a hash of it on the puzzle a guest starts, and only the
// same key can continue, see the result or save it to an account. So a
// forwarded or leaked link can't take over someone's game.
const KEY = "cv-guest-key";

const fresh = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let memory = null; // when storage is blocked: works for this visit only
export function guestKey() {
  try {
    let k = localStorage.getItem(KEY);
    if (!k || !/^[A-Za-z0-9_-]{32,128}$/.test(k)) {
      k = fresh();
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return (memory ??= fresh());
  }
}

// After signing in from a shared puzzle's results: the same tab finishes the
// save when it comes back (the tap was the decision; nothing else triggers it).
const SAVE_INTENT = "cv-share-save";
export const rememberSaveIntent = (token) => { try { sessionStorage.setItem(SAVE_INTENT, token); } catch { /* ignore */ } };
export const hasSaveIntent = (token) => {
  try { return sessionStorage.getItem(SAVE_INTENT) === token; } catch { return false; }
};
export const clearSaveIntent = () => { try { sessionStorage.removeItem(SAVE_INTENT); } catch { /* ignore */ } };
