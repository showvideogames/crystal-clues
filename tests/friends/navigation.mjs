// Addresses and navigation, in a real browser at phone width: every main
// screen and each friend puzzle has a stable address that survives a
// refresh, works as a direct link, and follows Back/Forward. Also: private
// puzzles stay private by address, old links still work, one status message
// per friend, and the ⓘ help tip by tap, mouse hover and keyboard.
// Needs the local stack and `npm run friends:dev` (see e2e.mjs).
//   node tests/friends/navigation.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { makePlayer, befriend, sendPuzzle, sampleBoard, rpc } from "./helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";

const OUT = path.resolve(process.argv[2] || "friends-nav-shots");
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const at = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const waitPath = (page, p, timeout = 15000) => page.waitForFunction((x) => location.pathname === x, { timeout }, p);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const [ann, bo, eve] = await Promise.all([makePlayer("Ann"), makePlayer("Bo"), makePlayer("Eve")]);
const fid = await befriend(ann, bo);
const pid = await sendPuzzle(ann, fid, sampleBoard("NAV"));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const newPage = async () => {
  const p = await (await browser.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport(PHONE);
  return p;
};
try {
  // ── Daily side, as a guest ────────────────────────────────────────────
  const g = await newPage();
  await g.goto(APP_URL, { waitUntil: "networkidle0" });
  await g.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  await g.goto(`${APP_URL}/archive`, { waitUntil: "networkidle0" });
  await g.waitForSelector(".arch-day.clickable");
  await g.reload({ waitUntil: "networkidle0" });
  await g.waitForSelector(".arch-day.clickable");
  assert.equal(at(g), "/archive", "refresh keeps the archive");
  // Open an archive puzzle, refresh, Back/Forward.
  await g.locator(".arch-day.clickable:not(.today)").click();
  await g.waitForFunction(() => /^\/archive\/\d+$/.test(location.pathname));
  const archiveUrl = await g.evaluate(() => location.pathname);
  {
    await g.waitForSelector(".game .csurface .ctile", { timeout: 15000 });
    await g.reload({ waitUntil: "networkidle0" });
    await g.waitForSelector(".game .csurface .ctile", { timeout: 15000 });
    assert.equal(at(g), archiveUrl, "refresh keeps the archive puzzle");
    await g.goBack(); await waitPath(g, "/archive");
    await g.goForward(); await waitPath(g, archiveUrl);
    await g.waitForSelector(".game .csurface .ctile", { timeout: 15000 });
    log("archive puzzle", archiveUrl, "survives refresh and Back/Forward");
  }
  await g.goto(`${APP_URL}/archive/999999999999`, { waitUntil: "networkidle0" });
  await waitPath(g, "/archive");
  log("an unknown archive puzzle address falls back to the archive");
  await g.goto(`${APP_URL}/admin`, { waitUntil: "networkidle0" });
  await waitPath(g, "/");
  log("/admin as a guest goes to today's puzzle");
  await g.goto(`${APP_URL}/no-such-page`, { waitUntil: "networkidle0" });
  await waitPath(g, "/");
  // Header navigation pushes history: Today → Archive → Friends, then Back twice.
  await g.locator("button.nbtn::-p-text(Archive)").click(); await waitPath(g, "/archive");
  await g.locator('button[aria-label^="Friends"]').click(); await waitPath(g, "/friends");
  await g.goBack(); await waitPath(g, "/archive");
  await g.goBack(); await waitPath(g, "/");
  await g.goForward(); await waitPath(g, "/archive");
  log("header navigation follows Back/Forward");
  // Signed out on a friend puzzle address: the sign-in, at that address.
  await g.goto(`${APP_URL}/friends/play/${pid}`, { waitUntil: "networkidle0" });
  await g.waitForSelector("button.fr-btn.primary::-p-text(Sign in)");
  assert.equal(at(g), `/friends/play/${pid}`, "signed out, the address stays for the return from sign-in");

  // ── Ann (creator) ─────────────────────────────────────────────────────
  const a = await newPage();
  await signInBrowser(a, ann, "/friends");
  await waitText(a, "waiting for Bo to start");
  const card = await a.$eval('section[aria-label="Bo"]', (el) => el.innerText);
  assert.equal((card.match(/waiting/gi) || []).length, 1, `one waiting message on Bo's card: ${card}`);
  assert.ok(!/is playing|Has your puzzle|Sent to Bo/i.test(await text(a)), "no repeated sent/playing messages");
  assert.ok(!(await a.$eval(".fr-head", (el) => el.innerText)).includes("Waiting"), "the page lede doesn't repeat it");
  await shot(a, "nav-01-ann-waiting-not-started");

  // ── Bo (solver): addresses through the whole play ─────────────────────
  const b = await newPage();
  await signInBrowser(b, bo, "/friends");
  await b.locator("button::-p-text(Play Ann's puzzle)").click();
  await waitPath(b, `/friends/play/${pid}`);
  await b.waitForSelector(".fr-choose");
  await b.reload({ waitUntil: "networkidle0" });
  await b.waitForSelector(".fr-choose");
  assert.equal(at(b), `/friends/play/${pid}`, "refresh on the difficulty choice keeps the puzzle");
  await b.locator(".lobby-diff-opt::-p-text(Easy)").click();
  await b.locator("button::-p-text(Start puzzle)").click();
  await b.waitForSelector(".csurface .ctile"); await sleep(900);
  await b.reload({ waitUntil: "networkidle0" });
  await b.waitForSelector(".csurface .ctile");
  assert.equal(at(b), `/friends/play/${pid}`, "refresh mid-puzzle keeps the puzzle");
  log("refresh keeps Bo on Ann's puzzle");
  await b.goBack(); await waitPath(b, "/friends");
  await waitText(b, "Continue Ann's puzzle");
  await b.goForward(); await waitPath(b, `/friends/play/${pid}`);
  await b.waitForSelector(".csurface .ctile");
  log("Back/Forward between the hub and the puzzle");

  // Ann now sees the started message, once.
  await a.reload({ waitUntil: "networkidle0" });
  await waitText(a, "Bo has started your puzzle");
  assert.ok(!/waiting for Bo to start/.test(await text(a)));
  await shot(a, "nav-02-ann-started");

  // Private: another account at the same address sees nothing of it.
  const e = await newPage();
  await signInBrowser(e, eve, `/friends/play/${pid}`);
  await waitText(e, "isn't available");
  assert.ok(!(await text(e)).includes("NAVTOP"), "no clue of a stranger's puzzle");
  log("a stranger at the puzzle's address gets 'not available'");

  // The creator by address alone (no history entry): direct link and refresh.
  const fidBack = fid;
  await b.goto(`${APP_URL}/friends/make/${fidBack}`, { waitUntil: "networkidle0" });
  await waitText(b, "Make one for Ann");
  await b.locator("button::-p-text(Deal random cards)").click();
  await sleep(400);
  await b.reload({ waitUntil: "networkidle0" });
  await waitText(b, "We kept your unsaved changes");
  assert.equal(at(b), `/friends/make/${fidBack}`, "refresh keeps the creator and its unsaved work");
  log("creator address: direct link + refresh keep the work");

  // ⓘ Bonus cards: tap toggles, Escape closes, keyboard and mouse open it.
  const tipBtn = 'button[aria-label="About bonus cards"]';
  await b.$eval(tipBtn, (el) => el.scrollIntoView({ block: "center" }));
  assert.equal(await b.$eval(tipBtn, (el) => el.getAttribute("aria-expanded")), "false");
  await b.locator(tipBtn).click();
  await b.waitForSelector(".fr-tip-pop.open");
  assert.match(await b.$eval(".fr-tip-pop.open", (el) => el.textContent), /don’t belong on the board\. Ann chooses/);
  await shot(b, "nav-03-bonus-tip-open");
  await b.keyboard.press("Escape");
  await b.waitForFunction(() => !document.querySelector(".fr-tip-pop.open"));
  await b.locator(tipBtn).click(); await b.waitForSelector(".fr-tip-pop.open");
  await b.mouse.click(5, 300); // a tap elsewhere
  await b.waitForFunction(() => !document.querySelector(".fr-tip-pop.open"));
  await b.$eval(tipBtn, (el) => el.blur());
  // Keyboard: Tab onto it from the control before it.
  await b.$eval(tipBtn, (el) => { const all = [...document.querySelectorAll("button, input")]; all[all.indexOf(el) - 1].focus(); });
  await b.keyboard.press("Tab");
  await b.waitForSelector(".fr-tip-pop.open");
  await b.keyboard.press("Escape");
  const box = await (await b.$(tipBtn)).boundingBox();
  await b.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await b.waitForSelector(".fr-tip-pop.open");
  await b.mouse.move(5, 5);
  await b.waitForFunction(() => !document.querySelector(".fr-tip-pop.open"));
  log("ⓘ opens by tap, keyboard and hover; closes by Escape and a tap elsewhere");

  // Old links: a notification link and an invite link become addresses.
  await b.goto(`${APP_URL}/?friends=1&puzzle=${pid}`, { waitUntil: "networkidle0" });
  await waitPath(b, `/friends/play/${pid}`);
  await b.waitForSelector(".csurface .ctile");
  const invite = await rpc(ann.client, "create_friend_invite");
  await e.goto(`${APP_URL}/?invite=${invite.token}`, { waitUntil: "networkidle0" });
  await waitPath(e, "/friends");
  await waitText(e, "Ann invited you");
  assert.ok(!e.url().includes(invite.token), "the invite token leaves the address bar");
  log("old notification and invite links still work");

  assert.deepEqual(errors, [], "no page errors");
  console.log(`\nPASS — screenshots in ${OUT}`);
} finally {
  await browser.close();
}
