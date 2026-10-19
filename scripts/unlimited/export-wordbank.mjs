#!/usr/bin/env node
// Snapshots the complete word bank for Unlimited (read-only).
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<publishable key> \
//     node scripts/unlimited/export-wordbank.mjs [out=data/unlimited/wordbank/wordbank.json]
// Reads with the app's own paged loader (src/game/wordBank.js: keyset pages by id,
// never a partial bank), then asks the database for its exact row count and
// refuses to write unless the two agree. Also reads the bank once more after
// loading and requires the same count, so a word added mid-export is noticed.
// The snapshot records every row as stored plus the normalised form used by
// Unlimited (trimmed, upper case, inner spaces collapsed); entries that collide
// after normalising are reported, and the first by id is kept.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { loadWordBank, wordBankPagePath } from "../../src/game/wordBank.js";

const URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_KEY || "";
const OUT = process.argv[2] || "data/unlimited/wordbank/wordbank.json";
if (!URL || !KEY) { console.error("set SUPABASE_URL and SUPABASE_KEY (the public publishable key)"); process.exit(2); }
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function exactCount() {
  const r = await fetch(`${URL}/rest/v1/wordbank?select=id`, { method: "HEAD", headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  if (!r.ok || !m) throw new Error(`count failed: HTTP ${r.status} ${r.headers.get("content-range")}`);
  return Number(m[1]);
}

const rows = [];
let pages = 0;
const before = await exactCount();
await loadWordBank(async ({ afterId, limit }) => {
  pages++;
  const r = await fetch(`${URL}/rest/v1/${wordBankPagePath({ afterId, limit })}`, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const page = await r.json();
  if (Array.isArray(page)) rows.push(...page);
  return page;
});
const after = await exactCount();
if (rows.length !== before || before !== after) throw new Error(`count mismatch: loaded ${rows.length}, database ${before} before / ${after} after`);

export const normWord = (w) => String(w).trim().toUpperCase().replace(/\s+/g, " ");
const seen = new Map(); const collisions = []; const blank = [];
for (const r of rows.sort((x, y) => x.id - y.id)) {
  const n = normWord(r.word);
  if (!n) { blank.push(r); continue; }
  if (seen.has(n)) collisions.push({ kept: seen.get(n), dropped: r }); else seen.set(n, r);
}
const words = [...seen.keys()].sort((a, b) => a.localeCompare(b));
const body = { words };
const out = {
  _metadata: {
    purpose: "complete word-bank snapshot for Unlimited extras and the pair catalogue",
    source: `${URL}/rest/v1/wordbank (read-only, paged by id via src/game/wordBank.js)`,
    fetchedAt: new Date().toISOString(), pages, rowCount: rows.length, databaseCount: before,
    distinctNormalised: words.length, multiword: words.filter((w) => w.includes(" ")).length,
    collisions, blank, contentHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  },
  rows: rows.map(({ id, word }) => ({ id, word })),
  ...body,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${OUT}: ${rows.length} rows (database count ${before}, re-read ${after}, ${pages} requests) -> ${words.length} distinct words, ${out._metadata.multiword} multiword, ${collisions.length} collisions, ${blank.length} blank`);
