#!/usr/bin/env node
// Bounded, idempotent owner-only import. No candidate-batch promotion.
// Run from repository root, then export-random-library.mjs. All decisions are
// preflighted in memory before files are written. Rejections remain pair-specific.
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS, pairOf, normHint, hintKey, hintProblem, PLAYABLE } from './catalogue-lib.mjs';
import { REJECTIONS, rejectionFor } from './rejections-lib.mjs';
const INPUT = 'data/unlimited/imports/owner-20261024/decisions.json';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const ledger = read(INPUT), lib = read(PATHS.pairs), pref = read(PATHS.preferences), ov = read(PATHS.overrides), rejs = read(REJECTIONS);
const bank = new Set(read(PATHS.bank).words), seen = new Set();
const report = { addedPairs: 0, addedOptions: 0, newlyApprovedExistingOptions: 0, changedPreferences: 0, addedRejections: 0, removedOptions: 0, decisions: [], excluded: ledger.excluded };
for (const d of ledger.decisions) {
  const { id, a, b } = pairOf(...d.pair);
  if (seen.has(id)) throw new Error(`duplicate decision ${id}`); seen.add(id);
  if (!bank.has(a) || !bank.has(b)) throw new Error(`outside bank ${id}`);
  if (!d.primary || d.hints[0]?.text !== d.primary) throw new Error(`missing or unordered primary ${id}`);
  if (new Set(d.hints.map(h => hintKey(h.text))).size !== d.hints.length) throw new Error(`duplicate options ${id}`);
  let p = lib.pairs.find(p => p.pair_id === id);
  if (!p) { p = { pair_id: id, a, b, source: 'owner-discovery', pairNote: null, reviewerBestAvailable: null, playableHints: 0, clues: [] }; lib.pairs.push(p); report.addedPairs++; }
  const before = pref.pairs[id] || null;
  const approved = [];
  for (const h of d.hints) {
    const error = hintProblem(h.text, a, b);
    if (error) throw new Error(`${id} ${h.text}: ${error}`);
    if (![h.wordAConnection, h.wordBConnection, h.revealExplanation].every(t => typeof t === 'string' && t.trim())) throw new Error(`missing explanation ${id} ${h.text}`);
    const blocked = rejectionFor(rejs.entries, a, b, h.text);
    if (blocked) throw new Error(`recorded ${blocked.decision}: ${id} ${h.text}`);
    let c = p.clues.find(c => hintKey(c.text) === hintKey(h.text));
    if (!c) {
      c = { ...h, text: normHint(h.text), status: 'candidate', heldReason: null, type: 'discovery', provenance: { source: 'owner-discovery', addedBy: 'owner', date: ledger.date, via: INPUT, note: d.source, candidateProvenance: d.candidateProvenance || null, blindReview: null } };
      p.clues.push(c); report.addedOptions++;
    } else {
      if (c.status !== 'human_approved') { report.newlyApprovedExistingOptions++; c.provenance ||= {}; c.provenance.owner20261024 ||= { previousStatus: c.status, previousOverride: c.override || null }; }
      // Preserve prior text and review evidence when approved explanation wording changes.
      const fields = ['wordAConnection','wordBConnection','revealExplanation','reference'];
      if (fields.some(k => JSON.stringify(c[k] ?? null) !== JSON.stringify(h[k] ?? null))) {
        c.provenance ||= {};
        c.provenance.ownerTextHistory ||= [];
        c.provenance.ownerTextHistory.push({ date: ledger.date, via: INPUT, previous: Object.fromEntries(fields.map(k => [k, c[k] ?? null])) });
        for (const k of fields) c[k] = h[k];
      }
    }
    const active = ov.overrides.filter(o => !o.superseded && o.pair_id === id && hintKey(o.text) === hintKey(c.text));
    let approval = active.find(o => o.status === 'human_approved' && /^owner\b/.test(o.by));
    for (const o of active) if (o !== approval) o.superseded = `owner decision ${ledger.date}: ${INPUT}`;
    if (!approval) { approval = { pair_id: id, text: c.text, status: 'human_approved', by: 'owner', date: ledger.date, reason: d.source, via: INPUT }; ov.overrides.push(approval); }
    c.status = 'human_approved'; c.heldReason = null;
    c.override = { by: approval.by, date: approval.date, status: approval.status, reason: approval.reason };
    approved.push(c);
  }
  p.clues = [...approved, ...p.clues.filter(c => !approved.includes(c))];
  const ordered = approved.map(c => c.text);
  if (before?.canonical !== ordered[0] || JSON.stringify(before?.alternatives || []) !== JSON.stringify(ordered.slice(1)) || before?.by !== 'owner') {
    pref.pairs[id] = { status: 'approved', canonical: ordered[0], alternatives: ordered.slice(1), by: 'owner', date: ledger.date, reason: d.source, via: INPUT, ...(before ? { previous: before } : {}) };
    report.changedPreferences++;
  }
  p.playableHints = p.clues.filter(c => PLAYABLE.has(c.status)).length;
  report.decisions.push({ pair_id: id, orderedOptions: ordered, previousCanonical: before?.canonical || null });
}
for (const r of ledger.rejections) {
  const { id, a, b } = pairOf(...r.pair); const hint = normHint(r.hint);
  if (ledger.decisions.some(d => pairOf(...d.pair).id === id && d.hints.some(h => hintKey(h.text) === hintKey(hint)))) throw new Error(`contradictory approval/rejection ${id} ${hint}`);
  let e = rejectionFor(rejs.entries, a, b, hint);
  if (!e) { e = { a, b, pair_id: id, hint, decision: r.decision, by: 'owner', date: ledger.date, reason: r.reason, via: INPUT }; rejs.entries.push(e); report.addedRejections++; }
  const p = lib.pairs.find(p => p.pair_id === id), c = p?.clues.find(c => hintKey(c.text) === hintKey(hint));
  if (c) { if (c.status !== e.decision) { c.provenance ||= {}; c.provenance.owner20261024 ||= { previousStatus: c.status, previousOverride: c.override || null }; } c.status = e.decision; c.heldReason = e.reason; c.override = { by: e.by, date: e.date, status: e.decision, reason: e.reason, via: REJECTIONS }; p.playableHints = p.clues.filter(c => PLAYABLE.has(c.status)).length; }
}
lib.pairs.sort((a,b) => a.pair_id.localeCompare(b.pair_id));
for (const [path, value] of [[PATHS.pairs,lib],[PATHS.preferences,pref],[PATHS.overrides,ov],[REJECTIONS,rejs]]) writeFileSync(path, JSON.stringify(value,null,2)+'\n');
writeFileSync('data/unlimited/imports/owner-20261024/implementation-result.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ ...report, decisions: report.decisions.length, excluded: report.excluded.length }));
