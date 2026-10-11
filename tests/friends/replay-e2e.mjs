// The animated replay, end to end in real browsers: Sam plays Deb's puzzle
// through the real UI — card turns, swaps, a bonus card onto the board,
// Rotate, Reset (undo), a refresh halfway, three guesses — and Deb then
// watches every move played back. A guest-link game is checked as well.
// With --video <file.mp4|.webm> the two phones are screen-recorded (Chrome's
// own screencast, encoded by the browser; no other tools needed). Sam's
// part is sped up 1.5× in the video; Deb's replay plays at its real speed.
//
// Needs the local stack and `npm run friends:dev` (5186), like e2e.mjs.
//   node tests/friends/replay-e2e.mjs [--video out.mp4] [--shots folder]
import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { admin, rpc, makePlayer, befriend, sendPuzzle, choose } from "./helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";
import { DOM_TO_SLOT, readBoard, slotEls, drag, tap, answerWords, key, solve } from "./board.mjs";

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const VIDEO = arg("--video");
const SHOTS = arg("--shots");   // folder for screenshots of the replay mid-play
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const human = () => sleep(650 + Math.random() * 500);

// A small readable puzzle: clues top, right, bottom, left; answer cards first.
function demoBoard() {
  const words = [
    ["ROSE", "SHELL", "TOWER", "SNOW"], ["BEE", "WAVE", "KNIGHT", "ICE"], ["SOIL", "CORAL", "MOAT", "FROST"],
    ["TULIP", "TIDE", "CROWN", "SLED"], ["PIANO", "ROBOT", "CLOUD", "PEPPER"], ["LADDER", "MIRROR", "ENGINE", "PILLOW"],
    ["CANDLE", "PLANET", "RIBBON", "TICKET"],
  ];
  const cards = {};
  words.forEach((w, i) => { cards[`u${i + 1}`] = { id: `u${i + 1}`, words: w }; });
  return {
    clues: ["GARDEN", "OCEAN", "CASTLE", "WINTER"], cards,
    slots: words.map((_, i) => ({ cardId: `u${i + 1}`, orientation: [0, 1, 2, 3, 0, 1, 2][i] })),
  };
}

// ── Screen recording (CDP screencast frames) ──────────────────────────
const segments = [];
async function record(page, title, speed = 1) {
  if (!VIDEO) return async () => {};
  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 72, maxWidth: 780, maxHeight: 1688 });
  return async () => { await cdp.send("Page.stopScreencast").catch(() => {}); segments.push({ title, frames, speed }); };
}

