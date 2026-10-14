// The front page, the daily screen and the results, in a real browser against
// the local stack (npm run db:start) and the friends dev server. A local
// puzzle dated today is added for the run if the stack has none:
//   guest: home → setup → play → leave → Continue → refresh → win with 2 lives
//   on Standard → results → View Board → reopen → refresh → home → Archive →
//   today's cell → logo; Share; a practice replay; a loss on an archive
//   puzzle; and that none of the looking ever changes the stats.
//   signed in: Friends "puzzles waiting" from the real inbox, and "Everyone
//   on this puzzle" counting only the same puzzle at the same difficulty.
//   FRIENDS_E2E_URL=http://127.0.0.1:5191 node tests/home/home-results.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME, signInBrowser } from "../friends/browser.mjs";
import { solve, nudgeWrong, readBoard } from "../friends/board.mjs";
import { befriend, makePlayer, rpc, sendPuzzle } from "../friends/helpers.mjs";
import { sql } from "../db/helpers.mjs";
import { dailyNumber as dailyNumberOf } from "../../src/game/dailyNumber.js";

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// "Today" as the app sees it: the player's local date (the database's current_date is UTC).
const LOCAL_TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const log = (...a) => console.log("•", ...a);
const at = (page) => new URL(page.url()).pathname;
const waitPath = (page, p) => page.waitForFunction((x) => location.pathname === x, { timeout: 15000 }, p);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const text = (page) => page.evaluate(() => document.body.innerText);
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };

