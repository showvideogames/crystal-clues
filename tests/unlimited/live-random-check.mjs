// Live check of random Unlimited on the deployed site, in fresh guest browser
// contexts (no sign-in, nothing cleared: each context starts with only the
// test's own seeded browser data). Unlimited never writes to the server; the
// Daily and Friends screens are only opened, never played.
//   node tests/unlimited/live-random-check.mjs https://cluevoyance.com <local UnlimitedView chunk> [screenshot-dir]
// 1. The served Unlimited chunk is byte-identical to the local build of the merge commit.
// 2. A guest who was mid-game on fixed board beta-01-004 (written in the format the
//    previous release used, no frozen boards) sees Continue, resumes that same
//    board, loses a life, refreshes, keeps the lost life, solves; old records stay.
// 3. Home, /today and /friends load with no page errors.
// (The random flow itself — generation, refresh, Next, Continue, Replay, all
// difficulties, Download — runs separately: random-check.mjs against the same URL.)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { readBoard, solve, nudgeWrong } from "../friends/board.mjs";

const URL = (process.argv[2] || "https://cluevoyance.com").replace(/\/$/, "");
const LOCAL_CHUNK = process.argv[3];
const OUT = process.argv[4] ? path.resolve(process.argv[4]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards;
const byId = Object.fromEntries(pool.map((b) => [b.id, b]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const shot = async (page, name) => { if (OUT) { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log("screenshot", name); } };

// 1. Served code
const html = await (await fetch(`${URL}/unlimited`)).text();
const mainSrc = (html.match(/<script[^>]+src="([^"]+\.js)"/) || [])[1];
assert.ok(mainSrc, "main script found");
const mainJs = await (await fetch(new globalThis.URL(mainSrc, URL))).text();
const chunk = (mainJs.match(/\.\/(UnlimitedView-[A-Za-z0-9_-]+\.js)/) || [])[1];
assert.ok(chunk, "main bundle references an UnlimitedView chunk");
const served = Buffer.from(await (await fetch(`${URL}/assets/${chunk}`)).arrayBuffer());
const local = fs.readFileSync(LOCAL_CHUNK);
assert.equal(chunk, path.basename(LOCAL_CHUNK), "served chunk name equals the local build");
assert.equal(sha(served), sha(local), "served chunk bytes equal the local build");
const js = served.toString("utf8");
assert.ok(js.includes("Progress isn't saving in this browser.") && js.includes("try saving again the next time your progress or notes change"), "served chunk carries the final save wording");
const lib = JSON.parse(fs.readFileSync("src/unlimited/random-library.json", "utf8"));
assert.ok(js.includes(lib._metadata.contentHash), "served chunk carries this clue library (content hash)");
for (const t of ["ARCHITECTURE", "SCUBA DIVER", "THANKSGIVING"]) assert.ok(js.includes(t), `served word bank includes ${t}`);
for (const id of ["p_dinosaur__friend", "p_christmas__robot", "p_calculator__camouflage", "p_police__scorpion", "p_africa__wizard"]) assert.ok(js.includes(id), `served clue pool includes ${id}`);
log("served library:", lib.pairs.length, "pairs,", lib.words.length, "bank words, hash", lib._metadata.contentHash.slice(0, 16));
log("served:", mainSrc.split("/").pop(), "→", chunk, "sha256", sha(served).slice(0, 16), "= local build");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // 2. Mid-game on a fixed board from the previous release
  const OLD = { version: 1, current: { id: "beta-01-004", version: 1, difficulty: "standard", replay: false, startedAt: "2026-10-17T22:10:00.000Z" },
    played: { "beta-01-001": { outcome: "won", livesUsed: 0, difficulty: "standard", finishedAt: "2026-10-17T22:00:00.000Z", version: 1, replays: 0 },
      "beta-01-002": { outcome: "lost", livesUsed: 3, difficulty: "hardcore", finishedAt: "2026-10-17T22:05:00.000Z", version: 1, replays: 0 } },
    feedback: [{ at: "2026-10-17T22:06:00.000Z", puzzleId: "beta-01-002", version: 1, position: 1, clue: byId["beta-01-002"].reveal[1].clue, pair: "x", rating: "confusing", difficulty: "hardcore", outcome: "lost", livesUsed: 3 }] };
  await page.goto(`${URL}/`, { waitUntil: "networkidle0" });
  await page.evaluate((s) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem("cv_unlimited_v1", JSON.stringify(s)); }, OLD);
  await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  // An in-progress game opens straight into play; leave to the lobby and use Continue
  await page.waitForSelector("[data-testid=ul-chip], [data-testid=ul-continue]");
  if (!(await page.$("[data-testid=ul-continue]"))) {
    assert.equal(await page.$eval("[data-testid=ul-chip]", (e) => e.dataset.boardId), "beta-01-004", "the in-progress fixed board reopens on load");
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  }
  await shot(page, "live-fixed-01-open");
  const b = byId["beta-01-004"];
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 4 of ${pool.length} · Standard`);
  const dealt = [...b.solution.slotCards, b.solution.extraCards[0]].flatMap((id) => b.cards[id].words).sort();
  const on = await readBoard(page);
  assert.deepEqual([...on.board, ...on.tray].flatMap((c) => c.words).sort(), dealt, "fixed board 4 dealt as in the pool");
  await nudgeWrong(page, asView(b));
  await page.locator("button.sbtn").click(); await sleep(4600);
  assert.equal(await lives(page), 2, "a wrong guess costs a life");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".game .csurface .ctile"); await sleep(800);
  await waitText(page, `Puzzle 4 of ${pool.length} · Standard`);
  assert.equal(await lives(page), 2, "refresh resumes fixed board 4 with the life lost");
  await solve(page, asView(b));
  await page.locator("button.sbtn").click();
  await page.waitForSelector("[data-testid=ul-end]", { timeout: 25000 }); await sleep(600);
  await shot(page, "live-fixed-02-solved");
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
  assert.equal(s.played["beta-01-004"].outcome, "won");
  assert.equal(s.played["beta-01-004"].livesUsed, 1);
  assert.deepEqual(s.played["beta-01-001"], OLD.played["beta-01-001"]);
  assert.deepEqual(s.played["beta-01-002"], OLD.played["beta-01-002"]);
  assert.deepEqual(s.feedback, OLD.feedback);
  assert.equal(s.current, null);
  assert.deepEqual(s.boards || {}, {}, "a fixed board is not copied into frozen boards");
  log("fixed board 4: resumed, life kept across refresh, solved; old records and feedback unchanged");

  // 3. Home, Daily and Friends load (opened only)
  await page.goto(`${URL}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-testid=home-daily]");
  log("home loads");
  await page.goto(`${URL}/today`, { waitUntil: "networkidle0" });
  await page.waitForSelector("button.lobby-start, .game .csurface .ctile, .rs-card", { timeout: 25000 });
  log("/today loads:", (await text(page)).split("\n").find((l) => /Puzzle|Daily|Select Difficulty/.test(l)) || "(board)");
  await shot(page, "live-today");
  await page.goto(`${URL}/friends`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const ft = await text(page);
  assert.ok(ft.length > 50, "/friends renders a screen");
  log("/friends loads:", ft.split("\n").filter(Boolean).slice(0, 2).join(" · "));
  await shot(page, "live-friends");

  assert.deepEqual(errors, [], "no page or console errors");
  console.log(`\nPASS — live ${URL}: served chunk = local build; mid-game fixed board resumes and finishes with old history intact; home, Daily and Friends load`);
} finally {
  await browser.close();
}
