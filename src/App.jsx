import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { seeded01, shuffleArr } from "./utils/random";

// ═══════════════════════════════════════════════════════════════
//  SUPABASE
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = "https://qszqparrqyhegfznyaby.supabase.co";
const SUPABASE_KEY = "sb_publishable_6-Apb1INDlRXfchxEY1GyQ_vKC7bEOD";

async function sbFetch(path, options={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "",
      ...(options.headers||{}),
    },
  });
  if(!res.ok) { const t=await res.text(); throw new Error(t); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Puzzle shape in Supabase: { id, date, title, author, difficulty, status, clues, cards, solution }
// clues/cards/solution are stored as JSONB

async function dbLoadTodayPuzzle() {
  const today = new Date().toISOString().split("T")[0];
  const rows = await sbFetch(`puzzles?date=eq.${today}&status=eq.published&limit=1`);
  return rows?.[0] || null;
}

async function dbLoadAllPuzzles() {
  const rows = await sbFetch(`puzzles?order=date.desc`);
  return rows || [];
}

async function dbSavePuzzle(puzzle) {
  const numId = Number(puzzle.id);
  const id = isNaN(numId) ? puzzle.id : numId;
  await sbFetch(`puzzles?id=eq.${id}`, {
    method: "DELETE",
    prefer: "return=minimal",
  }).catch(()=>{});
  await sbFetch(`puzzles`, {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({
      id,
      date: puzzle.date,
      title: puzzle.title,
      author: puzzle.author || "",
      difficulty: puzzle.difficulty || "standard",
      status: puzzle.status,
      clues: puzzle.clues,
      cards: puzzle.cards,
      solution: puzzle.solution,
    }),
  });
}

async function dbDeletePuzzle(id) {
  await sbFetch(`puzzles?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
}

async function dbLoadWordBank() {
  const rows = await sbFetch(`wordbank?order=word.asc`);
  return (rows || []).map(r => r.word);
}

async function dbAddWords(newWords) {
  if(!newWords.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wordbank`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(newWords.map(word => ({ word }))),
  });
  // 409 conflict just means word already exists — that's fine
  if(!res.ok && res.status !== 409) {
    const t = await res.text();
    throw new Error(t);
  }
}

