// Live check: a random game saved by the previous release (generator 1, extras
// from the original 50 words) reopens unchanged on the deployed build, in a
// fresh guest browser context seeded only with that saved game.
//   node tests/unlimited/live-v1-resume.mjs https://cluevoyance.com
import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { readBoard } from "../friends/board.mjs";
import { startBoard, emptyStore } from "../../src/unlimited/history.js";

const URL = (process.argv[2] || "https://cluevoyance.com").replace(/\/$/, "");
const v1 = JSON.parse(fs.readFileSync("src/unlimited/fixtures/generator-v1-board.json", "utf8")).board;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: "networkidle0" });
  const saved = startBoard(emptyStore(), v1, "standard");
  await page.evaluate((s) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem("cv_unlimited_v1", JSON.stringify(s)); }, saved);
  for (const round of ["open", "refresh"]) {
    if (round === "open") await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" }); else await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".game .csurface .ctile"); await new Promise((r) => setTimeout(r, 900));
    assert.equal(await page.$eval("[data-testid=ul-chip]", (e) => e.dataset.boardId), v1.id, `${round}: the saved generator-1 board`);
    const b = await readBoard(page);
    const dealt = [...v1.solution.slotCards, v1.solution.extraCards[0]].flatMap((id) => v1.cards[id].words).sort();
    assert.deepEqual([...b.board, ...b.tray].flatMap((c) => c.words).sort(), dealt, `${round}: same words`);
    const hints = await page.$$eval(".game .ctab", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    for (const c of v1.clues) assert.ok(hints.includes(c), `${round}: hint ${c}`);
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
  assert.equal(JSON.stringify(stored.boards[v1.id]), JSON.stringify(v1), "saved snapshot byte-identical");
  assert.deepEqual(errors, []);
  console.log(`PASS — live ${URL}: a generator-1 game (${v1.id}: ${v1.clues.join(", ")}) reopens and survives a refresh unchanged`);
} finally { await browser.close(); }
