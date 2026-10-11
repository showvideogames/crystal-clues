-- Hosted install of the move-logs migration (the animated replay), plus its
-- ledger row. Rehearse (BEGIN … ROLLBACK) first, then apply (BEGIN … COMMIT),
-- only with the owner's approval. Adds one server-only table (RLS on, no
-- policies, no grants), three functions (save_friend_moves and
-- get_friend_moves for signed-in players; save_shared_moves for the browser
-- holding a link's guest key, as submit_shared_guess), one internal helper,
-- and replaces refresh_share_link in place so a fresh link also clears the
-- unfinished game's log. No existing table, row, grant or policy changes.

-- ==== 20261014090000_friend_move_logs ====
-- ═══════════════════════════════════════════════════════════════════════
--  Move logs: the animated "Watch … guesses" replay. While a friend puzzle
--  (or a puzzle shared by link) is being played, the app keeps a short log
--  of what the player did on the board — card turns, moves and swaps,
--  Rotate, Shuffle, Reset — and saves it in batches. After the puzzle is
--  finished, the replay plays that log back on the real board, with each
--  submitted guess revealed from its recorded result (friend_guesses).
--
--  • Game actions only: no pointer paths, no screen capture. Each entry is
--    a small object, e.g. {"k":"t","s":2,"d":640} — turn the card in slot 2,
--    640 ms after the previous action (the app caps waits at 5 s).
--    Absolute entries (snapshot, shuffle, reset) carry the whole board.
--  • Exactly once: every browser tab writes as a "session" with a running
--    count, so a batch sent again after a refresh or a lost reply is
--    stored once. A batch that starts beyond what was stored (the browser
--    lost its unsent part) is stored after a {"k":"gap"} marker, and the
--    replay says that part of the play wasn't recorded.
--  • Server-only table: RLS on, no policies, no grants. Saving and reading
--    go through the functions below:
--      save_friend_moves   the solver of a friend puzzle, while playing
--      save_shared_moves   the browser playing a link (link code + guest key)
--      get_friend_moves    the creator or the solver, only once finished —
--                          the same moment the guesses become visible
--    Saving stays open for 10 minutes after the finish so the last batch,
--    sent alongside the final guess, still lands. The log never holds the
--    answer: only the cards the solver was dealt and what they did.
--  • A fresh link (refresh_share_link) clears an unfinished guest game's
--    log together with its guesses.
--  • Size limits: 200 entries / 24 kB per batch; 4000 entries / 300 kB per
--    puzzle, after which the log is marked truncated and stops growing.
--  Nothing here changes scores, results, streaks or notifications.
-- ═══════════════════════════════════════════════════════════════════════

create table public.friend_move_logs (
  puzzle_id uuid primary key references public.friend_puzzles(id) on delete cascade,
  actions jsonb not null default '[]'::jsonb,   -- in the order they arrived
  cursors jsonb not null default '{}'::jsonb,   -- session code → entries stored from it
  truncated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.friend_move_logs is 'Board actions of a friend puzzle attempt, for the animated replay. Server-only; see get_friend_moves.';

alter table public.friend_move_logs enable row level security;
revoke all on public.friend_move_logs from anon, authenticated;

-- One batch from one session. The caller has checked who may write.
create or replace function public.friend_append_moves(
  p public.friend_puzzles, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.friend_move_logs%rowtype;
  v_len int;
  v_cur int;
  v_new jsonb;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{8,40}$'
     or p_from is null or p_from < 0
     or jsonb_typeof(p_actions) is distinct from 'array'
     or jsonb_array_length(p_actions) > 200 or octet_length(p_actions::text) > 24000 then
    raise exception 'invalid_moves: Those moves could not be read.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_actions) as e(a)
             where jsonb_typeof(a) is distinct from 'object'
                or coalesce(a->>'k', '') not in ('s', 't', 'm', 'r', 'x', 'z', 'g')) then
    raise exception 'invalid_moves: Those moves could not be read.';
  end if;
  if p.difficulty is null then
    raise exception 'choose_difficulty: Choose a difficulty to start this puzzle.';
  end if;
  if p.finished_at is not null and now() > p.finished_at + interval '10 minutes' then
    raise exception 'moves_closed: This puzzle is finished.';
  end if;

  insert into public.friend_move_logs (puzzle_id) values (p.id) on conflict (puzzle_id) do nothing;
  select * into m from public.friend_move_logs where puzzle_id = p.id for update;
  v_len := jsonb_array_length(p_actions);
  v_cur := coalesce((m.cursors->>p_session)::int, 0);

  if p_from + v_len <= v_cur then
    return jsonb_build_object('stored', v_cur);         -- all seen before
  end if;
  if not (m.cursors ? p_session) and (select count(*) from jsonb_object_keys(m.cursors)) >= 50 then
    m.truncated := true;
  end if;
  if p_from > v_cur then
    v_new := '[{"k":"gap"}]'::jsonb || p_actions;        -- part of this session never arrived
  else
    select coalesce(jsonb_agg(a order by n), '[]'::jsonb) into v_new
      from jsonb_array_elements(p_actions) with ordinality as t(a, n)
      where n > v_cur - p_from;
  end if;
  if m.truncated or jsonb_array_length(m.actions) + jsonb_array_length(v_new) > 4000
     or octet_length(m.actions::text) + octet_length(v_new::text) > 300000 then
    -- Full: keep what's there, and let the browser drop the rest.
    update public.friend_move_logs set truncated = true,
      cursors = cursors || jsonb_build_object(p_session, p_from + v_len), updated_at = now()
    where puzzle_id = p.id;
  else
    update public.friend_move_logs set actions = actions || v_new,
      cursors = cursors || jsonb_build_object(p_session, p_from + v_len), updated_at = now()
    where puzzle_id = p.id;
  end if;
  return jsonb_build_object('stored', p_from + v_len);
end $$;

create or replace function public.save_friend_moves(
  p_puzzle_id uuid, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or p.recipient_id is distinct from v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_append_moves(p, p_session, p_from, p_actions);
end $$;

create or replace function public.save_shared_moves(
  p_token text, p_guest_key text, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
begin
  select * into p from public.friend_puzzles where share_token = p_token;
  if not found or p.guest_key_hash is distinct from v_hash then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if public.friend_share_state(p) not in ('playing', 'finished') then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_append_moves(p, p_session, p_from, p_actions);
end $$;

-- The log for the replay: the two people on the puzzle, once it's over.
-- null when nothing was recorded (puzzles played before logs existed).
create or replace function public.get_friend_moves(p_puzzle_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  m public.friend_move_logs%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or (p.creator_id is distinct from v_uid and p.recipient_id is distinct from v_uid)
     or p.finished_at is null then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  select * into m from public.friend_move_logs where puzzle_id = p.id;
  if not found or jsonb_array_length(m.actions) = 0 then return null; end if;
  return jsonb_build_object('actions', m.actions, 'truncated', m.truncated);
end $$;

-- A fresh link clears the unfinished game: its move log goes with it.
create or replace function public.refresh_share_link(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null
    and share_revoked_at is null
  for update;
  if not found then raise exception 'not_found: That link isn''t yours to change.'; end if;
  if p.finished_at is not null then
    raise exception 'already_finished: This puzzle is finished. Its result stays as it is.';
  end if;
  delete from public.friend_guesses where puzzle_id = p.id;
  delete from public.friend_move_logs where puzzle_id = p.id;
  update public.friend_puzzles set
    share_token = public.friend_new_share_token(), share_expires_at = now() + interval '30 days',
    guest_key_hash = null, difficulty = null, cards = null, card_order = null, dealt_extras = null,
    started_at = null, recipient_seen_at = null
  where id = p.id returning * into p;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'expires_at', p.share_expires_at);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function
  public.friend_append_moves(public.friend_puzzles, text, int, jsonb),
  public.save_friend_moves(uuid, text, int, jsonb),
  public.save_shared_moves(text, text, text, int, jsonb),
  public.get_friend_moves(uuid),
  public.refresh_share_link(uuid)
  from public, anon, authenticated;
grant execute on function
  public.save_friend_moves(uuid, text, int, jsonb), public.get_friend_moves(uuid),
  public.refresh_share_link(uuid)
  to authenticated;
-- The person with the link, signed in or not (like submit_shared_guess).
grant execute on function public.save_shared_moves(text, text, text, int, jsonb) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20261014090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Move logs: the animated "Watch … guesses" replay. While a friend puzzle
--  (or a puzzle shared by link) is being played, the app keeps a short log
--  of what the player did on the board — card turns, moves and swaps,
--  Rotate, Shuffle, Reset — and saves it in batches. After the puzzle is
--  finished, the replay plays that log back on the real board, with each
--  submitted guess revealed from its recorded result (friend_guesses).
--
--  • Game actions only: no pointer paths, no screen capture. Each entry is
--    a small object, e.g. {"k":"t","s":2,"d":640} — turn the card in slot 2,
--    640 ms after the previous action (the app caps waits at 5 s).
--    Absolute entries (snapshot, shuffle, reset) carry the whole board.
--  • Exactly once: every browser tab writes as a "session" with a running
--    count, so a batch sent again after a refresh or a lost reply is
--    stored once. A batch that starts beyond what was stored (the browser
--    lost its unsent part) is stored after a {"k":"gap"} marker, and the
--    replay says that part of the play wasn't recorded.
--  • Server-only table: RLS on, no policies, no grants. Saving and reading
--    go through the functions below:
--      save_friend_moves   the solver of a friend puzzle, while playing
--      save_shared_moves   the browser playing a link (link code + guest key)
--      get_friend_moves    the creator or the solver, only once finished —
--                          the same moment the guesses become visible
--    Saving stays open for 10 minutes after the finish so the last batch,
--    sent alongside the final guess, still lands. The log never holds the
--    answer: only the cards the solver was dealt and what they did.
--  • A fresh link (refresh_share_link) clears an unfinished guest game's
--    log together with its guesses.
--  • Size limits: 200 entries / 24 kB per batch; 4000 entries / 300 kB per
--    puzzle, after which the log is marked truncated and stops growing.
--  Nothing here changes scores, results, streaks or notifications.
-- ═══════════════════════════════════════════════════════════════════════

create table public.friend_move_logs (
  puzzle_id uuid primary key references public.friend_puzzles(id) on delete cascade,
  actions jsonb not null default '[]'::jsonb,   -- in the order they arrived
  cursors jsonb not null default '{}'::jsonb,   -- session code → entries stored from it
  truncated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.friend_move_logs is 'Board actions of a friend puzzle attempt, for the animated replay. Server-only; see get_friend_moves.';

alter table public.friend_move_logs enable row level security;
revoke all on public.friend_move_logs from anon, authenticated;

-- One batch from one session. The caller has checked who may write.
create or replace function public.friend_append_moves(
  p public.friend_puzzles, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.friend_move_logs%rowtype;
  v_len int;
  v_cur int;
  v_new jsonb;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{8,40}$'
     or p_from is null or p_from < 0
     or jsonb_typeof(p_actions) is distinct from 'array'
     or jsonb_array_length(p_actions) > 200 or octet_length(p_actions::text) > 24000 then
    raise exception 'invalid_moves: Those moves could not be read.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_actions) as e(a)
             where jsonb_typeof(a) is distinct from 'object'
                or coalesce(a->>'k', '') not in ('s', 't', 'm', 'r', 'x', 'z', 'g')) then
    raise exception 'invalid_moves: Those moves could not be read.';
  end if;
  if p.difficulty is null then
    raise exception 'choose_difficulty: Choose a difficulty to start this puzzle.';
  end if;
  if p.finished_at is not null and now() > p.finished_at + interval '10 minutes' then
    raise exception 'moves_closed: This puzzle is finished.';
  end if;

  insert into public.friend_move_logs (puzzle_id) values (p.id) on conflict (puzzle_id) do nothing;
  select * into m from public.friend_move_logs where puzzle_id = p.id for update;
  v_len := jsonb_array_length(p_actions);
  v_cur := coalesce((m.cursors->>p_session)::int, 0);

  if p_from + v_len <= v_cur then
    return jsonb_build_object('stored', v_cur);         -- all seen before
  end if;
  if not (m.cursors ? p_session) and (select count(*) from jsonb_object_keys(m.cursors)) >= 50 then
    m.truncated := true;
  end if;
  if p_from > v_cur then
    v_new := '[{"k":"gap"}]'::jsonb || p_actions;        -- part of this session never arrived
  else
    select coalesce(jsonb_agg(a order by n), '[]'::jsonb) into v_new
      from jsonb_array_elements(p_actions) with ordinality as t(a, n)
      where n > v_cur - p_from;
  end if;
  if m.truncated or jsonb_array_length(m.actions) + jsonb_array_length(v_new) > 4000
     or octet_length(m.actions::text) + octet_length(v_new::text) > 300000 then
    -- Full: keep what's there, and let the browser drop the rest.
    update public.friend_move_logs set truncated = true,
      cursors = cursors || jsonb_build_object(p_session, p_from + v_len), updated_at = now()
    where puzzle_id = p.id;
  else
    update public.friend_move_logs set actions = actions || v_new,
      cursors = cursors || jsonb_build_object(p_session, p_from + v_len), updated_at = now()
    where puzzle_id = p.id;
  end if;
  return jsonb_build_object('stored', p_from + v_len);
end $$;

create or replace function public.save_friend_moves(
  p_puzzle_id uuid, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or p.recipient_id is distinct from v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_append_moves(p, p_session, p_from, p_actions);
end $$;

create or replace function public.save_shared_moves(
  p_token text, p_guest_key text, p_session text, p_from int, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
begin
  select * into p from public.friend_puzzles where share_token = p_token;
  if not found or p.guest_key_hash is distinct from v_hash then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if public.friend_share_state(p) not in ('playing', 'finished') then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_append_moves(p, p_session, p_from, p_actions);
end $$;

-- The log for the replay: the two people on the puzzle, once it's over.
-- null when nothing was recorded (puzzles played before logs existed).
create or replace function public.get_friend_moves(p_puzzle_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  m public.friend_move_logs%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or (p.creator_id is distinct from v_uid and p.recipient_id is distinct from v_uid)
     or p.finished_at is null then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  select * into m from public.friend_move_logs where puzzle_id = p.id;
  if not found or jsonb_array_length(m.actions) = 0 then return null; end if;
  return jsonb_build_object('actions', m.actions, 'truncated', m.truncated);
end $$;

-- A fresh link clears the unfinished game: its move log goes with it.
create or replace function public.refresh_share_link(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null
    and share_revoked_at is null
  for update;
  if not found then raise exception 'not_found: That link isn''t yours to change.'; end if;
  if p.finished_at is not null then
    raise exception 'already_finished: This puzzle is finished. Its result stays as it is.';
  end if;
  delete from public.friend_guesses where puzzle_id = p.id;
  delete from public.friend_move_logs where puzzle_id = p.id;
  update public.friend_puzzles set
    share_token = public.friend_new_share_token(), share_expires_at = now() + interval '30 days',
    guest_key_hash = null, difficulty = null, cards = null, card_order = null, dealt_extras = null,
    started_at = null, recipient_seen_at = null
  where id = p.id returning * into p;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'expires_at', p.share_expires_at);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function
  public.friend_append_moves(public.friend_puzzles, text, int, jsonb),
  public.save_friend_moves(uuid, text, int, jsonb),
  public.save_shared_moves(text, text, text, int, jsonb),
  public.get_friend_moves(uuid),
  public.refresh_share_link(uuid)
  from public, anon, authenticated;
grant execute on function
  public.save_friend_moves(uuid, text, int, jsonb), public.get_friend_moves(uuid),
  public.refresh_share_link(uuid)
  to authenticated;
-- The person with the link, signed in or not (like submit_shared_guess).
grant execute on function public.save_shared_moves(text, text, text, int, jsonb) to anon, authenticated;
$cvmig$], '20261014090000_friend_move_logs');

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
