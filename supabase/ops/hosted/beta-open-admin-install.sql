-- Hosted install of the beta open-admin migration, plus its ledger row.
-- Run with tools/hosted.mjs: rehearsal (BEGIN … ROLLBACK) first, then --apply,
-- only with the owner's approval. Adds six policies, an anon grant and a yes/no
-- helper (puzzle_has_plays: played puzzles can't be deleted, only moved to Unused) on
-- public.puzzles and public.wordbank only (the two tables the admin page
-- writes). No other table, policy, function or grant changes.
-- Undo: supabase/ops/hosted/beta-open-admin-rollback.sql.

-- ==== 20261015090000_beta_open_puzzle_admin ====
-- ═══════════════════════════════════════════════════════════════════════
--  Beta: the puzzle admin (/admin) works without signing in.
--
--  The owner's explicit, temporary choice (2026-10-12): anyone who finds
--  /admin may use it, including changing and deleting official puzzles.
--  The admin page talks to exactly two tables, so exactly those two open up:
--
--    public.puzzles   the official daily puzzles (already readable by all)
--    public.wordbank  the word list (already readable by all)
--
--  Guardrail: a puzzle somebody has played can't be deleted through these
--  open policies. Deleting it would also delete players' records of it
--  (plays.puzzle_id cascades), so the admin page moves it to Unused instead
--  (status 'unused': off the daily game and the archive, puzzle and play
--  history kept). puzzle_has_plays() lets the page ask; it answers yes/no
--  for one puzzle and nothing about who played it.
--
--  Nothing else changes. Accounts, admins and play history keep their
--  policies and grants; every Friends table and function is untouched (they
--  are reached only through their own RPCs, which check the caller). The
--  original admin-only policies stay in place, so dropping what's below
--  (supabase/ops/hosted/beta-open-admin-rollback.sql) restores admin-only
--  writes exactly.
-- ═══════════════════════════════════════════════════════════════════════

create function public.puzzle_has_plays(p_puzzle_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.plays where puzzle_id = p_puzzle_id)
$$;
revoke all on function public.puzzle_has_plays(bigint) from public, anon, authenticated;
grant execute on function public.puzzle_has_plays(bigint) to anon, authenticated, service_role;

create policy puzzles_beta_open_insert  on public.puzzles  for insert to anon, authenticated with check (true);
create policy puzzles_beta_open_update  on public.puzzles  for update to anon, authenticated using (true) with check (true);
create policy puzzles_beta_open_delete  on public.puzzles  for delete to anon, authenticated using (not public.puzzle_has_plays(id));

create policy wordbank_beta_open_insert on public.wordbank for insert to anon, authenticated with check (true);
create policy wordbank_beta_open_update on public.wordbank for update to anon, authenticated using (true) with check (true);
create policy wordbank_beta_open_delete on public.wordbank for delete to anon, authenticated using (true);

-- authenticated already has these (filtered by RLS); anon gets the same two tables only.
grant insert, update, delete on table public.puzzles, public.wordbank to anon;

-- ---- migration ledger ----
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20261015090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Beta: the puzzle admin (/admin) works without signing in.
--
--  The owner's explicit, temporary choice (2026-10-12): anyone who finds
--  /admin may use it, including changing and deleting official puzzles.
--  The admin page talks to exactly two tables, so exactly those two open up:
--
--    public.puzzles   the official daily puzzles (already readable by all)
--    public.wordbank  the word list (already readable by all)
--
--  Guardrail: a puzzle somebody has played can't be deleted through these
--  open policies. Deleting it would also delete players' records of it
--  (plays.puzzle_id cascades), so the admin page moves it to Unused instead
--  (status 'unused': off the daily game and the archive, puzzle and play
--  history kept). puzzle_has_plays() lets the page ask; it answers yes/no
--  for one puzzle and nothing about who played it.
--
--  Nothing else changes. Accounts, admins and play history keep their
--  policies and grants; every Friends table and function is untouched (they
--  are reached only through their own RPCs, which check the caller). The
--  original admin-only policies stay in place, so dropping what's below
--  (supabase/ops/hosted/beta-open-admin-rollback.sql) restores admin-only
--  writes exactly.
-- ═══════════════════════════════════════════════════════════════════════

create function public.puzzle_has_plays(p_puzzle_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.plays where puzzle_id = p_puzzle_id)
$$;
revoke all on function public.puzzle_has_plays(bigint) from public, anon, authenticated;
grant execute on function public.puzzle_has_plays(bigint) to anon, authenticated, service_role;

create policy puzzles_beta_open_insert  on public.puzzles  for insert to anon, authenticated with check (true);
create policy puzzles_beta_open_update  on public.puzzles  for update to anon, authenticated using (true) with check (true);
create policy puzzles_beta_open_delete  on public.puzzles  for delete to anon, authenticated using (not public.puzzle_has_plays(id));

create policy wordbank_beta_open_insert on public.wordbank for insert to anon, authenticated with check (true);
create policy wordbank_beta_open_update on public.wordbank for update to anon, authenticated using (true) with check (true);
create policy wordbank_beta_open_delete on public.wordbank for delete to anon, authenticated using (true);

-- authenticated already has these (filtered by RLS); anon gets the same two tables only.
grant insert, update, delete on table public.puzzles, public.wordbank to anon;
$cvmig$], '20261015090000_beta_open_puzzle_admin');

-- ---- verification (the last statement's result is what the tool prints) ----
select jsonb_build_object(
  'puzzles', (select count(*) from public.puzzles),
  'wordbank', (select count(*) from public.wordbank),
  'accounts', (select count(*) from public.accounts),
  'plays', (select count(*) from public.plays),
  'ledger', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
  'anon_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  'anon_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'tables_without_rls', (select string_agg(c.relname, ',') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity),
  'policies', (select string_agg(tablename||':'||policyname||'='||coalesce(qual,'-'), ' | ' order by tablename, policyname) from pg_policies where schemaname='public' and tablename in ('puzzles','wordbank'))
) as after;
