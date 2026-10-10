// Friend-exchange server behaviour, end to end through the real API with
// real JWTs, against the local Supabase stack. Run: npm run test:friends:api
import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  admin, anon, rpc, rpcError, makePlayer, befriend, sampleBoard, sendPuzzle, sendAndStart, choose,
  solvedBoard, wrongBoard, rotateBoard, guess, friendshipRow,
} from "./helpers.mjs";
import { dispatchPush } from "../../supabase/functions/push-dispatch/dispatch.js";
import { makeAccount, createAuthUser, uniqueEmail, signIn } from "../db/helpers.mjs";

let deb, sam, eve;

before(async () => {
  [deb, sam, eve] = await Promise.all([makePlayer("Deb"), makePlayer("Sam"), makePlayer("Eve")]);
});

// ── Invitations ────────────────────────────────────────────────────────

test("invites: preview by link, accept once, never twice or by yourself", async () => {
  const invite = await rpc(deb.client, "create_friend_invite");
  assert.match(invite.token, /^[0-9a-f]{36}$/);

  const preview = await rpc(anon(), "get_friend_invite", { p_token: invite.token });
  assert.deepEqual(preview, { status: "open", inviter_name: "Deb", friendship_id: null });
  assert.equal((await rpc(deb.client, "get_friend_invite", { p_token: invite.token })).status, "own");
  assert.equal(await rpcError(deb.client, "accept_friend_invite", { p_token: invite.token }), "own_invite");

  // Two people racing for the same link: exactly one wins.
  const [a, b] = await Promise.all([
    sam.client.rpc("accept_friend_invite", { p_token: invite.token }),
    eve.client.rpc("accept_friend_invite", { p_token: invite.token }),
  ]);
  const winners = [a, b].filter((r) => !r.error);
  assert.equal(winners.length, 1, "only one person can use an invite");
  assert.match([a, b].find((r) => r.error).error.message, /^invite_used/);

  const winner = a.error ? eve : sam;
  const again = await rpc(winner.client, "accept_friend_invite", { p_token: invite.token });
  assert.equal(again.friendship_id, winners[0].data.friendship_id, "re-accepting is idempotent");

  // Clean up so the rest of the suite starts from Deb + Sam only.
  await admin.from("friendships").delete().eq("id", again.friendship_id);
  assert.match(await rpcError(anon(), "create_friend_invite"), /permission denied/);
  assert.equal((await rpc(anon(), "get_friend_invite", { p_token: "nope" })).status, "not_found");
});

test("only Cluevoyance accounts take part: a bare sign-in is refused", async () => {
  // An auth user that never came through the shared sign-in (no
  // custom:platform identity, no accounts row) is not a player.
  const bare = await createAuthUser(uniqueEmail("bare"));
  const client = await signIn(bare);
  assert.equal(await rpcError(client, "set_display_name", { p_name: "Bare" }), "not_signed_in");
  assert.equal(await rpcError(client, "create_friend_invite"), "not_signed_in");
  assert.equal(await rpcError(client, "get_friends_inbox"), "not_signed_in");
  const invite = await rpc(deb.client, "create_friend_invite");
  assert.equal(await rpcError(client, "accept_friend_invite", { p_token: invite.token }), "not_signed_in");
});

test("a player needs a display name before inviting", async () => {
  const { client } = await makeAccount("noname");
  assert.equal(await rpcError(client, "create_friend_invite"), "no_profile");
  assert.equal(await rpcError(client, "set_display_name", { p_name: "   " }), "invalid_name");
  assert.equal(await rpcError(client, "set_display_name", { p_name: "<script>" }), "invalid_name");
});

// ── The main exchange ──────────────────────────────────────────────────

