// Real web-push delivery, end to end, in a real browser: a player turns
// notifications on (a genuine push-service subscription), a friend sends
// them a puzzle, the local push-dispatch function sends it, and the service
// worker shows it. Needs network access to the browser's push service.
// Optional (the in-app inbox never needs push). Needs `npm run friends:setup`,
// the local edge runtime (`npx supabase functions serve push-dispatch`; the
// default `npm run db:start` leaves it off) and `npm run friends:dev`.
//   node tests/friends/push-e2e.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { admin, makePlayer, befriend, sendPuzzle, sampleBoard, API_URL } from "./helpers.mjs";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5186";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [ana, ben] = await Promise.all([makePlayer("Ana"), makePlayer("Ben")]);
const fid = await befriend(ana, ben);
const { data: s } = await ben.client.auth.getSession();

// Headless Chrome has no push service, so this one runs a real (off-screen) window.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ["--window-position=-2400,0", "--window-size=420,800", "--no-first-run"],
  // Puppeteer turns off background networking by default, which also turns off push.
  ignoreDefaultArgs: ["--disable-background-networking"] });
try {
  // Chrome never allows push in incognito-style contexts; use the throwaway profile itself.
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(URL, ["notifications"]);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle0" });
  // Sign Ben in on this device with his existing session.
  await page.evaluate((session) => localStorage.setItem("cv-auth", JSON.stringify(session)), s.session);
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator('button[aria-label^="Friends"]').click();
  await page.locator("button.fr-textbtn::-p-text(Turn on)").click();
  await page.waitForFunction(() => document.body.innerText.includes("Turn off on this device"), { timeout: 20000 });
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", ben.id);
  assert.equal(subs.length, 1, "the device's subscription is stored for Ben");
  console.log("• subscribed via", new globalThis.URL(subs[0].endpoint).host);

  const board = sampleBoard("HUSH");
  const pid = await sendPuzzle(ana, fid, board);
  const res = await fetch(`${API_URL}/functions/v1/push-dispatch`, {
    method: "POST", headers: { Authorization: `Bearer ${s.session.access_token}`, "Content-Type": "application/json" }, body: "{}",
  });
  const summary = await res.json();
  console.log("• dispatch", JSON.stringify(summary));
  assert.equal(summary.sent, 1, "one notification went to the push service");

  let shown = [];
  for (let i = 0; i < 30 && !shown.length; i++) {
    await sleep(500);
    shown = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url }));
    });
  }
  console.log("• shown", JSON.stringify(shown));
  assert.equal(shown.length, 1, "the service worker showed the notification");
  assert.equal(shown[0].body, "Ana made you a puzzle. Tap to play.");
  assert.equal(shown[0].url, `/?friends=1&puzzle=${pid}`);
  for (const w of [...board.clues, ...Object.values(board.cards).flatMap((c) => c.words)]) {
    assert.ok(!JSON.stringify(shown).includes(w), "no clue or card word in the notification");
  }
  console.log("\nPASS — real push delivered and shown, spoiler-free");
} finally {
  await browser.close();
}
