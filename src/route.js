// Stable addresses for Cluevoyance's screens, so a refresh, a shared link,
// browser Back/Forward and the return from sign-in all land on the same
// screen. No router library: the address bar's path IS the app's location,
// and screens derive what to show from it. Vercel serves index.html for every
// path (vercel.json), so each of these loads directly.
//
//   /                              the front page: today's puzzle, a puzzle for a friend, Friends
//   /today                         today's puzzle: difficulty, then the board (once done: the board as it ended)
//   /archive                       the archive
//   /archive/:puzzleId             an archive puzzle
//   /admin                         puzzle admin (open to everyone during the beta)
//   /unlimited                     Unlimited guest beta (src/unlimited): not linked from anywhere yet
//   /beta                          Random-Pair Pilot Beta (src/unlimited/beta): public test page, not linked from menus
//   /unlimited-beta                the same pilot beta (earlier address, kept as an alias)
//   /friends                       Friends hub
//   /friends/details/:friendshipId the hub with one friend's details open
//   /friends/play/:puzzleId        a friend's puzzle (or, for its creator, its status)
//   /friends/guesses/:puzzleId     the guesses replay and results
//   /friends/make/:friendshipId    making a puzzle for that friend ("new": for anyone, sent as a link)
//   /p/:code                       a puzzle shared by link: playable without an account
//   /join/:code                    an older friend invitation (taken in at start-up, then /friends)
//
// /p/ and /join/ links get their own link preview (api/link.js, vercel.json).
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
 *   { view: "home" } | { view: "game", archiveId? } | { view: "archive" } | { view: "admin" }
 *   | { view: "friends", screen: { name: "inbox" | "details" | "play" | "result" | "create", id? } } | { view: "unknown" }
 */
export function parsePath(pathname, { friends = false } = {}) {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (parts.length === 0) return { view: "home" };
  if (a === "today" && parts.length === 1) return { view: "game" };
  if (a === "archive" && parts.length === 1) return { view: "archive" };
  if (a === "archive" && parts.length === 2 && /^\d{1,20}$/.test(b)) return { view: "game", archiveId: b };
  if (a === "admin" && parts.length === 1) return { view: "admin" };
  if (a === "unlimited" && parts.length === 1) return { view: "unlimited" };
  if ((a === "beta" || a === "unlimited-beta") && parts.length === 1) return { view: "unlimitedBeta" };
  if (friends && a === "p" && parts.length === 2 && /^[A-Za-z0-9_-]{16,64}$/.test(b)) return { view: "shared", token: b };
  if (friends && a === "friends") {
    if (parts.length === 1) return { view: "friends", screen: { name: "inbox" } };
    const name = { play: "play", guesses: "result", make: "create", details: "details" }[b];
    if (name && parts.length === 3 && ID.test(c)) return { view: "friends", screen: { name, id: c } };
  }
  return { view: "unknown" };
}

export const paths = {
  home: () => "/",
  today: () => "/today",
  archive: () => "/archive",
  archivePuzzle: (id) => `/archive/${encodeURIComponent(id)}`,
  admin: () => "/admin",
  unlimited: () => "/unlimited",
  friends: () => "/friends",
  friendDetails: (friendshipId) => `/friends/details/${encodeURIComponent(friendshipId)}`,
  play: (id) => `/friends/play/${encodeURIComponent(id)}`,
  result: (id) => `/friends/guesses/${encodeURIComponent(id)}`,
  make: (friendshipId) => `/friends/make/${encodeURIComponent(friendshipId)}`,
  makeForNew: () => "/friends/make/new",
  shared: (token) => `/p/${encodeURIComponent(token)}`,
  join: (token) => `/join/${encodeURIComponent(token)}`,
};

/**
 * Runs once at start-up: rewrites an invitation (/join/:code, or the older
 * /?invite=) or a link from before these addresses into its address (without
 * a history entry) and returns an invite token to keep, if there was one.
 * Tokens never stay in the address bar.
 */
export function adoptLegacyLink({ friends = false } = {}) {
  if (!friends) return null;
  try {
    const join = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{8,80})\/?$/);
    if (join) {
      window.history.replaceState(null, "", paths.friends());
      return join[1];
    }
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
