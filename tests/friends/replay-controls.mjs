// The replay's controls, in a real browser at phone size: 0.5× / 1× / 2×,
// Play/Pause, Previous guess and Restart, and the two-second reading pause
// after each completed guess.
//
// Sam plays two of Deb's puzzles (a win in three guesses, a loss in three)
// with recorded moves, made through the API; Deb watches the replays. Checks:
// the pause after a guess starts only once its reveal has finished and lasts
// ~2 s at every speed, while ordinary steps get no such pause; changing speed
// mid-play keeps the same board; Previous guess lands paused on the previous
// completed guess (or the start) exactly as the board stood then, from a
// hold, a move or a reveal in progress, and nothing pending plays on
// afterwards; Restart returns to the start, paused; playing on from there
// finishes; and no replay celebrates, saves, or changes the result, streak,
// move log or anything stored on the device.
// Needs the local stack and the friends dev server (see e2e.mjs).
//   FRIENDS_E2E_URL=http://127.0.0.1:5190 node tests/friends/replay-controls.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import puppeteer from "puppeteer-core";
import { admin, rpc, makePlayer, sampleBoard, befriend, sendPuzzle, choose, guess } from "./helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";

const OUT = path.resolve(process.argv[2] || "replay-controls-shots");
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// ── Seed: two finished puzzles with move logs ──────────────────────────────
const [deb, sam] = await Promise.all([makePlayer("Deb"), makePlayer("Sam")]);
const fid = await befriend(deb, sam);

async function playRecorded(prefix, win) {
  const pid = await sendPuzzle(deb, fid, sampleBoard(prefix));
  await choose(sam, pid, "expert");
  const view = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: pid });
  const answer = (await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: pid })).solution;
  const slots = view.card_order.map((cardId) => ({ cardId, orientation: 0 }));
  const clues = [...view.clues];
  const actions = [{ k: "s", b: slots.map((s) => `${s.cardId}:${s.orientation}`), c: clues, d: 0 }];
  let locked = new Set();
  const right = (i) => slots[i].cardId === answer.slotCards[i] && slots[i].orientation === answer.orientations[i];
  const tap = (s) => { slots[s] = { ...slots[s], orientation: (slots[s].orientation + 1) % 4 }; actions.push({ k: "t", s, d: 600 }); };
  const swap = (a, b) => { [slots[a], slots[b]] = [slots[b], slots[a]]; actions.push({ k: "m", a, b, d: 600 }); };
  const free = () => [0, 1, 2, 3].filter((i) => !locked.has(i));
  const submit = async (n) => {
    const res = await guess(sam, pid, n, slots.slice(0, 4), clues, slots.slice(4));
    actions.push({ k: "g", n, d: 500 });
    locked = new Set(res.correct);
    return res;
  };
  // Guesses 1 and 2: a few moves on the unconfirmed cards, never the answer.
  for (const n of [1, 2]) {
    if (n === 1) {
      // Guess 1 gets the top-left card right, so going back has a confirmed card to restore.
      const at = slots.findIndex((x) => x.cardId === answer.slotCards[0]);
      if (at !== 0) swap(at, 0);
      while (!right(0)) tap(0);
      locked = new Set([0]);   // keep the moves below off it
    }
    const f = free();
    tap(f[0]);
    swap(f[f.length - 1], 4 + (n % (slots.length - 4)));
    if (f.length > 1) tap(f[1]);
    while (free().every(right)) tap(free()[0]);
    await submit(n);
  }
  if (win) {
    for (const i of free()) {
      const at = slots.findIndex((s) => s.cardId === answer.slotCards[i]);
      if (at !== i) swap(at, i);
      while (slots[i].orientation !== answer.orientations[i]) tap(i);
    }
  } else {
    const f = free();
    tap(f[0]);
    while (free().every(right)) tap(free()[0]);
  }
  const last = await submit(3);
  assert.equal(last.outcome, win ? "won" : "lost", `${prefix}: ${win ? "solved" : "lost"} on guess 3`);
  await rpc(sam.client, "save_friend_moves", { p_puzzle_id: pid, p_session: randomBytes(12).toString("base64url"), p_from: 0, p_actions: actions });
  return pid;
}
const winPid = await playRecorded("WIN", true);
const lossPid = await playRecorded("LOSS", false);
const snapshot = async (pid) => ({
  puzzle: (await admin.from("friend_puzzles").select("*").eq("id", pid).single()).data,
  friendship: (await admin.from("friendships").select("*").eq("id", fid).single()).data,
  moves: (await admin.from("friend_move_logs").select("actions,truncated").eq("puzzle_id", pid).single()).data,
});

