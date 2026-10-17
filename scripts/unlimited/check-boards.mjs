#!/usr/bin/env node
// Headless checks for assembled Unlimited boards, using the game's own logic.
//
//   node scripts/unlimited/check-boards.mjs data/unlimited/boards/beta-01/boards.json
//
// 1. Structure, the rules the Friends server enforces (friend_validate_board)
//    plus Unlimited's own: 4 non-empty one-word clues ≤ 20 chars, distinct after
//    normalisation; 7 complete cards, words ≤ 18 chars, 28 distinct words;
//    4 distinct answer ids + 3 distinct extras, all present; orientations 0–3;
//    each clue differs from both words it points at; the reveal snapshot
//    matches the words actually facing each clue.
// 2. Winnability with bestSubmit (src/game/shared.js): the stored answer is
//    accepted at all four whole-board rotations; a turned card, an extra card
//    or a swapped pair is refused; a locked slot is never undone.
// 3. The opening deal (biasedShuffle) never starts solved at any difficulty,
//    over many seeds.
// 4. State transitions, simulated with the same rules the board uses: lives
//    3→2→1→0, a slot that was marked wrong is remembered (knownBad), locked
//    slots stay locked, a win from two lives down is still a win.
// Exit code 1 on any failure; prints a summary table.
import { readFileSync } from "node:fs";
import { bestSubmit, biasedShuffle, isClueRotation, CW_FROM, DIFFICULTY_EXTRA } from "../../src/game/shared.js";
import { normHint } from "./assemble-boards.mjs";

const file = process.argv[2] || "data/unlimited/boards/beta-01/boards.json";
const { boards } = JSON.parse(readFileSync(file, "utf8"));
const CLUE_LINKS = [[[0, 0], [1, 0]], [[1, 1], [2, 1]], [[3, 2], [2, 2]], [[0, 3], [3, 3]]];
const vw = (card, o) => [0, 1, 2, 3].map((e) => card.words[(e - o + 4) % 4]);
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rotate = (slots, clues) => ({ slots: CW_FROM.map((i) => ({ cardId: slots[i].cardId, orientation: (slots[i].orientation + 1) % 4 })), clues: CW_FROM.map((i) => clues[i]) });

