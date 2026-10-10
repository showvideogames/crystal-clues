// Board geometry, difficulty tables and puzzle-building helpers shared by
// the daily game (App.jsx) and the friend exchange (src/friends).

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
// Returns null when the bank is too small to be useful.
export function dealCardsFromBank(wordBank, makeId) {
  // Need 7 cards × 4 words each = 28 words minimum; fall back to repeating bank if small
  const bank = [...wordBank];
  if(bank.length < 4) return null; // not enough words to do anything useful

  // Shuffle the bank
  for(let i=bank.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));[bank[i],bank[j]]=[bank[j],bank[i]];
  }

  // Build a pool that repeats the bank if needed to fill 28 words
  const pool = [];
  while(pool.length < 28) pool.push(...bank);
  // Shuffle the pool
  for(let i=pool.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];
  }

  // Create 7 cards: 4 solution + 3 extra
  const TOTAL = 7;
  const cards = {};
  const slots = [];
  for(let c=0;c<TOTAL;c++){
    const id = makeId();
    const words = [
      pool[c*4]   || '',
      pool[c*4+1] || '',
      pool[c*4+2] || '',
      pool[c*4+3] || '',
    ].map(w=>w.toUpperCase());
    cards[id] = { id, words };
    slots.push({ cardId:id, orientation: Math.floor(Math.random()*4) });
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