// ── Deb watches ─────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.createBrowserContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const rpcCalls = [];
page.on("request", (r) => { const m = r.url().match(/\/rest\/v1\/rpc\/(\w+)/); if (m) rpcCalls.push(m[1]); });
await page.setViewport(PHONE);
// Listen for the win sound (its top note is 1318.5 Hz) and the celebration particles.
await page.evaluateOnNewDocument(() => {
  window.__freqs = [];
  const d = Object.getOwnPropertyDescriptor(AudioParam.prototype, "value");
  Object.defineProperty(AudioParam.prototype, "value", { ...d, set(v) { window.__freqs.push(v); d.set.call(this, v); } });
  window.__particles = 0;
  new MutationObserver(() => { if (document.querySelector(".particles")) window.__particles++; })
    .observe(document, { childList: true, subtree: true });
});
await signInBrowser(page, deb, "/friends");

// The timeline: every phase change with its time, the step and the board.
const watch = () => page.evaluate(() => {
  window.__tl = [];
  const root = document.querySelector(".fr-anim");
  const busy = () => document.querySelectorAll(".fr-replay-game .ctile.reveal-grey, .fr-replay-game .ctile.flip-down, .fr-replay-game .ctile.flip-up").length;
  const note = () => window.__tl.push({ t: performance.now(), phase: root.dataset.phase, status: root.dataset.status,
    caption: document.querySelector(".fr-anim-caption").textContent, busy: busy() });
  note();
  if (window.__obs) window.__obs.disconnect();
  window.__obs = new MutationObserver(note);
  window.__obs.observe(root, { attributes: true, attributeFilter: ["data-phase", "data-status"] });
});
const timeline = () => page.evaluate(() => window.__tl);
const segments = (tl, phase) => tl.map((e, i) => ({ ...e, end: tl[i + 1]?.t })).filter((e) => e.phase === phase && e.end).map((e) => ({ ms: Math.round(e.end - e.t), caption: e.caption, busy: e.busy }));
const state = () => page.evaluate(() => ({
  board: [...document.querySelectorAll(".fr-replay-game .cslot, .fr-replay-game .eslot")].map((sl) => {
    const t = sl.querySelector(".ctile");
    return t ? [...t.querySelectorAll(".ew")].map((e) => e.textContent).join(",") + (t.classList.contains("locked") ? "#L" : "") + (t.classList.contains("wrong-red") ? "#R" : "") : "-";
  }).join("|"),
  clues: [...document.querySelectorAll(".fr-replay-game .ctab")].map((e) => e.textContent).join(","),
  livesLost: document.querySelectorAll(".fr-replay-game .life.lost").length,
  feedback: document.querySelector(".fr-replay-game .fbk")?.textContent || "",
  step: document.querySelector(".fr-replay-step").textContent,
  caption: document.querySelector(".fr-anim-caption").textContent,
  progress: +document.querySelector(".fr-anim-progress").getAttribute("aria-valuenow"),
  status: document.querySelector(".fr-anim").dataset.status,
  phase: document.querySelector(".fr-anim").dataset.phase,
}));
const until = (phase, caption, timeout = 40000) => untilRaw(phase, caption, timeout).catch(async (e) => { console.log("timeline:", JSON.stringify(await timeline()), "state:", JSON.stringify(await state())); throw e; });
const untilRaw = (phase, caption, timeout) => page.waitForFunction((p, c) => {
  const r = document.querySelector(".fr-anim");
  return r?.dataset.phase === p && (!c || document.querySelector(".fr-anim-caption").textContent === c);
}, { timeout, polling: 20 }, phase, caption);
const click = (label) => page.locator(`.fr-anim button[aria-label="${label}"]`).click();
const setSpeed = (s) => page.locator(`.fr-anim-speed button::-p-text(${s}×)`).click();
const near = (ms, want, slack, what) => assert.ok(Math.abs(ms - want) <= slack, `${what}: ${ms} ms (want ${want} ± ${slack})`);