test("full exchange: private drafts, one send, hidden answer, judged guesses, shared streaks", async (t) => {
  const fid = await befriend(deb, sam);

  await t.test("both see each other with nothing to do but make one", async () => {
    const di = await rpc(deb.client, "get_friends_inbox");
    const si = await rpc(sam.client, "get_friends_inbox");
    assert.equal(di.friends.length, 1);
    assert.equal(di.friends[0].friend_name, "Sam");
    assert.equal(si.friends[0].friend_name, "Deb");
    assert.equal(di.friends[0].next_action, "make");
    assert.equal(di.friends[0].daily_streak, 0);
    assert.equal(di.friends[0].team_win_streak, 0);
    assert.equal(di.friends[0].deadline_at, null);
  });

  await t.test("outsiders cannot see the friendship, drafts or puzzles", async () => {
    assert.deepEqual((await eve.client.from("friendships").select("*")).data, []);
    assert.equal(await rpcError(eve.client, "get_friend_draft", { p_friendship_id: fid }), "not_found");
    assert.equal((await rpc(eve.client, "get_friends_inbox")).friends.length, 0);
    // Direct writes are not possible for anyone.
    const ins = await sam.client.from("friendships").insert({ user_a: sam.id, user_b: eve.id });
    assert.ok(ins.error, "clients cannot insert friendships directly");
  });

  const board = sampleBoard("DEB");
  let draft;
  await t.test("drafts are private and guarded against simultaneous edits", async () => {
    draft = await rpc(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: null, p_version: null, p_title: "Warm-up",
      p_board: { ...board, clues: ["", "", "", ""] },
    });
    assert.equal(draft.version, 1);
    assert.deepEqual((await sam.client.from("friend_puzzle_drafts").select("*")).data, [], "Sam can't read Deb's draft");
    assert.equal(await rpcError(sam.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: 1, p_title: "", p_board: board,
    }), "draft_conflict", "Sam can't overwrite Deb's draft");

    // A second tab still on version 1 is refused once the first saves.
    const v2 = await rpc(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: 1, p_title: "Warm-up",
      p_board: { ...board, clues: ["", "", "", ""] },
    });
    assert.equal(v2.version, 2);
    assert.equal(await rpcError(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: 1, p_title: "Old tab",
      p_board: board,
    }), "draft_conflict");
    // A second "new" draft for the same friend is refused too.
    assert.equal(await rpcError(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: null, p_version: null, p_title: "",
      p_board: board,
    }), "draft_conflict");

    assert.equal(await rpcError(deb.client, "send_friend_puzzle", { p_draft_id: draft.id, p_version: 2 }),
      "invalid_puzzle", "blank clues cannot be sent");
    // All seven cards are saved as edited, and all three bonus cards must be
    // finished before sending — whatever difficulty the friend picks later.
    const halfBonus = structuredClone(board);
    halfBonus.cards.u7.words[2] = "";
    const v3 = await rpc(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: 2, p_title: "Warm-up", p_board: halfBonus,
    });
    const reread = await rpc(deb.client, "get_friend_draft", { p_friendship_id: fid });
    assert.deepEqual(reread.board, halfBonus, "the unfinished bonus card is saved exactly");
    assert.equal(reread.difficulty, undefined, "drafts have no difficulty");
    const { error: bonusErr } = await deb.client.rpc("send_friend_puzzle", { p_draft_id: draft.id, p_version: v3.version });
    assert.match(bonusErr.message, /^invalid_puzzle: Every edge of the three bonus cards needs a word/);
    draft = await rpc(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: 3, p_title: "Warm-up",
      p_board: board,
    });
    assert.equal(await rpcError(deb.client, "send_friend_puzzle", { p_draft_id: draft.id, p_version: 3 }),
      "draft_conflict", "only the exact saved version can be sent");
  });

  let puzzleId;
  await t.test("double-tapping Send creates one puzzle", async () => {
    const [a, b] = await Promise.all([
      rpc(deb.client, "send_friend_puzzle", { p_draft_id: draft.id, p_version: draft.version }),
      rpc(deb.client, "send_friend_puzzle", { p_draft_id: draft.id, p_version: draft.version }),
    ]);
    assert.equal(a.puzzle_id, b.puzzle_id);
    assert.equal([a.already_sent, b.already_sent].filter(Boolean).length, 1);
    puzzleId = a.puzzle_id;
    const { count } = await admin.from("friend_puzzles").select("*", { count: "exact", head: true }).eq("friendship_id", fid);
    assert.equal(count, 1);
    assert.equal(await rpcError(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: draft.id, p_version: draft.version, p_title: "",
      p_board: board,
    }), "draft_sent", "a sent puzzle can't be edited through its draft");
  });

  await t.test("only one unfinished puzzle per sender", async () => {
    const d2 = await rpc(deb.client, "save_friend_draft", {
      p_friendship_id: fid, p_draft_id: null, p_version: null, p_title: "",
      p_board: sampleBoard("TWO"),
    });
    assert.equal(await rpcError(deb.client, "send_friend_puzzle", { p_draft_id: d2.id, p_version: d2.version }), "already_waiting");
    await rpc(deb.client, "discard_friend_draft", { p_draft_id: d2.id });
  });

  let debView;
  await t.test("the recipient chooses the difficulty once; it's kept with the attempt", async () => {
    const si = await rpc(sam.client, "get_friends_inbox");
    assert.equal(si.friends[0].next_action, "play");
    assert.equal(si.unread, 1);
    const before = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    assert.equal(before.difficulty, null);
    assert.equal(before.cards, null, "no cards are dealt before choosing");
    assert.equal(before.card_order, null);
    assert.equal(before.clues, null);
    const row = await sam.client.from("friend_puzzles").select("difficulty, cards, card_order").eq("id", puzzleId).single();
    assert.deepEqual(row.data, { difficulty: null, cards: null, card_order: null }, "nothing readable directly either");
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 1, p_board: [], p_extras: [], p_clues: [],
    }), "choose_difficulty", "no guessing before choosing");
    assert.equal(await rpcError(sam.client, "choose_friend_difficulty", { p_puzzle_id: puzzleId, p_difficulty: "impossible" }), "invalid_difficulty");
    assert.equal(await rpcError(deb.client, "choose_friend_difficulty", { p_puzzle_id: puzzleId, p_difficulty: "easy" }), "not_found",
      "the creator can't pick for them");

    assert.equal((await choose(sam, puzzleId, "standard")).already_chosen, false);
    assert.equal((await choose(sam, puzzleId, "standard")).already_chosen, true, "a double tap is harmless");
    assert.equal(await rpcError(sam.client, "choose_friend_difficulty", { p_puzzle_id: puzzleId, p_difficulty: "easy" }),
      "difficulty_locked", "can't switch to a different level once started");
    const first = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    const second = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    assert.equal(first.difficulty, "standard");
    assert.deepEqual(second.card_order, first.card_order, "a refresh deals exactly the same cards in the same order");
    assert.deepEqual(second.cards, first.cards);
  });

  await t.test("the solver gets the dealt cards but never the answer or undealt cards", async () => {
    assert.equal((await rpc(deb.client, "get_friends_inbox")).friends[0].next_action, "waiting");

    const view = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    assert.equal(view.role, "solver");
    assert.equal(view.solution, null);
    assert.equal(view.authored_cards, null, "the whole seven-card puzzle stays with the server");
    assert.equal(view.bonus_cards, null);
    assert.deepEqual(view.guesses, []);
    assert.equal(view.card_order.length, 5, "standard: the 4 answer cards + 1 bonus card");
    assert.ok(view.card_order.every((id) => /^k[0-9a-f]{10}$/.test(id)), "card ids are opaque");
    assert.deepEqual(view.clues, board.clues);
    assert.deepEqual((await sam.client.from("friend_puzzle_answers").select("*")).data, [], "answers table is closed to the solver");
    assert.equal((await rpc(sam.client, "get_friends_inbox")).unread, 0, "opening marks it seen");

    debView = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    assert.equal(debView.role, "creator");
    assert.ok(debView.solution);
    assert.equal(debView.guesses, null, "the creator can't watch guesses before the end");
    assert.equal(debView.difficulty, "standard");
    assert.equal(Object.keys(debView.authored_cards).length, 7, "the server kept all seven authored cards");
    assert.deepEqual(debView.bonus_cards.map((b) => b.dealt), [true, false, false],
      "standard deals the creator's first bonus card, like the daily game");
    const dealtBonus = view.card_order.filter((id) => !debView.solution.slotCards.includes(id));
    assert.deepEqual(dealtBonus, [debView.bonus_cards[0].card_id]);
    for (const b of debView.bonus_cards.slice(1)) assert.ok(!(b.card_id in view.cards), "undealt bonus cards never reach the solver");
    // The bonus cards are the ones Deb wrote (words intact, turned at random).
    const words = (c) => [...c.words].sort().join("|");
    assert.deepEqual(debView.bonus_cards.map((b) => words(debView.authored_cards[b.card_id])),
      board.slots.slice(4).map((sl) => words(board.cards[sl.cardId])));

    // What Sam sees on the solved board reads exactly as Deb built it.
    const edgeWord = (card, o, e) => card.words[(e - o + 4) % 4];
    for (let slot = 0; slot < 4; slot++) {
      const src = board.slots[slot];
      const sent = solvedBoard(debView)[slot];
      for (let e = 0; e < 4; e++) {
        assert.equal(edgeWord(debView.cards[sent.cardId], sent.orientation, e),
          edgeWord(board.cards[src.cardId], src.orientation, e));
      }
    }
    assert.equal(await rpcError(eve.client, "open_friend_puzzle", { p_puzzle_id: puzzleId }), "not_found");
    assert.equal(await rpcError(deb.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 1, p_board: solvedBoard(debView), p_extras: [], p_clues: board.clues,
    }), "not_found", "the creator can't play their own puzzle");
  });

  await t.test("a wrong guess costs one life and reveals nothing", async () => {
    const r1 = await guess(sam, puzzleId, 1, wrongBoard(debView), board.clues);
    assert.deepEqual(r1.correct, []);
    assert.equal(r1.lives_left, 2);
    assert.equal(r1.outcome, null);
    assert.equal(r1.solution, null);
    // A network retry of the same guess gets the same answer, no extra life lost.
    const again = await guess(sam, puzzleId, 1, wrongBoard(debView), board.clues);
    assert.deepEqual(again, r1);
    // A different guess under an old number, or skipping ahead, is refused.
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 1, p_board: solvedBoard(debView), p_extras: [], p_clues: board.clues,
    }), "stale_guess");
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 3, p_board: solvedBoard(debView), p_extras: [], p_clues: board.clues,
    }), "stale_guess");
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 2, p_board: [{ cardId: "kdeadbeef00", orientation: 0 }], p_extras: [], p_clues: board.clues,
    }), "invalid_guess");
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 2, p_board: wrongBoard(debView), p_extras: [], p_clues: board.clues,
    }), "invalid_guess", "the tray must hold the dealt bonus card");
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 2, p_board: wrongBoard(debView),
      p_extras: [{ cardId: debView.bonus_cards[2].card_id, orientation: 0 }], p_clues: board.clues,
    }), "invalid_guess", "an undealt bonus card can't be used");
    const creatorPeek = await deb.client.from("friend_guesses").select("*").eq("puzzle_id", puzzleId);
    assert.deepEqual(creatorPeek.data, [], "the creator can't read guesses mid-play");
  });

  await t.test("a right guess on a Rotated board wins — once, even if sent twice at once", async () => {
    const turned = rotateBoard(solvedBoard(debView), board.clues);
    const [a, b] = await Promise.all([
      guess(sam, puzzleId, 2, turned.board, turned.clues),
      guess(sam, puzzleId, 2, turned.board, turned.clues),
    ]);
    const sansClock = (r) => ({ ...r, friendship: { ...r.friendship, server_now: null } });
    assert.deepEqual(sansClock(a), sansClock(b), "both taps get the same recorded result");
    assert.deepEqual(a.correct, [0, 1, 2, 3]);
    assert.equal(a.outcome, "won");
    assert.equal(a.lives_used, 1);
    assert.ok(a.solution, "the answer arrives with the final result");
    assert.equal(a.friendship.daily_streak, 1);
    assert.equal(a.friendship.team_win_streak, 1);
    assert.equal(a.friendship.done_this_period, true);
    assert.equal(await rpcError(sam.client, "submit_friend_guess", {
      p_puzzle_id: puzzleId, p_guess_no: 3, p_board: turned.board, p_extras: [], p_clues: turned.clues,
    }), "already_finished");
  });

  await t.test("the creator replays the real guesses in order", async () => {
    const di = await rpc(deb.client, "get_friends_inbox");
    assert.equal(di.friends[0].next_action, "see_result");
    assert.equal(di.unread, 1);
    const result = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: puzzleId });
    assert.equal(result.outcome, "won");
    assert.equal(result.guesses.length, 2);
    assert.deepEqual(result.guesses[0].board, wrongBoard(debView));
    assert.deepEqual(result.guesses[0].clues, board.clues);
    assert.deepEqual(result.guesses[1].clues, rotateBoard(solvedBoard(debView), board.clues).clues);
    assert.deepEqual(result.guesses[1].correct, [0, 1, 2, 3]);
    assert.deepEqual(result.guesses[0].extras.map((e) => e.cardId), [result.bonus_cards[0].card_id],
      "each guess keeps the tray Sam actually had");
    assert.deepEqual(result.bonus_cards.map((b) => b.dealt), [true, false, false]);
    assert.equal((await rpc(deb.client, "get_friends_inbox")).friends[0].next_action, "make");
    assert.equal((await rpc(sam.client, "get_friends_inbox")).friends[0].next_action, "make_back");
  });

  await t.test("a loss finishes too: streak held for the period, win streak reset", async () => {
    const back = await sendAndStart(sam, deb, fid, sampleBoard("SAM"), "easy");
    const samView = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: back });
    const clues = samView.clues;
    await guess(deb, back, 1, wrongBoard(samView), clues);
    await guess(deb, back, 2, wrongBoard(samView), clues);
    const last = await guess(deb, back, 3, wrongBoard(samView), clues);
    assert.equal(last.outcome, "lost");
    assert.equal(last.lives_left, 0);
    assert.equal(last.lives_used, 3);
    assert.ok(last.solution);
    assert.equal(last.friendship.daily_streak, 1, "a second finish in the same period doesn't bank");
    assert.equal(last.friendship.team_win_streak, 0, "a loss by either friend resets the win streak");
  });

  await t.test("wins by either friend add up; the next period extends the daily streak", async () => {
    // Pretend the current period began 25 hours ago.
    const before = await friendshipRow(fid);
    await admin.from("friendships").update({ daily_anchor: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq("id", fid);
    let expectedTeam = 0;
    for (const [maker, solver] of [[deb, sam], [sam, deb], [deb, sam]]) {
      const pid = await sendAndStart(maker, solver, fid, sampleBoard(maker.name.toUpperCase()), "easy");
      const view = await rpc(maker.client, "open_friend_puzzle", { p_puzzle_id: pid });
      const res = await guess(solver, pid, 1, solvedBoard(view), view.clues);
      expectedTeam++;
      assert.equal(res.friendship.team_win_streak, expectedTeam);
    }
    const after = await friendshipRow(fid);
    assert.equal(before.daily_streak, 1);
    assert.equal(after.daily_streak, 2, "three finishes in the new period count once");
    assert.equal(after.team_win_streak, 3);

    // Now pretend 49 hours passed with nothing finished: the next finish starts over.
    await admin.from("friendships").update({ daily_anchor: new Date(Date.now() - 73 * 3600e3).toISOString() }).eq("id", fid);
    assert.equal((await rpc(deb.client, "get_friends_inbox")).friends[0].daily_streak, 0, "a missed period shows 0");
    const pid = await sendAndStart(sam, deb, fid, sampleBoard("LATE"), "easy");
    const view = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: pid });
    const res = await guess(deb, pid, 1, solvedBoard(view), view.clues);
    assert.equal(res.friendship.daily_streak, 1);
    assert.equal(res.friendship.team_win_streak, 4, "the win streak is not time-based");
    const row = await friendshipRow(fid);
    assert.ok(Math.abs(new Date(row.daily_anchor) - Date.now()) < 60e3, "the new clock starts at that finish");
  });

  await t.test("finishes by both friends at the same moment are both counted", async () => {
    const p1 = await sendAndStart(deb, sam, fid, sampleBoard("P1"), "easy");
    const p2 = await sendAndStart(sam, deb, fid, sampleBoard("P2"), "easy");
    const v1 = await rpc(deb.client, "open_friend_puzzle", { p_puzzle_id: p1 });
    const v2 = await rpc(sam.client, "open_friend_puzzle", { p_puzzle_id: p2 });
    const start = (await friendshipRow(fid)).team_win_streak;
    await Promise.all([
      guess(sam, p1, 1, solvedBoard(v1), v1.clues),
      guess(deb, p2, 1, solvedBoard(v2), v2.clues),
    ]);
    assert.equal((await friendshipRow(fid)).team_win_streak, start + 2);
  });

  await t.test("sent puzzles and results are immutable, even for the service role", async () => {
    const { error } = await admin.from("friend_puzzles").update({ clues: ["A", "B", "C", "D"] }).eq("id", puzzleId);
    assert.match(error.message, /immutable/);
    const { error: e2 } = await admin.from("friend_puzzles").update({ outcome: "lost" }).eq("id", puzzleId);
    assert.match(e2.message, /immutable/);
    const { error: e3 } = await admin.from("friend_puzzle_answers").update({ orientations: [0, 0, 0, 0] }).eq("puzzle_id", puzzleId);
    assert.match(e3.message, /immutable/);
    const { error: e4 } = await admin.from("friend_puzzles").update({ difficulty: "hardcore" }).eq("id", puzzleId);
    assert.match(e4.message, /immutable/, "the chosen difficulty can't be changed afterwards");
  });
});

