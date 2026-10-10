// Two-person end-to-end run of the friend exchange in real browsers.
//
// Needs: the local stack (`npm run db:start`), `npm run friends:setup` once,
// `npm run friends:dev` (5186), plus Chrome or Edge installed.
// Deb and Sam are two separate Cluevoyance accounts, each in its own
// isolated browser context (two phones). Sign-in itself is the shared
// sign-in, which refuses automated browsers, so each account's session is
// placed the way /auth/callback leaves it (tests/friends/browser.mjs).
// Everything after that goes through the real UI — the signed-out invite
// landing, display name, accept, create, send, play (a refresh halfway),
// win, make one back, lose, replay, closing and reopening the app, sign-out
// and switching accounts — and screenshots land in the folder in argv[2].
//
//   node tests/friends/e2e.mjs <screenshot-dir>
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { API_URL, PUBLISHABLE_KEY, admin } from "./helpers.mjs";
import { APP_URL, CHROME, makeAccount, signInBrowser, signOutBrowser } from "./browser.mjs";

const OUT = path.resolve(process.argv[2] || "friends-e2e-shots");
const DEB_URL = APP_URL;
const SAM_URL = APP_URL;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
// Width emulation only: flipping isMobile makes Chrome reload the page mid-flow.
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2 };

async function shot(page, name, viewport) {
  if (viewport) await page.setViewport(viewport);
  await sleep(450); // let layout, fonts and the injected stylesheet settle
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const wrap = document.querySelector(".fr-wrap");
    return Math.max(doc.scrollWidth - innerWidth, wrap ? wrap.scrollWidth - wrap.clientWidth : 0);
  });
  assert.ok(overflow <= 1, `${name}: ${overflow}px of sideways scroll`);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log("screenshot", name);
}

