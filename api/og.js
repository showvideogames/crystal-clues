// The preview picture (1200×630 PNG) for a shared link, or the plain
// Cluevoyance one. /api/og?kind=puzzle|invite&t=<code>. The name is looked
// up from the link code here, never taken from the address, so nobody can
// make our domain show words of their choosing.
import { ImageResponse } from "@vercel/og";
import { lookup } from "./_lib/linkPreview.js";

// Fonts and the crystal ball come from the site's own public files, once per instance.
let assets = null;
async function loadAssets(origin) {
  if (assets?.origin === origin) return assets;
  const get = async (path) => {
    const res = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.arrayBuffer();
  };
  const [bold, semi, boldExt, ball] = await Promise.all([
    get("/fonts/raleway-800-latin.woff"), get("/fonts/raleway-600-latin.woff"),
    get("/fonts/raleway-800-latin-ext.woff"), get("/icon-512.png"),
  ]);
  assets = { origin, bold, semi, boldExt, ball: `data:image/png;base64,${Buffer.from(ball).toString("base64")}` };
  return assets;
}

// A tiny element builder: Satori takes React-shaped objects; no JSX needed.
const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });

export function card(copy, ballSrc) {
  const long = copy.headline.length > 26;
  return h("div", {
    width: "100%", height: "100%", display: "flex", alignItems: "center",
    padding: "0 72px 0 56px", gap: 48, fontFamily: "Raleway",
    background: "linear-gradient(135deg, #f7f2ff 0%, #ebe0fd 55%, #dccbfa 100%)",
  },
  // The app icon, as a rounded tile (its square has a lavender background).
  { type: "img", props: { src: ballSrc, width: 340, height: 340,
    style: { flexShrink: 0, borderRadius: 76, boxShadow: "0 18px 40px rgba(76,29,149,.18)" } } },
  h("div", { display: "flex", flexDirection: "column", flex: 1, gap: 22 },
    // The brand above a friend's message; the plain card is the brand already.
    ...(copy.kind === "generic" ? [] : [h("div", { fontSize: 30, fontWeight: 800, letterSpacing: 6, color: "#6526d9", textTransform: "uppercase" }, "Cluevoyance")]),
    h("div", { fontSize: long ? 64 : 78, fontWeight: 800, color: "#2a1450", lineHeight: 1.08 }, copy.headline),
    h("div", { fontSize: 36, fontWeight: 600, color: "#5b4a7a", marginTop: 6 }, copy.sub)));
}

export async function GET(request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "invite" ? "invite" : url.searchParams.get("kind") === "puzzle" ? "puzzle" : null;
  const copy = await lookup(kind || "none", url.searchParams.get("t") || "");
  const a = await loadAssets(url.origin);
  return new ImageResponse(card(copy, a.ball), {
    width: 1200, height: 630,
    fonts: [
      { name: "Raleway", data: a.bold, weight: 800, style: "normal" },
      { name: "Raleway", data: a.semi, weight: 600, style: "normal" },
      { name: "Raleway", data: a.boldExt, weight: 800, style: "normal" },
    ],
    // Names can change: an hour, not the library's default year.
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
