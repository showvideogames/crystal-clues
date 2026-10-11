-- REHEARSAL ONLY (append inside BEGIN … ROLLBACK after the install): who can
-- call what. Each call runs as that role; refusals are caught and listed.
create temp table cv_calls (n serial, who text, fn text, result text) on commit drop;
grant all on cv_calls, cv_calls_n_seq to anon, authenticated;
do $$
declare
  calls text[][] := array[
    ['anon', 'select public.get_friend_moves(gen_random_uuid())'],
    ['anon', 'select public.save_friend_moves(gen_random_uuid(), ''sessioncheck1'', 0, ''[]''::jsonb)'],
    ['anon', 'select public.save_shared_moves(''AAAAAAAAAAAAAAAAAAAAAAAA'', ''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', ''sessioncheck1'', 0, ''[]''::jsonb)'],
    ['anon', 'select public.friend_append_moves(null::public.friend_puzzles, ''sessioncheck1'', 0, ''[]''::jsonb)'],
    ['anon', 'select * from public.friend_move_logs'],
    ['authenticated', 'select public.get_friend_moves(gen_random_uuid())'],
    ['authenticated', 'select public.friend_append_moves(null::public.friend_puzzles, ''sessioncheck1'', 0, ''[]''::jsonb)'],
    ['authenticated', 'select * from public.friend_move_logs']];
  i int;
begin
  for i in 1..array_length(calls, 1) loop
    begin
      execute format('set local role %I', calls[i][1]);
      execute calls[i][2];
      reset role;
      insert into cv_calls (who, fn, result) values (calls[i][1], calls[i][2], 'ran');
    exception when others then
      reset role;
      insert into cv_calls (who, fn, result) values (calls[i][1], calls[i][2], sqlstate || ' ' || left(sqlerrm, 60));
    end;
  end loop;
end $$;
select who, left(fn, 60) as call, result from cv_calls order by n;