// The local puzzles (supabase/seed.sql): answer c1..c4, unturned.
const CARDS = {
  c1: { words: ["BLAZE", "RIVER", "CAVE", "WOLF"] }, c2: { words: ["EMBER", "PEAK", "STORM", "RIVER"] },
  c3: { words: ["CLIFF", "TOWER", "OCEAN", "BOULDER"] }, c4: { words: ["THUNDER", "BUSH", "SKY", "STORM"] },
};
const VIEW = { cards: CARDS, solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 0, 0, 0] } };
let TODAY = sql(`select id from public.puzzles where date = '${LOCAL_TODAY}' and status = 'published' limit 1`);
const ADDED_TODAY = !TODAY;
if (ADDED_TODAY) {
  TODAY = "1700000000100";
  sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
       select ${TODAY}, '${LOCAL_TODAY}', 'Local Today', 'Local sample', 'standard', 'published', clues, cards, solution
       from public.puzzles where id = 1700000000000 on conflict (id) do nothing`);
}
const PAST = sql(`select id from public.puzzles where date < '${LOCAL_TODAY}' and status = 'published' order by date desc`).split("\n");
assert.ok(PAST.length >= 2, "two past local puzzles");

// A stubbed answer from the (cross-origin) database must still pass CORS.
const CORS = { "Access-Control-Allow-Origin": "*" };
// A puzzle's daily number, from its date, by the app's own helper.
const dailyNumber = (id) => dailyNumberOf(sql(`select date from public.puzzles where id = ${id}`));
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const extras = (page) => page.$$eval(".eslots .eslot", (l) => l.length);
const history = (page) => page.evaluate(() => ({
  stats: localStorage.getItem("clover_stats"),
  done: localStorage.getItem("clover_completions"),
  finals: Object.keys(localStorage).filter((k) => k.startsWith("clover_final_")).map((k) => localStorage.getItem(k)).join("|"),
}));
async function submit(page) {
  await page.locator("button.sbtn").click();
  await sleep(1700);
}
async function wrongGuess(page) {
  const before = await lives(page);
  await nudgeWrong(page, VIEW);
  await submit(page);
  await page.waitForFunction((n) => document.querySelectorAll(".game-lives .life:not(.lost)").length === n - 1, { timeout: 8000 }, before);
  await sleep(2600);   // the red cards settle
}
const resultsDialog = (page) => page.waitForSelector(".rs-card[role=dialog]", { timeout: 15000 });
const closeResults = async (page) => { await page.locator(".rs-close").click(); await page.waitForFunction(() => !document.querySelector(".rs-card")); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  // ════════════════════════ Guest ════════════════════════
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // Share copies through the Clipboard API; keep what it was given.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
    // The archive must never flash the admin's empty message.
    new MutationObserver(() => {
      if (document.body?.innerText.includes("Publish puzzles")) window.__adminCopy = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(APP_URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("clover_tutorial_seen", "true"); });
  await page.reload({ waitUntil: "networkidle0" });

  // 1. First visit: two equal choices, Friends under them, Archive / How to Play.
  await waitText(page, "Play Today's Puzzle");
  const home = await text(page);
  for (const t of ["Make a Friend a Puzzle", "Your Friends", "Trade puzzles with friends", "Archive", "How to Play"]) assert.ok(home.includes(t), `home shows ${t}`);
  assert.ok(!/puzzles? waiting/.test(home), "no count for a guest");
  const [h1, h2] = await page.$$eval(".hm-main .hm-action", (b) => b.map((x) => x.getBoundingClientRect().height));
  assert.equal(Math.round(h1), Math.round(h2), "the two main actions are the same size");
  assert.equal(await page.$("button.cbtn::-p-text(Reset)"), null);
  await shot(page, "01-home-new");
  log("home: first visit");

  // 2. Play → the existing setup; Standard is chosen; Start.
  await page.locator("[data-testid=home-daily]").click();
  await waitPath(page, "/today");
  await page.waitForSelector(".lobby-start");
  assert.equal(await page.$eval(".lobby-diff-opt.active .lobby-diff-name", (e) => e.textContent), "Standard");
  await page.locator(".lobby-start").click();
  await page.waitForSelector(".csurface .ctile");
  await sleep(900);
  assert.equal(await lives(page), 3);
  assert.equal(await extras(page), 1, "Standard deals one extra card");
  assert.equal(await page.$("button.cbtn::-p-text(Reset)"), null, "no Reset in the daily game");
  assert.ok(await page.$("button.cbtn::-p-text(Rotate)") && await page.$("button.cbtn::-p-text(Shuffle)"));

  // 3. One wrong guess, then leave: the front page offers to continue.
  await wrongGuess(page);
  assert.equal(await lives(page), 2);
  await page.locator(".logo-link").click();
  await waitPath(page, "/");
  await waitText(page, "Continue Today's Puzzle");
  { const t = await text(page); assert.ok(t.includes("Standard · 1 life used so far"), t); }
  // A new preference (Settings, outside a game) doesn't change the game in progress.
  await page.locator("button[aria-label=Settings]").click();
  await page.locator(".diff-opt::-p-text(Expert)").click();
  await sleep(300);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("clover_difficulty"))), "expert");
  await shot(page, "02-home-continue");
  await page.locator("[data-testid=home-daily]").click();
  await page.waitForSelector(".csurface .ctile");
  await sleep(500);
  assert.equal(await lives(page), 2, "continued with its lives");
  assert.equal(await extras(page), 1, "continued at Standard, not the new Expert preference");
  assert.equal(await page.$eval(".game-diff", (e) => e.textContent), "Standard");
  // 4. Refresh mid-game resumes.
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".csurface .ctile");
  await sleep(500);
  assert.equal(await lives(page), 2, "refresh resumes");
  assert.equal(await extras(page), 1);
  log("unfinished: Continue, preference kept apart, refresh resumes");

  // 5. A second wrong guess, then the win: 2 lives used on Standard.
  await wrongGuess(page);
  await solve(page, VIEW);
  await page.locator("button.sbtn").click();
  await resultsDialog(page);
  // The summary: the real daily number, the difficulty, the headline and lives.
  await page.waitForFunction((n) => document.querySelector(".rs-kicker")?.textContent === `Daily #${n} · Standard`, { timeout: 8000 }, dailyNumber(TODAY));
  const r1 = await page.$eval(".rs-card", (e) => e.innerText);
  assert.ok(r1.includes("Just in time!") && r1.includes("Solved with 2 lives lost"), "the result: solved, 2 lives lost");
  assert.equal(await page.$eval(".rs-stars", (e) => e.getAttribute("aria-label")), "1 of 3 lives left");
  // My stats is the default tab.
  assert.equal(await page.$eval(".rs-tab[aria-selected=true]", (e) => e.textContent), "My stats");
  const figs1 = await page.$$eval(".rs-fig", (f) => f.map((x) => [x.querySelector("dt").textContent, x.querySelector("dd").textContent]));
  assert.deepEqual(figs1, [["Played", "1"], ["Win %", "100%"], ["Current streak", "1"], ["Best streak", "1"]]);
  assert.ok(r1.includes("Not solved") && /LIVES USED/i.test(r1), "labelled chart");
  assert.ok(!/\bX\b/.test(r1), "no unexplained X");
  // Zero rows draw no bar; your row is the purple one.
  const rows1 = await page.$$eval(".rs-row", (rows) => rows.map((r) => [r.querySelector(".rs-row-key").textContent, !!r.querySelector(".rs-row-bar"), r.classList.contains("mine")]));
  assert.deepEqual(rows1, [["0", false, false], ["1", false, false], ["2", true, true], ["Not solved", false, false]]);
  const after = await history(page);
  const stats = JSON.parse(after.stats);
  assert.deepEqual([stats.totalPlayed, stats.totalWon, stats.livesUsedDist["2"]], [1, 1, 1], "one win counted, in the 2-lives row");
  await shot(page, "03-results-win");
  // This puzzle: the same puzzle at Standard, as the database has it (signed-in players).
  await page.locator(".rs-tab::-p-text(This puzzle)").click();
  const others = Number(sql(`select count(*) from public.plays where puzzle_id = ${TODAY} and difficulty = 'standard'`));
  await page.waitForSelector(others ? ".rs-figs.n3" : ".rs-panel .rs-state:not([role=status])");
  const p1 = await page.$eval(".rs-panel", (e) => e.innerText);
  assert.ok(p1.includes("Standard difficulty"), "the tab names its difficulty");
  if (others) assert.equal(await page.$eval(".rs-figs.n3 dd", (e) => e.textContent), String(others), "the real player count");
  else assert.ok(p1.includes("No signed-in player has finished this puzzle on Standard yet."), "honest empty state");
  assert.ok(p1.includes("Guest results aren't stored"), "a guest is told their result isn't counted");
  assert.deepEqual(await history(page), after, "switching tabs changes nothing");
  await shot(page, "03b-results-this-puzzle");
  await page.locator(".rs-tab::-p-text(My stats)").click();
  // Share: Daily #N, one sparkle for Standard, a block per guess (3 guesses), the site.
  await page.locator(".rs-share").click();
  await waitText(page, "Copied");
  const copied = (await page.evaluate(() => window.__copied)).split("\n");
  assert.equal(copied[0], `Daily #${dailyNumber(TODAY)} ✨`, `share head: ${copied[0]}`);
  assert.equal(copied.length, 4);
  assert.equal(copied[1].split(" ").length, 3, "three guesses, three blocks");
  assert.ok(/^[🔮⚫ ]+$/u.test(copied[1] + copied[2]));
  assert.equal(copied[3], "Cluevoyance.com");
  log("won with 2 lives used; both tabs; share ok");

  // 6. View Board: the board as it ended, and the way back to the results.
  await page.locator(".rs-link::-p-text(View board)").click();
  await page.waitForFunction(() => !document.querySelector(".rs-card"));
  assert.equal(await lives(page), 1);
  assert.equal(await extras(page), 1);
  assert.ok(await page.$("[data-testid=view-results]"), "View Results on the finished board");
  assert.equal(await page.$("button.sbtn"), null, "no spent Submit");
  await shot(page, "04-board-finished");
  await page.locator("[data-testid=view-results]").click();
  await resultsDialog(page);
  await closeResults(page);
  await page.keyboard.press("Escape");
  assert.deepEqual(await history(page), after, "reopening and closing changes nothing");

  // 7. Refresh: the same finished round (1 life left, 1 extra card), not Admire with 3 and 3.
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("[data-testid=view-results]");
  assert.equal(await lives(page), 1, "refresh shows the round's own lives");
  assert.equal(await extras(page), 1, "and its own extra card");
  assert.ok((await readBoard(page)).board.every((c) => c.locked), "the answer, locked");
  assert.deepEqual(await history(page), after);
  log("View Board / refresh show the real round");

  // A puzzle backdated into the archive (and one retired) renumbers nothing.
  const todayNo = dailyNumber(TODAY);
  sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
       select 1700000000990, ('${LOCAL_TODAY}'::date - 40)::text, 'Backdated', 'Local sample', 'standard', 'published', clues, cards, solution
       from public.puzzles where id = ${TODAY} on conflict (id) do nothing`);
  sql(`update public.puzzles set status = 'unused' where id = ${PAST[PAST.length - 1]}`);

  // 8. Home: View Today's Results opens them over the board.
  await page.locator(".logo-link").click();
  await waitText(page, "View Today's Results");
  assert.ok((await text(page)).includes("Solved on Standard · 2 lives used"));
  await shot(page, "05-home-done");
  await page.locator("[data-testid=home-daily]").click();
  await resultsDialog(page);
  assert.equal(at(page), "/today");
  assert.equal(await page.$eval(".rs-kicker", (e) => e.textContent), `Daily #${todayNo} · Standard`, "same number after a backdate and a retirement");
  await page.locator(".rs-share").click();
  await waitText(page, "Copied");
  assert.equal((await page.evaluate(() => window.__copied)).split("\n")[0], `Daily #${todayNo} ✨`, "share and results agree");
  sql("delete from public.puzzles where id = 1700000000990");
  sql(`update public.puzzles set status = 'published' where id = ${PAST[PAST.length - 1]}`);
  // A short phone: the result and Share show at once; the stats scroll under a Close that stays put.
  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2 });
  await sleep(300);
  const inView = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  assert.ok(await inView(".rs-share"), "Share without scrolling on a short phone");
  await page.$eval(".rs-body", (b) => { b.scrollTop = b.scrollHeight; });
  await sleep(200);
  assert.ok(await inView(".rs-close"), "Close stays in reach while the stats scroll");
  assert.ok(await inView(".rs-foot"), "the footer is reachable");
  assert.ok(await page.$eval(".rs-close", (e) => e.getBoundingClientRect().height >= 44), "a full-size touch target");
  await shot(page, "05b-results-320-scrolled");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await closeResults(page);
  assert.ok(await page.$("[data-testid=view-results]"));

  // 9. Header Stats, from anywhere.
  await page.locator(".logo-link").click();
  await waitPath(page, "/");
  await page.locator("[data-testid=stats-button]").click();
  await resultsDialog(page);
  const st = await page.$eval(".rs-card", (e) => e.innerText);
  assert.ok(st.includes("Your stats") && st.includes("Played") && st.includes("Next daily in") && !st.includes("This puzzle"));
  assert.equal(await page.$(".rs-row.mine"), null, "no row is 'yours' outside a result");
  await shot(page, "06-stats");
  await closeResults(page);
  assert.deepEqual(await history(page), after);
  log("home result link and header Stats");

  // 10. Archive: a loading state (never the admin's message), then today's
  // cell opens today's finished round; the logo then really goes home.
  await page.setRequestInterception(true);
  const slow = (req) => {
    if (req.url().includes("/rest/v1/puzzles?order=")) setTimeout(() => req.continue(), 1200);
    else req.continue();
  };
  page.on("request", slow);
  await page.locator("button[aria-label=Archive]").click();
  await waitText(page, "Loading past puzzles");
  await page.waitForSelector(".arch-grid");
  page.off("request", slow);
  await page.setRequestInterception(false);
  assert.equal(await page.evaluate(() => !!window.__adminCopy), false, "no 'Publish puzzles in Admin'");
  await page.locator(".arch-day.today").click();
  await waitPath(page, "/today");
  await page.waitForSelector("[data-testid=view-results]");
  assert.equal(await page.$("button.sbtn"), null, "not a fresh playable board");
  assert.equal(await lives(page), 1);
  await page.locator(".logo-link").click();
  await waitPath(page, "/");
  await page.waitForSelector(".hm");
  assert.equal(await page.$(".game"), null, "the board is gone at /");
  // The old address of today's puzzle goes to the daily screen too.
  await page.goto(`${APP_URL}/archive/${TODAY}`, { waitUntil: "networkidle0" });
  await waitPath(page, "/today");
  await page.waitForSelector("[data-testid=view-results]");
  log("archive: loading state; today's cell and /archive/<today> open the finished round; logo goes home");

  // 11. A practice replay: marked, full lives, records nothing.
  await page.locator("[data-testid=practice]").click();
  await page.waitForSelector(".practice-banner");
  await sleep(800);
  assert.equal(await lives(page), 3);
  assert.equal(await extras(page), 1, "practice at the round's difficulty");
  await shot(page, "07-practice");
  await solve(page, VIEW);
  await page.locator("button.sbtn").click();
  await page.waitForSelector("[data-testid=view-results]", { timeout: 15000 });
  await sleep(1200);
  assert.equal(await page.$(".rs-card"), null, "a practice finish doesn't pop the results");
  assert.deepEqual(await history(page), after, "practice changed no stats, result or board");
  await page.locator(".practice-banner button").click();
  await page.waitForFunction(() => !document.querySelector(".practice-banner"));
  assert.equal(await lives(page), 1, "back to the real result");
  log("practice replay recorded nothing");

  // 12. A loss, on an archive puzzle, at the Expert preference.
  const lostId = PAST[1];
  await page.goto(`${APP_URL}/archive/${lostId}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".csurface .ctile");
  await sleep(900);
  assert.equal(await extras(page), 2, "Expert");
  await wrongGuess(page);
  await wrongGuess(page);
  await nudgeWrong(page, VIEW);
  await submit(page);
  await resultsDialog(page);
  await page.waitForFunction((n) => document.querySelector(".rs-kicker")?.textContent === `Daily #${n} · Expert`, { timeout: 8000 }, dailyNumber(lostId));
  const r2 = await page.$eval(".rs-card", (e) => e.innerText);
  assert.ok(r2.includes("Not this time") && r2.includes("All 3 lives used"));
  assert.equal(await page.$eval(".rs-stars", (e) => e.getAttribute("aria-label")), "0 of 3 lives left");
  assert.equal(await page.$eval(".rs-row.mine .rs-row-key", (e) => e.textContent), "Not solved", "your row: Not solved");
  const lost = JSON.parse((await history(page)).stats);
  assert.deepEqual([lost.totalPlayed, lost.totalWon, lost.livesUsedDist["2"], lost.livesUsedDist.X], [2, 1, 1, 1]);
  // 2 lives and Not solved both hold 1: equal bars, though one carries the You marker.
  const widths = await page.$$eval(".rs-row-bar", (b) => b.map((x) => Math.round(x.getBoundingClientRect().width)));
  assert.equal(widths.length, 2);
  assert.equal(widths[0], widths[1], `equal counts, equal bars: ${widths}`);
  assert.ok(await page.$eval(".rs-row.mine .rs-row-you", (e) => e.textContent === "You"));
  // Expert shares two sparkles, and a loss shares its three guesses.
  await page.locator(".rs-share").click();
  await waitText(page, "Copied");
  const lostShare = (await page.evaluate(() => window.__copied)).split("\n");
  assert.equal(lostShare[0], `Daily #${dailyNumber(lostId)} ✨✨`);
  assert.equal(lostShare[1].split(" ").length, 3);
  await shot(page, "08-results-loss");
  await closeResults(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("[data-testid=view-results]");
  assert.equal(await lives(page), 0);
  assert.equal(await page.$("button.lobby-start"), null);
  assert.deepEqual(JSON.parse((await history(page)).stats), lost, "a refreshed loss isn't a second attempt");
  log("loss recorded once; reopens as finished");

  // 13. Results' error state (the summary call fails), then Try again.
  await page.setRequestInterception(true);
  let failSummary = true;
  const summaryAsks = [];
  const failing = (req) => {
    if (req.method() === "POST" && req.url().includes("rpc/puzzle_result_summary")) summaryAsks.push(JSON.parse(req.postData()));
    if (failSummary && req.method() !== "OPTIONS" && req.url().includes("rpc/puzzle_result_summary")) req.respond({ status: 500, body: "{}", contentType: "application/json", headers: CORS });
    else req.continue();
  };
  page.on("request", failing);
  await page.locator("[data-testid=view-results]").click();
  await page.locator(".rs-tab::-p-text(This puzzle)").click();
  await waitText(page, "Couldn't load other players' results.");
  // An archive puzzle's tab says "Puzzle results", for that puzzle at the difficulty played.
  const archHead = await page.$eval(".rs-panel", (e) => e.innerText);
  assert.ok(/^PUZZLE RESULTS/i.test(archHead) && !/today/i.test(archHead) && archHead.includes("Expert difficulty"), archHead);
  failSummary = false;
  await page.locator(".rs-retry").click();
  // Retried: the counts (or the honest empty state) replace the error.
  await page.waitForFunction(() => !document.querySelector(".rs-state.err")
    && (document.querySelector(".rs-figs.n3") || document.body.innerText.includes("finished this puzzle on Expert yet")));
  // The counts asked for are this archive puzzle's, at Expert.
  assert.ok(summaryAsks.length >= 2 && summaryAsks.every((b) => b.p_puzzle_id === Number(lostId) && b.p_difficulty === "expert"), JSON.stringify(summaryAsks));
  page.off("request", failing);
  await page.setRequestInterception(false);
  await closeResults(page);
  log("summary error state and retry");

  // 14. The archive with nothing published, and with the list failing.
  await page.setRequestInterception(true);
  let archiveReply = { status: 200, body: "[]" };
  const archiveList = (req) => {
    if (req.method() !== "OPTIONS" && req.url().includes("/rest/v1/puzzles?order=")) req.respond({ ...archiveReply, contentType: "application/json", headers: CORS });
    else req.continue();
  };
  page.on("request", archiveList);
  await page.goto(`${APP_URL}/archive`, { waitUntil: "networkidle0" });
  await waitText(page, "No puzzles here yet.");
  archiveReply = { status: 500, body: "{}" };
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "Couldn't load the archive.");
  archiveReply = null;
  page.off("request", archiveList);
  await page.setRequestInterception(false);
  await page.locator(".arch-retry").click();
  await page.waitForSelector(".arch-grid");
  assert.equal(await page.evaluate(() => !!window.__adminCopy), false);
  log("archive empty and error states");
  await ctx.close();

  // ════════════════════════ Signed in ════════════════════════
  const [sam, noah, ava, bo] = await Promise.all(["Sam", "Noah", "Ava", "Bo"].map(makePlayer));
  await sendPuzzle(noah, await befriend(sam, noah));          // one puzzle waiting for Sam
  // A past puzzle of this run's own, so earlier runs' plays don't count.
  const SHARED = String(1700000000950 + Math.floor(Math.random() * 40));
  sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
       select ${SHARED}, ('${LOCAL_TODAY}'::date - 3)::text, 'Shared test', 'Local sample', 'standard', 'published', clues, cards, solution
       from public.puzzles where id = ${PAST[0]} on conflict (id) do nothing`);
  // Other players on the same puzzle: one Hardcore loss, one Easy win (a different game).
  await rpc(ava.client, "record_play", { _puzzle_id: Number(SHARED), _solved: false, _lives_used: 3, _difficulty: "hardcore" });
  await rpc(bo.client, "record_play", { _puzzle_id: Number(SHARED), _solved: true, _lives_used: 0, _difficulty: "easy" });

  const ctx2 = await browser.createBrowserContext();
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p2.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await p2.evaluate(() => { localStorage.clear(); localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem("clover_difficulty", "\"hardcore\""); });
  await signInBrowser(p2, sam, "/");
  await waitText(p2, "1 puzzle waiting");
  await shot(p2, "09-home-signed-in");
  log("signed in: 1 puzzle waiting, from the inbox");

  await p2.goto(`${APP_URL}/archive/${SHARED}`, { waitUntil: "networkidle0" });
  await p2.waitForSelector(".csurface .ctile");
  await sleep(900);
  assert.equal(await extras(p2), 3, "Hardcore");
  await solve(p2, VIEW);
  await p2.locator("button.sbtn").click();
  await resultsDialog(p2);
  assert.ok((await p2.$eval(".rs-card", (e) => e.innerText)).includes("Brilliant!"), "a perfect solve");
  await p2.locator(".rs-tab::-p-text(This puzzle)").click();
  await p2.waitForSelector(".rs-figs.n3");
  const r3 = await p2.$eval(".rs-panel", (e) => e.innerText);
  assert.ok(r3.includes("Hardcore difficulty"), "the comparison names its difficulty");
  const figs = await p2.$$eval(".rs-figs.n3 .rs-fig", (f) => f.map((x) => [x.querySelector("dt").textContent, x.querySelector("dd").textContent]));
  assert.deepEqual(figs, [["Played", "2"], ["Solved", "50%"], ["Perfect", "50%"]], "Sam and Ava on Hardcore; Bo's Easy win not mixed in");
  assert.ok(r3.includes("Your result is highlighted.") && !r3.includes("Guest results"));
  assert.equal(await p2.$eval(".rs-row.mine .rs-row-key", (e) => e.textContent), "0");
  // 0 lives (Sam) and Not solved (Ava) both hold 1: the same length, You or not.
  const w2 = await p2.$$eval(".rs-row-bar", (b) => b.map((x) => Math.round(x.getBoundingClientRect().width)));
  assert.deepEqual([w2.length, w2[0]], [2, w2[1]], `equal counts, equal bars: ${w2}`);
  assert.equal(sql(`select count(*) from public.plays where puzzle_id = ${SHARED} and user_id = '${sam.id}'`), "1");
  await shot(p2, "10-results-signed-in");
  await closeResults(p2);
  await p2.reload({ waitUntil: "networkidle0" });
  await p2.waitForSelector("[data-testid=view-results]");
  assert.equal(sql(`select count(*) from public.plays where puzzle_id = ${SHARED}`), "3", "refresh recorded nothing more");
  log("signed in: aggregates per difficulty, one play recorded");

  // "Make a Friend a Puzzle" goes to the existing creator.
  await p2.locator(".logo-link").click();
  await p2.locator("[data-testid=home-make]").click();
  await waitPath(p2, "/friends/make/new");
  await ctx2.close();
  sql(`delete from public.puzzles where id = ${SHARED}`);

  assert.deepEqual(errors, [], "no page errors");
  console.log("\nAll home & results checks passed.");
} finally {
  await browser.close();
  if (ADDED_TODAY) sql(`delete from public.puzzles where id = ${TODAY}`);
}
