#!/usr/bin/env node
/**
 * Automated checks against a deployed preview (or the live site) and the
 * hosted project it talks to. Everything here is safe: public key only,
 * no sign-in, no writes that could succeed. The hosted sign-in page is never
 * automated. Ported in spirit from Rainbow's e2e/scripts/preview-check.ts.
 *
 *   node tools/preview-check.mjs --url https://<preview>.vercel.app [--bypass <token>]
 *
 * Reads: CLUEVOYANCE_PROJECT_REF (the hosted project the preview must use),
 * CLUEVOYANCE_PUBLISHABLE_KEY (its public key; defaults to the one the live
 * client has always shipped), optional VERCEL_PROTECTION_BYPASS or --bypass.
 */
const args = process.argv.slice(2);
const arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const url = (arg("--url") || "").replace(/\/$/, "");
if (!/^https:\/\//.test(url)) { console.error("usage: node tools/preview-check.mjs --url https://<preview> [--bypass <token>]"); process.exit(2); }
const ref = process.env.CLUEVOYANCE_PROJECT_REF;
if (!/^[a-z]{20}$/.test(ref || "")) { console.error("CLUEVOYANCE_PROJECT_REF is required"); process.exit(2); }
const KEY = process.env.CLUEVOYANCE_PUBLISHABLE_KEY || "sb_publishable_6-Apb1INDlRXfchxEY1GyQ_vKC7bEOD";
const bypass = arg("--bypass") || process.env.VERCEL_PROTECTION_BYPASS || "";
const SB = `https://${ref}.supabase.co`;
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const pageHeaders = bypass ? { "x-vercel-protection-bypass": bypass } : {};

const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }

async function page(p) {
  const r = await fetch(url + p, { headers: pageHeaders, redirect: "manual" });
  return { status: r.status, text: await r.text(), location: r.headers.get("location") };
}

// 1. the page and the SPA rewrite
const home = await page("/");
check("home loads (200, has #root)", home.status === 200 && /id="root"/.test(home.text), `HTTP ${home.status}`);
const cb = await page("/auth/callback");
check("/auth/callback is served by the app (SPA rewrite)", cb.status === 200 && /id="root"/.test(cb.text), `HTTP ${cb.status}`);
const scriptSrc = (home.text.match(/<script[^>]+src="([^"]+\.js)"/) || [])[1];
let bundle = "";
if (scriptSrc) bundle = (await page(scriptSrc.startsWith("http") ? new URL(scriptSrc).pathname : scriptSrc)).text;
check("bundle found", bundle.length > 10000, `${bundle.length} bytes`);
check("bundle points at the hosted project", bundle.includes(`${ref}.supabase.co`));
check("bundle carries the Staging discovery URL (accounts ON)", /authkit\.app\/\.well-known\/openid-configuration/.test(bundle) && /staging/.test(bundle));
check("bundle names no Production AuthKit domain", !bundle.includes("obedient-book-17.authkit.app"));
check("bundle names no local address", !/127\.0\.0\.1:554|localhost:554/.test(bundle));

// 2. the hosted project through the public key, as the client uses it
const count = async (t) => { const r = await fetch(`${SB}/rest/v1/${t}?select=id`, { headers: { ...sbHeaders, Prefer: "count=exact", Range: "0-0" } }); return (r.headers.get("content-range") || "").split("/")[1]; };
const puzzles = await count("puzzles"); const words = await count("wordbank");
check("content counts: 55 puzzles / 1080 words", puzzles === "55" && words === "1080", `${puzzles} / ${words}`);
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const todayRow = await fetch(`${SB}/rest/v1/puzzles?date=eq.${iso}&status=eq.published&limit=1&select=id,title`, { headers: sbHeaders }).then((r) => r.json());
check("today's puzzle query (the live client's) answers", Array.isArray(todayRow), JSON.stringify(todayRow).slice(0, 80));
const post = await fetch(`${SB}/rest/v1/wordbank`, { method: "POST", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify([{ word: "PREVIEWCHECKPROBE" }]) });
check("anon cannot write content", post.status === 401 || post.status === 403, `HTTP ${post.status}`);
const del = await fetch(`${SB}/rest/v1/puzzles?id=eq.1`, { method: "DELETE", headers: sbHeaders });
check("anon cannot delete content", del.status === 401 || del.status === 403, `HTTP ${del.status}`);
const rpcArgs = { ensure_account: {}, my_account: {}, record_play: { _puzzle_id: 1, _solved: true, _lives_used: 0, _difficulty: "standard" }, import_plays: { _plays: [], _losses: 0 }, delete_my_account: {} };
for (const [fn, body] of Object.entries(rpcArgs)) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: sbHeaders, body: JSON.stringify(body) });
  check(`anon cannot call ${fn}`, r.status === 401 || r.status === 403, `HTTP ${r.status}`);
}
const ping = await fetch(`${SB}/rest/v1/rpc/ping`, { method: "POST", headers: sbHeaders, body: "{}" });
check("ping answers true", ping.status === 200 && (await ping.text()) === "true");
const plays = await fetch(`${SB}/rest/v1/plays?select=*`, { headers: sbHeaders });
check("anon cannot read plays", plays.status === 401 || plays.status === 403, `HTTP ${plays.status}`);
const accounts = await fetch(`${SB}/rest/v1/accounts?select=*`, { headers: sbHeaders });
check("anon cannot read accounts", accounts.status === 401 || accounts.status === 403, `HTTP ${accounts.status}`);

// 3. sign-in points at WorkOS Staging
const auth = await fetch(`${SB}/auth/v1/authorize?provider=custom:platform&redirect_to=${encodeURIComponent(url + "/auth/callback")}&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=s256`, { headers: { apikey: KEY }, redirect: "manual" });
const loc = auth.headers.get("location") || "";
check("hosted authorize redirects to the Staging AuthKit domain with PKCE", auth.status === 302 && /staging\.authkit\.app/.test(loc) && /code_challenge_method=S256/.test(loc), `HTTP ${auth.status} → ${loc.replace(/client_id=[^&]+/, "client_id=<id>").slice(0, 100)}`);
check("authorize carries the preview's callback as redirect_to", decodeURIComponent(loc).includes(`${url}/auth/callback`));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
