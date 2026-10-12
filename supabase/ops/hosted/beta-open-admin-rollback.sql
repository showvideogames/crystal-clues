-- Undo the beta's open puzzle admin (20261015090000_beta_open_puzzle_admin):
-- puzzle and word-bank writes go back to admin accounts only. Run with
-- tools/hosted.mjs (rehearsal first, then --apply with the owner's approval).
-- The app's /admin page keeps loading for everyone, but saves then fail
-- unless the signed-in account is in public.admins. puzzle_has_plays() stays:
-- the admin page uses it to move played puzzles to Unused instead of deleting
-- them, and it only answers yes/no for one puzzle.

drop policy if exists puzzles_beta_open_insert  on public.puzzles;
drop policy if exists puzzles_beta_open_update  on public.puzzles;
drop policy if exists puzzles_beta_open_delete  on public.puzzles;
drop policy if exists wordbank_beta_open_insert on public.wordbank;
drop policy if exists wordbank_beta_open_update on public.wordbank;
drop policy if exists wordbank_beta_open_delete on public.wordbank;
revoke insert, update, delete on table public.puzzles, public.wordbank from anon;
delete from supabase_migrations.schema_migrations where version = '20261015090000';

select jsonb_build_object(
  'anon_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  'policies', (select string_agg(tablename||':'||policyname, ',' order by tablename, policyname) from pg_policies where schemaname='public' and tablename in ('puzzles','wordbank'))
) as after;
