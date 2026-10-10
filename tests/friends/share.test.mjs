// Puzzles shared by link (guest play). Local stack only (helpers.mjs).
// Rules under test are listed in supabase/migrations/20261011090000_friend_share_links.sql.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { admin, anon, rpc, rpcError, makePlayer, sampleBoard, befriend, solvedBoard, wrongBoard } from "./helpers.mjs";

const guestKey = () => randomBytes(24).toString("base64url");
let sam, dad, eve;
before(async () => {
  [sam, dad, eve] = await Promise.all([makePlayer("Sam"), makePlayer("Dad"), makePlayer("Eve")]);
});

// Sam makes a puzzle for someone new and gets a link.
async function makeLink(creator = sam, label = "Dad", board = sampleBoard("SH")) {
  const d = await rpc(creator.client, "save_friend_draft", {
    p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: board,
  });
  return rpc(creator.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: label });
}
const open = (client, token, key) => rpc(client, "open_shared_puzzle", { p_token: token, p_guest_key: key });
const start = (client, token, key, difficulty = "easy") =>
  rpc(client, "start_shared_puzzle", { p_token: token, p_guest_key: key, p_difficulty: difficulty });
const guess = (client, token, key, guessNo, board, clues, extras = []) =>
  rpc(client, "submit_shared_guess", { p_token: token, p_guest_key: key, p_guess_no: guessNo, p_board: board, p_extras: extras, p_clues: clues });
const creatorView = (puzzleId) => rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
const row = async (id) => (await admin.from("friend_puzzles").select("*").eq("id", id).single()).data;

test("a link: opening never claims it; the deliberate start does, for that browser only", async () => {
  const link = await makeLink();
  assert.match(link.token, /^[A-Za-z0-9_-]{24}$/);
  const k1 = guestKey(), k2 = guestKey();
  // Opened (and re-opened) by two browsers: both see it available, nothing recorded.
  for (const k of [k1, k2, k1]) {
    const v = await open(anon(), link.token, k);
    assert.equal(v.status, "available");
    assert.equal(v.creator_name, "Sam");
    assert.equal(v.puzzle, undefined, "no puzzle content before starting");
  }
  let r = await row(link.puzzle_id);
  assert.equal(r.guest_key_hash, null); assert.equal(r.started_at, null); assert.equal(r.recipient_seen_at, null);

  await start(anon(), link.token, k1, "standard");
  r = await row(link.puzzle_id);
  assert.ok(r.guest_key_hash && r.guest_key_hash !== k1, "only a hash of the key is stored");
  const mine = await open(anon(), link.token, k1);
  assert.equal(mine.status, "yours");
  assert.equal(mine.puzzle.difficulty, "standard");
  assert.equal(Object.keys(mine.puzzle.cards).length, 5, "Standard deals one bonus card");
  assert.equal(mine.puzzle.solution, null, "no answer before finishing");
  assert.equal(mine.puzzle.authored_cards, null);
  assert.equal(mine.puzzle.bonus_cards, null);
  // The forwarded link in another browser can't take over.
  assert.equal((await open(anon(), link.token, k2)).status, "taken");
  assert.equal(await rpcError(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: k2, p_difficulty: "easy" }), "taken");
  assert.equal(await rpcError(anon(), "submit_shared_guess", {
    p_token: link.token, p_guest_key: k2, p_guess_no: 1, p_board: [], p_extras: [], p_clues: [] }), "not_found");
  // Same browser again: a harmless no-op; a different difficulty is refused.
  assert.equal((await start(anon(), link.token, k1, "standard")).already_chosen, true);
  assert.equal(await rpcError(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: k1, p_difficulty: "easy" }), "difficulty_locked");
});

test("a guest plays it through: judged on the server; the answer only at the end; the sender replays the guesses", async () => {
  const link = await makeLink();
  const k = guestKey();
  await start(anon(), link.token, k, "easy");
  const answer = await creatorView(link.puzzle_id);
  const clues = (await open(anon(), link.token, k)).puzzle.clues;
  const wrong = await guess(anon(), link.token, k, 1, wrongBoard(answer), clues);
  assert.equal(wrong.lives_left, 2);
  assert.equal(wrong.solution, null, "no answer after a wrong guess");
  // A retry of the same guess returns the same result; a stale number is refused.
  assert.equal((await guess(anon(), link.token, k, 1, wrongBoard(answer), clues)).lives_left, 2);
  assert.equal(await rpcError(anon(), "submit_shared_guess", {
    p_token: link.token, p_guest_key: k, p_guess_no: 3, p_board: solvedBoard(answer), p_extras: [], p_clues: clues }), "stale_guess");
  // Before it's over, the sender doesn't see the guesses either.
  assert.equal((await creatorView(link.puzzle_id)).guesses, null);
  const won = await guess(anon(), link.token, k, 2, solvedBoard(answer), clues);
  assert.equal(won.outcome, "won");
  assert.ok(won.solution, "the answer once it's over");
  assert.equal(won.friendship, null, "no streaks for a guest");
  const after = await open(anon(), link.token, k);
  assert.equal(after.puzzle.outcome, "won");
  assert.ok(after.puzzle.solution);
  const replay = await creatorView(link.puzzle_id);
  assert.equal(replay.guesses.length, 2, "the sender replays both guesses");
  assert.equal(replay.solver_name, "Dad", "shown with the sender's label");
  assert.equal(replay.shared, true);
  const links = await rpc(sam.client, "list_share_links");
  assert.equal(links.find((l) => l.puzzle_id === link.puzzle_id).state, "finished");
  assert.equal(await rpcError(anon(), "submit_shared_guess", {
    p_token: link.token, p_guest_key: k, p_guess_no: 3, p_board: solvedBoard(answer), p_extras: [], p_clues: clues }), "already_finished");
});

