// SUPERSEDED on feature/unlimited-random: Play and Next now build a random board (src/unlimited/generate.js),
// so this fixed-order flow no longer applies. Kept as the record of the fixed-pool beta; see random-check.mjs.
// After appending a batch to the pool: a guest who already has beta-01 history
// (seven finished boards and puzzle 8 in progress with a life lost) keeps all
// of it byte-for-byte, resumes puzzle 8, finishes it, and Next opens the first
// new board (index 9) with four distinct hints; a seeded "played" set then
// jumps Next to a new board whose reveal carries the corrected wording.
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/append-check.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { solve, nudgeWrong } from "../friends/board.mjs";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5192";
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards.sort((x, y) => x.index - y.index);
assert.equal(pool.length, 16, "the pool holds sixteen boards");
assert.deepEqual(pool.slice(0, 8).map((b) => b.id), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `beta-01-00${n}`), "beta-01 ids first, in order");
assert.deepEqual(pool.slice(8).map((b) => b.index), [9, 10, 11, 12, 13, 14, 15, 16], "new indices 9–16");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const shot = async (page, name) => { if (OUT) { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log("screenshot", name); } };
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
const solveAndFinish = async (page, b) => { await solve(page, asView(b)); await page.locator("button.sbtn").click(); await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600); };
const byId = Object.fromEntries(pool.map((b) => [b.id, b]));

// Seven finished beta-01 boards with mixed results and a note, as a real player's store.
const SEED_PLAYED = {};
["001", "002", "003", "004", "005", "006", "007"].forEach((n, i) => { SEED_PLAYED[`beta-01-${n}`] = { outcome: i === 2 ? "lost" : "won", livesUsed: i === 2 ? 3 : i % 3, difficulty: ["standard", "easy", "hardcore", "expert"][i % 4], finishedAt: `2026-10-17T20:0${i}:00.000Z`, version: 1, replays: i === 0 ? 1 : 0 }; });
const SEED_FEEDBACK = [{ at: "2026-10-17T20:05:00.000Z", puzzleId: "beta-01-002", version: 1, position: 1, clue: byId["beta-01-002"].reveal[1].clue, pair: "x", rating: "confusing", difficulty: "easy", outcome: "won", livesUsed: 1 }];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.evaluate((played, feedback) => {
    localStorage.setItem("clover_tutorial_seen", "true");
    localStorage.setItem("cv_unlimited_v1", JSON.stringify({ version: 1, played, current: null, feedback }));
  }, SEED_PLAYED, SEED_FEEDBACK);
  const seededJson = JSON.stringify({ played: SEED_PLAYED, feedback: SEED_FEEDBACK });

  // 1. Lobby with history: 7 of 16, next is puzzle 8 (beta-01-008)
  await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  await waitText(page, "7 of 16 puzzles played");
  await waitText(page, "Play puzzle 8");
  await shot(page, "a01-lobby-16");
  await page.locator(".lobby-diff-opt::-p-text(Standard)").click();
  await page.locator("[data-testid=ul-start]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, "Puzzle 8 of 16 · Standard");
  const b8 = byId["beta-01-008"];
  await nudgeWrong(page, asView(b8));
  await page.locator("button.sbtn").click(); await sleep(4600);
  assert.equal(await lives(page), 2);
  // 2. In-progress state survives a refresh; the old records are untouched
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
  assert.equal(await lives(page), 2, "puzzle 8 in progress survives");
  let s = await store(page);
  assert.equal(JSON.stringify({ played: Object.fromEntries(Object.entries(s.played).filter(([k]) => SEED_PLAYED[k])), feedback: s.feedback }), seededJson, "seeded beta-01 records byte-identical mid-game");
  await solveAndFinish(page, b8);
  await shot(page, "a02-solved-8");
  // 3. Next opens the first new board, index 9, four distinct hints
  assert.ok(await page.$("[data-testid=ul-next]"), "Next is offered after puzzle 8");
  await page.locator("[data-testid=ul-next]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, "Puzzle 9 of 16 · Standard");
  const b9 = pool[8];
  const hints = await page.$$eval(".game .ctab", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
  assert.equal(new Set(hints.map((h) => h.toUpperCase())).size, 4, `four distinct hints on screen: ${hints}`);
  assert.deepEqual([...hints].sort(), [...b9.clues].sort(), "the hints are beta-02-001's");
  await shot(page, "a03-puzzle-9");
  await solveAndFinish(page, b9);
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]");
  assert.equal((await page.$$("[data-testid=ul-why-item]")).length, 4);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
  s = await store(page);
  assert.equal(s.played["beta-01-008"].outcome, "won");
  assert.equal(s.played[b9.id].outcome, "won");
  assert.equal(JSON.stringify({ played: Object.fromEntries(Object.entries(s.played).filter(([k]) => SEED_PLAYED[k])), feedback: s.feedback.filter((f) => f.puzzleId === "beta-01-002") }), seededJson, "seeded beta-01 records byte-identical after new boards");
  log("history kept; puzzle 8 resumed and finished; puzzle 9 is beta-02-001 with four distinct hints");

  // 4. Corrected reveal wording on the boards that carry it (seed the rest as played, Next lands on them)
  // The sheet shows each hint's two per-side lines (wordAConnection / wordBConnection).
  const corrected = { "beta-02-004": ["A robot is an artificial machine.", "Iron is heated in the forge for shaping."], "beta-02-005": ["A warhorse.", "The Wars of the Roses."], "beta-02-006": ["forbidden apple", "And with the serpent."], "beta-02-007": ["learned response"], "beta-02-008": ["A cut diamond.", "A cut rose."] };
  for (const id of Object.keys(corrected)) {
    await page.evaluate((keep) => { const st = JSON.parse(localStorage.getItem("cv_unlimited_v1")); for (const b of keep.others) st.played[b] = st.played[b] || { outcome: "won", livesUsed: 0, difficulty: "standard", finishedAt: "2026-10-17T21:00:00.000Z", version: 1, replays: 0 }; delete st.played[keep.id]; st.current = null; localStorage.setItem("cv_unlimited_v1", JSON.stringify(st)); }, { id, others: pool.slice(8).map((b) => b.id).filter((x) => x !== id) });
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await waitText(page, `Play puzzle ${byId[id].index}`);
    await page.locator("[data-testid=ul-start]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await solveAndFinish(page, byId[id]);
    await page.locator("[data-testid=ul-why]").click();
    await page.waitForSelector("[data-testid=ul-why-item]");
    const sheet = await text(page);
    for (const phrase of corrected[id]) assert.ok(sheet.includes(phrase), `${id}: reveal shows "${phrase}"`);
    assert.ok(!/fought over the badge|rose cut is a genuine|artificial intelligence, a robot/.test(sheet), `${id}: no old wording`);
    if (id === "beta-02-005") await shot(page, "a04-why-corrected-war");
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    log(`${id}: corrected reveal wording shown`);
  }
  assert.deepEqual(errors, [], "no page or console errors");
  console.log("\nPASS — 16-board pool: beta-01 history and in-progress game kept, resume, Next into board 9, distinct hints, corrected reveal wording");
} finally {
  await browser.close();
}
