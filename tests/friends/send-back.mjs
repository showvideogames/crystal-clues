// One unfinished puzzle each way: having a friend's puzzle still to play
// never stops you sending them one. Real browsers against the local stack
// and `npm run friends:dev` (5186), like e2e.mjs.
//   node tests/friends/send-back.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { rpc, rpcError, makePlayer, befriend, sampleBoard, sendPuzzle } from "./helpers.mjs";
import { CHROME, signInBrowser } from "./browser.mjs";

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2 };
const log = (...a) => console.log("•", ...a);
// The friend's row in the list (buttons by their full name), and, from the
// details sheet, where your own puzzle for them stands.
const card = (page) => page.$eval(".fr-frow", (el) => ({
  buttons: [...el.querySelectorAll(".fr-frow-actions button")].map((b) => `${b.classList.contains("primary") ? "primary" : "secondary"}: ${b.getAttribute("aria-label")}`),
}));
async function waitingLine(page) {
  await page.locator(".fr-frow-main").click();
  const line = await (await page.waitForSelector(".fr-details .fr-waiting")).evaluate((el) => el.textContent.trim());
  await page.locator(".fr-details .fr-closebtn").click();
  await page.waitForFunction(() => !document.querySelector(".fr-details"));
  return line;
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };

const [deb, sam] = [await makePlayer("Deb"), await makePlayer("Sam")];
const fid = await befriend(deb, sam);
await sendPuzzle(deb, fid, sampleBoard("IN"));
log("Deb sent Sam a puzzle; Sam hasn't played it");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
try {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(PHONE);
  await signInBrowser(page, sam, "/friends");
  await page.waitForSelector(".fr-frow .fr-mini");
  assert.deepEqual((await card(page)).buttons, ["primary: Play Deb's puzzle", "secondary: Make Puzzle for Deb"]);
  await shot(page, "1-sam-can-play-and-make");
  log("Sam's card: Play Deb's puzzle (main) and Make one for Deb");

  // The button opens the creator for Deb.
  await page.locator(".fr-frow .fr-mini.secondary").click();
  await page.waitForFunction(() => location.pathname.startsWith("/friends/make/"));
  await page.waitForSelector(".fr-board-stage");
  log("Make one for Deb opens the creator");

  // Sam sends one while Deb's is still unplayed: allowed, once.
  await sendPuzzle(sam, fid, sampleBoard("OUT"));
  const d = await rpc(sam.client, "save_friend_draft", { p_friendship_id: fid, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("TWO") });
  assert.equal(await rpcError(sam.client, "send_friend_puzzle", { p_draft_id: d.id, p_version: d.version }), "already_waiting",
    "still only one unfinished puzzle from Sam to Deb");
  log("Sam sent one back; a second is still refused (one each way)");

  await page.goto(page.url().replace(/\/friends\/make\/.*/, "/friends"), { waitUntil: "networkidle0" });
  await page.waitForSelector(".fr-frow .fr-mini");
  const after = await card(page);
  assert.deepEqual(after.buttons, ["primary: Play Deb's puzzle"]);
  assert.match(await waitingLine(page), /^Your puzzle for Deb · sent just now, not started yet$/);
  await shot(page, "2-sam-sent-one-back");
  log("Sam's card now: Play Deb's puzzle, and his own puzzle waiting for Deb");

  const debPage = await (await browser.createBrowserContext()).newPage();
  await debPage.setViewport(PHONE);
  await signInBrowser(debPage, deb, "/friends");
  await debPage.waitForSelector(".fr-frow .fr-mini");
  const debCard = await card(debPage);
  assert.deepEqual(debCard.buttons, ["primary: Play Sam's puzzle"]);
  assert.match(await waitingLine(debPage), /^Your puzzle for Sam · sent (just now|\d+[mhd] ago), not started yet$/);
  const sideways = await debPage.evaluate(() => document.querySelector(".fr-wrap").scrollWidth - document.querySelector(".fr-wrap").clientWidth);
  assert.ok(sideways <= 1, "no sideways scroll");
  await shot(debPage, "3-deb-both-ways");
  log("Deb's card: Play Sam's puzzle, and hers waiting for Sam");
  log("ALL OK");
} finally {
  await browser.close();
}
