// The animated replay's record of play: what the player did on the board,
// in order, as small game actions (never pointer paths or video).
//
//   { k:"s", b, c }   snapshot: the board when play began or resumed
//   { k:"t", s }      tapped (turned) the card in slot s a quarter turn
//   { k:"m", a, b }   dragged slot a onto slot b (the two cards swap)
//   { k:"r" }         Rotate: the whole board a quarter turn clockwise
//   { k:"x", b }      Shuffle, landing on board b
//   { k:"z", b, c }   Reset: back to the last guess (or a fresh deal)
//   { k:"g", n }      guess n was submitted and recorded by the server
//   { k:"gap" }       added by the server: part of a session never arrived
// Every entry also has d: ms since the previous one (capped at WAIT_CAP).
// Boards are written compactly: b = ["cardId:orientation", …] for slots
// 0..3 (TL, TR, BR, BL) then the tray; c = the clue on each side.
//
// Saving (createMoveRecorder): entries wait in localStorage and go to the
// server in batches — a few seconds after the last action, and at once
// after a guess — never one request per move. Each page load writes as its
// own session with a running count, so the server stores a batch sent
// twice (a refresh, a lost reply) only once. Leftovers from an earlier page
// load are sent first, so the order survives a refresh.
//
// Replaying (buildReplay): rebuilds the play from the log and checks it
// against each recorded guess. Where the log is incomplete, the replay
// jumps to the recorded guess board and says so; nothing is invented.

import { CW_FROM } from "../game/shared";

export const WAIT_CAP = 5000;
const FLUSH_MS = 3000;
const BATCH = 150;
const PREFIX = "cv-moves:";
const STALE_MS = 31 * 24 * 3600 * 1000;
const CLOSED = new Set(["moves_closed", "not_found", "invalid_moves", "choose_difficulty"]);

export const packBoard = (slots) => slots.map((s) => `${s.cardId}:${s.orientation}`);
export const unpackBoard = (b) => (Array.isArray(b) ? b.map((x) => {
  const i = String(x).lastIndexOf(":");
  return { cardId: String(x).slice(0, i), orientation: Number(String(x).slice(i + 1)) };
}) : null);

const newSession = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// One recorder per open puzzle. save({ session, from, actions }) resolves
// to { stored } (how many entries of that session the server holds).
export function createMoveRecorder(puzzleKey, save, { now = () => Date.now(), storage = globalThis.localStorage } = {}) {
  const prefix = `${PREFIX}${puzzleKey}:`;
  const read = (k) => { try { return JSON.parse(storage.getItem(k)); } catch { return null; } };
  const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: memory only */ } };
  const drop = (k) => { try { storage.removeItem(k); } catch { /* ignore */ } };

  // Earlier page loads' unsent entries (this puzzle), oldest first; and a
  // sweep of long-forgotten ones (any puzzle).
  const queue = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const st = read(k);
      if (!st || !Array.isArray(st.pending) || now() - (st.lastAt || 0) > STALE_MS) { drop(k); i--; continue; }
      if (k.startsWith(prefix)) queue.push({ key: k, session: k.slice(prefix.length), ...st });
    }
  } catch { /* storage unavailable */ }
  queue.sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
  const cur = { key: `${prefix}${newSession()}`, sent: 0, pending: [], lastAt: 0 };
  cur.session = cur.key.slice(prefix.length);
  queue.push(cur);
  let lastAt = 0;

  let timer = null;
  let inflight = null;
  let failures = 0;
  let closed = false;
  const persist = (s) => (s.pending.length || s === cur
    ? write(s.key, { sent: s.sent, pending: s.pending, lastAt: s.lastAt })
    : drop(s.key));

  const schedule = (ms) => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, ms);
  };

  // Sends sessions in order; stops at the first failure so nothing overtakes.
  function flush() {
    if (inflight || closed) return inflight || Promise.resolve();
    const s = queue.find((q) => q.pending.length);
    if (!s) return Promise.resolve();
    const from = s.sent;
    const batch = s.pending.slice(0, BATCH);
    inflight = Promise.resolve()
      .then(() => save({ session: s.session, from, actions: batch }))
      .then((r) => {
        const stored = Number.isFinite(r?.stored) ? r.stored : from + batch.length;
        s.pending = s.pending.slice(Math.max(0, stored - from));
        s.sent = Math.max(s.sent, stored);
        persist(s);
        if (s !== cur && !s.pending.length) queue.splice(queue.indexOf(s), 1);
        failures = 0;
        inflight = null;
        if (queue.some((q) => q.pending.length)) return flush();
        return undefined;
      }, (err) => {
        inflight = null;
        if (CLOSED.has(err?.code)) {
          // This attempt can't take moves any more: forget what's waiting.
          queue.forEach((q) => { q.pending = []; drop(q.key); });
          closed = true;
          return;
        }
        failures += 1;
        schedule(Math.min(30000, 2000 * 2 ** failures));
      });
    return inflight;
  }

  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  globalThis.document?.addEventListener?.("visibilitychange", onHide);
  if (queue.length > 1) schedule(0);

  return {
    record(action) {
      if (closed) return;
      const t = now();
      const d = lastAt ? Math.min(WAIT_CAP, Math.max(0, t - lastAt)) : 0;
      lastAt = t;
      cur.pending.push({ ...action, d });
      cur.lastAt = t;
      persist(cur);
      schedule(action.k === "g" ? 0 : cur.pending.length >= BATCH ? 0 : FLUSH_MS);
    },
    flush,
    dispose() {
      globalThis.document?.removeEventListener?.("visibilitychange", onHide);
      clearTimeout(timer);
      if (!cur.pending.length) drop(cur.key);
      return flush();
    },
  };
}

