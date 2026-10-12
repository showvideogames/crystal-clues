-- Permission check for the beta open admin. Run ONLY inside begin … rollback.
-- It adds two disposable puzzles (-424242 with one disposable play, -424243
-- unplayed); the only writes it attempts are on those two. For every other
-- table it tries a read as anon and as a signed-in role with no account, and
-- reports write privileges with has_table_privilege (no write is attempted).
create temp table _chk (who text, what text, result text) on commit drop;
grant insert, select on _chk to anon, authenticated;

insert into public.puzzles (id, date, title, author, difficulty, status, clues, cards, solution) values
  (-424242, '2099-12-30', 'zz-guard-played', '', 'standard', 'draft', '[]', '[]', '[]'),
  (-424243, '2099-12-31', 'zz-guard-unplayed', '', 'standard', 'draft', '[]', '[]', '[]');
insert into public.plays (user_id, puzzle_id, puzzle_date, solved, lives_used, difficulty)
  select user_id, -424242, '2099-12-30', true, 0, 'standard' from public.accounts order by created_at limit 1;

do $$
declare
  who text; t text; n bigint; b boolean; w text;
  private text[] := array(select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('puzzles', 'wordbank') order by 1);
begin
  foreach who in array array['anon', 'authenticated'] loop
    -- Write privileges on every other table (none expected for anon; authenticated as before).
    foreach t in array private loop
      w := concat_ws(',',
        case when has_table_privilege(who, 'public.'||t, 'INSERT') then 'insert' end,
        case when has_table_privilege(who, 'public.'||t, 'UPDATE') then 'update' end,
        case when has_table_privilege(who, 'public.'||t, 'DELETE') then 'delete' end);
      insert into _chk values (who, 'write privileges on '||t, coalesce(nullif(w, ''), 'none'));
    end loop;
    execute format('set local role %I', who);
    -- Reads of every other table, as that role.
    foreach t in array private loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        insert into _chk values (who, 'read '||t, n||' rows visible');
      exception when others then insert into _chk values (who, 'read '||t, sqlerrm); end;
    end loop;
    -- The guardrail, on the disposable puzzles only.
    begin
      select public.puzzle_has_plays(-424242) into b;
      insert into _chk values (who, 'puzzle_has_plays(test played)', b::text);
    exception when others then insert into _chk values (who, 'puzzle_has_plays(test played)', sqlerrm); end;
    begin
      delete from public.puzzles where id = -424242;
      get diagnostics n = row_count;
      insert into _chk values (who, 'delete test played puzzle', n||' rows deleted');
    exception when others then insert into _chk values (who, 'delete test played puzzle', sqlerrm); end;
    begin
      update public.puzzles set status = 'unused' where id = -424242;
      get diagnostics n = row_count;
      insert into _chk values (who, 'move test played puzzle to unused', n||' rows updated');
    exception when others then insert into _chk values (who, 'move test played puzzle to unused', sqlerrm); end;
    execute 'reset role';
    insert into _chk values (who, 'test played puzzle + its play after',
      (select count(*) from public.puzzles where id = -424242)||' puzzle, '||(select count(*) from public.plays where puzzle_id = -424242)||' play');
  end loop;
  execute 'set local role anon';
  delete from public.puzzles where id = -424243;
  get diagnostics n = row_count;
  execute 'reset role';
  insert into _chk values ('anon', 'delete test unplayed puzzle', n||' rows deleted');
end $$;

select jsonb_agg(jsonb_build_object('who', who, 'what', what, 'result', result) order by who, what) as checks from _chk;
