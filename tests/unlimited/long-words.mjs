// Long and multiword word-bank entries on an Unlimited board, at phone and desktop sizes.
// A real generated board has every one of its 28 words replaced, in place, by the
// longest bank entries (all multiword entries included), then it is saved as the
// in-progress game exactly as the app saves one. Hardcore shows all three extra
// cards. Checks every card word is shown in full (not clipped), the page has no
// sideways scroll, the board can still be solved, and the reveal and Played list
// lay out. Screenshots carry a "TEST DATA" banner (test-only DOM).
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/long-words.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { solve } from "../friends/board.mjs";
import { generateBoard } from "../../src/unlimited/generate.js";
import { startBoard, emptyStore } from "../../src/unlimited/history.js";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5192";
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const lib = JSON.parse(fs.readFileSync("src/unlimited/random-library.json", "utf8"));
const multi = lib.words.filter((w) => w.includes(" "));
const longest = [...lib.words].sort((a, b) => b.length - a.length || a.localeCompare(b));
const pick = [...multi]; for (const w of longest) if (pick.length < 28 && !pick.includes(w)) pick.push(w);
assert.equal(pick.length, 28);

const base = generateBoard(lib, { seed: 777, createdAt: "2026-10-18T23:00:00.000Z", idSuffix: "longwords" });
const map = new Map(); let i = 0;
for (const c of Object.values(base.cards)) for (const w of c.words) if (!map.has(w)) map.set(w, pick[i++]);
const board = structuredClone(base);
for (const c of Object.values(board.cards)) c.words = c.words.map((w) => map.get(w));
board.reveal = board.reveal.map((r) => ({ ...r, wordA: map.get(r.wordA), wordB: map.get(r.wordB) }));
log("longest on the board:", pick.slice(0, 6).join(", "), "| multiword:", multi.join(", "));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const results = [];
try {
  for (const vp of [{ name: "phone-320", width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { name: "phone-390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { name: "desktop", width: 1280, height: 860, deviceScaleFactor: 1 }]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${vp.name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate((s) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem("cv_unlimited_v1", JSON.stringify(s)); }, startBoard(emptyStore(), board, "hardcore"));
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".game .csurface .ctile"); await sleep(1200);
    const measure = () => page.evaluate(() => {
      const clipped = [];
      for (const el of document.querySelectorAll(".game .ew")) {
        const t = el.textContent.trim(); if (!t) continue;
        const vertical = getComputedStyle(el).writingMode.startsWith("vertical");
        const over = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
        if (over > 1) clipped.push(`${t} (${over}px)`);
      }
      const overlaps = [];
      for (const card of document.querySelectorAll(".game .ctile-inner")) {
        const labels = [...card.querySelectorAll(".ew")].filter((e) => e.textContent.trim());
        for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
          const p = labels[i].getBoundingClientRect(), q = labels[j].getBoundingClientRect();
          if (p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5) overlaps.push(`${labels[i].textContent}/${labels[j].textContent}`);
        }
      }
      return { words: document.querySelectorAll(".game .ew").length, clipped, overlaps, sideways: document.documentElement.scrollWidth - window.innerWidth };
    });
    const m = await measure();
    log(vp.name, "play:", `${m.words} word labels`, m.clipped.length ? `CLIPPED ${m.clipped.join(", ")}` : "none clipped", m.overlaps.length ? `OVERLAP ${m.overlaps.join(", ")}` : "no overlaps", `sideways scroll ${m.sideways}px`);
    if (OUT) await page.screenshot({ path: path.join(OUT, `long-${vp.name}-play.png`) });
    // At 320×568 the Hardcore tray sits below the fold (the game scrolls), out of reach of this
    // test's mouse-drag helper, so that size is a layout check of the play screen only.
    if (vp.width < 360) { results.push({ viewport: vp.name, ...m, whySideways: 0, lobbySideways: 0, solved: "not attempted (layout only)" }); await ctx.close(); continue; }
    // Solve, then the reveal and the lobby's Played list
    await solve(page, { cards: board.cards, solution: board.solution });
    await page.locator("button.sbtn").click();
    await page.waitForSelector("[data-testid=ul-end]", { timeout: 25000 }); await sleep(700);
    await page.locator("[data-testid=ul-why]").click();
    await page.waitForSelector("[data-testid=ul-why-item]"); await sleep(500);
    const why = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
    for (const r of board.reveal) assert.ok(why.some((t) => t.includes(r.wordA) && t.includes(r.wordB)), `reveal names ${r.wordA} + ${r.wordB}`);
    const whySide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (OUT) await page.screenshot({ path: path.join(OUT, `long-${vp.name}-why.png`) });
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await page.waitForSelector("[data-testid=ul-start]"); await sleep(500);
    const lobbySide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (OUT) { await page.evaluate(() => document.querySelector(".ul-played-clues")?.scrollIntoView({ block: "center" })); await sleep(300); await page.screenshot({ path: path.join(OUT, `long-${vp.name}-played.png`) }); }
    results.push({ viewport: vp.name, ...m, whySideways: whySide, lobbySideways: lobbySide, solved: true });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 1));
  assert.deepEqual(errors, [], "no page or console errors");
  for (const r of results) {
    assert.ok(r.sideways <= 0 && r.whySideways <= 0 && r.lobbySideways <= 0, `${r.viewport}: no sideways scroll`);
    assert.deepEqual(r.clipped, [], `${r.viewport}: every card word shown in full`);
    assert.deepEqual(r.overlaps, [], `${r.viewport}: no two words on a card overlap`);
  }
  console.log("\nPASS — longest and multiword bank entries: shown in full and not overlapping on board and tray at 320/390/1280 (fitted inside Unlimited where needed), solved at 390 and 1280, reveal and Played list fit");
} finally {
  await browser.close();
}