// ── Replay ─────────────────────────────────────────────────────────────

const sameBoard = (a, b) => a.length === b.length &&
  a.every((s, i) => s.cardId === b[i]?.cardId && s.orientation === b[i]?.orientation);
const sameClues = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);

function isClueRotation(clues, original) {
  if (!Array.isArray(clues) || clues.length !== 4) return false;
  let rc = [...original];
  for (let r = 0; r < 4; r++) {
    if (sameClues(rc, clues)) return true;
    rc = CW_FROM.map((i) => rc[i]);
  }
  return false;
}

export const rotateBoard = (slots) => [
  ...CW_FROM.map((f) => ({ ...slots[f], orientation: (slots[f].orientation + 1) % 4 })),
  ...slots.slice(4),
];
export const rotateClues = (clues) => CW_FROM.map((i) => clues[i]);

// Describes one move for the caption under the board.
export function describeStep(step, { firstGuessDone = false } = {}) {
  switch (step.kind) {
    case "tap": return "Turned a card";
    case "swap":
      if (step.a < 4 && step.b < 4) return "Swapped two cards";
      if (step.a >= 4 && step.b >= 4) return "Rearranged the bonus cards";
      return "Swapped in a bonus card";   // the tray is "Available cards"
    case "rotate": return "Rotated the board";
    case "shuffle": return "Shuffled";
    case "reset": return firstGuessDone ? "Reset — back to the last guess" : "Reset — back to the deal";
    case "resume": return "Came back to the puzzle";
    case "jump": return "Moves missing — jumped ahead";
    case "guess": return `Submitted guess ${step.n}`;
    default: return "";
  }
}

