// Shared setup for the friend-exchange API tests. Talks only to the local
// Supabase stack from supabase/config.toml (`npm run db:start`) and refuses
// anything else; the stack check and the account minting are the account
// tests' own (tests/db/helpers.mjs), so a Friends player is a real
// Cluevoyance account: auth user + custom:platform identity + ensure_account().
import { createClient } from "@supabase/supabase-js";
import { stack, makeAccount } from "../db/helpers.mjs";

export const API_URL = stack().apiUrl;
export const PUBLISHABLE_KEY = stack().anonKey;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(API_URL, stack().serviceKey, opts);
export const anon = () => createClient(API_URL, PUBLISHABLE_KEY, opts);

// A signed-in Cluevoyance account with a Friends display name.
export async function makePlayer(name) {
  const acct = await makeAccount(name);
  await rpc(acct.client, "set_display_name", { p_name: name });
  return { name, email: acct.email, id: acct.id, client: acct.client, password: acct.password };
}

// Calls an RPC and throws on error, returning data.
export async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const e = new Error(error.message);
    e.code = error.message.split(":")[0];
    throw e;
  }
  return data;
}

// Calls an RPC expecting an error; returns its code ("draft_conflict", …).
export async function rpcError(client, fn, args = {}) {
  const { error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} was expected to fail but succeeded`);
  return error.message.split(":")[0];
}

export async function befriend(a, b) {
  const invite = await rpc(a.client, "create_friend_invite");
  const res = await rpc(b.client, "accept_friend_invite", { p_token: invite.token });
  return res.friendship_id;
}

// A complete 7-card board like the creator produces. Words carry a prefix
// so tests can prove none of them leak into notifications.
export function sampleBoard(prefix = "W") {
  const cards = {};
  const slots = [];
  for (let c = 0; c < 7; c++) {
    const id = `u${c + 1}`;
    cards[id] = { id, words: [0, 1, 2, 3].map((e) => `${prefix}${c}${"ABCD"[e]}`) };
    slots.push({ cardId: id, orientation: c % 4 });
  }
  return { clues: [`${prefix}TOP`, `${prefix}RIGHT`, `${prefix}BOTTOM`, `${prefix}LEFT`], cards, slots };
}

// The creator sends one complete seven-card puzzle; no difficulty.
export async function sendPuzzle(creator, friendshipId, board = sampleBoard()) {
  const saved = await rpc(creator.client, "save_friend_draft", {
    p_friendship_id: friendshipId, p_draft_id: null, p_version: null,
    p_title: "", p_board: board,
  });
  const sent = await rpc(creator.client, "send_friend_puzzle", { p_draft_id: saved.id, p_version: saved.version });
  return sent.puzzle_id;
}

// ── Board geometry, mirroring the client (CW_FROM = [3,0,1,2]) ─────────
const CW_FROM = [3, 0, 1, 2];
export function rotateBoard(board, clues) {
  return {
    board: CW_FROM.map((f) => ({ ...board[f], orientation: (board[f].orientation + 1) % 4 })),
    clues: CW_FROM.map((f) => clues[f]),
  };
}

// The solved board, as the creator's view of the puzzle describes it.
export function solvedBoard(creatorView) {
  return creatorView.solution.slotCards.map((cardId, i) => ({
    cardId, orientation: creatorView.solution.orientations[i],
  }));
}

// A board with every slot wrong: solution cards shifted one slot along.
export function wrongBoard(creatorView) {
  const s = solvedBoard(creatorView);
  return [s[1], s[2], s[3], s[0]];
}

// The recipient picks the difficulty, which deals the cards for the attempt.
export const choose = (solver, puzzleId, difficulty) =>
  rpc(solver.client, "choose_friend_difficulty", { p_puzzle_id: puzzleId, p_difficulty: difficulty });

export async function sendAndStart(creator, solver, friendshipId, board, difficulty = "easy") {
  const pid = await sendPuzzle(creator, friendshipId, board);
  await choose(solver, pid, difficulty);
  return pid;
}

// The solver's real tray for a board: every dealt card that isn't on it.
export async function trayFor(solver, puzzleId, board) {
  const view = await rpc(solver.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
  const onBoard = new Set(board.map((s) => s.cardId));
  return view.card_order.filter((id) => !onBoard.has(id)).map((cardId) => ({ cardId, orientation: 0 }));
}

export async function guess(solver, puzzleId, guessNo, board, clues, extras) {
  return rpc(solver.client, "submit_friend_guess", {
    p_puzzle_id: puzzleId, p_guess_no: guessNo, p_board: board,
    p_extras: extras ?? await trayFor(solver, puzzleId, board), p_clues: clues,
  });
}

export async function friendshipRow(friendshipId) {
  const { data, error } = await admin.from("friendships").select("*").eq("id", friendshipId).single();
  if (error) throw error;
  return data;
}
