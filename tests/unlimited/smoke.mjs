// Unlimited guest beta in a real browser at phone width, against the dev
// server (node vite.js … --mode friends-local --port 5192, or FRIENDS_E2E_URL).
// A guest who already has a Daily save and a Daily result in this browser,
// with the pool's boards in order:
//   1 Standard: a wrong guess costs a life → refresh resumes the same game →
//     solve with the real board → "Why these clues" lists the four clues with
//     both pair words → rate one clue, type a note and Copy at once (no wait):
//     the copied text already holds the note → refresh: the lobby counts the
//     play and the notes; Copy copies, Download saves a JSON file.
//   2 Easy (no extras): lose with three wrong guesses → the answer is revealed →
//     the sheet says "Not solved", explains every clue; type a note and tap
//     Next puzzle at once: the note is kept.
//   3 Expert via Next keeps the difficulty? No: Next keeps Easy; leave mid-game
//     → the lobby offers Continue → continue and solve.
//   4 Expert (2 extras) and 5 Hardcore (3 extras): solve; Next opens 6.
//   Desktop width: 6 resumes straight from /unlimited; 7 and 8 are played out;
//     the lobby then says every puzzle is played, offers Replay; a replay of the
//     lost puzzle 2 is counted as a replay and never overwrites the loss.
// The seeded Daily keys are byte-identical at the end and no Daily key appears.
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/smoke.mjs [screenshot-dir]
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
const pool = JSON.parse(fs.readFileSync("src/unlimited/pool.json", "utf8")).boards.sort((x, y) => x.index - y.index);
assert.equal(pool.length, 8, "this run plays out the whole eight-board pool");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const shot = async (page, name) => { if (OUT) { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log("screenshot", name); } };
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const boardWords = async (page) => { const b = await readBoard(page); return [...b.board, ...b.tray].flatMap((c) => c.words).sort(); };
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cv_unlimited_v1")));
const dealtWords = (b, extras) => [...b.solution.slotCards, ...b.solution.extraCards.slice(0, extras)].flatMap((id) => b.cards[id].words).sort();
const chooseAndPlay = async (page, diff, n) => {
  await page.locator(`.lobby-diff-opt::-p-text(${diff})`).click();
  await page.locator("[data-testid=ul-start]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle ${n} of ${pool.length} · ${diff}`);
};
const submit = async (page, ms = 4600) => { await page.locator("button.sbtn").click(); await sleep(ms); };
const solveAndFinish = async (page, b) => {
  await solve(page, asView(b));
  await page.locator("button.sbtn").click();
  await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600);
};

// A Daily game in this browser already: stats, a finished puzzle (completion +
// its saved final board), a game in progress on another puzzle, and the chosen
// difficulty. Unlimited must leave every byte of it alone.
const DAILY_SEED = {
  clover_stats: JSON.stringify({ currentStreak: 3, maxStreak: 5, lastSolvedDate: "2026-10-16", totalPlayed: 9, totalWon: 8, livesUsedDist: { 0: 4, 1: 3, 2: 1, X: 1 }, difficultyWins: { easy: 1, standard: 6, expert: 1, hardcore: 0 } }),
  clover_completions: JSON.stringify({ 1700000000000: { solved: true, livesUsed: 1, difficulty: "standard", date: "2026-10-16", finishedAt: "2026-10-16T12:00:00.000Z" } }),
  clover_final_guest_1700000000000: JSON.stringify({ difficulty: "standard", solved: true, livesUsed: 1, guessHistory: [[["🔮", "⚫"], ["⚫", "⚫"]], [["🔮", "🔮"], ["🔮", "🔮"]]], finishedAt: "2026-10-16T12:00:00.000Z" }),
  clover_progress_1700000000001: JSON.stringify({ puzzleId: "1700000000001", difficulty: "standard", totalSlots: 5, slots: [{ cardId: "c2", orientation: 1 }], clues: ["HEAT", "TALL", "BLUE", "WILD"], locked: [0], wrong: [], knownBad: [[1, ["c3:0"]]], lives: 2, guessHistory: [[["🔮", "⚫"], ["⚫", "⚫"]]], lost: false, solved: false }),
  clover_difficulty: JSON.stringify("standard"),
};
const DAILY_KEYS = Object.keys(DAILY_SEED);
const dailySnapshot = (page) => page.evaluate((keys) => ({
  seeded: Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
  // every Daily-looking key, so a new one would show up too
  all: Object.keys(localStorage).filter((k) => k === "clover_stats" || k === "clover_completions" || k.startsWith("clover_final_") || k === "clover_difficulty" || (k.startsWith("clover_progress_") && !k.startsWith("clover_progress_unlimited-"))).sort(),
}), DAILY_KEYS);
const assertDailyIntact = async (page, where) => {
  const now = await dailySnapshot(page);
  assert.deepEqual(now.seeded, DAILY_SEED, `${where}: the seeded Daily keys are byte-identical`);
  assert.deepEqual(now.all, DAILY_KEYS.slice().sort(), `${where}: no Daily key added or removed`);
};

