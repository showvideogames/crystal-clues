// Release-readiness check for the 32-board pool (beta-01 + beta-02 + local
// candidate beta-03), at phone and desktop width, against the local dev server.
// A guest who already finished 15 of the first 16 boards (mixed results, a
// replay, a rated clue) plays puzzle 16 (one wrong guess → refresh resumes the
// same game → solve → "Why these clues" shows the board's frozen reveal
// snapshot), Next opens puzzle 17 = beta-03-001 (four distinct hints), a wrong
// guess there, solve, reveal, rate a clue, Copy and Download the export, Next
// opens puzzle 18 = beta-03-002, solve. The 15 seeded records and the seeded
// feedback stay byte-identical throughout; no Daily key is written.
// Screenshots carry an injected "TEST DATA / LOCAL CANDIDATE" banner (test-only DOM).
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/append-check-32.mjs [screenshot-dir]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { solve, nudgeWrong } from "../friends/board.mjs";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5192";
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards.sort((x, y) => x.index - y.index);
assert.equal(pool.length, 32, "the pool holds 32 boards");
assert.deepEqual(pool.map((b) => b.index), Array.from({ length: 32 }, (_, i) => i + 1), "indices 1-32 in order");
assert.deepEqual(pool.slice(0, 8).map((b) => b.id.slice(0, 7)), Array(8).fill("beta-01"));
assert.deepEqual(pool.slice(8, 16).map((b) => b.id.slice(0, 7)), Array(8).fill("beta-02"));
assert.deepEqual(pool.slice(16).map((b) => b.id.slice(0, 7)), Array(16).fill("beta-03"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
const solveAndFinish = async (page, b) => { await solve(page, asView(b)); await page.locator("button.sbtn").click(); await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600); };
const label = (page, tag) => page.evaluate((t) => {
  let d = document.getElementById("__test_label"); if (!d) { d = document.createElement("div"); d.id = "__test_label"; document.body.appendChild(d); }
  d.textContent = `TEST DATA / LOCAL CANDIDATE · ${t}`;
  Object.assign(d.style, { position: "fixed", left: "0", right: "0", top: "0", zIndex: "99999", background: "rgba(180,0,0,0.88)", color: "#fff", font: "600 12px/1.6 system-ui, sans-serif", textAlign: "center", pointerEvents: "none", padding: "2px 4px" });
}, tag);
const unlabel = (page) => page.evaluate(() => document.getElementById("__test_label")?.remove());
const shots = [];
const shot = async (page, name, tag) => { if (!OUT) return; await label(page, tag); await sleep(350); const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); await unlabel(page); shots.push(f); log("screenshot", name); };
const prior = pool.slice(0, 16);
const SEED_PLAYED = {};
prior.slice(0, 15).forEach((b, i) => { SEED_PLAYED[b.id] = { outcome: i % 5 === 2 ? "lost" : "won", livesUsed: i % 5 === 2 ? 3 : i % 3, difficulty: ["standard", "easy", "hardcore", "expert"][i % 4], finishedAt: `2026-10-17T2${Math.floor(i / 10)}:${String(i % 10).padStart(2, "0")}:00.000Z`, version: b.version ?? 1, replays: i === 0 ? 1 : 0 }; });
const SEED_FEEDBACK = [{ at: "2026-10-17T20:05:00.000Z", puzzleId: prior[9].id, version: prior[9].version ?? 1, position: 1, clue: prior[9].reveal[1].clue, pair: `${prior[9].reveal[1].wordA} + ${prior[9].reveal[1].wordB}`, rating: "confusing", difficulty: "easy", outcome: "won", livesUsed: 1 }];
const seededJson = JSON.stringify({ played: SEED_PLAYED, feedback: SEED_FEEDBACK });
const seededOnly = (s) => JSON.stringify({ played: Object.fromEntries(Object.entries(s.played).filter(([k]) => SEED_PLAYED[k])), feedback: s.feedback.filter((f) => f.at === SEED_FEEDBACK[0].at) });
const assertWhy = async (page, b) => {
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]");
  const items = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
  assert.equal(items.length, 4, `${b.id}: four explanations`);
  b.reveal.forEach((r, i) => assert.ok(items[i].includes(r.clue) && items[i].includes(r.wordA) && items[i].includes(r.wordB) && items[i].includes(r.wordAConnection) && items[i].includes(r.wordBConnection), `${b.id} entry ${i}: frozen snapshot ${r.clue} shown with both sides`));
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  for (const vp of [{ name: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { name: "desktop", width: 1280, height: 860, deviceScaleFactor: 1 }]) {
    const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "cv-ul32-dl-"));
    const ctx = await browser.createBrowserContext();
    await ctx.overridePermissions(URL, ["clipboard-read", "clipboard-write"]);
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true, browserContextId: ctx.id });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${vp.name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(URL, { waitUntil: "networkidle0" });
    const dailyBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith("cv_unlimited") && !k.startsWith("clover_progress_unlimited")).sort());
    await page.evaluate((played, feedback) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem("cv_unlimited_v1", JSON.stringify({ version: 1, played, current: null, feedback })); }, SEED_PLAYED, SEED_FEEDBACK);

    // 1. Lobby: 15 of 32, next is puzzle 16 (the last prior board)
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await waitText(page, "15 of 32 puzzles played");
    await waitText(page, "Play puzzle 16");
    await shot(page, `${vp.name}-01-lobby-15-of-32`, `${vp.name} · lobby, 15 of 32 played`);
    await page.locator(".lobby-diff-opt::-p-text(Standard)").click();
    await page.locator("[data-testid=ul-start]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "Puzzle 16 of 32 · Standard");
    const b16 = pool[15];
    // 2. One wrong guess, refresh resumes the same game, old records untouched
    await nudgeWrong(page, asView(b16));
    await page.locator("button.sbtn").click(); await sleep(4600);
    assert.equal(await lives(page), 2, "a wrong guess costs a life");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
    assert.equal(await lives(page), 2, "puzzle 16 in progress survives a refresh");
    assert.equal(seededOnly(await store(page)), seededJson, "seeded records byte-identical mid-game");
    // 3. Solve 16, its frozen reveal snapshot is shown
    await solveAndFinish(page, b16);
    await assertWhy(page, b16);
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    log(`${vp.name}: puzzle 16 (${b16.id}) wrong guess, refresh resume, solved, reveal = pool snapshot`);
    // 4. Next 16 → 17: first candidate board, four distinct hints
    await page.locator("[data-testid=ul-next]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "Puzzle 17 of 32 · Standard");
    const b17 = pool[16];
    const hints17 = await page.$$eval(".game .ctab", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    assert.equal(new Set(hints17.map((h) => h.toUpperCase())).size, 4, `four distinct hints: ${hints17}`);
    assert.deepEqual([...hints17].sort(), [...b17.clues].sort(), `puzzle 17 is ${b17.id}`);
    await shot(page, `${vp.name}-02-puzzle-17-board`, `${vp.name} · puzzle 17 = ${b17.id}`);
    await nudgeWrong(page, asView(b17));
    await page.locator("button.sbtn").click(); await sleep(4600);
    assert.equal(await lives(page), 2, "a wrong guess on 17 costs a life");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
    assert.equal(await lives(page), 2, "puzzle 17 resumes after refresh");
    await solveAndFinish(page, b17);
    await shot(page, `${vp.name}-03-puzzle-17-solved`, `${vp.name} · ${b17.id} solved`);
    await assertWhy(page, b17);
    await page.locator("[data-testid=ul-why-item] >>> button::-p-text(Confusing)").click();
    const NOTE = `release-readiness ${vp.name}`;
    await page.locator("#ul-note").fill(NOTE);
    await page.locator("[data-testid=ul-why-copy]").click();
    await waitText(page, "Copied ✓");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes(b17.id) && copied.includes(`note: ${NOTE}`) && copied.includes("Confusing"), "Copy carries the puzzle id, the rating and the note");
    await shot(page, `${vp.name}-04-why-these-clues-17`, `${vp.name} · reveal for ${b17.id}`);
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    // 5. Next 17 → 18
    await page.locator("[data-testid=ul-next]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "Puzzle 18 of 32 · Standard");
    const b18 = pool[17];
    const hints18 = await page.$$eval(".game .ctab", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    assert.deepEqual([...hints18].sort(), [...b18.clues].sort(), `puzzle 18 is ${b18.id}`);
    await shot(page, `${vp.name}-05-puzzle-18-board`, `${vp.name} · puzzle 18 = ${b18.id}`);
    await solveAndFinish(page, b18);
    await assertWhy(page, b18);
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    // 6. Lobby export: Download holds the new records and the old ones unchanged
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await waitText(page, "18 of 32 puzzles played");
    await shot(page, `${vp.name}-06-lobby-18-of-32`, `${vp.name} · lobby after 16→17→18`);
    await page.locator("[data-testid=ul-download]").click();
    let files = [];
    for (let i = 0; i < 30 && files.length === 0; i++) { await sleep(300); files = fs.readdirSync(downloads).filter((f) => f.endsWith(".json")); }
    assert.equal(files.length, 1, "one downloaded export");
    const dl = JSON.parse(fs.readFileSync(path.join(downloads, files[0]), "utf8"));
    for (const id of [b16.id, b17.id, b18.id]) assert.equal(dl.played[id]?.outcome, "won", `export: ${id} won`);
    assert.ok(dl.feedback.some((f) => f.puzzleId === b17.id && f.note === NOTE), "export: the note on 17 with its puzzle id");
    for (const [id, rec] of Object.entries(SEED_PLAYED)) assert.deepEqual(dl.played[id], rec, `export: seeded ${id} unchanged`);
    const s = await store(page);
    assert.equal(seededOnly(s), seededJson, "seeded records byte-identical at the end");
    const dailyAfter = await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith("cv_unlimited") && !k.startsWith("clover_progress_unlimited")).sort());
    assert.deepEqual(dailyAfter.filter((k) => k !== "clover_tutorial_seen"), dailyBefore.filter((k) => k !== "clover_tutorial_seen"), "no Daily or other key written");
    log(`${vp.name}: 16→17→18 played; export ok (${files[0]}); 15 seeded records + seeded feedback byte-identical`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "no page or console errors");
  console.log(`\nPASS — 32-board pool at phone and desktop: prior history kept byte-for-byte, wrong guess + refresh resume, solve, frozen reveal, Copy/Download export, Next 16→17→18${OUT ? `; ${shots.length} labelled screenshots` : ""}`);
} finally {
  await browser.close();
}
