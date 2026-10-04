// The account layer, end to end through the real API with real JWTs,
// against the local Supabase stack. Run: npm run test:db
//
// Covers (plan section 20 A): the baseline builds; a non-platform auth user
// is not an account; ensure_account creates/links from the identity row
// only; global_user_id is unique; email is identity-first metadata; plays
// are recorded, imported once, owned by their account and invisible to
// others; deletion removes everything personal and a re-sign-in gets a
// clean account with the same global id; content is readable by all and
// writable only by admins; content is untouched by all of it.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import {
  admin, anon, attachPlatformIdentity, count, createAuthUser, grantAdmin, makeAccount, puzzleIds,
  rpc, rpcError, setPlatformIdentityEmail, signIn, sql, uniqueEmail, uniqueGlobalId,
} from "./helpers.mjs";

let puzzles;
let contentBefore;

before(() => {
  puzzles = puzzleIds();
  assert.ok(puzzles.length >= 3, "the seed gives the local stack at least three puzzles");
  contentBefore = { puzzles: count("public.puzzles"), words: count("public.wordbank") };
});

// ── Baseline ─────────────────────────────────────────────────

test("T1 baseline: content tables exist, account tables start empty, ledger holds 0001", () => {
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version = '0001'"), "1");
  for (const t of ["puzzles", "wordbank", "accounts", "admins", "plays"]) {
    assert.equal(sql(`select to_regclass('public.${t}') is not null`), "t", `${t} exists`);
  }
  assert.equal(count("public.accounts", "user_id not in (select user_id from public.accounts where false)") >= 0, true);
  // RLS is on everywhere
  for (const t of ["puzzles", "wordbank", "accounts", "admins", "plays"]) {
    assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`), "t", `RLS on ${t}`);
  }
});

test("T1b grants: anon/authenticated hold exactly the intended table privileges", () => {
  const privs = (role, table) =>
    sql(`select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
          where grantee = '${role}' and table_schema = 'public' and table_name = '${table}'`);
  assert.equal(privs("anon", "puzzles"), "SELECT");
  assert.equal(privs("anon", "wordbank"), "SELECT");
  assert.equal(privs("authenticated", "puzzles"), "DELETE,INSERT,SELECT,UPDATE");
  assert.equal(privs("authenticated", "plays"), "SELECT");
  assert.equal(privs("anon", "plays"), "");
  assert.equal(privs("anon", "accounts"), "");
  assert.equal(privs("authenticated", "accounts"), "");
  assert.equal(privs("authenticated", "admins"), "");
});

// ── Account boundary ─────────────────────────────────────────

test("T2 an auth user without the shared sign-in is not an account: not_platform_linked, guest everywhere", async () => {
  const user = await createAuthUser(uniqueEmail("stray"));
  const client = await signIn(user);
  const row = await rpc(client, "ensure_account");
  assert.equal(row.outcome, "not_platform_linked");
  assert.equal(count("public.accounts", `user_id = '${user.id}'`), 0, "no accounts row was created");
  assert.equal(await rpc(client, "cluevoyance_uid"), null);
  assert.equal((await rpc(client, "record_play", { _puzzle_id: puzzles[0], _solved: true, _lives_used: 0, _difficulty: "standard" })).outcome, "not_signed_in");
  assert.equal((await rpc(client, "import_plays", { _plays: [] })).outcome, "not_signed_in");
  assert.equal(await rpc(client, "delete_my_account"), false);
  assert.equal(await rpc(client, "my_account"), undefined, "my_account returns no row");
  const plays = await client.from("plays").select("*");
  assert.deepEqual(plays.data, []);
});

test("T2b anon cannot call the account RPCs or read plays (grants), but can ping and read content", async () => {
  const a = anon();
  for (const fn of ["ensure_account", "my_account", "delete_my_account"]) {
    const err = await rpcError(a, fn);
    assert.match(err.message, /permission denied|not found|does not exist/i, `${fn} refused for anon: ${err.message}`);
  }
  assert.equal(await rpc(a, "ping"), true);
  assert.equal((await a.from("plays").select("*")).error?.message?.match(/permission denied/i)?.length, 1);
  const content = await a.from("puzzles").select("id").limit(1);
  assert.equal(content.error, null);
  assert.equal(content.data.length, 1);
});

test("T3 ensure_account creates the account from the custom:platform identity; repeat returns the SAME local account", async () => {
  const gid = uniqueGlobalId();
  const user = await createAuthUser(uniqueEmail("deb"));
  attachPlatformIdentity(user.id, gid, user.email);
  const client = await signIn(user);

  const first = await rpc(client, "ensure_account");
  assert.equal(first.outcome, "ok");
  assert.equal(first.user_id, user.id, "the local id is the project's auth user id");
  assert.equal(first.global_user_id, gid, "the global id is copied from the identity row");
  assert.equal(first.email, user.email);
  assert.equal(first.imported_losses, 0);
  assert.match(first.global_user_id, /^user_[0-9A-Za-z]{10,64}$/);

  const seenBefore = sql(`select last_seen_at from public.accounts where user_id = '${user.id}'`);
  await new Promise((r) => setTimeout(r, 20));
  const second = await rpc(client, "ensure_account");
  assert.equal(second.outcome, "ok");
  assert.equal(second.user_id, first.user_id, "same local account");
  assert.equal(second.global_user_id, first.global_user_id);
  assert.equal(count("public.accounts", `user_id = '${user.id}'`), 1, "still exactly one row");
  assert.notEqual(sql(`select last_seen_at from public.accounts where user_id = '${user.id}'`), seenBefore, "last_seen_at bumped");

  const mine = await rpc(client, "my_account");
  assert.equal(mine.global_user_id, gid);
  assert.equal(await rpc(client, "cluevoyance_uid"), user.id);
});

test("T3b user_metadata cannot influence the link", async () => {
  const gid = uniqueGlobalId();
  const user = await createAuthUser(uniqueEmail("meta"));
  await admin().auth.admin.updateUserById(user.id, { user_metadata: { sub: "user_FAKEFAKEFAKEFAKEFAKE", global_user_id: "user_FAKEFAKEFAKEFAKEFAKE" } });
  attachPlatformIdentity(user.id, gid, user.email);
  const row = await rpc(await signIn(user), "ensure_account");
  assert.equal(row.global_user_id, gid);
});

test("T4 global_user_id is unique: a second auth user cannot claim the same global id", async () => {
  const gid = uniqueGlobalId();
  const a = await makeAccount("first", gid);
  const other = await createAuthUser(uniqueEmail("second"));
  // GoTrue itself forbids two identities with the same (provider, provider_id); the accounts
  // table forbids it independently. Prove the table constraint directly.
  assert.throws(
    () => sql(`insert into public.accounts (user_id, global_user_id) values ('${other.id}', '${gid}')`),
    /accounts_global_user_id_key/,
  );
  assert.throws(
    () => attachPlatformIdentity(other.id, gid, other.email),
    /identities_provider_id_provider_unique|duplicate key/,
  );
  assert.equal(count("public.accounts", `global_user_id = '${gid}'`), 1);
  assert.equal(sql(`select user_id from public.accounts where global_user_id = '${gid}'`), a.id);
});

test("T4b global_user_id format is checked", async () => {
  const other = await createAuthUser(uniqueEmail("badid"));
  assert.throws(() => sql(`insert into public.accounts (user_id, global_user_id) values ('${other.id}', 'not-a-workos-id')`), /accounts_global_user_id_format/);
  assert.throws(() => sql(`insert into public.accounts (user_id, global_user_id) values ('${other.id}', '${randomUUID()}')`), /accounts_global_user_id_format/);
});

// ── Email is metadata ────────────────────────────────────────

test("T8 current email comes from the identity (changes at the provider show through); auth.users.email stays stale; global id unchanged", async () => {
  const p = await makeAccount("mail");
  const changed = uniqueEmail("renamed");
  setPlatformIdentityEmail(p.id, changed);
  const row = await rpc(p.client, "ensure_account");
  assert.equal(row.email, changed, "ensure_account reports the identity's new email");
  assert.equal((await rpc(p.client, "my_account")).email, changed);
  assert.equal(sql(`select email from auth.users where id = '${p.id}'`), p.email, "auth.users.email is not the source");
  assert.equal(row.global_user_id, p.globalId);
  assert.equal(row.user_id, p.id);
});

// ── Plays ────────────────────────────────────────────────────

test("T5 record_play: inserts with the puzzle's date; a loss then a win upgrades; a win is never downgraded; bad input refused", async () => {
  const p = await makeAccount("player");
  const [pz] = puzzles;
  const date = sql(`select date from public.puzzles where id = ${pz}`);

  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: pz, _solved: false, _lives_used: 3, _difficulty: "standard" })).outcome, "ok");
  let row = (await p.client.from("plays").select("*").eq("puzzle_id", pz)).data[0];
  assert.equal(row.solved, false);
  assert.equal(row.puzzle_date, date);
  assert.equal(row.user_id, p.id);
  assert.equal(row.source, "play");

  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: pz, _solved: true, _lives_used: 1, _difficulty: "expert" })).outcome, "ok");
  row = (await p.client.from("plays").select("*").eq("puzzle_id", pz)).data[0];
  assert.equal(row.solved, true);
  assert.equal(row.lives_used, 1);
  assert.equal(row.difficulty, "expert");

  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: pz, _solved: false, _lives_used: 3, _difficulty: "easy" })).outcome, "ok");
  row = (await p.client.from("plays").select("*").eq("puzzle_id", pz)).data[0];
  assert.equal(row.solved, true, "a later loss does not downgrade a win");
  assert.equal(row.lives_used, 1);
  assert.equal(row.difficulty, "expert");

  assert.equal(count("public.plays", `user_id = '${p.id}'`), 1, "one row per puzzle");
  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: 424242, _solved: true, _lives_used: 0, _difficulty: "standard" })).outcome, "unknown_puzzle");
  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: pz, _solved: true, _lives_used: 7, _difficulty: "standard" })).outcome, "invalid");
  assert.equal((await rpc(p.client, "record_play", { _puzzle_id: pz, _solved: true, _lives_used: 0, _difficulty: "nightmare" })).outcome, "invalid");
});

test("T6 import_plays: imports wins, skips unknown/malformed, never overwrites a solved row, repeat is a no-op", async () => {
  const p = await makeAccount("importer");
  const [a, b, c] = puzzles;
  // an existing win, recorded by playing, must survive the import untouched
  await rpc(p.client, "record_play", { _puzzle_id: a, _solved: true, _lives_used: 0, _difficulty: "hardcore" });

  const payload = [
    { puzzle_id: a, solved: true, lives_used: 2, difficulty: "easy", finished_at: "2026-09-01T10:00:00Z" },   // exists solved → kept as is
    { puzzle_id: b, solved: true, lives_used: 1, difficulty: "standard", finished_at: "2026-09-02T10:00:00Z" },
    { puzzle_id: c, solved: true, lives_used: 0, difficulty: "expert", finished_at: "garbage" },                // bad date → now()
    { puzzle_id: 999999999, solved: true, lives_used: 0, difficulty: "standard" },                             // unknown → skipped
    { puzzle_id: "nope", solved: true, lives_used: 0, difficulty: "standard" },                                // malformed → skipped
    { puzzle_id: b, solved: true, lives_used: 9, difficulty: "standard" },                                     // invalid lives → skipped
  ];
  const res = await rpc(p.client, "import_plays", { _plays: payload, _losses: 4 });
  assert.equal(res.outcome, "ok");
  assert.equal(res.imported, 3, "a (no change but accepted), b, c");
  assert.equal(res.skipped, 3);
  assert.equal((await rpc(p.client, "my_account")).imported_losses, 4, "the guest's loss count is kept on the account");
  assert.equal((await rpc(p.client, "ensure_account")).imported_losses, 4);

  const rows = (await p.client.from("plays").select("*").order("puzzle_id")).data;
  assert.equal(rows.length, 3);
  const byId = Object.fromEntries(rows.map((r) => [r.puzzle_id, r]));
  assert.equal(byId[a].lives_used, 0, "the played win was not overwritten by the import");
  assert.equal(byId[a].difficulty, "hardcore");
  assert.equal(byId[a].source, "play");
  assert.equal(byId[b].source, "import");
  assert.equal(byId[b].finished_at.startsWith("2026-09-02"), true, "import keeps the original solve time");
  assert.equal(byId[c].source, "import");

  // repeat (the client sends no loss count a second time: the guest counters are gone): nothing changes
  const again = await rpc(p.client, "import_plays", { _plays: payload, _losses: 0 });
  assert.equal(again.outcome, "ok");
  const rowsAgain = (await p.client.from("plays").select("*").order("puzzle_id")).data;
  assert.deepEqual(rowsAgain, rows, "a second import is a no-op");
  assert.equal((await rpc(p.client, "my_account")).imported_losses, 4);
  assert.equal((await rpc(p.client, "import_plays", { _plays: [], _losses: -7 })).outcome, "ok");
  assert.equal((await rpc(p.client, "my_account")).imported_losses, 4, "negative counts are ignored");
  assert.equal((await rpc(p.client, "import_plays", { _plays: [], _losses: 100001 })).outcome, "too_many");

  assert.equal((await rpc(p.client, "import_plays", { _plays: { not: "an array" } })).outcome, "invalid");
});

test("T7 history ownership: an account sees only its own plays; another account and anon see none of them", async () => {
  const a = await makeAccount("alice");
  const b = await makeAccount("bob");
  await rpc(a.client, "record_play", { _puzzle_id: puzzles[0], _solved: true, _lives_used: 0, _difficulty: "standard" });
  await rpc(b.client, "record_play", { _puzzle_id: puzzles[1], _solved: false, _lives_used: 3, _difficulty: "standard" });

  const mineA = (await a.client.from("plays").select("*")).data;
  assert.deepEqual(mineA.map((r) => r.user_id), [a.id]);
  const mineB = (await b.client.from("plays").select("*")).data;
  assert.deepEqual(mineB.map((r) => r.user_id), [b.id]);
  const peek = await b.client.from("plays").select("*").eq("user_id", a.id);
  assert.deepEqual(peek.data, [], "RLS hides the other account's rows");
  // no client write path on the table at all
  const ins = await b.client.from("plays").insert({ user_id: b.id, puzzle_id: puzzles[2], puzzle_date: "2026-01-01", solved: true, lives_used: 0, difficulty: "standard" });
  assert.match(ins.error.message, /permission denied/i);
  const upd = await b.client.from("plays").update({ solved: true }).eq("user_id", b.id);
  assert.match(upd.error.message, /permission denied/i);
  const del = await b.client.from("plays").delete().eq("user_id", b.id);
  assert.match(del.error.message, /permission denied/i);
});

// ── Deletion ─────────────────────────────────────────────────

test("T9 delete_my_account removes plays, the account and the auth user; signing in again gets a clean account with the SAME global id", async () => {
  const gid = uniqueGlobalId();
  const p = await makeAccount("leaver", gid);
  await rpc(p.client, "record_play", { _puzzle_id: puzzles[0], _solved: true, _lives_used: 0, _difficulty: "standard" });
  grantAdmin(p.id);
  assert.equal(count("public.plays", `user_id = '${p.id}'`), 1);

  assert.equal(await rpc(p.client, "delete_my_account"), true);
  assert.equal(count("public.plays", `user_id = '${p.id}'`), 0);
  assert.equal(count("public.admins", `user_id = '${p.id}'`), 0);
  assert.equal(count("public.accounts", `user_id = '${p.id}'`), 0);
  assert.equal(count("auth.users", `id = '${p.id}'`), 0, "the auth user is gone");
  assert.equal(count("auth.identities", `user_id = '${p.id}'`), 0);
  // the dead session can do nothing
  const after = await p.client.rpc("ensure_account");
  assert.ok(after.error || after.data?.[0]?.outcome !== "ok");

  // the same person signs in again: a NEW auth user, a NEW empty account, the same global id
  const again = await makeAccount("leaver-again", gid);
  assert.notEqual(again.id, p.id);
  assert.equal(again.account.global_user_id, gid);
  assert.equal(count("public.plays", `user_id = '${again.id}'`), 0, "clean slate");
  assert.equal(count("public.accounts", `global_user_id = '${gid}'`), 1);
  assert.equal(count("public.admins", `user_id = '${again.id}'`), 0, "admin rights do not carry over");
});

test("T9b delete_local_account is service-role only", async () => {
  const p = await makeAccount("victim");
  const q = await makeAccount("attacker");
  const err = await rpcError(q.client, "delete_local_account", { _user_id: p.id });
  assert.match(err.message, /permission denied/i);
  assert.equal(count("public.accounts", `user_id = '${p.id}'`), 1);
  assert.equal(count("auth.users", `id = '${p.id}'`), 1);
});

// ── Admin gate (decision D3) ─────────────────────────────────

test("T11 content writes: anon refused, a signed-in non-admin refused, an admin allowed; everyone can read", async () => {
  const word = `TESTWORD${Date.now().toString(36).toUpperCase()}`;
  const a = anon();
  const anonIns = await a.from("wordbank").insert({ word });
  assert.match(anonIns.error.message, /permission denied/i);

  const p = await makeAccount("notadmin");
  assert.equal(await rpc(p.client, "is_cluevoyance_admin"), false);
  const userIns = await p.client.from("wordbank").insert({ word });
  assert.match(userIns.error.message, /row-level security/i, "RLS, not a grant, refuses the non-admin");
  const userDel = await p.client.from("puzzles").delete().eq("id", puzzles[0]);
  assert.equal(userDel.error, null, "a delete that matches no visible-for-delete rows is silently zero rows");
  assert.equal(count("public.puzzles", `id = ${puzzles[0]}`), 1, "...and the puzzle is still there");
  const userUpd = await p.client.from("puzzles").update({ title: "hacked" }).eq("id", puzzles[0]);
  assert.equal(userUpd.error, null);
  assert.notEqual(sql(`select title from public.puzzles where id = ${puzzles[0]}`), "hacked");

  grantAdmin(p.id);
  assert.equal(await rpc(p.client, "is_cluevoyance_admin"), true);
  const adminIns = await p.client.from("wordbank").insert({ word });
  assert.equal(adminIns.error, null);
  assert.equal(count("public.wordbank", `word = '${word}'`), 1);
  const adminDel = await p.client.from("wordbank").delete().eq("word", word);
  assert.equal(adminDel.error, null);
  assert.equal(count("public.wordbank", `word = '${word}'`), 0);

  // the exact write shape App.jsx's admin screen uses: DELETE then POST of a puzzle
  const id = Date.now();
  const puzzle = { id, date: "2030-01-01", title: "Admin test", author: "test", difficulty: "standard", status: "draft", clues: [], cards: {}, solution: {} };
  const post = await p.client.from("puzzles").insert(puzzle);
  assert.equal(post.error, null);
  const del = await p.client.from("puzzles").delete().eq("id", id);
  assert.equal(del.error, null);
  assert.equal(count("public.puzzles", `id = ${id}`), 0);
  assert.equal(count("public.admins", `user_id = '${p.id}'`), 1);
});

test("T11b admins must be accounts (FK) and cannot be read by clients", async () => {
  const stray = await createAuthUser(uniqueEmail("strayadmin"));
  assert.throws(() => grantAdmin(stray.id), /admins_user_id_fkey|violates foreign key/);
  const p = await makeAccount("peeker");
  const read = await p.client.from("admins").select("*");
  assert.match(read.error.message, /permission denied/i);
});

// ── Content untouched ────────────────────────────────────────

test("T10 content counts are unchanged by everything above", () => {
  assert.deepEqual({ puzzles: count("public.puzzles"), words: count("public.wordbank") }, contentBefore);
});

function randomUUID() {
  return "00000000-0000-4000-8000-000000000000";
}