// Builds the steps the replay plays from a finished puzzle's view (the
// server's open_friend_puzzle) and its move log (get_friend_moves).
// Returns null when there's nothing usable, so the guess-by-guess replay
// is shown instead. Each step: { kind, d, ...args, slots, clues } where
// slots/clues are the board after it.
export function buildReplay(view, log) {
  const actions = Array.isArray(log?.actions) ? log.actions : [];
  const guesses = view?.guesses || [];
  const ids = view?.card_order || [];
  if (!actions.length || !guesses.length || ids.length < 4) return null;

  const valid = (slots) => Array.isArray(slots) && slots.length === ids.length &&
    new Set(slots.map((s) => s?.cardId)).size === ids.length &&
    slots.every((s) => ids.includes(s?.cardId) && [0, 1, 2, 3].includes(s.orientation));
  const validClues = (c) => isClueRotation(c, view.clues);
  const guessBoard = (g) => {
    const onBoard = new Set(g.board.map((s) => s.cardId));
    const tray = (g.extras || []).length === ids.length - 4 ? g.extras
      : ids.filter((id) => !onBoard.has(id)).map((cardId) => ({ cardId, orientation: 0 }));
    return [...g.board, ...tray].map((s) => ({ cardId: s.cardId, orientation: s.orientation }));
  };

  let slots = null;
  let clues = null;
  let synced = false;       // the simulated board is known to match the player's
  let missing = !!log.truncated;
  let nextGuess = 1;        // the next guess the replay will reveal
  const steps = [];
  let init = null;
  let carry = 0;            // waits of skipped entries carry into the next step

  const push = (step) => {
    const d = Math.min(WAIT_CAP, (step.d || 0) + carry);
    carry = 0;
    steps.push({ ...step, d, slots: slots.map((s) => ({ ...s })), clues: [...clues] });
  };
  const setState = (s, c) => { slots = s.map((x) => ({ ...x })); clues = [...c]; };
  const begin = (s, c) => { setState(s, c); init = { slots: slots.map((x) => ({ ...x })), clues: [...clues] }; synced = true; };

  // Reveals guess g (and any earlier ones the log skipped), jumping to the
  // recorded board first if the replayed board doesn't match it.
  const reveal = (n, d) => {
    while (nextGuess <= n) {
      const g = guesses[nextGuess - 1];
      const board = guessBoard(g);
      if (!init) { begin(board, g.clues); missing = true; }
      else if (!synced || !sameBoard(slots, board) || !sameClues(clues, g.clues)) {
        missing = true;
        setState(board, g.clues);
        push({ kind: "jump", d: nextGuess === n ? d : 0 });
        d = 0;
      }
      synced = true;
      push({ kind: "guess", n: nextGuess, d: nextGuess === n ? d : 0 });
      d = 0;
      nextGuess += 1;
    }
  };

  for (const a of actions) {
    if (nextGuess > guesses.length) break;   // the game was over
    const d = Number.isFinite(a?.d) ? a.d : 0;
    switch (a?.k) {
      case "s": case "x": case "z": {
        const b = unpackBoard(a.b);
        const c = a.k === "x" ? clues : a.c;
        if (!valid(b) || !c || !validClues(c)) { synced = false; missing = true; break; }
        if (!init) { begin(b, c); carry += d; break; }
        if (a.k === "s") {
          if (synced && sameBoard(slots, b) && sameClues(clues, c)) { push({ kind: "resume", d }); break; }
          setState(b, c); synced = true;
          push({ kind: "resume", d, moved: true });
          break;
        }
        setState(b, c); synced = true;
        push({ kind: a.k === "x" ? "shuffle" : "reset", d, firstGuessDone: nextGuess > 1 });
        break;
      }
      case "t":
        if (!synced || !(a.s >= 0 && a.s < ids.length)) { carry += d; break; }
        slots[a.s] = { ...slots[a.s], orientation: (slots[a.s].orientation + 1) % 4 };
        push({ kind: "tap", s: a.s, d });
        break;
      case "m":
        if (!synced || !(a.a >= 0 && a.a < ids.length && a.b >= 0 && a.b < ids.length) || a.a === a.b) { carry += d; break; }
        [slots[a.a], slots[a.b]] = [slots[a.b], slots[a.a]];
        push({ kind: "swap", a: a.a, b: a.b, d });
        break;
      case "r":
        if (!synced) { carry += d; break; }
        slots = rotateBoard(slots);
        clues = rotateClues(clues);
        push({ kind: "rotate", d });
        break;
      case "g":
        if (Number.isInteger(a.n) && a.n >= nextGuess && a.n <= guesses.length) reveal(a.n, d);
        else carry += d;
        break;
      case "gap":
        synced = false; missing = true;
        break;
      default:
        break;
    }
  }
  // Guesses the log never reached (its last batch was lost, say).
  if (nextGuess <= guesses.length) { missing = true; reveal(guesses.length, 0); }
  if (!init) return null;
  return { init, steps, missing };
}

// What the replay's pretend server answers for guess n: the recorded result,
// with the answer on the last one, exactly like submit_friend_guess did.
export function recordedGuessResult(view, n) {
  const g = view.guesses[n - 1];
  const last = n === view.guesses.length;
  return {
    guess_no: g.guess_no, correct: g.correct, lives_left: g.lives_left,
    outcome: last ? view.outcome : null,
    lives_used: last ? view.lives_used : null,
    solution: last ? view.solution : null,
    friendship: null,
  };
}
