// The Friends notification controls in their new home, the Settings sheet:
// turn on (a real push-service subscription is stored), choose what to get
// (saved to the profile), turn off on this device (the server forgets it).
// Delivery itself is push-e2e.mjs, which also needs the push-dispatch function.
// Needs the local stack, the friends dev server and network access to the
// browser's push service.
//   FRIENDS_E2E_URL=http://127.0.0.1:5188 node tests/friends/notify-settings.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { admin, makePlayer, rpc } from "./helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("•", ...a);
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };
const has = (page, t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const subs = async (id) => (await admin.from("push_subscriptions").select("endpoint").eq("user_id", id)).data.length;

const nina = await makePlayer("Nina");
// Headless Chrome has no push service: a real, off-screen window (as push-e2e.mjs).
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  args: ["--window-position=-2400,0", "--window-size=420,860", "--no-first-run"],
  ignoreDefaultArgs: ["--disable-background-networking"] });
try {
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(APP_URL, ["notifications"]);
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await signInBrowser(page, nina, "/friends");
  // From Friends: the small link at the foot opens Settings.
  await page.locator(".fr-hub-foot .fr-textbtn").click();
  await page.waitForSelector(".settings-sheet .fr-settings-notify");
  await has(page, "Notifications are off");
  await page.locator(".fr-settings-notify button::-p-text(Turn on)").click();
  await has(page, "Notifications are on", 30000);
  assert.equal(await subs(nina.id), 1, "the device's subscription is stored");
  log("Turn on: subscribed and stored");

  await page.locator(".fr-settings-notify button::-p-text(Choose)").click();
  await page.waitForSelector(".fr-settings-notify .fr-toggle");
  await shot(page, "12-settings-notifications-on");
  const before = await rpc(nina.client, "get_my_profile");
  await page.evaluate(() => [...document.querySelectorAll(".fr-settings-notify .fr-toggle")]
    .find((l) => l.innerText.startsWith("Results")).querySelector("input").click());
  for (let i = 0; i < 40; i++) {
    if ((await rpc(nina.client, "get_my_profile")).notify_results !== before.notify_results) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.equal((await rpc(nina.client, "get_my_profile")).notify_results, !before.notify_results, "the Results choice is saved");
  log(`Choose: Results ${before.notify_results ? "on → off" : "off → on"}, saved to the profile`);

  await page.locator(".fr-settings-notify button::-p-text(Turn off on this device)").click();
  await has(page, "Notifications are off");
  assert.equal(await subs(nina.id), 0, "turning off removes the device");
  log("Turn off: device forgotten");
  console.log("\nNotification controls in Settings: PASS");
} finally {
  await browser.close();
}