const click = (page, text, tag = "button") => page.locator(`${tag}::-p-text(${text})`).click();
const waitText = (page, text, timeout = 15000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

// Signed out, Friends offers only the shared sign-in (no email or code box).
async function assertSignedOutFriends(page) {
  await page.waitForSelector("button.fr-btn.primary::-p-text(Sign in)");
  assert.equal(await page.$("#fr-email"), null, "no separate Friends email sign-in");
  assert.equal(await page.$("#fr-code"), null, "no emailed code box");
}

// Sign in as the account, come back to Friends as the callback would, and
// pick a display name.
async function signIn(page, acct, name) {
  await signInBrowser(page, acct, "/?friends=1");
  await page.waitForSelector("#fr-name");
  await page.locator("#fr-name").fill(name);
  await click(page, "Continue");
  await waitText(page, "Signed in as");
}

const openFriends = (page) => page.locator('button[aria-label^="Friends"]').click();

// A signed-in API client for reading the puzzle's answer as its creator —
// only so the test knows which moves solve it.
async function apiAs(page) {
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("cv-auth")));
  return createClient(API_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

async function writePuzzle(page, clues) {
  await click(page, "Deal random cards");
  await sleep(300);
  const pills = await page.$$(".fr-board-stage .ctab.editable");
  // DOM order: top, left, right, bottom
  const order = [clues[0], clues[3], clues[1], clues[2]];
  for (let i = 0; i < 4; i++) {
    const pill = (await page.$$(".fr-board-stage .ctab.editable"))[i] || pills[i];
    await pill.click();
    await page.waitForSelector(".fr-board-stage input.ctab.editing");
    await page.keyboard.type(order[i]);
    await page.keyboard.press("Enter");
    await sleep(150);
  }
}

// ── Reading and moving cards on the game board ──────────────────────
// DOM order of the 2×2 is TL, TR, BL, BR = slots 0, 1, 3, 2.
const DOM_TO_SLOT = [0, 1, 3, 2];
async function readBoard(page) {
  return page.evaluate(() => {
    const read = (el) => {
      const t = (c) => el.querySelector(`.ew.${c}`)?.textContent || "";
      return { top: t("et"), words: ["et", "er", "eb", "el"].map(t), locked: !!el.querySelector(".ctile.locked") };
    };
    return {
      board: [...document.querySelectorAll(".csurface .cslot")].map(read),
      tray: [...document.querySelectorAll(".eslots .eslot")].map(read),
    };
  });
}
const key = (words) => [...words].sort().join("|");
const center = async (el) => { const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function slotEls(page) {
  const board = await page.$$(".csurface .cslot");
  const tray = await page.$$(".eslots .eslot");
  const bySlot = [];
  board.forEach((el, i) => { bySlot[DOM_TO_SLOT[i]] = el; });
  return [...bySlot, ...tray];
}
async function drag(page, fromEl, toEl) {
  const a = await center(fromEl), b = await center(toEl);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
  await page.mouse.up(); await sleep(350);
}
async function tap(page, el) {
  const p = await center(el);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up();
  await sleep(450);
}
// Visible words (top, right, bottom, left) of the answer card for each slot.
function answerWords(view) {
  const cards = view.authored_cards || view.cards;
  return view.solution.slotCards.map((id, i) => {
    const o = view.solution.orientations[i];
    return [0, 1, 2, 3].map((e) => cards[id].words[(e - o + 4) % 4]);
  });
}

const trayCount = (page) => page.$$eval(".game .eslots .eslot", (e) => e.filter((x) => x.querySelector(".ctile")).length);
async function chooseDifficulty(page, level, shotName) {
  await page.waitForSelector(".fr-choose");
  if (shotName) {
    await shot(page, `${shotName}-375`);
    await shot(page, `${shotName}-360`, { ...PHONE, width: 360, height: 780 });
    await shot(page, `${shotName}-390`, { ...PHONE, width: 390, height: 844 });
    await page.setViewport(PHONE);
  }
  await page.locator(`.lobby-diff-opt::-p-text(${level})`).click();
  await page.waitForFunction((l) => document.querySelector(".lobby-diff-opt.active")?.textContent.includes(l), {}, level);
  await click(page, "Start puzzle");
  await page.waitForSelector(".csurface .ctile");
}
// Scrolls the replay's tray into view for a screenshot.
async function showTray(page) {
  await page.$eval(".fr-tray", (el) => el.scrollIntoView({ block: "center" }));
  await sleep(250);
}
// The replay shows each card once — the board and the real tray, nothing
// else: no second panel of bonus cards, no dealt/undealt badges.
async function assertNoDuplicateCards(page, label) {
  const r = await page.$eval(".fr-replay", (el) => ({
    tiles: [...el.querySelectorAll(".ctile")].map((t) => [...t.querySelectorAll(".ew")].map((w) => w.textContent).sort().join("|")),
    text: el.innerText,
  }));
  assert.equal(new Set(r.tiles).size, r.tiles.length, `${label}: a card appears twice in the replay`);
  for (const gone of ["three bonus cards", "Not dealt", "On the board", "In the tray", "Bonus 1"]) {
    assert.ok(!r.text.includes(gone), `${label}: replay still says "${gone}"`);
  }
}
async function solve(page, view) {
  const want = answerWords(view);
  for (let slot = 0; slot < 4; slot++) {
    let els = await slotEls(page);
    const state = await readBoard(page);
    const cards = [...DOM_TO_SLOT.map((s, i) => [s, state.board[i]]).sort((x, y) => x[0] - y[0]).map((x) => x[1]), ...state.tray];
    const at = cards.findIndex((c) => key(c.words) === key(want[slot]));
    if (at !== slot) { await drag(page, els[at], els[slot]); els = await slotEls(page); }
    for (let t = 0; t < 4; t++) {
      const now = await readBoard(page);
      const domIndex = DOM_TO_SLOT.indexOf(slot);
      if (now.board[domIndex].top === want[slot][0]) break;
      await tap(page, els[slot]);
    }
  }
}
// Turns every unlocked card once so the next guess is new but still wrong.
async function nudgeWrong(page, view) {
  const want = answerWords(view);
  const els = await slotEls(page);
  for (let slot = 0; slot < 4; slot++) {
    const domIndex = DOM_TO_SLOT.indexOf(slot);
    if ((await readBoard(page)).board[domIndex].locked) continue;
    await tap(page, els[slot]);
    const now = (await readBoard(page)).board[domIndex];
    if (key(now.words) === key(want[slot]) && now.top === want[slot][0]) await tap(page, els[slot]);
  }
}
// The Friend Streak deadline(s) on screen: the server instant and how it reads here.
// The server deadline behind each streak line, and the time it shows (in this viewer's zone).
const deadlines = (page) => page.$$eval(".fr-status[data-deadline]:not([data-deadline=none])", (s) => s.map((x) => ({ at: x.dataset.deadline, text: x.querySelector("time")?.textContent || "" })));
const bodyText = (page) => page.evaluate(() => document.body.innerText);

const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
async function submitAndSettle(page) {
  await page.locator("button.sbtn").click();
  await sleep(4800);
}

// ═══════════════════════════════════════════════════════════════════
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const pages = [];
try {
  const debCtx = await browser.createBrowserContext();
  const samCtx = await browser.createBrowserContext();
  const deb = await debCtx.newPage();
  const sam = await samCtx.newPage();
  await deb.setViewport(PHONE); await sam.setViewport(PHONE);
  pages.push(["deb", deb], ["sam", sam]);
  // Deb is in Denver, Sam in Tokyo — 15 hours apart.
  await deb.emulateTimezone("America/Denver");
  await sam.emulateTimezone("Asia/Tokyo");
  const errors = [];
  for (const [who, p] of [["deb", deb], ["sam", sam]]) {
    p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
  }

  const [debAcct, samAcct, eveAcct] = await Promise.all([makeAccount("deb"), makeAccount("sam"), makeAccount("eve")]);

  // 1. Deb opens Friends signed out (shared sign-in only), signs in, makes an invite link.
  await deb.goto(DEB_URL, { waitUntil: "networkidle0" });
  await shot(deb, "01-daily-header-375");
  await openFriends(deb);
  await assertSignedOutFriends(deb);
  await shot(deb, "01b-friends-signed-out-375");
  await signIn(deb, debAcct, "Deb");
  await click(deb, "Invite a friend");
  const link = await (await deb.waitForSelector('input[aria-label="Invite link"]')).evaluate((i) => i.value);
  log("invite", link.replace(/invite=.*/, "invite=…"));

  // 2. Sam opens it on their own phone while signed out: who it's from, then
  // the shared sign-in. The invite survives the sign-in round trip.
  await sam.goto(link.replace(DEB_URL, SAM_URL), { waitUntil: "networkidle0" });
  await waitText(sam, "Deb invited you");
  await waitText(sam, "Sign in to accept");
  await assertSignedOutFriends(sam);
  await shot(sam, "02-invite-landing-375");
  await signIn(sam, samAcct, "Sam");
  await waitText(sam, "Deb invited you");
  await shot(sam, "02b-invite-accept-375");
  await click(sam, "Accept");
  await waitText(sam, "Make one for Deb");
  log("friends");

  // 3. Deb makes a puzzle for Sam: deal, write clues, save, preview, send.
  await deb.reload(); await openFriends(deb);
  await click(deb, "Make one for Sam");
  await deb.waitForSelector(".fr-board-stage");
  await shot(deb, "03-creator-empty-375");
  await writePuzzle(deb, ["CHIME", "COWBOY", "ICE", "RED"]);
  await click(deb, "Save draft");
  await waitText(deb, "Draft saved");
  await shot(deb, "04-creator-filled-375");
  await shot(deb, "04b-creator-360", { ...PHONE, width: 360, height: 780 });
  await shot(deb, "04c-creator-390", { ...PHONE, width: 390, height: 844 });
  await deb.setViewport(PHONE);
  // The three bonus cards, all editable, right under the answer board in the
  // same card, with one short line and no list of difficulty levels.
  assert.equal(await deb.$(".fr-chip"), null, "no difficulty choice for the creator");
  assert.equal((await deb.$$(".fr-decoys .ctile")).length, 3, "three bonus cards to write");
  assert.ok(await deb.$(".fr-board + .fr-bonus-zone .fr-decoys"), "the bonus cards come straight after the board");
  const bonusNote = await deb.$eval(".fr-bonus-note", (el) => el.textContent);
  assert.equal(bonusNote, "These three cards don’t belong on the board. Sam chooses how many to play with.");
  assert.ok(!(await bodyText(deb)).includes("Hardcore"), "the creator doesn't list difficulty levels");
  for (const [name, vp] of [["04d-creator-bonus-360", { ...PHONE, width: 360, height: 780 }], ["04e-creator-bonus-375", PHONE], ["04f-creator-bonus-390", { ...PHONE, width: 390, height: 844 }]]) {
    await deb.setViewport(vp);
    // Frame the bottom of the board and the bonus cards together, above the action bar.
    await deb.$eval(".fr-board-stage .ctab.bot", (el) => { const w = el.closest(".fr-wrap"); w.scrollTop += el.getBoundingClientRect().top - 150; });
    const gap = await deb.$eval(".fr-page", (pageEl) => {
      const board = pageEl.querySelector(".fr-board-stage").getBoundingClientRect();
      const tops = [...pageEl.querySelectorAll(".fr-bonus-zone .fr-decoy")].map((d) => Math.round(d.getBoundingClientRect().top));
      const heading = pageEl.querySelector(".fr-bonus-zone .fr-eyebrow").getBoundingClientRect();
      return { toHeading: Math.round(heading.top - board.bottom), toCards: Math.round(tops[0] - board.bottom), sameRow: new Set(tops).size === 1 };
    });
    assert.ok(gap.sameRow, `${name}: the three bonus cards stay on one row`);
    // The section starts right after the board (its hint line in between), and
    // the cards right under the section heading and its one-sentence note.
    assert.ok(gap.toHeading <= 80 && gap.toCards - gap.toHeading <= 110, `${name}: bonus heading ${gap.toHeading}px / cards ${gap.toCards}px below the board`);
    log(name, `board → bonus heading ${gap.toHeading}px, → cards ${gap.toCards}px`);
    await shot(deb, name);
  }
  await deb.setViewport(PHONE);
  await click(deb, "Preview");
  await deb.waitForSelector(".csurface .ctile");
  await sleep(700);
  assert.equal(await trayCount(deb), 3, "the preview shows all three bonus cards");
  await shot(deb, "05-creator-preview-375");
  await deb.locator(".fr-playbar .fr-back").click();
  await click(deb, "Send puzzle to Sam");
  await waitText(deb, "Waiting for Sam");
  await shot(deb, "06-deb-inbox-waiting-375");

  // 4. Sam: it's there straight away.
  await sam.reload();
  await sam.waitForSelector(".friends-dot", { timeout: 8000 }); // the header's new-puzzle dot
  await openFriends(sam);
  await waitText(sam, "A puzzle from Deb is waiting for you");
  await shot(sam, "07-sam-inbox-375");
  await shot(sam, "07b-sam-inbox-360", { ...PHONE, width: 360, height: 780 });
  await shot(sam, "07c-sam-inbox-390", { ...PHONE, width: 390, height: 844 });
  await shot(sam, "07d-sam-inbox-desktop", { width: 1280, height: 860, deviceScaleFactor: 1 });
  await sam.setViewport(PHONE);

  const debApi = await apiAs(deb);
  const { data: inbox } = await debApi.rpc("get_friends_inbox");
  const puzzleId = inbox.friends[0].outgoing.puzzle_id;
  const { data: answer } = await debApi.rpc("open_friend_puzzle", { p_puzzle_id: puzzleId });

  // 5. Sam chooses Expert, plays one wrong guess, then refreshes halfway through.
  await click(sam, "Play Deb's puzzle");
  await chooseDifficulty(sam, "Expert", "07e-sam-choose-difficulty");
  await sleep(900); // intro shuffle
  assert.equal(await trayCount(sam), 2, "Expert deals two of Deb's three bonus cards");
  const chip = () => sam.$eval(".fr-playbar .fr-chip", (el) => el.textContent.replace(/\s+/g, " "));
  assert.match(await chip(), /Deb's puzzle ?· Expert/);
  await shot(sam, "08-sam-play-expert-375");
  await shot(sam, "08b-sam-play-expert-360", { ...PHONE, width: 360, height: 780 });
  await shot(sam, "08c-sam-play-expert-390", { ...PHONE, width: 390, height: 844 });
  await sam.setViewport(PHONE);
  await submitAndSettle(sam);
  assert.equal(await lives(sam), 2, "a wrong guess costs a life");
  const before = await readBoard(sam);
  const lockedBefore = before.board.filter((c) => c.locked).length;
  // The header's Friends icon and the in-page ‹ Friends both leave the puzzle
  // for the Friends hub, and coming back finds it exactly as it was.
  await openFriends(sam);
  await waitText(sam, "Continue Deb's puzzle");
  assert.equal(await sam.$(".csurface"), null, "header icon: back on the hub, not the board");
  await click(sam, "Continue Deb's puzzle");
  await sam.waitForSelector(".csurface .ctile"); await sleep(600);
  assert.equal(await lives(sam), 2, "header icon: lives kept");
  assert.deepEqual((await readBoard(sam)).board.map((c) => c.words), before.board.map((c) => c.words), "header icon: board kept");
  await sam.locator(".fr-playbar .fr-back").click();
  await waitText(sam, "Continue Deb's puzzle");
  await click(sam, "Continue Deb's puzzle");
  await sam.waitForSelector(".csurface .ctile"); await sleep(600);
  assert.equal(await lives(sam), 2, "‹ Friends: lives kept");
  log("header icon and ‹ Friends return to the hub mid-puzzle; progress kept");
  await sam.reload(); await sleep(600);
  await openFriends(sam);
  await click(sam, "Continue Deb's puzzle");
  await sam.waitForSelector(".csurface .ctile");
  await sleep(600);
  assert.equal(await lives(sam), 2, "lives survive a refresh");
  const after = await readBoard(sam);
  assert.equal(after.board.filter((c) => c.locked).length, lockedBefore, "confirmed cards survive a refresh");
  assert.deepEqual(after.board.map((c) => c.words), before.board.map((c) => c.words), "the board comes back as it was");
  assert.deepEqual(after.tray.map((c) => c.words), before.tray.map((c) => c.words), "the same two bonus cards, same tray");
  assert.equal(await sam.$(".fr-choose"), null, "no second chance to pick a difficulty");
  assert.match(await chip(), /Deb's puzzle ?· Expert/, "the difficulty survives a refresh");
  log("refresh mid-play restored the board and 2 lives");
  await shot(sam, "09-sam-after-refresh-375");

  // 6. Sam solves it.
  await solve(sam, answer);
  await shot(sam, "10-sam-solved-board-before-submit-375");
  await sam.locator("button.sbtn").click();
  await sam.waitForSelector(".fr-done", { timeout: 15000 });
  await sleep(500);
  await waitText(sam, "You read Deb's mind");
  await shot(sam, "11-sam-win-handoff-375");
  await shot(sam, "11-sam-win-handoff-360", { ...PHONE, width: 360, height: 780 });
  await sam.setViewport(PHONE);
  const tiles = await sam.$$eval(".fr-done .fr-streak-num", (n) => n.map((x) => Number(x.textContent)));
  assert.deepEqual(tiles, [1, 1], "Friend Streak 1, Solve Streak 1 after the first win");
  const labels = await sam.$$eval(".fr-done [data-streak]", (n) => n.map((x) => x.getAttribute("aria-label").split(".")[0]));
  assert.deepEqual(labels, ["Friend Streak: 1 day", "Solve Streak: 1 puzzle solved in a row"]);
  assert.ok((await bodyText(sam)).includes("Friend Streak +1"), "the win says it added a day");
  const samDeadline = (await deadlines(sam)).at(-1);
  assert.match(samDeadline.text, /GMT\+9/, "Sam sees the deadline in Tokyo time");
  log("Sam's deadline:", samDeadline.text.replace(/\u202f/g, " "));
  // Already kept: the clock says when the NEXT streak day starts, and that
  // playing now is still fine.
  const clock = await sam.$eval(".fr-done .fr-clock", (el) => ({ kind: el.dataset.clock, text: el.innerText }));
  assert.equal(clock.kind, "next");
  assert.match(clock.text, /Next streak day starts in\s+\d+h \d\dm/);
  assert.ok((await bodyText(sam)).includes("You can still play now"), "kept: playing now is still allowed");
  // Close the sheet, then the Results button brings it back.
  await click(sam, "See the board");
  await sam.waitForSelector(".fr-results-btn");
  await shot(sam, "11b-sam-results-button-375");
  await shot(sam, "11b-sam-results-button-360", { ...PHONE, width: 360, height: 780 });
  await sam.setViewport(PHONE);
  await sam.locator(".fr-results-btn").click();
  await waitText(sam, "You read Deb's mind");
  assert.equal(await sam.$(".fr-results-btn"), null, "no Results button while the sheet is open");
  log("Results button reopens the sheet");

  // 7. Sam makes one back straight from the prompt.
  await click(sam, "Make one for Deb");
  await sam.waitForSelector(".fr-board-stage");
  await writePuzzle(sam, ["OCEAN", "NIGHT", "GARDEN", "TOYS"]);
  // Headings read as interface, not as a clue.
  const fonts = await sam.evaluate(() => {
    const h1 = getComputedStyle(document.querySelector(".fr-h1"));
    return { h1: [h1.fontFamily, h1.fontWeight], clue: getComputedStyle(document.querySelector(".fr-board-stage .ctab")).fontFamily };
  });
  assert.match(fonts.h1[0], /Raleway/, "heading uses the interface font");
  assert.equal(fonts.h1[1], "800", "heading is heavy");
  assert.match(fonts.clue, /Cinzel/, "clues keep their serif");
  await shot(sam, "11c-creator-heading-375");
  // Leave through the header icon with unsaved edits: they come back.
  await openFriends(sam);
  await waitText(sam, "Make one for Deb");
  await click(sam, "Make one for Deb");
  await waitText(sam, "We kept your unsaved changes");
  const kept = await sam.$$eval(".fr-board-stage .ctab", (t) => t.map((x) => x.textContent.trim()));
  assert.ok(["OCEAN", "NIGHT", "GARDEN", "TOYS"].every((c) => kept.includes(c)), `creator edits kept: ${kept}`);
  log("header icon from the creator keeps the unsaved puzzle");
  assert.equal(await sam.$(".fr-chip"), null, "the creator doesn't choose a difficulty");
  await click(sam, "Send puzzle to Deb");
  await waitText(sam, "Waiting for Deb");

  // 8. Deb replays Sam's real guesses.
  await deb.reload(); await openFriends(deb);
  await waitText(deb, "Sent you a puzzle");
  // Next action: the puzzle to play first, Sam's guesses one tap below.
  const debButtons = await deb.$$eval(".fr-card .fr-btn", (b) => b.map((x) => x.textContent.trim()));
  assert.equal(debButtons[0], "Play Sam's puzzle", "playing is the primary action");
  const debRows = await deb.$$eval(".fr-card .fr-rowbtn", (b) => b.map((x) => x.textContent.trim()));
  assert.ok(debRows.some((t) => t.startsWith("Watch Sam's guesses")), "Sam's guesses are a quiet row below");
  // The period is already counted: said plainly, same instant as Sam's, in Denver time.
  const inboxText = await bodyText(deb);
  assert.ok(inboxText.includes("Streak kept"), "already-counted period is stated");
  assert.ok(inboxText.includes("Next streak day starts in"), "when the next period starts counting is stated");
  const debDeadline = (await deadlines(deb)).at(-1);
  assert.equal(debDeadline.at, samDeadline.at, "both friends are shown the same server deadline");
  assert.match(debDeadline.text, /M[DS]T/, "Deb sees it in Denver time");
  log("Deb's deadline:", debDeadline.text.replace(/\u202f/g, " "));
  await deb.reload(); await openFriends(deb);
  await waitText(deb, "Streak kept");
  assert.deepEqual((await deadlines(deb)).at(-1), debDeadline, "the deadline reads the same after a refresh");
  await shot(deb, "12-deb-inbox-play-and-result-375");
  await shot(deb, "12-deb-inbox-play-and-result-360", { ...PHONE, width: 360, height: 780 });
  await shot(deb, "12-deb-inbox-play-and-result-390", { ...PHONE, width: 390, height: 844 });
  await deb.setViewport(PHONE);
  await click(deb, "Watch Sam's guesses");
  await deb.waitForSelector(".fr-replay");
  await shot(deb, "12b-result-replay-entry-375");
  await shot(deb, "12b-result-replay-entry-360", { ...PHONE, width: 360, height: 780 });
  await deb.setViewport(PHONE);
  await deb.locator(".fr-playall").click();   // play through the guesses
  const stepIs = (n) => deb.waitForFunction((t) => new RegExp(t, "i").test(document.querySelector(".fr-replay-step")?.textContent || ""), { timeout: 8000 }, `Guess ${n} of 2`);
  await stepIs(1);
  await stepIs(2); // it plays through Sam's guesses in order
  await deb.locator('.fr-step-dot[aria-label="Guess 1"]').click();
  await sleep(600);
  await shot(deb, "13-replay-guess1-375");
  const g1 = await readBoard(deb);
  // The replay shows Sam's real tray — only the cards Sam had left — once.
  const g1Tray = await deb.$$eval(".fr-tray .eslot", (e) => e.map((x) => [...x.querySelectorAll(".ew")].map((w) => w.textContent)));
  assert.deepEqual(g1Tray, before.tray.map((c) => c.words), "guess 1's tray is exactly the two cards Sam had");
  assert.equal(await deb.$(".fr-bonus"), null, "no extra bonus-card panel");
  await assertNoDuplicateCards(deb, "guess 1");
  const boardFont = await deb.$eval(".fr-replay-board .ew", (w) => getComputedStyle(w).fontSize);
  for (const [name, vp] of [["13b-replay-tray-360", { ...PHONE, width: 360, height: 780 }], ["13c-replay-tray-375", PHONE], ["13d-replay-tray-390", { ...PHONE, width: 390, height: 844 }]]) {
    await deb.setViewport(vp);
    const tray = await deb.$$eval(".fr-tray .ctile", (t) => t.map((x) => ({
      width: Math.round(x.getBoundingClientRect().width), font: getComputedStyle(x.querySelector(".ew")).fontSize,
    })));
    assert.ok(tray.every((t) => t.width >= 88 && t.font === boardFont), `${name}: tray stays readable (${boardFont}): ${JSON.stringify(tray)}`);
    await showTray(deb);
    await shot(deb, name);
  }
  await deb.setViewport(PHONE);
  await deb.locator('.fr-step-dot[aria-label="Guess 2"]').click();
  await sleep(600);
  await shot(deb, "14-replay-guess2-375");
  const g2 = await readBoard(deb);
  assert.equal(g2.board.filter((c) => c.locked).length, 4, "guess 2 shows all four right");
  assert.ok(g1.board.some((c) => !c.locked), "guess 1 shows misses");
  assert.deepEqual(g1.board.map((c) => c.words), before.board.map((c) => c.words), "replay shows Sam's actual first board, turn for turn");
  await shot(deb, "14b-replay-desktop", { width: 1280, height: 900, deviceScaleFactor: 1 });
  await deb.setViewport(PHONE);

  // 9. Deb plays Sam's puzzle and loses.
  await deb.locator(".fr-back").click();
  const { data: samInbox } = await (await apiAs(sam)).rpc("get_friends_inbox");
  const backId = samInbox.friends[0].outgoing.puzzle_id;
  const { data: backAnswer } = await (await apiAs(sam)).rpc("open_friend_puzzle", { p_puzzle_id: backId });
  await click(deb, "Play Sam's puzzle");
  await chooseDifficulty(deb, "Easy");
  await sleep(900);
  assert.equal(await trayCount(deb), 0, "Easy deals none of Sam's bonus cards");
  await shot(deb, "15a-deb-play-easy-375");
  await submitAndSettle(deb);
  await nudgeWrong(deb, backAnswer); await submitAndSettle(deb);
  await nudgeWrong(deb, backAnswer); await deb.locator("button.sbtn").click();
  await deb.waitForSelector(".fr-done", { timeout: 20000 });
  await sleep(500);
  await waitText(deb, "The veil stayed closed");
  await shot(deb, "15-deb-loss-handoff-375");
  await shot(deb, "15-deb-loss-handoff-360", { ...PHONE, width: 360, height: 780 });
  await shot(deb, "15-deb-loss-handoff-390", { ...PHONE, width: 390, height: 844 });
  await deb.setViewport(PHONE);
  const lossTiles = await deb.$$eval(".fr-done .fr-streak-num", (n) => n.map((x) => Number(x.textContent)));
  assert.deepEqual(lossTiles, [1, 0], "same period: Friend Streak stays 1; the loss resets Solve Streak to 0");
  assert.ok((await bodyText(deb)).includes("Streak already kept"));
  assert.ok(await deb.$("button::-p-text(Make one for Sam)"), "after finishing, the next step is making one");

  // 10. Sam sees Deb's three guesses and the answer.
  await sam.reload(); await openFriends(sam);
  await click(sam, "Watch Deb's guesses");
  await sam.waitForSelector(".fr-replay");
  assert.ok(await sam.$(".fr-playall"), "the replay can play through on its own");
  const dots = await sam.$$eval(".fr-step-dot", (d) => d.map((x) => x.getAttribute("aria-label")));
  assert.deepEqual(dots, ["Guess 1", "Guess 2", "Guess 3", "The answer"]);
  await sam.locator('.fr-step-dot[aria-label="Guess 3"]').click(); await sleep(600);
  await shot(sam, "16-replay-loss-guess3-375");
  await sam.locator('.fr-step-dot[aria-label="The answer"]').click(); await sleep(600);
  await shot(sam, "17-replay-loss-answer-375");
  await sam.locator('.fr-step-dot[aria-label="Guess 1"]').click(); await sleep(400);
  assert.equal(await sam.$eval(".fr-tray-empty", (el) => el.textContent), "No bonus cards on Easy.", "Deb's tray was empty on Easy");
  assert.equal(await sam.$(".fr-tray .ctile"), null, "Easy: no cards shown in the tray");
  assert.equal(await sam.$(".fr-bonus"), null, "no undealt cards in the replay");
  await assertNoDuplicateCards(sam, "Easy guess 1");
  await showTray(sam);
  await shot(sam, "17b-replay-tray-easy-375");

  // 10b. Coming back to a finished puzzle later still offers its results.
  await sam.reload(); await openFriends(sam);
  await click(sam, "Past puzzles", "button");
  await sam.locator(".fr-history-item::-p-text(Deb → you)").click();
  await sam.waitForSelector(".fr-results-btn");
  await sam.locator(".fr-results-btn").click();
  await waitText(sam, "You read Deb's mind");
  await shot(sam, "17c-sam-results-later-375");
  await click(sam, "Close");
  await sam.goto(`${SAM_URL}/?friends=1&puzzle=${puzzleId}`, { waitUntil: "networkidle0" });
  await sam.waitForSelector(".fr-results-btn");
  await sam.locator(".fr-results-btn").click();
  await waitText(sam, "You read Deb's mind");
  await click(sam, "See the board");
  log("Results available when coming back later (Past puzzles and a direct link)");

  // 11. Both inboxes agree on the shared numbers.
  for (const [who, p] of [["deb", deb], ["sam", sam]]) {
    await p.reload(); await openFriends(p);
    await p.waitForSelector(".fr-streak-num");
    const nums = await p.$$eval(".fr-card .fr-streak-num", (n) => n.slice(0, 2).map((x) => Number(x.textContent)));
    assert.deepEqual(nums, [1, 0], `${who} sees Friend Streak 1, Solve Streak 0`);
    const buttons = await p.$$eval(".fr-card .fr-btn", (b) => b.map((x) => x.textContent.trim()));
    assert.equal(buttons[0], who === "deb" ? "Make one for Sam" : "Make one for Deb", `${who}'s next step`);
    const rows = await p.$$eval(".fr-card .fr-rowbtn", (b) => b.map((x) => x.textContent.trim()));
    if (who === "sam") assert.ok(rows.some((t) => t.startsWith("Watch Deb's guesses")), "the replay stays one tap away");
    await shot(p, `18-${who}-inbox-final-375`);
  }
  await shot(sam, "18b-sam-inbox-final-desktop", { width: 1280, height: 860, deviceScaleFactor: 1 });
  await sam.setViewport(PHONE);

  // 11b. Nothing finished yet this period: the clock is the time left to keep it.
  const { data: fs1 } = await admin.from("friendships").select("id, daily_anchor").or(`user_a.eq.${debAcct.id},user_b.eq.${debAcct.id}`).single();
  await admin.from("friendships").update({ daily_anchor: new Date(new Date(fs1.daily_anchor).getTime() - 30 * 3600e3).toISOString() }).eq("id", fs1.id);
  await sam.reload(); await openFriends(sam);
  await sam.waitForSelector('.fr-clock[data-clock="keep"]');
  const keep = await sam.$eval('.fr-clock[data-clock="keep"]', (el) => el.innerText);
  assert.match(keep, /Time left to keep your streak\s+\d+h \d\dm/);
  await sam.$eval(".fr-streaks", (el) => el.scrollIntoView({ block: "start" }));
  await shot(sam, "18c-sam-streak-time-left-375");
  log("time-left clock:", keep.replace(/\s+/g, " "));

  // 12. Closing the app and coming back later: a new tab in the same
  // browser opens straight into Deb's own Friends, no sign-in.
  await deb.close();
  const deb2 = await debCtx.newPage();
  await deb2.setViewport(PHONE);
  await deb2.emulateTimezone("America/Denver");
  deb2.on("pageerror", (e) => errors.push(`deb2: ${e.message}`));
  pages.push(["deb2", deb2]);
  await deb2.goto(DEB_URL, { waitUntil: "networkidle0" });
  await openFriends(deb2);
  await waitText(deb2, "Make one for Sam");
  assert.ok((await bodyText(deb2)).includes("Signed in as Deb"), "Deb is still Deb after reopening");
  log("reopened: Deb resumes signed in");

  // 13. Sign-out and switching accounts on Sam's phone.
  await signOutBrowser(sam);
  assert.equal(await sam.$(".friends-dot"), null, "no Friends dot once signed out");
  await openFriends(sam);
  await assertSignedOutFriends(sam);
  assert.ok(!(await bodyText(sam)).includes("Deb"), "nothing of Sam's friendship shows signed out");
  const leftover = await sam.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("invite") || k === "cv-auth"));
  assert.deepEqual(leftover, [], "sign-out leaves no session or pending invite behind");
  await signInBrowser(sam, eveAcct, "/?friends=1");
  await sam.waitForSelector("#fr-name");
  assert.ok(!(await bodyText(sam)).includes("Deb"), "a different account sees none of Sam's friends");
  await shot(sam, "19-account-switch-eve-375");
  await signOutBrowser(sam);
  await signInBrowser(sam, samAcct, "/?friends=1");
  await waitText(sam, "Make one for Deb");
  assert.ok((await bodyText(sam)).includes("Signed in as Sam"), "Sam's own Friends come back");
  log("sign-out and account switching ok");

  assert.deepEqual(errors, [], "no page errors");
  console.log(`\nPASS — screenshots in ${OUT}`);
} catch (err) {
  for (const [who, p] of pages) await p.screenshot({ path: path.join(OUT, `FAILED-${who}.png`) }).catch(() => {});
  throw err;
} finally {
  await browser.close();
}
