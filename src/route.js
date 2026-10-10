// Stable addresses for Cluevoyance's screens, so a refresh, a shared link,
// browser Back/Forward and the return from sign-in all land on the same
// screen. No router library: the address bar's path IS the app's location,
// and screens derive what to show from it. Vercel serves index.html for every
// path (vercel.json), so each of these loads directly.
//
//   /                              today's puzzle
//   /archive                       the archive
//   /archive/:puzzleId             an archive puzzle
//   /admin                         admin (admin accounts only)
//   /friends                       Friends hub
//   /friends/play/:puzzleId        a friend's puzzle (or, for its creator, its status)
//   /friends/guesses/:puzzleId     the guesses replay and results
//   /friends/make/:friendshipId    making a puzzle for that friend ("new": for someone new, by link)
//   /p/:code                       a puzzle shared by link: playable without an account
//
// Links from before these addresses keep working: /?invite=TOKEN (invite
// links already sent) and /?friends=1[&puzzle=…|&result=…] (notifications).
import { useSyncExternalStore } from "react";

const NAV_EVENT = "cv:navigate";
const ID = /^[A-Za-z0-9-]{1,64}$/;

const here = () => window.location.pathname + window.location.search;

/** Go to `path`. Same place → nothing (no duplicate history entries). `state` rides along in history (e.g. a friend's name). */
export function navigate(path, { replace = false, state = null } = {}) {
  if (path === here() && !replace) return;
  window.history[replace ? "replaceState" : "pushState"](state, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribe(onChange) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

/** The current path, re-rendering on every navigation (including Back/Forward). */
export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

/** What the current history entry carries (see navigate's `state`). */
export const historyState = () => window.history.state || {};

/**
 * The screen a path names. Unknown or malformed paths are `unknown` (the
 * caller sends them to `/`). Friends paths are only screens when Friends is on.
 *   { view: "game", archiveId? } | { view: "archive" } | { view: "admin" }
 *   | { view: "friends", screen: { name: "inbox" | "play" | "result" | "create", id? } } | { view: "unknown" }
 */
export function parsePath(pathname, { friends = false } = {}) {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (parts.length === 0) return { view: "game" };
  if (a === "archive" && parts.length === 1) return { view: "archive" };
  if (a === "archive" && parts.length === 2 && /^\d{1,20}$/.test(b)) return { view: "game", archiveId: b };
  if (a === "admin" && parts.length === 1) return { view: "admin" };
  if (friends && a === "p" && parts.length === 2 && /^[A-Za-z0-9_-]{16,64}$/.test(b)) return { view: "shared", token: b };
  if (friends && a === "friends") {
    if (parts.length === 1) return { view: "friends", screen: { name: "inbox" } };
    const name = { play: "play", guesses: "result", make: "create" }[b];
    if (name && parts.length === 3 && ID.test(c)) return { view: "friends", screen: { name, id: c } };
  }
  return { view: "unknown" };
}

export const paths = {
  today: () => "/",
  archive: () => "/archive",
  archivePuzzle: (id) => `/archive/${encodeURIComponent(id)}`,
  admin: () => "/admin",
  friends: () => "/friends",
  play: (id) => `/friends/play/${encodeURIComponent(id)}`,
  result: (id) => `/friends/guesses/${encodeURIComponent(id)}`,
  make: (friendshipId) => `/friends/make/${encodeURIComponent(friendshipId)}`,
  makeForNew: () => "/friends/make/new",
  shared: (token) => `/p/${encodeURIComponent(token)}`,
};

/**
 * Runs once at start-up: rewrites a link from before these addresses into
 * its address (without a history entry) and returns an invite token to keep,
 * if there was one. Tokens never stay in the address bar.
 */
export function adoptLegacyLink({ friends = false } = {}) {
  if (!friends) return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const invite = q.get("invite");
    if (invite) {
      window.history.replaceState(null, "", paths.friends());
      return invite;
    }
    if (q.get("friends")) {
      const puzzle = q.get("puzzle"), result = q.get("result");
      const to = puzzle && ID.test(puzzle) ? paths.play(puzzle)
        : result && ID.test(result) ? paths.result(result)
        : paths.friends();
      window.history.replaceState(null, "", to);
    }
  } catch {
    // an unreadable address: leave it to parsePath
  }
  return null;
}
