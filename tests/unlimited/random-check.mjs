// Random Unlimited in a real browser, at phone and desktop width, against the
// local dev server. A guest who already has fixed-pool history (three beta-01
// boards, a rated clue) and a Daily game in this browser:
//   Play (Standard) → a random board, frozen in history → a wrong guess costs a
//   life → refresh: the SAME board (id, hints, card words) and the life still
//   lost → solve → "Why these clues" shows the frozen reveal → Next → a
//   DIFFERENT random board → leave → Continue resumes it → solve → Replay the
//   first random board from Played: the exact saved board → Replay an old
//   fixed beta-01 board: its pool snapshot → Easy/Expert/Hardcore deal 0/2/3
//   extra cards; an Easy game is lost with three wrong guesses and its answer
//   explained → Download holds the played list and the frozen random boards.
// The old fixed records and the Daily keys stay byte-identical; no page errors.
// Screenshots carry an injected "TEST DATA / LOCAL RANDOM BUILD" banner (test-only DOM).
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/random-check.mjs [screenshot-dir]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { readBoard, solve, nudgeWrong } from "../friends/board.mjs";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5192";
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards;
const poolById = Object.fromEntries(pool.map((b) => [b.id, b]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
const chipId = (page) => page.$eval("[data-testid=ul-chip]", (e) => e.dataset.boardId);
const hintsOnScreen = (page) => page.$$eval(".game .ctab", (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
const wordsOnScreen = async (page) => { const b = await readBoard(page); return [...b.board, ...b.tray].flatMap((c) => c.words).sort(); };
const submit = async (page) => { await page.locator("button.sbtn").click(); await sleep(4600); };
const solveAndFinish = async (page, b) => { await solve(page, asView(b)); await page.locator("button.sbtn").click(); await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600); };
const TAG = process.env.TEST_LABEL || "LOCAL RANDOM BUILD";
const label = (page, t) => page.evaluate((x, tag) => { let d = document.getElementById("__test_label"); if (!d) { d = document.createElement("div"); d.id = "__test_label"; document.body.appendChild(d); }
  d.textContent = `TEST DATA / ${tag} · ${x}`; Object.assign(d.style, { position: "fixed", left: "0", right: "0", top: "0", zIndex: "99999", background: "rgba(180,0,0,0.88)", color: "#fff", font: "600 12px/1.6 system-ui, sans-serif", textAlign: "center", pointerEvents: "none", padding: "2px 4px" }); }, t, TAG);
const shots = [];
const shot = async (page, name, tag) => { if (!OUT) return; await label(page, tag); await sleep(350); const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); await page.evaluate(() => document.getElementById("__test_label")?.remove()); shots.push(f); log("screenshot", name); };
const openLobby = async (page) => { await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" }); await page.waitForSelector("[data-testid=ul-start], [data-testid=ul-continue]"); };
const playRandom = async (page, diff) => {
  await page.locator(`.lobby-diff-opt::-p-text(${diff})`).click();
  await page.locator("[data-testid=ul-start]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Random puzzle · ${diff}`);
  const id = await chipId(page); const s = await store(page);
  assert.ok(/^r-/.test(id) && s.boards[id] && s.current.id === id, `a new random board ${id} is frozen in history on start`);
  return s.boards[id];
};

const DAILY = { clover_stats: JSON.stringify({ currentStreak: 3, maxStreak: 5, totalPlayed: 9, totalWon: 8 }), clover_difficulty: JSON.stringify("standard"),
  clover_progress_1700000000001: JSON.stringify({ puzzleId: "1700000000001", difficulty: "standard", lives: 2, solved: false }) };
const FIXED_PLAYED = Object.fromEntries(["001", "002", "003"].map((n, i) => [`beta-01-${n}`, { outcome: i === 1 ? "lost" : "won", livesUsed: i === 1 ? 3 : i, difficulty: "standard", finishedAt: `2026-10-17T20:0${i}:00.000Z`, version: 1, replays: 0 }]));
const FIXED_FEEDBACK = [{ at: "2026-10-17T20:05:00.000Z", puzzleId: "beta-01-002", version: 1, position: 1, clue: poolById["beta-01-002"].reveal[1].clue, pair: "x", rating: "confusing", difficulty: "standard", outcome: "lost", livesUsed: 3 }];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  for (const vp of [{ name: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { name: "desktop", width: 1280, height: 860, deviceScaleFactor: 1 }]) {
    const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "cv-random-dl-"));
    const ctx = await browser.createBrowserContext();
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true, browserContextId: ctx.id });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${vp.name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate((daily, played, feedback) => {
      localStorage.setItem("clover_tutorial_seen", "true");
      for (const [k, v] of Object.entries(daily)) localStorage.setItem(k, v);
      localStorage.setItem("cv_unlimited_v1", JSON.stringify({ version: 1, played, current: null, feedback }));
    }, DAILY, FIXED_PLAYED, FIXED_FEEDBACK);
    const dailyNow = () => page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), Object.keys(DAILY));

    // 1. Lobby with the old fixed history
    await openLobby(page);
    await waitText(page, "3 puzzles played");
    assert.equal((await page.$$("[data-testid=ul-played-row]")).length, 3, "the three fixed boards are listed");
    await shot(page, `${vp.name}-01-lobby`, `${vp.name} · lobby with old fixed history`);

    // 2. Play → random board; wrong guess; refresh = same board, same lost life
    const b1 = await playRandom(page, "Standard");
    assert.deepEqual([...(await hintsOnScreen(page))].sort(), [...b1.clues].sort(), "the hints on screen are the frozen board's");
    assert.equal((await readBoard(page)).tray.length, 1, "Standard deals one extra card");
    const words1 = await wordsOnScreen(page);
    await shot(page, `${vp.name}-02-random-board`, `${vp.name} · random board ${b1.id}`);
    await nudgeWrong(page, asView(b1)); await submit(page);
    assert.equal(await lives(page), 2, "a wrong guess costs a life");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".game .csurface .ctile"); await sleep(800);
    assert.equal(await chipId(page), b1.id, "refresh resumes the same board id (no re-roll)");
    assert.deepEqual([...(await hintsOnScreen(page))].sort(), [...b1.clues].sort(), "same hints after refresh");
    assert.deepEqual(await wordsOnScreen(page), words1, "same card words after refresh");
    assert.equal(await lives(page), 2, "the lost life survives the refresh");
    assert.deepEqual((await store(page)).boards[b1.id], b1, "the frozen snapshot is unchanged");

    // 3. Solve → frozen reveal
    await solveAndFinish(page, b1);
    await page.locator("[data-testid=ul-why]").click();
    await page.waitForSelector("[data-testid=ul-why-item]");
    const items = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
    b1.reveal.forEach((r, i) => assert.ok(items[i].includes(r.clue) && items[i].includes(r.revealExplanation) && items[i].includes(r.wordAConnection) && items[i].includes(r.wordBConnection), `reveal ${i} is the frozen snapshot, explanation shown`));
    await shot(page, `${vp.name}-03-why-these-clues`, `${vp.name} · reveal for ${b1.id}`);
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });

    // 4. Next → a different random board
    await page.locator("[data-testid=ul-next]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "Random puzzle · Standard");
    const b2id = await chipId(page); let s = await store(page); const b2 = s.boards[b2id];
    assert.notEqual(b2id, b1.id, "Next opens a different board");
    assert.notDeepEqual([...b2.clues].sort(), [...b1.clues].sort(), "with different hints");
    const shared = b2.reveal.filter((r) => b1.reveal.some((x) => x.pairId === r.pairId)).length;
    assert.equal(shared, 0, "and none of the previous board's pairs");
    await shot(page, `${vp.name}-04-next-board`, `${vp.name} · Next → ${b2id}`);

    // 5. Leave → Continue resumes the same board → solve
    await page.locator(".fr-back").click();
    await page.waitForSelector("[data-testid=ul-continue]");
    await page.locator("[data-testid=ul-continue]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(800);
    assert.equal(await chipId(page), b2id, "Continue resumes the same board");
    await solveAndFinish(page, b2);

    // 6. Replay the first random board: the exact saved board
    await openLobby(page);
    await page.locator(`[data-testid=ul-played-row][data-board-id="${b1.id}"] [data-testid=ul-replay]`).click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "replay");
    assert.equal(await chipId(page), b1.id, "Replay opens the saved random board");
    assert.deepEqual([...(await hintsOnScreen(page))].sort(), [...b1.clues].sort(), "with its saved hints");
    await solveAndFinish(page, b1);
    s = await store(page);
    assert.equal(s.played[b1.id].replays, 1, "the replay is counted"); assert.equal(s.played[b1.id].outcome, "won");
    assert.deepEqual(s.boards[b1.id], b1, "and the snapshot is untouched");

    // 7. Replay an old fixed board: its pool snapshot
    await openLobby(page);
    await page.locator(`[data-testid=ul-played-row][data-board-id="beta-01-002"] [data-testid=ul-replay]`).click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await waitText(page, "Puzzle 2 of");
    assert.equal(await chipId(page), "beta-01-002");
    assert.deepEqual([...(await hintsOnScreen(page))].sort(), [...poolById["beta-01-002"].clues].sort(), "the fixed board's own hints");
    await solveAndFinish(page, poolById["beta-01-002"]);
    await page.locator("[data-testid=ul-why]").click(); await page.waitForSelector("[data-testid=ul-why-item]");
    const fixedItems = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
    poolById["beta-01-002"].reveal.forEach((r, i) => assert.ok(fixedItems[i].includes(r.wordAConnection), `fixed reveal ${i} from the pool snapshot`));
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    s = await store(page);
    assert.equal(s.played["beta-01-002"].outcome, "lost", "the old loss is kept"); assert.equal(s.played["beta-01-002"].replays, 1);

    // 8. Difficulties: Easy 0, Expert 2, Hardcore 3 extras; lose an Easy game
    for (const [diff, extras] of [["Expert", 2], ["Hardcore", 3], ["Easy", 0]]) {
      await openLobby(page);
      const b = await playRandom(page, diff);
      assert.equal((await readBoard(page)).tray.length, extras, `${diff} deals ${extras} extra cards`);
      if (diff === "Easy") {
        for (let i = 0; i < 3; i++) { await nudgeWrong(page, asView(b)); await submit(page); }
        await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600);
        await page.locator("[data-testid=ul-why]").click(); await page.waitForSelector("[data-testid=ul-why-item]");
        await waitText(page, "Not solved on Easy");
        await shot(page, `${vp.name}-05-easy-loss`, `${vp.name} · Easy loss explained`);
        await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
        assert.equal((await store(page)).played[b.id].outcome, "lost");
      } else {
        if (diff === "Hardcore") await shot(page, `${vp.name}-06-hardcore`, `${vp.name} · Hardcore, 3 extra cards`);
        await solveAndFinish(page, b);
      }
    }

    // 9. Export and integrity
    await openLobby(page);
    await waitText(page, "8 puzzles played");
    await shot(page, `${vp.name}-07-lobby-after`, `${vp.name} · lobby after random games`);
    await page.locator("[data-testid=ul-download]").click();
    let files = [];
    for (let i = 0; i < 30 && !files.length; i++) { await sleep(300); files = fs.readdirSync(downloads).filter((f) => f.endsWith(".json")); }
    const dl = JSON.parse(fs.readFileSync(path.join(downloads, files[0]), "utf8"));
    s = await store(page);
    assert.equal(Object.keys(dl.boards).length, 5, "the export carries the five frozen random boards");
    assert.deepEqual(dl.boards[b1.id], b1);
    for (const id of Object.keys(FIXED_PLAYED)) assert.ok(dl.played[id], `export keeps ${id}`);
    for (const id of ["beta-01-001", "beta-01-003"]) assert.deepEqual(s.played[id], FIXED_PLAYED[id], `${id} byte-identical`);
    assert.deepEqual({ ...s.played["beta-01-002"], replays: undefined, lastReplay: undefined }, { ...FIXED_PLAYED["beta-01-002"], replays: undefined, lastReplay: undefined }, "beta-01-002 first result kept");
    assert.deepEqual(s.feedback.filter((f) => f.at === FIXED_FEEDBACK[0].at), FIXED_FEEDBACK, "old feedback byte-identical");
    assert.deepEqual(await dailyNow(), DAILY, "Daily keys byte-identical");
    log(`${vp.name}: random Play/refresh/solve/Next/Continue/Replay, fixed replay, Easy/Standard/Expert/Hardcore, export — ok`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "no page or console errors");
  console.log(`\nPASS — random Unlimited at phone and desktop: frozen boards (refresh/Continue/Replay never re-roll), Next = different board, old fixed history and snapshots kept, all difficulties, loss, export, Daily untouched${OUT ? `; ${shots.length} labelled screenshots` : ""}`);
} finally {
  await browser.close();
}