async function open(pid) {
  await page.goto(`${APP_URL}/friends/guesses/${pid}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".fr-anim .fr-playall");
  await sleep(300);
}

// ── 1. The controls, and a full 1× run of the win ──────────────────────────
await open(winPid);
const before = await snapshot(winPid);
const storedBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith("cv-auth")).sort()));
assert.deepEqual(await page.$$eval(".fr-anim-speed button", (b) => b.map((x) => x.textContent)), ["0.5×", "1×", "2×"]);
assert.equal(await page.$eval('.fr-anim-speed button[aria-pressed="true"]', (b) => b.textContent), "1×", "1× by default");
assert.ok(await page.$eval('.fr-anim button[aria-label="Previous guess"]', (b) => b.disabled), "nothing to go back to at the start");
assert.ok(await page.$eval('.fr-anim button[aria-label="Restart the replay"]', (b) => b.disabled));
const start = await state();
await shot(page, "01-start");
const fits = await page.$eval(".fr-anim-transport", (t) => { const box = t.getBoundingClientRect(); const bs = [...t.querySelectorAll("button")].map((b) => b.getBoundingClientRect()); return { scroll: Math.round(Math.max(...bs.map((b) => b.right)) - box.left), width: Math.round(box.width), oneRow: new Set(bs.map((b) => Math.round(b.top))).size === 1 }; });
assert.ok(fits.oneRow && fits.scroll <= fits.width + 1, `the controls fit one row at 390px (${fits.scroll}/${fits.width})`);

await watch();
await click("Play the replay");
let holdSigs = {};
for (const n of [1, 2]) {
  await until("hold", `Submitted guess ${n}`);
  holdSigs[n] = await state();
}
assert.ok(holdSigs[1].board.split("|")[0].endsWith("#L"), "guess 1 confirmed the top-left card");
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.status === "done", { timeout: 60000 });
const tl1 = await timeline();
const holds1 = segments(tl1, "hold");
log("1× holds:", holds1.map((h) => h.ms).join(", "), "· pauses:", [...new Set(segments(tl1, "pause").map((p) => Math.round(p.ms / 25) * 25))].join("/"));
assert.equal(holds1.length, 3, "one reading pause per guess");
holds1.forEach((h, i) => { near(h.ms, 2000, 150, `1× hold after guess ${i + 1}`); assert.equal(h.busy, 0, "the hold starts once the reveal has finished"); });
for (const p of segments(tl1, "pause")) near(p.ms, 350, 120, "1× pause between moves");
for (const m of segments(tl1, "move")) assert.ok(m.ms < 1500, `no reading pause on a move (${m.caption}: ${m.ms} ms)`);
assert.ok(segments(tl1, "reveal").every((r) => r.ms > 900), "each reveal plays in full before its hold");
const end = await state();
assert.equal(end.caption, "Sam solved it");
assert.ok(end.board.split("|").slice(0, 4).every((c) => c.endsWith("#L")), "the win's four cards are confirmed");
assert.equal(await page.evaluate(() => window.__particles), 0, "no celebration particles in a replay");
assert.ok(!(await page.evaluate(() => window.__freqs.includes(1318.5))), "no win fanfare in a replay");
await shot(page, "02-done-win");

// ── 2. 2× and 0.5×: the hold stays ~2 s, the pauses scale ──────────────────
await setSpeed(2);
await watch();
await click("Replay from the start");
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.status === "done", { timeout: 60000 });
const tl2 = await timeline();
const holds2 = segments(tl2, "hold");
holds2.forEach((h, i) => near(h.ms, 2000, 150, `2× hold after guess ${i + 1}`));
for (const p of segments(tl2, "pause")) near(p.ms, 175, 100, "2× pause between moves");
log("2× holds:", holds2.map((h) => h.ms).join(", "));

await setSpeed(0.5);
await watch();
await click("Replay from the start");
await until("hold", "Submitted guess 1", 60000);
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.phase !== "hold", { timeout: 10000, polling: 20 });
const tl3 = await timeline();
near(segments(tl3, "hold")[0].ms, 2000, 150, "0.5× hold after guess 1");
for (const p of segments(tl3, "pause")) near(p.ms, 700, 150, "0.5× pause between moves");
log("0.5× hold:", segments(tl3, "hold")[0].ms, "· pauses ≈", Math.round(segments(tl3, "pause")[0].ms));

// ── 3. Changing speed mid-play keeps the same board and place ──────────────
await page.evaluate(() => { document.querySelector(".fr-replay-game .game").__mark = 1; });
const progressBefore = (await state()).progress;
await setSpeed(1);
await sleep(1200);
const after = await state();
assert.equal(await page.evaluate(() => document.querySelector(".fr-replay-game .game").__mark), 1, "changing speed doesn't remount the board");
assert.ok(after.progress >= progressBefore && after.status === "playing", "and doesn't restart the replay");
log("speed 0.5× → 1× mid-play: same board, progress", progressBefore, "→", after.progress);

// ── 4. Previous guess and Restart ──────────────────────────────────────────
const stable = async (what, ms = 3500) => {
  const a = await state();
  await sleep(ms);
  const b = await state();
  assert.deepEqual(b, a, `${what}: nothing plays on by itself`);
  return a;
};
const sameAsHold = (s, n, what) => {
  for (const k of ["board", "clues", "livesLost", "feedback"]) assert.equal(s[k], holdSigs[n][k], `${what}: ${k} as it stood after guess ${n}`);
  assert.equal(s.step, `Guess ${n} of 3`);
  assert.equal(s.caption, `Submitted guess ${n}`);
  assert.equal(s.status, "paused");
};
await setSpeed(2);
// From the hold after guess 2 → guess 1.
await until("hold", "Submitted guess 2", 60000);
await click("Previous guess");
sameAsHold(await stable("from a hold"), 1, "Previous from guess 2's hold");
await shot(page, "03-previous-guess-1");
// Play on from guess 1: it carries on (not from the start), through guess 2.
await click("Play the replay");
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.phase === "move", { timeout: 8000, polling: 20 });
assert.notEqual((await state()).caption, "Submitted guess 1");
await until("hold", "Submitted guess 2", 60000);
for (const k of ["board", "clues", "livesLost", "feedback"]) assert.equal((await state())[k], holdSigs[2][k], `played on from guess 1, guess 2 lands as before (${k})`);
// From a move after guess 2 → guess 2.
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.phase === "move", { timeout: 10000, polling: 20 });
await click("Previous guess");
sameAsHold(await stable("from a move"), 2, "Previous from a move after guess 2");
await shot(page, "04-previous-guess-2");
// Again → guess 1, again → the start.
await click("Previous guess");
sameAsHold(await stable("again", 1500), 1, "Previous again");
await click("Previous guess");
let s = await stable("back at the start", 2500);
assert.equal(s.board, start.board);
assert.equal(s.status, "ready");
assert.ok(await page.$eval('.fr-anim button[aria-label="Previous guess"]', (b) => b.disabled));
// From a reveal still playing → the start, with its red/green never landing.
await click("Play the replay");
await until("reveal", "Submitted guess 1", 30000);
await sleep(250);
await click("Previous guess");
s = await stable("from a reveal in progress", 4500);
assert.equal(s.board, start.board, "the cancelled reveal never lands");
assert.equal(s.livesLost, 0);
// Restart from the middle → the start, paused; then it plays again.
await click("Play the replay");
await until("hold", "Submitted guess 1", 30000);
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.phase === "move", { timeout: 10000, polling: 20 });
await click("Restart the replay");
s = await stable("after Restart", 3000);
assert.equal(s.board, start.board);
assert.equal(s.status, "ready");
assert.equal(s.progress, 0);
await click("Play the replay");
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.status === "done", { timeout: 60000 });
assert.equal((await state()).caption, "Sam solved it", "played to the end after going back");
log("Previous guess (from a hold, a move, a reveal) and Restart: paused at the right board, nothing ran on");

// Pause / Play.
await click("Replay from the start");
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.phase === "move", { timeout: 8000, polling: 20 });
await click("Pause the replay");
await sleep(1200); // the move in hand finishes, then it stops
await stable("paused");
await click("Play the replay");
await page.waitForFunction((p) => +document.querySelector(".fr-anim-progress").getAttribute("aria-valuenow") > p, { timeout: 8000 }, (await state()).progress);
log("Pause holds, Play carries on");

// ── 5. The loss: to the end, then back a guess ─────────────────────────────
await open(lossPid);
await setSpeed(2);
await watch();
await click("Play the replay");
for (const n of [1, 2]) { await until("hold", `Submitted guess ${n}`, 60000); holdSigs[n] = await state(); }
await page.waitForFunction(() => document.querySelector(".fr-anim").dataset.status === "done", { timeout: 60000 });
const tl5 = await timeline();
segments(tl5, "hold").forEach((h, i) => near(h.ms, 2000, 150, `loss: hold after guess ${i + 1}`));
assert.equal((await state()).caption, "Out of lives — the answer is revealed");
await shot(page, "05-done-loss");
await click("Previous guess");
sameAsHold(await stable("loss, back from the end"), 2, "Previous from the end of a loss");
log("loss replay: holds ~2 s, Previous from the end → guess 2");

// ── 6. Nothing changed by watching ─────────────────────────────────────────
const storedAfter = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith("cv-auth")).sort()));
assert.equal(storedAfter, storedBefore, "nothing new stored on the device (no progress, stats or moves)");
const afterWin = await snapshot(winPid);
assert.deepEqual({ ...afterWin.puzzle, creator_seen_result_at: null }, { ...before.puzzle, creator_seen_result_at: null }, "the result is unchanged");
assert.deepEqual(afterWin.moves, before.moves, "the move log is unchanged");
assert.deepEqual({ ...afterWin.friendship, updated_at: null }, { ...before.friendship, updated_at: null }, "streaks unchanged");
const writes = rpcCalls.filter((f) => /submit|save|record|choose|send|claim|start/.test(f));
assert.deepEqual(writes, [], `no writes while watching (${[...new Set(rpcCalls)].join(", ")})`);
assert.equal(await page.evaluate(() => window.__particles), 0, "no celebration at any point");

// ── 7. Phone previews: narrow screens and dark ────────────────────────────
await open(winPid);
await setSpeed(1);
await click("Play the replay");
await until("hold", "Submitted guess 2", 60000);
await click("Previous guess");
await sleep(300);
await shot(page, "06-paused-at-guess-1-light");
for (const w of [375, 320]) {
  await page.setViewport({ ...PHONE, width: w, height: w === 320 ? 568 : 667 });
  await sleep(300);
  const f = await page.$eval(".fr-anim-transport", (t) => { const box = t.getBoundingClientRect(); const bs = [...t.querySelectorAll("button")].map((b) => b.getBoundingClientRect()); return { scroll: Math.round(Math.max(...bs.map((b) => b.right)) - box.left), width: Math.round(box.width), oneRow: new Set(bs.map((b) => Math.round(b.top))).size === 1 }; });
  assert.ok(f.oneRow && f.scroll <= f.width + 1, `the controls fit one row at ${w}px (${f.scroll}/${f.width})`);
  await shot(page, `07-controls-${w}`);
}
await page.setViewport(PHONE);
await page.evaluate(() => localStorage.setItem("cv-theme", "dark"));
await open(winPid);
await click("Play the replay");
await until("hold", "Submitted guess 2", 60000);
await shot(page, "08-hold-guess-2-dark");
await click("Previous guess");
await sleep(300);
await shot(page, "09-paused-at-guess-1-dark");
await page.evaluate(() => localStorage.removeItem("cv-theme"));

await browser.close();
assert.deepEqual(errors, [], errors.join(" | "));
console.log(`\nReplay controls: all checks passed. Screens in ${OUT}`);
