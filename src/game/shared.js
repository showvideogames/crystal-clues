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
