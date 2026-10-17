#!/usr/bin/env node
// Refreshes the reveal snapshots of an already-assembled batch from the pair
// library WITHOUT re-assembling: the same boards, pairs, hints, cards,
// solutions and ids; only the player-facing text (and reference) of each
// reveal entry is re-copied from the library. Used when approved wording
// corrections land at the source after a batch was reviewed.
//   node scripts/unlimited/refresh-reveal.mjs data/unlimited/boards/beta-02/boards.json
// Refuses if any board's hint text or pair no longer matches a playable hint
// in the library (that would be new content, not a text refresh).
import { readFileSync, writeFileSync } from "node:fs";
const file = process.argv[2];
if (!file) { console.error("usage: refresh-reveal.mjs <boards.json>"); process.exit(2); }
const doc = JSON.parse(readFileSync(file, "utf8"));
const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const PLAYABLE = new Set(["ai_reviewed", "human_approved"]);
let changed = 0, same = 0;
for (const b of doc.boards) {
  b.reveal.forEach((r, i) => {
    const p = lib.pairs.find((x) => x.pair_id === r.pairId);
    const c = p?.clues.find((x) => x.text === r.clue);
    if (!p || !c) { console.error(`${b.id} clue ${i}: ${r.clue} for ${r.pairId} not in the library`); process.exit(1); }
    if (!PLAYABLE.has(c.status)) { console.error(`${b.id} clue ${i}: ${r.clue} is ${c.status}, not playable`); process.exit(1); }
    if (b.clues[i] !== r.clue || new Set([p.a, p.b, r.wordA, r.wordB]).size !== 2) { console.error(`${b.id} clue ${i}: reveal does not match the board`); process.exit(1); }
    const next = { wordAConnection: c.wordAConnection || "", wordBConnection: c.wordBConnection || "", revealExplanation: c.revealExplanation || "", reference: c.reference || null };
    const before = JSON.stringify({ wordAConnection: r.wordAConnection, wordBConnection: r.wordBConnection, revealExplanation: r.revealExplanation, reference: r.reference });
    if (before === JSON.stringify(next)) { same++; return; }
    Object.assign(r, next); changed++;
    console.log(`${b.id} clue ${i} ${r.clue} (${r.wordA}+${r.wordB}): text refreshed`);
  });
}
doc._metadata.revealRefreshed = { at: new Date().toISOString(), changed, unchanged: same, note: "player text re-copied from the library; boards, pairs, hints and ids unchanged" };
writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
console.log(`${file}: ${changed} reveal entries refreshed, ${same} unchanged, ${doc.boards.length} boards untouched otherwise`);
