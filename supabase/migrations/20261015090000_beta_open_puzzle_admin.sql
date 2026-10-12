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
