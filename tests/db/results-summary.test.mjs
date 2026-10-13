// "Everyone on this puzzle" (migration 20261016090000_puzzle_result_summary):
// counts only, per puzzle AND difficulty, callable by guests, and nothing
// about who played. Local stack only (tests/db/helpers.mjs).
//   node --test tests/db/results-summary.test.mjs
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { anon, makeAccount, rpc, sql } from "./helpers.mjs";

// A puzzle of its own, so other tests' plays never change these counts.
const PUZZLE = 1700000000900 + Math.floor(Math.random() * 90);
sql(`insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
     select ${PUZZLE}, (current_date - 30)::text, 'Summary test', 'Local sample', 'standard', 'published', clues, cards, solution
     from public.puzzles order by id limit 1 on conflict (id) do nothing`);

// Leave the local stack as it was: the test puzzle and its plays go.
after(() => sql(`delete from public.puzzles where id = ${PUZZLE}`));

const summary = async (client, difficulty) => {
  const { data, error } = await client.rpc("puzzle_result_summary", { p_puzzle_id: PUZZLE, p_difficulty: difficulty });
  if (error) throw new Error(error.message);
  return data[0];
};
const record = (acct, solved, lives, difficulty) =>
  rpc(acct.client, "record_play", { _puzzle_id: PUZZLE, _solved: solved, _lives_used: lives, _difficulty: difficulty });

test("an unplayed puzzle: zeros, not an error", async () => {
  assert.deepEqual(await summary(anon(), "standard"),
    { players: 0, solved: 0, lives_0: 0, lives_1: 0, lives_2: 0, not_solved: 0 });
});

test("counts per difficulty, never mixed; guests may ask; counts only", async () => {
  const [a, b, c, d, e] = await Promise.all(["Ann", "Bo", "Cy", "Di", "Ed"].map((n) => makeAccount(n)));
  await record(a, true, 0, "standard");
  await record(b, true, 2, "standard");
  await record(c, false, 3, "standard");
  await record(d, true, 1, "hardcore");
  await record(e, true, 0, "easy");

  const std = await summary(anon(), "standard");
  assert.deepEqual(std, { players: 3, solved: 2, lives_0: 1, lives_1: 0, lives_2: 1, not_solved: 1 });
  assert.deepEqual(await summary(anon(), "hardcore"), { players: 1, solved: 1, lives_0: 0, lives_1: 1, lives_2: 0, not_solved: 0 });
  assert.deepEqual(await summary(anon(), "easy"), { players: 1, solved: 1, lives_0: 1, lives_1: 0, lives_2: 0, not_solved: 0 });
  assert.deepEqual(await summary(anon(), "expert"), { players: 0, solved: 0, lives_0: 0, lives_1: 0, lives_2: 0, not_solved: 0 });
  // A signed-in player gets the same numbers.
  assert.deepEqual(await summary(a.client, "standard"), std);
  // Nothing but the six counts comes back.
  assert.deepEqual(Object.keys(std).sort(), ["lives_0", "lives_1", "lives_2", "not_solved", "players", "solved"]);
});

test("the plays table itself stays closed to guests and to other accounts", async () => {
  const { error } = await anon().from("plays").select("*").eq("puzzle_id", PUZZLE);
  assert.ok(error, "anon can't read plays");
  const other = await makeAccount("Fay");
  const { data } = await other.client.from("plays").select("*").eq("puzzle_id", PUZZLE);
  assert.deepEqual(data, [], "an account sees only its own rows");
});

test("one result per player: a repeated record doesn't add a player", async () => {
  const g = await makeAccount("Gus");
  await record(g, true, 1, "expert");
  await record(g, true, 1, "expert");
  assert.equal((await summary(anon(), "expert")).players, 1);
});
