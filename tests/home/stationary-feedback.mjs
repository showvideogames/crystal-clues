// Feedback that never moves the controls:
//   Share results  the button itself says "Copied ✓" for a moment (same size),
//                  nothing is inserted beneath it; a failed copy is announced
//                  without moving anything.
//   Submit         "You already know that's wrong …" appears in a reserved
//                  area above Submit: showing or clearing it moves nothing.
// Measured at desktop and narrow-phone sizes, with repeated clicks.
// Needs the local stack and the friends dev server (see home-results.mjs).
//   FRIENDS_E2E_URL=http://127.0.0.1:5191 node tests/home/stationary-feedback.mjs [--video clip.webm --label before|after] [--measure-only]
import fs from "node:fs";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME } from "../friends/browser.mjs";
import { slotEls, tap, nudgeWrong } from "../friends/board.mjs";
import { sql } from "../db/helpers.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const VIDEO = arg("--video"), LABEL = arg("--label") || "", SHOTS = arg("--shots");
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const still = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };
const MEASURE_ONLY = process.argv.includes("--measure-only");   // report, don't assert (the "before" run)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);
const LOCAL_TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const VIEW = { cards: {
  c1: { words: ["BLAZE", "RIVER", "CAVE", "WOLF"] }, c2: { words: ["EMBER", "PEAK", "STORM", "RIVER"] },
  c3: { words: ["CLIFF", "TOWER", "OCEAN", "BOULDER"] }, c4: { words: ["THUNDER", "BUSH", "SKY", "STORM"] },
}, solution: { slotCards: ["c1", "c2", "c3", "c4"], orientations: [0, 0, 0, 0] } };

const prior = sql(`select id from public.puzzles where date = '${LOCAL_TODAY}' and status = 'published'`).split("\n").filter(Boolean);
if (prior.length) sql(`update public.puzzles set status = 'draft' where id in (${prior.join(",")})`);
const TODAY = String(1700000000600 + Math.floor(Math.random() * 90));
sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
     select ${TODAY}, '${LOCAL_TODAY}', 'Feedback test', 'Local sample', 'standard', 'published', clues, cards, solution
     from public.puzzles where id = 1700000000000`);

const check = (ok, msg) => { if (MEASURE_ONLY) { if (!ok) log("MOVES:", msg); } else assert.ok(ok, msg); };
const box = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });

// ── Screen recording (CDP screencast frames, encoded by the browser) ──
const segments = [];
async function record(page, title) {
  if (!VIDEO) return async () => {};
  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 75, maxWidth: 780, maxHeight: 1688 });
  return async () => { await cdp.send("Page.stopScreencast").catch(() => {}); segments.push({ title, frames }); };
}
async function encode(browser, file) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const all = segments.flatMap((s, si) => s.frames.map((f, i) => ({ si, i })));
  await page.exposeFunction("frameData", (n) => { const { si, i } = all[n]; return segments[si].frames[i].data; });
  const timeline = segments.map((s) => ({ title: s.title, holds: s.frames.map((f, i) => Math.min(1.5, (s.frames[i + 1]?.t ?? f.t + 1.2) - f.t)) }));
  const mimeType = file.endsWith(".mp4") ? "video/mp4;codecs=avc1" : "video/webm;codecs=vp9";
  const b64 = await page.evaluate(async (timeline, mimeType) => {
    const canvas = document.createElement("canvas");
    canvas.width = 540; canvas.height = 1110;   // a 360×740 phone, whole
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 1_800_000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    rec.start(250);
    let n = 0;
    for (const seg of timeline) {
      ctx.fillStyle = "#f7f3fc"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#3b1c6e"; ctx.font = "800 34px sans-serif"; ctx.textAlign = "center";
      seg.title.split("\n").forEach((l, i) => ctx.fillText(l, canvas.width / 2, canvas.height / 2 - 24 + i * 46));
      await wait(1300);
      for (const hold of seg.holds) {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${await window.frameData(n++)}`;
        await img.decode();
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const h = canvas.width * (img.height / img.width);
        ctx.drawImage(img, 0, 0, canvas.width, h);
        await wait(Math.max(16, hold * 1000));
      }
    }
    await wait(400);
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
async function fresh(width, height, { clipboard = "ok" } = {}) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((mode) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => {
      if (mode === "fail") throw new Error("denied");
      window.__copied = t;
    } } });
    if (mode === "fail") document.execCommand = () => false;
  }, clipboard);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("clover_tutorial_seen", "true"); });
  return page;
}
// A finished round for this browser's guest, as the game saves it.
const finished = (page) => page.evaluate((id) => {
  const at = new Date().toISOString();
  const row = (a, b, c, d) => [[a, b], [d, c]];
  localStorage.setItem("clover_completions", JSON.stringify({ [id]: { solved: true, livesUsed: 1, difficulty: "standard", solvedAt: at, finishedAt: at } }));
  localStorage.setItem(`clover_final_guest_${id}`, JSON.stringify({ owner: "guest", difficulty: "standard", solved: true, livesUsed: 1, finishedAt: at,
    slots: ["c1", "c2", "c3", "c4", "c5"].map((cardId) => ({ cardId, orientation: 0 })), clues: ["HEAT", "TALL", "BLUE", "WILD"],
    guessHistory: [row("⚫", "🔮", "⚫", "🔮"), row("🔮", "🔮", "🔮", "🔮")] }));
}, TODAY);

