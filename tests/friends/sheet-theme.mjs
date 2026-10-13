// A friend's details sheet with a long history on short phones, and the
// Light / Dark / System appearance, in a real browser driven by touch.
//
// Sheet: the header (name, avatar, Close) stays on screen and tappable while
// the history is expanded, scrolled, collapsed, and while the browser's bars
// change the visible height; only the sheet's body scrolls; closing returns
// the list to exactly where it was and gives page scrolling back; reopening
// works. Appearance: System follows the device, a choice is remembered on this
// device and survives a refresh, a saved Dark paints dark before the app's
// code runs (no light flash), switching mid-game keeps the game as it was,
// and key text clears contrast in both themes (signed in and as a guest).
// Needs the local stack and the friends dev server (see e2e.mjs).
//   FRIENDS_E2E_URL=http://127.0.0.1:5189 node tests/friends/sheet-theme.mjs [screenshot-dir]
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { anon, rpc, makePlayer, sampleBoard, befriend, sendPuzzle, solvedBoard, sendAndStart, guess, wrongBoard } from "./helpers.mjs";
import { APP_URL, CHROME, signInBrowser } from "./browser.mjs";

const OUT = path.resolve(process.argv[2] || "sheet-theme-shots");
fs.mkdirSync(OUT, { recursive: true });
const SE = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };       // iPhone SE (2nd/3rd gen)
const SE1 = { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true };      // the smallest iPhone screen
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };    // iPhone 13/14
const log = (...a) => console.log("•", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const waitPath = (page, p) => page.waitForFunction((x) => location.pathname === x, { timeout: 15000 }, p);

// ── Seed: Sam, Pat with 14 finished puzzles and one waiting, and six more
// friends so the list itself scrolls on a short phone. ─────────────────────
const [sam, pat, ...others] = await Promise.all(["Sam", "Pat", "Ava", "Ben", "Cyd", "Dee", "Eli", "Flo"].map(makePlayer));
await rpc(pat.client, "set_avatar", { p_avatar: "frog" });
async function finish(c, s, fid, prefix, win = true) {
  const board = sampleBoard(prefix);
  const pid = await sendAndStart(c, s, fid, board, "easy");
  const view = await rpc(c.client, "open_friend_puzzle", { p_puzzle_id: pid });
  if (win) return guess(s, pid, 1, solvedBoard(view), board.clues);
  for (let g = 1; g <= 4; g++) if ((await guess(s, pid, g, wrongBoard(view), board.clues))?.outcome) break;
}
const fP = await befriend(sam, pat);
for (let i = 0; i < 7; i++) {
  await finish(sam, pat, fP, `S${i}`, i % 3 !== 2);
  await finish(pat, sam, fP, `P${i}`, i % 4 !== 1);
}
await sendPuzzle(sam, fP, sampleBoard("OUT"));
// Each of the others has a puzzle waiting for Sam, so they list above Pat and
// Pat's row sits at the bottom of a list that scrolls.
for (const o of others) {
  const fid = await befriend(sam, o);
  await finish(o, sam, fid, o.name.toUpperCase());
  await sendPuzzle(o, fid, sampleBoard(`${o.name.toUpperCase()}2`));
}
const HISTORY = 15; // 14 finished + the one waiting

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
const newPage = async (viewport = SE, scheme = "light") => {
  const p = await (await browser.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setViewport(viewport);
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  return p;
};

// Where the sheet's parts are, and whether Close is the thing under a tap at its centre.
const sheetState = (page) => page.evaluate(() => {
  const card = document.querySelector(".fr-details .fr-modal-card");
  const close = document.querySelector(".fr-details .fr-closebtn");
  const body = document.querySelector(".fr-details .fr-modal-body");
  const c = close.getBoundingClientRect(), k = card.getBoundingClientRect();
  const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  return {
    vh: innerHeight, cardTop: k.top, cardBottom: k.bottom, closeTop: c.top, closeBottom: c.bottom,
    closeX: c.left + c.width / 2, closeY: c.top + c.height / 2, closeTappable: !!hit && close.contains(hit),
    bodyTop: body.scrollTop, bodyMax: body.scrollHeight - body.clientHeight,
    bodyBox: (({ top, bottom, left, width }) => ({ top, bottom, x: left + width / 2 }))(body.getBoundingClientRect()),
    wrapScroll: document.querySelector(".fr-wrap").scrollTop,
    wrapOverflow: getComputedStyle(document.querySelector(".fr-wrap")).overflowY,
    locked: document.documentElement.classList.contains("cv-sheet-open"),
    items: document.querySelectorAll(".fr-details .fr-history-item").length,
  };
});
function assertCloseUsable(s, when) {
  assert.ok(s.closeTop >= 0 && s.closeBottom <= s.vh, `${when}: Close is on screen (${Math.round(s.closeTop)}–${Math.round(s.closeBottom)} of ${s.vh})`);
  assert.ok(s.closeTappable, `${when}: nothing covers Close`);
  assert.ok(s.cardTop >= 0 && s.cardBottom <= s.vh + 0.5, `${when}: the sheet fits the visible screen`);
}
// A finger drag on the sheet body (positive dy = finger moves up = content scrolls down).
async function swipe(page, x, fromY, dy) {
  await page.touchscreen.touchStart(x, fromY);
  const steps = 8;
  for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(x, fromY - (dy * i) / steps); await sleep(16); }
  await page.touchscreen.touchEnd();
  await sleep(450);
}
const tapAt = (page, x, y) => page.touchscreen.tap(x, y);
const tapEl = async (page, sel) => {
  const b = await page.$eval(sel, (e) => { e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tapAt(page, b.x, b.y);
};
const tapRow = (page, label) => page.evaluate((t) => [...document.querySelectorAll(".fr-details .fr-rowbtn")].find((b) => b.innerText.includes(t)).getBoundingClientRect().toJSON(), label)
  .then((r) => tapAt(page, r.left + r.width / 2, r.top + r.height / 2));
const patRow = `.fr-frow[data-fid="${fP}"] .fr-frow-name`;

async function sheetRun(page, label) {
  await signInBrowser(page, sam, "/friends");
  await page.waitForSelector(".fr-frow");
  // Scroll the list so Pat's row is not at the top: closing must come back here.
  const maxScroll = await page.$eval(".fr-wrap", (w) => w.scrollHeight - w.clientHeight);
  assert.ok(maxScroll > 40, `${label}: the Friends list scrolls on this phone (${maxScroll}px)`);
  await page.$eval(".fr-wrap", (w) => { w.scrollTop = w.scrollHeight; });
  await sleep(200);
  const listAt = await page.$eval(".fr-wrap", (w) => w.scrollTop);
  log(label, "list scrolled to", listAt);
  assert.ok(listAt > 40, `${label}: the list is scrolled away from the top`);
  const patBox = await page.$eval(patRow, (e) => e.getBoundingClientRect().toJSON());
  assert.ok(patBox.top > 60 && patBox.bottom < page.viewport().height, `${label}: Pat's row is on screen at the bottom of the list`);

  for (const round of [1, 2]) {
    await tapEl(page, patRow);
    await waitPath(page, `/friends/details/${fP}`);
    await page.waitForSelector(".fr-details .fr-modal-body");
    await sleep(350);
    let s = await sheetState(page);
    assertCloseUsable(s, `${label} round ${round}, collapsed`);
    assert.ok(s.locked && s.wrapOverflow === "hidden", `${label}: the page underneath holds still while the sheet is open`);
    if (round === 1) await shot(page, `${label}-1-sheet`);

    await tapRow(page, "Past puzzles");
    await page.waitForFunction((n) => document.querySelectorAll(".fr-details .fr-history-item").length >= n, {}, HISTORY);
    await sleep(200);
    s = await sheetState(page);
    assert.ok(s.bodyMax > 200, `${label}: the expanded history overflows the sheet (${s.bodyMax}px to scroll)`);
    assertCloseUsable(s, `${label} round ${round}, expanded`);

    // Swipe the body down to the end, then back to the top, with a finger.
    const x = s.bodyBox.x, mid = (s.bodyBox.top + s.bodyBox.bottom) / 2;
    for (let i = 0; i < 12 && (await sheetState(page)).bodyTop < s.bodyMax - 1; i++) await swipe(page, x, mid + 120, 240);
    s = await sheetState(page);
    assert.ok(s.bodyTop >= s.bodyMax - 1, `${label}: swiping reaches the end of the history (${s.bodyTop}/${s.bodyMax})`);
    assert.equal(s.wrapScroll, listAt, `${label}: swiping the sheet never scrolls the list underneath`);
    assertCloseUsable(s, `${label} round ${round}, scrolled to the end`);
    const lastItem = await page.$eval(".fr-details .fr-modal-body .fr-list", (l) => l.getBoundingClientRect().bottom);
    assert.ok(lastItem <= s.vh, `${label}: the end of the list is reachable on screen`);
    if (round === 1) await shot(page, `${label}-2-history-end`);
    for (let i = 0; i < 12 && (await sheetState(page)).bodyTop > 0; i++) await swipe(page, x, mid - 120, -240);
    s = await sheetState(page);
    assert.equal(s.bodyTop, 0, `${label}: swiping back reaches the top`);
    assertCloseUsable(s, `${label} round ${round}, back at the top`);
    if (round === 1) await shot(page, `${label}-3-history-top`);

    // Safari's bars: the visible height shrinks and grows while the sheet is open.
    const vp = page.viewport();
    for (const h of [vp.height - 80, vp.height + 60, vp.height]) {
      await page.setViewport({ ...vp, height: h });
      await sleep(150);
      assertCloseUsable(await sheetState(page), `${label} round ${round}, visible height ${h}`);
    }

    // Collapse again: still fits, still closable.
    await tapRow(page, "Past puzzles");
    await sleep(200);
    s = await sheetState(page);
    assert.equal(s.items, 0, `${label}: history collapsed`);
    assertCloseUsable(s, `${label} round ${round}, collapsed again`);

    // Close (a tap on Close; the second round uses the phone's Back).
    if (round === 1) await tapAt(page, s.closeX, s.closeY);
    else await page.goBack();
    await waitPath(page, "/friends");
    await page.waitForFunction(() => !document.querySelector(".fr-details"));
    await sleep(150);
    const after = await page.evaluate(() => ({
      at: document.querySelector(".fr-wrap").scrollTop,
      overflow: getComputedStyle(document.querySelector(".fr-wrap")).overflowY,
      locked: document.documentElement.classList.contains("cv-sheet-open"),
    }));
    assert.equal(after.at, listAt, `${label}: closing returns to the same place in the list`);
    assert.ok(!after.locked && after.overflow === "auto", `${label}: page scrolling is back after closing`);
    // And the list really scrolls again under a finger.
    await swipe(page, 180, 300, -150);
    const moved = await page.$eval(".fr-wrap", (w) => w.scrollTop);
    assert.ok(moved < listAt, `${label}: the list scrolls by touch after closing (${listAt} → ${moved})`);
    await page.$eval(".fr-wrap", (w, y) => { w.scrollTop = y; }, listAt);
    await sleep(100);
  }
  log(label, "sheet: pinned header, one scroll area, same place on close — ok");
}

// ── 1. The sheet on short phones, light and dark ───────────────────────────
{
  const p = await newPage(SE, "light");
  await sheetRun(p, "light-se");
  await p.close();
}
{
  const p = await newPage(SE1, "light");
  await sheetRun(p, "light-se1");
  await p.close();
}
{
  const p = await newPage(SE, "light");
  await p.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("cv-theme", "dark"));
  await sheetRun(p, "dark-se");
  await p.close();
}

// ── 2. Contrast of key text, both themes (computed in the page) ────────────
const contrast = (page, selectors) => page.evaluate((sels) => {
  const parse = (c) => { const m = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  function backdrop(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const bg = parse(cs.backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    let c = parse(getComputedStyle(document.documentElement).backgroundColor);
    for (const l of layers.reverse()) c = over(l, c);
    return c;
  }
  return sels.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = backdrop(el);
    const a = L(over(fg, bg)), b = L(bg);
    return { sel, ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2), size: parseFloat(cs.fontSize), weight: +cs.fontWeight };
  });
}, selectors);
async function checkContrast(page, selectors, label) {
  await sleep(450); // let colour transitions finish after a theme change
  assertContrast(await contrast(page, selectors), label);
}
function assertContrast(rows, label) {
  for (const r of rows) {
    if (r.missing) continue;
    const large = r.size >= 24 || (r.size >= 18.66 && r.weight >= 700);
    const need = large ? 3 : 4.5;
    assert.ok(r.ratio >= need, `${label}: ${r.sel} contrast ${r.ratio} ≥ ${need}`);
  }
  log(label, "contrast:", rows.filter((r) => !r.missing).map((r) => `${r.sel} ${r.ratio}`).join(", "));
}
const FRIENDS_TEXT = [".fr-h1", ".fr-frow-name", ".fr-frow-status", ".fr-hub-foot .fr-textbtn", ".fr-mini.secondary", ".fr-mini.primary", ".fr-btn.primary"];
const SHEET_TEXT = [".fr-details .fr-modal-title", ".fr-details .fr-modal-head .fr-sub", ".fr-details .fr-waiting", ".fr-details .fr-streak-num", ".fr-details .fr-streak-lbl",
  ".fr-details .fr-rowbtn-label", ".fr-details .fr-history-item b", ".fr-details .fr-history-item small", ".fr-details .fr-history-item .when"];
const GAME_TEXT = [".sdate", ".dchip", ".ctab", ".ew", ".cbtn", ".sbtn", ".fbk", ".nbtn"];
const LOBBY_TEXT = [".lobby-title", ".lobby-date", ".lobby-diff-name", ".lobby-diff-desc", ".lobby-start"];
const SETTINGS_TEXT = [".settings-title", ".settings-sub", ".diff-opt-name", ".diff-opt-desc", ".theme-opt[aria-checked=true]", ".theme-opt[aria-checked=false]"];

// ── 3. Appearance as a guest: System default, live device changes, a saved
//      choice, refresh, no flash, and an unfinished game kept ──────────────
const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const checked = (page) => page.$eval(".theme-opt[aria-checked=true]", (b) => b.dataset.themeChoice);
const openSettings = async (page) => { await page.locator('.gear-btn[title="Settings"]').click(); await page.waitForSelector(".theme-opts"); };
const closeSettings = async (page) => { await page.mouse.click(190, 40); await page.waitForFunction(() => !document.querySelector(".settings-sheet")); };
const board = (page) => page.evaluate(() => ({
  clues: [...document.querySelectorAll(".game .ctab")].map((e) => e.textContent).join("|"),
  cards: [...document.querySelectorAll(".game .ctile")].map((t) => [...t.querySelectorAll(".ew")].map((e) => e.textContent).join(",")).join("|"),
  livesLost: document.querySelectorAll(".game .life.lost").length,
  feedback: document.querySelector(".game .fbk")?.textContent || "",
  inGame: !!document.querySelector(".game .sbtn"),
}));
{
  const g = await newPage(PHONE, "light");
  await g.goto(APP_URL, { waitUntil: "networkidle0" });
  assert.equal(await themeOf(g), "light", "no saved choice + a light device → light");
  assert.equal(await g.evaluate(() => localStorage.getItem("cv-theme")), null, "nothing saved by default");
  await g.waitForSelector(".lobby-start");
  await shot(g, "guest-light-lobby");
  await checkContrast(g, LOBBY_TEXT, "guest light lobby");
  await openSettings(g);
  assert.equal(await checked(g), "system", "System is the default choice");
  await g.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await g.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  log("System follows the device: light → dark live");
  await shot(g, "guest-dark-settings");
  await checkContrast(g, SETTINGS_TEXT, "guest dark settings");
  await g.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await g.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await checkContrast(g, SETTINGS_TEXT, "guest light settings");
  await closeSettings(g);

  // An unfinished game: start, rotate the board, spend a life on a wrong guess.
  await g.locator(".lobby-start").click();
  await g.waitForSelector(".game .sbtn");
  await sleep(400);
  await g.locator(".game .cbtn").click(); // Rotate
  await sleep(600);
  await g.locator(".game .sbtn").click();
  await sleep(1800);
  const before = await board(g);
  assert.ok(before.inGame, "the game is in progress");
  log("game in progress:", JSON.stringify({ livesLost: before.livesLost, feedback: before.feedback }));
  await shot(g, "guest-light-game");
  await checkContrast(g, GAME_TEXT, "guest light game");
  for (const choice of ["dark", "light", "dark"]) {
    await openSettings(g);
    await g.locator(`.theme-opt[data-theme-choice="${choice}"]`).click();
    await g.waitForFunction((t) => document.documentElement.dataset.theme === t, {}, choice);
    assert.equal(await checked(g), choice);
    await closeSettings(g);
    assert.deepEqual(await board(g), before, `switching to ${choice} keeps the game exactly as it was`);
  }
  assert.equal(await g.evaluate(() => localStorage.getItem("cv-theme")), "dark", "the choice is saved on this device");
  await shot(g, "guest-dark-game");
  await checkContrast(g, GAME_TEXT, "guest dark game");
  // A light device no longer matters once Dark is chosen.
  await g.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await sleep(100);
  assert.equal(await themeOf(g), "dark", "a chosen Dark ignores the device setting");

  // Refresh: still dark, and dark before any app code runs (no light flash).
  await g.reload({ waitUntil: "networkidle0" });
  assert.equal(await themeOf(g), "dark", "Dark survives a refresh");
  await openSettings(g);
  assert.equal(await checked(g), "dark");
  await closeSettings(g);
  await g.waitForSelector(".lobby-start");
  await shot(g, "guest-dark-lobby");
  await checkContrast(g, LOBBY_TEXT, "guest dark lobby");
  await g.setRequestInterception(true);
  g.on("request", (r) => (/\/src\/main\.jsx|\.js(\?|$)/.test(new URL(r.url()).pathname) && r.resourceType() === "script" ? r.abort() : r.continue()));
  await g.reload({ waitUntil: "domcontentloaded" });
  const firstPaint = await g.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.documentElement).backgroundColor, app: !!document.querySelector(".hdr") }));
  assert.equal(firstPaint.app, false, "the app's code was held back for this check");
  assert.equal(firstPaint.theme, "dark");
  assert.equal(firstPaint.bg, "rgb(27, 18, 36)", "the page is dark before the app loads (no light flash)");
  log("first paint with Dark saved:", JSON.stringify(firstPaint));
  g.removeAllListeners("request");
  await g.setRequestInterception(false);

  // Back to System: follows the device again.
  await g.reload({ waitUntil: "networkidle0" });
  await openSettings(g);
  await g.locator('.theme-opt[data-theme-choice="system"]').click();
  await g.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await g.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await g.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await g.evaluate(() => localStorage.getItem("cv-theme")), "system");
  await closeSettings(g);

  // The other guest screens, dark: the archive, the tutorial, the admin page.
  await g.goto(`${APP_URL}/archive`, { waitUntil: "networkidle0" });
  await sleep(300);
  await shot(g, "guest-dark-archive");
  await checkContrast(g, [".arch-title", ".arch-monthtitle", ".arch-weekday"], "guest dark archive");
  await g.goto(`${APP_URL}/`, { waitUntil: "networkidle0" });
  await g.locator('.gear-btn[title="How To Play"]').click();
  await g.waitForSelector(".tut-card");
  await sleep(500);
  await shot(g, "guest-dark-tutorial");
  await checkContrast(g, [".tut-title", ".tut-body, .tut-msg"], "guest dark tutorial");
  await g.goto(`${APP_URL}/admin`, { waitUntil: "networkidle0" });
  await sleep(800);
  await shot(g, "guest-dark-admin");
  await checkContrast(g, [".atab.on", ".atab:not(.on)", ".sh"], "guest dark admin");
  await g.close();
}

