// Merge drafts + independent reviews into pilot results, retry queue and beta input.
// Usage: node merge-pilot.cjs <pilotDir>
// Every assigned pair ends in exactly one of: reviewed (PASS / FIX / RESCUE) or retry (FAIL).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = process.argv[2];
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const L = f => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
const assign = J(path.join(P, 'assignment.json'));
const norm = t => String(t || '').trim().toUpperCase().replace(/\s+/g, ' ');
const letters = t => norm(t).replace(/[^A-Z0-9]/g, '');
function repeats(h, w) {
  const a = letters(h), b = letters(w);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k >= 4;
}

const drafts = {}, reviews = {}, problems = [];
for (let c = 1; c <= 10; c++) {
  const cp = `cp-${String(c).padStart(2, '0')}`;
  const df = path.join(P, 'draft', `${cp}.jsonl`), rf = path.join(P, 'review', `${cp}.review.jsonl`);
  if (fs.existsSync(df)) L(df).forEach(r => (drafts[r.id] = { ...r, checkpoint: cp }));
  if (fs.existsSync(rf)) L(rf).forEach(r => (reviews[r.id] = r));
}
// Retry attempt 2 (blind fresh drafter + separate reviewer), if present.
const d2 = {}, r2 = {};
for (let c = 1; c <= 4; c++) {
  const df = path.join(P, 'retry1', `draft-a2-cp${c}.jsonl`), rf = path.join(P, 'retry1', `review-a2-cp${c}.jsonl`);
  if (fs.existsSync(df)) L(df).forEach(r => (d2[r.id] = { ...r, checkpoint: `retry1/a2-cp${c}` }));
  if (fs.existsSync(rf)) L(rf).forEach(r => (r2[r.id] = r));
}
const OV = fs.existsSync(path.join(P, 'coordinator-overrides.json')) ? J(path.join(P, 'coordinator-overrides.json')) : {};
const results = [], retry = [], beta = [];
const count = { assigned: assign.pairs.length, drafted: 0, drafter_no_good_hint: 0, reviewed: 0, PASS: 0, FIX: 0, RESCUE: 0, FAIL: 0, missing_review: 0, playable: 0, retry: 0, reference_primary: 0, reference_with_generic_alt: 0 };
for (const p of assign.pairs) {
  const d = drafts[p.pilot_id], r = reviews[p.pilot_id];
  if (!d) { problems.push(p.pilot_id + ' missing draft'); continue; }
  if (d.key !== p.pair_key) problems.push(p.pilot_id + ' key mismatch');
  d.st === 'NO_GOOD_HINT' ? count.drafter_no_good_hint++ : count.drafted++;
  if (!r) { count.missing_review++; problems.push(p.pilot_id + ' missing review'); continue; }
  count.reviewed++; count[r.verdict]++;
  if (!['PASS', 'FIX', 'RESCUE', 'FAIL'].includes(r.verdict)) problems.push(p.pilot_id + ' bad verdict ' + r.verdict);
  const attempts = [{ attempt: 1, draft: d, review: r }];
  let ok = r.verdict !== 'FAIL' && r.hint;
  let rev = r, drf = d;
  if (!ok && d2[p.pilot_id]) {
    const a2d = d2[p.pilot_id], a2r = r2[p.pilot_id];
    count.retry1_drafted = (count.retry1_drafted || 0) + 1;
    if (!a2r) problems.push(p.pilot_id + ' retry draft has no review');
    else {
      attempts.push({ attempt: 2, draft: a2d, review: a2r });
      count['retry1_' + a2r.verdict] = (count['retry1_' + a2r.verdict] || 0) + 1;
      if (a2r.verdict !== 'FAIL' && a2r.hint) { ok = true; rev = a2r; drf = a2d; count.rescued_by_retry1 = (count.rescued_by_retry1 || 0) + 1; }
    }
  }
  const r_ = rev, d_ = drf;
  const rec = { pilot_id: p.pilot_id, pair_key: p.pair_key, a: p.a, b: p.b, rank: p.rank, checkpoint: d.checkpoint,
    attempts, status: ok ? 'reviewed_playable' : 'retry', served_attempt: ok ? attempts.length : null };
  let r__ = r_;
  if (ok && OV[p.pilot_id]) { const o = OV[p.pilot_id]; rec.coordinator_override = o; r__ = { ...r_, hint: o.hint, a: o.a, b: o.b, alt: o.alt, verdict: r_.verdict + '+OVERRIDE' }; count.coordinator_overrides = (count.coordinator_overrides || 0) + 1; }
  { const r = r__, d = OV[p.pilot_id] && ok ? { ...d_, ref: OV[p.pilot_id].reference } : d_;
  if (ok) {
    const hint = norm(r.hint);
    const rep = [p.a, p.b].filter(w => repeats(hint, w));
    if (rep.length && !(OV[p.pilot_id] && OV[p.pilot_id].allow_target_letter_overlap)) problems.push(`${p.pilot_id} hint ${hint} repeats ${rep}`);
    // Reference flag: the drafter's flag holds when the hint survived unchanged; a rescued hint is judged by the reviewer's text.
    const ref = r.verdict === 'RESCUE' ? false : !!d.ref;
    const alt = r.alt && r.alt.h ? [{ text: norm(r.alt.h), wordAConnection: r.alt.a, wordBConnection: r.alt.b }] : [];
    rec.final = { hint, wordAConnection: r.a, wordBConnection: r.b, alternatives: alt, reference: ref, revised_from_draft: hint !== norm(d.h) || r.a !== d.a || r.b !== d.b };
    if (ref) { count.reference_primary++; if (alt.length) count.reference_with_generic_alt++; }
    beta.push({ pilot_id: p.pilot_id, pair_key: p.pair_key, a: p.a, b: p.b, hint, wordAConnection: r.a, wordBConnection: r.b, alternatives: alt, reference: ref });
    count.playable++;
  } else {
    count.retry++;
    retry.push({ pilot_id: p.pilot_id, pair_key: p.pair_key, a: p.a, b: p.b,
      attempts: attempts.map(x => ({ attempt: x.attempt, drafter_status: x.draft.st, drafter_hint: x.draft.h, drafter_note: x.draft.note, reviewer_verdict: x.review.verdict, reviewer_reason: x.review.reason })),
      status: attempts.length >= 2 ? 'owner_hard_pair_list' : 'retry_queue', note: 'Assigned pair kept; never swapped for an easier pair.' });
  }
  }
  results.push(rec);
}
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const meta = { created_utc: new Date().toISOString(), seed: assign.seed, assignment_sha256: hash(fs.readFileSync(path.join(P, 'assignment.json'))), counts: count, problems,
  state: 'pilot only: not imported into normal Unlimited, not published, owner_approval false' };
fs.writeFileSync(path.join(P, 'pilot-results.json'), JSON.stringify({ ...meta, results }, null, 1));
fs.writeFileSync(path.join(P, 'retry-queue.json'), JSON.stringify({ ...meta, entries: retry }, null, 1));
fs.writeFileSync(path.join(P, 'beta-input.json'), JSON.stringify(beta, null, 1));
console.log(JSON.stringify(count), problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno problems');
