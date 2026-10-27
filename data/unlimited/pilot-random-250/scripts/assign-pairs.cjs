// Seeded random assignment of N unused pairs from the 810-word pilot list.
// Usage: node assign-pairs.js <handoffDir> <pilotDir> [N=250]
// Rank = SHA-256(SEED + "|" + pair_key); take the N lowest-ranked pairs that are
//   (a) in Claude's partition (SHA-256(pair_key) odd, per partition-rule.json) and
//   (b) not in any known exclusion / attempt / reservation source.
// No difficulty, coverage or hint-based filtering of any kind.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [H, PILOT, Narg] = process.argv.slice(2);
const N = Number(Narg || 250);
const SEED = 'cluevoyance-claude-random-pilot-250-001-2026-10-26';
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest();
const norm = w => String(w).trim().toUpperCase().replace(/\s+/g, ' ');
const keyOf = (a, b) => [norm(a), norm(b)].sort().join(' + ');
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));

const words = J(path.join(H, 'pilot-working-810-words.json')).map(norm);
if (new Set(words).size !== 810) throw new Error('expected 810 unique words');

// ---- exclusion union -------------------------------------------------------
const ex = new Map(); // key -> [sources]
const add = (k, src) => { k = keyOf(...k.split(' + ')); (ex.get(k) || ex.set(k, []).get(k)).push(src); };
for (const e of J(path.join(H, 'canonical-exclusions.json')).entries) add(e.pair_key, 'canonical-exclusions');
const snap = J(path.join(H, 'current-catalogue-pair-snapshot.json'));
snap.current_served_pair_keys.forEach(k => add(k, 'served@020008d'));
snap.current_master_pairs.forEach(m => add(m.pair_key, 'master@020008d'));
J(path.join(H, 'codex-oct26-pass-2907.json')).forEach(c => add(c.pair_key, 'codex-oct26-pass'));
const pend = J(path.join(H, 'pending-editorial-not-live.json'));
pend.pending_editorial_entries.forEach(e => add(e.pair_key, 'pending-editorial'));
pend.unapproved_proposals.forEach(e => add(e.pair_key, 'unapproved-proposal'));
pend.pr32_unmerged_owner_decisions.decisions.forEach(e => add(e.pair.join(' + '), 'pr32-unmerged'));
(pend.new_pool_calibration.entries || []).forEach(e => add(e.pair_key, 'calibration'));
// Claude's own local work (review-500, 10-22 candidates, stray local keys)
const repo = path.resolve(PILOT, '..');
J(path.join(repo, 'review-500-2026-10-26', 'review-results.json')).results.forEach(r => add(r.pair_key, 'claude-review-500'));
for (const f of ['ALL-candidates.csv', 'excluded-pairs.txt'])
  for (const l of fs.readFileSync(path.join(repo, 'new-candidates-2026-10-22', f), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^"?([A-Z][A-Z' .-]*[A-Z]) \+ ([A-Z][A-Z' .-]*[A-Z])"?(,|$)/); if (m) add(m[1] + ' + ' + m[2], 'claude-nc1022/' + f);
  }
J(path.join(PILOT, 'inputs', 'claude-local-keys-missing-from-canonical.json')).missing_keys.forEach(m => add(m.pair_key, 'claude-local-scan'));

// ---- enumerate, partition, rank -------------------------------------------
let universe = 0, claudeHalf = 0, excludedInHalf = 0;
const cand = [];
for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
  universe++;
  const k = keyOf(words[i], words[j]);
  const h = sha(k);
  if ((h[h.length - 1] & 1) !== 1) continue;           // Codex owns even hashes
  claudeHalf++;
  if (ex.has(k)) { excludedInHalf++; continue; }
  cand.push({ k, rank: sha(SEED + '|' + k).toString('hex') });
}
cand.sort((a, b) => (a.rank < b.rank ? -1 : 1));
const pick = cand.slice(0, N).map((c, i) => {
  const [a, b] = c.k.split(' + ');
  return { pilot_id: `RP1-${String(i + 1).padStart(3, '0')}`, pair_key: c.k, a, b, rank: c.rank, checkpoint: `cp-${String(Math.floor(i / 25) + 1).padStart(2, '0')}` };
});
const wordUse = {}; pick.forEach(p => [p.a, p.b].forEach(w => (wordUse[w] = (wordUse[w] || 0) + 1)));
const out = {
  created_utc: new Date().toISOString(), seed: SEED, method: 'rank = SHA-256(seed|pair_key) ascending over unordered pairs of the 810-word list; Claude partition (SHA-256(pair_key) odd); exclusions skipped; no hint/difficulty filtering',
  word_list_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(H, 'pilot-working-810-words.json'))).digest('hex'),
  counts: { universe_pairs: universe, claude_partition: claudeHalf, excluded_in_partition: excludedInHalf, available: cand.length, assigned: pick.length, distinct_words: Object.keys(wordUse).length, max_word_repeat: Math.max(...Object.values(wordUse)) },
  exclusion_union_size: ex.size, next_cursor_rank: cand[N] && cand[N].rank, pairs: pick,
};
fs.writeFileSync(path.join(PILOT, 'assignment.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.counts), 'exclusion union', ex.size);
