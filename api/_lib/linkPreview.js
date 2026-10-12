// Link previews (the picture and words a messaging app shows for a link):
//   /p/<code>     a puzzle shared by link   "Deb made you a puzzle!"
//   /join/<code>  an invitation sent before puzzles did the inviting
//                 (still honoured)           "Deb wants to trade puzzles with you"
// Shared by api/link.js (the page, with preview tags) and api/og.js (the
// picture). Folders starting with "_" under /api are not deployed as functions.
//
// Rules:
// • Look-ups only read. They use the same anon calls the app makes before
//   anyone taps anything: open_shared_puzzle and get_friend_invite, both
//   declared STABLE in the database, so they cannot write — a preview can
//   never claim, start or accept anything.
// • No spoilers: only the sender's display name, never the puzzle's title,
//   clues or cards.
// • "No account needed" only for puzzle links (guests can play those);
//   an invitation says to sign in or sign up.
// • Anything unknown, expired or stopped gets the plain Cluevoyance preview.

// A fixed, made-up guest key: open_shared_puzzle needs one to read a link,
// and no browser holds this one, so it can only ever see "available"/"taken".
const PREVIEW_GUEST_KEY = "link-preview-reads-only-never-plays-0000";
const TOKEN = { puzzle: /^[A-Za-z0-9_-]{16,64}$/, invite: /^[A-Za-z0-9_-]{8,80}$/ };

export const SITE = "Cluevoyance";
const GENERIC = {
  kind: "generic", name: null,
  title: "Cluevoyance",
  description: "A daily word puzzle you solve by reading the clues. Make puzzles for your friends, too.",
  headline: "Cluevoyance",
  sub: "Daily word puzzles · Play with friends",
};

export function copyFor(kind, name) {
  if (kind === "puzzle" && name) {
    return {
      kind, name,
      title: `${name} made you a puzzle!`,
      description: "Tap to play it on Cluevoyance. No account needed.",
      headline: `${name} made you a puzzle!`,
      sub: "Tap to play · No account needed",
    };
  }
  if (kind === "invite" && name) {
    return {
      kind, name,
      title: `${name} wants to trade puzzles with you`,
      description: `Make word puzzles for each other on Cluevoyance. Sign in or sign up to join ${name}.`,
      headline: `${name} wants to trade puzzles with you`,
      sub: "Tap to join · Sign in or sign up",
    };
  }
  return GENERIC;
}

async function rpc(fn, args, env, fetchImpl) {
  const base = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const res = await fetchImpl(`${base.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(2500),
  });
  return res.ok ? res.json() : null;
}

// What to show for one link. Never throws: on any trouble, the plain preview.
export async function lookup(kind, token, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    if (!TOKEN[kind]?.test(token || "")) return GENERIC;
    if (kind === "puzzle") {
      const r = await rpc("open_shared_puzzle", { p_token: token, p_guest_key: PREVIEW_GUEST_KEY }, env, fetchImpl);
      return ["available", "taken"].includes(r?.status) ? copyFor("puzzle", clean(r.creator_name)) : GENERIC;
    }
    const r = await rpc("get_friend_invite", { p_token: token }, env, fetchImpl);
    return r?.status === "open" ? copyFor("invite", clean(r.inviter_name)) : GENERIC;
  } catch {
    return GENERIC;
  }
}

// Display names are 1–24 characters; keep the preview to one tidy line.
const clean = (name) => {
  const s = String(name || "").replace(/\s+/g, " ").trim().slice(0, 24);
  return s || null;
};

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The preview tags for a page, in place of index.html's generic block.
export function previewTags(copy, { pageUrl, imageUrl }) {
  const e = escapeHtml;
  return [
    `<title>${e(copy.title)}</title>`,
    `<meta name="description" content="${e(copy.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${e(copy.title)}" />`,
    `<meta property="og:description" content="${e(copy.description)}" />`,
    `<meta property="og:url" content="${e(pageUrl)}" />`,
    `<meta property="og:image" content="${e(imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${e(copy.headline)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(copy.title)}" />`,
    `<meta name="twitter:description" content="${e(copy.description)}" />`,
    `<meta name="twitter:image" content="${e(imageUrl)}" />`,
  ].join("\n    ");
}

// Swaps index.html's marked generic block (and its <title>) for these tags.
export function injectPreview(shell, tags) {
  const start = shell.indexOf("<!-- preview -->");
  const end = shell.indexOf("<!-- /preview -->");
  if (start < 0 || end < 0) return shell.replace(/<title>[^<]*<\/title>/, tags);
  return `${shell.slice(0, start)}<!-- preview -->\n    ${tags}\n    ${shell.slice(end)}`;
}