const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "cv-unlimited-dl-"));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(URL, ["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // Downloads land in a temp folder (a browser-level setting, for this context).
  const cdp = await browser.target().createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true, browserContextId: ctx.id });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.evaluate((seed) => { localStorage.setItem("clover_tutorial_seen", "true"); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }, DAILY_SEED);
  await assertDailyIntact(page, "seeded");

  // ── 1. Lobby, puzzle 1 on Standard ───────────────────────────────────
  await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  await waitText(page, `0 of ${pool.length}`);
  assert.ok((await text(page)).includes("stay in this browser"), "the lobby says where the data lives");
  await shot(page, "u01-lobby");
  await chooseAndPlay(page, "Standard", 1);
  const b1 = pool[0];
  const s1 = await readBoard(page);
  assert.equal(s1.board.length, 4); assert.equal(s1.tray.length, 1, "Standard deals one extra card");
  assert.deepEqual(await boardWords(page), dealtWords(b1, 1), "the dealt cards are board 1's answer cards plus its first extra");
  await shot(page, "u02-board-1");

  await nudgeWrong(page, asView(b1));
  await submit(page);
  assert.equal(await lives(page), 2, "a wrong guess costs a life");
  const before = await readBoard(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
  assert.equal(await lives(page), 2, "the life stays lost after a refresh");
  assert.deepEqual((await readBoard(page)).board.map((c) => c.words), before.board.map((c) => c.words), "the board comes back as it was");
  await assertDailyIntact(page, "after resume");
  log("puzzle 1: wrong guess, refresh resumes");

  await solveAndFinish(page, b1);
  assert.equal(await page.$$eval(".ctile.locked", (l) => l.length), 4, "all four cards locked");
  await shot(page, "u03-solved-1");

  // Why these clues
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]");
  const items = await page.$$eval("[data-testid=ul-why-item]", (els) => els.map((e) => e.innerText));
  assert.equal(items.length, 4, "four clue explanations");
  b1.reveal.forEach((r, i) => {
    assert.ok(items[i].includes(r.clue) && items[i].includes(r.wordA) && items[i].includes(r.wordB), `entry ${i} names ${r.clue}, ${r.wordA}, ${r.wordB}`);
    assert.ok(items[i].includes(r.wordAConnection) && items[i].includes(r.wordBConnection), `entry ${i} explains both sides`);
  });
  assert.ok((await text(page)).includes("Solved on Standard"), "the result line");
  await page.locator("[data-testid=ul-why-item] >>> button::-p-text(Confusing)").click();
  // Type a note and Copy straight away: no waiting for any debounce.
  const NOTE1 = "Nearly put the extra card top-left.";
  await page.locator("#ul-note").fill(NOTE1);
  await page.locator("[data-testid=ul-why-copy]").click();
  await waitText(page, "Copied ✓");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes(`note: ${NOTE1}`), "the copied text already holds the note just typed");
  assert.ok(copied.includes(`clue 1 ${b1.reveal[0].clue}`) && copied.includes("Confusing"), "and the rating");
  let saved = await store(page);
  assert.equal(saved.feedback.length, 2, "a rating and a note are saved");
  assert.deepEqual(saved.feedback.map((f) => f.rating).sort(), ["confusing", "note"]);
  assert.equal(saved.feedback.find((f) => f.rating === "confusing").clue, b1.reveal[0].clue);
  assert.ok((await text(page)).includes("Saved on this device only"), "the sheet says where feedback goes");
  await shot(page, "u04-why-these-clues");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });

  // Refresh → lobby: counts, Copy, Download
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, `1 of ${pool.length}`);
  assert.ok((await text(page)).includes("2 notes"), "two notes counted");
  assert.ok((await text(page)).includes("solved, 1 life used"), "the played list");
  await page.locator("[data-testid=ul-copy]").click();
  await waitText(page, "Copied ✓");
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(NOTE1), "the lobby Copy has the note too");
  await page.locator("[data-testid=ul-download]").click();
  let files = [];
  for (let i = 0; i < 20 && files.length === 0; i++) { await sleep(300); files = fs.readdirSync(downloads).filter((f) => f.endsWith(".json")); }
  assert.equal(files.length, 1, `one downloaded file (${files})`);
  const dl = JSON.parse(fs.readFileSync(path.join(downloads, files[0]), "utf8"));
  assert.equal(dl.feedback.length, 2, "the download holds both notes");
  assert.equal(dl.feedback.find((f) => f.rating === "note").note, NOTE1);
  assert.ok(dl.played[b1.id], "and the played record");
  log("export: Copy and Download ok", files[0]);
  await shot(page, "u05-lobby-after-one");
  await assertDailyIntact(page, "after export");

  // ── 2. Puzzle 2 on Easy: a real loss; note + Next at once ────────────
  await chooseAndPlay(page, "Easy", 2);
  const b2 = pool[1];
  assert.equal((await readBoard(page)).tray.length, 0, "Easy deals no extras");
  assert.deepEqual(await boardWords(page), dealtWords(b2, 0));
  for (let g = 0; g < 3; g++) {
    await nudgeWrong(page, asView(b2));
    await submit(page, g < 2 ? 4600 : 9000);   // the last loss reveals the answer card by card
  }
  assert.equal(await lives(page), 0, "three wrong guesses use every life");
  await page.waitForSelector("[data-testid=ul-end]", { timeout: 25000 }); await sleep(800);
  const revealed = await readBoard(page);
  const want2 = b2.solution.slotCards.map((id, i) => [0, 1, 2, 3].map((e) => b2.cards[id].words[(e - b2.solution.orientations[i] + 4) % 4]));
  const DOM_TO_SLOT = [0, 1, 3, 2];
  revealed.board.forEach((c, dom) => assert.deepEqual(c.words, want2[DOM_TO_SLOT[dom]], `slot ${DOM_TO_SLOT[dom]} shows the answer after the loss`));
  await shot(page, "u06-lost-2");
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]");
  assert.ok((await text(page)).includes("Not solved on Easy"), "the sheet says it was not solved");
  assert.equal((await page.$$("[data-testid=ul-why-item]")).length, 4);
  await page.locator("[data-testid=ul-why-item]:nth-child(2) >>> button::-p-text(Two answers fit)").click();
  await shot(page, "u07-why-after-loss");
  const NOTE2 = "Second clue read two ways.";
  await page.locator("#ul-note").fill(NOTE2);
  await page.locator("[data-testid=ul-why-next]").click();   // straight away: the sheet unmounts
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  saved = await store(page);
  assert.equal(saved.played[b2.id].outcome, "lost");
  assert.equal(saved.feedback.find((f) => f.puzzleId === b2.id && f.position === 1).rating, "two_fit");
  assert.equal(saved.feedback.find((f) => f.puzzleId === b2.id && f.position === null)?.note, NOTE2, "the note typed right before Next is kept");
  await assertDailyIntact(page, "after the loss");
  log("puzzle 2: lost on Easy, answer revealed, explanations shown, note kept through Next");

  // ── 3. Puzzle 3 on Easy (Next keeps the difficulty); leave; Continue ─
  await waitText(page, `Puzzle 3 of ${pool.length} · Easy`);
  assert.equal(await lives(page), 3, "a fresh game");
  const b3 = pool[2];
  await nudgeWrong(page, asView(b3));
  await submit(page);
  assert.equal(await lives(page), 2);
  await page.locator(".fr-playbar .fr-back").click();
  await waitText(page, "Puzzle 3 is in progress on Easy");
  await shot(page, "u08-lobby-continue");
  await page.locator("[data-testid=ul-continue]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(700);
  assert.equal(await lives(page), 2, "continued with the life still lost");
  await solveAndFinish(page, b3);
  log("puzzle 3: next, leave, continue, solve");

  // ── 4. Expert and Hardcore ────────────────────────────────────────────
  await page.locator(".fr-playbar .fr-back").click();
  await waitText(page, `3 of ${pool.length}`);
  await chooseAndPlay(page, "Expert", 4);
  const b4 = pool[3];
  assert.equal((await readBoard(page)).tray.length, 2, "Expert deals two extras");
  assert.deepEqual(await boardWords(page), dealtWords(b4, 2));
  await solveAndFinish(page, b4);
  await shot(page, "u09-solved-expert");
  await page.locator(".fr-playbar .fr-back").click();
  await waitText(page, `4 of ${pool.length}`);
  await chooseAndPlay(page, "Hardcore", 5);
  const b5 = pool[4];
  assert.equal((await readBoard(page)).tray.length, 3, "Hardcore deals three extras");
  assert.deepEqual(await boardWords(page), dealtWords(b5, 3));
  await shot(page, "u10-board-hardcore");
  await solveAndFinish(page, b5);
  const after = await store(page);
  assert.equal(Object.keys(after.played).length, 5);
  assert.deepEqual([b1, b2, b3, b4, b5].map((b) => after.played[b.id].difficulty), ["standard", "easy", "easy", "expert", "hardcore"]);
  await page.locator("[data-testid=ul-next]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 6 of ${pool.length} · Hardcore`);
  assert.equal((await store(page)).current.id, pool[5].id);
  await shot(page, "u11-puzzle-6");

  // ── 5. Desktop width: resume 6, play out 7 and 8, exhaustion, Replay ──
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
  // Opening /unlimited with a game in progress resumes it straight away.
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 6 of ${pool.length}`);
  await shot(page, "d02-board-desktop");
  await solveAndFinish(page, pool[5]);
  await shot(page, "d03-solved-desktop");
  await page.locator("[data-testid=ul-why]").click();
  await page.waitForSelector("[data-testid=ul-why-item]"); await sleep(300);
  await shot(page, "d04-why-desktop");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
  await page.locator(".fr-playbar .fr-back").click();
  await waitText(page, `6 of ${pool.length}`);
  await shot(page, "d01-lobby-desktop");
  await chooseAndPlay(page, "Standard", 7);
  await solveAndFinish(page, pool[6]);
  assert.ok(await page.$("[data-testid=ul-next]"), "puzzle 8 is still to come");
  await page.locator("[data-testid=ul-next]").click();
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 8 of ${pool.length} · Standard`);
  await solveAndFinish(page, pool[7]);
  assert.equal(await page.$("[data-testid=ul-next]"), null, "no Next puzzle after the last board");
  assert.ok(await page.$("[data-testid=ul-back]"), "Back to Unlimited instead");
  await page.locator("[data-testid=ul-back]").click();
  await waitText(page, `played all ${pool.length} beta puzzles on this device`);
  assert.equal(await page.$("[data-testid=ul-start]"), null, "nothing new to play");
  assert.equal((await page.$$("button::-p-text(Replay)")).length, pool.length, "a Replay for every puzzle");
  await shot(page, "d05-lobby-exhausted");
  log("all eight played: exhaustion message, Replay offered");

  // Replay the lost puzzle 2: counted as a replay, the loss stays.
  const clicked = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".ul-played-row")].find((r) => /^Puzzle 2\b/.test(r.textContent.trim()));
    const btn = row && [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Replay");
    if (btn) btn.click();
    return !!btn;
  });
  assert.ok(clicked, "puzzle 2's Replay button");
  await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
  await waitText(page, `Puzzle 2 of ${pool.length} · Standard · replay`);
  assert.equal(await lives(page), 3, "a replay starts fresh");
  assert.equal((await store(page)).current.replay, true);
  await shot(page, "d06-replay-board");
  await solveAndFinish(page, b2);
  assert.equal(await page.$("[data-testid=ul-next]"), null, "a replay offers no Next");
  const fin = await store(page);
  assert.equal(fin.played[b2.id].outcome, "lost", "the first result is never overwritten");
  assert.equal(fin.played[b2.id].replays, 1);
  assert.equal(fin.played[b2.id].lastReplay.outcome, "won");
  assert.equal(fin.current, null);
  await page.locator("[data-testid=ul-back]").click();
  await waitText(page, "replayed 1×");
  await waitText(page, `played all ${pool.length}`);
  await shot(page, "d07-lobby-after-replay");
  log("replay: counted once, loss kept, lobby shows it");

  await assertDailyIntact(page, "at the end");
  assert.deepEqual(errors, [], "no page or console errors");
  console.log(`\nPASS — Unlimited guest beta: lobby, Standard win, resume, why-these-clues, note+Copy at once, Download, Easy loss with reveal, note+Next at once, leave/Continue, Expert, Hardcore, desktop, all ${pool.length} played, exhaustion, Replay; seeded Daily storage byte-identical`);
} finally {
  await browser.close();
  fs.rmSync(downloads, { recursive: true, force: true });
}