test("strangers: the link code alone, or the puzzle's id, gives nothing", async () => {
  const link = await makeLink();
  const k = guestKey();
  await start(anon(), link.token, k);
  // Signed-in strangers can't open, choose or guess by id (the null-safe checks).
  assert.equal(await rpcError(eve.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id }), "not_found");
  assert.equal(await rpcError(eve.client, "choose_friend_difficulty", { p_puzzle_id: link.puzzle_id, p_difficulty: "easy" }), "not_found");
  assert.equal(await rpcError(eve.client, "submit_friend_guess", {
    p_puzzle_id: link.puzzle_id, p_guess_no: 1, p_board: [], p_extras: [], p_clues: [] }), "not_found");
  // No table reads for anyone but the sender.
  for (const client of [anon(), eve.client]) {
    const { data } = await client.from("friend_puzzles").select("id").eq("id", link.puzzle_id);
    assert.deepEqual(data ?? [], []);
    const { data: g } = await client.from("friend_guesses").select("guess_no").eq("puzzle_id", link.puzzle_id);
    assert.deepEqual(g ?? [], []);
  }
  // Guests reach nothing else.
  assert.match(await rpcError(anon(), "list_share_links"), /permission denied/);
  assert.match(await rpcError(anon(), "get_friends_inbox"), /permission denied/);
  assert.match(await rpcError(anon(), "claim_shared_puzzle", { p_token: link.token, p_guest_key: k }), /permission denied/);
  assert.equal((await open(anon(), "x".repeat(24), k)).status, "not_found");
  assert.equal(await rpcError(anon(), "open_shared_puzzle", { p_token: link.token, p_guest_key: "short" }), "invalid_guest");
  // The sender's own link, opened signed in, isn't playable by them.
  assert.equal((await open(sam.client, link.token, guestKey())).status, "own");
});

test("saving: needs this browser's key and a finished game; once; becomes friends; no streak", async () => {
  const link = await makeLink();
  const k = guestKey();
  await start(anon(), link.token, k);
  const answer = await creatorView(link.puzzle_id);
  const clues = (await open(anon(), link.token, k)).puzzle.clues;
  assert.equal(await rpcError(dad.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k }), "not_finished");
  await guess(anon(), link.token, k, 1, solvedBoard(answer), clues);
  // Someone holding only the link (another browser's key) can't take it.
  assert.equal(await rpcError(eve.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: guestKey() }), "not_found");
  assert.equal(await rpcError(sam.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k }), "own");
  const saved = await rpc(dad.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k });
  assert.equal(saved.puzzle_id, link.puzzle_id);
  assert.equal((await rpc(dad.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k })).already_saved, true, "a repeat is a no-op");
  assert.equal(await rpcError(eve.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k }), "not_found", "nobody else afterwards");
  // Now an ordinary finished friend puzzle between Sam and Dad.
  const view = await rpc(dad.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id });
  assert.equal(view.role, "solver"); assert.equal(view.outcome, "won");
  const inbox = await rpc(dad.client, "get_friends_inbox");
  const f = inbox.friends.find((x) => x.friend_name === "Sam");
  assert.ok(f, "Dad and Sam are friends");
  assert.equal(f.daily_streak, 0, "a guest finish doesn't start a Friend Streak");
  assert.equal(f.next_action, "make_back", "Dad's turn to make one back");
  const history = await rpc(dad.client, "list_friend_history", { p_friendship_id: f.friendship_id });
  assert.equal(history.length, 1, "exactly one puzzle, no duplicate");
  assert.ok(!(await rpc(sam.client, "list_share_links")).some((l) => l.puzzle_id === link.puzzle_id), "no longer a pending link");
  // The link now says it's been saved; Dad is pointed to it.
  assert.equal((await open(anon(), link.token, k)).status, "saved");
  assert.equal((await open(dad.client, link.token, k)).status, "saved_yours");
  // Already friends: a second link joins the same friendship, no second friendship.
  const second = await makeLink();
  const k2 = guestKey();
  await start(anon(), second.token, k2);
  const a2 = await creatorView(second.puzzle_id);
  await guess(anon(), second.token, k2, 1, solvedBoard(a2), (await open(anon(), second.token, k2)).puzzle.clues);
  assert.equal((await rpc(dad.client, "claim_shared_puzzle", { p_token: second.token, p_guest_key: k2 })).friendship_id, f.friendship_id);
});

