-- Access check for puzzle_result_summary. Run ONLY inside begin … rollback.
-- Adds one disposable puzzle (-424250) and disposable plays on it from up to
-- three existing accounts (no existing row is touched), then, as anon and as
-- a signed-in role with no account: calls the function, and tries to read
-- public.plays directly.
create temp table _chk (who text, what text, result text) on commit drop;
grant insert, select on _chk to anon, authenticated;

insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution)
  values (-424250, '2099-12-29', 'zz-summary-check', '', 'standard', 'draft', '[]', '[]', '[]');
insert into public.plays (user_id, puzzle_id, puzzle_date, solved, lives_used, difficulty)
  select user_id, -424250, '2099-12-29',
         (row_number() over (order by created_at)) <> 3,
         case row_number() over (order by created_at) when 1 then 0 when 2 then 2 else 3 end,
         'standard'
  from (select user_id, created_at from public.accounts order by created_at limit 3) a;
insert into _chk select 'setup', 'disposable plays', count(*)::text from public.plays where puzzle_id = -424250;

do $$
declare who text; r record; n bigint;
begin
  foreach who in array array['anon', 'authenticated'] loop
    execute format('set local role %I', who);
    begin
      select * into r from public.puzzle_result_summary(-424250, 'standard');
      insert into _chk values (who, 'summary(test, standard)', row_to_json(r)::text);
      select * into r from public.puzzle_result_summary(-424250, 'hardcore');
      insert into _chk values (who, 'summary(test, hardcore)', row_to_json(r)::text);
    exception when others then insert into _chk values (who, 'summary', sqlerrm); end;
    begin
      select count(*) into n from public.plays;
      insert into _chk values (who, 'read plays', n||' rows visible');
    exception when others then insert into _chk values (who, 'read plays', sqlerrm); end;
    begin
      select count(*) into n from public.plays where puzzle_id = -424250;
      insert into _chk values (who, 'read test plays', n||' rows visible');
    exception when others then insert into _chk values (who, 'read test plays', sqlerrm); end;
    reset role;
  end loop;
end $$;

insert into _chk select 'catalog', 'summary result columns',
  (select string_agg(parameter_name, ',' order by ordinal_position) from information_schema.parameters
   where specific_schema = 'public' and specific_name like 'puzzle_result_summary%' and parameter_mode = 'OUT');
insert into _chk select 'catalog', 'plays grants (anon / authenticated)',
  coalesce((select string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'plays' and grantee in ('anon','authenticated')), 'none');
insert into _chk select 'catalog', 'plays policies',
  (select string_agg(policyname||' ['||cmd||' to '||array_to_string(roles,'/')||'] '||coalesce(qual,'-'), ' | ') from pg_policies where schemaname='public' and tablename='plays');
select jsonb_agg(jsonb_build_object('who', who, 'what', what, 'result', result)) as checks from _chk;
