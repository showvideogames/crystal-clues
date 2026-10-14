// The share grid is the player's actual guesses, on every way to the results:
// right after finishing, reopened (View Results, the front page), and after a
// refresh. The expected grid is read off the board as each guess is judged
// (a confirmed card turns locked), never rebuilt from the result. Also: on a
// shared browser each player shares their own guesses, and a result finished
// in another browser shares the summary line rather than anyone's grid.
// Needs the local stack and the friends dev server (see home-results.mjs).
//   FRIENDS_E2E_URL=http://127.0.0.1:5191 node tests/home/share-grid.mjs
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME, signInBrowser, signOutBrowser } from "../friends/browser.mjs";
import { solve, nudgeWrong, slotEls, tap } from "../friends/board.mjs";
import { makePlayer, rpc } from "../friends/helpers.mjs";
import { sql } from "../db/helpers.mjs";
import { dailyNumber } from "../../src/game/dailyNumber.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// "Today" as the app sees it: the player's local date (the database's current_date is UTC).
const LOCAL_TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const log = (...a) => console.log("•", ...a);
const VIEW = { cards: {
  c1: { words: ["BLAZE", "RIVER", "CAVE", "WOLF"] }, c2: { words: ["EMBER", "PEAK", "STORM", "RIVER"] },
  c3: { words: ["CLIFF", "TOWER", "OCEAN", "BOULDER"] }, c4: { words: ["THUNDER", "BUSH", "SKY", "STORM"] },
}, solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 0, 0, 0] } };

