// Puzzles sent by link, in real browsers at phone width. Sam's one main
// action, "Make a puzzle for a friend", gives a link; Dad opens it with no
// account, plays (a refresh halfway), wins, taps "Make one for Sam", learns
// why an account, backs out of the sign-in, comes back, signs up (a refresh
// on the name step) and lands in the creator for Sam, already connected,
// and sends one back. Eve, who already has an account, goes straight from
// her result to the creator, twice, with one friendship. Also: opening (or a text-message preview) never claims
// it; a forwarded link in another browser can't take over; the sender's
// fresh-link recovery; an expired link; the sender's own link.
// Needs the local stack and `npm run friends:dev` (see e2e.mjs).
//   node tests/friends/guest.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { admin, makePlayer, rpc } from "./helpers.mjs";
import { makeAccount } from "../db/helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";
import { readBoard, solve } from "./board.mjs";

const OUT = path.resolve(process.argv[2] || "friends-guest-shots");
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const click = (page, t, tag = "button") => page.locator(`${tag}::-p-text(${t})`).click();
const shot = async (page, name) => { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log("screenshot", name); };
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
const linkState = async (sam, puzzleId) => (await rpc(sam.client, "list_share_links")).find((l) => l.puzzle_id === puzzleId)?.state;

async function writeClues(page, clues) {
  const order = [clues[0], clues[3], clues[1], clues[2]]; // DOM: top, left, right, bottom
  for (let i = 0; i < 4; i++) {
    const pill = (await page.$$(".fr-board-stage .ctab.editable"))[i];
    await pill.evaluate((el) => el.scrollIntoView({ block: "center" }));   // clear of the sticky action bar
    await pill.click();
    await page.waitForSelector(".fr-sheet input");
    await page.keyboard.type(order[i]);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".fr-sheet", { hidden: true });
  }
}