// Plays the frames back on a canvas in real time and records it to WebM.
async function encode(browser, file) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const all = segments.flatMap((s, si) => s.frames.map((f, i) => ({ si, i })));
  await page.exposeFunction("frameData", (n) => { const { si, i } = all[n]; return segments[si].frames[i].data; });
  // Holds: real gaps between frames (sped up per segment), dead waits shortened.
  const timeline = segments.map((s) => ({
    title: s.title,
    holds: s.frames.map((f, i) => Math.min(1.2, ((s.frames[i + 1]?.t ?? f.t + 1) - f.t) / s.speed)),
  }));
  const mimeType = file.endsWith(".mp4") ? "video/mp4;codecs=avc1" : "video/webm;codecs=vp9";
  const b64 = await page.evaluate(async (timeline, mimeType) => {
    const canvas = document.createElement("canvas");
    canvas.width = 540; canvas.height = 1168;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 1_600_000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const card = async (text) => {
      ctx.fillStyle = "#f7f3fc"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3b1c6e"; ctx.font = "800 38px sans-serif"; ctx.textAlign = "center";
      text.split("\n").forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 28 + i * 50));
      await wait(1400);
    };
    rec.start(250);
    let n = 0;
    for (const seg of timeline) {
      await card(seg.title);
      for (const hold of seg.holds) {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${await window.frameData(n++)}`;
        await img.decode();
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.width * (img.height / img.width));
        await wait(Math.max(16, hold * 1000));
      }
    }
    await wait(500);
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    const buf = await new Blob(chunks, { type: mimeType }).arrayBuffer();
    let s = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, timeline, mimeType);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  await page.close();
  log("video saved", file, `${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

// ── Playing on the board ───────────────────────────────────────────────
const boardState = async (page) => {
  const s = await readBoard(page);
  return [...DOM_TO_SLOT.map((slot, i) => [slot, s.board[i]]).sort((x, y) => x[0] - y[0]).map((x) => x[1]), ...s.tray];
};
// Puts the answer card for `slot` there and turns it the right way up.
async function place(page, want, slot) {
  let cards = await boardState(page);
  const at = cards.findIndex((c) => key(c.words) === key(want[slot]));
  if (at !== slot) { await drag(page, (await slotEls(page))[at], (await slotEls(page))[slot]); await human(); }
  for (let t = 0; t < 4; t++) {
    cards = await boardState(page);
    if (cards[slot].top === want[slot][0]) break;
    await tap(page, (await slotEls(page))[slot]); await sleep(250);
  }
}
// Makes sure an unlocked slot isn't right by accident.
async function spoil(page, want, slot) {
  const c = (await boardState(page))[slot];
  if (key(c.words) === key(want[slot]) && c.top === want[slot][0]) { await tap(page, (await slotEls(page))[slot]); await human(); }
}
const lives = (page) => page.$$eval(".game-lives .life:not(.lost)", (l) => l.length);
async function submit(page) {
  await page.locator(".sbtn:not([disabled])").click();
  await page.waitForFunction(() => !document.querySelector(".ctile.reveal-grey"), { timeout: 15000 });
  await sleep(1800);
}
const lsMoves = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cv-moves:"))
  .map((k) => JSON.parse(localStorage.getItem(k))));

// ── The run ───────────────────────────────────────────────────────────
const [deb, sam] = [await makePlayer("Deb"), await makePlayer("Sam")];
const fid = await befriend(deb, sam);
const pid = await sendPuzzle(deb, fid, demoBoard());
await choose(sam, pid, "expert");
const answer = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: pid });
const want = answerWords(answer);
log("puzzle sent and started on Expert", pid);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--autoplay-policy=no-user-gesture-required"] });
try {
  const samPage = await (await browser.createBrowserContext()).newPage();
  const debPage = await (await browser.createBrowserContext()).newPage();
  await samPage.setViewport(PHONE); await debPage.setViewport(PHONE);
  await signInBrowser(samPage, sam, `/friends/play/${pid}`);
  await samPage.waitForSelector(".csurface .ctile");
  assert.equal(await samPage.$eval(".fr-recnote", (e) => e.textContent), "Deb can watch a replay of your moves.");
  const stopSam = await record(samPage, "Sam plays Deb's puzzle\n(sped up 1.5×)", 1.5);
  await sleep(1400);   // the intro shuffle

  // Guess 1: a shuffle, two cards turned and moved into place, a swap, a bonus card in.
  await samPage.locator(".cbtn::-p-text(Shuffle)").click(); await human();
  let els = await slotEls(samPage);
  await tap(samPage, els[2]); await sleep(200); await tap(samPage, els[2]); await human();
  await drag(samPage, els[0], els[3]); await human();
  await drag(samPage, (await slotEls(samPage))[4], (await slotEls(samPage))[1]); await human();
  await place(samPage, want, 0); await place(samPage, want, 1);
  await spoil(samPage, want, 2); await spoil(samPage, want, 3);
  await submit(samPage);
  assert.equal(await lives(samPage), 2, "guess 1 was wrong");
  log("guess 1 submitted");

  // Rotate, a turn — then Reset undoes them back to guess 1's board.
  await human();
  await samPage.locator(".cbtn::-p-text(Rotate)").click(); await sleep(900);
  els = await slotEls(samPage);
  const free = (await boardState(samPage)).findIndex((c, i) => i < 4 && !c.locked);
  await tap(samPage, els[free]); await human();
  await samPage.locator(".cbtn::-p-text(Reset)").click(); await human();
  assert.deepEqual((await boardState(samPage)).slice(0, 4).map((c) => c.locked), [true, true, false, false],
    "Reset puts the confirmed cards back where guess 1 confirmed them");
  log("rotate, turn, reset (undo)");

  // A move, then a refresh: play carries on where it was.
  await place(samPage, want, 2); await human();
  await sleep(500);
  await samPage.reload({ waitUntil: "networkidle0" });
  await samPage.waitForSelector(".csurface .ctile"); await sleep(900);
  log("refreshed mid-play");
  await spoil(samPage, want, 3);
  els = await slotEls(samPage);
  await tap(samPage, els[3]); await human();          // a new placement, still wrong
  await spoil(samPage, want, 3);
  await submit(samPage);
  assert.equal(await lives(samPage), 1, "guess 2 was wrong");
  log("guess 2 submitted");

  await place(samPage, want, 3); await human();
  await samPage.locator(".sbtn:not([disabled])").click();
  await samPage.waitForSelector(".fr-done", { timeout: 15000 });
  await sleep(2500);
  await stopSam();
  assert.equal((await admin.from("friend_puzzles").select("outcome").eq("id", pid).single()).data.outcome, "won");
  log("guess 3 solved it");

  // Everything reached the server, exactly once, in order.
  await samPage.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });   // leaving flushes
  await sleep(800);
  const { data: logRow } = await admin.from("friend_move_logs").select("actions,cursors").eq("puzzle_id", pid).single();
  const kinds = logRow.actions.map((a) => a.k);
  log("recorded:", kinds.join(" "), `(${JSON.stringify(logRow).length} bytes, ${Object.keys(logRow.cursors).length} page loads)`);
  assert.deepEqual(kinds.filter((k) => k === "g"), ["g", "g", "g"]);
  assert.deepEqual(logRow.actions.filter((a) => a.k === "g").map((a) => a.n), [1, 2, 3], "each guess once, in order");
  for (const k of ["s", "x", "t", "m", "r", "z"]) assert.ok(kinds.includes(k), `recorded a ${k}`);
  assert.ok(kinds.filter((k) => k === "s").length >= 2, "a snapshot at the start and after the refresh");
  assert.ok(!kinds.includes("gap"), "nothing lost");
  assert.deepEqual((await lsMoves(samPage)).filter((s) => s.pending.length), [], "nothing left unsent");

  // Deb watches.
  const before = (await admin.from("friend_puzzles").select("outcome,lives_used,finished_at,creator_seen_result_at").eq("id", pid).single()).data;
  const streakBefore = (await admin.from("friendships").select("*").eq("id", fid).single()).data;
  // Deb has news: the green dot on the header icon and on Sam's card.
  const unseen = async () => (await rpc(deb.client, "get_friends_inbox")).friends.find((f) => f.friendship_id === fid).unseen_result;
  assert.ok(await unseen(), "the finished result is unread before Deb opens it");
  await signInBrowser(debPage, deb, "/friends");
  await debPage.waitForSelector(".fr-friend .fr-dot-new");
  await debPage.waitForSelector(".friends-dot");
  await debPage.locator("button.fr-btn.primary::-p-text(Watch Sam's guesses)").click();
  await debPage.waitForSelector(".fr-anim .fr-playall");
  const seenAt = (await admin.from("friend_puzzles").select("creator_seen_result_at").eq("id", pid).single()).data.creator_seen_result_at;
  assert.ok(seenAt, "opening the replay marks the result seen, as before");
  assert.equal(await unseen(), null, "and it's no longer unread");
  await debPage.waitForFunction(() => !document.querySelector(".friends-dot"), { timeout: 8000 });
  log("opening the replay marked it seen; the header dot cleared");
  const stopDeb = await record(debPage, "Deb watches the replay\n(real speed)");
  await sleep(1200);
  await debPage.locator(".fr-anim .fr-playall").click();
  const started = Date.now();
  const captions = new Set();
  let shot = false;
  while (Date.now() - started < 120000) {
    const caption = await debPage.$eval(".fr-anim-caption", (e) => e.textContent);
    captions.add(caption);
    if (SHOTS && !shot && caption.startsWith("Swapped in a bonus card")) {
      shot = true;
      await debPage.screenshot({ path: `${SHOTS}/replay-390x844.png` });
    }
    if (await debPage.$(".fr-anim .fr-playall[aria-label='Replay from the start']")) break;
    await sleep(150);
  }
  await sleep(2000);
  await stopDeb();
  log(`replay played in ${((Date.now() - started) / 1000).toFixed(1)} s:`, [...captions].filter(Boolean).join(" / "));
  for (const c of ["Shuffled", "Turned a card", "Swapped two cards", "Swapped in a bonus card", "Rotated the board",
    "Came back to the puzzle", "Submitted guess 1", "Submitted guess 2", "Submitted guess 3", "Sam solved it"]) {
    assert.ok([...captions].some((x) => x.startsWith(c)), `replay showed "${c}"`);
  }
  assert.ok([...captions].some((x) => x.startsWith("Reset")), "replay showed the reset (undo)");
  assert.equal(await debPage.$(".fr-anim-note"), null, "a complete recording has no missing-moves note");
  const after = (await admin.from("friend_puzzles").select("outcome,lives_used,finished_at,creator_seen_result_at").eq("id", pid).single()).data;
  assert.deepEqual({ ...after, creator_seen_result_at: null }, { ...before, creator_seen_result_at: null }, "watching changed no result");
  assert.deepEqual((await admin.from("friendships").select("*").eq("id", fid).single()).data, streakBefore, "watching changed no streak");
  assert.equal((await admin.from("friend_move_logs").select("actions").eq("puzzle_id", pid).single()).data.actions.length, logRow.actions.length, "watching recorded nothing");
  // A small phone: the whole board still fits under the panel, with no sideways scroll.
  await debPage.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await debPage.locator(".fr-anim .fr-playall").click();
  // The panel scrolls to the top (smoothly), then the board is measured.
  await debPage.waitForFunction(() => Math.abs(document.querySelector(".fr-anim-bar").getBoundingClientRect().top - document.querySelector(".fr-wrap").getBoundingClientRect().top) < 2, { timeout: 8000 });
  await sleep(800);
  const fits = await debPage.evaluate(() => {
    const wrap = document.querySelector(".fr-wrap");
    const ctrls = document.querySelector(".fr-replay-game .ctrls").getBoundingClientRect();
    const scale = document.querySelector(".fr-replay-fit").getBoundingClientRect().width / document.querySelector(".fr-replay-fit").offsetWidth;
    return { sideways: wrap.scrollWidth - wrap.clientWidth, ctrlsBottom: ctrls.bottom, height: innerHeight, scale };
  });
  if (SHOTS) await debPage.screenshot({ path: `${SHOTS}/replay-375x667.png` });
  assert.ok(fits.sideways <= 1, "no sideways scroll");
  assert.ok(fits.ctrlsBottom <= fits.height + 1, `tray and controls are on screen (${fits.ctrlsBottom} of ${fits.height})`);
  log(`375×667: the board fits at ${Math.round(fits.scale * 100)}%`);
  await debPage.locator(".fr-anim .fr-playall").click();   // pause
  await debPage.setViewport(PHONE);
  // Guess by guess is still there.
  await debPage.locator(".fr-seg button::-p-text(Guess by guess)").click();
  await debPage.waitForSelector(".fr-steps");
  // Back on Friends: Sam's card has no dot; the replay stays one tap away.
  await debPage.locator(".fr-head .fr-back").click();
  await debPage.waitForSelector(".fr-friend");
  assert.equal(await debPage.$(".fr-dot-new"), null, "no green dot left on Friends");
  assert.equal(await debPage.$(".friends-dot"), null, "no header dot");
  await debPage.waitForSelector("::-p-text(Watch Sam's guesses)");
  log("back on Friends: no dots; Watch Sam's guesses still there");
  log("Deb watched the replay; result, streak and log unchanged");

  // A guest link: moves recorded through the link and guest key.
  const d = await rpc(deb.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: demoBoard() });
  const link = await rpc(deb.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "Pat" });
  const guestPage = await (await browser.createBrowserContext()).newPage();
  await guestPage.setViewport(PHONE);
  await guestPage.goto(`${APP_URL}/p/${link.token}`, { waitUntil: "networkidle0" });
  await guestPage.locator(".fr-choose .fr-btn.primary").click();
  await guestPage.waitForSelector(".csurface .ctile"); await sleep(1400);
  await tap(guestPage, (await slotEls(guestPage))[0]);
  await guestPage.locator(".sbtn:not([disabled])").click();
  await sleep(2500);
  const { data: guestLog } = await admin.from("friend_move_logs").select("actions").eq("puzzle_id", link.puzzle_id).single();
  assert.deepEqual(guestLog.actions.map((a) => a.k).filter((k) => k !== "x"), ["s", "t", "g"], "guest moves recorded");
  log("guest link: moves recorded through the link");

  // Pat finishes. Deb's link card then has a green dot (and the header);
  // opening the replay clears both, and the result and replay stay listed.
  if (!(await guestPage.$(".fr-done"))) {
    await sleep(3000);   // the wrong guess's red/green settles
    await solve(guestPage, await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id }));
    await guestPage.locator(".sbtn:not([disabled])").click();
  }
  await guestPage.waitForSelector(".fr-done", { timeout: 15000 });
  await sleep(1500);
  const linkRow = async () => (await rpc(deb.client, "list_share_links")).find((l) => l.puzzle_id === link.puzzle_id);
  assert.equal((await linkRow()).state, "finished");
  assert.equal((await linkRow()).seen_result, false, "Pat's result is unread");
  await debPage.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });
  const patCard = 'section[aria-label="Puzzle link for Pat"]';
  await debPage.waitForSelector(`${patCard} .fr-dot-new`);
  await debPage.waitForSelector(".friends-dot");
  await debPage.locator(`${patCard} button::-p-text(Watch Pat's guesses)`).click();
  await debPage.waitForSelector(".fr-anim .fr-playall");   // the every-move replay, from the guest's log
  assert.equal((await linkRow()).seen_result, true, "opening the replay marks Pat's result seen");
  await debPage.waitForFunction(() => !document.querySelector(".friends-dot"), { timeout: 8000 });
  await debPage.locator(".fr-head .fr-back").click();
  await debPage.waitForSelector(patCard);
  assert.equal(await debPage.$(`${patCard} .fr-dot-new`), null, "no dot left on Pat's link");
  assert.equal(await debPage.$(".friends-dot"), null, "no header dot");
  await debPage.locator(`${patCard} button::-p-text(Watch Pat's guesses)`).click();
  await debPage.waitForSelector(".fr-anim .fr-playall");
  log("guest link: opening the replay cleared its dots; the result and replay stay listed");

  // 2× halves the pauses (and glides): the same replay, timed at each speed.
  const timeReplay = async (speed) => {
    await debPage.locator(`.fr-anim-speed button::-p-text(${speed}×)`).click();
    const t0 = Date.now();
    await debPage.locator(".fr-anim .fr-playall").click();
    await debPage.waitForSelector(".fr-anim .fr-playall[aria-label='Pause the replay']");
    await debPage.waitForSelector(".fr-anim .fr-playall[aria-label='Replay from the start']", { timeout: 60000 });
    return Date.now() - t0;
  };
  const one = await timeReplay(1), two = await timeReplay(2);
  log(`Pat's replay: ${(one / 1000).toFixed(1)} s at 1×, ${(two / 1000).toFixed(1)} s at 2×`);
  assert.ok(two < one - 500, "2× is quicker");

  if (VIDEO) await encode(browser, VIDEO);
  log("ALL OK");
} finally {
  await browser.close();
}