// A fresh puzzle for today, of this run's own.
const prior = sql(`select id from public.puzzles where date = '${LOCAL_TODAY}' and status = 'published'`).split("\n").filter(Boolean);
sql(`update public.puzzles set status = 'draft' where id in (${prior.join(",") || "0"})`);
const TODAY = String(1700000000700 + Math.floor(Math.random() * 90));
sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
     select ${TODAY}, '${LOCAL_TODAY}', 'Share test', 'Local sample', 'standard', 'published', clues, cards, solution
     from public.puzzles where id = 1700000000000`);
const N = dailyNumber(sql(`select date from public.puzzles where id = ${TODAY}`));

const lives = (p) => p.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
// The 2×2 as the share lays it out: top row TL TR, bottom row BL BR (DOM order).
const judged = (p) => p.$$eval(".csurface .cslot", (s) => s.map((x) => (x.querySelector(".ctile.locked") ? "🔮" : "⚫")))
  .then((d) => [[d[0], d[1]], [d[2], d[3]]]);

// Plays today's puzzle at Standard: `wrong` wrong guesses, then the answer.
// Returns the guesses as the board showed them.
async function play(page, wrong) {
  await page.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
  await page.locator(".lobby-start").click();
  await page.waitForSelector(".csurface .ctile");
  await sleep(900);
  const rows = [];
  for (let i = 0; i < wrong; i++) {
    const before = await lives(page);
    await nudgeWrong(page, VIEW);
    await page.locator("button.sbtn").click();
    await page.waitForFunction((n) => document.querySelectorAll(".game-lives .life:not(.lost)").length === n - 1, { timeout: 10000 }, before);
    rows.push(await judged(page));
    await sleep(4300);
  }
  await solve(page, VIEW);
  await page.locator("button.sbtn").click();
  await page.waitForFunction(() => document.querySelectorAll(".csurface .ctile.locked").length === 4, { timeout: 10000 });
  rows.push(await judged(page));
  return rows;
}
// One wrong guess with exactly `wrongSlots` turned (the rest right), then the
// answer: two players then have the same result and guess count but different grids.
async function playScripted(page, wrongSlots) {
  await page.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
  await page.locator(".lobby-start").click();
  await page.waitForSelector(".csurface .ctile");
  await sleep(900);
  await solve(page, VIEW);
  for (const sl of wrongSlots) await tap(page, (await slotEls(page))[sl]);
  await page.locator("button.sbtn").click();
  await page.waitForFunction(() => document.querySelectorAll(".game-lives .life:not(.lost)").length === 2, { timeout: 10000 });
  const rows = [await judged(page)];
  await sleep(4300);
  for (const sl of wrongSlots) for (let i = 0; i < 3; i++) await tap(page, (await slotEls(page))[sl]);
  await page.locator("button.sbtn").click();
  await page.waitForFunction(() => document.querySelectorAll(".csurface .ctile.locked").length === 4, { timeout: 10000 });
  rows.push(await judged(page));
  return rows;
}
const clueOrder = (p) => p.$$eval(".game .ctab", (t) => t.map((x) => x.textContent).join("|"));
const SUMMARY_1 = () => `Daily #${N} ✨\nSolved with 1 life lost\nCluevoyance.com`;
const expectedShare = (rows) => [`Daily #${N} ✨`, rows.map((r) => r[0].join("")).join(" "), rows.map((r) => r[1].join("")).join(" "), "Cluevoyance.com"].join("\n");
async function shareNow(page) {
  await page.waitForSelector(".rs-card");
  await page.evaluate(() => { window.__copied = null; });
  await page.locator(".rs-share").click();
  await page.waitForFunction(() => window.__copied);
  const t = await page.evaluate(() => window.__copied);
  await page.locator(".rs-close").click();
  await page.waitForFunction(() => !document.querySelector(".rs-card"));
  return t;
}
// The three ways back to the results, each copying the real share text.
async function allPaths(page, rows, who) {
  const want = expectedShare(rows);
  await page.waitForSelector(".rs-card", { timeout: 15000 });
  assert.equal(await shareNow(page), want, `${who}: right after finishing`);
  await page.locator("[data-testid=view-results]").click();
  assert.equal(await shareNow(page), want, `${who}: reopened from the board`);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("[data-testid=view-results]");
  await page.locator("[data-testid=view-results]").click();
  assert.equal(await shareNow(page), want, `${who}: after a refresh`);
  await page.locator(".logo-link").click();
  await page.locator("[data-testid=home-daily]").click();
  assert.equal(await shareNow(page), want, `${who}: from the front page`);
  log(`${who}: the same actual guesses on every path —`, want.replace(/\n/g, " / "));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const fresh = async () => {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
  });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("clover_tutorial_seen", "true"); });
  return page;
};
try {
  // 1. A guest: two wrong guesses, then the answer.
  const g = await fresh();
  const guestRows = await play(g, 2);
  assert.equal(guestRows.length, 3);
  await allPaths(g, guestRows, "guest");

  // 2. Signed in, on a shared browser: Ann finishes with one wrong guess,
  //    signs out; a guest then plays the same puzzle perfectly here.
  const ann = await makePlayer("Ann");
  const s = await fresh();
  await signInBrowser(s, ann, "/");
  const annRows = await play(s, 1);
  await allPaths(s, annRows, "signed in");
  await signOutBrowser(s);
  const guest2 = await play(s, 0);
  await allPaths(s, guest2, "a guest after her, same browser");
  // Ann again: her own guesses, not the guest's.
  await signInBrowser(s, ann, "/today");
  // The guest's game here prompts "Add my progress / Start fresh"; keep Ann's account as it is.
  await s.waitForSelector("button::-p-text(Start fresh)", { timeout: 8000 });
  await s.locator("button::-p-text(Start fresh)").click();
  await s.waitForSelector("[data-testid=view-results]");
  await s.locator("[data-testid=view-results]").click();
  assert.equal(await shareNow(s), expectedShare(annRows), "Ann's own guesses after the guest played");
  log("shared browser: each player shares their own guesses");

  // 3. Ann's result in a browser she didn't play it in: no guesses there, so
  //    the summary line, never someone else's grid.
  const other = await fresh();
  await signInBrowser(other, ann, "/today");
  await other.waitForSelector("[data-testid=view-results]");
  await other.locator("[data-testid=view-results]").click();
  assert.equal(await shareNow(other), `Daily #${N} ✨\nSolved with 1 life lost\nCluevoyance.com`);
  log("another browser: the summary line (the guesses were never there)");
  // 4. Two accounts on one browser with the same result in every respect but the grid.
  const [bo, cy, dee] = await Promise.all([makePlayer("Bo"), makePlayer("Cy"), makePlayer("Dee")]);
  const t = await fresh();
  await signInBrowser(t, bo, "/");
  const boRows = await playScripted(t, [0, 1]);
  await allPaths(t, boRows, "Bo");
  const boFinal = JSON.parse(await t.evaluate((k) => localStorage.getItem(k), `clover_final_${bo.id}_${TODAY}`));
  assert.ok(boFinal, "Bo's round is kept under his own key");
  await signOutBrowser(t);
  await signInBrowser(t, cy, "/");
  const cyRows = await playScripted(t, [2, 3]);
  assert.equal(cyRows.length, boRows.length, "same guess count");
  assert.notDeepEqual(cyRows, boRows, "different grids");
  await allPaths(t, cyRows, "Cy after Bo");
  log("same result, different grids: each account shares only their own");

  // 5. An old-key round, as the released build saved it (no owner), holding
  //    Bo's guesses and a board turned so it's recognisable on screen. Neither
  //    Cy nor Dee (whose result also looks the same) may see or share it.
  const planted = { ...boFinal, clues: [...boFinal.clues.slice(1), boFinal.clues[0]] };
  delete planted.owner;
  const plantedClues = planted.clues.join("|");
  await t.evaluate(({ key, val }) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("clover_final_")) localStorage.removeItem(k);
    localStorage.setItem(key, val);
  }, { key: `clover_final_${TODAY}`, val: JSON.stringify(planted) });
  await rpc(dee.client, "record_play", { _puzzle_id: Number(TODAY), _solved: true, _lives_used: 1, _difficulty: "standard" });
  for (const [who, acct] of [["Cy", null], ["Dee", dee]]) {
    if (acct) { await signOutBrowser(t); await signInBrowser(t, acct, "/today"); }
    else await t.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
    await t.waitForSelector("[data-testid=view-results]");
    assert.notEqual(await clueOrder(t), plantedClues, `${who}: View board isn't Bo's old-key board`);
    await t.locator("[data-testid=view-results]").click();
    assert.equal(await shareNow(t), SUMMARY_1(), `${who}: the summary line, not Bo's old-key guesses`);
  }
  log("old-key round: never shown or shared for another account");

  console.log("\nAll share-grid checks passed.");
} finally {
  await browser.close();
  sql(`delete from public.puzzles where id = ${TODAY}`);
  if (prior.length) sql(`update public.puzzles set status = 'published' where id in (${prior.join(",")})`);
}