const sam = await makePlayer("Sam");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const newPage = async (name) => {
  const p = await (await browser.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await p.setViewport(PHONE);
  await p.goto(APP_URL, { waitUntil: "networkidle0" });
  await p.evaluate(() => localStorage.setItem("clover_tutorial_seen", "true"));
  return p;
};
try {
  // ── 1. Sam makes a puzzle for someone new and gets a link ─────────────
  const s = await newPage("sam");
  await signInBrowser(s, sam, "/friends");
  await waitText(s, "Make a puzzle for a friend");
  const hub = await text(s);
  assert.ok(!/invite/i.test(hub), "no separate invite action");
  assert.ok(!hub.includes("keep your streaks going"), "no streak talk without a streak");
  assert.ok(await s.$(".fr-page > .fr-head + .fr-make-cta"), "the main action sits right under the heading");
  await shot(s, "g00-sender-hub");
  await click(s, "Make a puzzle for a friend");
  await s.waitForSelector(".fr-board-stage");
  await waitText(s, "Tap a clue or a word");
  await click(s, "Deal Random Cards");
  await sleep(300);
  await writeClues(s, ["OCEAN", "NIGHT", "GARDEN", "TOYS"]);
  await s.locator('input[aria-label="Who it\'s for"]').fill("Dad");
  await shot(s, "g01-sender-creator");
  await click(s, "Get link");
  await waitText(s, "Your link is ready");
  const link = await s.$eval('input[aria-label="Puzzle link"]', (el) => el.value);
  assert.match(link, /\/p\/[A-Za-z0-9_-]{24}$/);
  await shot(s, "g02-sender-link-ready");
  const token = link.split("/p/")[1];
  const puzzleId = (await rpc(sam.client, "list_share_links"))[0].puzzle_id;
  log("link made", link.replace(token, "…"));

  // ── 2. A text-message preview, and simply opening it, claim nothing ───
  const preview = await fetch(link);
  assert.equal(preview.status, 200, "the link loads straight from the host");
  const looker = await newPage("looker");
  await looker.goto(link, { waitUntil: "networkidle0" });
  await waitText(looker, "Sam made you a puzzle");
  await looker.reload({ waitUntil: "networkidle0" });
  assert.equal(await linkState(sam, puzzleId), "waiting", "opening it twice claimed nothing");
  log("preview + opening leave it unclaimed");

  // ── 3. Dad, no account: Play ──────────────────────────────────────────
  const dad = await newPage("dad");
  await dad.goto(link, { waitUntil: "networkidle0" });
  await waitText(dad, "Sam made you a puzzle");
  const intro = await text(dad);
  assert.ok(intro.includes("No account needed") && intro.includes("saved in this browser"), "the browser rule, simply");
  assert.ok(!intro.includes("Sign in"), "no sign-in asked to play");
  assert.equal((await dad.$$(".fr-btn.primary")).length, 1, "one main button: Play");
  await shot(dad, "g03-guest-landing");
  await click(dad, "Play");
  await dad.waitForSelector(".csurface .ctile"); await sleep(900);
  assert.equal(await linkState(sam, puzzleId), "playing", "starting claims it");
  await shot(dad, "g04-guest-playing");
  // One wrong guess, then a refresh: the same game comes back.
  await dad.locator("button.sbtn").click(); await sleep(4800);
  assert.equal(await lives(dad), 2);
  const before = await readBoard(dad);
  await dad.reload({ waitUntil: "networkidle0" });
  await dad.waitForSelector(".csurface .ctile"); await sleep(700);
  assert.equal(await lives(dad), 2, "lives kept on refresh");
  assert.deepEqual((await readBoard(dad)).board.map((c) => c.words), before.board.map((c) => c.words), "board kept on refresh");
  log("refresh resumes Dad's game in his browser");

  // ── 4. The link forwarded to another browser can't take over ──────────
  await looker.goto(link, { waitUntil: "networkidle0" });
  await waitText(looker, "started in another browser");
  assert.ok((await text(looker)).includes("Ask Sam to send you a fresh link"));
  assert.equal(await looker.$(".csurface"), null, "no board for the other browser");
  await shot(looker, "g05-forwarded-other-browser");

  // ── 5. Dad wins: the result, no streaks, the offer to save ────────────
  const answer = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
  await solve(dad, answer);
  await dad.locator("button.sbtn").click();
  await dad.waitForSelector(".fr-done", { timeout: 15000 });
  await waitText(dad, "You read Sam's mind");
  assert.equal(await dad.$(".fr-done .fr-streak-num"), null, "no streaks for a guest");
  await waitText(dad, "Make one for Sam");
  assert.ok(!/streak|save your result/i.test(await dad.$eval(".fr-done", (el) => el.innerText)), "one offer, and no streak promised");
  await shot(dad, "g06-guest-result");
  await click(dad, "See the board");
  await dad.waitForSelector(".fr-results-btn");
  await dad.reload({ waitUntil: "networkidle0" });
  await waitText(dad, "You solved it");
  await dad.locator(".fr-results-btn").click();
  await waitText(dad, "Make one for Sam");
  log("result shows again after a refresh, with Results");

  // ── 6. Sam watches Dad's guesses ──────────────────────────────────────
  await s.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });
  await waitText(s, "For Dad");
  await waitText(s, "Dad solved it");
  await shot(s, "g07-sender-hub-finished");
  await click(s, "Watch Dad's guesses");
  await s.waitForSelector(".fr-anim .fr-playall");   // every move: the guest's play was recorded
  assert.ok((await text(s)).includes("Played by link"));
  await shot(s, "g08-sender-replay");

  // ── 7. Dad: "Make one for Sam" → why an account → sign up → his puzzle back ─
  await dad.locator(".fr-done button::-p-text(Make one for Sam)").click();
  await waitText(dad, "Sign up so your puzzle can reach Sam");
  const why = await text(dad);
  assert.ok(why.includes("saves your result and connects you with Sam"), "one short reason for the account");
  assert.ok(!/streak/i.test(why), "an account alone earns no streak, so none is promised");
  await shot(dad, "g09-guest-why-account");
  await click(dad, "Back to the board");                   // changed his mind: nothing lost
  await waitText(dad, "You solved it");
  await click(dad, "Make one for Sam");
  await click(dad, "Sign up or sign in");
  await dad.waitForFunction(() => sessionStorage.getItem("cv-share-save")); // locally the shared sign-in isn't wired; the tap remembered the plan
  // Interrupted: he backs out of the sign-in page. The game and the offer are still here.
  await dad.reload({ waitUntil: "networkidle0" });
  await waitText(dad, "You solved it");
  await dad.waitForSelector(".fr-banner button::-p-text(Make one for Sam)");
  assert.equal(await linkState(sam, puzzleId), "finished", "nothing saved without an account");
  // Then he finishes signing up; the sign-in returns to the link.
  const dadAcct = await makeAccount("dad");
  await signInBrowser(dad, dadAcct, `/p/${token}`);
  await dad.waitForSelector("#fr-name");
  await waitText(dad, "Sam will see it on the puzzle you make");
  await dad.reload({ waitUntil: "networkidle0" });          // a refresh on the name step keeps the plan
  await dad.waitForSelector("#fr-name");
  await dad.locator("#fr-name").fill("Dad");
  await shot(dad, "g10-guest-name");
  await click(dad, "Continue");
  await dad.waitForFunction(() => location.pathname.startsWith("/friends/make/") && !location.pathname.endsWith("/new"), { timeout: 15000 });
  await dad.waitForSelector(".fr-board-stage");
  await waitText(dad, "Make one for Sam");
  await waitText(dad, "Your result is saved, and you're connected with Sam");
  assert.equal(await dad.evaluate(() => sessionStorage.getItem("cv-share-save")), null, "the plan is done");
  await shot(dad, "g11-return-creator");
  const dadFid = (await rpc(dadAcct.client, "get_friends_inbox")).friends[0].friendship_id;
  assert.equal(dad.url(), `${APP_URL}/friends/make/${dadFid}`);
  await dad.reload({ waitUntil: "networkidle0" });          // a refresh keeps him in the creator for Sam
  await dad.waitForSelector(".fr-board-stage");
  await waitText(dad, "Make one for Sam");
  // The return puzzle, sent to Sam.
  await click(dad, "Deal Random Cards");
  await sleep(300);
  await writeClues(dad, ["RIVER", "STARS", "BREAD", "KITE"]);
  await click(dad, "Send puzzle to Sam");
  await dad.waitForFunction(() => location.pathname === "/friends", { timeout: 15000 });
  await shot(dad, "g12-dad-hub-after-send");
  const dadInbox = await rpc(dadAcct.client, "get_friends_inbox");
  assert.equal(dadInbox.friends.length, 1, "one friendship");
  assert.equal(dadInbox.friends[0].daily_streak, 0, "streak rules unchanged: a guest finish starts none");
  assert.ok(!(await text(dad)).includes("keep your streaks going"), "no streak talk without a streak");
  const hist = await rpc(dadAcct.client, "list_friend_history", { p_friendship_id: dadFid });
  assert.deepEqual(hist.map((h) => h.direction).sort(), ["received", "sent"], "his saved result (once) and his puzzle back");
  await dad.goto(link, { waitUntil: "networkidle0" });      // the old link now opens his saved result
  await dad.waitForFunction((id) => location.pathname === `/friends/guesses/${id}`, { timeout: 15000 }, puzzleId);
  log("Dad: played, signed up, saved, connected once, sent one back");
  await s.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });
  await waitText(s, "Play Dad's puzzle");
  assert.ok(!(await text(s)).includes("For Dad"), "no longer a pending link for Sam");
  await shot(s, "g13-sender-gets-puzzle-back");

  // ── 7b. Eve already has an account: no friend request first ────────────
  const eve = await makePlayer("Eve");
  const sb = (await import("./helpers.mjs")).sampleBoard;
  const forEve = async () => {
    const d = await rpc(sam.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sb("EVE") });
    return rpc(sam.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "Eve" });
  };
  const ev = await newPage("eve");
  await signInBrowser(ev, eve, "/");
  let eveFid = null;
  for (const round of [1, 2]) {   // the second time they're already connected: still one friendship
    const shared = await forEve();
    await ev.goto(`${APP_URL}/p/${shared.token}`, { waitUntil: "networkidle0" });
    await waitText(ev, "Sam made you a puzzle");
    await click(ev, "Play");
    await ev.waitForSelector(".csurface .ctile"); await sleep(700);
    await solve(ev, await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: shared.puzzle_id }));
    await ev.locator("button.sbtn").click();
    await ev.waitForSelector(".fr-done", { timeout: 15000 });
    if (round === 1) await shot(ev, "g14-account-result");
    await ev.locator(".fr-done button::-p-text(Make one for Sam)").click();
    await ev.waitForFunction(() => /^\/friends\/make\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
    await waitText(ev, "Your result is saved, and you're connected with Sam");
    assert.equal(await ev.$("#fr-name"), null, "no name step for an existing account");
    const fid = ev.url().split("/friends/make/")[1];
    if (round === 1) { eveFid = fid; await shot(ev, "g15-account-return-creator"); }
    assert.equal(fid, eveFid, "the same friendship both times");
  }
  const eveInbox = await rpc(eve.client, "get_friends_inbox");
  assert.equal(eveInbox.friends.length, 1, "connected once");
  assert.equal((await rpc(eve.client, "list_friend_history", { p_friendship_id: eveFid })).length, 2, "both results saved");
  log("Eve (existing account): played from the link, then straight into making one back");

  // ── 8. Recovery: stuck in another browser → a fresh link ──────────────
  const d2 = await rpc(sam.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "",
    p_board: (await import("./helpers.mjs")).sampleBoard("MOM") });
  const mom = await rpc(sam.client, "create_share_link", { p_draft_id: d2.id, p_version: d2.version, p_label: "Mom" });
  const momA = await newPage("momA");
  await momA.goto(`${APP_URL}/p/${mom.token}`, { waitUntil: "networkidle0" });
  await click(momA, "Play");
  await momA.waitForSelector(".csurface .ctile");
  await s.reload({ waitUntil: "networkidle0" });
  await waitText(s, "Mom started playing");
  await shot(s, "g16-sender-playing-recovery");
  await click(s, "Send a fresh link");
  await waitText(s, "New link ready");
  const freshLink = await s.$eval('section[aria-label="Puzzle link for Mom"] input[aria-label="Puzzle link"]', (el) => el.value);
  assert.notEqual(freshLink, `${APP_URL}/p/${mom.token}`);
  await shot(s, "g17-sender-fresh-link");
  await momA.reload({ waitUntil: "networkidle0" });
  await waitText(momA, "This link doesn't work");
  const momB = await newPage("momB");
  await momB.goto(freshLink, { waitUntil: "networkidle0" });
  await waitText(momB, "Sam made you a puzzle");
  log("fresh link: old link dead, a new browser can start");

  // ── 9. Expired, and the sender's own link ─────────────────────────────
  await admin.from("friend_puzzles").update({ share_expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("share_token", freshLink.split("/p/")[1]);
  await momB.reload({ waitUntil: "networkidle0" });
  await waitText(momB, "This link has expired");
  await shot(momB, "g18-expired");
  await s.reload({ waitUntil: "networkidle0" });
  await waitText(s, "The link expired before Mom finished");
  await s.goto(freshLink, { waitUntil: "networkidle0" });
  await waitText(s, "This is your link");

  // ── 10. A guest gets nothing else ─────────────────────────────────────
  await looker.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });
  await looker.waitForSelector("button.fr-btn.primary::-p-text(Sign in)");
  await looker.goto(`${APP_URL}/friends/guesses/${puzzleId}`, { waitUntil: "networkidle0" });
  await looker.waitForSelector("button.fr-btn.primary::-p-text(Sign in)");
  assert.ok(!(await text(looker)).includes("OCEAN"), "nothing of the puzzle without the link");

  assert.deepEqual(errors, [], "no page errors");
  console.log(`\nPASS — screenshots in ${OUT}`);
} finally {
  await browser.close();
}
