import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCatalogue, pairOf, hintProblem, servedHints } from './catalogue-lib.mjs';
import { hintChoices } from './assemble-boards.mjs';
import { generateBoard, validateBoard, hintKey } from '../../src/unlimited/generate.js';
const read = p => JSON.parse(readFileSync(p,'utf8'));
const ledger = read('data/unlimited/imports/owner-20261024/decisions.json');
const ix = loadCatalogue();
test('approved owner ordering survives catalogue and served export; excluded hints stay out', () => {
  const client = read('src/unlimited/random-library.json');
  for (const d of ledger.decisions) {
    const id = pairOf(...d.pair).id, p = ix.byId.get(id);
    assert.deepEqual(p.clues.slice(0,d.hints.length).map(c=>c.text),d.hints.map(h=>h.text));
    for (const h of d.hints) { assert.equal(hintProblem(h.text,p.a,p.b),null); assert.equal(p.clues.find(c=>c.text===h.text).status,'human_approved'); }
    assert.deepEqual(servedHints(ix,p).hints.map(h=>h.text),[d.primary]);
    assert.deepEqual(hintChoices(p,p.clues,ix.preferences).hints.map(h=>h.text),[d.primary]);
    assert.deepEqual(client.pairs.find(p=>p.id===id).hints.map(h=>h.text),[d.primary]);
  }
  for (const r of ledger.rejections) assert.ok(!client.pairs.find(p=>p.id===pairOf(...r.pair).id)?.hints.some(h=>h.text===r.hint));
  assert.ok(!ledger.decisions.some(d=>pairOf(...d.pair).id==='p_cave__monster'));
  assert.match(hintProblem('EARRING','EAR','MAGNET'),/contains a target/);
});
test('new numeric, accent and natural hyphen spellings survive complete Unlimited boards', () => {
  const client = read('src/unlimited/random-library.json');
  const ids = ['p_bond__england','p_drink__laugh','p_china__snake','p_candle__knife'];
  const pairs = client.pairs.filter(p=>ids.includes(p.id));
  // NÜWA is owner-approved as an alternative, not silently promoted in the real library.
  const china = ix.byId.get('p_china__snake');
  pairs.find(p=>p.id===china.pair_id).hints = [china.clues.find(c=>c.text==='NÜWA')];
  const fixture = {...client,pairs};
  for (let seed=0;seed<30;seed++) { const b=generateBoard(fixture,{seed});assert.ok(b);assert.deepEqual(validateBoard(b,fixture),[]);assert.ok(b.clues.includes('007'));assert.ok(b.clues.includes('NÜWA'));assert.ok(b.clues.includes('SPIT-TAKE'));assert.equal(Object.values(b.cards).flatMap(c=>c.words).length,28); }
  assert.equal(hintKey('NU\u0308WA'),hintKey('NÜWA')); assert.notEqual(hintKey('NÜWA'),'NWA');
});
test('replaying the owner ledger does not duplicate overrides, preferences, text history or hints', () => {
  const dir=mkdtempSync(join(tmpdir(),'cv-owner-'));
  const files=['data/unlimited/library/pairs.json','data/unlimited/library/preferences.json','data/unlimited/library/overrides.json','data/unlimited/library/rejections.json','data/unlimited/wordbank/wordbank.json','data/unlimited/imports/owner-20261024/decisions.json'];
  for(const f of files){mkdirSync(dirname(join(dir,f)),{recursive:true});copyFileSync(f,join(dir,f));}
  const before=files.slice(0,4).map(f=>readFileSync(join(dir,f),'utf8'));
  execFileSync(process.execPath,[resolve('scripts/unlimited/import-owner-20261024.mjs')],{cwd:dir});
  assert.deepEqual(files.slice(0,4).map(f=>readFileSync(join(dir,f),'utf8')),before);
  const result=read(join(dir,'data/unlimited/imports/owner-20261024/implementation-result.json'));
  for(const k of ['addedPairs','addedOptions','newlyApprovedExistingOptions','changedPreferences','addedRejections'])assert.equal(result[k],0,k);
});

test('owner calibration is explicit and provisional CHARM is not imported', () => {
  const expected = {
    p_layer__skin: ['EPIDERMIS'], p_cliff__series: ['SUSPENSE'],
    p_cream__pearl: ['WHITE'], p_hawk__sea: ['DIVE', 'GULL'],
    p_cliff__closet: ['HANGER'],
  };
  for (const [id, hints] of Object.entries(expected)) {
    const d = ledger.decisions.find(d => pairOf(...d.pair).id === id);
    assert.deepEqual(d.hints.map(h => h.text), hints);
  }
  assert.ok(!ledger.decisions.some(d => pairOf(...d.pair).id === 'p_luck__pocket'));
  assert.ok(ledger.excluded.some(d => pairOf(...d.pair).id === 'p_luck__pocket' && d.reasons.includes('provisional_pending_improvement')));
  for (const [id, hint] of [['p_cream__pearl', 'PRINCE'], ['p_hawk__sea', 'OSPREY']]) {
    assert.ok(ledger.rejections.some(d => pairOf(...d.pair).id === id && d.hint === hint));
  }
});
