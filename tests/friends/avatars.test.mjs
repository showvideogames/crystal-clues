// Profile avatars and the Friends dot's "unseen" rules. Local stack only (helpers.mjs).
// Rules under test: supabase/migrations/20261013090000_profile_avatars.sql, and
// (for the dot) the inbox's `unread` count from 20260926090000_friend_puzzles.sql.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { admin, anon, rpc, rpcError, makePlayer, sampleBoard, befriend, sendPuzzle, solvedBoard } from "./helpers.mjs";

const open = (link, key = randomBytes(24).toString("base64url")) => rpc(anon(), "open_shared_puzzle", { p_token: link.token, p_guest_key: key });

const unread = async (p) => (await rpc(p.client, "get_friends_inbox")).unread;

let ana, ben, cy, dee;
before(async () => {
  [ana, ben, cy, dee] = await Promise.all([makePlayer("Ana"), makePlayer("Ben"), makePlayer("Cy"), makePlayer("Dee")]);
});

test("avatars: everyone starts on the default ball; choices are validated and saved to the account", async () => {
  const me = await rpc(ana.client, "get_my_profile");
  assert.equal(me.avatar, null, "existing and new players get the initialed ball");

  const dog = await rpc(ana.client, "set_avatar", { p_avatar: "dog" });
  assert.equal(dog.avatar, "dog");
  assert.equal((await rpc(ana.client, "get_my_profile")).avatar, "dog", "kept on the account");
  for (const key of ["cat", "fox", "owl", "frog", "star"]) {
    assert.equal((await rpc(ana.client, "set_avatar", { p_avatar: key })).avatar, key);
  }
  // Back to the default, by name or by nothing.
  assert.equal((await rpc(ana.client, "set_avatar", { p_avatar: "ball" })).avatar, null);
  await rpc(ana.client, "set_avatar", { p_avatar: "fox" });
  assert.equal((await rpc(ana.client, "set_avatar", { p_avatar: null })).avatar, null);

  for (const bad of ["dragon", "DOG", "../x", "<img>", "dog ; drop table profiles"]) {
    assert.equal(await rpcError(ana.client, "set_avatar", { p_avatar: bad }), "invalid_avatar", bad);
  }
  // Only through the function: a signed-in player has no write grant on profiles.
  const { error } = await ana.client.from("profiles").update({ avatar: "owl" }).eq("id", ana.id);
  assert.ok(error, "a direct table update is refused");
  assert.equal((await rpc(ana.client, "get_my_profile")).avatar, null);
});

test("avatars: friends see each other's choice, and nobody else's", async () => {
  await befriend(ana, ben);
  await rpc(ana.client, "set_avatar", { p_avatar: "owl" });
  await rpc(ben.client, "set_avatar", { p_avatar: "frog" });
  await rpc(cy.client, "set_avatar", { p_avatar: "cat" });

  const forBen = await rpc(ben.client, "get_friend_avatars");
  assert.deepEqual(forBen, { [ana.id]: "owl", [ben.id]: "frog" }, "me and my friend only");
  const forAna = await rpc(ana.client, "get_friend_avatars");
  assert.deepEqual(forAna, { [ana.id]: "owl", [ben.id]: "frog" });
  assert.equal(forBen[cy.id], undefined, "a stranger's choice stays private");

  // The inbox names the friend's id, so a card can look the avatar up.
  const inbox = await rpc(ben.client, "get_friends_inbox");
  assert.equal(inbox.friends[0].friend_id, ana.id);
  assert.equal(inbox.me.avatar, "frog");

  // A player on the default ball has no entry: the app draws the initialed ball.
  await rpc(ana.client, "set_avatar", { p_avatar: "ball" });
  assert.deepEqual(await rpc(ben.client, "get_friend_avatars"), { [ben.id]: "frog" });

  // Signed-out callers can't read avatars, or change them: the database refuses outright.
  assert.match(await rpcError(anon(), "get_friend_avatars"), /permission denied/);
  assert.match(await rpcError(anon(), "set_avatar", { p_avatar: "dog" }), /permission denied/);
});

