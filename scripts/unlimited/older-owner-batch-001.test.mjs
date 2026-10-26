import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairOf, hintProblem, hintKey } from './catalogue-lib.mjs';
import { generateBoard, validateBoard } from '../../src/unlimited/generate.js';
const read = p => JSON.parse(readFileSync(p,'utf8'));
const ledger=read('data/unlimited/imports/older-owner-batch-001/decisions.json');
const lib=read('data/unlimited/library/pairs.json');
const prefs=read('data/unlimited/library/preferences.json').pairs;
const client=read('src/unlimited/random-library.json');
test('approved499-pair release plus separate SUN correction: exact unique pairs, ordered options, explanations and served primary',()=>{
 assert.equal(ledger.decisions.length,500);
 assert.equal(new Set(ledger.decisions.map(d=>pairOf(...d.pair).id)).size,500);
 assert.equal(ledger.decisions.reduce((n,d)=>n+d.hints.length,0),509);
 for(const d of ledger.decisions){
  const {id,a,b}=pairOf(...d.pair), p=lib.pairs.find(p=>p.pair_id===id);
  assert.ok(p,id);
  assert.deepEqual(p.clues.slice(0,d.hints.length).map(h=>h.text),d.hints.map(h=>h.text),id);
  assert.equal(new Set(p.clues.map(h=>hintKey(h.text))).size,p.clues.length,id);
  assert.equal(prefs[id].canonical,d.primary,id);
  assert.deepEqual(prefs[id].alternatives,d.hints.slice(1).map(h=>h.text),id);
  assert.deepEqual(client.pairs.find(p=>p.id===id)?.hints.map(h=>h.text),[d.primary],id);
  for(const h of d.hints){
   assert.equal(hintProblem(h.text,a,b),null,id);
   const actual=p.clues.find(c=>c.text===h.text);
   assert.equal(actual.status,'human_approved',id);
   for(const field of ['wordAConnection','wordBConnection','revealExplanation'])assert.equal(actual[field],h[field],id+' '+field);
  }
 }
 assert.ok(!client.pairs.some(p=>p.id==='p_grenade__mustard'));
 assert.equal(prefs.p_prince__squash.canonical,'COURT');
 assert.deepEqual(prefs.p_cable__cat.alternatives,['CHEWING']);
 assert.equal(prefs.p_marvel__torch.canonical,'SUPERHERO');
 assert.equal(prefs.p_gamble__revolver.canonical,'ROULETTE');
 assert.equal(prefs.p_ray__telescope.canonical,'SUN');
 assert.deepEqual(prefs.p_ray__telescope.alternatives,['LIGHT']);
});
test('lean Unlimited smoke: new content loads into a valid complete random board',()=>{
 const board=generateBoard(client,{seed:20261026,createdAt:'2026-10-26T00:00:00.000Z'});
 assert.deepEqual(validateBoard(board,client),[]);
 assert.equal(Object.values(board.cards).flatMap(c=>c.words).length,28);
 const ids=new Set(ledger.decisions.map(d=>pairOf(...d.pair).id));
 const batchOnly={...client,pairs:client.pairs.filter(p=>ids.has(p.id))};
 const sample=generateBoard(batchOnly,{seed:499,createdAt:'2026-10-26T00:00:00.000Z'});
 assert.deepEqual(validateBoard(sample,batchOnly),[]);
});
