// Move logs for the animated replay (migration 20261014090000_friend_move_logs.sql),
// through the real API against the local stack. Run with test:friends:api.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  admin, anon, rpc, rpcError, makePlayer, befriend, sampleBoard, sendAndStart, solvedBoard, wrongBoard, guess, friendshipRow,
} from "./helpers.mjs";

// Each test gets its own pair, so one unfinished puzzle never blocks the next.
let deb, sam, eve, fid;
const pair = async () => {
  [deb, sam] = [await makePlayer("Deb"), await makePlayer("Sam")];
  fid = await befriend(deb, sam);
};
before(async () => { eve = await makePlayer("Eve"); });
beforeEach(pair);

const session = () => randomBytes(9).toString("base64url");
const save = (who, pid, s, from, actions) =>
  rpc(who.client, "save_friend_moves", { p_puzzle_id: pid, p_session: s, p_from: from, p_actions: actions });
const moves = (who, pid) => rpc(who.client, "get_friend_moves", { p_puzzle_id: pid });
const logRow = async (pid) => (await admin.from("friend_move_logs").select("*").eq("puzzle_id", pid).maybeSingle()).data;
const puzzleRow = async (pid) => (await admin.from("friend_puzzles").select("*").eq("id", pid).single()).data;
const t = (s, d = 100) => ({ k: "t", s, d });

test("the solver saves moves in batches; a resent batch is stored once; a lost one is marked", async () => {
  const pid = await sendAndStart(deb, sam, fid, sampleBoard("MV"), "standard");
  const s1 = session();
  assert.deepEqual(await save(sam, pid, s1, 0, [{ k: "s", b: ["x:0"], c: ["A", "B", "C", "D"], d: 0 }, t(1), t(2)]), { stored: 3 });
  // The same batch again (a refresh before the reply arrived), and an overlapping one.
  assert.deepEqual(await save(sam, pid, s1, 0, [{ k: "s", d: 0 }, t(1), t(2)]), { stored: 3 });
  assert.deepEqual(await save(sam, pid, s1, 2, [t(2), t(3)]), { stored: 4 });
  // A second page load (its own session), then one that skipped ahead.
  const s2 = session();
  await save(sam, pid, s2, 0, [{ k: "r", d: 50 }]);
  await save(sam, pid, s2, 3, [t(0)]);
  const row = await logRow(pid);
  assert.deepEqual(row.actions.map((a) => a.k + (a.s ?? "")), ["s", "t1", "t2", "t3", "r", "gap", "t0"]);

  // Nobody else can write: the creator, a stranger, a guest.
  assert.equal(await rpcError(deb.client, "save_friend_moves", { p_puzzle_id: pid, p_session: s1, p_from: 9, p_actions: [t(0)] }), "not_found");
  assert.equal(await rpcError(eve.client, "save_friend_moves", { p_puzzle_id: pid, p_session: s1, p_from: 9, p_actions: [t(0)] }), "not_found");
  const { error } = await anon().rpc("save_friend_moves", { p_puzzle_id: pid, p_session: s1, p_from: 9, p_actions: [t(0)] });
  assert.ok(error, "signed-out callers can't save friend moves");
  // Junk is refused.
  for (const bad of [[{ k: "evil" }], [1, 2], { k: "t" }, Array.from({ length: 201 }, () => t(0))]) {
    assert.equal(await rpcError(sam.client, "save_friend_moves", { p_puzzle_id: pid, p_session: session(), p_from: 0, p_actions: bad }), "invalid_moves");
  }
  assert.equal(await rpcError(sam.client, "save_friend_moves", { p_puzzle_id: pid, p_session: "bad session!", p_from: 0, p_actions: [t(0)] }), "invalid_moves");
  // The table itself is closed to clients.
  const direct = await sam.client.from("friend_move_logs").select("*");
  assert.ok(direct.error || direct.data.length === 0, "no direct table access");
});

