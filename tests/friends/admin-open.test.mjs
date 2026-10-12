// The beta's open puzzle admin (20261015090000_beta_open_puzzle_admin):
// anyone may write the official puzzles and the word bank, exactly as the
// /admin page does, and nothing private opens up with them. Local stack only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, anon, API_URL, PUBLISHABLE_KEY, rpc, rpcError, makePlayer, befriend, sendPuzzle } from "./helpers.mjs";

const stamp = Date.now().toString(36);
const day = `2099-01-${String(1 + (Date.now() % 27)).padStart(2, "0")}`;
const ids = [];

// The admin page's own requests: PostgREST with only the public key.
async function rest(path, { method = "GET", prefer = "", body } = {}) {
  const res = await fetch(`${API_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}`, "Content-Type": "application/json", Prefer: prefer },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

test("signed out: create, edit (as one upsert), publish and delete an official puzzle", async () => {
  const id = 900000000 + Math.floor(Math.random() * 1e6);
  ids.push(id);
  const row = { id, date: day, title: `open-${stamp}`, author: "", difficulty: "standard", status: "draft",
    clues: ["A", "B", "C", "D"], cards: [], solution: [] };
  const up = (r) => rest("puzzles?on_conflict=id", { method: "POST", prefer: "return=minimal,resolution=merge-duplicates", body: r });

  assert.equal((await up(row)).status, 201, "insert");
  assert.ok((await up({ ...row, title: `edited-${stamp}`, status: "published" })).status < 300, "edit in place");
  const { data } = await rest(`puzzles?id=eq.${id}&select=title,status`);
  assert.deepEqual(data, [{ title: `edited-${stamp}`, status: "published" }]);

  // Editing a puzzle somebody has played keeps their record of it.
  await makePlayer("Pia");
  const { data: acct } = await admin.from("accounts").select("user_id").limit(1).single();
  const ins = await admin.from("plays").insert({ user_id: acct.user_id, puzzle_id: id, puzzle_date: day, solved: true, lives_used: 0, difficulty: "standard" });
  assert.equal(ins.error, null);
  assert.ok((await up({ ...row, title: `again-${stamp}` })).status < 300);
  const { count } = await admin.from("plays").select("*", { count: "exact", head: true }).eq("puzzle_id", id);
  assert.equal(count, 1, "an edit doesn't delete play history");

  // Guardrail: a played puzzle can't be deleted by the open admin, only moved to Unused.
  const hasPlays = (pid) => rest("rpc/puzzle_has_plays", { method: "POST", body: { p_puzzle_id: pid } });
  assert.deepEqual(await hasPlays(id), { status: 200, data: true }, "the page can ask yes/no");
  const tried = await rest(`puzzles?id=eq.${id}`, { method: "DELETE", prefer: "return=representation" });
  assert.deepEqual(tried.data, [], "the delete removes nothing");
  assert.equal((await rest(`puzzles?id=eq.${id}&select=id`)).data.length, 1, "the puzzle is still there");
  const { count: still } = await admin.from("plays").select("*", { count: "exact", head: true }).eq("puzzle_id", id);
  assert.equal(still, 1, "and so is its play history");
  assert.ok((await rest(`puzzles?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: { status: "unused" } })).status < 300);
  assert.deepEqual((await rest(`puzzles?id=eq.${id}&select=status`)).data, [{ status: "unused" }], "moved to Unused instead");
  // A signed-in non-admin is held to the same rule.
  const pia = await makePlayer("Pia2");
  await pia.client.from("puzzles").delete().eq("id", id);
  assert.equal((await rest(`puzzles?id=eq.${id}&select=id`)).data.length, 1);

  // A puzzle nobody has played can still be deleted.
  const fresh = id + 1;
  ids.push(fresh);
  assert.equal((await up({ ...row, id: fresh })).status, 201);
  assert.deepEqual(await hasPlays(fresh), { status: 200, data: false });
  assert.equal((await rest(`puzzles?id=eq.${fresh}`, { method: "DELETE", prefer: "return=minimal" })).status, 204);
  assert.deepEqual((await rest(`puzzles?id=eq.${fresh}`)).data, []);
});

test("signed out: add and remove a word-bank word", async () => {
  const word = `ZZOPEN${stamp.toUpperCase()}`;
  assert.equal((await rest("wordbank", { method: "POST", prefer: "return=minimal", body: [{ word }] })).status, 201);
  assert.equal((await rest(`wordbank?word=eq.${word}&select=word`)).data.length, 1);
  assert.equal((await rest(`wordbank?word=eq.${word}`, { method: "DELETE", prefer: "return=minimal" })).status, 204);
  assert.equal((await rest(`wordbank?word=eq.${word}&select=word`)).data.length, 0);
});

test("nothing private opens up: accounts, play history, admins and Friends stay closed to the public key", async () => {
  const a = await makePlayer("Ava");
  const b = await makePlayer("Ben");
  const fid = await befriend(a, b);
  const pid = await sendPuzzle(a, fid);

  for (const table of ["accounts", "plays", "admins", "profiles", "friendships", "friend_invites", "friend_puzzles",
    "friend_puzzle_drafts", "friend_puzzle_answers", "friend_guesses", "push_subscriptions", "notification_outbox", "friend_share_links"]) {
    const read = await rest(`${table}?select=*&limit=1`);
    assert.ok(read.status >= 400 || (Array.isArray(read.data) && read.data.length === 0), `anon can't read ${table} (${read.status})`);
    const write = await rest(table, { method: "POST", prefer: "return=minimal", body: {} });
    assert.ok(write.status >= 400, `anon can't write ${table} (${write.status})`);
  }
  // Signed-out callers still can't reach any account's Friends.
  for (const fn of ["get_friends_inbox", "get_my_profile", "list_share_links", "get_friend_avatars"]) {
    assert.match(await rpcError(anon(), fn), /permission denied|not_signed_in/, fn);
  }
  assert.match(await rpcError(anon(), "open_friend_puzzle", { p_puzzle_id: pid }), /permission denied|not_signed_in/);
  // A third signed-in account can't open someone else's friend puzzle.
  const c = await makePlayer("Cal");
  assert.ok(await rpcError(c.client, "open_friend_puzzle", { p_puzzle_id: pid }));
  // And the two friends still see their own Friends normally.
  const { data: inbox } = await b.client.rpc("get_friends_inbox");
  assert.equal(inbox.friends[0].incoming.puzzle_id, pid, "the friend still sees it normally");
  assert.ok(await rpc(a.client, "get_my_profile"));
});

test.after(async () => {
  for (const id of ids) await admin.from("puzzles").delete().eq("id", id);
});