test("avatars: an invite shows who it's from, avatar included, before it's accepted", async () => {
  await rpc(dee.client, "set_avatar", { p_avatar: "star" });
  const invite = await rpc(dee.client, "create_friend_invite");
  const seen = await rpc(anon(), "get_friend_invite", { p_token: invite.token });
  assert.equal(seen.inviter_name, "Dee");
  assert.equal(seen.inviter_avatar, "star");
  await rpc(dee.client, "set_avatar", { p_avatar: "ball" });
  assert.equal((await rpc(anon(), "get_friend_invite", { p_token: invite.token })).inviter_avatar, null);
});

test("the Friends dot: each unseen puzzle or result counts until that one is opened; the hub alone clears nothing", async () => {
  const [a, b, c] = await Promise.all([makePlayer("Una"), makePlayer("Val"), makePlayer("Wes")]);
  const ab = await befriend(a, b);
  const ac = await befriend(a, c);
  assert.equal(await unread(a), 0);

  // Two friends each send a puzzle: two things to play.
  const fromB = await sendPuzzle(b, ab, sampleBoard("B"));
  const fromC = await sendPuzzle(c, ac, sampleBoard("C"));
  assert.equal(await unread(a), 2);
  // Looking at the hub (the inbox, the friend list, the history) clears nothing.
  for (let i = 0; i < 3; i++) await rpc(a.client, "get_friends_inbox");
  await rpc(a.client, "list_friend_history", { p_friendship_id: ab });
  await rpc(a.client, "list_share_links");
  assert.equal(await unread(a), 2, "opening the hub doesn't clear everything");
  // Opening one puzzle clears that one only.
  await rpc(a.client, "open_friend_puzzle", { p_puzzle_id: fromB });
  assert.equal(await unread(a), 1);
  await rpc(a.client, "open_friend_puzzle", { p_puzzle_id: fromB });
  assert.equal(await unread(a), 1, "opening it again changes nothing");
  await rpc(a.client, "open_friend_puzzle", { p_puzzle_id: fromC });
  assert.equal(await unread(a), 0, "the dot goes when the last one is viewed");
  // It never needed a push subscription: there is none for anyone here.

  // A friend's finished puzzle is a new result to watch, until it is opened.
  await rpc(a.client, "choose_friend_difficulty", { p_puzzle_id: fromB, p_difficulty: "easy" });
  const answer = await rpc(b.client, "open_friend_puzzle", { p_puzzle_id: fromB });
  const view = await rpc(a.client, "open_friend_puzzle", { p_puzzle_id: fromB });
  await rpc(a.client, "submit_friend_guess", {
    p_puzzle_id: fromB, p_guess_no: 1, p_board: solvedBoard(answer),
    p_extras: view.card_order.filter((id) => !solvedBoard(answer).some((s) => s.cardId === id)).map((cardId) => ({ cardId, orientation: 0 })),
    p_clues: view.clues,
  });
  assert.equal(await unread(b), 1, "the sender has a result to watch");
  await rpc(b.client, "get_friends_inbox");
  assert.equal(await unread(b), 1);
  await rpc(b.client, "open_friend_puzzle", { p_puzzle_id: fromB });
  assert.equal(await unread(b), 0);
});