test("the log is readable only once finished, by the two players; reading changes nothing", async () => {
  const pid = await sendAndStart(deb, sam, fid, sampleBoard("RD"), "easy");
  const creatorView = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: pid });
  await save(sam, pid, session(), 0, [{ k: "s", d: 0 }, t(0)]);
  // Not before the finish — not even for the solver — so nothing leaks early.
  for (const who of [deb, sam, eve]) assert.equal(await rpcError(who.client, "get_friend_moves", { p_puzzle_id: pid }), "not_found");

  await guess(sam, pid, 1, wrongBoard(creatorView), creatorView.clues, []);
  const fin = await guess(sam, pid, 2, solvedBoard(creatorView), creatorView.clues, []);
  assert.equal(fin.outcome, "won");
  // The last batch, sent alongside the final guess, still lands.
  await save(sam, pid, session(), 0, [{ k: "g", n: 2, d: 10 }]);

  const before = await puzzleRow(pid);
  const friendship = await friendshipRow(fid);
  const forCreator = await moves(deb, pid);
  assert.deepEqual(forCreator.actions.map((a) => a.k), ["s", "t", "g"]);
  assert.equal(forCreator.truncated, false);
  assert.deepEqual(await moves(sam, pid), forCreator);
  assert.equal(await rpcError(eve.client, "get_friend_moves", { p_puzzle_id: pid }), "not_found");
  const { error } = await anon().rpc("get_friend_moves", { p_puzzle_id: pid });
  assert.ok(error, "signed-out callers can't read moves");
  // Reading the log never touches the result, the viewed status or the streaks.
  assert.deepEqual(await puzzleRow(pid), before);
  assert.deepEqual(await friendshipRow(fid), friendship);
  assert.equal((await admin.from("notification_outbox").select("id").eq("puzzle_id", pid).eq("kind", "result")).data.length <= 1, true);
});

test("an older game with no log reads as null (the guess-by-guess replay)", async () => {
  const pid = await sendAndStart(deb, sam, fid, sampleBoard("OL"), "easy");
  const v = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: pid });
  await guess(sam, pid, 1, solvedBoard(v), v.clues, []);
  assert.equal(await moves(deb, pid), null);
});

test("a puzzle played by link: the guest's browser saves; a fresh link clears the log", async () => {
  const d = await rpc(deb.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("GL") });
  const link = await rpc(deb.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "Pat" });
  const key = randomBytes(24).toString("base64url");
  const other = randomBytes(24).toString("base64url");
  const shared = (k, s, from, actions) => rpc(anon(), "save_shared_moves", { p_token: link.token, p_guest_key: k, p_session: s, p_from: from, p_actions: actions });

  // Before starting there's nothing to record.
  assert.equal(await rpcError(anon(), "save_shared_moves", { p_token: link.token, p_guest_key: key, p_session: session(), p_from: 0, p_actions: [t(0)] }), "not_found");
  await rpc(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: key, p_difficulty: "easy" });
  assert.deepEqual(await shared(key, session(), 0, [{ k: "s", d: 0 }, t(1)]), { stored: 2 });
  // Another browser with the link alone can't write.
  assert.equal(await rpcError(anon(), "save_shared_moves", { p_token: link.token, p_guest_key: other, p_session: session(), p_from: 0, p_actions: [t(0)] }), "not_found");
  assert.equal((await logRow(link.puzzle_id)).actions.length, 2);

  // A fresh link (the guest was stuck) clears the unfinished game, log included.
  await rpc(deb.client, "refresh_share_link", { p_puzzle_id: link.puzzle_id });
  assert.equal(await logRow(link.puzzle_id), null);

  // Played to the end on the new link: the sender can watch it.
  const fresh = (await rpc(deb.client, "list_share_links")).find((l) => l.puzzle_id === link.puzzle_id);
  await rpc(anon(), "start_shared_puzzle", { p_token: fresh.token, p_guest_key: key, p_difficulty: "easy" });
  await rpc(anon(), "save_shared_moves", { p_token: fresh.token, p_guest_key: key, p_session: session(), p_from: 0, p_actions: [{ k: "s", d: 0 }, t(2)] });
  const cv = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id });
  await rpc(anon(), "submit_shared_guess", { p_token: fresh.token, p_guest_key: key, p_guess_no: 1, p_board: solvedBoard(cv), p_extras: [], p_clues: cv.clues });
  assert.deepEqual((await moves(deb, link.puzzle_id)).actions.map((a) => a.k + (a.s ?? "")), ["s", "t2"]);
});
