// Scan local Claude-side folders for any pair keys (A + B, p_a__b, or a/b JSON fields) over the target bank,
// and report those missing from the handoff's canonical exclusions.
// Usage: node scan-local-keys.js <handoffDir> <outFile> <root...>
const fs = require('fs'), path = require('path');
const [H, OUT, ...roots] = process.argv.slice(2);
const cat = JSON.parse(fs.readFileSync(path.join(H, 'current-served-catalogue.json')));
const bank = new Set(cat.words.map(w => (w.word || w).toUpperCase().replace(/\s+/g, ' ').trim()));
for (const w of JSON.parse(fs.readFileSync(path.join(H, 'pilot-working-810-words.json')))) bank.add(String(w).toUpperCase());
const ex = new Set(JSON.parse(fs.readFileSync(path.join(H, 'canonical-exclusions.json'))).entries.map(e => e.pair_key));
const key = (a, b) => [a, b].map(s => s.trim().toUpperCase().replace(/\s+/g, ' ')).sort().join(' + ');
const found = new Map(); // key -> Set(files)
const SKIP = /node_modules|\.git$|dist$|\.vercel|handoff$/;
const plus = /([A-Z][A-Z'.\- ]{0,25}[A-Z]) \+ ([A-Z][A-Z'.\- ]{0,25}[A-Z])/g;
const pid = /p_([a-z0-9'\-]+)__([a-z0-9'\-]+)/g;
const ab = /"(?:a|word_a|wordA)"\s*:\s*"([^"]+)"\s*,\s*"(?:b|word_b|wordB)"\s*:\s*"([^"]+)"/g;
function note(a, b, f) {
  a = a.trim().toUpperCase().replace(/\s+/g, ' '); b = b.trim().toUpperCase().replace(/\s+/g, ' ');
  if (a === b || !bank.has(a) || !bank.has(b)) return;
  const k = key(a, b); if (!found.has(k)) found.set(k, new Set()); found.get(k).add(f);
}
function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.test(p)) walk(p); continue; }
    if (!/\.(json|jsonl|csv|tsv|txt|md)$/i.test(e.name)) continue;
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.size > 40e6) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const m of t.matchAll(plus)) {
      // trim leading words until both sides are bank words (handles "THE CROW + SHIP" style prose)
      let A = m[1].split(' '), B = m[2].split(' ');
      for (let i = 0; i < A.length; i++) for (let j = B.length; j > 0; j--) { const a = A.slice(i).join(' '), b = B.slice(0, j).join(' '); if (bank.has(a) && bank.has(b)) { note(a, b, p); i = A.length; break; } }
    }
    for (const m of t.matchAll(pid)) note(m[1].replace(/-/g, ' '), m[2].replace(/-/g, ' '), p);
    for (const m of t.matchAll(ab)) note(m[1], m[2], p);
  }
}
roots.forEach(walk);
const missing = [...found.keys()].filter(k => !ex.has(k)).sort();
const byFile = {};
for (const k of missing) for (const f of found.get(k)) byFile[f] = (byFile[f] || 0) + 1;
fs.writeFileSync(OUT, JSON.stringify({ scanned_roots: roots, found_keys: found.size, missing_from_canonical: missing.length,
  missing_by_file: Object.fromEntries(Object.entries(byFile).sort((a, b) => b[1] - a[1])),
  missing_keys: missing.map(k => ({ pair_key: k, files: [...found.get(k)] })) }, null, 1));
console.log('found', found.size, 'missing', missing.length);
console.log(Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 25).map(e => e[1] + '  ' + e[0]).join('\n'));
