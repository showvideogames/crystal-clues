// Unlimited when browser storage is full, unreadable or blocked, in a real
// browser at phone width against the local dev server. A forced failure:
// localStorage.setItem throws QuotaExceededError (the real "storage full" error)
// while the test flag is set. Checks:
//   A. Full: a guest with saved history plays a random puzzle. The save fails, so
//      the game screen, the lobby and "Why these clues" say plainly that nothing
//      is being kept and a refresh will lose this puzzle. Play continues (wrong
//      guess, solve, note + Copy, Next). The saved history is byte-identical
//      throughout. After a refresh the old history is all there and nothing
//      offers to resume the unsaved puzzle. When storage frees up, saving resumes
//      and the new record is added on top of the untouched old ones.
//   B. Unreadable (data from a newer version): the lobby and game say so, play
//      works, and the saved value is never written over (checked after a refresh).
//   C. Blocked (every storage call throws): /unlimited loads, says it isn't
//      saving, and a game can be played.
//   FRIENDS_E2E_URL=http://127.0.0.1:5192 node tests/unlimited/storage-failure.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { CHROME } from "../friends/browser.mjs";
import { solve, nudgeWrong } from "../friends/board.mjs";

const URL = process.env.FRIENDS_E2E_URL || "http://127.0.0.1:5192";
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const KEY = "cv_unlimited_v1";
const FLAG = "__cv_test_fail_saves";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const raw = (page) => page.evaluate((k) => { try { return localStorage.getItem(k); } catch { return "<blocked>"; } }, KEY);
const notice = (page) => page.$eval("[data-testid=ul-save-notice]", (e) => e.textContent).catch(() => null);
const chipId = (page) => page.$eval("[data-testid=ul-chip]", (e) => e.dataset.boardId);
const shot = async (page, name, tag) => { if (!OUT) return;
  await page.evaluate((t) => { const d = document.createElement("div"); d.id = "__test_label"; d.textContent = `TEST DATA / FORCED STORAGE FAILURE · ${t}`;
    Object.assign(d.style, { position: "fixed", left: "0", right: "0", top: "0", zIndex: "99999", background: "rgba(180,0,0,0.88)", color: "#fff", font: "600 12px/1.6 system-ui, sans-serif", textAlign: "center", pointerEvents: "none", padding: "2px 4px" }); document.body.appendChild(d); }, tag);
  await sleep(300); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); await page.evaluate(() => document.getElementById("__test_label")?.remove()); log("screenshot", name); };
// Forced failure: while the flag key is "1", every other localStorage.setItem throws
// QuotaExceededError. Each attempted Unlimited save is also kept in memory
// (window.__ulLastAttempt) so the test can solve the board it never managed to save.
const failPolicy = (flagKey) => {
  const realSet = Storage.prototype.setItem;
  const realGet = Storage.prototype.getItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === flagKey) return realSet.call(this, k, v);
    if (k === "cv_unlimited_v1") { try { const s = JSON.parse(v); window.__ulLastAttempt = s; } catch { /* ignore */ } }
    if (realGet.call(this, flagKey) === "1") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    return realSet.call(this, k, v);
  };
};
const boardOf = (page) => page.evaluate(() => { const s = window.__ulLastAttempt; return s && s.current ? s.boards[s.current.id] || null : null; });
const asView = (b) => ({ cards: b.cards, solution: b.solution });
const finish = async (page, b) => { await solve(page, asView(b)); await page.locator("button.sbtn").click(); await page.waitForSelector("[data-testid=ul-end]", { timeout: 20000 }); await sleep(600); };

const SEED = { version: 1, played: Object.fromEntries(["001", "002", "003"].map((n, i) => [`beta-01-${n}`, { outcome: "won", livesUsed: i, difficulty: "standard", finishedAt: `2026-10-17T20:0${i}:00.000Z`, version: 1, replays: 0 }])),
  current: null, feedback: [{ at: "2026-10-17T20:05:00.000Z", puzzleId: "beta-01-002", version: 1, position: 1, clue: "X", pair: "x", rating: "great", difficulty: "standard", outcome: "won", livesUsed: 1 }], boards: {} };
