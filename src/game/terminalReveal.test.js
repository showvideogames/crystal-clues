import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameView } from '../App.jsx';
import { vw } from './shared.js';

const puzzle = {
  id: 'local-reveal-fixture', clues: ['STAR', 'TROUSERS', 'LASSO', 'POPE'],
  cards: {
    a: { words: ['ROCK', 'PHONE', 'GRAPE', 'WHITE'] },
    b: { words: ['CINEMA', 'SUIT', 'CHEF', 'GUN'] },
    c: { words: ['TETRIS', 'PANTS', 'COWBOY', 'DROP'] },
    d: { words: ['FLY', 'OCTOPUS', 'WOMAN', 'SMOKE'] },
    e: { words: ['COMIC', 'PEARL', 'EMERGENCY', 'SWING'] },
    f: { words: ['POLAR', 'BARRACKS', 'THERMOMETER', 'CHAIR'] },
    g: { words: ['COMPOUND', 'LOG', 'SHORT', 'SHARP'] },
  },
  solution: { slotCards: ['a', 'b', 'c', 'd'], orientations: [0,0,0,0], extraCards: ['e','f','g'] },
};
let root, host;
const advance = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const click = async text => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button.click());
};
async function turnWrongCard() {
  const tile = [...host.querySelectorAll('.cslot .ctile')].find(t=>!t.classList.contains('locked'));
  await act(async () => {
    tile.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true,clientX:10,clientY:10}));
    document.dispatchEvent(new MouseEvent('pointerup', {bubbles:true,clientX:10,clientY:10}));
  });
  await advance(400);
}
function expectAligned() {
  const tiles = [...host.querySelectorAll('.cslot')];
  // DOM grid order is TL, TR, BL, BR; geometry uses clockwise slot order.
  const words = [tiles[0], tiles[1], tiles[3], tiles[2]].map(tile =>
    ['.et','.er','.eb','.el'].map(edge => tile.querySelector(edge).textContent));
  const hints = ['top','rgt','bot','lft'].map(side => host.querySelector(`.ctab.${side}`).textContent);
  const pairs = [[words[0][0],words[1][0]], [words[1][1],words[2][1]], [words[2][2],words[3][2]], [words[3][3],words[0][3]]];
  const expected = { STAR:['CINEMA','ROCK'], TROUSERS:['PANTS','SUIT'], LASSO:['COWBOY','WOMAN'], POPE:['SMOKE','WHITE'] };
  hints.forEach((hint,i) => expect(pairs[i].sort(), hint).toEqual([...expected[hint]].sort()));
  expect(host.querySelectorAll('.cslot .locked')).toHaveLength(4);
  expect(host.querySelector('.game-stars').getAttribute('aria-label')).toBe('0 of 3 lives left');
}
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
for (const unlimited of [false,true]) describe(unlimited ? 'Unlimited terminal reveal' : 'Daily terminal reveal', () => {
  for (const turns of [0,1,2,3,4]) it(`two wrong guesses, ${turns} rotations, terminal wrong guess`, async () => {
    localStorage.setItem(`clover_progress_${puzzle.id}`, JSON.stringify({
      totalSlots:7, slots:['a','e','c','d','b','f','g'].map(cardId=>({cardId,orientation:0})),
      clues:puzzle.clues, lives:3, locked:[], guessHistory:[],
    }));
    const onFinished=vi.fn();
    await act(async () => root.render(createElement(GameView,{puzzle,unlimited,onFinished,difficulty:'hardcore'})));
    await click('Submit'); await advance(7000);
    await turnWrongCard();
    await click('Submit'); await advance(7000);
    await turnWrongCard();
    for(let i=0;i<turns;i++){ await click('Rotate'); await advance(700); }
    await click('Submit'); await advance(14000);
    expectAligned();
    expect(onFinished).toHaveBeenCalledTimes(1);
    const result = onFinished.mock.calls[0][0];
    expect(result).toMatchObject({won:false,livesUsed:3});
    // Persisted results must restore exactly the board the player saw.
    const tiles = [...host.querySelectorAll('.cslot')];
    [0,1,3,2].forEach((si,domIndex) => {
      const slot = result.slots[si];
      expect([...tiles[domIndex].querySelectorAll('.ew')].map(e=>e.textContent))
        .toEqual(vw(puzzle.cards[slot.cardId],slot.orientation));
    });
    expect(new Set(result.slots.map(s=>s.cardId)).size).toBe(7);
  });
});
