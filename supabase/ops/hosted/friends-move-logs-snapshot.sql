-- Read-only snapshot for the move-logs install (before and after).
select jsonb_build_object(
  'ledger', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
  'friend_puzzles', (select count(*) from public.friend_puzzles),
  'finished_puzzles', (select count(*) from public.friend_puzzles where finished_at is not null),
  'friend_guesses', (select count(*) from public.friend_guesses),
  'friendships_fingerprint', (select md5(coalesce(string_agg(id::text||'|'||daily_streak||'|'||team_win_streak||'|'||coalesce(last_finished_at::text,''), ',' order by id), '')) from public.friendships),
  'results_fingerprint', (select md5(coalesce(string_agg(id::text||'|'||coalesce(outcome,'')||'|'||coalesce(lives_used::text,'')||'|'||coalesce(creator_seen_result_at::text,'')||'|'||coalesce(recipient_seen_at::text,''), ',' order by id), '')) from public.friend_puzzles),
  'outbox', (select count(*) from public.notification_outbox),
  'move_logs_table', (select count(*) from information_schema.tables where table_schema='public' and table_name='friend_move_logs'),
  'move_logs_rls', (select relrowsecurity from pg_class where oid = to_regclass('public.friend_move_logs')),
  'move_logs_policies', (select count(*) from pg_policies where schemaname='public' and tablename='friend_move_logs'),
  'anon_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  'authenticated_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public'),
  'anon_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'authenticated_move_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and p.proname in ('save_friend_moves','save_shared_moves','get_friend_moves','friend_append_moves','refresh_share_link')),
  'policies', (select count(*) from pg_policies where schemaname='public')
) as snapshot;
