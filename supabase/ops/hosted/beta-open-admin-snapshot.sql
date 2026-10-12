-- Read-only snapshot around the beta open-admin install: content and play
-- history fingerprints, and every policy, grant and anon-callable function.
select jsonb_build_object(
  'ledger', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
  'puzzles', (select count(*) from public.puzzles),
  'puzzles_fp', (select md5(string_agg(id::text||'|'||coalesce(date,'')||'|'||coalesce(status,'')||'|'||coalesce(title,'')||'|'||md5(coalesce(clues::text,'')||coalesce(cards::text,'')||coalesce(solution::text,'')), ',' order by id)) from public.puzzles),
  'wordbank', (select count(*) from public.wordbank),
  'wordbank_fp', (select md5(string_agg(word, ',' order by word)) from public.wordbank),
  'plays', (select count(*) from public.plays),
  'plays_fp', (select md5(string_agg(user_id::text||'|'||puzzle_id||'|'||solved||'|'||lives_used||'|'||finished_at, ',' order by user_id, puzzle_id)) from public.plays),
  'accounts', (select count(*) from public.accounts),
  'admins', (select count(*) from public.admins),
  'profiles', (select count(*) from public.profiles),
  'friend_puzzles', (select count(*) from public.friend_puzzles),
  'tables_without_rls', (select coalesce(string_agg(c.relname, ','), 'none') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity),
  'policy_count', (select count(*) from pg_policies where schemaname='public'),
  'puzzle_wordbank_policies', (select string_agg(tablename||':'||policyname||' ['||cmd||' to '||array_to_string(roles, '/')||'] using '||coalesce(qual,'-'), ' | ' order by tablename, policyname) from pg_policies where schemaname='public' and tablename in ('puzzles','wordbank')),
  'other_policies_fp', (select md5(string_agg(tablename||':'||policyname||':'||cmd||':'||array_to_string(roles, '/')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)) from pg_policies where schemaname='public' and tablename not in ('puzzles','wordbank')),
  'anon_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  'authenticated_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public'),
  'anon_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'authenticated_functions_fp', (select md5(string_agg(p.proname, ',' order by p.proname)) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and p.proname <> 'puzzle_has_plays')
) as snapshot;
