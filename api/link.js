// The app page for a shared link, with that link's preview tags in place of
// the generic ones, so a messaging app shows "Deb made you a puzzle!" or
// "Deb wants to trade puzzles with you" with its own picture. vercel.json sends
// /p/<code> and /join/<code> here; the page itself is the normal app.
import { lookup, previewTags, injectPreview } from "./_lib/linkPreview.js";

let shellCache = { at: 0, html: null, origin: null };

async function appShell(origin) {
  if (shellCache.html && shellCache.origin === origin && Date.now() - shellCache.at < 60_000) return shellCache.html;
  const res = await fetch(new URL("/index.html", origin), { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`index.html: ${res.status}`);
  shellCache = { at: Date.now(), html: await res.text(), origin };
  return shellCache.html;
}

export async function GET(request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "invite" ? "invite" : "puzzle";
  const token = url.searchParams.get("t") || "";
  const origin = url.origin;
  const copy = await lookup(kind, token);
  const pagePath = kind === "invite" ? `/join/${encodeURIComponent(token)}` : `/p/${encodeURIComponent(token)}`;
  const tags = previewTags(copy, {
    pageUrl: `${origin}${pagePath}`,
    imageUrl: copy.kind === "generic"
      ? `${origin}/api/og`
      : `${origin}/api/og?kind=${kind}&t=${encodeURIComponent(token)}`,
  });
  let shell;
  try { shell = await appShell(origin); }
  catch {
    // The app page couldn't be read: a tiny page that still previews and opens the app.
    shell = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Cluevoyance</title></head>`
      + `<body><p><a href="${pagePath}">Open Cluevoyance</a></p></body></html>`;
  }
  return new Response(injectPreview(shell, tags), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Shared caches keep it briefly; a new deployment starts afresh.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      "X-Robots-Tag": "noindex",
    },
  });
}

// Some link-preview fetchers ask with HEAD first; answer it like GET (the platform drops the body).
export const HEAD = GET;