// ── Difficulty ─────────────────────────────────────────────────────────

test("each difficulty deals 0–3 of the creator's bonus cards, in their order, and keeps them", async () => {
  const [kim, lou] = await Promise.all([makePlayer("Kim"), makePlayer("Lou")]);
  const fid = await befriend(kim, lou);
  const levels = { easy: 0, standard: 1, expert: 2, hardcore: 3 };
  for (const [level, n] of Object.entries(levels)) {
    const pid = await sendPuzzle(kim, fid, sampleBoard(level.toUpperCase()));
    const made = await rpc(kim.client, "open_friend_puzzle", { p_puzzle_id: pid });
    assert.deepEqual(made.bonus_cards.map((b) => b.dealt), [null, null, null], "nothing dealt before the choice");
    await choose(lou, pid, level);
    const view = await rpc(lou.client, "open_friend_puzzle", { p_puzzle_id: pid });
    const bonus = made.bonus_cards.map((b) => b.card_id);
    assert.equal(view.card_order.length, 4 + n, `${level} deals ${n} bonus card(s)`);
    assert.deepEqual(new Set(view.card_order), new Set([...made.solution.slotCards, ...bonus.slice(0, n)]),
      `${level} deals the creator's first ${n}`);
    const after = await rpc(kim.client, "open_friend_puzzle", { p_puzzle_id: pid });
    assert.deepEqual(after.bonus_cards.map((b) => b.dealt), bonus.map((_, i) => i < n));
    if (n < 3) {
      assert.equal(await rpcError(lou.client, "submit_friend_guess", {
        p_puzzle_id: pid, p_guess_no: 1, p_board: [...solvedBoard(made).slice(0, 3), { cardId: bonus[2], orientation: 0 }],
        p_extras: [], p_clues: view.clues,
      }), "invalid_guess", "an undealt card can't be played");
    }
    const res = await guess(lou, pid, 1, solvedBoard(made), view.clues);
    assert.equal(res.outcome, "won");
    const replay = await rpc(kim.client, "open_friend_puzzle", { p_puzzle_id: pid });
    assert.deepEqual(replay.guesses[0].extras.map((e) => e.cardId).sort(), bonus.slice(0, n).sort(),
      "the replay's tray is exactly what was dealt");
  }

  // Two different choices at the same moment: one wins and sticks.
  const pid = await sendPuzzle(kim, fid, sampleBoard("RACE"));
  const [a, b] = await Promise.all([
    lou.client.rpc("choose_friend_difficulty", { p_puzzle_id: pid, p_difficulty: "standard" }),
    lou.client.rpc("choose_friend_difficulty", { p_puzzle_id: pid, p_difficulty: "hardcore" }),
  ]);
  const ok = [a, b].filter((r) => !r.error);
  assert.equal(ok.length, 1);
  assert.match([a, b].find((r) => r.error).error.message, /^difficulty_locked/);
  const won = ok[0] === a ? "standard" : "hardcore";
  const stored = await rpc(lou.client, "open_friend_puzzle", { p_puzzle_id: pid });
  assert.equal(stored.difficulty, won);
  assert.equal(stored.card_order.length, won === "standard" ? 5 : 7);
});