const SEED_RAW = JSON.stringify(SEED);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
try {
  // ── A. Storage full ──────────────────────────────────────────────
  {
    const ctx = await browser.createBrowserContext();
    await ctx.overridePermissions(URL, ["clipboard-read", "clipboard-write"]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`A: ${e.message}`));
    await page.evaluateOnNewDocument(failPolicy, FLAG);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(URL, { waitUntil: "networkidle0" });
    await page.evaluate((k, v) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem(k, v); }, KEY, SEED_RAW);
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await waitText(page, "3 puzzles played");
    assert.equal(await notice(page), null, "no warning while saving works");
    await page.evaluate((f) => localStorage.setItem(f, "1"), FLAG);   // storage is now "full"
    await page.locator(".lobby-diff-opt::-p-text(Standard)").click();
    await page.locator("[data-testid=ul-start]").click();
    await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    const n1 = await notice(page);
    assert.ok(n1 && n1.includes("isn't saving") && n1.includes("won't be kept if you refresh"), `the game screen says the puzzle isn't being kept: ${n1}`);
    assert.equal(await raw(page), SEED_RAW, "the saved history is untouched");
    await shot(page, "a1-game-not-saving", "storage full: game screen");
    const b1 = await boardOf(page); assert.ok(b1, "the board is held in memory");
    await nudgeWrong(page, asView(b1)); await page.locator("button.sbtn").click(); await sleep(4600);
    assert.equal(await lives(page), 2, "play continues: a wrong guess costs a life");
    await finish(page, b1);
    await page.locator("[data-testid=ul-why]").click(); await page.waitForSelector("[data-testid=ul-why-item]");
    assert.ok((await page.$eval("[data-testid=ul-saved-note]", (e) => e.textContent)).startsWith("Not saved"), "the reveal sheet does not claim the notes are saved");
    await page.locator("#ul-note").fill("written while storage was full");
    await page.locator("[data-testid=ul-why-copy]").click(); await waitText(page, "Copied ✓");
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("written while storage was full"), "Copy still keeps the feedback");
    await shot(page, "a2-why-not-saved", "storage full: reveal sheet");
    await page.keyboard.press("Escape"); await page.waitForSelector("[data-testid=ul-why-item]", { hidden: true });
    await page.locator("[data-testid=ul-next]").click(); await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    const b2id = await chipId(page); assert.notEqual(b2id, b1.id, "Next still gives a new board");
    await page.locator(".fr-back").click(); await page.waitForSelector("[data-testid=ul-continue]");
    assert.ok((await notice(page))?.includes("won't be kept"), "the lobby repeats the warning next to Continue");
    await shot(page, "a3-lobby-not-saving", "storage full: lobby");
    assert.equal(await raw(page), SEED_RAW, "still untouched after a finished game, a note and Next");
    // Refresh: the unsaved puzzle is gone (as warned), the old history is all there.
    await page.reload({ waitUntil: "networkidle0" });
    await waitText(page, "3 puzzles played");
    assert.equal(await page.$("[data-testid=ul-continue]"), null, "nothing offers to resume the unsaved puzzle");
    assert.equal((await page.$$("[data-testid=ul-played-row]")).length, 3, "the three saved games are listed");
    // Storage frees up: saving resumes, the new game is added on top of the old records.
    await page.evaluate((f) => localStorage.removeItem(f), FLAG);
    await page.locator("[data-testid=ul-start]").click(); await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    assert.equal(await notice(page), null, "the warning clears once saving works");
    const after = JSON.parse(await raw(page));
    assert.deepEqual(after.played, SEED.played, "old records unchanged");
    assert.deepEqual(after.feedback, SEED.feedback, "old feedback unchanged");
    assert.ok(after.current && after.boards[after.current.id], "the new game is saved");
    log("A. storage full: warned on game, reveal and lobby; play, Copy and Next work; saved history byte-identical; no false resume; saving resumes cleanly");
    await ctx.close();
  }
  // ── B. Unreadable saved data (newer version) ──────────────────────
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`B: ${e.message}`));
    await page.evaluateOnNewDocument(failPolicy, FLAG);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0" });
    const FUTURE = JSON.stringify({ version: 2, played: { "r-future": { outcome: "won" } }, boards: { "r-future": {} } });
    await page.evaluate((k, v) => { localStorage.setItem("clover_tutorial_seen", "true"); localStorage.setItem(k, v); }, KEY, FUTURE);
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await page.waitForSelector("[data-testid=ul-save-notice]");
    assert.ok((await notice(page)).includes("couldn't be read"), "the lobby says the saved games couldn't be read");
    await shot(page, "b1-unreadable", "unreadable saved data: lobby");
    await page.locator("[data-testid=ul-start]").click(); await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    await page.locator("button.sbtn").click(); await sleep(4600);   // the deal is never solved: a wrong guess
    assert.equal(await lives(page), 2, "play works with unreadable saved data");
    assert.ok((await notice(page)).includes("couldn't be read"), "the game screen repeats the warning");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("[data-testid=ul-save-notice]");
    assert.equal(await raw(page), FUTURE, "the unreadable saved data is never written over");
    log("B. unreadable data: warned, playable, never overwritten");
    await ctx.close();
  }
  // ── C. Storage blocked entirely ───────────────────────────────────
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`C: ${e.message}`));
    await page.evaluateOnNewDocument(() => {
      const deny = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
      for (const m of ["getItem", "setItem", "removeItem", "key", "clear"]) Storage.prototype[m] = deny;
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(`${URL}/unlimited`, { waitUntil: "networkidle0" });
    await page.waitForSelector("[data-testid=ul-save-notice]", { timeout: 15000 });
    assert.ok((await notice(page)).includes("isn't saving"), "the lobby says it isn't saving");
    await shot(page, "c1-blocked", "storage blocked: lobby");
    await page.locator("[data-testid=ul-start]").click(); await page.waitForSelector(".game .csurface .ctile"); await sleep(900);
    assert.ok((await notice(page)).includes("won't be kept"), "and the game screen too");
    // The deal never starts solved, so submitting it as dealt is a wrong guess.
    await page.locator("button.sbtn").click(); await sleep(4600);
    assert.equal(await lives(page), 2, "play works with storage blocked: a wrong guess costs a life");
    log("C. blocked: warned on lobby and game; play works (no crash, no page errors)");
    await ctx.close();
  }
  assert.deepEqual(errors, [], "no page errors");
  console.log("\nPASS — storage full / unreadable / blocked: the player is told, play continues, saved history is never lost or overwritten, no false resume");
} finally {
  await browser.close();
}
