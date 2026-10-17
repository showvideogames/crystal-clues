// Board geometry, difficulty tables and puzzle-building helpers shared by
// the daily game (App.jsx) and the friend exchange (src/friends).

import { shuffleArr } from "../utils/random.js";

export const CW_FROM = [3, 0, 1, 2];
// Puzzles always have 3 extras; difficulty controls how many the player sees
export const DIFFICULTY_EXTRA  = { easy:0, standard:1, expert:2, hardcore:3 };
export const DIFFICULTY_LABELS = { easy:"Easy", standard:"Standard", expert:"Expert", hardcore:"Hardcore" };
export const MAX_LIVES = 3;

// The four levels as players see them (daily lobby, settings, and a friend
// puzzle's start screen). desc matches DIFFICULTY_EXTRA.
export const DIFF_OPTIONS = [
  { key:"easy",     icon:"✨", name:"Easy",         desc:"4 cards, no extras" },
  { key:"standard", icon:"🌙", name:"Standard",    desc:"4 cards + 1 extra" },
  { key:"expert",   icon:"🌕", name:"Expert",       desc:"4 cards + 2 extras" },
  { key:"hardcore", icon:"🌑", name:"Hardcore",     desc:"4 cards + 3 extras" },
];

export const DIFF_RANK = { easy:0, standard:1, expert:2, hardcore:3 };

// Visual word at edge i when card has orientation k:
//   edge 0=top 1=right 2=bottom 3=left
export const vw = (card, orientation) =>
  card?.words
    ? [0,1,2,3].map(e => (card.words[(e - orientation + 4) % 4] ?? ""))
    : ["","","",""];

// Deal Random Cards: 7 cards (4 for the board + 3 extras) of 4 words each,
// drawn from the word bank at random and dropped in at random turns.
// Every word in the bank has the same chance, and a word is dealt at most once
// per deal (28 distinct words) whenever the bank holds 28 distinct words.
// Returns null when the bank is too small to be useful.
// `rng` returns [0,1); it is injectable only so tests can seed it.
export function dealCardsFromBank(wordBank, makeId, rng = Math.random) {
  // One entry per distinct word: a bank holding "Moon" and "MOON" must not
  // deal MOON twice, and a blank entry is not a word.
  const seen = new Set();
  const distinct = [];
  for(const w of wordBank){
    const key = String(w ?? "").trim().toUpperCase();
    if(!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(w);
  }
  if(distinct.length < 4) return null; // not enough words to do anything useful

  // Need 7 cards × 4 words each = 28 words; a bank smaller than that is
  // repeated to fill them (the only case in which a word can repeat).
  const bank = shuffleArr(distinct, rng);
  const pool = [];
  while(pool.length < 28) pool.push(...bank);
  const drawn = shuffleArr(pool, rng);

  // Create 7 cards: 4 solution + 3 extra
  const TOTAL = 7;
  const cards = {};
  const slots = [];
  for(let c=0;c<TOTAL;c++){
    const id = makeId();
    const words = [
      drawn[c*4]   || '',
      drawn[c*4+1] || '',
      drawn[c*4+2] || '',
      drawn[c*4+3] || '',
    ].map(w=>w.toUpperCase());
    cards[id] = { id, words };
    slots.push({ cardId:id, orientation: Math.floor(rng()*4) });
  }
  return { cards, slots };
}

// Completeness checks shown under the editor board. cardCount is how many
// of the slots (board first, then extras) the puzzle actually uses.
export function checkBoard({ clues, slots, cards, cardCount = 7 }) {
  const clueCount = clues.filter(c=>c?.trim()).length;
  const missingClues = Math.max(0, 4 - clueCount);
  const activeSlots = slots.slice(0,cardCount);
  let blankEdges = Math.max(0, cardCount - activeSlots.length) * 4;
  const seen = new Set();
  const duplicates = new Set();
  activeSlots.forEach(s=>{
    const words = cards[s.cardId]?.words || [];
    words.forEach((w)=>{
      const v = (w || "").trim().toUpperCase();
      if(!v){
        blankEdges += 1;
        return;
      }
      if(seen.has(v)) duplicates.add(v);
      seen.add(v);
    });
  });
  return {
    missingClues,
    blankEdges,
    duplicateCount: duplicates.size,
    canPublish: missingClues===0 && blankEdges===0,
  };
}

// ── Judging and dealing, shared by the daily game, the friend exchange and
//    the Unlimited tooling (scripts/unlimited). Pure: no React, no storage. ──

// Biased shuffle: keeps re-shuffling until fewer than 2 solution slots are
// accidentally correct. Caps at 10 attempts so it never hangs. `rng` returns
// [0,1); it is injectable only so tests and scripts can seed it.
export function biasedShuffle(cardIds, solution, rng = Math.random) {
  const attempt = () => {
    const cut = Math.floor(rng() * cardIds.length);
    const seeded = [...cardIds.slice(cut), ...cardIds.slice(0, cut)];
    return shuffleArr(seeded, rng).map(id => ({
      cardId: id,
      orientation: Math.floor(rng() * 4),
    }));
  };

  const countCorrect = slots => {
    if (!solution) return 0;
    return solution.slotCards.reduce((n, cardId, si) =>
      n + (slots[si]?.cardId === cardId && slots[si]?.orientation === solution.orientations[si] ? 1 : 0)
    , 0);
  };

  let best = attempt();
  let bestScore = countCorrect(best);

  // Try up to 10 times, keep the arrangement with the fewest accidental correct slots
  for (let i = 0; i < 10; i++) {
    if (bestScore < 2) break;
    const candidate = attempt();
    const score = countCorrect(candidate);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

// True when `clues` is `original` turned some number of quarter turns (the
// whole board rotates together, clues included).
export function isClueRotation(clues, original) {
  if(!Array.isArray(clues) || clues.length !== 4) return false;
  let rc=[...original];
  for(let r=0;r<4;r++){
    if(rc.every((c,i)=>c===clues[i])) return true;
    rc=CW_FROM.map(i=>rc[i]);
  }
  return false;
}

// Judges the four board slots against the stored answer, at whatever rotation
// the board is currently showing (found by matching the clues). Returns
// { correct, wrong } as Sets of slot indices. A guess that would unlock a
// slot already locked is never produced: if any locked slot is not correct in
// this rotation the whole guess is judged wrong.
export function bestSubmit(slots4, solution, locked, currentClues, originalClues) {
  // Determine which rotation of the board we're currently on by matching clues
  // Only check that specific rotation — prevents false positives from shuffled cards
  // accidentally matching a different rotation of the solution
  let boardRotation = 0;
  if(currentClues && originalClues) {
    for(let r=0;r<4;r++){
      let rc=[...originalClues];
      for(let k=0;k<r;k++) rc=CW_FROM.map(i=>rc[i]);
      if(rc.every((c,i)=>c===currentClues[i])){ boardRotation=r; break; }
    }
  }

  // Apply that rotation to the solution
  let sc=[...solution.slotCards], or=[...solution.orientations];
  for(let k=0;k<boardRotation;k++){
    const ns=CW_FROM.map(i=>sc[i]), no=CW_FROM.map(i=>(or[i]+1)%4);
    sc=ns; or=no;
  }

  const correct=new Set(), wrong=new Set();
  for(let i=0;i<4;i++){
    if(slots4[i]?.cardId===sc[i]&&slots4[i]?.orientation===or[i]) correct.add(i);
    else wrong.add(i);
  }
  // Still respect already-locked slots
  if([...locked].every(i=>correct.has(i)))
    return {correct,wrong};
  return {correct:new Set(),wrong:new Set([0,1,2,3])};
}