async function dbDeleteWord(word) {
  await sbFetch(`wordbank?word=eq.${encodeURIComponent(word)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CW_FROM = [3, 0, 1, 2];
// Puzzles always have 3 extras; difficulty controls how many the player sees
const DIFFICULTY_EXTRA  = { easy:0, standard:1, expert:2, hardcore:3 };
const DIFFICULTY_LABELS = { easy:"Easy", standard:"Standard", expert:"Expert", hardcore:"Hardcore" };
const SLOT_LABELS = ["TL","TR","BR","BL"];
const MAX_LIVES = 3;

const DEFAULT_STATS = {
  currentStreak:0,
  maxStreak:0,
  lastSolvedDate:null,
  totalPlayed:0,
  totalWon:0,
  livesUsedDist:{ '0':0, '1':0, '2':0, X:0 },
  difficultyWins:{ easy:0, standard:0, expert:0, hardcore:0 },
};

const formatLivesUsed = (livesUsed) => {
  if(livesUsed <= 0) return "Perfect — no lives used";
  return `${livesUsed} ${livesUsed===1 ? "life" : "lives"} used`;
};

const formatLivesUsedCompact = (livesUsed) => {
  if(livesUsed <= 0) return "Perfect";
  return `${livesUsed} ${livesUsed===1 ? "life" : "lives"} used`;
};

const normalizeStats = (raw={}) => ({
  currentStreak: raw.currentStreak || 0,
  maxStreak: raw.maxStreak || 0,
  lastSolvedDate: raw.lastSolvedDate || null,
  totalPlayed: raw.totalPlayed || 0,
  totalWon: raw.totalWon || 0,
  livesUsedDist: {
    '0': raw.livesUsedDist?.['0'] || 0,
    '1': raw.livesUsedDist?.['1'] || 0,
    '2': raw.livesUsedDist?.['2'] || 0,
    X: raw.livesUsedDist?.X || 0,
  },
  difficultyWins: {
    easy: raw.difficultyWins?.easy || 0,
    standard: raw.difficultyWins?.standard || 0,
    expert: raw.difficultyWins?.expert || 0,
    hardcore: raw.difficultyWins?.hardcore || 0,
  },
});

let _uid = 0;
const uid = () => `u${++_uid}`;

// Visual word at edge i when card has orientation k:
//   edge 0=top 1=right 2=bottom 3=left
const vw = (card, orientation) =>
  card?.words
    ? [0,1,2,3].map(e => (card.words[(e - orientation + 4) % 4] ?? ""))
    : ["","","",""];

// ═══════════════════════════════════════════════════════════════
//  DEFAULT PUZZLE  (demo — thematically coherent)
// ═══════════════════════════════════════════════════════════════
// Clues: TOP=HEAT, RIGHT=TALL, BOTTOM=BLUE, LEFT=WILD
// TL(c1): top=BLAZE, right=RIVER, bottom=CAVE, left=WOLF    (HEAT+WILD)
// TR(c2): top=EMBER, right=PEAK,  bottom=STORM,left=RIVER   (HEAT+TALL)
// BR(c3): top=CLIFF, right=TOWER, bottom=OCEAN,left=BOULDER (TALL+BLUE)
// BL(c4): top=THUNDER,right=BUSH, bottom=SKY,  left=STORM   (BLUE+WILD)
// Extra(c5): FROST/PINE/HAWK/DUNE

const DEFAULT_PUZZLE = {
  id:"demo-001", title:"Elements", status:"published",
  date: new Date().toISOString().split("T")[0],
  clues: ["HEAT","TALL","BLUE","WILD"],
  cards: {
    c1:{id:"c1",words:["BLAZE","RIVER","CAVE","WOLF"]},
    c2:{id:"c2",words:["EMBER","PEAK","STORM","RIVER"]},
    c3:{id:"c3",words:["CLIFF","TOWER","OCEAN","BOULDER"]},
    c4:{id:"c4",words:["THUNDER","BUSH","SKY","STORM"]},
    c5:{id:"c5",words:["FROST","PINE","HAWK","DUNE"]},
    c6:{id:"c6",words:["GUST","BLAZE","TIDE","CRAG"]},
    c7:{id:"c7",words:["MARSH","VALE","CREST","SMOKE"]},
  },
  solution:{ slotCards:["c1","c2","c3","c4"], orientations:[0,0,0,0],
    extraCards:["c5","c6","c7"] },
};

// ═══════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bungee:wght@400&family=Cinzel:wght@400;600;700;900&family=Raleway:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080514;--surface:#110c22;--board:#150e2a;
  --card:#1b1133;--card-b:#3a2866;
  --clue-bg:#221650;--clue-tx:#e8d5ff;
  --text:#e8d5ff;--muted:#8b75b8;
  --correct:#7c4dff;--wrong:#ff4455;
  --lock-bg:#1c1244;--wrong-bg:#2a0f18;--amber:#ffd700;
  --purple:#8b5cf6;--purple-bright:#c4b5fd;--purple-glow:rgba(139,92,246,0.5);
  --gold:#ffd700;--gold-dim:#b8960a;
  --fc:'Cinzel',serif;--fu:'Raleway',sans-serif;
  --cs:110px;--cg:8px;--step:calc(var(--cs) + var(--cg));
}
html,body{height:100%;width:100%;overflow:hidden;-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-family:var(--fu);background:var(--bg);color:var(--text);
  user-select:none;-webkit-user-select:none;touch-action:none}
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
  background:url('/assets/Ethereal starry sky and nebula.png') center center / cover no-repeat;
}
#root{height:100vh;height:100dvh;width:100%;max-width:440px;margin:0 auto;position:relative;z-index:1;overflow:hidden}

/* HEADER */
.hdr{height:54px;background:rgba(8,5,20,0.92);border-bottom:1px solid rgba(139,92,246,0.25);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 10px 0 16px;flex-shrink:0;z-index:10;position:relative;
  backdrop-filter:blur(12px);
  box-shadow:0 2px 24px rgba(0,0,0,.6)}
.logo{display:flex;align-items:center;gap:9px;font-family:var(--fc);
  font-size:16px;line-height:1;font-weight:700;color:var(--gold);letter-spacing:.1em;flex-shrink:0;
  text-shadow:0 0 24px rgba(255,215,0,.45)}
.logo-g{font-size:20px;line-height:1}
.nav{display:flex;gap:4px;align-items:center;flex-shrink:0}
.nbtn{height:32px;padding:0 10px;border:1px solid transparent;background:transparent;
  display:inline-flex;align-items:center;justify-content:center;
  color:var(--muted);border-radius:20px;font-family:var(--fu);font-size:11px;line-height:1;
  font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.07em;
  white-space:nowrap;text-transform:uppercase}
.nbtn:hover{background:rgba(139,92,246,.15);color:var(--purple-bright)}
.nbtn.on{background:rgba(139,92,246,.22);color:var(--purple-bright);
  border-color:rgba(139,92,246,.4)}

/* GAME AREA */
.game{flex:1;display:flex;flex-direction:column;align-items:center;
  padding:8px 0 max(2px, env(safe-area-inset-bottom));gap:0;overflow:hidden;overflow-x:visible;touch-action:pan-y}
.sbar{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted);font-weight:600;
  width:100%;padding:2px 14px 8px;line-height:1.15}
.sdate{color:var(--gold);font-weight:700;font-size:17px;font-family:var(--fc);letter-spacing:.05em}
.dchip{padding:4px 12px;background:rgba(139,92,246,.2);color:var(--purple-bright);
  border:1px solid rgba(139,92,246,.35);
  border-radius:14px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.play-fit-outer{flex:1;min-height:0;width:100%;display:flex;justify-content:center;align-items:flex-start;overflow:hidden;padding:0 6px 2px}
.play-fit-inner{width:100%;max-width:100%;display:flex;flex-direction:column;align-items:center;transform-origin:top center;will-change:transform}

/* BOARD */
.board{display:flex;flex-direction:column;align-items:center;gap:0;position:relative;overflow:visible}

/* CLOUD WRAPPERS */
.cloud-wrap{display:flex;align-items:center;justify-content:center;position:relative}
.cloud-h{width:100%;height:88px}
.cloud-v{width:80px;height:100%}

/* FLOAT ANIMATIONS */
@keyframes float-top{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes float-right{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
@keyframes float-bot{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@keyframes float-left{0%,100%{transform:translateX(0)}50%{transform:translateX(-4px)}}
.float-top{animation:float-top 4.8s ease-in-out infinite}
.float-right{animation:float-right 5.6s ease-in-out infinite;animation-delay:.4s}
.float-bot{animation:float-bot 5.2s ease-in-out infinite;animation-delay:.9s}
.float-left{animation:float-left 5s ease-in-out infinite;animation-delay:1.2s}

/* CTAB (admin editable version only — game uses SVG clouds) */
.ctab{
  display:flex;align-items:center;justify-content:center;
  font-family:var(--fc);font-weight:700;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gold);
  background:radial-gradient(ellipse at 50% 38%, rgba(72,35,175,.92) 0%, rgba(35,14,88,.97) 100%);
  border:1.5px solid rgba(150,110,255,.48);
  text-shadow:0 0 14px rgba(255,215,0,.5);
  position:relative;z-index:4;
  box-shadow:0 0 20px rgba(90,50,210,.65),inset 0 1px 5px rgba(255,255,255,.07);
}
.ctab.top,.ctab.bot{
  width:calc(2*var(--cs) + var(--cg) + 28px);height:42px;
  border-radius:50px;z-index:4}
.ctab.top{margin-bottom:12px}
.ctab.bot{margin-top:12px}
.ctab.lft,.ctab.rgt{
  width:42px;height:calc(2*var(--cs) + var(--cg) + 28px);
  writing-mode:vertical-rl;letter-spacing:.12em;
  border-radius:50px;z-index:4}
.ctab.lft{transform:rotate(180deg);margin-right:14px}
.ctab.rgt{margin-left:14px}

/* Editable clue tabs */
.ctab.editable{cursor:pointer;transition:filter .15s}
.ctab.editable:hover{filter:brightness(1.15)}
.ctab.editing{cursor:text;animation:none !important;
  border:2px solid rgba(255,215,0,.7);
  font-family:var(--fc);font-weight:700;font-size:11px;letter-spacing:.14em;
  text-align:center;text-transform:uppercase;color:var(--gold);outline:none}
.ctab.editing.top,.ctab.editing.bot{
  width:calc(2*var(--cs) + var(--cg) + 28px);height:42px;border-radius:50px;padding:0 12px}
.ctab.editing.lft,.ctab.editing.rgt{
  width:42px;height:calc(2*var(--cs) + var(--cg) + 28px);
  writing-mode:vertical-rl;border-radius:50px;padding:8px 0}
.ctab.editing.lft{transform:rotate(180deg)}
.ctab-ph{opacity:.45;font-style:normal;letter-spacing:.06em;font-size:10px;font-weight:600}

/* CLOVER SURFACE — transparent so ball shows through */
.csurface{
  display:grid;grid-template-columns:var(--cs) var(--cs);
  grid-template-rows:var(--cs) var(--cs);gap:var(--cg);
  background:transparent;
  padding:12px;border-radius:38px;
  z-index:2;position:relative;}

/* CARD SLOT */
.cslot{position:relative;width:var(--cs);height:var(--cs);border-radius:14px;perspective:600px}
.cslot.over::after,.cslot.source::after,.eslot.source::after{content:'';position:absolute;inset:-3px;
  border:2px dashed rgba(167,139,250,.8);border-radius:17px;pointer-events:none;z-index:2}
.cslot.empty{border:1.5px dashed rgba(167,139,250,.3);border-radius:14px}

/* CARD TILE — white opaque like reference */
.ctile{position:absolute;inset:0;
  background:#f5f0ff;
  border:1px solid rgba(180,160,220,.5);
  border-radius:14px;cursor:pointer;touch-action:none;
  box-shadow:0 2px 14px rgba(0,0,0,.35);
  transition:box-shadow .15s,transform .1s,border-color .15s}
.ctile:not(.locked):not(.noclick):hover{
  box-shadow:0 0 22px rgba(139,92,246,.5),0 4px 18px rgba(0,0,0,.3);
  transform:scale(1.025);border-color:rgba(139,92,246,.7)}
.ctile.locked{
  background:#edf9f1;
  border-color:rgba(34,197,94,.62);
  box-shadow:0 0 18px rgba(34,197,94,.24),inset 0 0 10px rgba(34,197,94,.06);cursor:default}
.ctile.wrong-red{
  background:#ffe8ea;
  border-color:rgba(255,68,85,.45)}
.ctile.dim{opacity:0;pointer-events:none;transform:none}
.ctile.selected{border:2px solid var(--gold);
  box-shadow:0 0 18px rgba(255,215,0,.3),0 2px 14px rgba(0,0,0,.3)}

/* Edge words — dark on white cards */
.ew{position:absolute;font-family:var(--fu);font-size:9px;font-weight:700;
  letter-spacing:.05em;color:#2d1060;pointer-events:none;
  text-align:center;white-space:nowrap;overflow:hidden;text-transform:uppercase}
.ew.et{top:9px;left:50%;transform:translateX(-50%);max-width:calc(var(--cs) - 24px)}
.ew.eb{bottom:9px;left:50%;transform:translateX(-50%);max-width:calc(var(--cs) - 24px)}
.ew.er{right:7px;top:50%;writing-mode:vertical-rl;transform:translateY(-50%);max-height:calc(var(--cs) - 22px)}
.ew.el{left:7px;top:50%;writing-mode:vertical-rl;transform:translateY(-50%) rotate(180deg);max-height:calc(var(--cs) - 22px)}
.ctile.admin-mode .ew{
  font-size:8px;
  letter-spacing:.02em;
}
.admin-card-hit{position:absolute;inset:0;border:none;background:transparent;cursor:pointer;z-index:1}
.admin-word-wrap{position:absolute;z-index:3}
.admin-word-wrap.top{top:8px;left:50%;transform:translateX(-50%)}
.admin-word-wrap.bottom{bottom:8px;left:50%;transform:translateX(-50%)}
.admin-word-wrap.left{left:7px;top:50%;transform:translateY(-50%)}
.admin-word-wrap.right{right:7px;top:50%;transform:translateY(-50%)}
.admin-word-btn,.admin-word-input{
  border:none;background:transparent;color:#2d1060;font-family:var(--fu);font-weight:800;
  text-transform:uppercase;text-align:center;outline:none
}
.admin-word-btn{
  cursor:text;padding:2px 4px;line-height:1.05;border-radius:7px;
  font-size:10px;letter-spacing:.03em;max-width:calc(var(--cs) - 22px);
}
.admin-word-btn:hover{background:rgba(139,92,246,.08)}
.admin-word-btn.left,.admin-word-btn.right{
  font-size:9px;max-width:none;width:16px;white-space:nowrap
}
.admin-word-btn.left{writing-mode:vertical-rl;transform:rotate(180deg)}
.admin-word-btn.right{writing-mode:vertical-rl}
.admin-word-input{
  background:#fff;border:1px solid rgba(139,92,246,.45);box-shadow:0 6px 18px rgba(0,0,0,.18);
  border-radius:9px;padding:5px 8px;font-size:10px;min-width:86px
}
.admin-word-input.left,.admin-word-input.right{
  min-width:92px
}
.admin-word-input.left{transform:translateX(-74px)}
.admin-word-input.right{transform:translateX(74px)}
.admin-word-input.top{transform:translateY(-28px)}
.admin-word-input.bottom{transform:translateY(28px)}
.admin-rotate-btn{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:28px;height:28px;border:none;border-radius:999px;
  background:rgba(124,77,255,.94);color:#fff;display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:700;cursor:pointer;z-index:4;
  box-shadow:0 6px 16px rgba(61,24,131,.35)
}
.admin-rotate-btn:hover{background:#8b5cf6}

/* Diamond center mark */
.cmark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(45deg);
  width:10px;height:10px;background:rgba(139,92,246,.6);border-radius:2px;pointer-events:none;
  box-shadow:0 0 6px rgba(139,92,246,.4);transition:background .2s}
.locked .ew{color:#166534}
.wrong-red .ew{color:#991b1b}
.locked .cmark{background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.55)}
.wrong-red .cmark{background:#ff4455;box-shadow:0 0 8px rgba(255,68,85,.5)}
.lpip{position:absolute;top:6px;right:6px;width:14px;height:14px;
  background:var(--purple);border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:8px;color:#FFF;font-weight:700;pointer-events:none;
  box-shadow:0 0 9px rgba(124,77,255,.65)}

/* Animations */
@keyframes wrongShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.ctile.shaking{animation:wrongShake .35s ease}
@keyframes revealShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
.ctile.reveal-grey{background:rgba(28,18,55,.82);border-color:rgba(80,55,120,.45);transition:none}
.ctile.reveal-grey .ew{color:rgba(110,90,150,.7);transition:none}
.ctile.reveal-grey .cmark{background:rgba(75,55,115,.5)}
.ctile.reveal-shaking{animation:revealShake .45s ease}

/* 3D card flip */
@keyframes cardFlipDown{0%{transform:rotateY(0deg) scale(1)}100%{transform:rotateY(90deg) scale(.9)}}
@keyframes cardFlipUp{0%{transform:rotateY(-90deg) scale(.9)}100%{transform:rotateY(0deg) scale(1)}}
.ctile.flip-down{animation:cardFlipDown .18s ease-in forwards;transform-origin:center}
.ctile.flip-up{animation:cardFlipUp .22s ease-out forwards;transform-origin:center}
@keyframes flipIn{0%{transform:scaleX(0);opacity:.5}100%{transform:scaleX(1);opacity:1}}
.ctile.flipping{animation:flipIn .28s cubic-bezier(.34,1.56,.64,1)}
@keyframes shuffleSpin{0%{transform:rotate(calc(var(--sd,1)*0deg))}
  45%{transform:rotate(calc(var(--sd,1)*180deg)) scale(.88)}
  100%{transform:rotate(calc(var(--sd,1)*360deg))}}
.ctile.spinning{animation:shuffleSpin .44s ease}
@keyframes swapPop{0%{transform:scale(1)}45%{transform:scale(1.12)}100%{transform:scale(1)}}
.ctile.swap-pop{animation:swapPop .18s ease-out}
@keyframes rotateMoveRight{0%{transform:translate(0,0) scale(1)}100%{transform:translateX(var(--step)) scale(.98)}}
@keyframes rotateMoveDown{0%{transform:translate(0,0) scale(1)}100%{transform:translateY(var(--step)) scale(.98)}}
@keyframes rotateMoveLeft{0%{transform:translate(0,0) scale(1)}100%{transform:translateX(calc(-1 * var(--step))) scale(.98)}}
@keyframes rotateMoveUp{0%{transform:translate(0,0) scale(1)}100%{transform:translateY(calc(-1 * var(--step))) scale(.98)}}
.ctile.rotate-move-right{animation:rotateMoveRight .24s ease-in-out forwards}
.ctile.rotate-move-down{animation:rotateMoveDown .24s ease-in-out forwards}
.ctile.rotate-move-left{animation:rotateMoveLeft .24s ease-in-out forwards}
.ctile.rotate-move-up{animation:rotateMoveUp .24s ease-in-out forwards}
.ctile-inner{position:absolute;inset:0;border-radius:inherit}
@keyframes rotateSpinInner{0%{transform:rotate(0deg)}100%{transform:rotate(90deg)}}
.ctile-inner.rotate-spin{animation:rotateSpinInner .24s ease-in-out forwards}
.cloud-label{
  transition:opacity .14s ease,filter .14s ease;
}
.cloud-label.clue-rotating{
  opacity:.68;
  filter:brightness(1.14);
}

/* EXTRA CARDS */
.extra{display:flex;flex-direction:column;align-items:center;gap:0;margin-top:0;position:relative;padding-top:22px}
.elabel{position:absolute;top:-10px;left:50%;transform:translateX(-50%);
  font-size:18px;font-weight:900;letter-spacing:.11em;
  text-transform:uppercase;color:#b7ff8a;font-family:var(--fc);
  text-shadow:0 2px 3px rgba(18, 48, 16, 0.95),0 0 10px rgba(80, 190, 90, 0.28);
  z-index:3;white-space:nowrap}
.eslots{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.eslot{position:relative;width:var(--cs);height:var(--cs)}
.extra-spacer{height:156px;width:100%}

/* CONTROLS */
.ctrls{display:flex;gap:7px;align-items:center;flex-shrink:0;margin-top:8px}
.cbtn{display:flex;align-items:center;gap:6px;padding:8px 15px;
  background:rgba(25,14,62,.82);border:1px solid rgba(100,55,200,.38);border-radius:50px;
  font-family:var(--fu);font-size:11px;font-weight:700;color:var(--muted);
  cursor:pointer;transition:all .15s;letter-spacing:.05em;text-transform:uppercase}
.cbtn:hover{background:rgba(75,38,155,.42);border-color:rgba(139,92,246,.6);
  color:var(--purple-bright);transform:translateY(-1px);
  box-shadow:0 4px 18px rgba(75,38,155,.32)}
.cbtn:active{transform:translateY(0)}
.cbtn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}

/* Feedback */
.fbk{font-size:11px;font-weight:600;color:var(--muted);min-height:10px;
  text-align:center;padding:0 12px;letter-spacing:.03em;transition:opacity .5s ease;
  font-family:var(--fc)}
.fbk.fading{opacity:0}
.fbk.ok{color:var(--purple-bright)}
.fbk.err{color:#ff7080}

/* Submit button */
.sbtn-wrap{width:100%;padding:0 4px;flex-shrink:0;margin-top:0}
.sbtn{width:100%;padding:12px;
  background:linear-gradient(135deg,#5518b0 0%,#7c3aed 50%,#6820d4 100%);
  color:#FFF;border:none;border-radius:14px;
  font-family:var(--fc);font-size:13px;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .15s;
  box-shadow:0 4px 26px rgba(108,38,210,.55),0 0 44px rgba(108,38,210,.22);
  touch-action:auto;-webkit-tap-highlight-color:transparent}
.sbtn:hover{background:linear-gradient(135deg,#6820d4 0%,#8b5cf6 50%,#7c3aed 100%);
  box-shadow:0 6px 32px rgba(108,38,210,.7),0 0 55px rgba(108,38,210,.3)}
.sbtn:active{transform:scale(.99)}
.sbtn:disabled{opacity:.38;transform:none;cursor:default;box-shadow:none}
.sbtn.blocked{background:linear-gradient(135deg,#7f1d1d 0%,#991b1b 100%);
  box-shadow:0 4px 16px rgba(153,27,27,.42);opacity:1;cursor:pointer}
.sbtn.solved{background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%)}

/* DRAG GHOST */
.ghost{position:fixed;pointer-events:none;z-index:9999;width:var(--cs);height:var(--cs);
  background:#f5f0ff;
  border:1px solid rgba(180,160,220,.65);border-radius:14px;
  box-shadow:0 14px 40px rgba(0,0,0,.28),0 0 16px rgba(139,92,246,.18);opacity:.96}

/* SOLVED OVERLAY */
.sovr{position:fixed;inset:0;z-index:100;
  background:rgba(5,2,18,.97);
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:12px;animation:fadeIn .32s ease;
  backdrop-filter:blur(12px)}
@keyframes fadeIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.sovr-emoji{font-size:52px}
.sovr-title{font-family:var(--fc);font-size:26px;font-weight:700;color:var(--gold);
  letter-spacing:.08em;text-shadow:0 0 32px rgba(255,215,0,.42)}
.sovr-sub{font-size:13px;color:var(--muted);font-weight:500}
.sovr-btn{margin-top:8px;padding:11px 28px;
  background:rgba(139,92,246,.15);
  border:1.5px solid rgba(139,92,246,.42);color:var(--purple-bright);border-radius:50px;
  font-family:var(--fc);font-size:11px;font-weight:700;cursor:pointer;
  transition:all .15s;letter-spacing:.08em;text-transform:uppercase}
.sovr-btn:hover{background:rgba(139,92,246,.3);box-shadow:0 0 22px rgba(139,92,246,.32)}

/* Tutorial */
.tut-ovr{position:fixed;inset:0;z-index:220;background:rgba(5,2,18,.78);
  display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(14px)}
.tut-card{width:100%;max-width:360px;background:linear-gradient(180deg, rgba(27,14,61,.97), rgba(16,8,38,.98));
  border:1px solid rgba(139,92,246,.28);border-radius:24px;padding:20px 18px 18px;
  display:flex;flex-direction:column;height:min(760px, calc(100dvh - 36px));max-height:calc(100dvh - 36px);
  box-shadow:0 24px 60px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08)}
.tut-card .game{width:100%;height:100%;min-height:0;align-items:stretch}
.tut-card .play-fit-outer{flex:1;min-height:0}
.tut-card .play-fit-inner.tutorial-layout{height:100%;min-height:100%}
.tutorial-copy-wrap{width:100%;height:132px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.tutorial-controls-wrap{margin-top:auto;width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 10px}
.tut-step{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(228,211,255,.72);margin-bottom:8px}
.tut-title{font-family:var(--fc);font-size:24px;font-weight:700;letter-spacing:.03em;color:#f5e9ff;margin-bottom:10px}
.tut-body{font-size:14px;line-height:1.55;color:rgba(236,227,255,.88);margin-bottom:14px}
.tut-note{font-size:12px;line-height:1.5;color:rgba(231,217,255,.72);margin-bottom:12px}
.tut-board-wrap{display:flex;justify-content:center;margin:6px 0 14px}
.tut-board{--cs:90px;--cg:8px;transform:scale(.96);transform-origin:top center}
.tut-clue{display:flex;align-items:center;justify-content:center;font-family:var(--fc);font-size:11px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:#f5e9ff;border-radius:999px;
  background:rgba(72,35,175,.88);border:1px solid rgba(150,110,255,.42);box-shadow:0 0 18px rgba(90,50,210,.38)}
.tut-clue.top,.tut-clue.bottom{width:calc(2*var(--cs) + var(--cg) + 18px);height:34px}
.tut-clue.left,.tut-clue.right{width:34px;height:calc(2*var(--cs) + var(--cg) + 18px);writing-mode:vertical-rl}
.tut-clue.left{transform:rotate(180deg)}
.tut-board-row{display:flex;align-items:center;gap:10px}
.tut-board-col{display:flex;flex-direction:column;align-items:center;gap:10px}
.tut-slot{position:relative;width:var(--cs);height:var(--cs);border-radius:14px;transition:opacity .18s ease,filter .18s ease,transform .18s ease}
.tut-slot.dim{opacity:.62;filter:saturate(.86)}
.tut-slot.expected::after{content:"";position:absolute;inset:-5px;border:2px dashed rgba(255,215,0,.78);border-radius:18px;pointer-events:none}
.tut-clue-shell{width:100%;height:100%;display:flex;align-items:center;justify-content:center;transition:opacity .18s ease,filter .18s ease}
.tut-clue-shell.dim{opacity:1;filter:none}
.tut-clue-shell.on{filter:drop-shadow(0 0 16px rgba(168,116,255,.38))}
.tut-card-selected{box-shadow:0 0 0 2px rgba(255,215,0,.8),0 0 18px rgba(255,215,0,.32)}
.tut-msg{font-size:17px;line-height:1.45;color:rgba(236,227,255,.96);text-align:center;margin-bottom:12px;min-height:56px;font-weight:500}
.tut-msg strong{font-weight:800;color:#fff}
.tut-controls{display:flex;gap:8px;justify-content:center;margin-bottom:14px}
.tut-nav{z-index:18;width:100%;display:flex;flex-direction:column;align-items:center;gap:10px}
.tut-next-row{width:100%;display:flex;justify-content:center}
.tut-footer-bar{width:100%;display:flex;align-items:center;justify-content:space-between}
.tut-footer-bar.done{justify-content:center}
.tut-dots{display:flex;gap:10px;justify-content:flex-start}
.tut-dots.done{display:none}
.tut-dot{width:12px;height:12px;border-radius:50%;background:rgba(223,200,255,.18)}
.tut-dot.on{background:var(--purple-bright);box-shadow:0 0 10px rgba(196,181,253,.5)}
.tut-actions{display:flex;justify-content:flex-end}
.tut-actions.done{justify-content:center}
.tut-actions .abtn.sm{font-size:16px;padding:12px 20px;border-radius:16px}
.tut-next-row .abtn{
  font-size:34px;
  font-family:var(--fu);
  font-weight:800;
  line-height:1;
  letter-spacing:.05em;
  height:64px;
  min-width:150px;
  padding:0 28px;
  border-radius:999px;
  box-shadow:0 10px 24px rgba(124,77,255,.28)
}
.tut-next-row .sbtn-wrap{width:auto;padding:0;margin:0}
.tut-next-row .sbtn{width:auto;min-width:170px;padding:18px 32px;border-radius:999px}
.tut-open{width:100%;max-width:280px;margin-top:10px;padding:11px 14px;border-radius:12px;
  border:1px solid rgba(139,92,246,.42);background:rgba(24,12,58,.92);color:var(--purple-bright);
  font-family:var(--fu);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.tut-open:hover{border-color:rgba(139,92,246,.65);background:rgba(35,18,85,.94)}

/* Lives */
.lives{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:600}
.life{display:flex;align-items:center;justify-content:center;width:24px;height:24px;line-height:1;transition:all .2s}
.life-img{display:block;width:100%;height:100%;object-fit:contain}
.life.lost{opacity:.18;filter:grayscale(1)}

@media (max-width:390px){
  :root{--cs:102px;--cg:7px}
  .sbar{gap:8px;padding:2px 12px 8px}
  .sdate{font-size:16px}
  .dchip{padding:4px 10px;font-size:11px}
  .lives{gap:6px}
  .life{width:22px;height:22px}
  .elabel{font-size:16px}
}

@media (max-width:375px), (max-height:740px){
  :root{--cs:96px;--cg:7px}
  .sbar{gap:7px;padding:1px 10px 7px;font-size:13px}
  .sdate{font-size:15px}
  .dchip{padding:3px 9px;font-size:10px}
  .lives{gap:5px}
  .life{width:21px;height:21px}
  .extra{padding-top:18px}
  .elabel{font-size:15px}
  .ctrls{margin-top:6px;gap:6px}
  .cbtn{padding:7px 13px;font-size:10px}
  .sbtn{padding:11px;font-size:12px}
}

@media (max-width:320px), (max-height:680px){
  :root{--cs:88px;--cg:6px}
  .sbar{gap:6px;padding:1px 9px 6px;font-size:12px}
  .sdate{font-size:14px}
  .dchip{padding:3px 8px;font-size:9px}
  .lives{gap:4px}
  .life{width:19px;height:19px}
  .extra{padding-top:16px}
  .elabel{font-size:14px}
  .cbtn{padding:6px 11px;font-size:9px}
  .sbtn{padding:10px;font-size:11px}
}

/* Stats overlay */
.stats-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;width:100%;padding:0 4px;margin:6px 0}
.stat-box{display:flex;flex-direction:column;align-items:center;gap:2px}
.stat-val{font-size:28px;font-weight:700;color:var(--gold);line-height:1;
  font-family:var(--fc);text-shadow:0 0 22px rgba(255,215,0,.42)}
.stat-lbl{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center}
.dist{width:100%;padding:0 4px;margin:4px 0}
.dist-row{display:flex;align-items:center;gap:7px;margin-bottom:5px}
.dist-key{font-size:11px;font-weight:700;color:var(--muted);width:14px;text-align:right;flex-shrink:0;font-family:var(--fc)}
.dist-bar-wrap{flex:1;background:rgba(255,255,255,.05);border-radius:4px;height:20px;overflow:hidden}
.dist-bar{height:100%;border-radius:4px;display:flex;align-items:center;
  padding:0 7px;font-size:10px;font-weight:700;color:#FFF;
  transition:width .5s ease;min-width:24px;white-space:nowrap}
.dist-bar.current{background:rgba(139,92,246,.72)}
.dist-bar.win{background:rgba(100,55,200,.44)}
.dist-bar.loss{background:rgba(255,50,70,.38)}
.share-grid{display:flex;flex-direction:column;align-items:center;gap:3px;margin:4px 0}
.share-row{display:flex;gap:3px;font-size:22px;line-height:1}
.share-copied{font-size:11px;color:var(--muted);font-weight:500;height:14px}
.sovr-divider{width:100%;height:1px;background:rgba(139,92,246,.2);margin:4px 0}
.particles{position:fixed;inset:0;pointer-events:none;z-index:99;overflow:hidden}
.particle{position:absolute;top:-120px;font-size:22px;animation:fall linear forwards;line-height:1}
@keyframes fall{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}70%{opacity:1}100%{transform:translateY(110vh) rotate(720deg) scale(.7);opacity:0}}

/* ══ ADMIN ══ */
.awrap{flex:1;display:flex;flex-direction:column;overflow:hidden}
.atabs{display:flex;align-items:center;gap:6px;padding:5px 6px 5px 8px;background:rgba(8,5,20,.95);border-bottom:1px solid rgba(100,55,200,.28);flex-shrink:0;min-width:0}
.atab{flex:1;padding:12px 8px;font-family:var(--fu);font-size:10px;font-weight:700;
  border:none;background:transparent;color:var(--muted);cursor:pointer;
  border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .15s;
  text-transform:uppercase;letter-spacing:.07em}
.atab:hover:not(.on){color:var(--purple-bright)}
.atab.on{color:var(--purple-bright);border-bottom-color:var(--purple)}
.admin-topbar-back{flex:none;max-width:none;padding:6px 4px;font-size:10px;letter-spacing:.03em}
.admin-topbar-title{flex:1;min-width:0;padding:0 2px;font-size:12px;font-weight:600;color:var(--clue-tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-topbar-publish{flex:0 0 auto;min-width:auto;padding:5px 8px;font-size:9px;letter-spacing:.02em;white-space:nowrap}
.acnt{flex:1;overflow-y:auto;padding:10px;touch-action:pan-y}
.acnt input,.acnt select,.acnt textarea{-webkit-user-select:text;user-select:text;touch-action:auto}
.aboard-wrap{display:flex;flex-direction:column;align-items:center;
  background:rgba(15,8,40,.9);border-radius:18px;padding:9px;gap:8px;
  border:1px solid rgba(100,55,200,.28)}
.admin-sec{width:100%;background:rgba(21,10,48,.5);border:1px solid rgba(139,92,246,.18);
  border-radius:14px;padding:8px}
.admin-sec-title{font-family:var(--fc);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--purple-bright);margin-bottom:5px}
.admin-board-stage{
  --cs:112px;--cg:8px;
  width:100%;display:flex;flex-direction:column;align-items:center;gap:0;
  padding:8px 4px 2px;
  overflow:hidden;
}
.admin-board-note{color:rgba(255,255,255,.68);font-size:12px;line-height:1.5;margin-top:12px;text-align:center}
.admin-extra-grid{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;padding:4px 0 2px}
.admin-checks{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.admin-check{padding:5px 10px;border-radius:999px;border:1px solid rgba(139,92,246,.4);
  font-size:9px;font-weight:700;letter-spacing:.02em}
.admin-check.ok{background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.45);color:#bbf7d0}
.admin-check.warn{background:rgba(245,158,11,.16);border-color:rgba(245,158,11,.45);color:#fde68a}
.admin-check.err{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.45);color:#fecaca}
.ameta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:center;width:100%}
.ameta-title{min-width:0}
.ameta-calendar{width:100%}
.fi-sm{padding:8px 10px;border:1px solid rgba(100,55,200,.38);border-radius:10px;
  background:rgba(25,14,62,.85);font-family:var(--fu);font-size:13px;font-weight:600;
  color:var(--text);outline:none;width:100%;transition:border-color .15s;
  -webkit-user-select:text;user-select:text;touch-action:auto}
.fi-sm:focus{border-color:rgba(139,92,246,.72)}
.fi-sm::placeholder{color:var(--muted)}
.asel{padding:7px 10px;border:1px solid rgba(100,55,200,.38);border-radius:10px;
  background:rgba(25,14,62,.85);font-family:var(--fu);font-size:12px;font-weight:500;
  color:var(--text);outline:none;cursor:pointer;appearance:auto;
  -webkit-user-select:text;user-select:text;touch-action:auto}
.asel option{background:#130a2e;color:var(--text)}
.add-card-btn{width:var(--cs);height:var(--cs);border:1.5px dashed rgba(139,92,246,.32);
  border-radius:14px;background:rgba(139,92,246,.06);color:rgba(196,181,253,.55);
  font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;flex-shrink:0}
.add-card-btn:hover{border-color:rgba(139,92,246,.65);color:var(--purple-bright);
  background:rgba(139,92,246,.14)}
.ced{background:rgba(15,9,38,.95);border-radius:14px;padding:16px;width:100%;
  border:1px solid rgba(100,55,200,.3);margin-top:6px;
  box-shadow:0 4px 24px rgba(0,0,0,.45)}
.ced-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ced-title{font-family:var(--fc);font-size:13px;font-weight:700;color:var(--purple-bright)}
.ced-close{background:none;border:none;color:var(--muted);cursor:pointer;
  font-size:18px;padding:2px 6px;border-radius:6px;transition:color .12s;line-height:1}
.ced-close:hover{color:var(--text)}
.ced-cross{display:grid;
  grid-template-areas:'. top .''left preview right''. bot .';
  grid-template-columns:100px 92px 100px;
  grid-template-rows:auto auto auto;gap:8px;align-items:center;
  justify-items:center;margin:0 auto 14px;width:fit-content}
.ced-cross>[data-a=top]{grid-area:top}
.ced-cross>[data-a=left]{grid-area:left}
.ced-cross>[data-a=preview]{grid-area:preview}
.ced-cross>[data-a=right]{grid-area:right}
.ced-cross>[data-a=bot]{grid-area:bot}
.ced-fi{border:1px solid rgba(100,55,200,.38);border-radius:8px;background:rgba(25,14,62,.85);
  font-family:var(--fu);font-size:13px;font-weight:700;letter-spacing:.02em;
  text-align:center;text-transform:uppercase;color:var(--text);padding:9px 10px;
  width:100%;outline:none;-webkit-user-select:text;user-select:text;touch-action:auto}
.ced-fi:focus{border-color:rgba(139,92,246,.72)}
.ced-fi::placeholder{text-transform:none;font-weight:400;font-size:10px;color:var(--muted)}
.ced-pv{position:relative;width:92px;height:92px;--cs:92px}
.ced-quick{display:flex;gap:8px;align-items:center;margin:-2px 0 10px}
.ced-quick .ced-fi{flex:1}
.ced-tip{font-size:11px;color:rgba(255,255,255,.52);line-height:1.35;margin:-2px 0 12px}
.ced-actions{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
.abtn{padding:8px 14px;border-radius:50px;font-family:var(--fu);font-size:11px;
  font-weight:700;cursor:pointer;transition:all .12s;letter-spacing:.04em;text-transform:uppercase}
.abtn.p{background:linear-gradient(135deg,#5518b0,#7c3aed);color:#FFF;border:none;
  box-shadow:0 3px 14px rgba(108,38,210,.45)}
.abtn.p:hover{background:linear-gradient(135deg,#6820d4,#8b5cf6)}
.abtn.s{background:rgba(25,14,62,.85);color:var(--muted);border:1px solid rgba(100,55,200,.38)}
.abtn.s:hover{border-color:rgba(139,92,246,.6);color:var(--purple-bright)}
.abtn.d{background:rgba(45,12,18,.9);color:#ff7080;border:1px solid rgba(255,68,85,.35)}
.abtn.sm{padding:5px 11px;font-size:10px}
.ced-wb-label{font-size:10px;font-weight:700;letter-spacing:.09em;
  text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.wb-chips{display:flex;flex-wrap:wrap;gap:5px}
.wb-chip{padding:5px 11px;background:rgba(25,14,62,.85);border:1px solid rgba(100,55,200,.38);
  border-radius:50px;font-family:var(--fu);font-size:11px;font-weight:700;
  color:var(--text);cursor:pointer;transition:all .12s;text-transform:uppercase;letter-spacing:.03em}
.wb-chip:hover{border-color:rgba(139,92,246,.65);color:var(--purple-bright)}
.sh{font-family:var(--fc);font-size:16px;font-weight:700;color:var(--gold);
  margin-bottom:12px;letter-spacing:.05em;text-shadow:0 0 20px rgba(255,215,0,.3)}
.plist{display:flex;flex-direction:column;gap:8px}
.pcard{background:rgba(18,10,45,.9);border:1px solid rgba(100,55,200,.28);border-radius:14px;
  padding:14px 16px;cursor:pointer;transition:all .15s}
.pcard:hover{box-shadow:0 4px 20px rgba(0,0,0,.45);border-color:rgba(139,92,246,.45)}
.ptitle{font-family:var(--fc);font-size:14px;font-weight:600;color:var(--text);
  margin-bottom:5px;letter-spacing:.03em}
.pmeta{display:flex;gap:7px;align-items:center;font-size:11px;color:var(--muted);flex-wrap:wrap}
.spill{padding:3px 8px;border-radius:50px;font-size:9px;font-weight:700;
  text-transform:uppercase;letter-spacing:.07em}
.spill.unused{background:rgba(80,50,180,.25);color:var(--purple-bright)}
.spill.published{background:rgba(124,77,255,.2);color:var(--purple-bright)}
.spill.draft{background:rgba(255,255,255,.07);color:var(--muted)}
.spill.scheduled{background:rgba(255,215,0,.15);color:var(--gold)}
.date-conflict{background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.3);border-radius:10px;
  padding:5px 8px;margin-top:5px;font-size:10px;color:rgba(255,215,0,.92);line-height:1.2;text-align:center}
.date-conflict strong{font-weight:700;display:block;margin-bottom:0}
.date-conflict-btns{display:flex;gap:7px;margin-top:8px}
.date-used{border-color:rgba(255,215,0,.5) !important}
.admin-cal{margin-top:6px;padding:7px;border:1px solid rgba(139,92,246,.18);border-radius:12px;
  background:rgba(26,14,58,.52)}
.admin-cal-toggle{
  width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;
  border:none;border-radius:12px;background:rgba(48,24,102,.55);color:#f6edff;
  padding:7px 9px;cursor:pointer;text-align:left
}
.admin-cal-toggle-main{display:flex;flex-direction:column;gap:2px}
.admin-cal-toggle-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(231,217,255,.72)}
.admin-cal-toggle-date{font-family:var(--fc);font-size:14px;font-weight:700;color:#fff0ff}
.admin-cal-toggle-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.admin-cal-toggle-arrow{font-size:14px;color:rgba(231,217,255,.86)}
.admin-cal-mini-chip{padding:3px 7px;border-radius:999px;border:1px solid rgba(139,92,246,.24);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.admin-cal-mini-chip.published{background:rgba(22,163,74,.2);color:#bbf7d0;border-color:rgba(34,197,94,.42)}
.admin-cal-mini-chip.scheduled{background:rgba(202,138,4,.18);color:#fde68a;border-color:rgba(250,204,21,.4)}
.admin-cal-mini-chip.open{background:rgba(255,255,255,.04);color:rgba(231,217,255,.74);border-color:rgba(223,200,255,.14)}
.admin-cal-panel{margin-top:10px}
.admin-cal-head{display:grid;grid-template-columns:34px 1fr 34px;gap:8px;align-items:center;margin-bottom:10px}
.admin-cal-nav{width:34px;height:34px;border-radius:999px;border:1px solid rgba(139,92,246,.3);
  background:rgba(59,31,120,.6);color:#f6edff;cursor:pointer;font-size:20px;line-height:1;
  display:flex;align-items:center;justify-content:center}
.admin-cal-title{text-align:center;font-family:var(--fc);font-size:17px;font-weight:700;color:#f5e9ff;letter-spacing:.06em}
.admin-cal-weekdays,.admin-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.admin-cal-weekday{text-align:center;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(231,217,255,.72)}
.admin-cal-empty{aspect-ratio:1/1}
.admin-cal-day{appearance:none;-webkit-appearance:none;width:100%;aspect-ratio:1/1;border-radius:12px;
  border:1px solid rgba(223,200,255,.16);background:rgba(255,255,255,.04);color:#f6edff;
  font-family:var(--fc);font-size:16px;font-weight:700;cursor:pointer;position:relative;
  transition:transform .14s,border-color .14s,background .14s,box-shadow .14s}
.admin-cal-day:hover{transform:translateY(-1px);border-color:rgba(237,220,255,.34)}
.admin-cal-day.open{background:rgba(255,255,255,.02);border-color:rgba(223,200,255,.12)}
.admin-cal-day.published{background:linear-gradient(180deg, rgba(52,211,153,.28), rgba(22,163,74,.38));
  border-color:rgba(134,239,172,.52);box-shadow:0 8px 18px rgba(22,163,74,.16)}
.admin-cal-day.scheduled{background:linear-gradient(180deg, rgba(250,204,21,.22), rgba(202,138,4,.28));
  border-color:rgba(253,224,71,.48);box-shadow:0 8px 18px rgba(202,138,4,.15);color:#fff5cf}
.admin-cal-day.selected{border-color:rgba(255,236,188,.72);box-shadow:0 0 0 1px rgba(255,236,188,.24), inset 0 1px 0 rgba(255,255,255,.14)}
.admin-cal-day.today{box-shadow:inset 0 0 0 1px rgba(196,181,253,.28)}
.admin-cal-legend{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px}
.admin-cal-chip{padding:5px 10px;border-radius:999px;border:1px solid rgba(139,92,246,.24);font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.admin-cal-chip.published{background:rgba(22,163,74,.2);color:#bbf7d0;border-color:rgba(34,197,94,.42)}
.admin-cal-chip.scheduled{background:rgba(202,138,4,.18);color:#fde68a;border-color:rgba(250,204,21,.4)}
.admin-cal-chip.open{background:rgba(255,255,255,.04);color:rgba(231,217,255,.74);border-color:rgba(223,200,255,.14)}
.admin-cal-selected{margin-top:10px;text-align:center;font-size:12px;color:rgba(231,217,255,.8);font-weight:600}
.mhint{color:var(--muted);font-size:13px;text-align:center;padding:32px 20px;line-height:1.6;font-family:var(--fc)}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.fl{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.fi{padding:10px 12px;border:1px solid rgba(100,55,200,.38);border-radius:10px;
  background:rgba(18,10,45,.9);font-family:var(--fu);font-size:13px;font-weight:500;
  color:var(--text);outline:none;transition:border-color .15s;width:100%;
  -webkit-user-select:text;user-select:text;touch-action:auto}
.fi:focus{border-color:rgba(139,92,246,.72)}
.wchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.wchip{padding:6px 12px;background:rgba(18,10,45,.9);border:1px solid rgba(100,55,200,.35);
  border-radius:50px;font-family:var(--fu);font-size:12px;font-weight:700;
  color:var(--text);display:flex;align-items:center;gap:5px;
  text-transform:uppercase;letter-spacing:.03em}
.wdel{color:var(--muted);cursor:pointer;font-size:16px;line-height:1;transition:color .12s}
.wdel:hover{color:#ff7080}
.awrow{display:flex;gap:8px}
.awrow .fi{flex:1}
.brow2{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}

@media (max-width:390px){
  .atabs{gap:4px;padding:4px 4px 4px 6px}
  .admin-topbar-back{padding:8px 4px;font-size:10px}
  .admin-topbar-title{font-size:12px}
  .admin-topbar-publish{padding:4px 6px;font-size:8px}
  .ameta{grid-template-columns:1fr}
  .admin-board-stage{--cs:102px;--cg:8px;padding-inline:0}
  .ctab.top,.ctab.bot,.ctab.editing.top,.ctab.editing.bot{height:40px}
  .ctab.lft,.ctab.rgt,.ctab.editing.lft,.ctab.editing.rgt{width:38px}
  .ctab.lft{margin-right:10px}
  .ctab.rgt{margin-left:10px}
  .admin-extra-grid{gap:10px}
}

@media (max-width:360px){
  .acnt{padding:8px}
  .aboard-wrap{padding:8px}
  .admin-board-stage{--cs:96px;--cg:7px}
  .ctab.top,.ctab.bot,.ctab.editing.top,.ctab.editing.bot{
    width:calc(2*var(--cs) + var(--cg) + 22px);height:38px
  }
  .ctab.lft,.ctab.rgt,.ctab.editing.lft,.ctab.editing.rgt{
    width:34px;height:calc(2*var(--cs) + var(--cg) + 22px)
  }
  .ctab.lft{margin-right:8px}
  .ctab.rgt{margin-left:8px}
  .admin-extra-grid{gap:8px}
  .admin-cal-weekdays,.admin-cal-grid{gap:4px}
  .admin-cal-day{font-size:14px;border-radius:10px}
}

/* ══ LOBBY ══ */
.lobby{flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:24px 28px;gap:0;text-align:center}
.lobby-icon{font-size:52px;margin-bottom:16px;line-height:1}
.lobby-title{font-family:var(--fc);font-size:22px;font-weight:700;
  color:var(--gold);letter-spacing:.06em;margin-bottom:4px;
  text-shadow:0 0 24px rgba(255,215,0,.38)}
.lobby-date{font-size:21px;color:#fff;font-weight:700;line-height:1.2;margin-bottom:14px;
  text-shadow:0 2px 18px rgba(255,255,255,.14)}
.lobby-author{font-size:18px;color:rgba(255,255,255,.92);font-weight:600;margin-bottom:18px;line-height:1.2}
.lobby-diff-label{font-size:16px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:#fff;margin-bottom:12px;font-family:var(--fc);
  text-shadow:0 2px 18px rgba(255,255,255,.12)}
.lobby-diff-opts{display:flex;flex-direction:column;gap:7px;width:100%;max-width:280px;margin-bottom:28px}
.lobby-diff-opt{display:flex;align-items:center;gap:10px;padding:11px 14px;
  border-radius:12px;border:1px solid rgba(100,55,200,.35);background:rgba(18,10,45,.9);
  cursor:pointer;transition:all .15s;text-align:left;font-family:var(--fu);
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.lobby-diff-opt:hover{border-color:rgba(139,92,246,.6);background:rgba(35,18,85,.9)}
.lobby-diff-opt.active{border-color:rgba(139,92,246,.7);background:rgba(45,22,105,.9)}
.lobby-diff-icon{font-size:18px;width:24px;text-align:center;flex-shrink:0}
.lobby-diff-name{font-size:13px;font-weight:700;color:var(--text);flex:1}
.lobby-diff-desc{font-size:11px;color:var(--muted)}
.lobby-diff-check{width:18px;height:18px;border-radius:50%;border:1.5px solid rgba(100,55,200,.4);
  flex-shrink:0;display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:700;transition:all .15s}
.lobby-diff-opt.active .lobby-diff-check{background:var(--purple);border-color:var(--purple);color:#FFF;
  box-shadow:0 0 10px rgba(124,77,255,.5)}
.lobby-start{width:100%;max-width:280px;padding:15px;
  background:linear-gradient(135deg,#5518b0,#7c3aed,#6820d4);
  color:#FFF;border:none;border-radius:14px;font-family:var(--fc);font-size:13px;font-weight:700;
  letter-spacing:.14em;text-transform:uppercase;cursor:pointer;
  box-shadow:0 4px 26px rgba(108,38,210,.55);transition:all .15s;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.lobby-start:hover{background:linear-gradient(135deg,#6820d4,#8b5cf6,#7c3aed);
  box-shadow:0 6px 32px rgba(108,38,210,.7);transform:translateY(-1px)}
.lobby-start:active{transform:translateY(0)}

/* Settings sheet */
.settings-backdrop{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);
  animation:fadeInBg .2s ease}
@keyframes fadeInBg{from{opacity:0}to{opacity:1}}
.settings-sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);
  z-index:201;width:100%;max-width:500px;
  background:rgba(12,7,30,.98);
  border:1px solid rgba(100,55,200,.3);
  border-radius:20px 20px 0 0;padding:20px 20px 36px;
  animation:slideUp .25s cubic-bezier(.34,1.1,.64,1);
  backdrop-filter:blur(20px)}
@keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
.settings-handle{width:36px;height:4px;background:rgba(139,92,246,.35);border-radius:2px;margin:0 auto 18px}
.settings-title{font-family:var(--fc);font-size:16px;font-weight:700;
  color:var(--gold);margin-bottom:4px;letter-spacing:.06em}
.settings-sub{font-size:12px;color:var(--muted);font-weight:500;margin-bottom:18px}
.diff-opts{display:flex;flex-direction:column;gap:8px}
.diff-opt{display:flex;align-items:center;gap:12px;padding:13px 16px;
  border-radius:13px;border:1px solid rgba(100,55,200,.35);background:rgba(18,10,45,.9);
  cursor:pointer;transition:all .15s;text-align:left}
.diff-opt:hover{border-color:rgba(139,92,246,.6);background:rgba(35,18,85,.9)}
.diff-opt.active{border-color:rgba(139,92,246,.7);background:rgba(45,22,105,.9)}
.diff-opt-icon{font-size:20px;flex-shrink:0;width:28px;text-align:center}
.diff-opt-body{flex:1}
.diff-opt-name{font-size:14px;font-weight:700;color:var(--text);letter-spacing:.02em}
.diff-opt-desc{font-size:11px;color:var(--muted);font-weight:500;margin-top:1px}
.diff-opt-check{width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(100,55,200,.4);
  flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .15s}
.diff-opt.active .diff-opt-check{background:var(--purple);border-color:var(--purple);color:#FFF;
  box-shadow:0 0 10px rgba(124,77,255,.5)}

/* Gear btn */
.gear-btn{width:32px;height:32px;border:none;background:transparent;
  color:var(--muted);cursor:pointer;display:flex;align-items:center;
  justify-content:center;border-radius:8px;transition:all .15s;padding:0;flex-shrink:0}
.gear-btn:hover{color:var(--purple-bright);background:rgba(139,92,246,.15)}
.gear-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;
  stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* Archive */
.arch{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:14px 14px 18px}
.arch-shell{
  flex:1;overflow-y:auto;touch-action:pan-y;position:relative;
  background:
    radial-gradient(circle at top, rgba(214,168,255,.2), transparent 32%),
    linear-gradient(180deg, rgba(45,16,92,.78), rgba(22,10,55,.88));
  border:1px solid rgba(207,166,255,.22);
  border-radius:26px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 14px 44px rgba(10,4,26,.38);
  padding:16px 12px 18px;
}
.arch-shell::before{
  content:"";position:absolute;inset:10px;border-radius:22px;
  border:1px solid rgba(235,214,255,.16);pointer-events:none;
}
.arch-head{
  position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:4px;
  margin-bottom:16px;
}
.arch-kicker{
  font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(228,211,255,.78);
}
.arch-title{
  font-family:var(--fc);font-size:34px;font-weight:700;letter-spacing:.02em;
  color:#f5e9ff;text-shadow:0 0 24px rgba(223,177,255,.28);
}
.arch-sub{font-size:13px;color:rgba(227,213,255,.74);font-weight:500;text-align:center}
.arch-panel{
  position:relative;z-index:1;
  background:linear-gradient(180deg, rgba(144,86,255,.12), rgba(69,33,128,.12));
  border:1px solid rgba(214,171,255,.24);
  border-radius:24px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 40px rgba(207,148,255,.08);
  padding:14px 10px 12px;
}
.arch-toolbar{
  display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:6px;
  margin-bottom:12px;
}
.arch-navbtn{
  width:40px;height:40px;border-radius:50%;
  border:1px solid rgba(218,183,255,.3);
  background:linear-gradient(180deg, rgba(109,57,197,.56), rgba(67,30,122,.66));
  color:#f5e9ff;font-size:24px;line-height:1;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 20px rgba(19,8,43,.28), inset 0 1px 0 rgba(255,255,255,.14);
  transition:transform .15s, border-color .15s, box-shadow .15s;
}
.arch-navbtn:hover:not(:disabled){
  transform:translateY(-1px);
  border-color:rgba(236,215,255,.45);
  box-shadow:0 10px 24px rgba(19,8,43,.34), inset 0 1px 0 rgba(255,255,255,.18);
}
.arch-navbtn:disabled{opacity:.34;cursor:default;box-shadow:none}
.arch-monthhead{text-align:center}
.arch-monthtitle{
  font-family:var(--fc);font-size:24px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:#fff0ff;
}
.arch-monthmeta{
  margin-top:3px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
  color:rgba(225,211,255,.62);
}
.arch-weekdays{
  display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;
  margin-bottom:8px;padding:0 1px;
}
.arch-weekday{
  text-align:center;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:rgba(231,217,255,.74);
}
.arch-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.arch-cell{min-height:0;border-radius:14px;border:1px solid rgba(219,192,255,.12);background:rgba(255,255,255,.03)}
.arch-cell.empty{background:transparent;border-color:transparent}
.arch-day{
  appearance:none;-webkit-appearance:none;
  padding:0;margin:0;width:100%;aspect-ratio:1/1;min-height:0;border-radius:14px;
  border:1px solid rgba(223,200,255,.2);
  background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.06));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
  color:#f5ebff;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:5px;position:relative;
  transition:transform .14s, border-color .14s, background .14s, box-shadow .14s;
}
.arch-day.clickable{cursor:pointer}
.arch-day.clickable:hover{
  transform:translateY(-1px);
  border-color:rgba(237,220,255,.42);
  box-shadow:0 10px 20px rgba(15,6,37,.22), inset 0 1px 0 rgba(255,255,255,.16);
}
.arch-day-num{font-family:var(--fc);font-size:18px;font-weight:700;line-height:1}
.arch-day.played{
  background:linear-gradient(180deg, rgba(52,211,153,.3), rgba(22,163,74,.42));
  border-color:rgba(134,239,172,.55);
  box-shadow:0 10px 26px rgba(22,163,74,.22), inset 0 1px 0 rgba(255,255,255,.18);
}
.arch-day.unplayed{
  background:linear-gradient(180deg, rgba(255,255,255,.18), rgba(244,234,255,.14));
  border-color:rgba(231,211,255,.42);
  color:#f6edff;
}
.arch-day.today{
  border-color:rgba(255,236,188,.6);
  box-shadow:0 0 0 1px rgba(255,236,188,.24), inset 0 1px 0 rgba(255,255,255,.18);
}
.arch-day-star{
  position:absolute;top:-4px;right:-4px;width:16px;height:16px;object-fit:contain;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.24));
}
.arch-day.no-puzzle{
  background:rgba(255,255,255,.025);
  color:rgba(217,198,245,.26);
  border-color:rgba(208,185,240,.08);
}
.arch-day.future{
  background:rgba(255,255,255,.015);
  color:rgba(214,197,241,.16);
  border-color:rgba(208,185,240,.05);
}
.arch-legend{
  display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:16px;
}
.arch-legend-item{
  display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;
  background:rgba(27,11,62,.48);border:1px solid rgba(210,185,255,.18);
  color:rgba(240,231,255,.88);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
}
.arch-legend-dot{width:14px;height:14px;border-radius:5px;border:1px solid rgba(255,255,255,.18);flex-shrink:0}
.arch-legend-dot.played{background:linear-gradient(180deg, rgba(52,211,153,.55), rgba(22,163,74,.72))}
.arch-legend-dot.unplayed{background:transparent;border-color:rgba(231,211,255,.42)}
.arch-legend-star{width:14px;height:14px;object-fit:contain;flex-shrink:0}
.arch-empty{
  min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:20px;color:var(--muted);font-size:13px;line-height:1.7;font-weight:500;font-family:var(--fc)
}
.arch-empty-icon{font-size:40px;margin-bottom:14px}
@media (max-width:390px){
  .arch{padding:10px 10px 14px}
  .arch-title{font-size:30px}
  .arch-panel{padding:12px 8px 10px}
  .arch-monthtitle{font-size:21px}
  .arch-grid,.arch-weekdays{gap:5px}
  .arch-day-num{font-size:16px}
}
@media (max-width:360px){
  .arch-title{font-size:27px}
  .arch-monthtitle{font-size:19px}
  .arch-weekday{font-size:10px;letter-spacing:.12em}
  .arch-day-num{font-size:15px}
  .lobby-date{font-size:18px}
  .lobby-author{font-size:16px}
  .lobby-diff-label{font-size:14px}
}

/* Playing-from-archive banner */
.playing-banner{background:rgba(88,28,135,.85);color:var(--purple-bright);padding:8px 16px;
  display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
  font-size:12px;font-weight:600;border-bottom:1px solid rgba(139,92,246,.3);
  backdrop-filter:blur(8px)}
.playing-banner button{background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);
  color:var(--purple-bright);border-radius:50px;padding:4px 12px;font-size:11px;font-weight:700;
  cursor:pointer;transition:background .15s}
.playing-banner button:hover{background:rgba(139,92,246,.38)}

::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(100,55,200,.35);border-radius:4px}
`;
// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

// Biased shuffle: keeps re-shuffling until fewer than 2 solution slots are accidentally correct.
// Caps at 10 attempts so it never hangs. Also seeds with a time+random mix for better entropy.
function biasedShuffle(cardIds, solution) {
  const attempt = () => {
    const cut = Math.floor(Math.random() * cardIds.length);
    const seeded = [...cardIds.slice(cut), ...cardIds.slice(0, cut)];
    return shuffleArr(seeded).map(id => ({
      cardId: id,
      orientation: Math.floor(Math.random() * 4),
    }));
  };

  const countCorrect = slots => {
    if (!solution) return 0;
    return solution.slotCards.reduce((n, cardId, si) =>
      n + (slots[si]?.cardId === cardId && slots[si]?.orientation === solution.orientations[si] ? 1 : 0)
    , 0);
  };

  let best = attempt();
  let bestScore = countCorrect(best);

  // Try up to 10 times, keep the arrangement with the fewest accidental correct slots
  for (let i = 0; i < 10; i++) {
    if (bestScore < 2) break;
    const candidate = attempt();
    const score = countCorrect(candidate);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function bestSubmit(slots4, solution, locked, currentClues, originalClues) {
  // Determine which rotation of the board we're currently on by matching clues
  // Only check that specific rotation — prevents false positives from shuffled cards
  // accidentally matching a different rotation of the solution
  let boardRotation = 0;
  if(currentClues && originalClues) {
    for(let r=0;r<4;r++){
      let rc=[...originalClues];
      for(let k=0;k<r;k++) rc=CW_FROM.map(i=>rc[i]);
      if(rc.every((c,i)=>c===currentClues[i])){ boardRotation=r; break; }
    }
  }

  // Apply that rotation to the solution
  let sc=[...solution.slotCards], or=[...solution.orientations];
  for(let k=0;k<boardRotation;k++){
    const ns=CW_FROM.map(i=>sc[i]), no=CW_FROM.map(i=>(or[i]+1)%4);
    sc=ns; or=no;
  }

  const correct=new Set(), wrong=new Set();
  for(let i=0;i<4;i++){
    if(slots4[i]?.cardId===sc[i]&&slots4[i]?.orientation===or[i]) correct.add(i);
    else wrong.add(i);
  }
  // Still respect already-locked slots
  if([...locked].every(i=>correct.has(i)))
    return {correct,wrong};
  return {correct:new Set(),wrong:new Set([0,1,2,3])};
}

const loadLS = (k,fb) => {
  try{
    const v=localStorage.getItem(k);
    return v?JSON.parse(v):fb;
  } catch{
    return fb;
  }
};
const saveLS = (k,v) => {
  try{
    localStorage.setItem(k,JSON.stringify(v));
  } catch{
    // ignore storage write failures (private mode/quota)
  }
};
const removeLS = (k) => {
  try{
    localStorage.removeItem(k);
  } catch{
    // ignore storage remove failures
  }
};

// Easy drag UX experiment toggle:
// true  -> show floating drag preview
// false -> hide the preview and leave the source slot visually empty while dragging
const SHOW_DRAG_GHOST = true;

// ═══════════════════════════════════════════════════════════════
//  CARD TILE — 4 edge words, no CSS rotation of card
// ═══════════════════════════════════════════════════════════════

function CardTile({ card, orientation=0, locked, wrong, repeatBad, shaking, extraCls='', dim, spinning, spinDir=1,
                    popping, rotateMoveClass='', rotateSpin=false, selected, noclick, adminMode=false, onPointerDown,
                    hideWords=false, hideCenterMark=false, children=null }) {
  const [t,r,b,l] = vw(card, orientation);
  let cls="ctile";
  if(locked)                  cls+=" locked";
  else if(wrong||repeatBad)   cls+=" wrong-red";
  if(shaking)  cls+=" shaking";
  if(dim)      cls+=" dim";
  if(spinning) cls+=" spinning";
  if(popping)  cls+=" swap-pop";
  if(rotateMoveClass) cls+=` ${rotateMoveClass}`;
  if(selected) cls+=" selected";
  if(noclick)  cls+=" noclick";
  if(adminMode) cls+=" admin-mode";
  if(extraCls) cls+=extraCls;

  return (
    <div className={cls} style={{"--sd":spinDir}} onPointerDown={onPointerDown}>
      <div className={`ctile-inner${rotateSpin ? " rotate-spin" : ""}`}>
        {!hideWords && (
          <>
            <span className="ew et">{t}</span>
            <span className="ew er">{r}</span>
            <span className="ew eb">{b}</span>
            <span className="ew el">{l}</span>
          </>
        )}
        {!hideCenterMark && <div className="cmark"/>}
        {children}
      </div>
    </div>
  );
}

function AdminPreviewCard({
  card, orientation=0, selected, dim, dragSrc=false, onPointerDown, onRotate, onSelect,
  editingWord=null, editDraft="", onStartEdit, onEditDraftChange, onCommitEdit, onCancelEdit,
}) {
  const [t,r,b,l] = vw(card, orientation);
  const words = [t,r,b,l];
  const inputRef = useRef(null);

  useEffect(()=>{
    if(editingWord == null) return;
    requestAnimationFrame(()=>{
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  },[editingWord]);

  const stop = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <CardTile
      card={card}
      orientation={orientation}
      adminMode
      dim={dragSrc}
      selected={selected}
      hideWords
      hideCenterMark
      onPointerDown={onPointerDown}
    >
      <button className="admin-card-hit" onClick={onSelect} aria-label="Select card" />
      {[["top",0],["right",1],["bottom",2],["left",3]].map(([pos, idx])=>(
        <div key={pos} className={`admin-word-wrap ${pos}`} onPointerDown={stop} onMouseDown={stop}>
          {editingWord === idx ? (
            <input
              ref={inputRef}
              className={`admin-word-input ${pos}`}
              value={editDraft}
              onChange={e=>onEditDraftChange(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={e=>{
                if(e.key==="Enter"){ e.preventDefault(); onCommitEdit(); }
                if(e.key==="Escape"){ e.preventDefault(); onCancelEdit(); }
              }}
            />
          ) : (
            <button
              className={`admin-word-btn ${pos}`}
              onClick={e=>{ stop(e); onStartEdit(idx, words[idx] || ""); }}
              title="Edit word"
            >
              {words[idx] || "+"}
            </button>
          )}
        </div>
      ))}
      <button
        className="admin-rotate-btn"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={e=>{ stop(e); onRotate(); }}
        title="Rotate card"
        aria-label="Rotate card"
      >
        ↻
      </button>
    </CardTile>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BOARD — shared by game and admin preview
// ═══════════════════════════════════════════════════════════════

// ── ASSETS ──────────────────────────────────────────────────────

const BALL_B64 = "data:image/png;base64,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";

function CrystalBallSVG({ size }) {
  return (
    <img
      src={BALL_B64}
      width={size}
      height={size}
      style={{display:"block", objectFit:"contain", pointerEvents:"none"}}
      alt=""
    />
  );
}
const CLOUD_H_B64 = "data:image/png;base64,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";
const CLOUD_V_B64 = "data:image/png;base64,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";

const USE_PRETTY_CRYSTAL_BALL = true;
const DEFAULT_CRYSTAL_BALL_ASSET = "/assets/crystal-ball.png";
const PRETTY_CRYSTAL_BALL_ASSET = "/assets/crystal-ball-pretty.png";
const CRYSTAL_BALL_ASSET = USE_PRETTY_CRYSTAL_BALL ? PRETTY_CRYSTAL_BALL_ASSET : DEFAULT_CRYSTAL_BALL_ASSET;
const CLOUD_HORIZONTAL_ASSET = "/assets/cloud-horizontal.png";
const CLOUD_VERTICAL_ASSET = "/assets/cloud-horizontal.png";
const STAR_LIFE_ASSET = "/assets/star-life.png";
const CELEBRATION_PARTICLES = ['🔮','✨','⭐','🌟','💫','✨','🔮','⭐','💫','🌟','✨','🔮'];

function CloudH({ text, animClass, artRotation=0, artOpacity=0.92, artTranslateY=-8, textShiftX=0, textShiftY=-8, textAnimClass="" }) {
  return (
    <div className={`cloud-wrap cloud-h ${animClass||""}`} style={{
      position:"relative",display:"flex",alignItems:"center",justifyContent:"center"
    }}>
      <div style={{
        position:"absolute",inset:0,pointerEvents:"none",userSelect:"none",
        backgroundImage:`url("${CLOUD_HORIZONTAL_ASSET}")`,
        backgroundPosition:"center top",
        backgroundRepeat:"no-repeat",
        backgroundSize:"contain",
        opacity:artOpacity,
        transform:`translateY(${artTranslateY}px) rotate(${artRotation}deg)`
      }}/>
      <span className={`cloud-label ${textAnimClass}`.trim()} style={{
        position:"relative",zIndex:1,
        fontFamily:"'Bungee',sans-serif",fontWeight:400,fontSize:"20px",
        letterSpacing:"0.06em",textTransform:"uppercase",
        color:"#17111f",
        textShadow:"0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(0,0,0,0.08)",
        padding:"0 12px",
        transform:`translate(${textShiftX}px, ${textShiftY}px)`
      }}>{text}</span>
    </div>
  );
}

function CloudV({ text, animClass, rotation, textRotation=-90, textShiftX=0, textShiftY=0, textAnimClass="", artOpacity=0.92 }) {
  return (
    <div className={`cloud-wrap cloud-v ${animClass||""}`} style={{
      position:"relative",display:"flex",alignItems:"center",justifyContent:"center"
    }}>
      <div style={{
        position:"absolute",left:"50%",top:"50%",
        width:"286px",height:"60px",
        transform:`translate(-50%, -50%) translateY(-10px) rotate(${rotation}deg)`,
        pointerEvents:"none",userSelect:"none",
        backgroundImage:`url("${CLOUD_VERTICAL_ASSET}")`,
        backgroundPosition:"center",
        backgroundRepeat:"no-repeat",
        backgroundSize:"contain",
        opacity:artOpacity
      }}/>
      <span className={`cloud-label ${textAnimClass}`.trim()} style={{
        position:"relative",zIndex:1,
        fontFamily:"'Bungee',sans-serif",fontWeight:400,fontSize:"20px",
        letterSpacing:"0.05em",textTransform:"uppercase",
        color:"#17111f",
        textShadow:"0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(0,0,0,0.08)",
        display:"inline-block",
        whiteSpace:"nowrap",
        transform:`translate(${textShiftX}px, ${textShiftY}px) rotate(${textRotation}deg)`,
        transformOrigin:"center center",
        padding:"0 10px"
      }}>{text}</span>
    </div>
  );
}

// ── BOARD ────────────────────────────────────────────────────────

function Board({ clues, renderClue, renderSlot, compactLevel=0, cluesRotating=false }) {
  // Card grid: 104*2 + 8 gap + 24 padding = 240px square
  const SURF = compactLevel >= 2 ? 212 : compactLevel === 1 ? 226 : 240;
  const BALL = compactLevel >= 2 ? 390 : compactLevel === 1 ? 404 : 420;

  // The ball PNG: sphere occupies top ~65% of image, base the bottom 35%.
  // Sphere center sits at ~32% from top of the image = 0.32 * BALL from top.
  // We want sphere center to align with the card grid center (SURF/2 = 120px).
  // Ball top = cardCenter - sphereCenter = 120 - (0.32 * BALL)
  // As an offset from the card grid center: shift ball UP by (0.32*BALL - SURF/2)
  // Shift ball DOWN — sphere needs to wrap the cards, not sit below them
  // Negative ballShiftUp = move ball down
  const ballShiftUp = compactLevel >= 2 ? -58 : compactLevel === 1 ? -64 : -70;

  // Clouds
  const CHW = compactLevel >= 2 ? 262 : compactLevel === 1 ? 274 : 286;
  const CHH = compactLevel >= 2 ? 54 : compactLevel === 1 ? 57 : 60;
  const CVW = compactLevel >= 2 ? 54 : compactLevel === 1 ? 57 : 60;
  const CVH = compactLevel >= 2 ? 262 : compactLevel === 1 ? 274 : 286;
  const FOREGROUND_SHIFT_Y = compactLevel >= 2 ? 10 : compactLevel === 1 ? 14 : 18;
  const clueTextAnimClass = cluesRotating ? "clue-rotating" : "";

  const topClue   = renderClue ? renderClue(0,"top") : <CloudH text={clues[0]||""} animClass="float-top" textShiftX={10} textShiftY={compactLevel >= 2 ? -14 : -18} textAnimClass={clueTextAnimClass}/>;
  const rightClue = renderClue ? renderClue(1,"rgt") : <CloudV text={clues[1]||""} animClass="float-right" rotation={90} textRotation={90} textShiftX={0} textShiftY={0} textAnimClass={clueTextAnimClass}/>;
  const botClue   = renderClue ? renderClue(2,"bot") : <CloudH text={clues[2]||""} animClass="float-bot" textShiftX={10} textShiftY={compactLevel >= 2 ? -14 : -18} textAnimClass={clueTextAnimClass}/>;
  const leftClue  = renderClue ? renderClue(3,"lft") : <CloudV text={clues[3]||""} animClass="float-left" rotation={-90} textRotation={-90} textShiftX={0} textShiftY={0} textAnimClass={clueTextAnimClass}/>;

  const boardShiftX = compactLevel >= 2 ? -4 : compactLevel === 1 ? -6 : -10;

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,marginTop:compactLevel >= 2 ? 8 : compactLevel === 1 ? 11 : 14,transform:`translateX(${boardShiftX}px)`}}>

      {/* TOP CLOUD */}
      <div style={{width:CHW,height:CHH,zIndex:5,marginBottom:compactLevel >= 2 ? -5 : -8,transform:`translateY(${FOREGROUND_SHIFT_Y}px)`}}>
        {topClue}
      </div>

      {/* MIDDLE ROW */}
      <div style={{display:"flex",alignItems:"center",gap:0,position:"relative"}}>

        {/* LEFT CLOUD */}
        <div style={{width:CVW,height:CVH,zIndex:5,marginRight:compactLevel >= 2 ? 20 : compactLevel === 1 ? 23 : 26,transform:`translateY(${FOREGROUND_SHIFT_Y}px)`}}>
          {leftClue}
        </div>

        {/* Card grid — ball positioned so its sphere center aligns here */}
        <div style={{
          position:"relative",
          width:SURF,
          height:SURF,
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
        }}>
          {/* Decorative art stays behind the live board so existing interaction layers remain unchanged. */}
          <div style={{
            position:"absolute",
            width:BALL,
            height:BALL,
            left:"50%",
            top:"50%",
            transform:`translate(-50%, calc(-50% - ${ballShiftUp}px))`,
            pointerEvents:"none",
            zIndex:0,
          }}>
            <div
              style={{
                width:"100%",
                height:"100%",
                userSelect:"none",
                backgroundImage:`url("${CRYSTAL_BALL_ASSET}")`,
                backgroundPosition:"center",
                backgroundRepeat:"no-repeat",
                backgroundSize:"contain",
              }}
            />
          </div>
          {/* Cards centered in card grid, floating above ball interior */}
          <div style={{position:"relative",zIndex:2,transform:`translateY(${FOREGROUND_SHIFT_Y}px)`}}>
            <div className="csurface">
              {renderSlot(0)}{renderSlot(1)}
              {renderSlot(3)}{renderSlot(2)}
            </div>
          </div>
        </div>

        {/* RIGHT CLOUD */}
        <div style={{width:CVW,height:CVH,zIndex:5,marginLeft:compactLevel >= 2 ? 6 : compactLevel === 1 ? 8 : 10,transform:`translateY(${FOREGROUND_SHIFT_Y}px)`}}>
          {rightClue}
        </div>
      </div>

      {/* BOTTOM CLOUD */}
      <div style={{width:CHW,height:CHH,zIndex:5,marginTop:compactLevel >= 2 ? -5 : -8,transform:`translateY(${FOREGROUND_SHIFT_Y}px)`}}>
        {botClue}
      </div>

    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
//  DRAG GHOST (shows 4-word card)
// ═══════════════════════════════════════════════════════════════

function DragGhost({ ghost }) {
  if(!ghost) return null;
  const [t,r,b,l] = ghost.card ? vw(ghost.card, ghost.orientation) : ["","","",""];
  return (
    <div className="ghost" style={{
      position:"fixed",left:ghost.x-ghost.sz/2,top:ghost.y-ghost.sz/2,
      pointerEvents:"none",zIndex:9999,
    }}>
      <span className="ew et">{t}</span>
      <span className="ew er">{r}</span>
      <span className="ew eb">{b}</span>
      <span className="ew el">{l}</span>
      <div className="cmark"/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STATS OVERLAY — shared by GameView (post-solve) and PuzzleLobby
// ═══════════════════════════════════════════════════════════════

function StatsOverlay({ lost, livesUsed, stats, onClose, onShare, copied, difficulty }) {
  return (
    <div className="sovr" onClick={onClose}>
      <div className="sovr-emoji">{lost ? "🌙" : "🔮"}</div>
      <div className="sovr-title">{lost ? "The veil remains closed" : "The crystal speaks!"}</div>
      <div className="sovr-sub">
        {lost
          ? `You used all ${MAX_LIVES} lives`
          : formatLivesUsed(livesUsed)
        }
      </div>
      <div className="sovr-divider"/>
      <div className="stats-grid" onClick={e=>e.stopPropagation()}>
        <div className="stat-box">
          <div className="stat-val">{stats.totalPlayed||0}</div>
          <div className="stat-lbl">Played</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">
            {stats.totalPlayed ? Math.round((stats.totalWon/stats.totalPlayed)*100) : 0}%
          </div>
          <div className="stat-lbl">Win %</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{stats.currentStreak||0}</div>
          <div className="stat-lbl">Streak 🔥</div>
        </div>
      </div>
      {(()=>{
        const dist=stats.livesUsedDist||DEFAULT_STATS.livesUsedDist;
        const maxVal=Math.max(1,...Object.values(dist).map(Number));
        const currentKey=lost?'X':String(Math.min(2, Math.max(0, livesUsed ?? 0)));
        const rows=[{key:'0',label:'0'},{key:'1',label:'1'},{key:'2',label:'2'},{key:'X',label:'X'}];
        return (
          <div className="dist" onClick={e=>e.stopPropagation()}>
            {rows.map(({key,label})=>{
              const count=dist[key]||0;
              const pct=Math.max(8,Math.round((count/maxVal)*100));
              const isCurrent=key===currentKey;
              return (
                <div key={key} className="dist-row">
                  <div className="dist-key">{label}</div>
                  <div className="dist-bar-wrap">
                    <div className={`dist-bar${isCurrent?' current':key==='X'?' loss':' win'}`}
                      style={{width:`${pct}%`}}>{count}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
      {!!difficulty && !lost && (
        <>
          <div className="sovr-divider"/>
          <div style={{fontSize:12,color:"rgba(240,231,255,.82)",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase"}}>
            Solved On {DIFFICULTY_LABELS[difficulty] || difficulty}
          </div>
        </>
      )}
      <div className="sovr-divider"/>
      <button className="sovr-btn" onClick={e=>{e.stopPropagation();onShare();}}>
        {copied?"✓ Copied!":"Share Results"}
      </button>
      <button className="sovr-btn" style={{fontSize:12,padding:"8px 20px",opacity:.65}}
        onClick={e=>{e.stopPropagation();onClose();}}>
        See Board
      </button>
    </div>
  );
}

const TUTORIAL_PUZZLE = {
  id:"tutorial-001",
  title:"Tutorial",
  status:"published",
  date:"2000-01-01",
  author:"",
  clues:["SPACE","BARNEY","CHEESE","FROZEN"],
  cards:{
    t1:{id:"t1",words:["MOON","SCIENCE","DOG","ICE"]},
    t2:{id:"t2",words:["STAR","DINOSAUR","HOUSE","SANTA"]},
    t3:{id:"t3",words:["LETTER","FIRE","PIZZA","PRINCESS"]},
    t4:{id:"t4",words:["MAFIA","PURPLE","MOUSE","PAN"]},
  },
  solution:{slotCards:["t1","t2","t4","t3"],orientations:[0,0,0,0],extraCards:[]},
};

const TUTORIAL_INITIAL_SLOTS = [
  { cardId:"t2", orientation:1 },
  { cardId:"t1", orientation:0 },
  { cardId:"t3", orientation:1 },
  { cardId:"t4", orientation:1 },
];

const TUTORIAL_FINAL_SUCCESS =
  "Beautiful. You solved the practice board. Go play today's puzzle! New puzzles are uploaded every day.";

function renderTutorialCopy(text){
  if(!text) return "";
  const parts = String(text).split("**");
  return parts.map((part, index)=>(
    index % 2 === 1 ? <strong key={`tut-copy-${index}`}>{part}</strong> : <span key={`tut-copy-${index}`}>{part}</span>
  ));
}

const TUTORIAL_FLOW = [
  {
    step:"",
    title:"How To Play",
    body:"Place the correct 4 cards in the crystal ball. Each cloud clue connects to the 2 words facing it. Both words must work.",
    highlightedSlots:[],
    highlightedClues:[0,1,2,3],
    allowTapSlots:[],
    allowDragPairs:[],
  },
  {
    step:"",
    title:"Drag And Drop",
    body:"Pick up the top-right card and place it so that **Ice** is facing **Frozen**, and **Moon** is facing **Space**.",
    highlightedSlots:[0,1],
    dimmedSlots:[2,3],
    highlightedClues:[0,1,3],
    allowTapSlots:[],
    allowDragPairs:[[0,1]],
  },
  {
    step:"",
    title:"Rotating Cards",
    body:"Tap the top-right card until **Star** is facing **Space**, and **Dinosaur** is facing **Barney**.",
    highlightedSlots:[1],
    dimmedSlots:[0,2,3],
    highlightedClues:[0,1,3],
    allowTapSlots:[1],
    allowDragPairs:[],
  },
  {
    step:"",
    title:"Solve The Rest",
    body:"Amazing! Now solve the bottom two using what you've learned. Good luck! Press **Submit** when you think you have the right answer.",
    highlightedSlots:[2,3],
    highlightedClues:[1,2,3],
    allowTapSlots:[2,3],
    allowDragPairs:[[2,3]],
  },
  {
    step:"",
    title:"Tutorial Complete",
    body:"That’s the loop: rotate for perspective, move cards into place, then submit.",
    highlightedSlots:[0,1,2,3],
    highlightedClues:[0,1,2,3],
    allowTapSlots:[],
    allowDragPairs:[],
  },
];

function TutorialPracticeOverlay({ onClose }) {
  return (
    <div className="tut-ovr" onClick={onClose}>
      <div className="tut-card" onClick={e=>e.stopPropagation()} style={{maxWidth:392,padding:"18px 14px 14px"}}>
        <GameView
          puzzle={TUTORIAL_PUZZLE}
          forceFresh
          admireMode={false}
          difficulty="easy"
          tutorialConfig={{ initialSlots:TUTORIAL_INITIAL_SLOTS, steps:TUTORIAL_FLOW }}
          onTutorialClose={onClose}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PUZZLE LOBBY — shown before game starts
// ═══════════════════════════════════════════════════════════════

function PuzzleLobby({ puzzle, difficulty, onChangeDifficulty, onStart, completedData, onAdmire, onOpenTutorial }) {
  const d = new Date(puzzle.date + "T12:00:00");
  const dateStr = d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const [showReplay, setShowReplay] = useState(false);
  const [showStats, setShowStats]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const touchStartRef = useRef(false);

  const handleDifficultyPress = (key) => {
    if(key === difficulty) return;
    onChangeDifficulty(key);
  };

  const handleTouchButton = (action) => (e) => {
    if(e.pointerType === "mouse") return;
    touchStartRef.current = true;
    e.preventDefault();
    action();
  };

  const handleClickAfterTouch = (action) => () => {
    if(touchStartRef.current){
      touchStartRef.current = false;
      return;
    }
    action();
  };

  const handleShare = () => {
    if(!completedData) return;
    const d2 = new Date(puzzle.date+'T12:00:00');
    const label = `${d2.getMonth()+1}·${String(d2.getDate()).padStart(2,'0')}·${d2.getFullYear()}`;
    const solvedDifficulty = completedData.difficulty || puzzle.difficulty;
    const diffIcons = {easy:'✨',standard:'🌙',expert:'🌕',hardcore:'🌑'};
    const icon = diffIcons[solvedDifficulty]||'🌙';
    const resultLine = completedData.livesUsed == null
      ? `Solved on ${DIFFICULTY_LABELS[solvedDifficulty] || solvedDifficulty}`
      : `Solved on ${DIFFICULTY_LABELS[solvedDifficulty] || solvedDifficulty} · ${formatLivesUsedCompact(completedData.livesUsed)}`;
    const text = `Crystal Clues ${label} ${icon}\n(${resultLine})`;
    const doCopy = () => {
      try {
        const ta=document.createElement('textarea');
        ta.value=text; ta.style.cssText='position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        setCopied(true); setTimeout(()=>setCopied(false),2000);
      } catch{
        // fallback handled below
      }
    };
    if(navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(doCopy);
    else doCopy();
  };

  // Completed state — show admire/replay choice first
  if(completedData && !showReplay) {
    return (
      <>
        <div className="lobby">
          <div className="lobby-icon">🔮</div>
          <div className="lobby-title">{puzzle.title || "Today's Puzzle"}</div>
          <div className="lobby-date">{dateStr}</div>
          {puzzle.author && (
            <div className="lobby-author">
              by {puzzle.author}
            </div>
          )}
          <div style={{fontSize:13,color:"var(--correct)",fontWeight:700,marginBottom:20}}>
            ✓ Solved{completedData.difficulty ? ` on ${DIFFICULTY_LABELS[completedData.difficulty]}` : ""}{completedData.livesUsed == null ? "" : ` · ${formatLivesUsedCompact(completedData.livesUsed)}`}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:280}}>
            <button className="lobby-start" onClick={onAdmire}>
              Admire Puzzle
            </button>
            <button className="lobby-start"
              style={{background:"rgba(30,15,70,0.9)",color:"var(--purple-bright)",
                border:"1.5px solid rgba(139,92,246,0.6)",boxShadow:"none"}}
              onClick={()=>setShowReplay(true)}>
              Replay Puzzle
            </button>
            <button className="lobby-start"
              style={{background:"rgba(15,8,35,0.9)",color:"var(--muted)",
                border:"1.5px solid rgba(100,55,200,0.35)",boxShadow:"none"}}
              onClick={()=>setShowStats(true)}>
              Share Results
            </button>
          </div>
        </div>
        {showStats && (
          <StatsOverlay
            lost={false}
            livesUsed={completedData.livesUsed ?? 0}
            stats={loadStats()}
            difficulty={completedData.difficulty || puzzle.difficulty}
            onClose={()=>setShowStats(false)}
            onShare={handleShare}
            copied={copied}
          />
        )}
      </>
    );
  }

  // Normal lobby (fresh or replay)
  return (
    <div className="lobby">
      <div className="lobby-icon">🔮</div>
      <div className="lobby-title">{puzzle.title || "Today's Puzzle"}</div>
      <div className="lobby-date">{dateStr}</div>
      {puzzle.author && (
        <div className="lobby-author">
          by {puzzle.author}
        </div>
      )}

      <div className="lobby-diff-label">Select Difficulty</div>
      <div className="lobby-diff-opts">
        {DIFF_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`lobby-diff-opt${difficulty===opt.key?" active":""}`}
            type="button"
            onPointerDown={handleTouchButton(()=>handleDifficultyPress(opt.key))}
            onClick={handleClickAfterTouch(()=>handleDifficultyPress(opt.key))}
          >
            <span className="lobby-diff-icon">{opt.icon}</span>
            <span className="lobby-diff-name">{opt.name}</span>
            <span className="lobby-diff-desc">{opt.desc}</span>
            <span className="lobby-diff-check">{difficulty===opt.key?"✓":""}</span>
          </button>
        ))}
      </div>

      <button className="lobby-start" type="button"
        onPointerDown={handleTouchButton(onStart)}
        onClick={handleClickAfterTouch(onStart)}>Start Puzzle</button>
      <button className="tut-open" type="button" onClick={onOpenTutorial}>How To Play</button>
      {completedData && (
        <button style={{marginTop:8,background:"none",border:"none",color:"var(--muted)",
          fontSize:12,fontWeight:500,cursor:"pointer",textDecoration:"underline"}}
          onClick={()=>setShowReplay(false)}>
          ← Back
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  GAME VIEW
// ═══════════════════════════════════════════════════════════════

function GameView({
  puzzle,
  onSolved,
  completions={},
  onGameStart,
  onReset,
  forceFresh=false,
  admireMode=false,
  difficulty="hardcore",
  tutorialConfig=null,
  onTutorialClose,
}) {
  // Puzzles always have exactly 3 extra cards stored in solution.extraCards
  // Difficulty controls how many the player SEES (removed from end: #3 first, then #2, then #1)
  const numExtra = DIFFICULTY_EXTRA[difficulty] ?? 3;
  const totalSlots = 4 + numExtra;
  const tutorialActive = !!tutorialConfig;
  const tutorialSteps = tutorialConfig?.steps || [];

  // Get the fixed ordered extra cards from the puzzle
  const extraCardIds = puzzle.solution.extraCards || 
    Object.keys(puzzle.cards).filter(id => !puzzle.solution.slotCards.includes(id)).slice(0,3);

  // Player sees only the first numExtra extras (removing from end)
  const visibleExtraIds = extraCardIds.slice(0, numExtra);

  const initSlots = useCallback(()=>{
    if(tutorialActive){
      return (tutorialConfig?.initialSlots || []).map(slot=>({ ...slot }));
    }
    if(admireMode){
      return puzzle.solution.slotCards.map((cardId,i)=>({
        cardId, orientation: puzzle.solution.orientations[i]
      }));
    }
    const solCards = [...puzzle.solution.slotCards];
    // Use the fixed visible extras (ordered, not random)
    const chosen = [...solCards, ...visibleExtraIds];
    return biasedShuffle(chosen, puzzle.solution);
  },[admireMode, puzzle.solution, tutorialActive, tutorialConfig?.initialSlots, visibleExtraIds]);

  const alreadySolved = tutorialActive ? false : admireMode || (!forceFresh && !!completions[puzzle.id]?.solved);
  const progressKey = `clover_progress_${puzzle.id}`;
  const savedProgress = (!tutorialActive && !admireMode && !alreadySolved && !forceFresh)
    ? loadLS(progressKey, null)
    : null;
  const canRestoreProgress = !!savedProgress &&
    savedProgress.totalSlots === totalSlots &&
    Array.isArray(savedProgress.slots) &&
    Array.isArray(savedProgress.clues);
  const [slots,setSlots]     = useState(()=> canRestoreProgress ? savedProgress.slots : initSlots());
  const [clues,setClues]     = useState(()=> canRestoreProgress ? savedProgress.clues : [...puzzle.clues]);
  const [locked,setLocked]   = useState(()=> alreadySolved
    ? new Set([0,1,2,3])
    : canRestoreProgress ? new Set(savedProgress.locked || []) : new Set());
  const [wrong,setWrong]     = useState(()=> canRestoreProgress ? new Set(savedProgress.wrong || []) : new Set());
  const [knownBad,setKnownBad] = useState(()=> canRestoreProgress
    ? new Map((savedProgress.knownBad || []).map(([k,v])=>[Number(k), new Set(v)]))
    : new Map());
  const [spinning,setSpinning] = useState(new Set());
  const [swapPopping,setSwapPopping] = useState(new Set());
  const [rotateAnimating,setRotateAnimating] = useState(false);
  const [flipReveal,setFlipReveal] = useState({}); // {slotIdx: 'down'|'up'}
  const [ghost,setGhost]     = useState(null);
  const [dragSrc,setDragSrc] = useState(null);
  const [isDragging,setIsDragging] = useState(false);
  const [dragOver,setDragOver] = useState(null);
  const [feedback,setFeedback]       = useState(admireMode ? "The vision is clear 🔮" : alreadySolved?"Already revealed — well done!":"");
  const [feedbackFading,setFbFading] = useState(false);
  const [solved,setSolved]   = useState(()=> tutorialActive ? false : alreadySolved || !!savedProgress?.solved);
  const [lost,setLost]       = useState(()=> !!savedProgress?.lost);
  const [lives,setLives]     = useState(()=> tutorialActive ? MAX_LIVES : savedProgress?.lives ?? MAX_LIVES);
  const [guessHistory,setGuessHistory] = useState(()=> tutorialActive ? [] : savedProgress?.guessHistory || []); // array of {row: [emoji,emoji,emoji,emoji]}
  const [showOvr,setShowOvr] = useState(false);
  const [copied,setCopied]   = useState(false);
  const [stats,setStats]     = useState(loadStats);
  const [shakeKey,setShakeKey] = useState(0);
  const [revealPhase,setRevealPhase] = useState(null); // null | 'grey' | 'revealing' | 'done'
  const [revealColors,setRevealColors] = useState({}); // {slotIdx: 'green'|'red'}
  const [showParticles,setShowParticles] = useState(false);
  const swapPopTimer = useRef(null);
  const rotateTimer = useRef(null);
  const playFitOuterRef = useRef(null);
  const playFitInnerRef = useRef(null);
  const [playScale,setPlayScale] = useState(1);
  const [viewportSize,setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [tutorialStepIndex,setTutorialStepIndex] = useState(0);
  const [tutorialReadyForNext,setTutorialReadyForNext] = useState(()=>tutorialActive);
  const [tutorialComplete,setTutorialComplete] = useState(false);

  useEffect(()=>{
    const updateViewportSize = () => {
      setViewportSize({
        width: window.visualViewport?.width || window.innerWidth,
        height: window.visualViewport?.height || window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("scroll", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("scroll", updateViewportSize);
    };
  },[]);

  const compactLevel = useMemo(()=>{
    if(viewportSize.height <= 690 || viewportSize.width <= 320) return 2;
    if(viewportSize.height <= 780 || viewportSize.width <= 390) return 1;
    return 0;
  },[viewportSize.height, viewportSize.width]);

  useEffect(()=>{
    const outer = playFitOuterRef.current;
    const inner = playFitInnerRef.current;
    if(!outer || !inner) return;

    let raf = 0;
    const updateScale = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const outerTop = outer.getBoundingClientRect().top;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const visualAvailableHeight = Math.max(0, viewportHeight - outerTop - 8);
        const availableHeight = Math.min(outer.clientHeight, visualAvailableHeight || outer.clientHeight);
        const availableWidth = outer.clientWidth;
        const naturalHeight = inner.scrollHeight;
        const naturalWidth = inner.scrollWidth;
        if(!availableHeight || !availableWidth || !naturalHeight || !naturalWidth) return;
        const nextScale = Math.min(1, (availableHeight - 4) / naturalHeight, (availableWidth - 4) / naturalWidth);
        setPlayScale(prev => Math.abs(prev - nextScale) > 0.01 ? nextScale : prev);
      });
    };

    const ro = new ResizeObserver(updateScale);
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("scroll", updateScale);
    updateScale();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("scroll", updateScale);
    };
  }, [difficulty, numExtra, solved, lost, showOvr, rotateAnimating, compactLevel]);

  const playAreaStyle = useMemo(()=>({
    transform:`scale(${playScale})`,
    marginBottom: playScale < 1 ? `${-1 * Math.max(0, (1 - playScale) * 260)}px` : "0px",
  }),[playScale]);

  const tutorialStep = tutorialActive ? tutorialSteps[tutorialStepIndex] : null;
  const tutorialHighlightedSlots = tutorialStep?.highlightedSlots || [];
  const tutorialHighlightedClues = tutorialStep?.highlightedClues || [];
  const tutorialAllowTapSlots = tutorialStep?.allowTapSlots || [];
  const tutorialAllowDragPairs = tutorialStep?.allowDragPairs || [];
  const tutorialPairAllowed = useCallback((from,to)=>
    tutorialAllowDragPairs.some(([a,b])=>(a===from && b===to) || (a===to && b===from))
  ,[tutorialAllowDragPairs]);
  const tutorialSlotMatchesSolution = useCallback((slotIndex)=>
    slots[slotIndex]?.cardId === puzzle.solution.slotCards[slotIndex] &&
    slots[slotIndex]?.orientation === puzzle.solution.orientations[slotIndex]
  ,[slots, puzzle.solution.orientations, puzzle.solution.slotCards]);

  useEffect(()=>{
    if(tutorialActive) setFeedback("");
  },[tutorialActive]);

  const handleTutorialNext = useCallback(()=>{
    if(!tutorialActive || !tutorialReadyForNext) return;
    if(tutorialStepIndex === 0){
      setTutorialStepIndex(1);
      setTutorialReadyForNext(false);
      setFeedback("");
      return;
    }
    if(tutorialStepIndex === 1){
      setTutorialStepIndex(2);
      setTutorialReadyForNext(false);
      setFeedback("Tap the top-right card until **Star** is facing **Space**, and **Dinosaur** is facing **Barney**.");
      return;
    }
    if(tutorialStepIndex === 2){
      setTutorialStepIndex(3);
      setTutorialReadyForNext(false);
      setFeedback("");
    }
  },[tutorialActive, tutorialReadyForNext, tutorialStepIndex]);

  useEffect(()=>{
    if(!tutorialActive || tutorialComplete) return;
    const topSwapped =
      slots[0]?.cardId === puzzle.solution.slotCards[0] &&
      slots[0]?.orientation === puzzle.solution.orientations[0] &&
      slots[1]?.cardId === puzzle.solution.slotCards[1];
    const topSolved = [0,1].every(tutorialSlotMatchesSolution);
    if(tutorialStepIndex === 1 && topSwapped && !tutorialReadyForNext){
      setLocked(prev => new Set([...prev, 0]));
      setTutorialReadyForNext(true);
      setFeedback("Perfect! That card is green which means it's correct.");
      return;
    }
    if(tutorialStepIndex === 2 && topSolved && !tutorialReadyForNext){
      setLocked(prev => new Set([...prev, 0, 1]));
      setTutorialReadyForNext(true);
      setFeedback("Perfect! The top row is solved.");
      return;
    }
  },[
    tutorialActive,
    tutorialComplete,
    tutorialReadyForNext,
    tutorialSlotMatchesSolution,
    tutorialStepIndex,
    slots,
    puzzle.solution.orientations,
    puzzle.solution.slotCards,
  ]);

  // Web Audio victory fanfare — leprechaun-y ascending arpeggio
  const playVictorySound = useCallback(()=>{
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t); osc.stop(t + 0.5);
      });
      // final shimmer chord
      [1046.5,1318.5,1568].forEach((freq)=>{
        const osc=ctx.createOscillator(); const gain=ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type='sine'; osc.frequency.value=freq;
        const t=ctx.currentTime+0.72;
        gain.gain.setValueAtTime(0,t);
        gain.gain.linearRampToValueAtTime(0.1,t+0.05);
        gain.gain.exponentialRampToValueAtTime(0.001,t+1.2);
        osc.start(t); osc.stop(t+1.3);
      });
    } catch{
      // audio not available
    }
  },[]);

  // Wrong guess sound — two low boing tones
  const playWrongSound = useCallback(()=>{
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      [220, 180].forEach((freq,i)=>{
        const osc=ctx.createOscillator(); const gain=ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type='sine'; osc.frequency.value=freq;
        const t=ctx.currentTime+i*0.18;
        gain.gain.setValueAtTime(0,t);
        gain.gain.linearRampToValueAtTime(0.15,t+0.03);
        gain.gain.exponentialRampToValueAtTime(0.001,t+0.35);
        osc.start(t); osc.stop(t+0.4);
      });
    } catch{
      // audio not available
    }
  },[]);

  // Share helpers
  const buildShareText = useCallback((history)=>{
    const d = new Date(puzzle.date+'T12:00:00');
    const label = `${d.getMonth()+1}·${String(d.getDate()).padStart(2,'0')}·${d.getFullYear()}`;
    const diffIcons = {easy:'✨',standard:'🌙',expert:'🌕',hardcore:'🌑'};
    const icon = diffIcons[puzzle.difficulty] || '🌙';
    const header = `Crystal Clues ${label} ${icon}`;
    // Each guess is a 2x2 block — lay all guesses side by side, top row then bottom row
    const topRow = history.map(rows => `${rows[0][0]}${rows[0][1]}`).join(' ');
    const botRow = history.map(rows => `${rows[1][0]}${rows[1][1]}`).join(' ');
    return `${header}\n${topRow}\n${botRow}`;
  },[puzzle.date, puzzle.difficulty]);

  const handleShare = useCallback(()=>{
    const text = buildShareText(guessHistory);
    // Try modern clipboard API first, then fall back to execCommand
    const doCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(()=>setCopied(false), 2000);
      } catch{
        // clipboard fallback failed
      }
    };
    if(navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(()=>{
        setCopied(true);
        setTimeout(()=>setCopied(false), 2000);
      }).catch(doCopy);
    } else {
      doCopy();
    }
  },[guessHistory,buildShareText]);

  // Derive which slots are currently repeating a known-bad placement
  const badKey = (s) => s ? `${s.cardId}:${s.orientation}` : null;
  const repeatedBad = useMemo(()=>{
    const rb = new Set();
    for(let i=0;i<4;i++){
      if(locked.has(i)) continue;
      const s=slots[i];
      if(!s) continue;
      const kb=knownBad.get(i);
      if(kb && kb.has(badKey(s))) rb.add(i);
    }
    return rb;
  },[slots,locked,knownBad]);

  const slotRefs = useRef({});
  const dragRef  = useRef(null);
  const wTimer   = useRef(null);

  // Fade out then clear feedback text
  const fadeFeedback = useCallback(()=>{
    setFbFading(true);
    setTimeout(()=>{ setFeedback(""); setFbFading(false); }, 500);
  },[]);

  const [showRepeatWarning, setShowRepeatWarning] = useState(false);
  const repeatWarnTimer = useRef(null);
  useEffect(()=>{
    if(tutorialActive || admireMode || alreadySolved || solved){
      removeLS(progressKey);
      return;
    }
    if(isDragging || revealPhase || rotateAnimating) return;
    saveLS(progressKey, {
      puzzleId: puzzle.id,
      totalSlots,
      slots,
      clues,
      locked: [...locked],
      wrong: [...wrong],
      knownBad: [...knownBad.entries()].map(([k,v])=>[k, [...v]]),
      lives,
      guessHistory,
      lost,
      solved,
    });
  },[
    tutorialActive, admireMode, alreadySolved, solved, isDragging, revealPhase, rotateAnimating,
    progressKey, puzzle.id, totalSlots, slots, clues, locked, wrong, knownBad,
    lives, guessHistory, lost
  ]);

  // Fade the warning out when all red cards are moved
  useEffect(()=>{
    if(repeatedBad.size === 0 && showRepeatWarning){
      clearTimeout(repeatWarnTimer.current);
      repeatWarnTimer.current = setTimeout(()=>setShowRepeatWarning(false), 500);
      setTimeout(()=>setFbFading(true), 0);
      setTimeout(()=>setFbFading(false), 500);
    }
  },[repeatedBad.size, showRepeatWarning]);

  const getSlotAt = useCallback((x,y,exc)=>{
    for(let i=0;i<totalSlots;i++){
      if(i===exc||locked.has(i)) continue;
      const el=slotRefs.current[i]; if(!el) continue;
      const r=el.getBoundingClientRect();
      if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return i;
    }
    return -1;
  },[totalSlots,locked]);

  const handlePD = useCallback((e,si)=>{
    if(locked.has(si) || lost || tutorialComplete) return;
    if(tutorialActive && tutorialStepIndex === 0){
      return;
    }
    if(tutorialActive && tutorialReadyForNext){
      return;
    }
    const s=slots[si]; if(!s) return;
    const card=puzzle.cards[s.cardId]; if(!card) return;
    const tutorialCanTap = !tutorialActive || tutorialAllowTapSlots.includes(si);
    const tutorialCanDragFrom = !tutorialActive || tutorialAllowDragPairs.some(([a,b])=>a===si || b===si);
    if(tutorialActive && !tutorialCanTap && !tutorialCanDragFrom){
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const el=slotRefs.current[si];
    const sz=el?el.getBoundingClientRect().width:100;
    const cx=e.clientX,cy=e.clientY;
    dragRef.current={src:si,x0:cx,y0:cy,moved:false};
    setDragSrc(si);
    // Ghost is NOT shown yet — only created once we confirm it's a drag, not a tap
    const onMove=ev=>{
      ev.preventDefault();
      const dx=ev.clientX-dragRef.current.x0, dy=ev.clientY-dragRef.current.y0;
      if(!dragRef.current.moved && Math.sqrt(dx*dx+dy*dy)>8){
        if(tutorialActive && !tutorialCanDragFrom){
          return;
        }
        dragRef.current.moved=true;
        setIsDragging(true);
        if(SHOW_DRAG_GHOST){
          setGhost({x:ev.clientX,y:ev.clientY,card,orientation:s.orientation,sz});
        }
      }
      if(dragRef.current.moved){
        if(SHOW_DRAG_GHOST){
          setGhost(g=>g?{...g,x:ev.clientX,y:ev.clientY}:null);
        }
        const hoverTarget = getSlotAt(ev.clientX,ev.clientY,si);
        setDragOver(tutorialActive && hoverTarget >= 0 && !tutorialPairAllowed(si, hoverTarget) ? -1 : hoverTarget);
      }
    };
    const onUp=ev=>{
      document.removeEventListener("pointermove",onMove);
      document.removeEventListener("pointerup",onUp);
      const dr=dragRef.current; dragRef.current=null;
      setGhost(null); setDragSrc(null); setIsDragging(false); setDragOver(null);
      if(!dr) return;
      if(!dr.moved){
        // Pure tap — rotate in place, no ghost was ever shown
        if(tutorialActive && !tutorialCanTap){
          return;
        }
        if(tutorialActive && tutorialStepIndex === 3){
          setWrong(prev=>{const next=new Set(prev);next.delete(si);return next;});
        }
        setSlots(p=>{const n=[...p];n[si]={...n[si],orientation:(n[si].orientation+1)%4};return n;});
      } else {
        const tgt=getSlotAt(ev.clientX,ev.clientY,si);
        if(tgt>=0 && (!tutorialActive || tutorialPairAllowed(si, tgt))){
          setSlots(p=>{const n=[...p];[n[si],n[tgt]]=[n[tgt],n[si]];return n;});
          setWrong(p=>{const s=new Set(p);s.delete(si);s.delete(tgt);return s;});
          setSwapPopping(new Set([si,tgt]));
          if(swapPopTimer.current) clearTimeout(swapPopTimer.current);
          swapPopTimer.current = setTimeout(()=>setSwapPopping(new Set()), 190);
        }
      }
    };
    document.addEventListener("pointermove",onMove,{passive:false});
    document.addEventListener("pointerup",onUp);
  },[
    slots, locked, lost, puzzle, getSlotAt, tutorialActive, tutorialAllowTapSlots,
    tutorialAllowDragPairs, tutorialPairAllowed, tutorialStepIndex, tutorialComplete, tutorialReadyForNext
  ]);

  const handleRotate = useCallback(()=>{
    if(tutorialActive) return;
    if(rotateAnimating) return;
    setRotateAnimating(true);
    if(rotateTimer.current) clearTimeout(rotateTimer.current);
    rotateTimer.current = setTimeout(()=>{
      setSlots(p=>{
        const nc=CW_FROM.map(f=>{const s=p[f];return s?{...s,orientation:(s.orientation+1)%4}:null;});
        return [...nc,...p.slice(4)];
      });
      setClues(p=>CW_FROM.map(i=>p[i]));
      setLocked(p=>{const n=new Set();p.forEach(i=>{n.add(i<4?CW_FROM.indexOf(i):i);});return n;});
      setWrong(new Set());
      setRotateAnimating(false);
    }, 240);
  },[rotateAnimating, tutorialActive]);

  const prevDifficultyRef = useRef(puzzle.difficulty);

  // When difficulty is downgraded mid-game, remove extra non-solution cards and reshuffle
  useEffect(()=>{
    const prev = prevDifficultyRef.current;
    const cur  = puzzle.difficulty;
    prevDifficultyRef.current = cur;

    const prevExtra = DIFFICULTY_EXTRA[prev]??0;
    const curExtra  = DIFFICULTY_EXTRA[cur]??0;
    if(curExtra >= prevExtra) return; // not a downgrade, do nothing

    const solutionIds = new Set(puzzle.solution.slotCards);
    const toRemove = prevExtra - curExtra;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots(p=>{
      let n=[...p];

      // Remove `toRemove` non-solution cards, searching from the end
      let removed = 0;
      for(let i=n.length-1; i>=0 && removed<toRemove; i--){
        if(n[i] && !solutionIds.has(n[i].cardId)){
          n.splice(i,1);
          removed++;
        }
      }

      // Reshuffle all non-locked slots across the whole remaining array
      const free = n.map((_,i)=>i).filter(i=>!locked.has(i));
      const vals = shuffleArr(free.map(i=>n[i]));
      free.forEach((idx,j)=>{ n[idx]={...vals[j], orientation:Math.floor(Math.random()*4)}; });

      return n;
    });

    setWrong(new Set());
    setKnownBad(new Map());
    setFeedback("Difficulty lowered — board reshuffled.");
    setTimeout(()=>fadeFeedback(), 2500);
  },[puzzle.difficulty, puzzle.solution.slotCards, locked, fadeFeedback]);

  const handleShuffle = useCallback(()=>{
    if(tutorialActive) return;
    const free=Array.from({length:totalSlots},(_,i)=>i).filter(i=>!locked.has(i));
    if(free.length<2) return;
    setSpinning(new Set(free));
    setTimeout(()=>{
      setSlots(p=>{
        const n=[...p];
        // Shuffle positions
        const vals=shuffleArr(free.map(i=>n[i]));
        // Randomise orientations too
        free.forEach((i,j)=>n[i]={...vals[j], orientation:Math.floor(Math.random()*4)});
        return n;
      });
      setWrong(new Set()); setSpinning(new Set());
    },440);
  },[totalSlots,locked,tutorialActive]);

  const handleReset = useCallback(()=>{
    if(tutorialActive) return;
    setSlots(initSlots()); setClues([...puzzle.clues]);
    setLocked(new Set()); setWrong(new Set()); setKnownBad(new Map());
    setRevealPhase(null); setRevealColors({}); setShowParticles(false); setFlipReveal({});
    setFeedback(""); setSolved(false); setLost(false);
    setLives(MAX_LIVES); setGuessHistory([]);
    setShowOvr(false); setCopied(false);
    onReset?.();
  },[initSlots,puzzle,onReset,tutorialActive]);

  const handleSubmit = useCallback(()=>{
    if(tutorialActive){
      if(tutorialStepIndex !== 3 || tutorialComplete) return;
      const res=bestSubmit(slots.slice(0,4),puzzle.solution,locked,clues,puzzle.clues);
      const nextLocked = new Set([...locked, ...res.correct]);
      setKnownBad(prev=>{
        const next=new Map(prev);
        res.wrong.forEach(si=>{
          const s=slots[si]; if(!s) return;
          const k=badKey(s);
          if(!next.has(si)) next.set(si,new Set());
          next.get(si).add(k);
        });
        return next;
      });
      setLocked(nextLocked);
      setWrong(res.wrong);
      if(res.correct.size===4){
        setLocked(new Set([0,1,2,3]));
        setTutorialComplete(true);
        setTutorialReadyForNext(false);
        setTutorialStepIndex(Math.max(0, tutorialSteps.length - 1));
        setFeedback(TUTORIAL_FINAL_SUCCESS);
      } else {
        setFeedback("Not quite. Adjust the red cards and tap Submit again.");
      }
      return;
    }
    if(solved || lost || revealPhase) return;
    if(repeatedBad.size > 0){ setShowRepeatWarning(true); return; }
    onGameStart?.();
    const res=bestSubmit(slots.slice(0,4),puzzle.solution,locked,clues,puzzle.clues);
    const isWin = res.correct.size===4;

    // Build 2x2 emoji grid: slots 0=TL,1=TR,3=BL,2=BR (board grid order)
    const e = (si) => (locked.has(si) || res.correct.has(si)) ? '🔮' : '⬛';
    const guessRow = [
      [e(0), e(1)],
      [e(3), e(2)],
    ];

    // Phase 1: all unlocked cards go grey + shake together
    setRevealPhase('grey');
    setRevealColors({});

    setTimeout(()=>{
      setRevealPhase('revealing');
      const allSlots = [0,1,2,3].filter(i=>!locked.has(i));
      const colors = {};
      allSlots.forEach((si,idx)=>{
        setTimeout(()=>{
          colors[si] = res.correct.has(si) ? 'green' : 'red';
          setRevealColors({...colors});
          if(idx===allSlots.length-1){
            setTimeout(()=>{
              setRevealPhase('done');
              if(isWin){
                const livesLeft = lives; // lives haven't been decremented on a win
                const livesUsed = MAX_LIVES - livesLeft;
                const finalHistory = [...guessHistory, guessRow];
                setGuessHistory(finalHistory);
                setLocked(new Set([0,1,2,3])); setWrong(new Set());
                setSolved(true);
                setStats(updateStats(true, livesUsed, difficulty));
                // Set an encouraging message based on lives remaining
                if(livesLeft === MAX_LIVES)      setFeedback("Perfect solve — not a life lost! ✨");
                else if(livesLeft === MAX_LIVES-1) setFeedback(`Solved with ${livesLeft} ${livesLeft===1?"life":"lives"} to spare! 🔮`);
                else if(livesLeft === 1)          setFeedback("Barely — but the crystal revealed all! 💫");
                else                             setFeedback("The mists part — well done! 💫");
                playVictorySound();
                setShowParticles(true);
                setTimeout(()=>setShowOvr(true), 900);
                setTimeout(()=>setShowParticles(false), 5000);
                onSolved?.(puzzle.id, { livesUsed, difficulty });
              } else {
                // record bad placements
                setKnownBad(prev=>{
                  const next=new Map(prev);
                  res.wrong.forEach(si=>{
                    const s=slots[si]; if(!s) return;
                    const k=badKey(s);
                    if(!next.has(si)) next.set(si,new Set());
                    next.get(si).add(k);
                  });
                  return next;
                });
                const newLives = lives - 1;
                const newHistory = [...guessHistory, guessRow];
                setGuessHistory(newHistory);
                setShakeKey(k=>k+1);
                const nl=new Set([...locked,...res.correct]);
                setLocked(nl); setWrong(res.wrong);
                setLives(newLives);
                playWrongSound();

                if(newLives<=0){
                  if(wTimer.current) clearTimeout(wTimer.current);
                  wTimer.current=setTimeout(()=>{
                    setWrong(new Set());
                    setRevealPhase(null);
                    setRevealColors({});
                    setFeedback("Revealing the vision...");

                    const unlockedSlots=[0,1,3,2].filter(i=>!nl.has(i));
                    const FLIP_DOWN=180, FLIP_UP=200, STAGGER=1220;

                    // Play a soft thud sound
                    const playThud = (i) => {
                      try {
                        const ctx=new(window.AudioContext||window.webkitAudioContext)();
                        const osc=ctx.createOscillator(), gain=ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.type='sine'; osc.frequency.value=180-i*12;
                        const t=ctx.currentTime;
                        gain.gain.setValueAtTime(0,t);
                        gain.gain.linearRampToValueAtTime(0.12,t+0.02);
                        gain.gain.exponentialRampToValueAtTime(0.001,t+0.18);
                        osc.start(t); osc.stop(t+0.2);
                      } catch{
                        // audio not available
                      }
                    };

                    // Reset clues to original orientation so board matches solution
                    setClues([...puzzle.clues]);

                    // Snap ALL solution cards into place upfront (hidden before flips start)
                    const solutionSlotCards = puzzle.solution.slotCards;
                    const solutionOrientations = puzzle.solution.orientations;

                    unlockedSlots.forEach((si,idx)=>{
                      const delay=idx*STAGGER;

                      // 1. Flip down
                      setTimeout(()=>{
                        setFlipReveal(p=>({...p,[si]:'down'}));
                      }, delay);

                      // 2. Mid-flip: place the correct solution card for this slot
                      setTimeout(()=>{
                        setSlots(p=>{
                          const n=[...p];
                          const cardId=solutionSlotCards[si];
                          const orientation=solutionOrientations[si];
                          // Find where this card currently is and swap it to slot si
                          const cur=n.findIndex(s=>s?.cardId===cardId);
                          if(cur>=0 && cur!==si){ [n[si],n[cur]]=[n[cur],n[si]]; }
                          // Set correct orientation
                          n[si]={cardId, orientation};
                          return n;
                        });
                        setLocked(prev=>new Set([...prev,si]));
                        playThud(idx);
                      }, delay+FLIP_DOWN);

                      // 3. Flip up revealing green
                      setTimeout(()=>{
                        setFlipReveal(p=>({...p,[si]:'up'}));
                      }, delay+FLIP_DOWN+20);

                      // 4. Clean up flip class
                      setTimeout(()=>{
                        setFlipReveal(p=>{const n={...p};delete n[si];return n;});
                      }, delay+FLIP_DOWN+FLIP_UP+60);

                      // 5. After last card, show overlay
                      if(idx===unlockedSlots.length-1){
                        setTimeout(()=>{
                          setStats(updateStats(false, MAX_LIVES, difficulty));
                          setLost(true);
                          setFeedback("");
                          setTimeout(()=>setShowOvr(true),700);
                        }, delay+FLIP_DOWN+FLIP_UP+200);
                      }
                    });

                    if(unlockedSlots.length===0){
                      setStats(updateStats(false, MAX_LIVES, difficulty));
                      setLost(true);
                      setTimeout(()=>setShowOvr(true),500);
                    }
                  }, 1400);
                } else {
                  const gained=res.correct.size-locked.size;
                  if(gained>0)       setFeedback(`${gained} confirmed! ${newLives} ${newLives===1?"life":"lives"} left.`);
                  else               setFeedback(`Not quite — ${newLives} ${newLives===1?"life":"lives"} remaining.`);
                  if(wTimer.current) clearTimeout(wTimer.current);
                  wTimer.current=setTimeout(()=>{
                    setWrong(new Set());
                    setRevealPhase(null);
                    setRevealColors({});
                    fadeFeedback();
                  },4000);
                }
              }
            }, isWin ? 500 : 200);
          }
        }, idx * 160);
      });
    }, 480);
  },[solved,lost,slots,puzzle,locked,repeatedBad,revealPhase,lives,guessHistory,clues,playVictorySound,playWrongSound,difficulty,onSolved,fadeFeedback,onGameStart,tutorialActive]);

  const renderSlot = useCallback(si=>{
    const s=slots[si];
    const card=s?puzzle.cards[s.cardId]:null;
    const isRepeatBad = repeatedBad.has(si);
    const isWrong = wrong.has(si);
    const isLocked = locked.has(si);
    const inReveal = !isLocked && (revealPhase==='grey'||revealPhase==='revealing');
    const revealColor = revealColors[si];
    const isRevealGrey = inReveal && !revealColor;
    const isRevealGreen = inReveal && revealColor==='green';
    const isRevealRed = inReveal && revealColor==='red';
    const flipPhase = flipReveal[si]; // 'down' | 'up' | undefined
    const tutorialExpected = tutorialActive && tutorialHighlightedSlots.includes(si);
    const tutorialDim = tutorialActive && !tutorialComplete && !isLocked && tutorialHighlightedSlots.length > 0 && !tutorialHighlightedSlots.includes(si);

    let extraCls = '';
    if(isRevealGrey)  extraCls=' reveal-grey reveal-shaking';
    if(isRevealGreen) extraCls=' flipping';
    if(isRevealRed)   extraCls=' flipping';
    if(flipPhase==='down') extraCls=' flip-down';
    if(flipPhase==='up')   extraCls=' flip-up';
    const rotateMoveClass = rotateAnimating
      ? ({0:' rotate-move-right',1:' rotate-move-down',2:' rotate-move-left',3:' rotate-move-up'}[si] || '')
      : '';

    return (
      <div key={si} ref={el=>slotRefs.current[si]=el}
        className={`cslot${tutorialActive?" tut-slot":""}${tutorialExpected?" expected":""}${tutorialDim?" dim":""}${dragOver===si?" over":""}${isDragging && dragSrc===si?" source":""}${!card?" empty":""}`}>
        {card&&<CardTile
          key={isWrong ? `${si}-shake-${shakeKey}` : si}
          card={card} orientation={s.orientation}
          locked={isLocked || isRevealGreen}
          wrong={isWrong || isRevealRed}
          repeatBad={!inReveal && isRepeatBad}
          shaking={isWrong}
          extraCls={extraCls}
          dim={isDragging && dragSrc===si} spinning={spinning.has(si)}
          popping={swapPopping.has(si)}
          rotateMoveClass={rotateMoveClass}
          rotateSpin={rotateAnimating && si < 4}
          spinDir={si%2===0?1:-1}
          onPointerDown={e=>handlePD(e,si)}/>}
      </div>
    );
  },[
    slots,puzzle,locked,wrong,repeatedBad,shakeKey,revealPhase,revealColors,flipReveal,
    isDragging,dragSrc,spinning,swapPopping,rotateAnimating,dragOver,handlePD,
    tutorialActive,tutorialHighlightedSlots,tutorialComplete
  ]);

  // Victory particles — leprechaun coins and rainbows
  const renderTutorialClue = useCallback((index, pos)=>{
    const highlighted = tutorialHighlightedClues.includes(index);
    const dimmed = tutorialActive && !tutorialComplete && tutorialHighlightedClues.length > 0 && !highlighted;
    const cls = `tut-clue-shell${highlighted ? " on" : ""}${dimmed ? " dim" : ""}`;
    if(index === 0){
      return (
        <div className={cls} style={{transform:"translateY(18px)"}}>
          <CloudH text={clues[index] || ""} artOpacity={1} textShiftX={10} textShiftY={-14} />
        </div>
      );
    }
    if(index === 2){
      return (
        <div className={cls} style={{position:"relative", zIndex:7, transform:"translateY(28px)"}}>
          <CloudH text={clues[index] || ""} artOpacity={1} artTranslateY={-14} textShiftX={10} textShiftY={-24} />
        </div>
      );
    }
    return (
      <div className={cls} style={{transform: pos === "lft" ? "translateX(14px)" : "translateX(-2px)"}}>
        <CloudV
          text={clues[index] || ""}
          rotation={pos === "rgt" ? 90 : -90}
          textRotation={pos === "rgt" ? 90 : -90}
          artOpacity={1}
        />
      </div>
    );
  },[clues, tutorialActive, tutorialComplete, tutorialHighlightedClues]);

  const particles = useMemo(()=>showParticles ? Array.from({length:28},(_,i)=>({
    id:i,
    emoji: CELEBRATION_PARTICLES[i % CELEBRATION_PARTICLES.length],
    left: seeded01(i + 1) * 100,
    delay: seeded01(i + 101) * 1.8,
    dur: 2.2 + seeded01(i + 201) * 1.6,
    size: 84 + Math.floor(seeded01(i + 301) * 72),
  })) : [], [showParticles]);

  const puzzleDate = new Date(puzzle.date + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const diffLabel = DIFFICULTY_LABELS[difficulty] || difficulty;
  const isRevealing = !!revealPhase;
  const gameOver = tutorialActive ? tutorialComplete : solved || lost;
  const tutorialMessage = tutorialComplete
    ? TUTORIAL_FINAL_SUCCESS
    : feedback || tutorialStep?.body || "";

  return (<>
    {showParticles && (
      <div className="particles">
        {particles.map(p=>(
          <div key={p.id} className="particle" style={{
            left:`${p.left}%`,
            fontSize:`${p.size}px`,
            animationDuration:`${p.dur}s`,
            animationDelay:`${p.delay}s`,
          }}>{p.emoji}</div>
        ))}
      </div>
    )}
      <div className="game">
      {tutorialActive ? (
          <div className="tutorial-copy-wrap">
            <div className="tut-title" style={{fontSize:22, marginBottom:8}}>{tutorialStep?.title || "Practice Board"}</div>
            <div className="tut-msg" style={{marginTop:0, marginBottom:10, minHeight:0}}>
              {renderTutorialCopy(tutorialMessage)}
            </div>
          </div>
      ) : (
      <div className="sbar">
        <span className="sdate">{puzzleDate}</span>
        {puzzle.author && <>
          <span style={{color:"var(--muted)"}}>·</span>
          <span style={{fontSize:14,color:"var(--muted)",fontWeight:600}}>by {puzzle.author}</span>
        </>}
        <span style={{color:"var(--muted)"}}>·</span>
        <span className="dchip">{diffLabel}</span>
        <span style={{flex:1}}/>
        <div className="lives">
          {Array.from({length:MAX_LIVES},(_,i)=>(
            <span
              key={i}
              className={`life${i>=lives?" lost":""}`}
              style={{flex:"0 0 auto"}}
            >
              <img
                className="life-img"
                src={STAR_LIFE_ASSET}
                alt=""
                aria-hidden="true"
                style={{display:"block", width:"100%", height:"100%", maxWidth:"24px", maxHeight:"24px", objectFit:"contain"}}
              />
            </span>
          ))}
        </div>
      </div>)}
      <div ref={playFitOuterRef} className="play-fit-outer">
        <div ref={playFitInnerRef} className={`play-fit-inner${tutorialActive ? " tutorial-layout" : ""}`} style={playAreaStyle}>
          <Board
            clues={clues}
            renderSlot={renderSlot}
            renderClue={tutorialActive ? renderTutorialClue : undefined}
            compactLevel={compactLevel}
            cluesRotating={rotateAnimating}
          />
          <div className={tutorialActive ? "tutorial-controls-wrap" : ""} style={tutorialActive ? undefined : {marginTop:compactLevel >= 2 ? 28 : compactLevel === 1 ? 38 : 52,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:compactLevel >= 2 ? 4 : 6,padding:"0 10px"}}>
            {tutorialActive ? (
              <>
                <div className="tut-nav">
                  {(tutorialReadyForNext && !tutorialComplete) || (tutorialStepIndex === 3 && !tutorialComplete) ? (
                    <div className="tut-next-row">
                      {tutorialStepIndex === 3 && !tutorialComplete ? (
                        <div className="sbtn-wrap">
                          <button className="sbtn" onClick={handleSubmit}>
                            Submit
                          </button>
                        </div>
                      ) : (
                        <button className="abtn p" onClick={handleTutorialNext}>Next</button>
                      )}
                    </div>
                  ) : null}
                  <div className={`tut-footer-bar${tutorialComplete ? " done" : ""}`}>
                    <div className={`tut-dots${tutorialComplete ? " done" : ""}`}>
                      {tutorialSteps.map((_, i)=><span key={i} className={`tut-dot${i===tutorialStepIndex ? " on" : ""}`} />)}
                    </div>
                    <div className={`tut-actions${tutorialComplete ? " done" : ""}`}>
                      {!tutorialComplete && <button className="abtn s sm" onClick={onTutorialClose}>Skip</button>}
                      {tutorialComplete && (
                        <button className="abtn p sm" onClick={onTutorialClose}>Start Playing</button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="extra">
        {numExtra>0 ? (
          <>
            <span className="elabel">Extra cards</span>
            <div className="eslots">
              {Array.from({length:numExtra},(_,i)=>{
                const si=4+i,s=slots[si],card=s?puzzle.cards[s.cardId]:null;
                return (
                  <div key={si} ref={el=>slotRefs.current[si]=el}
                    className={`eslot${dragOver===si?" over":""}${isDragging && dragSrc===si?" source":""}`}>
                    {card&&<CardTile card={card} orientation={s.orientation}
                      locked={locked.has(si)} wrong={wrong.has(si)}
                      dim={isDragging && dragSrc===si} spinning={spinning.has(si)}
                      popping={swapPopping.has(si)}
                      spinDir={i%2===0?1:-1}
                      onPointerDown={e=>handlePD(e,si)}/>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="extra-spacer" />
        )}
      </div>
      <div className="ctrls">
        <button className="cbtn" onClick={handleRotate}>
          <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.8 1 6.46 2.54L21 8"/><path d="M21 3v5h-5"/></svg>
          Rotate
        </button>
        <button className="cbtn" onClick={handleShuffle}>
          <svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
          Shuffle
        </button>
        <button className="cbtn" onClick={handleReset}>
          <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Reset
        </button>
      </div>
      <div className={`fbk${feedbackFading?" fading":""}${showRepeatWarning?" err":wrong.size>0?" err":locked.size>0&&!lost?" ok":""}`}>
        {showRepeatWarning ? "You already know that's wrong — move the incorrect card(s) first." : feedback}
      </div>
      <div className="sbtn-wrap">
        <button
          className={`sbtn${solved?" solved":""}${lost?" blocked":""}${repeatedBad.size>0?" blocked":""}`}
          onClick={handleSubmit}
          disabled={gameOver || isRevealing}
        >
          {solved ? "✓ Solved!" : lost ? "No lives left" : admireMode ? "Gazing 🔮" : "Submit"}
        </button>
      </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    <DragGhost ghost={ghost}/>
    {showOvr&&(
      <StatsOverlay
        lost={lost} livesUsed={lost ? MAX_LIVES : (MAX_LIVES - lives)} stats={stats}
        difficulty={difficulty}
        onClose={()=>setShowOvr(false)}
        onShare={handleShare}
        copied={copied}
      />
    )}
  </>);
}

// ═══════════════════════════════════════════════════════════════
//  EDITABLE CLUE TAB (admin)
// ═══════════════════════════════════════════════════════════════

function EditableClueTab({ text, pos, onChange }) {
  const [editing,setEditing] = useState(false);
  const [val,setVal]         = useState(text || "");
  const commit = () => { setEditing(false); onChange(val.trim().toUpperCase()||""); };
  return editing ? (
    <input className={`ctab editing ${pos}`} value={val}
      onChange={e=>setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setVal(text);setEditing(false);}}}
      autoFocus/>
  ) : (
    <div className={`ctab ${pos} editable`} onClick={()=>{setVal(text || "");setEditing(true);}}>
      {text||<span className="ctab-ph">+ clue</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD EDITOR PANEL (admin — visual cross layout)
// ═══════════════════════════════════════════════════════════════

function CardEditorPanel({ card, orientation, slotIdx, onWordChange, onRotate,
                           onMoveToExtras, onMoveToSolution, onDelete, onClose, onPrev, onNext, wordBank, isInClover }) {
  const words = card?.words || ["","","",""];
  const EDGE_LABELS = ["Top","Right","Bottom","Left"];
  const [wbQuery, setWbQuery] = useState("");
  const [wbOpen, setWbOpen]   = useState(true);
  const [quickFill, setQuickFill] = useState("");
  const inputRefs = useRef([]);

  const focusField = (wi) => {
    const el = inputRefs.current[wi];
    if(!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select();
    });
  };

  useEffect(()=>{
    const firstEmpty = words.findIndex(w=>!w?.trim());
    focusField(firstEmpty >= 0 ? firstEmpty : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[card?.id]);

  const parseWordTokens = (text) =>
    (text || "")
      .toUpperCase()
      .split(/[\n,\t|;]+/)
      .map(s=>s.trim())
      .filter(Boolean);

  const applyTokensFrom = (startIdx, tokens=[]) => {
    if(!tokens.length) return;
    for(let i=0;i<Math.min(tokens.length,4);i++){
      onWordChange((startIdx + i) % 4, tokens[i]);
    }
  };

  const applyQuickFill = () => {
    const tokens = parseWordTokens(quickFill);
    if(tokens.length < 4) return;
    applyTokensFrom(0, tokens.slice(0,4));
    setQuickFill("");
    focusField(0);
  };

  const fillFromBank = word => {
    const fi = words.findIndex(w=>!w.trim());
    if(fi>=0){
      onWordChange(fi, word);
      focusField((fi+1)%4);
      return;
    }
    onWordChange(0, word);
    focusField(1);
  };

  const handleWordKeyDown = (wi, e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      focusField((wi + 1) % 4);
    }
  };

  const handleWordPaste = (wi, e) => {
    const text = e.clipboardData?.getData("text") || "";
    const tokens = parseWordTokens(text);
    if(tokens.length < 2) return;
    e.preventDefault();
    applyTokensFrom(wi, tokens);
    focusField((wi + Math.min(tokens.length, 4)) % 4);
  };

  const sortedBank = [...wordBank].sort((a,b)=>a.localeCompare(b));
  const filteredBank = wbQuery.trim()
    ? sortedBank.filter(w=>w.includes(wbQuery.trim().toUpperCase()))
    : sortedBank;

  return (
    <div className="ced">
      <div className="ced-hdr">
        <span className="ced-title">
          {isInClover ? `Editing: ${SLOT_LABELS[slotIdx]} card` : "Editing: Extra card"}
        </span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button className="abtn s sm" onClick={onPrev} title="Previous card">← Prev</button>
          <button className="abtn s sm" onClick={onNext} title="Next card">Next →</button>
          <button className="ced-close" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Visual cross layout */}
      <div className="ced-cross">
        {/* Top input */}
        <div data-a="top" style={{width:"100%"}}>
          <input className="ced-fi" value={words[0]}
            onChange={e=>onWordChange(0,e.target.value)}
            onKeyDown={e=>handleWordKeyDown(0,e)}
            onPaste={e=>handleWordPaste(0,e)}
            ref={el=>{inputRefs.current[0]=el;}}
            placeholder={EDGE_LABELS[0]}/>
        </div>
        {/* Left input */}
        <div data-a="left" style={{width:"100%"}}>
          <input className="ced-fi" value={words[3]}
            onChange={e=>onWordChange(3,e.target.value)}
            onKeyDown={e=>handleWordKeyDown(3,e)}
            onPaste={e=>handleWordPaste(3,e)}
            ref={el=>{inputRefs.current[3]=el;}}
            placeholder={EDGE_LABELS[3]}/>
        </div>
        {/* Mini card preview */}
        <div data-a="preview" className="ced-pv">
          <CardTile card={card} orientation={orientation} adminMode noclick/>
        </div>
        {/* Right input */}
        <div data-a="right" style={{width:"100%"}}>
          <input className="ced-fi" value={words[1]}
            onChange={e=>onWordChange(1,e.target.value)}
            onKeyDown={e=>handleWordKeyDown(1,e)}
            onPaste={e=>handleWordPaste(1,e)}
            ref={el=>{inputRefs.current[1]=el;}}
            placeholder={EDGE_LABELS[1]}/>
        </div>
        {/* Bottom input */}
        <div data-a="bot" style={{width:"100%"}}>
          <input className="ced-fi" value={words[2]}
            onChange={e=>onWordChange(2,e.target.value)}
            onKeyDown={e=>handleWordKeyDown(2,e)}
            onPaste={e=>handleWordPaste(2,e)}
            ref={el=>{inputRefs.current[2]=el;}}
            placeholder={EDGE_LABELS[2]}/>
        </div>
      </div>

      <div className="ced-quick">
        <input
          className="ced-fi"
          value={quickFill}
          onChange={e=>setQuickFill(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); applyQuickFill(); } }}
          placeholder="Quick paste: TOP, RIGHT, BOTTOM, LEFT"
          style={{textTransform:"none",fontWeight:600}}
        />
        <button className="abtn s sm" onClick={applyQuickFill} disabled={parseWordTokens(quickFill).length < 4}>
          Apply 4
        </button>
      </div>
      <div className="ced-tip">
        Tip: paste 4 words separated by commas/new lines, or press Enter to jump to the next side.
      </div>

      {/* Rotate + actions */}
      <div className="ced-actions">
        <button className="abtn s sm" onClick={()=>onRotate(-1)} title="Rotate CCW">↶ CCW</button>
        <button className="abtn s sm" onClick={()=>onRotate(1)}  title="Rotate CW">↷ CW</button>
        {isInClover
          ? <button className="abtn s sm" onClick={onMoveToExtras}>→ Extra</button>
          : <button className="abtn s sm" onClick={onMoveToSolution}>← Board</button>
        }
        <button className="abtn d sm" onClick={onDelete}>Delete</button>
      </div>

      {/* Word bank */}
      {wordBank.length>0&&(<>
        <div className="ced-wb-label" style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
          onClick={()=>setWbOpen(o=>!o)}>
          <span>Word bank</span>
          <span style={{fontSize:13,color:"var(--muted)",fontWeight:400,letterSpacing:0}}>{wbOpen?"▲":"▼"}</span>
        </div>
        {wbOpen&&(<>
          {wordBank.length>6&&(
            <input
              className="ced-fi"
              value={wbQuery}
              onChange={e=>setWbQuery(e.target.value)}
              placeholder="Search…"
              style={{marginBottom:7,fontSize:10,padding:"4px 8px"}}
            />
          )}
          <div className="wb-chips">
            {filteredBank.length===0
              ? <span style={{fontSize:11,color:"var(--muted)"}}>No matches</span>
              : filteredBank.map(w=>(
                  <span key={w} className="wb-chip" onClick={()=>fillFromBank(w)}>{w}</span>
                ))
            }
          </div>
        </>)}
      </>)}
    </div>
  );
}

function AdminDateCalendar({ selectedDate, occupancyByDate, onSelectDate }) {
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => (selectedDate || new Date().toISOString().split("T")[0]).slice(0,7));
  const [isOpen, setIsOpen] = useState(false);

  useEffect(()=>{
    if(selectedDate?.slice(0,7) !== visibleMonthKey){
      setVisibleMonthKey(selectedDate.slice(0,7));
    }
  },[selectedDate, visibleMonthKey]);

  const [year, month] = visibleMonthKey.split("-").map(Number);
  const firstOfMonth = new Date(year, month - 1, 1, 12);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingEmpty = firstOfMonth.getDay();
  const trailingEmpty = (7 - ((leadingEmpty + daysInMonth) % 7)) % 7;
  const label = `${MONTHS_FULL[month - 1]} ${year}`;
  const today = new Date().toISOString().split("T")[0];
  const selectedOccupancy = occupancyByDate[selectedDate] || "open";

  const shiftMonth = delta => {
    const next = new Date(year, month - 1 + delta, 1, 12);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`;
    setVisibleMonthKey(nextKey);
  };

  const cells = [];
  for(let i=0;i<leadingEmpty;i++) cells.push({ kind:"empty", key:`lead-${i}` });
  for(let day=1; day<=daysInMonth; day++){
    const date = `${visibleMonthKey}-${String(day).padStart(2,"0")}`;
    const occupancy = occupancyByDate[date] || "open";
    cells.push({ kind:"day", key:date, day, date, occupancy });
  }
  for(let i=0;i<trailingEmpty;i++) cells.push({ kind:"empty", key:`trail-${i}` });

  return (
    <div className="admin-cal">
      <button type="button" className="admin-cal-toggle" onClick={()=>setIsOpen(v=>!v)}>
        <div className="admin-cal-toggle-main">
          <div className="admin-cal-toggle-label">Puzzle Date</div>
          <div className="admin-cal-toggle-date">{formatAdminDate(selectedDate)}</div>
          <div className="admin-cal-toggle-meta">
            <span className={`admin-cal-mini-chip ${selectedOccupancy}`}>{selectedOccupancy}</span>
          </div>
        </div>
        <span className="admin-cal-toggle-arrow" aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && (
        <div className="admin-cal-panel">
          <div className="admin-cal-head">
            <button type="button" className="admin-cal-nav" onClick={()=>shiftMonth(-1)} aria-label="Previous month">‹</button>
            <div className="admin-cal-title">{label}</div>
            <button type="button" className="admin-cal-nav" onClick={()=>shiftMonth(1)} aria-label="Next month">›</button>
          </div>
          <div className="admin-cal-weekdays">
            {DOW_MIN.map((label, i)=><div key={`${label}-${i}`} className="admin-cal-weekday">{label}</div>)}
          </div>
          <div className="admin-cal-grid">
            {cells.map(cell=>{
              if(cell.kind === "empty") return <div key={cell.key} className="admin-cal-empty" />;
              const isSelected = cell.date === selectedDate;
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={`admin-cal-day ${cell.occupancy}${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
                  onClick={()=>{
                    onSelectDate(cell.date);
                    setIsOpen(false);
                  }}
                  title={cell.date}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="admin-cal-legend">
            <span className="admin-cal-chip published">Published</span>
            <span className="admin-cal-chip scheduled">Scheduled</span>
            <span className="admin-cal-chip open">Open</span>
          </div>
          <div className="admin-cal-selected">Selected date: {formatAdminDate(selectedDate)}</div>
        </div>
      )}
    </div>
  );
}

function formatAdminDate(dateStr) {
  if(!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if(!year || !month || !day) return dateStr;
  return `${month}-${day}-${year}`;
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN BOARD EDITOR
// ═══════════════════════════════════════════════════════════════

function initAdminState(existing = null) {
  if(existing) {
    // Get extras in order: from solution.extraCards if available, else derive
    const extraIds = existing.solution.extraCards ||
      Object.keys(existing.cards).filter(id => !existing.solution.slotCards.includes(id)).slice(0,3);
    // Pad to exactly 3 extras
    const allExtra = [...extraIds];
    while(allExtra.length < 3) { const id=uid(); allExtra.push(id); }
    const extraSlots = allExtra.slice(0,3).map(id => ({ cardId: id, orientation: 0 }));
    // Ensure extra cards exist in cards object
    const cards = {...existing.cards};
    extraSlots.forEach(s => { if(!cards[s.cardId]) cards[s.cardId]={id:s.cardId,words:["","","",""]}; });
    return {
      id:existing.id, title:existing.title, date:existing.date,
      status:existing.status, author:existing.author||"",
      clues:[...existing.clues], cards,
      slots:[
        ...existing.solution.slotCards.map((id,i)=>({cardId:id,orientation:existing.solution.orientations[i]})),
        ...extraSlots,
      ],
    };
  }
  // New puzzle: 4 solution slots + exactly 3 extra slots
  const ids=[uid(),uid(),uid(),uid(),uid(),uid(),uid()];
  const cards={};
  ids.forEach(id=>cards[id]={id,words:["","","",""]});
  return {
    id:`${Date.now()}`, title:"", status:"draft", author:"",
    date:new Date().toISOString().split("T")[0],
    clues:["","","",""],
    cards,
    slots:ids.map(id=>({cardId:id,orientation:0})),
  };
}

function AdminBoardEditor({ initialPuzzle, wordBank, allPuzzles=[], onSave, onBack }) {
  const [admin,setAdmin]         = useState(()=>initAdminState(initialPuzzle));
  const [selectedId,setSelId]    = useState(null);
  const [inlineEdit,setInlineEdit] = useState(null);
  const [inlineDraft,setInlineDraft] = useState("");
  const [ghost,setGhost]         = useState(null);
  const [dragSrc,setDragSrc]     = useState(null);
  const [dragOver,setDragOver]   = useState(null);
  const [confirmReplace,setConfirmReplace] = useState(false);
  const slotRefs = useRef({});
  const dragRef  = useRef(null);

  // Find any existing puzzle on the same date (excluding self)
  const dateConflict = useMemo(()=>
    allPuzzles.find(p => p.date === admin.date && p.id !== admin.id) || null
  ,[allPuzzles, admin.date, admin.id]);

  const occupancyByDate = useMemo(()=>{
    const map = {};
    allPuzzles.forEach(p=>{
      if(!p?.date || p.id === admin.id) return;
      if(p.status !== "published" && p.status !== "scheduled") return;
      if(p.status === "published"){
        map[p.date] = "published";
      } else if(!map[p.date]){
        map[p.date] = "scheduled";
      }
    });
    return map;
  },[allPuzzles, admin.id]);

  const getSlotAt = useCallback((x,y,exc)=>{
    for(let i=0;i<admin.slots.length;i++){
      if(i===exc) continue;
      const el=slotRefs.current[i]; if(!el) continue;
      const r=el.getBoundingClientRect();
      if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return i;
    }
    return -1;
  },[admin.slots.length]);

  const handlePD = useCallback((e,si)=>{
    const s=admin.slots[si]; if(!s) return;
    const card=admin.cards[s.cardId]; if(!card) return;
    e.preventDefault(); e.stopPropagation();
    const el=slotRefs.current[si];
    const sz=el?el.getBoundingClientRect().width:100;
    const cx=e.clientX,cy=e.clientY;
    dragRef.current={src:si,x0:cx,y0:cy,moved:false};
    setDragSrc(si);
    if(SHOW_DRAG_GHOST){
      setGhost({x:cx,y:cy,card,orientation:s.orientation,sz});
    }
    const onMove=ev=>{
      ev.preventDefault();
      if(Math.abs(ev.clientX-dragRef.current.x0)>6||Math.abs(ev.clientY-dragRef.current.y0)>6)
        dragRef.current.moved=true;
      if(SHOW_DRAG_GHOST){
        setGhost(g=>g?{...g,x:ev.clientX,y:ev.clientY}:null);
      }
      setDragOver(getSlotAt(ev.clientX,ev.clientY,si));
    };
    const onUp=ev=>{
      document.removeEventListener("pointermove",onMove);
      document.removeEventListener("pointerup",onUp);
      const dr=dragRef.current; dragRef.current=null;
      setGhost(null); setDragSrc(null); setDragOver(null);
      if(!dr) return;
      const dx=ev.clientX-dr.x0,dy=ev.clientY-dr.y0;
      if(Math.sqrt(dx*dx+dy*dy)<8&&!dr.moved){
        // Tap → select
        setSelId(admin.slots[si]?.cardId ?? null);
      } else {
        const tgt=getSlotAt(ev.clientX,ev.clientY,si);
        if(tgt>=0){
          setAdmin(p=>{
            const ns=[...p.slots]; [ns[si],ns[tgt]]=[ns[tgt],ns[si]];
            return {...p,slots:ns};
          });
        }
      }
    };
    document.addEventListener("pointermove",onMove,{passive:false});
    document.addEventListener("pointerup",onUp);
  },[admin,getSlotAt]);

  const updateClue = (idx,val) =>
    setAdmin(p=>{const c=[...p.clues];c[idx]=val;return{...p,clues:c};});

  const updateWord = (cardId,wi,val) =>
    setAdmin(p=>({...p,cards:{...p.cards,
      [cardId]:{...p.cards[cardId],words:p.cards[cardId].words.map((w,i)=>i===wi?val.toUpperCase():w)}
    }}));

  const startInlineEdit = useCallback((cardId, wordIndex, value="")=>{
    setSelId(cardId);
    setInlineEdit({cardId, wordIndex});
    setInlineDraft(value || "");
  },[]);

  const cancelInlineEdit = useCallback(()=>{
    setInlineEdit(null);
    setInlineDraft("");
  },[]);

  const commitInlineEdit = useCallback(()=>{
    if(!inlineEdit) return;
    updateWord(inlineEdit.cardId, inlineEdit.wordIndex, inlineDraft);
    setInlineEdit(null);
    setInlineDraft("");
  },[inlineDraft, inlineEdit]);

  const rotateCard = (cardId,delta) =>
    setAdmin(p=>({...p,slots:p.slots.map(s=>
      s.cardId===cardId?{...s,orientation:(s.orientation+delta+4)%4}:s
    )}));

  const moveToExtras = cardId => {
    // Swap solution slot with an extra slot (or just move to end)
    setAdmin(p=>{
      const si=p.slots.findIndex(s=>s.cardId===cardId);
      if(si<0||si>=4) return p;
      const ns=[...p.slots];
      // Rotate the found slot to the end
      const removed=ns.splice(si,1)[0];
      ns.push(removed);
      return {...p,slots:ns};
    });
  };

  const moveToSolution = cardId => {
    // Find the first solution slot that's conceptually empty or swap with it
    setAdmin(p=>{
      const si=p.slots.findIndex(s=>s.cardId===cardId);
      if(si<0||si<4) return p;
      // Move to end of solution slots (slot index 3) by swapping
      const ns=[...p.slots];
      const removed=ns.splice(si,1)[0];
      ns.splice(3,0,removed); // insert before position 4
      return {...p,slots:ns};
    });
  };

  const deleteCard = cardId => {
    setAdmin(p=>({
      ...p,
      slots:p.slots.filter(s=>s.cardId!==cardId),
      cards:Object.fromEntries(Object.entries(p.cards).filter(([id])=>id!==cardId)),
    }));
    setSelId(null);
  };

  const dealRandomCards = () => {
    // Need 7 cards × 4 words each = 28 words minimum; fall back to repeating bank if small
    const bank = [...wordBank];
    if(bank.length < 4) return; // not enough words to do anything useful

    // Shuffle the bank
    for(let i=bank.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[bank[i],bank[j]]=[bank[j],bank[i]];
    }

    // Build a pool that repeats the bank if needed to fill 28 words
    const pool = [];
    while(pool.length < 28) pool.push(...bank);
    // Shuffle the pool
    for(let i=pool.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];
    }

    // Create 7 cards: 4 solution + 3 extra
    const TOTAL = 7;
    const newCards = {};
    const newSlots = [];
    for(let c=0;c<TOTAL;c++){
      const id = uid();
      const words = [
        pool[c*4]   || '',
        pool[c*4+1] || '',
        pool[c*4+2] || '',
        pool[c*4+3] || '',
      ].map(w=>w.toUpperCase());
      newCards[id] = { id, words };
      newSlots.push({ cardId:id, orientation: Math.floor(Math.random()*4) });
    }

    setAdmin(p=>({
      ...p,
      cards: newCards,
      slots: newSlots,
      // Clear clues so creator fills them in fresh
      clues: ['','','',''],
    }));
    setSelId(newSlots[0]?.cardId || null);
  };

  const handleSave = (status) => {
    const { id,title,date,author,clues,cards,slots } = admin;
    const puzzle = {
      id, title:title||"Untitled", date,
      author:author?.trim()||"",
      clues:clues.map(c=>c||"?"),
      cards,
      solution:{
        slotCards:slots.slice(0,4).map(s=>s.cardId),
        orientations:slots.slice(0,4).map(s=>s.orientation),
        extraCards:slots.slice(4,7).map(s=>s.cardId), // always exactly 3
      },
      status,
    };
    if(dateConflict && !confirmReplace && status !== "draft"){
      setConfirmReplace(true);
      return;
    }
    onSave(puzzle, dateConflict && !["draft"].includes(status) ? dateConflict : null);
    setConfirmReplace(false);
  };

  // Find selected card info
  const selSlotIdx = selectedId ? admin.slots.findIndex(s=>s.cardId===selectedId) : -1;
  const selCard    = selectedId ? admin.cards[selectedId] : null;
  const selOrient  = selSlotIdx>=0 ? admin.slots[selSlotIdx].orientation : 0;
  const selInClover = selSlotIdx>=0 && selSlotIdx<4;
  const slotCardIds = admin.slots.map(s=>s.cardId);
  const selectAdjacentCard = useCallback((delta)=>{
    if(slotCardIds.length===0) return;
    const curIdx = selectedId ? slotCardIds.indexOf(selectedId) : 0;
    const baseIdx = curIdx >= 0 ? curIdx : 0;
    const nextIdx = (baseIdx + delta + slotCardIds.length) % slotCardIds.length;
    setSelId(slotCardIds[nextIdx]);
  },[slotCardIds, selectedId]);
  const selectPrevCard = useCallback(()=>selectAdjacentCard(-1),[selectAdjacentCard]);
  const selectNextCard = useCallback(()=>selectAdjacentCard(1),[selectAdjacentCard]);

  const validation = useMemo(()=>{
    const clueCount = admin.clues.filter(c=>c?.trim()).length;
    const missingClues = Math.max(0, 4 - clueCount);
    const activeSlots = admin.slots.slice(0,7);
    let blankEdges = 0;
    const seen = new Set();
    const duplicates = new Set();
    activeSlots.forEach(s=>{
      const words = admin.cards[s.cardId]?.words || [];
      words.forEach((w)=>{
        const v = (w || "").trim().toUpperCase();
        if(!v){
          blankEdges += 1;
          return;
        }
        if(seen.has(v)) duplicates.add(v);
        seen.add(v);
      });
    });
    return {
      missingClues,
      blankEdges,
      duplicateCount: duplicates.size,
      canPublish: missingClues===0 && blankEdges===0,
    };
  },[admin.clues, admin.slots, admin.cards]);

  const renderSlot = si => {
    const s=admin.slots[si];
    const card=s?admin.cards[s.cardId]:null;
    const isSel = s?.cardId===selectedId;
    const editingWord = inlineEdit?.cardId===s?.cardId ? inlineEdit.wordIndex : null;
    return (
      <div key={si} ref={el=>slotRefs.current[si]=el}
        className={`cslot${dragOver===si?" over":""}${!card?" empty":""}`}>
        {card&&<AdminPreviewCard
          card={card}
          orientation={s.orientation}
          selected={isSel}
          dim={dragSrc===si}
          dragSrc={dragSrc===si}
          onPointerDown={e=>handlePD(e,si)}
          onRotate={()=>rotateCard(s.cardId,1)}
          onSelect={()=>setSelId(s.cardId)}
          editingWord={editingWord}
          editDraft={editingWord!=null ? inlineDraft : ""}
          onStartEdit={(wordIndex, value)=>startInlineEdit(s.cardId, wordIndex, value)}
          onEditDraftChange={setInlineDraft}
          onCommitEdit={commitInlineEdit}
          onCancelEdit={cancelInlineEdit}
        />}
      </div>
    );
  };

  const extraSlots = admin.slots.slice(4);
  const adminDateLabel = formatAdminDate(admin.date);

  return (
    <div className="awrap">
      <div className="atabs">
        <button className="atab admin-topbar-back" onClick={onBack}>← Back</button>
        <div className="admin-topbar-title">
          {admin.title||"New Puzzle"}
        </div>
        <button className="abtn p sm admin-topbar-publish" onClick={()=>handleSave("published")}
          disabled={!validation.canPublish}
          title={!validation.canPublish ? "Fill all clues and card edges before publishing." : ""}>
          Publish
        </button>
      </div>

      <div className="acnt" style={{touchAction:"pan-y"}}>
        {/* Meta row inside the board-coloured wrapper */}
        <div className="aboard-wrap">
          <div className="admin-sec">
            <div className="admin-sec-title">Puzzle Info</div>
            <div className="ameta">
              <div className="ameta-title">
                <input className="fi-sm" value={admin.title}
                  onChange={e=>setAdmin(p=>({...p,title:e.target.value}))}
                  placeholder="Puzzle title"/>
              </div>
              <input className="fi-sm" value={admin.author||""}
                onChange={e=>setAdmin(p=>({...p,author:e.target.value}))}
                placeholder="Author name (optional)"/>
            </div>
            <div className="ameta-calendar">
              <AdminDateCalendar
                selectedDate={admin.date}
                occupancyByDate={occupancyByDate}
                onSelectDate={(date)=>{setAdmin(p=>({...p,date}));setConfirmReplace(false);}}
              />
            </div>
            {dateConflict && (
              <div className="date-conflict" onClick={e=>e.stopPropagation()}>
                <strong>⚠️ This date already has a puzzle</strong>
                {confirmReplace && (
                  <div className="date-conflict-btns">
                    <button className="abtn d sm" onClick={()=>{
                      const { id,title,date,author,clues,cards,slots } = admin;
                      const puzzle = {
                        id, title:title||"Untitled", date,
                        author:author?.trim()||"",
                        clues:clues.map(c=>c||"?"), cards,
                        solution:{
                          slotCards:slots.slice(0,4).map(s=>s.cardId),
                          orientations:slots.slice(0,4).map(s=>s.orientation),
                          extraCards:slots.slice(4,7).map(s=>s.cardId),
                        },
                        status:"published",
                      };
                      onSave(puzzle, dateConflict);
                      setConfirmReplace(false);
                    }}>Replace & move old to Unused</button>
                    <button className="abtn s sm" onClick={()=>setConfirmReplace(false)}>Cancel</button>
                  </div>
                )}
              </div>
            )}
            <div className="admin-checks">
              <span className={`admin-check ${validation.missingClues===0 ? "ok" : "err"}`}>
                {validation.missingClues===0 ? "Clues complete" : `${validation.missingClues} clue${validation.missingClues===1?"":"s"} missing`}
              </span>
              <span className={`admin-check ${validation.blankEdges===0 ? "ok" : "err"}`}>
                {validation.blankEdges===0 ? "All card edges filled" : `${validation.blankEdges} blank edge${validation.blankEdges===1?"":"s"}`}
              </span>
              <span className={`admin-check ${validation.duplicateCount===0 ? "ok" : "warn"}`}>
                {validation.duplicateCount===0 ? "No duplicate words" : `${validation.duplicateCount} duplicate word${validation.duplicateCount===1?"":"s"}`}
              </span>
            </div>
          </div>

          <div className="admin-sec">
            <div className="admin-sec-title">Board & Clues</div>
            <div className="admin-board-stage">
              <EditableClueTab text={admin.clues[0]} pos="top" onChange={val=>updateClue(0,val)}/>
              <div style={{display:"flex",alignItems:"center",gap:0}}>
                <EditableClueTab text={admin.clues[3]} pos="lft" onChange={val=>updateClue(3,val)}/>
                <div className="csurface" style={{background:"rgba(20,10,50,0.8)"}}>
                  {renderSlot(0)}{renderSlot(1)}
                  {renderSlot(3)}{renderSlot(2)}
                </div>
                <EditableClueTab text={admin.clues[1]} pos="rgt" onChange={val=>updateClue(1,val)}/>
              </div>
              <EditableClueTab text={admin.clues[2]} pos="bot" onChange={val=>updateClue(2,val)}/>
            </div>
            <div className="admin-board-note">
              Tap any clue or card word to edit it in place. Use the center rotate button when you want to change a card's orientation.
            </div>
          </div>

          <div className="admin-sec">
            <div className="admin-sec-title">Extra Cards (3)</div>
            <div className="admin-extra-grid" style={{"--cs":"118px"}}>
              {extraSlots.slice(0,3).map((s,i)=>{
                const si=4+i,card=admin.cards[s.cardId];
                const isSel=s.cardId===selectedId;
                const editingWord = inlineEdit?.cardId===s?.cardId ? inlineEdit.wordIndex : null;
                return (
                  <div key={si} ref={el=>slotRefs.current[si]=el}
                    className={`eslot${dragOver===si?" over":""}`}>
                    {card&&<AdminPreviewCard
                      card={card}
                      orientation={s.orientation}
                      selected={isSel}
                      dim={dragSrc===si}
                      dragSrc={dragSrc===si}
                      onPointerDown={e=>handlePD(e,si)}
                      onRotate={()=>rotateCard(s.cardId,1)}
                      onSelect={()=>setSelId(s.cardId)}
                      editingWord={editingWord}
                      editDraft={editingWord!=null ? inlineDraft : ""}
                      onStartEdit={(wordIndex, value)=>startInlineEdit(s.cardId, wordIndex, value)}
                      onEditDraftChange={setInlineDraft}
                      onCommitEdit={commitInlineEdit}
                      onCancelEdit={cancelInlineEdit}
                    />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="admin-sec">
            <div className="admin-sec-title">Quick Fill</div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,width:"100%"}}>
              <button
                onClick={dealRandomCards}
                disabled={wordBank.length<4}
                style={{
                  padding:"9px 20px",background:"rgba(255,255,255,.15)",
                  border:"1.5px solid rgba(255,255,255,.4)",borderRadius:"50px",
                  color:"#FFF",fontFamily:"var(--fu)",fontSize:12,fontWeight:700,
                  cursor:wordBank.length<4?"not-allowed":"pointer",
                  opacity:wordBank.length<4?.45:1,
                  letterSpacing:".04em",transition:"background .15s",
                }}
                onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,.25)"}
                onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,.15)"}
              >
                🎲 Deal Random Cards
              </button>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:10,textAlign:"center",lineHeight:1.5}}>
                Tap a card to edit · Tap a clue tab to edit · Drag to reposition
              </div>
            </div>
          </div>
        </div>

        {/* Card editor panel (appears when a card is selected) */}
        {selCard&&(
          <CardEditorPanel
            card={selCard} orientation={selOrient}
            slotIdx={selSlotIdx}
            isInClover={selInClover}
            onWordChange={(wi,val)=>updateWord(selectedId,wi,val)}
            onRotate={delta=>rotateCard(selectedId,delta)}
            onMoveToExtras={()=>moveToExtras(selectedId)}
            onMoveToSolution={()=>moveToSolution(selectedId)}
            onDelete={()=>deleteCard(selectedId)}
            onClose={()=>setSelId(null)}
            onPrev={selectPrevCard}
            onNext={selectNextCard}
            wordBank={wordBank}/>
        )}

        {/* Save controls */}
        <div className="brow2" style={{marginTop:14}}>
          <button className="abtn p" onClick={()=>handleSave("published")} disabled={!validation.canPublish}
            title={!validation.canPublish ? "Fill all clues and card edges before publishing." : ""}>
            Publish
          </button>
          <button className="abtn s" onClick={()=>handleSave("draft")}>Save Draft</button>
          <button className="abtn s" onClick={()=>handleSave("scheduled")} disabled={!validation.canPublish}
            title={!validation.canPublish ? "Fill all clues and card edges before scheduling." : ""}>
            Schedule
          </button>
        </div>
      </div>

      <DragGhost ghost={ghost}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN VIEW — routes between list / editor / word bank
// ═══════════════════════════════════════════════════════════════

function AdminView({ onPublish }) {
  const [puzzles,setPuzzles]   = useState([]);
  const [loading,setLoading]   = useState(true);
  const [wordBank,setWordBank] = useState([]);
  const [tab,setTab]         = useState("list");
  const [editPuzzle,setEditP] = useState(null);
  const [newWord,setNewWord] = useState("");
  const [wbSearch,setWbSearch] = useState("");

  // Load word bank from Supabase
  useEffect(()=>{
    dbLoadWordBank().then(words=>{
      setWordBank(words);
    }).catch(()=>{
      // keep empty word bank on error
    });
  },[]);

  const shouldLoadList = tab==="list";
  // Load puzzles from Supabase when viewing puzzle lists
  useEffect(()=>{
    if(!shouldLoadList) return;
    let cancelled = false;
    dbLoadAllPuzzles().then(rows=>{
      if(cancelled) return;
      setPuzzles(rows);
      setLoading(false);
    }).catch(()=>{
      if(cancelled) return;
      setLoading(false);
    });
    return ()=>{ cancelled = true; };
  },[shouldLoadList]);

  const handleSave = async (puzzle, displacedPuzzle=null) => {
    try {
      if(displacedPuzzle) {
        await dbSavePuzzle({...displacedPuzzle, status:"unused"});
      }
      await dbSavePuzzle(puzzle);
      if(puzzle.status==="published") onPublish?.();
      // Reload list
      const rows = await dbLoadAllPuzzles();
      setPuzzles(rows);
      setLoading(true);
      setTab("list");
    } catch(e) {
      alert("Error saving puzzle: " + e.message);
    }
  };

  const handleDelete = async id => {
    if(window.confirm("Delete this puzzle?")) {
      await dbDeletePuzzle(id);
      setPuzzles(p=>p.filter(x=>x.id!==id));
    }
  };

  const unused = puzzles.filter(p=>p.status==="unused");
  const activePuzzles = puzzles.filter(p=>p.status!=="unused");

  if(tab==="editor") return (
    <AdminBoardEditor
      initialPuzzle={editPuzzle}
      wordBank={wordBank}
      allPuzzles={puzzles}
      onSave={handleSave}
      onBack={()=>{setLoading(true);setTab("list");}}/>
  );

  return (
    <div className="awrap">
      <div className="atabs">
        <button className={`atab${tab==="list"?" on":""}`} onClick={()=>{setLoading(true);setTab("list");}}>Puzzles</button>
        <button className={`atab${tab==="unused"?" on":""}`} onClick={()=>setTab("unused")}>
          Unused{unused.length>0?` (${unused.length})`:""}
        </button>
        <button className={`atab${tab==="wb"?" on":""}`} onClick={()=>setTab("wb")}>Word Bank</button>
      </div>
      <div className="acnt">
        {tab==="list"&&(<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div className="sh" style={{margin:0}}>Puzzles</div>
            <button className="abtn p sm" onClick={()=>{setEditP(null);setTab("editor");}}>+ New Puzzle</button>
          </div>
          {loading
            ? <div className="mhint">Loading puzzles…</div>
            : activePuzzles.length===0
            ? <div className="mhint">No puzzles yet. Create your first one!</div>
            : <div className="plist">
                {activePuzzles.map(p=>(
                  <div key={p.id} className="pcard" onClick={()=>{setEditP(p);setTab("editor");}}>
                    <div className="ptitle">{p.title}</div>
                    <div className="pmeta">
                      <span>{p.date}</span><span>·</span>
                      <span style={{textTransform:"capitalize"}}>{p.difficulty}</span><span>·</span>
                      <span className={`spill ${p.status}`}>{p.status}</span>
                      <span style={{marginLeft:"auto"}} onClick={e=>{e.stopPropagation();handleDelete(p.id);}}>🗑</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </>)}

        {tab==="unused"&&(<>
          <div className="sh">Unused Puzzles</div>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>
            Puzzles displaced when another was published on the same date.
          </p>
          {unused.length===0
            ? <div className="mhint">No unused puzzles.</div>
            : <div className="plist">
                {unused.map(p=>(
                  <div key={p.id} className="pcard" style={{cursor:"default"}}>
                    <div className="ptitle">{p.title}</div>
                    <div className="pmeta">
                      <span>{p.date}</span><span>·</span>
                      <span style={{textTransform:"capitalize"}}>{p.difficulty}</span><span>·</span>
                      <span className="spill unused">unused</span>
                    </div>
                    <div style={{display:"flex",gap:7,marginTop:10}}>
                      <button className="abtn s sm" onClick={()=>{setEditP({...p,status:"draft"});setTab("editor");}}>
                        Edit
                      </button>
                      <button className="abtn s sm" onClick={async()=>{
                        await dbSavePuzzle({...p,status:"draft"});
                        const rows=await dbLoadAllPuzzles(); setPuzzles(rows);
                      }}>
                        Restore as Draft
                      </button>
                      <button className="abtn d sm" onClick={async()=>{
                        if(window.confirm("Permanently delete?")) {
                          await dbDeletePuzzle(p.id);
                          const rows=await dbLoadAllPuzzles(); setPuzzles(rows);
                        }
                      }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </>)}
        {tab==="wb"&&(<>
          <div className="sh">Word Bank</div>
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>
            Store words to quickly add during puzzle creation. 1–2 words = one entry. 3+ words = separate entries.
          </p>
          {(()=>{
            const addWords = async () => {
              const raw = newWord.trim().toUpperCase();
              if(!raw) return;
              const tokens = raw.split(/\s+/).filter(Boolean);
              const words = tokens.length >= 3 ? tokens : [raw];
              const toAdd = words.filter(w => !wordBank.includes(w));
              if(!toAdd.length) { setNewWord(""); return; }
              const next = [...wordBank, ...toAdd];
              setWordBank(next);
              setNewWord("");
              await dbAddWords(toAdd).catch(e => console.error("WB add error:", e));
            };
            const deleteWord = async (w) => {
              setWordBank(prev => prev.filter(x => x !== w));
              await dbDeleteWord(w).catch(e => console.error("WB delete error:", e));
            };
            const sorted = [...wordBank].sort((a,b)=>a.localeCompare(b));
            const query = wbSearch.trim().toUpperCase();
            const filtered = query ? sorted.filter(w=>w.includes(query)) : sorted;
            return (<>
          {wordBank.length > 6 && (
            <div style={{marginBottom:10}}>
              <input className="fi" value={wbSearch}
                onChange={e=>setWbSearch(e.target.value)}
                placeholder="Search words…"
                style={{background:"rgba(18,10,45,.9)"}}/>
            </div>
          )}
          <div className="wchips">
            {filtered.length===0
              ? <div style={{fontSize:12,color:"var(--muted)",padding:"8px 0"}}>
                  No words match "{wbSearch}"
                </div>
              : filtered.map(w=>(
                <div key={w} className="wchip">{w}
                  <span className="wdel" onClick={()=>deleteWord(w)}>×</span>
                </div>
              ))
            }
          </div>
          <div className="awrow">
            <input className="fi" value={newWord} onChange={e=>setNewWord(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter") addWords()}}
              placeholder="One word, two-word phrase, or 3+ words to add separately"/>
            <button className="abtn p" onClick={addWords}>Add</button>
          </div>
            </>);
          })()}
        </>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DEMO ARCHIVE PUZZLES (past dates for showcasing archive)
// ═══════════════════════════════════════════════════════════════

function makePastDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

const DEMO_ARCHIVE = [
  {
    id:"arch-001", title:"At Sea", difficulty:"easy", status:"published",
    date: makePastDate(1),
    clues:["DEEP","SAIL","FOAM","MAST"],
    cards:{
      a1:{id:"a1",words:["TRENCH","HULL","SPRAY","RIGGING"]},
      a2:{id:"a2",words:["ABYSS","KEEL","SURF","ROPE"]},
      a3:{id:"a3",words:["FATHOM","BOOM","WAKE","CROW"]},
      a4:{id:"a4",words:["DARK","SHEET","CREST","YARD"]},
    },
    solution:{slotCards:["a1","a2","a3","a4"],orientations:[0,0,0,0]},
  },
  {
    id:"arch-002", title:"Nightfall", difficulty:"standard", status:"published",
    date: makePastDate(2),
    clues:["DARK","COOL","STILL","SOFT"],
    cards:{
      b1:{id:"b1",words:["SHADOW","BREEZE","LAKE","VELVET"]},
      b2:{id:"b2",words:["SHADE","FROST","POND","SILK"]},
      b3:{id:"b3",words:["DUSK","MIST","HUSH","DOWN"]},
      b4:{id:"b4",words:["NIGHT","DEW","CALM","WOOL"]},
      b5:{id:"b5",words:["FOG","CHILL","QUIET","LINEN"]},
    },
    solution:{slotCards:["b1","b2","b3","b4"],orientations:[0,0,0,0]},
  },
  {
    id:"arch-003", title:"Garden Path", difficulty:"expert", status:"published",
    date: makePastDate(5),
    clues:["GROW","ROOT","BLOOM","GREEN"],
    cards:{
      g1:{id:"g1",words:["SPROUT","BULB","PETAL","STEM"]},
      g2:{id:"g2",words:["VINE","TUBER","ROSE","LEAF"]},
      g3:{id:"g3",words:["SHOOT","RHIZOME","BLOSSOM","FROND"]},
      g4:{id:"g4",words:["BUD","TAPROOT","DAISY","FERN"]},
      g5:{id:"g5",words:["SPRIG","RUNNER","TULIP","MOSS"]},
      g6:{id:"g6",words:["SAPLING","CORM","ASTER","IVY"]},
    },
    solution:{slotCards:["g1","g2","g3","g4"],orientations:[0,0,0,0]},
  },
  {
    id:"arch-004", title:"First Light", difficulty:"easy", status:"published",
    date: makePastDate(8),
    clues:["DAWN","WARM","RISE","GOLD"],
    cards:{
      f1:{id:"f1",words:["AURORA","HEARTH","PEAK","HONEY"]},
      f2:{id:"f2",words:["SUNRISE","EMBER","SUMMIT","AMBER"]},
      f3:{id:"f3",words:["BREAK","TOAST","CREST","BRONZE"]},
      f4:{id:"f4",words:["GLOW","FLAME","MOUNT","OCHRE"]},
    },
    solution:{slotCards:["f1","f2","f3","f4"],orientations:[0,0,0,0]},
  },
  {
    id:"arch-005", title:"Watershed", difficulty:"hardcore", status:"published",
    date: makePastDate(13),
    clues:["FLOW","COLD","CLEAR","RUSH"],
    cards:{
      w1:{id:"w1",words:["CURRENT","GLACIER","CRYSTAL","TORRENT"]},
      w2:{id:"w2",words:["STREAM","ICE","GLASS","CASCADE"]},
      w3:{id:"w3",words:["TIDE","FREEZE","MIRROR","RAPID"]},
      w4:{id:"w4",words:["DRIFT","FROST","LENS","CHUTE"]},
      w5:{id:"w5",words:["EDDY","TUNDRA","PRISM","FLUME"]},
      w6:{id:"w6",words:["SURGE","BERG","LUCID","FLOE"]},
      w7:{id:"w7",words:["PULL","SLEET","PURE","GUSH"]},
    },
    solution:{slotCards:["w1","w2","w3","w4"],orientations:[0,0,0,0]},
  },
];

// Completion state: { [puzzleId]: { solved: bool, livesUsed?: number, difficulty?: string, solvedAt: string } }
const loadCompletions = () => loadLS("clover_completions", {});
const saveCompletion  = (id, data) => {
  const all = loadCompletions();
  saveLS("clover_completions", { ...all, [id]: data });
};

const loadStats = () => normalizeStats(loadLS("clover_stats", DEFAULT_STATS));

const updateStats = (won, livesUsed, difficulty) => {
  const s = loadStats();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
  const newStreak = won
    ? (s.lastSolvedDate===yesterday || s.lastSolvedDate===today ? s.currentStreak+1 : 1)
    : 0;
  const dist = { ...(s.livesUsedDist || DEFAULT_STATS.livesUsedDist) };
  const key = won ? String(Math.min(2, Math.max(0, livesUsed))) : 'X';
  dist[key] = (dist[key] || 0) + 1;
  const difficultyWins = {
    ...(s.difficultyWins || DEFAULT_STATS.difficultyWins),
  };
  if(won && difficultyWins[difficulty] !== undefined){
    difficultyWins[difficulty] += 1;
  }
  const updated = {
    currentStreak: newStreak,
    maxStreak: Math.max(s.maxStreak||0, newStreak),
    lastSolvedDate: won ? today : s.lastSolvedDate,
    totalPlayed: (s.totalPlayed||0)+1,
    totalWon: (s.totalWon||0)+(won?1:0),
    livesUsedDist: dist,
    difficultyWins,
  };
  saveLS("clover_stats", updated);
  return updated;
};

// ═══════════════════════════════════════════════════════════════
//  ARCHIVE VIEW
// ═══════════════════════════════════════════════════════════════

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_MIN = ["S","M","T","W","T","F","S"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ArchiveView({ onPlay }) {
  const completions = loadCompletions();
  const today = new Date().toISOString().split("T")[0];
  const [allPuzzles, setAllPuzzles] = useState([]);
  const [desiredMonthKey, setDesiredMonthKey] = useState("");

  useEffect(()=>{
    dbLoadAllPuzzles().then(rows=>{
      const published = rows.filter(p=>p.status==="published" && p.date<=today);
      setAllPuzzles(published.sort((a,b)=>b.date.localeCompare(a.date)));
    }).catch(()=>{
      setAllPuzzles([]);
    });
  },[today]);

  const monthMap = useMemo(()=>{
    const map = new Map();
    allPuzzles.forEach(p=>{
      const monthKey = p.date.slice(0,7);
      if(!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey).push(p);
    });
    return map;
  },[allPuzzles]);

  const monthKeys = useMemo(
    ()=>Array.from(monthMap.keys()).sort((a,b)=>b.localeCompare(a)),
    [monthMap]
  );

  const activeMonthKey = monthKeys.includes(desiredMonthKey) ? desiredMonthKey : (monthKeys[0] || "");
  const activeMonthPuzzles = useMemo(
    ()=>monthMap.get(activeMonthKey) || [],
    [monthMap, activeMonthKey]
  );
  const puzzleByDate = useMemo(
    ()=>new Map(activeMonthPuzzles.map(p=>[p.date,p])),
    [activeMonthPuzzles]
  );

  const activeMonthParts = activeMonthKey ? activeMonthKey.split("-").map(Number) : null;
  const activeYear = activeMonthParts?.[0] || new Date().getFullYear();
  const activeMonthIndex = activeMonthParts ? activeMonthParts[1] - 1 : new Date().getMonth();
  const firstOfMonth = new Date(activeYear, activeMonthIndex, 1, 12);
  const daysInMonth = new Date(activeYear, activeMonthIndex + 1, 0).getDate();
  const leadingEmpty = firstOfMonth.getDay();
  const trailingEmpty = (7 - ((leadingEmpty + daysInMonth) % 7)) % 7;
  const activeMonthLabel = `${MONTHS_FULL[activeMonthIndex]} ${activeYear}`;
  const currentMonthIndex = monthKeys.indexOf(activeMonthKey);

  const gridCells = [];
  for(let i=0;i<leadingEmpty;i++) gridCells.push({ kind:"empty", key:`lead-${i}` });
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = `${activeYear}-${String(activeMonthIndex+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const puzzle = puzzleByDate.get(dateStr);
    const comp = puzzle ? completions[puzzle.id] : null;
    const isToday = dateStr === today;
    const isFuture = dateStr > today;
    let status = "none";
    if(puzzle){
      if(comp?.solved || dateStr < today) status = "played";
      else status = "unplayed";
    } else if(isFuture){
      status = "future";
    }
    gridCells.push({ kind:"day", key:dateStr, dateStr, day, puzzle, status, isToday, isSolved: !!comp?.solved });
  }
  for(let i=0;i<trailingEmpty;i++) gridCells.push({ kind:"empty", key:`trail-${i}` });

  return (
    <div className="arch">
      <div className="arch-shell">
        <div className="arch-head">
          <div className="arch-kicker">Archive</div>
          <div className="arch-title">Past Puzzles</div>
          <div className="arch-sub">Tap any published day to open that puzzle.</div>
        </div>

        {allPuzzles.length === 0 ? (
          <div className="arch-empty">
            <div className="arch-empty-icon">??</div>
            No past puzzles yet.<br/>
            Publish puzzles with past dates in Admin to see them here.
          </div>
        ) : (
          <div className="arch-panel">
            <div className="arch-toolbar">
              <button
                type="button"
                className="arch-navbtn"
                onClick={()=>setDesiredMonthKey(monthKeys[currentMonthIndex + 1] || activeMonthKey)}
                disabled={currentMonthIndex === monthKeys.length - 1}
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="arch-monthhead">
                <div className="arch-monthtitle">{activeMonthLabel}</div>
                <div className="arch-monthmeta">
                  {activeMonthPuzzles.length} published puzzle{activeMonthPuzzles.length===1?"":"s"}
                </div>
              </div>
              <button
                type="button"
                className="arch-navbtn"
                onClick={()=>setDesiredMonthKey(monthKeys[currentMonthIndex - 1] || activeMonthKey)}
                disabled={currentMonthIndex <= 0}
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="arch-weekdays">
              {DOW_MIN.map((label, i)=><div key={`${label}-${i}`} className="arch-weekday">{label}</div>)}
            </div>

            <div className="arch-grid">
              {gridCells.map(cell=>{
                if(cell.kind === "empty"){
                  return <div key={cell.key} className="arch-cell empty" />;
                }
                const { puzzle, status, isToday, day, dateStr, isSolved } = cell;
                const clickable = !!puzzle;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={`arch-day${clickable?" clickable":""}${status==="played"?" played":""}${status==="unplayed"?" unplayed":""}${status==="none"?" no-puzzle":""}${status==="future"?" future":""}${isToday?" today":""}`}
                    onClick={()=>{ if(puzzle) onPlay(puzzle); }}
                    disabled={!clickable}
                    title={puzzle ? `${puzzle.title} • ${dateStr}` : dateStr}
                  >
                    {isSolved && (
                      <img
                        className="arch-day-star"
                        src={STAR_LIFE_ASSET}
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                    <div className="arch-day-num">{day}</div>
                  </button>
                );
              })}
            </div>

            <div className="arch-legend">
              <div className="arch-legend-item"><span className="arch-legend-dot played"/>Played</div>
              <div className="arch-legend-item"><span className="arch-legend-dot unplayed"/>Unplayed</div>
              <div className="arch-legend-item"><img className="arch-legend-star" src={STAR_LIFE_ASSET} alt="" aria-hidden="true"/>Beaten</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS SHEET
// ═══════════════════════════════════════════════════════════════

const DIFF_OPTIONS = [
  { key:"easy",     icon:"✨", name:"Easy",         desc:"4 cards, no extras" },
  { key:"standard", icon:"🌙", name:"Standard",    desc:"4 cards + 1 extra" },
  { key:"expert",   icon:"🌕", name:"Expert",       desc:"4 cards + 2 extras" },
  { key:"hardcore", icon:"🌑", name:"Hardcore",     desc:"4 cards + 3 extras" },
];

const DIFF_RANK = { easy:0, standard:1, expert:2, hardcore:3 };

function SettingsSheet({ difficulty, onChangeDifficulty, gameInProgress, onClose }) {
  const currentRank = DIFF_RANK[difficulty] ?? 1;
  return (
    <>
      <div className="settings-backdrop" onClick={onClose}/>
      <div className="settings-sheet" onClick={e=>e.stopPropagation()}>
        <div className="settings-handle"/>
        <div className="settings-title">Settings</div>
        {gameInProgress
          ? <div className="settings-sub">You can switch to an easier difficulty mid-game, but not a more challenging one.</div>
          : <div className="settings-sub">Choose your preferred difficulty level</div>
        }
        <div className="diff-opts">
          {DIFF_OPTIONS.map(opt=>{
            const rank = DIFF_RANK[opt.key] ?? 1;
            const isLocked = gameInProgress && rank > currentRank;
            const isActive = difficulty === opt.key;
            return (
              <button
                key={opt.key}
                className={`diff-opt${isActive?" active":""}`}
                onClick={()=>{ if(!isLocked){ onChangeDifficulty(opt.key); onClose(); } }}
                style={isLocked ? {opacity:.35,cursor:"not-allowed"} : {}}
              >
                <div className="diff-opt-icon">{opt.icon}</div>
                <div className="diff-opt-body">
                  <div className="diff-opt-name">{opt.name}</div>
                  <div className="diff-opt-desc">
                    {isLocked ? "Can't increase difficulty mid-game" : opt.desc}
                  </div>
                </div>
                <div className="diff-opt-check">{isActive?"✓":""}</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  const [view,setView]           = useState("game");
  const [archivePuzzle,setAP]    = useState(null);
  const [completions,setComps]   = useState(loadCompletions);
  const [showSettings,setShowSettings] = useState(false);
  const [showTutorial,setShowTutorial] = useState(()=>!loadLS("clover_tutorial_seen", false));
  const [difficulty,setDifficulty] = useState(()=>loadLS("clover_difficulty","standard"));
  const [lobbyDone,setLobbyDone]     = useState(false);
  const [resetCount,setResetCount]   = useState(0);
  const [forceFresh,setForceFresh]   = useState(false);
  const [admireMode,setAdmireMode]   = useState(false);

  const handleChangeDifficulty = useCallback((d)=>{
    setDifficulty(d);
    saveLS("clover_difficulty",d);
  },[]);

  const handleGameReset = useCallback(()=>{
    setLobbyDone(false);
    setResetCount(c=>c+1);
    setAdmireMode(false);
    // forceFresh stays as-is — if user chose Replay it stays true for subsequent resets
  },[]);

  const [publishTick, setPublishTick] = useState(0);
  const [todayPuzzle, setTodayPuzzle] = useState(DEFAULT_PUZZLE);

  const openTutorial = useCallback(()=>setShowTutorial(true),[]);
  const closeTutorial = useCallback(()=>{
    setShowTutorial(false);
    saveLS("clover_tutorial_seen", true);
  },[]);

  useEffect(()=>{
    dbLoadTodayPuzzle().then(p => {
      if(p) setTodayPuzzle(p);
    }).catch(()=>{});
  },[publishTick]);

  useEffect(()=>{
    const el=document.createElement("style");
    el.textContent=CSS;
    document.head.appendChild(el);
    return ()=>document.head.removeChild(el);
  },[]);

  const activePuzzle = useMemo(()=>{
    const base = (view==="game" && archivePuzzle) ? archivePuzzle : todayPuzzle;
    return { ...base, difficulty };
  },[view, archivePuzzle, todayPuzzle, difficulty]);

  // Key only on puzzle id — difficulty changes mid-game should NOT reset the board
  const activePuzzleKey = activePuzzle.id;

  const isArchivePlay = view==="game" && archivePuzzle && archivePuzzle.id !== todayPuzzle.id;

  const handlePlayFromArchive = (puzzle) => {
    setAP(puzzle);
    setView("game");
  };

  const handleSolved = useCallback((puzzleId, result) => {
    const data = {
      solved:true,
      livesUsed: result?.livesUsed ?? 0,
      difficulty: result?.difficulty || difficulty,
      solvedAt:new Date().toISOString(),
    };
    saveCompletion(puzzleId, data);
    setComps(loadCompletions());
  },[difficulty]);

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",maxWidth:500,margin:"0 auto"}}>
      <header className="hdr">
        <div className="logo">
          <div className="logo-g">🔮</div>
          Crystal Clues
        </div>
        <div className="nav">
          <button className={`nbtn${view==="game"?" on":""}`}
            onClick={()=>{setView("game"); if(!archivePuzzle||archivePuzzle.id===todayPuzzle.id) setAP(null);}}>
            Play
          </button>
          <button className={`nbtn${view==="archive"?" on":""}`} onClick={()=>setView("archive")}>
            Archive
          </button>
          <button className={`nbtn${view==="admin"?" on":""}`} onClick={()=>setView("admin")}>
            Admin
          </button>
          <button className="gear-btn" onClick={()=>setShowSettings(true)} title="Settings">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>
      </header>

      {/* Banner when playing an archived puzzle */}
      {view==="game" && isArchivePlay && (
        <div className="playing-banner">
          <span>📅 Playing: {activePuzzle.title} · {activePuzzle.date}</span>
          <button onClick={()=>{setAP(null);setForceFresh(false);setAdmireMode(false);setLobbyDone(false);setResetCount(0);}}>Today's puzzle</button>
        </div>
      )}

      {view==="game" && (() => {
        const completedData = loadCompletions()[activePuzzle.id];
        const showLobby = !isArchivePlay && !lobbyDone;
        return showLobby
          ? <PuzzleLobby
              puzzle={activePuzzle}
              difficulty={difficulty}
              onChangeDifficulty={handleChangeDifficulty}
              onStart={()=>{ setForceFresh(true); setAdmireMode(false); setResetCount(c=>c+1); setLobbyDone(true); }}
              completedData={completedData||null}
              onAdmire={()=>{ setAdmireMode(true); setLobbyDone(true); }}
              onOpenTutorial={openTutorial}
            />
          : <GameView key={`${activePuzzleKey}-${resetCount}`} puzzle={activePuzzle} onSolved={handleSolved} completions={completions} onReset={handleGameReset} forceFresh={forceFresh} admireMode={admireMode} difficulty={difficulty}/>;
      })()}
      {view==="archive"&& <ArchiveView onPlay={handlePlayFromArchive}/>}
      {view==="admin"  && <AdminView onPublish={()=>setPublishTick(t=>t+1)}/>}
      {showTutorial && <TutorialPracticeOverlay onClose={closeTutorial} />}

      {showSettings && (
        <SettingsSheet
          difficulty={difficulty}
          onChangeDifficulty={handleChangeDifficulty}
          gameInProgress={view==="game" && lobbyDone}
          onClose={()=>setShowSettings(false)}
        />
      )}
    </div>
  );
}


