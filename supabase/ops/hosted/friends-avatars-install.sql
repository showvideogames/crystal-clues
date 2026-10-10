-- Hosted install of the profile-avatars migration, plus its ledger row.
-- Run with tools/hosted.mjs: rehearsal (BEGIN … ROLLBACK) first, then --apply,
-- only with the owner's approval. Adds one nullable column to profiles, two
-- functions callable by signed-in players only (set_avatar, get_friend_avatars),
-- and replaces three functions in place (get_my_profile, get_friend_invite,
-- stop_share_link; their existing grants are kept). No table permission, policy
-- or anon grant changes; existing players have no stored avatar, so they keep
-- the default crystal ball.

-- ==== 20261013090000_profile_avatars ====
-- ═══════════════════════════════════════════════════════════════════════
--  Profile avatars. A player picks one of a few pictures; everyone else
--  who can already see their name (friends, an invite's recipient) sees it
--  too. No choice (null) means the default: the crystal ball wearing the
--  first letter of the player's name, drawn by the app from the name.
--
--  • One nullable column on profiles, limited to the app's avatar keys.
--    The default ball is NOT stored: existing players keep it automatically.
--  • set_avatar(): the player changes their own avatar.
--  • get_friend_avatars(): the chosen avatars of the caller and their
--    friends, keyed by account id. Nobody else's.
--  • get_my_profile() and get_friend_invite() now also say the avatar.
--  • stop_share_link(): a finished guest result on a link the sender
--    stops can no longer be opened anywhere, so it counts as seen. Without
--    this the Friends dot would stay lit for a result that can't be viewed.
--  No table permission or policy changes. Two new functions, callable by
--  signed-in players only.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles add column avatar text
  check (avatar in ('dog', 'cat', 'fox', 'owl', 'frog', 'star'));

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  r public.profiles%rowtype;
begin
  select * into r from public.profiles where id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'display_name', r.display_name, 'avatar', r.avatar,
    'notify_new_puzzle', r.notify_new_puzzle, 'notify_results', r.notify_results,
    'notify_reminders', r.notify_reminders);
end $$;

