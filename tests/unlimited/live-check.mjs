// Live verification of the Unlimited guest beta on the deployed site, in a
// fresh guest browser context. Reads only; Unlimited never writes to the
// server, and the Daily and Friends screens are only opened, never played.
//   node tests/unlimited/live-check.mjs https://cluevoyance.com [screenshot-dir]
// Checks: the served JS is the merged code (the Unlimited chunk exists and
// carries the corrected diamond text), /unlimited shows the eight-board lobby,
// puzzle 1 on Standard: a wrong guess, refresh resumes, solve, "Why these
// clues" with all four pairs, a rating, Next opens puzzle 2; /today and
// /friends load without page errors.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { readBoard, solve, nudgeWrong } from "../friends/board.mjs";

const URL = (process.argv[2] || "https://cluevoyance.com").replace(/\/$/, "");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards.sort((x, y) => x.index - y.index);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const shot = async (page, name) => { if (OUT) { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log("screenshot", name); } };
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const asView = (b) => ({ cards: b.cards, solution: b.solution });

// 1. The served code, straight from the host.
const html = await (await fetch(`${URL}/unlimited`)).text();
assert.ok(/id="root"/.test(html), "/unlimited is served by the app (SPA rewrite)");
const mainSrc = (html.match(/<script[^>]+src="([^"]+\.js)"/) || [])[1];
assert.ok(mainSrc, "main script found");
const mainJs = await (await fetch(new globalThis.URL(mainSrc, URL))).text();
const chunk = (mainJs.match(/\.\/(UnlimitedView-[A-Za-z0-9_-]+\.js)/) || [])[1];
assert.ok(chunk, "the main bundle references an UnlimitedView chunk (the merged code)");
const chunkJs = await (await fetch(`${URL}/assets/${chunk}`)).text();
assert.ok(chunkJs.includes("A diamond is a crystal."), "the served pool carries the corrected diamond text");
assert.ok(!chunkJs.includes("nobody can grow"), "and not the old sentence");
assert.ok(chunkJs.includes("Why these clues worked") && chunkJs.includes("cv_unlimited_v1"), "the served chunk is the Unlimited view");
for (const b of pool) assert.ok(chunkJs.includes(b.id), `board ${b.id} is in the served pool`);
log("served JS:", mainSrc.split("/").pop(), "→", chunk, "(8 boards, corrected text)");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  const ctx = await browser.createBrowserContext();   // fresh guest: no storage, no sign-in
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // 2. Direct /unlimited: the lobby
  await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  await waitText(page, `0 of ${pool.length} puzzles played on this device`);
  assert.ok((await text(page)).includes("stay in this browser"));
  await shot(page, "live-01-lobby");

  // 3. Puzzle 1 on Standard: wrong guess, refresh resumes, solve
  await page.locator(".lobby-diff-opt::-p-text(Standard)").click();
  await page.locator("[data-testid=ul-start]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 1 of ${pool.length} · Standard`);
  const b1 = pool[0];
  const dealt = [...b1.solution.slotCards, b1.solution.extraCards[0]].flatMap((id) => b1.cards[id].words).sort();
  const onScreen = await readBoard(page);
  assert.deepEqual([...onScreen.board, ...onScreen.tray].flatMap((c) => c.words).sort(), dealt, "board 1 as assembled");
  await shot(page, "live-02-board-1");
  await nudgeWrong(page, asView(b1));
  await page.locator("button.sbtn").click(); await sleep(4600);
  assert.equal(await lives(page), 2, "a wrong guess costs a life");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
  assert.equal(await lives(page), 2, "refresh resumes with the life lost");
  await solve(page, asView(b1));
  await page.locator("button.sbtn").click();
  await page.waitForSelector("[data-testid=ul-end]", { timeout: 25000 }); await sleep(600);
  await shot(page, "live-03-solved-1");

  // 4. Reveal, rating, Next
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]");
  const items = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
  assert.equal(items.length, 4);
  b1.reveal.forEach((r, i) => assert.ok(items[i].includes(r.clue) && items[i].includes(r.wordA) && items[i].includes(r.wordB), `entry ${i}`));
  await page.locator("[data-testid=ul-why-item] >>> button::-p-text(Great clue)").click();
  await shot(page, "live-04-why");
  await page.locator("[data-testid=ul-why-next]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 2 of ${pool.length} · Standard`);
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
  assert.equal(store.played[b1.id].outcome, "won");
  assert.equal(store.feedback.length, 1);
  assert.equal(store.current.id, pool[1].id);
  await shot(page, "live-05-puzzle-2");
  const daily = await page.evaluate(() => Object.keys(localStorage).filter((k) => k === "clover_stats" || k === "clover_completions" || k.startsWith("clover_final_")));
  assert.deepEqual(daily, [], "no daily stats, completions or results written");
  log("unlimited: lobby, play, wrong guess, resume, solve, reveal, rating, next");

  // 5. Daily and Friends routes load (opened only, never played)
  await page.goto(`${URL}/today`, { waitUntil: "networkidle0" });
  await page.waitForSelector("button.lobby-start, .game .csurface .ctile, .rs-card", { timeout: 25000 });
  log("/today loads:", (await text(page)).split("\n").find((l) => /Puzzle|Daily|Select Difficulty/.test(l)) || "(board)");
  await shot(page, "live-06-today");
  await page.goto(`${URL}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-testid=home-daily]");
  assert.ok(!(await text(page)).includes("Unlimited"), "the home page does not promote Unlimited");
  await page.goto(`${URL}/friends`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const friendsText = await text(page);
  assert.ok(friendsText.length > 50, "/friends renders a screen");
  log("/friends loads:", friendsText.split("\n").filter(Boolean).slice(0, 2).join(" · "));
  await shot(page, "live-07-friends");

  assert.deepEqual(errors, [], "no page or console errors");
  console.log(`\nPASS — live ${URL}: merged code served, ${pool.length}-board lobby ("0 of ${pool.length}" observed), representative flow, refresh/resume, reveal + feedback + next; Daily and Friends routes load`);
} finally {
  await browser.close();
}
