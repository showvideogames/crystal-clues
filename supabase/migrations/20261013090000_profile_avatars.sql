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
