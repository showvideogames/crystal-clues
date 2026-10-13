// Offline fairness check for Deal Random Cards. Reads nothing from the network.
//
//   node tools/wordbank-fairness.mjs --words words.json [--deals 200000] [--tail 81]
//
// words.json: an array of words, or of { word } rows (e.g. a saved export of the
// word bank). Runs the real dealCardsFromBank on Math.random, as the app does,
// and reports the pool size, whether every word (and the last --tail words in
// alphabetical order) is reachable, how even the draws are (chi-square against
// "every word equally likely"), and how often words repeat between deals.
import { readFileSync } from "node:fs";
import { dealCardsFromBank } from "../src/game/shared.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const file = arg("words");
if (!file) { console.error("usage: node tools/wordbank-fairness.mjs --words words.json [--deals N] [--tail N]"); process.exit(2); }
const deals = Number(arg("deals", 200000));
const tailSize = Number(arg("tail", 81));

const raw = JSON.parse(readFileSync(file, "utf8"));
const bank = raw.map((r) => (typeof r === "string" ? r : r.word));
const alpha = [...bank].sort((a, b) => a.localeCompare(b));
const tail = new Set(alpha.slice(-tailSize));

const n = new Set(bank.map((w) => w.trim().toUpperCase())).size;
console.log(`bank: ${bank.length} entries, ${n} distinct words; pool used by each deal: ${n}`);
console.log(`deals: ${deals.toLocaleString()} x 28 words (Math.random)\n`);

const count = new Map();
let repeatsInDeal = 0, tailDrawn = 0, overlapSum = 0, prev = null;
let id = 0;
const makeId = () => `c${id++}`;
for (let d = 0; d < deals; d++) {
  const words = Object.values(dealCardsFromBank(bank, makeId).cards).flatMap((c) => c.words);
  const set = new Set(words);
  repeatsInDeal += words.length - set.size;
  for (const w of words) { count.set(w, (count.get(w) || 0) + 1); if (tail.has(w) || tail.has(w.toUpperCase())) tailDrawn++; }
  if (prev) for (const w of set) if (prev.has(w)) overlapSum++;
  prev = set;
}

const upper = bank.map((w) => w.toUpperCase());
const counts = upper.map((w) => count.get(w) || 0);
const expected = (deals * 28) / n;
const chi = counts.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
const df = n - 1, sd = Math.sqrt(2 * df);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
console.log(`words never drawn:              ${counts.filter((c) => c === 0).length}`);
console.log(`draws per word (expected ${expected.toFixed(1)}): min ${Math.min(...counts)}, max ${Math.max(...counts)}`);
console.log(`chi-square vs equal chance:     ${chi.toFixed(1)}  (fair: ${df} ± ${sd.toFixed(1)}; ${((chi - df) / sd).toFixed(2)} sd)`);
console.log(`share of draws from the last ${tailSize} words: ${pct(tailDrawn / (deals * 28))}  (equal chance: ${pct(tailSize / n)})`);
console.log(`a word twice within one deal:   ${repeatsInDeal}`);
console.log(`words shared with the previous deal: ${(overlapSum / (deals - 1)).toFixed(3)} per deal  (equal chance: ${((28 * 28) / n).toFixed(3)})`);
const fair = Math.abs(chi - df) < 5 * sd && repeatsInDeal === 0 && counts.every((c) => c > 0);
console.log(`\n${fair ? "PASS" : "FAIL"}: ${fair ? "draws are consistent with every word being equally likely" : "see the numbers above"}`);
process.exit(fair ? 0 : 1);