// ── 4. Signed in: the Friends list, the sheet, the account menu, both themes ──
for (const theme of ["light", "dark"]) {
  const p = await newPage(PHONE, "light");
  await p.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await p.evaluate((t) => localStorage.setItem("cv-theme", t), theme);
  await signInBrowser(p, sam, "/friends");
  await p.waitForSelector(".fr-frow");
  assert.equal(await themeOf(p), theme);
  await shot(p, `signed-in-${theme}-friends`);
  await checkContrast(p, FRIENDS_TEXT, `signed-in ${theme} friends`);
  await tapEl(p, patRow);
  await p.waitForSelector(".fr-details .fr-modal-body");
  await tapRow(p, "Past puzzles");
  await p.waitForFunction((n) => document.querySelectorAll(".fr-details .fr-history-item").length >= n, {}, HISTORY);
  await sleep(300);
  await checkContrast(p, SHEET_TEXT, `signed-in ${theme} sheet`);
  await p.keyboard.press("Escape");
  await waitPath(p, "/friends");
  await p.locator('[data-testid="account-menu-button"]').click();
  await p.waitForSelector('[data-testid="account-menu"]');
  await shot(p, `signed-in-${theme}-account-menu`);
  await checkContrast(p, ['[data-testid="account-email"]', '[data-testid="sign-out"]'], `signed-in ${theme} account menu`);
  await p.keyboard.press("Escape");
  await p.goto(`${APP_URL}/`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".lobby-start");
  await p.locator(".lobby-start").click();
  await p.waitForSelector(".game .sbtn");
  await sleep(500);
  await shot(p, `signed-in-${theme}-game`);
  await checkContrast(p, GAME_TEXT, `signed-in ${theme} game`);
  await p.close();
}

