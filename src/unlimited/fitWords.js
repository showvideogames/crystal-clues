// Long word-bank entries on Unlimited cards.
//
// Card words are one line, clipped at the card edge (shared game CSS). On a
// narrow phone (under ~390px) the longest bank words (10-12 letters, or two
// words such as SCUBA DIVER) do not fit at the normal size. Inside Unlimited
// only, a word that would be clipped is set just small enough to show in full;
// every other word keeps the game's own size. Two long words that meet in a
// card corner (a long top word and a long side word) are then nudged down
// together until they no longer touch. The shared card component and
// the Daily and Friends games are not changed.
import { useEffect } from "react";

const MIN_PX = 6.5;

/** Shrinks each overflowing card word in `root` to fit; resets the rest. Returns how many were shrunk. */
export function fitCardWords(root) {
  if (!root) return 0;
  let shrunk = 0;
  for (const el of root.querySelectorAll(".ew")) {
    el.style.fontSize = ""; el.style.letterSpacing = "";
    if (!el.textContent.trim()) continue;
    const vertical = getComputedStyle(el).writingMode.startsWith("vertical");
    const need = vertical ? el.scrollHeight : el.scrollWidth;
    const room = vertical ? el.clientHeight : el.clientWidth;
    if (!room || need <= room + 1) continue;
    const base = parseFloat(getComputedStyle(el).fontSize) || 10;
    el.style.letterSpacing = "0.01em";
    let size = Math.max(MIN_PX, Math.floor(base * (room / need) * 2) / 2);
    el.style.fontSize = `${size}px`;
    // Letter spacing and rounding can leave a pixel over; step down until it fits.
    while (size > MIN_PX && (vertical ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1)) {
      size -= 0.5; el.style.fontSize = `${size}px`;
    }
    shrunk++;
  }
  for (const card of root.querySelectorAll(".ctile-inner")) shrunk += separateCorners(card);
  return shrunk;
}

const touching = (a, b) => { const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return p.width && q.width && p.left < q.right - 0.5 && q.left < p.right - 0.5 && p.top < q.bottom - 0.5 && q.top < p.bottom - 0.5; };
const step = (el) => { const now = parseFloat(el.style.fontSize || getComputedStyle(el).fontSize); if (now <= MIN_PX) return false; el.style.fontSize = `${Math.max(MIN_PX, now - 0.5)}px`; el.style.letterSpacing = "0.01em"; return true; };

/** Shrinks pairs of labels on one card that overlap (only ever the ones involved). */
function separateCorners(card) {
  const get = (c) => card.querySelector(`.ew.${c}`);
  const [t, r, b, l] = ["et", "er", "eb", "el"].map(get);
  const corners = [[t, r], [t, l], [b, r], [b, l]].filter(([x, y]) => x && y && x.textContent.trim() && y.textContent.trim());
  let changed = 0;
  for (let i = 0; i < 12; i++) {
    const hit = corners.filter(([x, y]) => touching(x, y));
    if (!hit.length) break;
    let moved = false;
    for (const [x, y] of hit) { moved = step(x) || moved; moved = step(y) || moved; }
    if (!moved) break;
    changed++;
  }
  return changed ? 1 : 0;
}

/** Keeps the card words under `ref` fitted as cards move, rotate, or the window resizes. */
export function useFitCardWords(ref, deps = []) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof MutationObserver === "undefined") return undefined;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitCardWords(root)); };
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(root);
    window.addEventListener("resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); mo.disconnect(); ro?.disconnect(); window.removeEventListener("resize", schedule); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