try {
  for (const [w, h, name] of [[320, 568, "320px phone"], [360, 740, "narrow phone"], [1280, 800, "desktop"]]) {
    // 1. Share results, clicked twice; then a failed copy.
    const p = await fresh(w, h);
    await finished(p);
    await p.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
    await p.locator("[data-testid=view-results]").click();
    await p.waitForSelector(".rs-share");
    await sleep(400);
    const stop1 = w === 360 ? await record(p, `${LABEL}\nShare results`) : async () => {};
    const share0 = await box(p, ".rs-share"), board0 = await box(p, ".rs-link");
    for (let i = 0; i < 2; i++) {
      await p.locator(".rs-share").click();
      await sleep(350);
      const s = await box(p, ".rs-share"), b = await box(p, ".rs-link");
      check(JSON.stringify(s) === JSON.stringify(share0), `${name}: Share button size/position after click ${i + 1}: ${JSON.stringify(share0)} → ${JSON.stringify(s)}`);
      check(b.y === board0.y, `${name}: View board moved ${board0.y} → ${b.y} after Share click ${i + 1}`);
      if (!MEASURE_ONLY) assert.match(await p.$eval(".rs-share", (e) => e.textContent.trim()), /^Copied ✓$/, "the button says Copied ✓");
      if (i === 0) await still(p, `share-copied-${w}`);
      await sleep(i ? 2600 : 700);
    }
    if (!MEASURE_ONLY) {
      assert.equal(await p.$eval(".rs-share", (e) => e.textContent.trim()), "Share results", "the label comes back");
      assert.equal(JSON.stringify(await box(p, ".rs-link")), JSON.stringify(board0));
      assert.equal(await p.evaluate(() => document.activeElement?.classList.contains("rs-share")), true, "focus stays on Share");
      assert.ok(await p.$eval(".rs-scope [role=status]", (e) => e.textContent.length >= 0), "a status region exists");
    }
    await stop1();
    await p.close();
    if (!MEASURE_ONLY) {
      const f = await fresh(w, h, { clipboard: "fail" });
      await finished(f);
      await f.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
      await f.locator("[data-testid=view-results]").click();
      await f.waitForSelector(".rs-share");
      const sh = await box(f, ".rs-share"), lk = await box(f, ".rs-link");
      await f.locator(".rs-share").click();
      await sleep(350);
      const label = await f.$eval(".rs-share", (e) => e.textContent.trim());
      assert.notEqual(label, "Copied ✓", "no success shown when copying fails");
      assert.equal(JSON.stringify(await box(f, ".rs-share")), JSON.stringify(sh), "failure doesn't resize Share");
      assert.equal(JSON.stringify(await box(f, ".rs-link")), JSON.stringify(lk), "failure doesn't move View board");
      const said = await f.$eval(".rs-scope [role=alert]", (e) => e.textContent);
      assert.match(said, /Couldn't copy/, "the failure is announced");
      log(`${name}: failed copy → button "${label}", announced "${said}"`);
      await f.close();
    }
    log(`${name}: Share feedback measured`);

    // 2. Submit an unchanged wrong arrangement, again and again; then move a card.
    const g = await fresh(w, h);
    await g.goto(`${APP_URL}/today`, { waitUntil: "networkidle0" });
    await g.locator(".lobby-start").click();
    await g.waitForSelector(".csurface .ctile");
    await sleep(900);
    await nudgeWrong(g, VIEW);
    const stop2 = w === 360 ? await record(g, `${LABEL}\nSubmit, unchanged`) : async () => {};
    await g.locator("button.sbtn").click();
    await sleep(4800);                                     // the wrong guess is judged and settles
    const base = { sbtn: await box(g, ".sbtn"), ctrls: await box(g, ".ctrls"), board: await box(g, ".csurface"), fbk: await box(g, ".fbk") };
    for (let i = 0; i < 3; i++) {
      await g.locator("button.sbtn").click();
      await sleep(300);
      const t = await g.$eval(".fbk", (e) => e.textContent);
      if (i === 0) { log(`${name}: message "${t}" (${(await box(g, ".fbk")).h}px tall area)`); await still(g, `submit-warning-${w}`); }
      check(/already know/.test(t), `${name}: the warning shows`);
      // It stays fully visible: no blink from an earlier message's fade-out.
      for (let k = 0; k < 4; k++) {
        const o = await g.$eval(".fbk", (e) => getComputedStyle(e).opacity);
        check(o === "1", `${name}: the warning blinked (opacity ${o}) after click ${i + 1}`);
        await sleep(150);
      }
      for (const k of ["sbtn", "ctrls", "board"]) {
        const now = await box(g, k === "sbtn" ? ".sbtn" : k === "ctrls" ? ".ctrls" : ".csurface");
        check(now.y === base[k].y && now.h === base[k].h, `${name}: ${k} moved ${base[k].y}/${base[k].h} → ${now.y}/${now.h} (click ${i + 1})`);
      }
      await sleep(600);
    }
    // Moving a wrong card clears the warning; still nothing moves.
    const els = await slotEls(g);
    const wrongSlot = await g.$$eval(".csurface .cslot", (s) => s.findIndex((x) => !x.querySelector(".ctile.locked")));
    await tap(g, els[[0, 1, 3, 2][wrongSlot]]);
    await sleep(1200);
    const after = await box(g, ".sbtn");
    check(after.y === base.sbtn.y, `${name}: Submit moved when the warning cleared ${base.sbtn.y} → ${after.y}`);
    if (!MEASURE_ONLY) {
      assert.equal(await g.$eval(".fbk", (e) => e.getAttribute("role")), "status", "feedback is a polite status region");
      assert.ok(!(await g.evaluate(() => document.activeElement?.classList.contains("fbk"))), "focus isn't moved to the message");
      const fb = await box(g, ".fbk");
      assert.ok(fb.h <= 40, `a compact area (${fb.h}px)`);
      // A message longer than two lines wraps and grows; nothing is cut off.
      const long = await g.$eval(".fbk span", (sp) => {
        sp.textContent = "A much longer message than the game ever shows, to prove that a third line wraps and stays fully readable rather than being clipped.";
        const f = sp.parentElement;
        return { overflow: getComputedStyle(f).overflow, fits: f.scrollHeight <= f.clientHeight + 1, h: f.getBoundingClientRect().height };
      });
      assert.ok(long.fits && long.overflow === "visible", `long text isn't clipped: ${JSON.stringify(long)}`);
    }
    await sleep(800);
    await stop2();
    await g.close();
    log(`${name}: Submit feedback measured`);
  }
  if (VIDEO) await encode(browser, VIDEO);
  console.log(MEASURE_ONLY ? "\nmeasured (no assertions)" : "\nAll stationary-feedback checks passed.");
} finally {
  await browser.close();
  sql(`delete from public.puzzles where id = ${TODAY}`);
  if (prior.length) sql(`update public.puzzles set status = 'published' where id in (${prior.join(",")})`);
}
