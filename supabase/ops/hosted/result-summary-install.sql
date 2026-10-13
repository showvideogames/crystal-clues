-- Hosted install of the read-only "Everyone on this puzzle" counts, plus its
-- ledger row. Rehearse inside BEGIN … ROLLBACK first; apply only with the
-- owner's approval. Adds one function, puzzle_result_summary(bigint, text),
-- executable by anon and authenticated, returning six counts. No table,
-- policy or grant on public.plays (or anything else) changes.
-- Undo: supabase/ops/hosted/result-summary-rollback.sql.

-- ==== 20261016090000_puzzle_result_summary ====
-- ═══════════════════════════════════════════════════════════════════════
--  "Everyone on this puzzle": how players did on one official puzzle at one
--  difficulty, as counts only.
--
--  Source: public.plays, the only server record of official puzzles. It
--  holds one row per signed-in account per puzzle (guests are never stored
--  on the server), so these are signed-in players' results, one each.
--  Nothing new is stored and no table opens up: plays keeps its own-rows
--  policy and grants. This function answers with six numbers and nothing
--  that identifies anybody (no ids, names, dates or single rows).
--
--  Easy and Hardcore are different games, so the counts are always for one
--  difficulty: the one the asking player played.
--
--  Undo: drop function public.puzzle_result_summary(bigint, text);
-- ═══════════════════════════════════════════════════════════════════════

create function public.puzzle_result_summary(p_puzzle_id bigint, p_difficulty text)
returns table(players int, solved int, lives_0 int, lives_1 int, lives_2 int, not_solved int)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int,
         count(*) filter (where pl.solved)::int,
         count(*) filter (where pl.solved and pl.lives_used = 0)::int,
         count(*) filter (where pl.solved and pl.lives_used = 1)::int,
         count(*) filter (where pl.solved and pl.lives_used >= 2)::int,
         count(*) filter (where not pl.solved)::int
  from public.plays pl
  where pl.puzzle_id = p_puzzle_id and pl.difficulty = p_difficulty
$$;
comment on function public.puzzle_result_summary(bigint, text) is
  'Counts of signed-in players'' results on one official puzzle at one difficulty (players, solved, solved by lives used, not solved). Aggregates only.';

revoke all on function public.puzzle_result_summary(bigint, text) from public, anon, authenticated;
grant execute on function public.puzzle_result_summary(bigint, text) to anon, authenticated, service_role;

-- ---- migration ledger ----
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20261016090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  "Everyone on this puzzle": how players did on one official puzzle at one
--  difficulty, as counts only.
--
--  Source: public.plays, the only server record of official puzzles. It
--  holds one row per signed-in account per puzzle (guests are never stored
--  on the server), so these are signed-in players' results, one each.
--  Nothing new is stored and no table opens up: plays keeps its own-rows
--  policy and grants. This function answers with six numbers and nothing
--  that identifies anybody (no ids, names, dates or single rows).
--
--  Easy and Hardcore are different games, so the counts are always for one
--  difficulty: the one the asking player played.
--
--  Undo: drop function public.puzzle_result_summary(bigint, text);
-- ═══════════════════════════════════════════════════════════════════════

create function public.puzzle_result_summary(p_puzzle_id bigint, p_difficulty text)
returns table(players int, solved int, lives_0 int, lives_1 int, lives_2 int, not_solved int)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int,
         count(*) filter (where pl.solved)::int,
         count(*) filter (where pl.solved and pl.lives_used = 0)::int,
         count(*) filter (where pl.solved and pl.lives_used = 1)::int,
         count(*) filter (where pl.solved and pl.lives_used >= 2)::int,
         count(*) filter (where not pl.solved)::int
  from public.plays pl
  where pl.puzzle_id = p_puzzle_id and pl.difficulty = p_difficulty
$$;
comment on function public.puzzle_result_summary(bigint, text) is
  'Counts of signed-in players'' results on one official puzzle at one difficulty (players, solved, solved by lives used, not solved). Aggregates only.';

revoke all on function public.puzzle_result_summary(bigint, text) from public, anon, authenticated;
grant execute on function public.puzzle_result_summary(bigint, text) to anon, authenticated, service_role;
$cvmig$], '20261016090000_puzzle_result_summary');
