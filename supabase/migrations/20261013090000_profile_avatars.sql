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
--  • list_share_links(): stopping a link only turns the link off for the
--    guest. A finished result stays on the sender's list (and replayable)
--    after the link is stopped, and stays "new" until the sender opens it.
--    A finished result that has not been opened is always listed, however
--    many links are older, so the Friends dot always has something to open.
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

-- Same fields as before. Changes: a stopped link stays listed once its game is
-- finished (the link is off; the replay stays), and an unopened finished
-- result is listed even beyond the 20 newest links.
create or replace function public.list_share_links() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'puzzle_id', p.id, 'token', p.share_token, 'label', p.share_label, 'title', p.title,
      'state', public.friend_share_state(p), 'sent_at', p.sent_at, 'expires_at', p.share_expires_at,
      'started_at', p.started_at, 'finished_at', p.finished_at,
      'outcome', p.outcome, 'lives_used', p.lives_used,
      'seen_result', p.creator_seen_result_at is not null) order by p.sent_at desc)
    from public.friend_puzzles p
    where p.creator_id = v_uid and p.share_token is not null and p.recipient_id is null
      and (p.share_revoked_at is null or p.finished_at is not null)
      and ((p.finished_at is not null and p.creator_seen_result_at is null)
        or p.id in (
          select r.id from public.friend_puzzles r
          where r.creator_id = v_uid and r.share_token is not null and r.recipient_id is null
            and (r.share_revoked_at is null or r.finished_at is not null)
          order by r.sent_at desc limit 20))
  ), '[]'::jsonb);
end $$;

-- ── Privileges: the two new functions, for signed-in players only ──────

revoke all on function public.set_avatar(text), public.get_friend_avatars()
  from public, anon, authenticated;
grant execute on function public.set_avatar(text), public.get_friend_avatars()
  to authenticated;