// ── Notifications ──────────────────────────────────────────────────────

test("push: outbox, spoiler-free text, stale and dead subscriptions, reminders once", async () => {
  const [ana, ben] = await Promise.all([makePlayer("Ana"), makePlayer("Ben")]);
  const fid = await befriend(ana, ben);

  // Nobody subscribed: sending and playing never touch the outbox.
  const quiet = await sendAndStart(ana, ben, fid, sampleBoard("QUIET"), "easy");
  const { count: none } = await admin.from("notification_outbox").select("*", { count: "exact", head: true }).eq("puzzle_id", quiet);
  assert.equal(none, 0);
  const qv = await rpc(ana.client, "open_friend_puzzle", { p_puzzle_id: quiet });
  await guess(ben, quiet, 1, solvedBoard(qv), qv.clues);

  // Both subscribe (one device each; Ana's second device is already gone).
  // Endpoints unique to this run, so leftovers from other runs sharing the
  // local database can't be mistaken for this test's notifications.
  const EP = `https://push.example.test/${Date.now().toString(36)}/`;
  const sub = (tag) => ({ p_endpoint: `${EP}${tag}`, p_p256dh: "BPkey", p_auth: "authkey" });
  await rpc(ana.client, "save_push_subscription", sub("ana-phone"));
  await rpc(ana.client, "save_push_subscription", sub("ana-old-laptop"));
  await rpc(ana.client, "save_push_subscription", sub("ana-new-tablet"));
  // The laptop subscribed long ago; the tablet only just now.
  await admin.from("push_subscriptions").update({ created_at: new Date(Date.now() - 86400e3).toISOString() })
    .eq("endpoint", `${EP}ana-old-laptop`);
  await rpc(ben.client, "save_push_subscription", sub("ben-phone"));
  assert.equal(await rpcError(ben.client, "save_push_subscription", { ...sub("x"), p_endpoint: "http://insecure" }), "invalid_subscription");
  assert.equal((await eve.client.from("push_subscriptions").select("*")).data.length, 0);

  const secret = sampleBoard("SPOILER");
  const pid = await sendPuzzle(ana, fid, secret);
  const view = await rpc(ana.client, "open_friend_puzzle", { p_puzzle_id: pid });

  const sent = [];
  const fakeSend = async (subscription, payload) => {
    if (!subscription.endpoint.startsWith(EP)) return; // someone else's leftover: accept quietly
    if (subscription.endpoint.endsWith("ana-old-laptop")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    if (subscription.endpoint.endsWith("ana-new-tablet")) throw Object.assign(new Error("not found"), { statusCode: 404 });
    sent.push({ endpoint: subscription.endpoint, ...JSON.parse(payload) });
  };

  await dispatchPush({ db: admin, sendNotification: fakeSend });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, `${EP}ben-phone`);
  assert.equal(sent[0].body, "Ana made you a puzzle. Tap to play.");
  assert.equal(sent[0].url, `/?friends=1&puzzle=${pid}`);

  // Running again sends nothing twice.
  const afterFirst = sent.length;
  await dispatchPush({ db: admin, sendNotification: fakeSend });
  assert.equal(sent.length, afterFirst);

  // Ben finishes (a loss) — Ana gets one result alert; her dead laptop is dropped.
  await choose(ben, pid, "standard"); // after the alert: choosing counts as opening it
  for (let n = 1; n <= 3; n++) await guess(ben, pid, n, wrongBoard(view), view.clues);
  await dispatchPush({ db: admin, sendNotification: fakeSend });
  const result = sent.find((s) => s.endpoint.endsWith("ana-phone"));
  assert.equal(result.body, "Ben finished your puzzle — see their guesses.");
  const { data: anaSubs } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", ana.id);
  assert.deepEqual(anaSubs.map((s) => s.endpoint).sort(),
    [`${EP}ana-new-tablet`, `${EP}ana-phone`],
    "410 drops the old laptop; a 404 on a minutes-old subscription is not trusted yet");

  // Nothing ever carries a clue or card word.
  const words = [...secret.clues, ...Object.values(secret.cards).flatMap((c) => c.words)];
  for (const n of sent) for (const w of words) assert.ok(!`${n.title} ${n.body} ${n.url}`.includes(w), `leaked ${w}`);

  // A new-puzzle alert for a puzzle already opened in the app is stale.
  const seen = await sendPuzzle(ben, fid, sampleBoard("SEEN"));
  await rpc(ana.client, "open_friend_puzzle", { p_puzzle_id: seen });
  const before = sent.length;
  await dispatchPush({ db: admin, sendNotification: fakeSend });
  assert.equal(sent.length, before, "no alert for a puzzle Ana already opened");
  const { data: staleRow } = await admin.from("notification_outbox").select("status").eq("puzzle_id", seen).single();
  assert.equal(staleRow.status, "skipped");

  // Near-deadline reminder: opt-in, once per deadline, gone once the period is safe.
  await rpc(ben.client, "update_notification_prefs", { p_new_puzzle: null, p_results: null, p_reminders: true });
  await admin.from("friendships").update({
    daily_anchor: new Date(Date.now() - 46 * 3600e3).toISOString(), daily_last_period: 0, daily_streak: 3,
  }).eq("id", fid);
  await dispatchPush({ db: admin, sendNotification: fakeSend });
  await dispatchPush({ db: admin, sendNotification: fakeSend });
  const reminders = sent.filter((s) => s.tag.startsWith("reminder"));
  assert.equal(reminders.length, 1, "one reminder, only to the friend who opted in");
  assert.equal(reminders[0].endpoint, `${EP}ben-phone`);
  assert.match(reminders[0].body, /3-day Friend Streak with Ana ends in about 2 hours/);
});

test("deleting an account removes its Friends data; the friend keeps playing", async () => {
  const [gus, hal, ivy] = await Promise.all([makePlayer("Gus"), makePlayer("Hal"), makePlayer("Ivy")]);
  const fid = await befriend(gus, hal);
  const keep = await befriend(hal, ivy);
  await sendPuzzle(gus, fid);
  const invite = await rpc(gus.client, "create_friend_invite");
  assert.equal(await rpc(gus.client, "delete_my_account"), true);
  const left = async (table, col, id) =>
    (await admin.from(table).select("*", { count: "exact", head: true }).eq(col, id)).count;
  assert.equal(await left("profiles", "id", gus.id), 0);
  assert.equal(await left("friendships", "id", fid), 0);
  assert.equal(await left("friend_puzzles", "friendship_id", fid), 0);
  assert.equal(await left("friend_invites", "inviter_id", gus.id), 0);
  assert.equal((await rpc(anon(), "get_friend_invite", { p_token: invite.token })).status, "not_found");
  const inbox = await rpc(hal.client, "get_friends_inbox");
  assert.deepEqual(inbox.friends.map((f) => f.friendship_id), [keep]);
});