test("the Friends dot: a guest's finished puzzle counts and clears only when the sender opens it", async () => {
  const sender = await makePlayer("Gwen");
  const finishGuestGame = async (label) => {
    const d = await rpc(sender.client, "save_friend_draft", {
      p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard(label),
    });
    const link = await rpc(sender.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: label });
    const key = randomBytes(24).toString("base64url");
    await rpc(anon(), "start_shared_puzzle", { p_token: link.token, p_guest_key: key, p_difficulty: "easy" });
    const answer = await rpc(sender.client, "open_friend_puzzle", { p_puzzle_id: link.puzzle_id });
    const mine = await rpc(anon(), "open_shared_puzzle", { p_token: link.token, p_guest_key: key });
    const board = solvedBoard(answer);
    await rpc(anon(), "submit_shared_guess", {
      p_token: link.token, p_guest_key: key, p_guess_no: 1, p_board: board,
      p_extras: mine.puzzle.card_order.filter((id) => !board.some((s) => s.cardId === id)).map((cardId) => ({ cardId, orientation: 0 })),
      p_clues: mine.puzzle.clues,
    });
    return { ...link, key };
  };
  const listed = async (id) => (await rpc(sender.client, "list_share_links")).find((l) => l.puzzle_id === id);

  assert.equal(await unread(sender), 0);
  const one = await finishGuestGame("One");
  const two = await finishGuestGame("Two");
  assert.equal(await unread(sender), 2, "both guest results are new");
  await rpc(sender.client, "get_friends_inbox");
  await rpc(sender.client, "list_share_links");
  assert.equal(await unread(sender), 2, "the hub alone clears nothing");

  await rpc(sender.client, "open_friend_puzzle", { p_puzzle_id: one.puzzle_id });
  assert.equal(await unread(sender), 1);
  assert.equal((await listed(one.puzzle_id)).seen_result, true);
  assert.equal((await listed(two.puzzle_id)).seen_result, false);

  // Stopping sharing turns the link off for the guest, nothing more.
  await rpc(sender.client, "stop_share_link", { p_puzzle_id: two.puzzle_id });
  assert.equal((await open(two)).status, "revoked", "the guest's link is off");
  assert.equal(await rpcError(anon(), "start_shared_puzzle", { p_token: two.token, p_guest_key: randomBytes(24).toString("base64url"), p_difficulty: "easy" }), "not_found");
  assert.equal(await unread(sender), 1, "an unwatched result stays new after sharing stops");
  await rpc(sender.client, "get_friends_inbox");
  await rpc(sender.client, "list_share_links");
  assert.equal(await unread(sender), 1, "the hub alone still clears nothing");
  const kept = await listed(two.puzzle_id);
  assert.ok(kept, "the finished result stays on the sender's list");
  assert.equal(kept.state, "revoked");
  assert.ok(kept.finished_at);
  assert.equal(kept.seen_result, false, "and is still marked new");

  // The sender's replay still works, and opening it is what clears the dot.
  const replay = await rpc(sender.client, "open_friend_puzzle", { p_puzzle_id: two.puzzle_id });
  assert.equal(replay.guesses.length, 1, "the guesses can still be replayed");
  assert.equal(replay.outcome, "won");
  assert.equal(await unread(sender), 0);
  assert.equal((await listed(two.puzzle_id)).seen_result, true);
  // An unfinished link that is stopped is simply gone from the list.
  const d = await rpc(sender.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("U") });
  const unfinished = await rpc(sender.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "U" });
  await rpc(sender.client, "stop_share_link", { p_puzzle_id: unfinished.puzzle_id });
  assert.equal(await listed(unfinished.puzzle_id), undefined);
});

test("the Friends dot: an unopened result is always listed, even beyond the 20 newest links", async () => {
  const sender = await makePlayer("Hal");
  const d = await rpc(sender.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("H") });
  const first = await rpc(sender.client, "create_share_link", { p_draft_id: d.id, p_version: d.version, p_label: "First" });
  const key = randomBytes(24).toString("base64url");
  await rpc(anon(), "start_shared_puzzle", { p_token: first.token, p_guest_key: key, p_difficulty: "easy" });
  const answer = await rpc(sender.client, "open_friend_puzzle", { p_puzzle_id: first.puzzle_id });
  const mine = await rpc(anon(), "open_shared_puzzle", { p_token: first.token, p_guest_key: key });
  const board = solvedBoard(answer);
  await rpc(anon(), "submit_shared_guess", {
    p_token: first.token, p_guest_key: key, p_guess_no: 1, p_board: board,
    p_extras: mine.puzzle.card_order.filter((id) => !board.some((s) => s.cardId === id)).map((cardId) => ({ cardId, orientation: 0 })),
    p_clues: mine.puzzle.clues,
  });
  await rpc(sender.client, "stop_share_link", { p_puzzle_id: first.puzzle_id });
  for (let i = 0; i < 21; i++) {
    const dd = await rpc(sender.client, "save_friend_draft", { p_friendship_id: null, p_draft_id: null, p_version: null, p_title: "", p_board: sampleBoard("N" + i) });
    const l = await rpc(sender.client, "create_share_link", { p_draft_id: dd.id, p_version: dd.version, p_label: "N" + i });
    // Expired links stay on the list but don't count toward the cap of 20 active ones.
    await admin.from("friend_puzzles").update({ share_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", l.puzzle_id);
  }
  const links = await rpc(sender.client, "list_share_links");
  assert.equal(links.filter((l) => l.state === "expired").length, 20, "the list itself is capped at the 20 newest links");
  const old = links.find((l) => l.puzzle_id === first.puzzle_id);
  assert.ok(old, "the old unopened result is still on the list, as a 21st row");
  assert.equal(old.state, "revoked");
  assert.equal(await unread(sender), 1);
});