-- "ball" (or nothing) is the default and is stored as null.
create or replace function public.set_avatar(p_avatar text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_key text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  perform public.friend_require_profile(v_uid);
  if v_key = 'ball' then v_key := null; end if;
  if v_key is not null and v_key not in ('dog', 'cat', 'fox', 'owl', 'frog', 'star') then
    raise exception 'invalid_avatar: Choose one of the avatars in the list.';
  end if;
  update public.profiles set avatar = v_key, updated_at = now() where id = v_uid;
  return public.get_my_profile();
end $$;

-- Only the chosen (non-default) avatars appear; a missing id means the ball.
create or replace function public.get_friend_avatars() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  return coalesce((
    select jsonb_object_agg(pr.id::text, pr.avatar)
    from public.profiles pr
    where pr.avatar is not null
      and (pr.id = v_uid or exists (
        select 1 from public.friendships f
        where (f.user_a = v_uid and f.user_b = pr.id) or (f.user_b = v_uid and f.user_a = pr.id)))
  ), '{}'::jsonb);
end $$;

create or replace function public.get_friend_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.friend_invites%rowtype;
  v_uid uuid := public.cluevoyance_uid();
  v_status text;
begin
  select * into i from public.friend_invites where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_status := case
    when v_uid is not null and i.inviter_id = v_uid then 'own'
    when i.accepted_by is not null and i.accepted_by = v_uid then 'accepted'
    when i.accepted_by is not null then 'used'
    when i.expires_at < now() then 'expired'
    else 'open' end;
  return jsonb_build_object(
    'status', v_status,
    'inviter_name', public.friend_display_name(i.inviter_id),
    'inviter_avatar', (select avatar from public.profiles where id = i.inviter_id),
    'friendship_id', case when v_status = 'accepted' then i.friendship_id end);
end $$;

create or replace function public.stop_share_link(p_puzzle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  update public.friend_puzzles set
    share_revoked_at = coalesce(share_revoked_at, now()),
    creator_seen_result_at = case when finished_at is not null
      then coalesce(creator_seen_result_at, now()) else creator_seen_result_at end
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null;
  if not found then raise exception 'not_found: That link isn''t yours to stop.'; end if;
end $$;

-- ── Privileges: the two new functions, for signed-in players only ──────

revoke all on function public.set_avatar(text), public.get_friend_avatars()
  from public, anon, authenticated;
grant execute on function public.set_avatar(text), public.get_friend_avatars()
  to authenticated;

-- ---- migration ledger ----
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20261013090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Profile avatars. A player picks one of a few pictures; everyone else
--  who can already see their name (friends, an invite's recipient) sees it
--  too. No choice (null) means the default: the crystal ball wearing the
--  first letter of the player's name, drawn by the app from the name.
--
--  • One nullable column on profiles, limited to the app's avatar keys.
--    The default ball is NOT stored: existing players keep it automatically.
--  • set_avatar(): the player changes their own avatar.
--  • get_friend_avatars(): the chosen avatars of the caller and their
--    friends, keyed by account id. Nobody else's.
--  • get_my_profile() and get_friend_invite() now also say the avatar.
--  • stop_share_link(): a finished guest result on a link the sender
--    stops can no longer be opened anywhere, so it counts as seen. Without
--    this the Friends dot would stay lit for a result that can't be viewed.
--  No table permission or policy changes. Two new functions, callable by
--  signed-in players only.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles add column avatar text
  check (avatar in ('dog', 'cat', 'fox', 'owl', 'frog', 'star'));

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  r public.profiles%rowtype;
begin
  select * into r from public.profiles where id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'display_name', r.display_name, 'avatar', r.avatar,
    'notify_new_puzzle', r.notify_new_puzzle, 'notify_results', r.notify_results,
    'notify_reminders', r.notify_reminders);
end $$;

-- "ball" (or nothing) is the default and is stored as null.
create or replace function public.set_avatar(p_avatar text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_key text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  perform public.friend_require_profile(v_uid);
  if v_key = 'ball' then v_key := null; end if;
  if v_key is not null and v_key not in ('dog', 'cat', 'fox', 'owl', 'frog', 'star') then
    raise exception 'invalid_avatar: Choose one of the avatars in the list.';
  end if;
  update public.profiles set avatar = v_key, updated_at = now() where id = v_uid;
  return public.get_my_profile();
end $$;

-- Only the chosen (non-default) avatars appear; a missing id means the ball.
create or replace function public.get_friend_avatars() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  return coalesce((
    select jsonb_object_agg(pr.id::text, pr.avatar)
    from public.profiles pr
    where pr.avatar is not null
      and (pr.id = v_uid or exists (
        select 1 from public.friendships f
        where (f.user_a = v_uid and f.user_b = pr.id) or (f.user_b = v_uid and f.user_a = pr.id)))
  ), '{}'::jsonb);
end $$;

create or replace function public.get_friend_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  i public.friend_invites%rowtype;
  v_uid uuid := public.cluevoyance_uid();
  v_status text;
begin
  select * into i from public.friend_invites where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_status := case
    when v_uid is not null and i.inviter_id = v_uid then 'own'
    when i.accepted_by is not null and i.accepted_by = v_uid then 'accepted'
    when i.accepted_by is not null then 'used'
    when i.expires_at < now() then 'expired'
    else 'open' end;
  return jsonb_build_object(
    'status', v_status,
    'inviter_name', public.friend_display_name(i.inviter_id),
    'inviter_avatar', (select avatar from public.profiles where id = i.inviter_id),
    'friendship_id', case when v_status = 'accepted' then i.friendship_id end);
end $$;

create or replace function public.stop_share_link(p_puzzle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  update public.friend_puzzles set
    share_revoked_at = coalesce(share_revoked_at, now()),
    creator_seen_result_at = case when finished_at is not null
      then coalesce(creator_seen_result_at, now()) else creator_seen_result_at end
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null;
  if not found then raise exception 'not_found: That link isn''t yours to stop.'; end if;
end $$;

-- ── Privileges: the two new functions, for signed-in players only ──────

revoke all on function public.set_avatar(text), public.get_friend_avatars()
  from public, anon, authenticated;
grant execute on function public.set_avatar(text), public.get_friend_avatars()
  to authenticated;
$cvmig$], '20261013090000_profile_avatars');

-- ---- verification (the last statement's result is what the tool prints) ----
select jsonb_build_object(
  'puzzles', (select count(*) from public.puzzles),
  'puzzles_fingerprint', (select md5(string_agg(id::text||'|'||coalesce(date,'')||'|'||coalesce(status,'')||'|'||coalesce(title,''), ',' order by id)) from public.puzzles),
  'wordbank', (select count(*) from public.wordbank),
  'accounts', (select count(*) from public.accounts),
  'admins', (select count(*) from public.admins),
  'plays', (select count(*) from public.plays),
  'ledger', (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations),
  'friend_tables', (select count(*) from information_schema.tables where table_schema='public' and table_name in ('profiles','friend_invites','friendships','friend_puzzle_drafts','friend_puzzles','friend_puzzle_answers','friend_guesses','push_subscriptions','notification_outbox')),
  'friend_tables_without_rls', (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('profiles','friend_invites','friendships','friend_puzzle_drafts','friend_puzzles','friend_puzzle_answers','friend_guesses','push_subscriptions','notification_outbox') and not c.relrowsecurity),
  'anon_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='anon' and table_schema='public'),
  'authenticated_table_grants', (select string_agg(table_name||':'||privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public'),
  'anon_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'anon_functions_all', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'avatar_column', (select string_agg(column_name||':'||data_type, ',') from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar'),
  'authenticated_functions', (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and p.proname in ('set_avatar','get_friend_avatars')),
  'profiles_with_avatar', (select count(*) from public.profiles where avatar is not null),
  'profiles', (select count(*) from public.profiles),
  'policies', (select string_agg(tablename||':'||policyname, ',' order by tablename, policyname) from pg_policies where schemaname='public')
) as after;