// ── 5. The rest of the app in both themes: results, the solved lobby, the
//      admin editor, the puzzle creator and a friend's puzzle ──────────────
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const { data: todays } = await anon().from("puzzles").select("id").eq("date", today).eq("status", "published").limit(1);
const todayId = todays?.[0]?.id ?? "demo-001";
for (const theme of ["light", "dark"]) {
  const g = await newPage(PHONE, theme === "dark" ? "dark" : "light");
  await g.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await g.evaluate((t) => localStorage.setItem("cv-theme", t), theme);
  await g.reload({ waitUntil: "networkidle0" });
  await g.locator(".lobby-start").click();
  await g.waitForSelector(".game .sbtn");
  for (let i = 0; i < 4 && !(await g.$(".sovr")); i++) {
    await g.locator(".game .cbtn").click();
    await sleep(600);
    await g.locator(".game .sbtn").click();
    await sleep(2200);
  }
  await g.waitForSelector(".sovr");
  await sleep(600);
  await shot(g, `${theme}-result`);
  await checkContrast(g, [".sovr-title", ".sovr-sub", ".stat-lbl", ".sovr-btn"], `${theme} result`);
  await g.evaluate((id) => localStorage.setItem("clover_completions", JSON.stringify({ [id]: { solved: true, livesUsed: 1, difficulty: "standard", solvedAt: new Date().toISOString() } })), todayId);
  await g.goto(APP_URL, { waitUntil: "networkidle0" });
  await g.waitForSelector(".lobby-start.secondary");
  await shot(g, `${theme}-lobby-solved`);
  await checkContrast(g, [".lobby-start.secondary", ".lobby-start.quiet"], `${theme} solved lobby`);
  await g.goto(`${APP_URL}/admin`, { waitUntil: "networkidle0" });
  await g.waitForSelector(".pcard");
  await g.locator(".pcard").click();
  await sleep(800);
  await shot(g, `${theme}-admin-editor`);
  await checkContrast(g, [".admin-sec-title", ".admin-check.ok", ".admin-check.warn", ".admin-deal-btn", ".admin-deal-note"], `${theme} admin editor`);
  await g.close();

  const p = await newPage(PHONE, "light");
  await p.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await p.evaluate((t) => localStorage.setItem("cv-theme", t), theme);
  await signInBrowser(p, sam, "/friends/make/new");
  await p.waitForSelector(".fr-creator");
  await sleep(500);
  await shot(p, `${theme}-creator`);
  await checkContrast(p, [".fr-h1", ".fr-need"], `${theme} creator`);
  await p.goto(`${APP_URL}/friends`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".fr-frow");
  await p.locator('.fr-frow button[aria-label="Play Flo\'s puzzle"]').click();
  await p.waitForSelector(".fr-choose .lobby-diff-opt");
  await sleep(400);
  await shot(p, `${theme}-friend-choose`);
  await checkContrast(p, [".fr-choose .lobby-diff-name", ".fr-choose .lobby-diff-desc"], `${theme} friend difficulty`);
  await openSettings(p);
  await p.waitForSelector(".fr-settings-notify");
  await p.$eval(".settings-sheet", (e) => { e.scrollTop = e.scrollHeight; });
  await sleep(300);
  await shot(p, `${theme}-settings-signed-in`);
  await checkContrast(p, [".fr-settings-notify .settings-title", ".fr-settings-notify .fr-toggle", ".theme-opt[aria-checked=true]"], `${theme} signed-in settings`);
  await p.close();
}

await browser.close();
assert.deepEqual(errors, [],`no page errors: ${errors.join(" | ")}`);
console.log(`\nAll sheet and appearance checks passed. Screens in ${OUT}`);
