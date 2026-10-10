// Reading and moving cards on the game board in a browser test (puppeteer),
// shared by the Friends browser tests.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ── Reading and moving cards on the game board ──────────────────────
// DOM order of the 2×2 is TL, TR, BL, BR = slots 0, 1, 3, 2.
export const DOM_TO_SLOT = [0, 1, 3, 2];
export async function readBoard(page) {
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
export const key = (words) => [...words].sort().join("|");
const center = async (el) => { const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
export async function slotEls(page) {
  const board = await page.$$(".csurface .cslot");
  const tray = await page.$$(".eslots .eslot");
  const bySlot = [];
  board.forEach((el, i) => { bySlot[DOM_TO_SLOT[i]] = el; });
  return [...bySlot, ...tray];
}
export async function drag(page, fromEl, toEl) {
  const a = await center(fromEl), b = await center(toEl);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
  await page.mouse.up(); await sleep(350);
}
export async function tap(page, el) {
  const p = await center(el);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up();
  await sleep(450);
}
// Visible words (top, right, bottom, left) of the answer card for each slot.
export function answerWords(view) {
  const cards = view.authored_cards || view.cards;
  return view.solution.slotCards.map((id, i) => {
    const o = view.solution.orientations[i];
    return [0, 1, 2, 3].map((e) => cards[id].words[(e - o + 4) % 4]);
  });
}

export async function solve(page, view) {
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
export async function nudgeWrong(page, view) {
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
