// Real web-push delivery, end to end, in a real browser: Ben turns
// notifications on (a genuine push-service subscription); then
//   1. Ana sends him a puzzle               → "Ana made you a puzzle"
//   2. a guest finishes Ben's puzzle link   → "Dad finished your puzzle"
// Nobody's browser calls the sender: the database wakes push-dispatch
// itself (outbox trigger → pg_net, with the shared secret). Then Ben turns
// notifications off on this device and the server forgets the device.
// Optional (the in-app inbox never needs push). Needs network access to the
// browser's push service, `npm run friends:setup`, `npm run friends:dev`, and
//   npx supabase functions serve push-dispatch --env-file supabase/.env --no-verify-jwt
//   node tests/friends/push-e2e.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import puppeteer from "puppeteer-core";
import { admin, anon, makePlayer, befriend, sendPuzzle, sampleBoard, solvedBoard, rpc, API_URL } from "./helpers.mjs";
import { sql } from "../db/helpers.mjs";
import { APP_URL as URL, CHROME, signInBrowser } from "./browser.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

// The local database wakes the local sender (inside Docker, the API gateway is "kong").
const secret = fs.readFileSync("supabase/.env", "utf8").match(/^PUSH_DISPATCH_SECRET=(.+)$/m)?.[1];
assert.ok(secret, "run npm run friends:setup (supabase/.env needs PUSH_DISPATCH_SECRET)");
sql(`delete from vault.secrets where name in ('push_dispatch_url','push_dispatch_secret');
     select vault.create_secret('http://supabase_kong_cluevoyance:8000/functions/v1/push-dispatch', 'push_dispatch_url');
     select vault.create_secret('${secret}', 'push_dispatch_secret');`);

// The sender can't be run from outside without the secret.
const outside = await fetch(`${API_URL}/functions/v1/push-dispatch`, { method: "POST", body: "{}" });
assert.equal(outside.status, 403, "no secret, no dispatch");

const [ana, ben] = await Promise.all([makePlayer("Ana"), makePlayer("Ben")]);
await befriend(ana, ben);

// Headless Chrome has no push service, so this one runs a real (off-screen) window.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  args: ["--window-position=-2400,0", "--window-size=420,800", "--no-first-run"],
  // Puppeteer turns off background networking by default, which also turns off push.
  ignoreDefaultArgs: ["--disable-background-networking"] });
const shown = (page) => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body, url: n.data?.url }));
});
async function waitShown(page, text) {
  for (let i = 0; i < 60; i++) {
    const all = await shown(page);
    const hit = all.find((n) => n.body.includes(text));
    if (hit) return hit;
    await sleep(500);
  }
  throw new Error(`no notification containing "${text}"`);
}
try {
  // Chrome never allows push in incognito-style contexts; use the throwaway profile itself.
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(URL, ["notifications"]);
  const page = await ctx.newPage();
  await signInBrowser(page, ben, "/friends");
  await page.waitForFunction(() => document.body.innerText.includes("Notifications are off"));
  await page.locator("button.fr-textbtn::-p-text(Turn on)").click();
  await page.waitForFunction(() => document.body.innerText.includes("Notifications are on"), { timeout: 20000 });
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", ben.id);
  assert.equal(subs.length, 1, "the device's subscription is stored for Ben");
  log("subscribed via", new globalThis.URL(subs[0].endpoint).host);

  // 1. A new puzzle from a friend.
  const board = sampleBoard("HUSH");
  const pid = await sendPuzzle(ana, (await rpc(ana.client, "get_friends_inbox")).friends[0].friendship_id, board);
  const n1 = await waitShown(page, "Ana made you a puzzle");
  assert.equal(n1.body, "Ana made you a puzzle. Tap to play.");
  assert.equal(n1.url, `/?friends=1&puzzle=${pid}`);
  for (const w of [...board.clues, ...Object.values(board.cards).flatMap((c) => c.words)]) {
    assert.ok(!JSON.stringify(n1).includes(w), "no clue or card word in the notification");
  }
  log("new puzzle → notification shown");

  // 2. A guest finishes Ben's puzzle link: no account, no browser of Ben's involved.
  const d = await rpc(ben.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("LINK") });
  const link = await rpc(ben.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "Dad" });
  const key = randomBytes(24).toString("base64url");
  await rpc(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: key, p_difficulty: "easy" });
  const answer = await rpc(ben.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id });
  const clues = (await rpc(anon(), "open_shared_puzzle", { p_token: link.token, p_guest_key: key })).puzzle.clues;
  await rpc(anon(), "submit_shared_guess", { p_token: link.token, p_guest_key: key, p_guess_no: 1, p_board: solvedBoard(answer), p_extras: [], p_clues: clues });
  const n2 = await waitShown(page, "Dad finished your puzzle");
  assert.equal(n2.url, `/?friends=1&result=${link.puzzle_id}`);
  log("guest finished a link → notification shown");

  // 3. Off on this device: the server forgets it; nothing more is queued for it.
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator("button.fr-textbtn::-p-text(Choose)").click();
  await page.locator("button.fr-link::-p-text(Turn off on this device)").click();
  await page.waitForFunction(() => document.body.innerText.includes("Notifications are off"), { timeout: 15000 });
  const { data: after } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", ben.id);
  assert.equal(after.length, 0, "turning off removes the device");
  log("turned off → device forgotten");

  console.log("\nPASS — real pushes delivered by the database's own wake-up; opt-out works");
} finally {
  await browser.close();
}