test("recovery: a fresh link clears an unfinished game; the old link dies; a finished result is never cleared", async () => {
  const link = await makeLink();
  const k = guestKey();
  await start(anon(), link.token, k);
  const answer = await creatorView(link.puzzle_id);
  await guess(anon(), link.token, k, 1, wrongBoard(answer), (await open(anon(), link.token, k)).puzzle.clues);
  const fresh = await rpc(sam.client, "refresh_share_link", { p_puzzle_id: link.puzzle_id });
  assert.notEqual(fresh.token, link.token);
  assert.equal((await open(anon(), link.token, k)).status, "not_found", "old link is dead");
  const other = guestKey();
  assert.equal((await open(anon(), fresh.token, other)).status, "available", "a new browser can start");
  await start(anon(), fresh.token, other);
  const clues = (await open(anon(), fresh.token, other)).puzzle.clues;
  const a2 = await creatorView(link.puzzle_id);
  assert.equal((await guess(anon(), fresh.token, other, 1, solvedBoard(a2), clues)).outcome, "won", "starts from guess 1 again");
  assert.equal(await rpcError(sam.client, "refresh_share_link", { p_puzzle_id: link.puzzle_id }), "already_finished");
  assert.equal(await rpcError(eve.client, "refresh_share_link", { p_puzzle_id: link.puzzle_id }), "not_found");
  // Stop sharing: closes at once.
  const stopped = await makeLink();
  await rpc(sam.client, "stop_share_link", { p_puzzle_id: stopped.puzzle_id });
  assert.equal((await open(anon(), stopped.token, guestKey())).status, "revoked");
  assert.equal(await rpcError(anon(), "start_shared_puzzle", { p_token: stopped.token, p_guest_key: guestKey(), p_difficulty: "easy" }), "not_found");
});

test("expiry after 30 days: an unfinished game just ends; nothing can be continued or saved", async () => {
  const link = await makeLink();
  const k = guestKey();
  await start(anon(), link.token, k);
  const r = await row(link.puzzle_id);
  assert.ok(Math.abs(new Date(r.share_expires_at) - new Date(r.sent_at) - 30 * 86400e3) < 5000, "30 days from when it was made");
  await admin.from("friend_puzzles").update({ share_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", link.puzzle_id);
  assert.equal((await open(anon(), link.token, k)).status, "expired");
  assert.equal(await rpcError(anon(), "submit_shared_guess", {
    p_token: link.token, p_guest_key: k, p_guess_no: 1, p_board: [], p_extras: [], p_clues: [] }), "expired");
  assert.equal(await rpcError(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: guestKey(), p_difficulty: "easy" }), "expired");
  assert.equal(await rpcError(dad.client, "claim_shared_puzzle", { p_token: link.token, p_guest_key: k }), "expired");
  const after = await row(link.puzzle_id);
  assert.equal(after.outcome, null, "not turned into a loss");
  assert.equal((await rpc(sam.client, "list_share_links")).find((l) => l.puzzle_id === link.puzzle_id).state, "expired");
  // The sender can still give it a fresh 30 days.
  const fresh = await rpc(sam.client, "refresh_share_link", { p_puzzle_id: link.puzzle_id });
  assert.equal((await open(anon(), fresh.token, guestKey())).status, "available");
});

test("friend puzzles behave as before alongside links", async () => {
  const [ann, bo] = await Promise.all([makePlayer("Ann"), makePlayer("Bo")]);
  const fid = await befriend(ann, bo);
  // A friend draft and a someone-new draft live side by side.
  await rpc(ann.client, "save_friend_draft", { p_friendship_id: fid, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("FA") });
  await rpc(ann.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("FB") });
  assert.equal((await rpc(ann.client, "get_friend_draft", { p_friendship_id: fid })).board.clues[0], "FATOP");
  assert.equal((await rpc(ann.client, "get_friend_draft", { p_friendship_id: null })).board.clues[0], "FBTOP");
  // A link draft can't be "sent" to a friend.
  const d = await rpc(ann.client, "get_friend_draft", { p_friendship_id: null });
  assert.equal(await rpcError(ann.client, "send_friend_puzzle", { p_draft_id: d.id, p_version: d.version }), "not_found");
});
