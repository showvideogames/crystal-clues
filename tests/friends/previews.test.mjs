// Link previews (api/link.js, api/og.js) against the local stack: the words
// and picture for puzzle links and invitations, no spoilers, and previews
// that never claim, start or accept anything. The functions fetch the app
// page, fonts and icon from their own origin; here a small local server
// stands in for the site (index.html and public/).
//   PREVIEW_SHOTS=<dir> also saves the pictures as PNG files.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { admin, rpc, makePlayer, sampleBoard, API_URL, PUBLISHABLE_KEY } from "./helpers.mjs";

process.env.VITE_SUPABASE_URL = API_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
const { GET: linkPage } = await import("../../api/link.js");
const { GET: ogImage } = await import("../../api/og.js");
const heads = [(await import("../../api/link.js")).HEAD, (await import("../../api/og.js")).HEAD];
const { copyFor, previewTags, escapeHtml } = await import("../../api/_lib/linkPreview.js");

const ROOT = path.resolve(import.meta.dirname, "../..");
const SHOTS = process.env.PREVIEW_SHOTS;
let server, origin, sam, deb, link, invite;

before(async () => {
  server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    const file = p === "/index.html" ? path.join(ROOT, "index.html") : path.join(ROOT, "public", p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200); res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  [sam, deb] = [await makePlayer("Sam"), await makePlayer("Deb")];
  // A puzzle link with a title and clues that must never appear in a preview.
  const d = await rpc(sam.client, "save_friend_draft", {
    p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "SECRETTITLE", p_board: sampleBoard("SPOIL"),
  });
  link = await rpc(sam.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "Pat" });
  invite = await rpc(deb.client, "create_friend_invite");
});
after(() => server?.close());

const page = async (kind, t) => {
  const res = await linkPage(new Request(`${origin}/api/link?kind=${kind}&t=${encodeURIComponent(t)}`));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  return res.text();
};
const meta = (html, prop) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

test("a puzzle link: '[Name] made you a puzzle!', no account needed, no spoilers", async () => {
  const html = await page("puzzle", link.token);
  assert.match(html, /<title>Sam made you a puzzle!<\/title>/);
  assert.equal(meta(html, "og:title"), "Sam made you a puzzle!");
  assert.equal(meta(html, "og:description"), "Tap to play it on Cluevoyance. No account needed.");
  assert.equal(meta(html, "og:image"), `${origin}/api/og?kind=puzzle&amp;t=${link.token}`);
  assert.equal(meta(html, "og:url"), `${origin}/p/${link.token}`);
  assert.equal(meta(html, "twitter:card"), "summary_large_image");
  assert.ok(!/SECRETTITLE|SPOIL/.test(html), "no title, clue or card word in the page's preview");
  assert.equal((html.match(/property="og:title"/g) || []).length, 1, "one set of preview tags");
  assert.match(html, /<div id="root"><\/div>/, "the app page itself");
});

test("an older invitation: '[Name] wants to trade puzzles with you', sign in or sign up, never 'no account needed'", async () => {
  const html = await page("invite", invite.token);
  assert.equal(meta(html, "og:title"), "Deb wants to trade puzzles with you");
  assert.match(meta(html, "og:description"), /Make word puzzles for each other on Cluevoyance\. Sign in or sign up to join Deb\./);
  assert.ok(!/No account needed/i.test(html), "invitations need an account");
  assert.equal(meta(html, "og:url"), `${origin}/join/${invite.token}`);
});

test("previews never claim, start or accept anything", async () => {
  for (let i = 0; i < 2; i++) {
    await page("puzzle", link.token);
    await page("invite", invite.token);
    await ogImage(new Request(`${origin}/api/og?kind=puzzle&t=${link.token}`));
    await ogImage(new Request(`${origin}/api/og?kind=invite&t=${invite.token}`));
  }
  const p = (await admin.from("friend_puzzles").select("guest_key_hash,started_at,difficulty,recipient_id").eq("id", link.puzzle_id).single()).data;
  assert.deepEqual(p, { guest_key_hash: null, started_at: null, difficulty: null, recipient_id: null });
  const inv = (await admin.from("friend_invites").select("accepted_by,accepted_at").eq("token", invite.token).single()).data;
  assert.deepEqual(inv, { accepted_by: null, accepted_at: null });
  // Still there for the real person to start.
  const opened = await rpc((await import("./helpers.mjs")).anon(), "open_shared_puzzle", { p_token: link.token, p_guest_key: "a".repeat(40) });
  assert.equal(opened.status, "available");
});

test("unknown, stopped or used links get the plain Cluevoyance preview", async () => {
  for (const [kind, t] of [["puzzle", "A".repeat(24)], ["invite", "nope-nope-nope"], ["puzzle", "bad token!"]]) {
    const html = await page(kind, t);
    assert.equal(meta(html, "og:title"), "Cluevoyance");
    assert.equal(meta(html, "og:image"), `${origin}/api/og`);
  }
  // A stopped link: nobody's name any more.
  const d = await rpc(sam.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("STOP") });
  const l2 = await rpc(sam.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "" });
  await rpc(sam.client, "stop_share_link", { p_puzzle_id: l2.puzzle_id });
  assert.equal(meta(await page("puzzle", l2.token), "og:title"), "Cluevoyance");
});

test("HEAD is answered like GET (some preview fetchers ask that first)", () => {
  assert.deepEqual(heads, [linkPage, ogImage]);
});

test("names are escaped in the page", () => {
  const tags = previewTags(copyFor("puzzle", `Al "<b>"&`), { pageUrl: "https://x/p/a", imageUrl: "https://x/api/og" });
  assert.ok(tags.includes("Al &quot;&lt;b&gt;&quot;&amp; made you a puzzle!"));
  assert.ok(!tags.includes("<b>"));
  assert.equal(escapeHtml("'"), "&#39;");
});

test("the pictures: PNG, 1200×630, cached for an hour", async () => {
  for (const [name, url] of [
    ["puzzle", `${origin}/api/og?kind=puzzle&t=${link.token}`],
    ["invite", `${origin}/api/og?kind=invite&t=${invite.token}`],
    ["generic", `${origin}/api/og`],
  ]) {
    const res = await ogImage(new Request(url));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("cache-control"), /max-age=3600/);
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `preview-${name}.png`), png); }
  }
});
