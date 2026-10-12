// The compact Friends list, in a real browser at phone size: every friend on
// one screen, Play / Resume / Watch / Make Puzzle acting directly, details as
// a sheet (by address: Back closes it, refresh keeps it, closing keeps the
// list where it was), nothing marked seen by looking, both directions of a
// friendship independent, the profile and notifications in their new homes,
// and /admin open by address without signing in.
// Needs the local stack and the friends dev server (see e2e.mjs).
//   FRIENDS_E2E_URL=http://127.0.0.1:5188 node tests/friends/compact-hub.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import puppeteer from "puppeteer-core";
import { anon, rpc, makePlayer, sampleBoard, befriend, sendPuzzle, solvedBoard, sendAndStart, guess, choose } from "./helpers.mjs";
import { sql } from "../db/helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";

const OUT = path.resolve(process.argv[2] || "friends-compact-shots");
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const log = (...a) => console.log("•", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const at = (page) => new URL(page.url()).pathname;
const waitPath = (page, p, timeout = 15000) => page.waitForFunction((x) => location.pathname === x, { timeout }, p);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// ── Seed: Sam and five friends, each in a different state ─────────────────
const [sam, noah, deb, jared, levi, ava] = await Promise.all(["Sam", "Noah", "Deb", "Jared", "Levi", "Ava"].map(makePlayer));
await Promise.all([["frog", sam], ["dog", noah], ["star", jared], ["fox", levi]].map(([a, p]) => rpc(p.client, "set_avatar", { p_avatar: a })));
async function solved(creator, solver, fid, prefix) {
  const board = sampleBoard(prefix);
  const pid = await sendAndStart(creator, solver, fid, board, "easy");
  const view = await rpc(creator.client, "open_friend_puzzle", { p_puzzle_id: pid });
  await guess(solver, pid, 1, solvedBoard(view), board.clues);
  return pid;
}
const backdate = (pid, hours) => sql(`update public.friend_puzzles set sent_at = now() - interval '${hours} hours' where id = '${pid}'`);
// Noah solved Sam's puzzle (result not watched yet) and then sent Sam one (not opened).
const fN = await befriend(sam, noah);
await solved(noah, sam, fN, "N1");
const noahResult = await solved(sam, noah, fN, "N2");
const noahPuzzle = await sendPuzzle(noah, fN, sampleBoard("N3"));
backdate(noahPuzzle, 12);
// Sam has started Jared's puzzle; Sam can still make one for Jared.
const fJ = await befriend(sam, jared);
await solved(jared, sam, fJ, "J1");
const jaredPuzzle = await sendPuzzle(jared, fJ, sampleBoard("J2"));
await choose(sam, jaredPuzzle, "easy");
// Levi finished Sam's puzzle; the result is new.
const fL = await befriend(sam, levi);
const leviResult = await solved(sam, levi, fL, "L1");
// Sam's puzzle is with Deb, started.
const fD = await befriend(sam, deb);
await solved(deb, sam, fD, "D1");
const debPuzzle = await sendPuzzle(sam, fD, sampleBoard("D3"));
await choose(deb, debPuzzle, "easy");
// Sam's puzzle waits for Ava, not started.
const fA = await befriend(sam, ava);
backdate(await sendPuzzle(sam, fA, sampleBoard("A1")), 13);
// Links: one a guest finished (not watched), one waiting.
async function link(label, prefix) {
  const d = await rpc(sam.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard(prefix) });
  return rpc(sam.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: label });
}
const testLink = await link("Test", "T1");
const key = randomBytes(24).toString("base64url");
await rpc(anon(), "start_shared_puzzle", { p_token: testLink.token, p_guest_key: key, p_difficulty: "easy" });
const answer = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: testLink.puzzle_id });
const clues = (await rpc(anon(), "open_shared_puzzle", { p_token: testLink.token, p_guest_key: key })).puzzle.clues;
await rpc(anon(), "submit_shared_guess", { p_token: testLink.token, p_guest_key: key, p_guess_no: 1, p_board: solvedBoard(answer), p_extras: [], p_clues: clues });
await link("Mom", "M1");
const unread = async () => (await rpc(sam.client, "get_friends_inbox")).unread;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const newPage = async () => {
  const p = await (await browser.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport(PHONE);
  return p;
};
const row = (name) => `li.fr-frow[data-fid="${{ Noah: fN, Jared: fJ, Levi: fL, Deb: fD, Ava: fA }[name]}"]`;
// What's visible (screen-reader-only text left out).
const rowInfo = (page, name) => page.$eval(row(name), (li) => ({
  status: (() => { const c = li.querySelector(".fr-frow-status").cloneNode(true); c.querySelectorAll(".sr-only").forEach((s) => s.remove()); return c.textContent.trim(); })(),
  line: (() => { const c = li.querySelector(".fr-frow-line").cloneNode(true); c.querySelectorAll(".sr-only").forEach((s) => s.remove()); return c.textContent.replace(/\s+/g, " ").trim(); })(),
  buttons: [...li.querySelectorAll(".fr-frow-actions button")].map((b) => b.innerText.trim()),
  top: li.getBoundingClientRect().top, bottom: li.getBoundingClientRect().bottom,
}));
const scroller = (page) => page.$eval(".fr-wrap", (w) => w.scrollTop);

try {
  const p = await newPage();
  await p.goto(APP_URL, { waitUntil: "networkidle0" });
  await p.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  await signInBrowser(p, sam, "/friends");
  await p.waitForSelector(row("Ava"));
  await sleep(400);
  await shot(p, "01-friends-phone");

  // ── The list: one row each, the right buttons, everyone on one screen ────
  const rows = Object.fromEntries(await Promise.all(["Noah", "Jared", "Levi", "Deb", "Ava"].map(async (n) => [n, await rowInfo(p, n)])));
  log(JSON.stringify(rows, (k, v) => (k === "top" || k === "bottom" ? Math.round(v) : v)));
  assert.match(rows.Noah.status, /^Sent you a puzzle · 12h ago$/);
  assert.equal(rows.Noah.line, "Noah🔥1⭐2New", "name, both streaks inline, and New in words");
  assert.deepEqual(rows.Noah.buttons, ["Play", "Make Puzzle"], "an incoming puzzle doesn't block making one");
  assert.deepEqual(rows.Jared.buttons, ["Resume", "Make Puzzle"], "a started incoming puzzle doesn't block it either");
  assert.deepEqual(rows.Levi.buttons, ["Watch", "Make Puzzle"], "a new result: Watch first");
  assert.match(rows.Levi.status, /Solved your puzzle/); assert.match(rows.Levi.line, /New/);
  assert.deepEqual(rows.Deb.buttons, [], "your unfinished puzzle is with Deb: no Make Puzzle, no placeholder");
  assert.equal(rows.Deb.status, "Started your puzzle");
  assert.deepEqual(rows.Ava.buttons, []);
  assert.equal(rows.Ava.status, "Waiting to play · 13h ago");
  assert.ok(!(await p.$(`${row("Deb")} .fr-frow-actions`)), "no empty action row");
  const viewH = PHONE.height;
  const firstFour = ["Noah", "Jared", "Levi", "Deb"].map((n) => rows[n]);
  assert.ok(firstFour.every((r) => r.bottom <= viewH), `four friends fit on a ${PHONE.width}×${viewH} screen (last bottom ${Math.round(firstFour[3].bottom)})`);
  log(`all five rows visible: ${rows.Ava.bottom <= viewH}`);
  const sizes = await p.$$eval(".fr-frow-actions button", (bs) => bs.map((b) => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]));
  assert.ok(sizes.every(([, h]) => h >= 40), "buttons at least 40px tall");
  const body = await p.evaluate(() => document.body.innerText);
  assert.ok(!/is waiting for you|You'll get a link to text them|More with friends|How streaks work|Change avatar|Sign out/.test(body), "removed from the hub: lede, CTA explanation, rules, profile");
  assert.ok(!/\bAdmin\b/i.test(await p.$eval("header.hdr", (h) => h.innerText)), "no Admin in the header");
  assert.ok(!(await p.$("svg path[d^='M5 19l1-4']")), "no pencil icons");
  // Sent links: open by itself (a result is new) and says so in words.
  assert.match(await p.$eval(".fr-links-head", (b) => b.innerText), /Sent puzzle links\s*2[\s\S]*1 new result/);
  assert.equal(await p.$eval(".fr-links-head", (b) => b.getAttribute("aria-expanded")), "true");
  const linkRows = await p.$$eval("#fr-links-list li", (lis) => lis.map((li) => li.innerText.replace(/\s+/g, " ")));
  assert.ok(linkRows.some((t) => /For Test.*New result.*Solved it.*Watch/.test(t)), linkRows.join(" | "));
  assert.ok(linkRows.some((t) => /For Mom.*not started yet.*Copy link/.test(t)), linkRows.join(" | "));
  await p.$eval(".fr-wrap", (w) => w.scrollTo(0, w.scrollHeight));
  await sleep(200);
  await shot(p, "02-friends-phone-bottom");
  await p.$eval(".fr-wrap", (w) => w.scrollTo(0, 0));

  // ── Details: open from the row, nothing marked seen, Back/refresh/close ──
  const before = await unread();
  await p.$eval(".fr-wrap", (w) => w.scrollTo(0, 60));
  const scrolled = await scroller(p);
  await p.locator(`${row("Noah")} .fr-frow-name`).click();
  await waitPath(p, `/friends/details/${fN}`);
  await p.waitForSelector(".fr-details [role=dialog]");
  await sleep(350);
  await shot(p, "03-details-noah");
  const sheet = await p.$eval(".fr-details [role=dialog]", (d) => d.innerText.replace(/\s+/g, " "));
  log("details:", sheet.slice(0, 400));
  for (const t of ["Noah", "Play", "Make Puzzle", "Friend Streak", "Solve Streak", "Watch Noah's guesses", "New result · not watched yet", "Past puzzles", "How streaks work"]) {
    assert.ok(sheet.includes(t), `details show "${t}"`);
  }
  assert.match(sheet, /left to keep your streak|Streak kept|Next day in/, "countdown");
  await p.evaluate(() => [...document.querySelectorAll(".fr-details .fr-rowbtn")].find((b) => b.innerText.includes("Past puzzles")).click());
  await p.waitForSelector(".fr-details .fr-history-item");
  await p.evaluate(() => [...document.querySelectorAll(".fr-details .fr-rowbtn")].find((b) => b.innerText.includes("How streaks work")).click());
  await p.waitForSelector(".fr-details .fr-rules");
  assert.equal(await unread(), before, "opening the list and details marks nothing seen");
  await p.reload({ waitUntil: "networkidle0" });
  await p.waitForSelector(".fr-details [role=dialog]");
  assert.equal(at(p), `/friends/details/${fN}`, "refresh keeps the details open");
  await p.locator(".fr-details .fr-closebtn").click();
  await waitPath(p, "/friends");
  assert.ok(!(await p.$(".fr-details")), "closed");
  // From the list: close returns to the same history entry and scroll position.
  await p.$eval(".fr-wrap", (w) => w.scrollTo(0, 60));
  await p.locator(`${row("Jared")} .fr-frow-status`).click();
  await waitPath(p, `/friends/details/${fJ}`);
  await p.keyboard.press("Escape");
  await waitPath(p, "/friends");
  assert.equal(await scroller(p), scrolled, "list position kept");
  assert.equal(await p.evaluate(() => document.activeElement?.closest("li")?.dataset.fid), fJ, "focus back on Jared's row");
  // Browser Back closes it too; Forward reopens.
  await p.locator(`${row("Levi")} .fr-avatar`).click();
  await waitPath(p, `/friends/details/${fL}`);
  await p.goBack();
  await waitPath(p, "/friends");
  assert.ok(!(await p.$(".fr-details")));
  await p.goForward();
  await p.waitForSelector(".fr-details [role=dialog]");
  await p.keyboard.press("Escape");
  await waitPath(p, "/friends");
  assert.equal(await unread(), before, "still nothing marked seen");

  // ── Buttons act directly (no details) ────────────────────────────────────
  await p.locator(`${row("Jared")} button[aria-label="Make Puzzle for Jared"]`).click();
  await waitPath(p, `/friends/make/${fJ}`);
  await waitText(p, "Make one for Jared");
  await p.goBack(); await waitPath(p, "/friends");
  await p.locator(`${row("Jared")} button[aria-label="Resume Jared's puzzle"]`).click();
  await waitPath(p, `/friends/play/${jaredPuzzle}`);
  await p.waitForSelector(".game", { timeout: 15000 });
  assert.ok(!(await p.$(".fr-choose")), "resumed straight into the game, no difficulty step");
  await shot(p, "04-resume-jared");
  await p.goBack(); await waitPath(p, "/friends");
  await p.locator(`${row("Noah")} button[aria-label="Play Noah's puzzle"]`).click();
  await waitPath(p, `/friends/play/${noahPuzzle}`);
  await p.goBack(); await waitPath(p, "/friends");
  await p.waitForSelector(row("Noah"));
  // Watch: the real viewing marks it seen.
  await p.locator(`${row("Levi")} button[aria-label="Watch Levi's guesses"]`).click();
  await waitPath(p, `/friends/guesses/${leviResult}`);
  await waitText(p, "Levi");
  await sleep(800);
  await shot(p, "05-watch-levi");
  await p.goBack(); await waitPath(p, "/friends");
  await p.waitForFunction((sel) => document.querySelector(sel) && !document.querySelector(sel + " .fr-new"), { timeout: 15000 }, row("Levi"));
  const levi2 = await rowInfo(p, "Levi");
  assert.deepEqual(levi2.buttons, ["Make Puzzle"], "watched: Watch moves into the details");
  log("Levi after watching:", levi2.status, levi2.buttons);
  assert.ok(noahResult, "Noah's result still unwatched");
  assert.ok((await rpc(sam.client, "get_friends_inbox")).friends.find((f) => f.friendship_id === fN).unseen_result, "Noah's result untouched");

  // ── Profile in the account menu; notifications in Settings ──────────────
  await p.locator('[data-testid="account-menu-button"]').click();
  await p.waitForSelector('[data-testid="edit-profile"]');
  await shot(p, "06-account-menu");
  await p.locator('[data-testid="edit-profile"]').click();
  await p.waitForSelector(".fr-modal [role=dialog] .fr-avpick");
  await p.locator('.fr-avopt input[value="owl"]').click();
  await p.waitForFunction(() => document.querySelector('.cv-avatar [data-avatar]')?.dataset.avatar === "owl", { timeout: 10000 });
  await shot(p, "07-profile-dialog");
  await p.locator(".fr-modal .fr-closebtn").click();
  await p.locator(".fr-hub-foot .fr-textbtn").click();
  await p.waitForSelector(".settings-sheet .fr-settings-notify");
  assert.match(await p.$eval(".settings-sheet .fr-settings-notify", (s) => s.innerText), /Friends notifications[\s\S]*Notifications/);
  await shot(p, "08-settings-notifications");
  await p.mouse.click(195, 40);

  // ── The other direction: Noah's own list is independent ─────────────────
  const n = await newPage();
  await n.goto(APP_URL, { waitUntil: "networkidle0" });
  await n.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  await signInBrowser(n, noah, "/friends");
  await n.waitForSelector(".fr-frow");
  const samRow = await n.$eval(".fr-frow", (li) => ({ text: li.innerText.replace(/\s+/g, " "), buttons: [...li.querySelectorAll(".fr-frow-actions button")].map((b) => b.innerText.trim()) }));
  log("Noah sees:", JSON.stringify(samRow));
  // Sam solved Noah's earlier puzzle (new to Noah), and Noah's latest is still with Sam.
  assert.match(samRow.text, /Sam/); assert.match(samRow.text, /Solved your puzzle/);
  assert.deepEqual(samRow.buttons, ["Watch"], "Noah's puzzle is still with Sam: Watch, but no Make Puzzle for Noah");
  await n.locator(".fr-frow .fr-frow-name").click();
  await n.waitForSelector(".fr-details [role=dialog]");
  assert.match(await n.$eval(".fr-details [role=dialog]", (d) => d.innerText), /Your puzzle for Sam · sent 12h ago, not started yet/);
  await shot(n, "09-noah-side-details");

  // ── /admin by address, signed out ───────────────────────────────────────
  const a = await newPage();
  await a.goto(`${APP_URL}/admin`, { waitUntil: "networkidle0" });
  await sleep(500);
  assert.equal(at(a), "/admin", "signed-out visitors stay on /admin");
  await a.reload({ waitUntil: "networkidle0" });
  await sleep(500);
  assert.equal(at(a), "/admin", "refresh keeps /admin");
  const adminText = await a.evaluate(() => document.body.innerText);
  assert.ok(/Puzzle|Publish|Word/i.test(adminText), "admin screen shows");
  assert.ok(!/\bAdmin\b/.test(await a.$eval("header.hdr", (h) => h.innerText)), "no Admin link in the header");
  await shot(a, "10-admin-signed-out");
  // Its functions work signed out: add a word in the Word Bank, then remove it.
  const word = `ZZUI${Date.now().toString(36).toUpperCase()}`;
  const inBank = () => Number(sql(`select count(*) from public.wordbank where word = '${word}'`));
  await a.evaluate(() => [...document.querySelectorAll(".atab")].find((b) => /word bank/i.test(b.innerText)).click());
  await a.waitForSelector(".awrow input");
  await a.type(".awrow input", word);
  await a.keyboard.press("Enter");
  for (let i = 0; i < 40 && inBank() === 0; i++) await sleep(150);
  assert.equal(inBank(), 1, "signed-out word added through the admin page");
  await a.evaluate((w) => [...document.querySelectorAll(".wchip")].find((c) => c.firstChild.textContent === w).querySelector(".wdel").click(), word);
  for (let i = 0; i < 40 && inBank() === 1; i++) await sleep(150);
  assert.equal(inBank(), 0, "and removed again");
  log("admin word bank add/remove signed out: ok");

  // Guardrail: deleting a played puzzle moves it to Unused (puzzle and plays
  // kept); a puzzle nobody has played is really deleted.
  const base = 980000000 + Math.floor(Math.random() * 1e6), tag = Date.now().toString(36);
  const [played, unplayed] = [base, base + 1];
  sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution) values
       (${played}, '2099-02-02', 'Played ${tag}', '', 'standard', 'published', '[]', '[]', '[]'),
       (${unplayed}, '2099-02-01', 'Unplayed ${tag}', '', 'standard', 'draft', '[]', '[]', '[]')`);
  sql(`insert into public.plays (user_id, puzzle_id, puzzle_date, solved, lives_used, difficulty)
       select user_id, ${played}, '2099-02-02', true, 0, 'standard' from public.accounts limit 1`);
  const dialogs = [];
  a.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  const status = (id) => sql(`select coalesce((select status from public.puzzles where id = ${id}), 'gone')`);
  const trash = (title) => a.evaluate((t) => [...document.querySelectorAll(".pcard")]
    .find((c) => c.querySelector(".ptitle")?.textContent === t).querySelector("span[style*='margin-left']").click(), title);
  await a.goto(`${APP_URL}/admin`, { waitUntil: "networkidle0" });
  await waitText(a, `Played ${tag}`);
  await trash(`Played ${tag}`);
  for (let i = 0; i < 40 && status(played) === "published"; i++) await sleep(150);
  assert.equal(status(played), "unused", "a played puzzle is moved to Unused, not deleted");
  assert.equal(sql(`select count(*) from public.plays where puzzle_id = ${played}`), "1", "its play history is kept");
  for (let i = 0; i < 40 && dialogs.length < 2; i++) await sleep(150);   // the confirm, then the explanation
  assert.ok(dialogs.some((m) => m.includes("moved to Unused instead of being deleted")), dialogs.join(" | "));
  await a.evaluate(() => [...document.querySelectorAll(".atab")].find((b) => /unused/i.test(b.innerText)).click());
  await waitText(a, `Played ${tag}`);
  await shot(a, "11-admin-played-moved-to-unused");
  await a.evaluate(() => [...document.querySelectorAll(".atab")].find((b) => /puzzles/i.test(b.innerText)).click());
  await waitText(a, `Unplayed ${tag}`);
  await trash(`Unplayed ${tag}`);
  for (let i = 0; i < 40 && status(unplayed) !== "gone"; i++) await sleep(150);
  assert.equal(status(unplayed), "gone", "an unplayed puzzle is deleted");
  sql(`delete from public.puzzles where id in (${played}, ${unplayed})`);
  log("admin guardrail: played → Unused with history kept; unplayed → deleted");

  // Signed out, Friends stays private.
  await a.goto(`${APP_URL}/friends/details/${fN}`, { waitUntil: "networkidle0" });
  await waitText(a, "Sign in or sign up");
  assert.ok(!(await a.evaluate(() => document.body.innerText.includes("Noah"))), "nothing about Sam's friends without signing in");

  assert.deepEqual(errors, [], "no page errors");
  console.log(`\nCompact Friends hub: all checks passed. Screenshots in ${OUT}`);
} finally {
  await browser.close();
}