let failures = 0;
const rows = [];
for (const b of boards) {
  const errs = [];
  const must = (cond, msg) => { if (!cond) errs.push(msg); };
  // 1. structure
  must(Array.isArray(b.clues) && b.clues.length === 4, "4 clues");
  b.clues.forEach((c, i) => {
    must(typeof c === "string" && c.trim() && c.length <= 20, `clue ${i} non-empty ≤20`);
    must(typeof c === "string" && !/\s/.test(c.trim()), `clue ${i} is one word (owner rule)`);
  });
  must(new Set(b.clues.map(normHint)).size === 4, "clue texts distinct after normalisation");
  const cardIds = Object.keys(b.cards);
  must(cardIds.length === 7, "7 cards");
  const allWords = [];
  for (const id of cardIds) { const c = b.cards[id]; must(c.id === id && Array.isArray(c.words) && c.words.length === 4, `card ${id} complete`); c.words.forEach((w) => { must(typeof w === "string" && w.trim() && w.length <= 18, `card ${id} word ≤18 non-empty`); allWords.push(normHint(w)); }); }
  must(new Set(allWords).size === 28, "28 distinct words");
  const { slotCards, orientations, extraCards } = b.solution;
  must(slotCards.length === 4 && new Set(slotCards).size === 4 && slotCards.every((id) => b.cards[id]), "4 distinct answer cards present");
  must(extraCards.length === 3 && new Set(extraCards).size === 3 && extraCards.every((id) => b.cards[id] && !slotCards.includes(id)), "3 distinct extras, disjoint from the answer");
  must(orientations.length === 4 && orientations.every((o) => [0, 1, 2, 3].includes(o)), "orientations 0–3");
  CLUE_LINKS.forEach(([[s1, e1], [s2, e2]], i) => {
    const w1 = vw(b.cards[slotCards[s1]], orientations[s1])[e1], w2 = vw(b.cards[slotCards[s2]], orientations[s2])[e2];
    must(normHint(b.clues[i]) !== normHint(w1) && normHint(b.clues[i]) !== normHint(w2), `clue ${i} differs from its targets`);
    const r = b.reveal?.[i];
    must(r && new Set([r.wordA, r.wordB]).size === 2 && [w1, w2].sort().join("|") === [r.wordA, r.wordB].sort().join("|"), `reveal ${i} matches the words facing clue ${i}`);
    must(r && r.revealExplanation && r.wordAConnection && r.wordBConnection, `reveal ${i} has player-facing text`);
  });
  // 2. winnability
  const answer = slotCards.map((cardId, i) => ({ cardId, orientation: orientations[i] }));
  let st = { slots: answer, clues: [...b.clues] };
  for (let k = 0; k < 4; k++) {
    must(isClueRotation(st.clues, b.clues), `rotation ${k} recognised`);
    const r = bestSubmit(st.slots, b.solution, new Set(), st.clues, b.clues);
    must(r.correct.size === 4 && r.wrong.size === 0, `answer accepted at rotation ${k}`);
    st = rotate(st.slots, st.clues);
  }
  const turned = answer.map((s, i) => (i === 1 ? { ...s, orientation: (s.orientation + 1) % 4 } : s));
  let r = bestSubmit(turned, b.solution, new Set(), b.clues, b.clues);
  must(r.correct.size === 3 && r.wrong.has(1), "one turned card is the only wrong slot");
  const withExtra = answer.map((s, i) => (i === 2 ? { cardId: extraCards[0], orientation: 0 } : s));
  r = bestSubmit(withExtra, b.solution, new Set(), b.clues, b.clues);
  must(r.correct.size === 3 && r.wrong.has(2), "an extra card on the board is wrong");
  const swapped = [answer[1], answer[0], answer[2], answer[3]];
  r = bestSubmit(swapped, b.solution, new Set(), b.clues, b.clues);
  must(!r.correct.has(0) && !r.correct.has(1), "swapped cards are wrong");
  r = bestSubmit(withExtra, b.solution, new Set([2]), b.clues, b.clues);
  must(r.correct.size === 0 && r.wrong.size === 4, "a guess that would undo a locked slot is refused whole");
  // 3. opening deal
  for (const [diff, extra] of Object.entries(DIFFICULTY_EXTRA)) {
    const ids = [...slotCards, ...extraCards.slice(0, extra)];
    for (let s = 1; s <= 25; s++) {
      const deal = biasedShuffle(ids, b.solution, mulberry32(s * 7919 + b.index));
      must(deal.length === ids.length && new Set(deal.map((d) => d.cardId)).size === ids.length, `${diff} deal has every card once`);
      const solved = bestSubmit(deal.slice(0, 4), b.solution, new Set(), b.clues, b.clues).correct.size;
      must(solved < 4, `${diff} deal never starts solved (seed ${s})`);
    }
  }
  // 4. state transitions (the board's rules, simulated)
  let lives = 3, locked = new Set();
  const knownBad = new Map();
  const guess = (slots) => {
    const res = bestSubmit(slots, b.solution, locked, b.clues, b.clues);
    if (res.correct.size === 4) return "won";
    res.wrong.forEach((si) => { if (!knownBad.has(si)) knownBad.set(si, new Set()); knownBad.get(si).add(`${slots[si].cardId}:${slots[si].orientation}`); });
    locked = new Set([...locked, ...res.correct]); lives -= 1;
    return lives <= 0 ? "lost" : "again";
  };
  const g1 = answer.map((s, i) => (i >= 2 ? { ...s, orientation: (s.orientation + 2) % 4 } : s));
  must(guess(g1) === "again" && lives === 2 && locked.size === 2, "first wrong guess: 2 lives, 2 locked");
  const repeated = `${g1[2].cardId}:${g1[2].orientation}`;
  must(knownBad.get(2)?.has(repeated), "the wrong placement is remembered for that slot");
  const g2 = answer.map((s, i) => (i === 3 ? { ...s, orientation: (s.orientation + 1) % 4 } : s));
  must(guess(g2) === "again" && lives === 1 && locked.size === 3, "second wrong guess: 1 life, 3 locked");
  must(guess(answer) === "won", "the answer wins with one life left");
  lives = 3; locked = new Set();
  must(guess(g1) === "again" && guess(g1) === "again" && guess(g1) === "lost" && lives === 0, "three wrong guesses lose");

  if (errs.length) failures++;
  rows.push({ id: b.id, clues: b.clues.join(" / "), ok: errs.length === 0, errs });
}
for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.clues}${r.errs.length ? "\n      - " + r.errs.join("\n      - ") : ""}`);
console.log(`\n${boards.length - failures}/${boards.length} boards pass every check`);
process.exit(failures ? 1 : 0);
