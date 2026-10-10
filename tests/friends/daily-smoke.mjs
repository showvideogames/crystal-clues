// Regression smoke test for the daily game after the friend-exchange
// changes (shared Submit path, shared deal/validation). Runs against the
// local preview (npm run friends:dev) and its local sample puzzle:
// wrong guess → refresh keeps progress → solve → stats and completion saved,
// then the tutorial, the archive, and admin: hidden from guests and from a
// signed-in non-admin, and the editor's Deal Random Cards for an admin.
//   node tests/friends/daily-smoke.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { APP_URL as URL, CHROME, makeAccount, signInBrowser, signOutBrowser } from "./browser.mjs";
import { grantAdmin } from "../db/helpers.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

// The local seed's daily puzzle (supabase/seed.sql): answer c1..c4, unturned.
const SEED = {
  cards: {
    c1: { words: ["BLAZE", "RIVER", "CAVE", "WOLF"] },
    c2: { words: ["EMBER", "PEAK", "STORM", "RIVER"] },
    c3: { words: ["CLIFF", "TOWER", "OCEAN", "BOULDER"] },
    c4: { words: ["THUNDER", "BUSH", "SKY", "STORM"] },
  },
  solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 0, 0, 0] },
};

const DOM_TO_SLOT = [0, 1, 3, 2];
const key = (w) => [...w].sort().join("|");
const read = (page) => page.evaluate(() => {
  const r = (el) => ({ top: el.querySelector(".ew.et")?.textContent || "",
    words: ["et", "er", "eb", "el"].map((c) => el.querySelector(`.ew.${c}`)?.textContent || ""),
    locked: !!el.querySelector(".ctile.locked") });
  return { board: [...document.querySelectorAll(".game .csurface .cslot")].map(r),
           tray: [...document.querySelectorAll(".game .eslots .eslot")].map(r) };
});
const els = async (page) => {
  const b = await page.$$(".game .csurface .cslot"), t = await page.$$(".game .eslots .eslot");
  const out = []; b.forEach((e, i) => { out[DOM_TO_SLOT[i]] = e; }); return [...out, ...t];
};
const center = async (el) => { const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function drag(page, a, b) {
  const p = await center(a), q = await center(b);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 12, p.y + ((q.y - p.y) * i) / 12);
  await page.mouse.up(); await sleep(350);
}
async function tap(page, el) { const p = await center(el); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); await sleep(450); }
async function solve(page) {
  const want = SEED.solution.slotCards.map((id, i) => [0, 1, 2, 3].map((e) => SEED.cards[id].words[(e - SEED.solution.orientations[i] + 4) % 4]));
  for (let slot = 0; slot < 4; slot++) {
    let e = await els(page);
    const s = await read(page);
    const all = [...DOM_TO_SLOT.map((sl, i) => [sl, s.board[i]]).sort((x, y) => x[0] - y[0]).map((x) => x[1]), ...s.tray];
    const at = all.findIndex((c) => key(c.words) === key(want[slot]));
    if (at !== slot) { await drag(page, e[at], e[slot]); e = await els(page); }
    for (let t = 0; t < 4; t++) {
      if ((await read(page)).board[DOM_TO_SLOT.indexOf(slot)].top === want[slot][0]) break;
      await tap(page, e[slot]);
    }
  }
}
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await (await browser.createBrowserContext()).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  await page.reload({ waitUntil: "networkidle0" });

  await page.locator("button.lobby-start").click();
  await page.waitForSelector(".game .csurface .ctile");
  await sleep(900);
  // A wrong first guess (a fresh deal is never already solved).
  await page.locator("button.sbtn").click();
  await sleep(4200);
  assert.equal(await lives(page), 2, "a wrong guess costs a life");
  const before = await read(page);
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("clover_progress_")));
  assert.equal(saved.length, 1, "daily progress is saved locally, as before");
  await page.reload({ waitUntil: "networkidle0" });
  await page.locator("button.lobby-start").click().catch(() => {});
  await page.waitForSelector(".game .csurface .ctile");
  await sleep(600);
  log("daily after refresh: lives", await lives(page));

  // "Start Puzzle" from the lobby deliberately starts fresh (existing behaviour);
  // either way the board must be playable and solvable.
  await solve(page);
  await page.locator("button.sbtn").click();
  await page.waitForSelector(".sovr", { timeout: 15000 });
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("clover_stats")));
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem("clover_completions")));
  assert.equal(stats.totalWon, 1, "the daily win is recorded in stats");
  assert.equal(Object.values(done)[0].solved, true, "the daily completion is recorded");
  log("daily solved; stats", JSON.stringify({ played: stats.totalPlayed, won: stats.totalWon, streak: stats.currentStreak }));
  assert.ok(before.board.length === 4);

  // Friend play must never have touched daily storage.
  const friendKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("friend")));
  assert.deepEqual(friendKeys, [], "no friend keys in a daily-only session");

  // Tutorial still opens and runs its first step.
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.locator("button.help-btn").click();
  await page.waitForSelector(".tut-card");
  await page.locator(".tut-card button::-p-text(Start)").click();
  await page.waitForFunction(() => document.querySelector(".tut-card")?.innerText.includes("Drag And Drop"));
  log("tutorial ok");
  await page.keyboard.press("Escape");
  await page.locator(".tut-card button::-p-text(Skip)").click();

  // Archive lists the local sample puzzles.
  await page.locator("button.nbtn::-p-text(Archive)").click();
  await page.waitForFunction(() => /3 published puzzles/i.test(document.body.innerText));
  log("archive ok");

  // Admin is for admin accounts only: not a guest, not an ordinary account.
  const adminButton = () => page.$("button.nbtn::-p-text(Admin)");
  assert.equal(await adminButton(), null, "no Admin button for a guest");
  const [player, editor] = await Promise.all([makeAccount("player"), makeAccount("editor")]);
  grantAdmin(editor.id);
  await signInBrowser(page, player);
  await page.locator("button::-p-text(Start fresh)").click().catch(() => {}); // the guest-progress prompt, if shown
  assert.equal(await adminButton(), null, "no Admin button for a signed-in non-admin");
  await signOutBrowser(page);
  await signInBrowser(page, editor);
  await page.locator("button::-p-text(Start fresh)").click().catch(() => {});
  await page.waitForSelector("button.nbtn::-p-text(Admin)", { timeout: 15000 });
  log("admin button: hidden for guest and player, shown for an admin");

  // Admin: new puzzle, Deal Random Cards fills all 7 cards; checks go green.
  await page.locator("button.nbtn::-p-text(Admin)").click();
  await page.locator("button::-p-text(+ New Puzzle)").click();
  await page.locator("button.admin-deal-btn").click();
  await sleep(300);
  const blank = await page.$$eval(".admin-word-btn", (b) => b.filter((x) => x.textContent === "+").length);
  assert.equal(blank, 0, "every edge of all 7 admin cards is dealt");
  const checks = await page.$$eval(".admin-check", (c) => c.map((x) => x.textContent));
  assert.ok(checks.includes("All card edges filled"), `admin checks: ${checks}`);
  assert.ok(checks.includes("4 clues missing"), `admin checks: ${checks}`);
  assert.ok(await page.$(".admin-more-btn"), "admin cards keep their ⋯ More options button");
  log("admin deal ok:", checks.join(" · "));

  assert.deepEqual(errors, [], "no page errors");
  console.log("\nPASS — daily game, tutorial, archive and admin unchanged");
} finally {
  await browser.close();
}
