-- Hosted install of the two Friends migrations, in order, plus their ledger rows
-- (what `supabase db push` records). Additive: new Friends objects only.
-- Run with tools/hosted.mjs: rehearsal (BEGIN … ROLLBACK) first, then --apply.

-- ==== 20260926090000_friend_puzzles ====
-- ═══════════════════════════════════════════════════════════════════════
--  Cluevoyance friend-puzzle exchange
-- ═══════════════════════════════════════════════════════════════════════
--  Players (Cluevoyance accounts, public.accounts; see src/account/README.md)
--  invite a friend by link, make personal puzzles for each other, and keep
--  two streaks that belong to the pair. Every player id below is an account
--  id from public.cluevoyance_uid(), never a raw auth user or an email.
--
--  Access model
--  • RLS is on for every table below. Clients get read-only policies at
--    most; there are no insert/update/delete policies at all.
--  • Every write goes through a SECURITY DEFINER function in this file that
--    checks public.cluevoyance_uid() itself.
--  • A sent puzzle's answer lives in its own table and never reaches the
--    solver until the attempt is over. Guesses are judged here, on the
--    server, so the browser never needs the answer to play.
--  • Nothing here touches the official daily puzzles or word bank tables.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Game constants ─────────────────────────────────────────────────────

create or replace function public.friend_max_lives() returns int
language sql immutable as $$ select 3 $$;

-- Same table as DIFFICULTY_EXTRA in the client: how many decoy cards the
-- solver sees on top of the four that belong on the board.
create or replace function public.friend_extra_cards(p_difficulty text) returns int
language sql immutable as $$
  select case p_difficulty
    when 'easy' then 0 when 'standard' then 1 when 'expert' then 2 when 'hardcore' then 3
  end
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  THE DAILY-PERIOD RULE  (the only place it is defined)
-- ═══════════════════════════════════════════════════════════════════════
--  A friendship's daily streak is counted in 24-hour periods on the server
--  clock, so both friends share one deadline whatever their time zones.
--
--   • The first finished friend puzzle (a win or a loss) starts the clock:
--     period 0 begins at that instant and the streak is 1.
--   • Period n covers [anchor + n·24h, anchor + (n+1)·24h).
--   • Each later period needs at least one finished puzzle. A finish in the
--     period straight after the last counted one adds 1. More finishes in
--     an already-counted period add nothing — they cannot be banked.
--   • If a whole period passes with nothing finished, the streak is 0 and
--     the next finished puzzle starts a new clock.
--   • So while a streak is alive, its deadline is
--         anchor + (last_counted_period + 2) · 24h
--     and a puzzle finished at or after that instant starts over at 1.
--   • Creating, sending or opening a puzzle never counts.
--
--  The daily game's own streak uses each device's local calendar date.
--  That cannot be shared by two people in different time zones, which is
--  why friendships use this server-anchored rolling period instead.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_period_length() returns interval
language sql immutable as $$ select interval '24 hours' $$;

create or replace function public.friend_period_index(p_anchor timestamptz, p_at timestamptz)
returns int language sql immutable as $$
  select floor(
    extract(epoch from (p_at - p_anchor)) / extract(epoch from public.friend_period_length())
  )::int
$$;

-- New stored streak state after a friend puzzle is finished at p_finished_at.
create or replace function public.friend_daily_after_finish(
  p_anchor timestamptz, p_last_period int, p_streak int, p_finished_at timestamptz,
  out anchor timestamptz, out last_period int, out streak int)
language plpgsql immutable as $$
declare
  v_period int;
begin
  if p_anchor is not null and p_last_period is not null and coalesce(p_streak, 0) > 0 then
    v_period := public.friend_period_index(p_anchor, p_finished_at);
    if v_period <= p_last_period then
      -- Already counted this period: no change, nothing banked.
      anchor := p_anchor; last_period := p_last_period; streak := p_streak;
      return;
    elsif v_period = p_last_period + 1 then
      anchor := p_anchor; last_period := v_period; streak := p_streak + 1;
      return;
    end if;
  end if;
  -- No live streak (never started, or a whole period was missed):
  -- this finish starts a new clock.
  anchor := p_finished_at; last_period := 0; streak := 1;
end $$;

-- What both friends see at p_now for the stored streak state.
--   streak            0 once a whole period has been missed
--   deadline_at       finish a puzzle before this instant to keep the streak
--   done_this_period  a puzzle was already finished in the current period
--   next_period_at    when the current (already counted) period ends
create or replace function public.friend_daily_status(
  p_anchor timestamptz, p_last_period int, p_streak int, p_now timestamptz,
  out streak int, out deadline_at timestamptz, out done_this_period boolean,
  out next_period_at timestamptz)
language plpgsql immutable as $$
declare
  v_period int;
begin
  streak := 0; deadline_at := null; done_this_period := false; next_period_at := null;
  if p_anchor is null or p_last_period is null or coalesce(p_streak, 0) = 0 then
    return;
  end if;
  v_period := public.friend_period_index(p_anchor, p_now);
  if v_period > p_last_period + 1 then
    return;
  end if;
  streak := p_streak;
  deadline_at := p_anchor + (p_last_period + 2) * public.friend_period_length();
  done_this_period := v_period <= p_last_period;
  next_period_at := p_anchor + (p_last_period + 1) * public.friend_period_length();
end $$;

-- Team win streak: consecutive finished friend puzzles won by either
-- friend, in the order they were finished. Any finished loss resets it.
create or replace function public.friend_team_after_finish(p_streak int, p_outcome text)
returns int language sql immutable as $$
  select case when p_outcome = 'won' then coalesce(p_streak, 0) + 1 else 0 end
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  TABLES
-- ═══════════════════════════════════════════════════════════════════════

create table public.profiles (
  id uuid primary key references public.accounts(user_id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  notify_new_puzzle boolean not null default true,
  notify_results boolean not null default true,
  notify_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_id uuid not null references public.accounts(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.accounts(user_id) on delete set null,
  accepted_at timestamptz,
  friendship_id uuid
);
create index friend_invites_inviter on public.friend_invites(inviter_id, created_at desc);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.accounts(user_id) on delete cascade,
  user_b uuid not null references public.accounts(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Daily streak state (see the rule above). Players see it as "Friend Streak".
  daily_anchor timestamptz,
  daily_last_period int,
  daily_streak int not null default 0,
  -- Team win streak. Players see it as "Solve Streak".
  team_win_streak int not null default 0,
  last_finished_at timestamptz,
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_pair unique (user_a, user_b)
);
create index friendships_user_b on public.friendships(user_b);

-- A creator's work in progress. One open draft per creator per friendship.
create table public.friend_puzzle_drafts (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  creator_id uuid not null references public.accounts(user_id) on delete cascade,
  version int not null default 1,
  title text not null default '' check (char_length(title) <= 40),
  difficulty text not null default 'standard'
    check (difficulty in ('easy','standard','expert','hardcore')),
  -- { clues:[4 strings], cards:{id:{id,words:[4]}}, slots:[{cardId,orientation}] }
  board jsonb not null check (octet_length(board::text) <= 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_puzzle_id uuid
);
create unique index friend_drafts_one_open
  on public.friend_puzzle_drafts(friendship_id, creator_id) where sent_puzzle_id is null;

-- A sent puzzle. Everything the solver may see; the answer is elsewhere.
create table public.friend_puzzles (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  creator_id uuid not null references public.accounts(user_id) on delete cascade,
  recipient_id uuid not null references public.accounts(user_id) on delete cascade,
  draft_id uuid unique,
  title text not null default '',
  difficulty text not null,
  clues jsonb not null,        -- the four clues in their original positions (top, right, bottom, left)
  cards jsonb not null,        -- only the cards the solver will see, under opaque ids
  card_order jsonb not null,   -- those ids in a random order
  sent_at timestamptz not null default now(),
  recipient_seen_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  outcome text check (outcome in ('won','lost')),
  lives_used int,
  creator_seen_result_at timestamptz,
  constraint friend_puzzles_parties check (creator_id <> recipient_id),
  constraint friend_puzzles_finished check ((finished_at is null) = (outcome is null))
);
-- One unfinished puzzle per sender per friendship: the friend plays it
-- before the sender can send another. Also backs duplicate-send protection.
create unique index friend_puzzles_one_open
  on public.friend_puzzles(friendship_id, creator_id) where finished_at is null;
create index friend_puzzles_recipient on public.friend_puzzles(recipient_id, finished_at);
create index friend_puzzles_friendship on public.friend_puzzles(friendship_id, sent_at desc);

-- The immutable answer, relative to the original clue positions.
create table public.friend_puzzle_answers (
  puzzle_id uuid primary key references public.friend_puzzles(id) on delete cascade,
  slot_cards jsonb not null,    -- card ids for slots 0..3 (TL, TR, BR, BL)
  orientations jsonb not null   -- orientation 0..3 for each of those slots
);

-- Each submitted guess exactly as the solver's board looked at Submit.
create table public.friend_guesses (
  puzzle_id uuid not null references public.friend_puzzles(id) on delete cascade,
  guess_no int not null check (guess_no between 1 and 3),
  solver_id uuid not null references public.accounts(user_id) on delete cascade,
  board jsonb not null,               -- [{cardId, orientation}] for slots 0..3 (TL, TR, BR, BL)
  extras jsonb not null default '[]', -- the tray at that moment, [{cardId, orientation}]
  clues jsonb not null,               -- clue on each side at that moment (reflects Rotate)
  correct jsonb not null,             -- slot indexes judged correct
  lives_left int not null,
  created_at timestamptz not null default now(),
  primary key (puzzle_id, guess_no)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions(user_id);

-- Transactional outbox for web push. Rows are written in the same
-- transaction as the event, deduplicated by key, and re-checked for
-- staleness right before they are sent.
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  kind text not null check (kind in ('new_puzzle','result','reminder')),
  dedupe_key text not null unique,
  friendship_id uuid references public.friendships(id) on delete cascade,
  puzzle_id uuid references public.friend_puzzles(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  not_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','skipped','failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text
);
create index notification_outbox_pending on public.notification_outbox(status, id);

-- ── Immutability guards ────────────────────────────────────────────────

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
begin
  if new.clues is distinct from old.clues or new.cards is distinct from old.cards
     or new.card_order is distinct from old.card_order
     or new.creator_id is distinct from old.creator_id
     or new.recipient_id is distinct from old.recipient_id
     or new.friendship_id is distinct from old.friendship_id
     or new.difficulty is distinct from old.difficulty
     or new.title is distinct from old.title then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if old.finished_at is not null and (
       new.finished_at is distinct from old.finished_at
       or new.outcome is distinct from old.outcome
       or new.lives_used is distinct from old.lives_used) then
    raise exception 'immutable: a finished result cannot be changed';
  end if;
  return new;
end $$;
create trigger friend_puzzles_guard before update on public.friend_puzzles
  for each row execute function public.friend_puzzles_guard();

create or replace function public.friend_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'immutable: % rows cannot be changed', tg_table_name;
end $$;
create trigger friend_answers_immutable before update on public.friend_puzzle_answers
  for each row execute function public.friend_no_update();
create trigger friend_guesses_immutable before update on public.friend_guesses
  for each row execute function public.friend_no_update();

-- ═══════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — read-only, own rows only
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_puzzle_drafts enable row level security;
alter table public.friend_puzzles enable row level security;
alter table public.friend_puzzle_answers enable row level security;
alter table public.friend_guesses enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.profiles, public.friend_invites, public.friendships,
  public.friend_puzzle_drafts, public.friend_puzzles, public.friend_puzzle_answers,
  public.friend_guesses, public.push_subscriptions, public.notification_outbox
  from anon, authenticated;
grant select on public.profiles, public.friend_invites, public.friendships,
  public.friend_puzzle_drafts, public.friend_puzzles, public.friend_puzzle_answers,
  public.friend_guesses, public.push_subscriptions
  to authenticated;

create policy profiles_own on public.profiles for select to authenticated
  using (id = public.cluevoyance_uid());
create policy invites_own on public.friend_invites for select to authenticated
  using (inviter_id = public.cluevoyance_uid());
create policy friendships_member on public.friendships for select to authenticated
  using (public.cluevoyance_uid() in (user_a, user_b));
create policy drafts_own on public.friend_puzzle_drafts for select to authenticated
  using (creator_id = public.cluevoyance_uid());
create policy puzzles_party on public.friend_puzzles for select to authenticated
  using (public.cluevoyance_uid() in (creator_id, recipient_id));
create policy answers_creator_or_finished_solver on public.friend_puzzle_answers
  for select to authenticated using (exists (
    select 1 from public.friend_puzzles p
    where p.id = puzzle_id
      and (p.creator_id = public.cluevoyance_uid()
           or (p.recipient_id = public.cluevoyance_uid() and p.finished_at is not null))));
create policy guesses_solver_or_finished_creator on public.friend_guesses
  for select to authenticated using (exists (
    select 1 from public.friend_puzzles p
    where p.id = puzzle_id
      and (p.recipient_id = public.cluevoyance_uid()
           or (p.creator_id = public.cluevoyance_uid() and p.finished_at is not null))));
create policy push_own on public.push_subscriptions for select to authenticated
  using (user_id = public.cluevoyance_uid());
-- notification_outbox: no policy — server only.

-- ═══════════════════════════════════════════════════════════════════════
--  HELPERS
-- ═══════════════════════════════════════════════════════════════════════
-- Errors are raised as "code: message" so the client can branch on the
-- code and show the message.

create or replace function public.friend_require_uid() returns uuid
language plpgsql stable as $$
declare
  v uuid := public.cluevoyance_uid();
begin
  if v is null then
    raise exception 'not_signed_in: Sign in to use Friends.';
  end if;
  return v;
end $$;

create or replace function public.friend_require_profile(p_uid uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = p_uid;
  if v_name is null then
    raise exception 'no_profile: Choose a display name first.';
  end if;
  return v_name;
end $$;

create or replace function public.friend_display_name(p_uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select display_name from public.profiles where id = p_uid), 'Your friend')
$$;

-- Adds a push notification to the outbox if the user wants this kind and
-- has at least one device subscribed. Never raises: push must not block play.
create or replace function public.friend_enqueue_push(
  p_user uuid, p_kind text, p_dedupe text, p_friendship uuid, p_puzzle uuid,
  p_body text, p_url text, p_not_after timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wants boolean;
begin
  select case p_kind
      when 'new_puzzle' then notify_new_puzzle
      when 'result' then notify_results
      when 'reminder' then notify_reminders
    end
    into v_wants from public.profiles where id = p_user;
  if not coalesce(v_wants, false) then return false; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then return false; end if;
  insert into public.notification_outbox
    (user_id, kind, dedupe_key, friendship_id, puzzle_id, title, body, url, tag, not_after)
  values
    (p_user, p_kind, p_dedupe, p_friendship, p_puzzle, 'Cluevoyance', p_body, p_url,
     p_kind || ':' || coalesce(p_friendship::text, ''), p_not_after)
  on conflict (dedupe_key) do nothing;
  return found;
exception when others then
  raise warning 'friend_enqueue_push skipped: %', sqlerrm;
  return false;
end $$;

-- Validates a draft board for sending. Returns null when it is sendable,
-- otherwise a message for the creator.
create or replace function public.friend_validate_board(p_board jsonb, p_difficulty text)
returns text language plpgsql immutable as $$
declare
  v_extra int := public.friend_extra_cards(p_difficulty);
  v_needed int;
  v_clue text;
  v_card_id text;
  v_orient jsonb;
  v_words jsonb;
  v_word text;
  v_seen text[] := '{}';
  i int; j int;
begin
  if v_extra is null then return 'Choose a difficulty.'; end if;
  v_needed := 4 + v_extra;
  if jsonb_typeof(p_board) is distinct from 'object'
     or jsonb_typeof(p_board->'clues') is distinct from 'array' or jsonb_array_length(p_board->'clues') <> 4
     or jsonb_typeof(p_board->'slots') is distinct from 'array' or jsonb_typeof(p_board->'cards') is distinct from 'object' then
    return 'The puzzle is incomplete.';
  end if;
  for i in 0..3 loop
    if jsonb_typeof(p_board->'clues'->i) is distinct from 'string' then return 'Every side needs a clue.'; end if;
    v_clue := btrim(p_board->'clues'->>i);
    if v_clue = '' then return 'Every side needs a clue.'; end if;
    if char_length(v_clue) > 20 then return 'Clues can be up to 20 letters.'; end if;
  end loop;
  if jsonb_array_length(p_board->'slots') < v_needed then
    return 'Deal or add enough cards for this difficulty.';
  end if;
  for i in 0..v_needed - 1 loop
    v_card_id := p_board->'slots'->i->>'cardId';
    v_orient := p_board->'slots'->i->'orientation';
    if v_card_id is null or v_card_id = any(v_seen) then return 'The board has a missing card.'; end if;
    v_seen := v_seen || v_card_id;
    if jsonb_typeof(v_orient) is distinct from 'number' or (v_orient)::int not between 0 and 3 then
      return 'The board has a card in an unknown position.';
    end if;
    v_words := p_board->'cards'->v_card_id->'words';
    if jsonb_typeof(v_words) is distinct from 'array' or jsonb_array_length(v_words) <> 4 then
      return 'Every card needs four words.';
    end if;
    for j in 0..3 loop
      if jsonb_typeof(v_words->j) is distinct from 'string' then return 'Every card edge needs a word.'; end if;
      v_word := btrim(v_words->>j);
      if v_word = '' then return 'Every card edge needs a word.'; end if;
      if char_length(v_word) > 18 then return 'Card words can be up to 18 letters.'; end if;
    end loop;
  end loop;
  return null;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PROFILE
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  r public.profiles%rowtype;
begin
  select * into r from public.profiles where id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'display_name', r.display_name,
    'notify_new_puzzle', r.notify_new_puzzle, 'notify_results', r.notify_results,
    'notify_reminders', r.notify_reminders);
end $$;

create or replace function public.set_display_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'invalid_name: Display names are 1 to 24 characters.';
  end if;
  if v_name ~ '[[:cntrl:]<>]' then
    raise exception 'invalid_name: Please use letters, numbers and simple punctuation.';
  end if;
  insert into public.profiles (id, display_name) values (v_uid, v_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  return public.get_my_profile();
end $$;

create or replace function public.update_notification_prefs(
  p_new_puzzle boolean, p_results boolean, p_reminders boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  perform public.friend_require_profile(v_uid);
  update public.profiles set
    notify_new_puzzle = coalesce(p_new_puzzle, notify_new_puzzle),
    notify_results = coalesce(p_results, notify_results),
    notify_reminders = coalesce(p_reminders, notify_reminders),
    updated_at = now()
  where id = v_uid;
  return public.get_my_profile();
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  INVITATIONS
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_friend_invite() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_token text;
  v_expires timestamptz;
begin
  perform public.friend_require_profile(v_uid);
  if (select count(*) from public.friend_invites
      where inviter_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited: That''s a lot of invites today — try again tomorrow.';
  end if;
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.friend_invites (token, inviter_id)
  values (v_token, v_uid)
  returning expires_at into v_expires;
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

-- Readable by anyone holding the (unguessable) token, so the invite page
-- can say who it is from before the friend signs in.
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
    'friendship_id', case when v_status = 'accepted' then i.friendship_id end);
end $$;

create or replace function public.accept_friend_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  i public.friend_invites%rowtype;
  v_a uuid; v_b uuid;
  v_fid uuid;
begin
  perform public.friend_require_profile(v_uid);
  select * into i from public.friend_invites where token = p_token for update;
  if not found then raise exception 'invite_not_found: That invite link isn''t valid.'; end if;
  if i.inviter_id = v_uid then raise exception 'own_invite: This is your own invite — send it to a friend.'; end if;
  if i.accepted_by is not null then
    if i.accepted_by = v_uid then
      return jsonb_build_object('friendship_id', i.friendship_id, 'friend_name', public.friend_display_name(i.inviter_id));
    end if;
    raise exception 'invite_used: Someone has already used this invite. Ask for a new link.';
  end if;
  if i.expires_at < now() then raise exception 'invite_expired: This invite has expired. Ask for a new link.'; end if;

  v_a := least(v_uid, i.inviter_id);
  v_b := greatest(v_uid, i.inviter_id);
  insert into public.friendships (user_a, user_b) values (v_a, v_b)
  on conflict (user_a, user_b) do nothing
  returning id into v_fid;
  if v_fid is null then
    select id into v_fid from public.friendships where user_a = v_a and user_b = v_b;
  end if;
  update public.friend_invites set accepted_by = v_uid, accepted_at = now(), friendship_id = v_fid
  where id = i.id;
  return jsonb_build_object('friendship_id', v_fid, 'friend_name', public.friend_display_name(i.inviter_id));
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  FRIENDS INBOX
-- ═══════════════════════════════════════════════════════════════════════
--  next_action, from the caller's point of view:
--    play        a puzzle from the friend is waiting (or half played)
--    see_result  the friend finished the caller's puzzle; not viewed yet
--    waiting     the caller's puzzle is with the friend, unfinished
--    make_back   the caller last solved the friend's puzzle — make one back
--    make        otherwise
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_friends_inbox() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_now timestamptz := now();
  v_friends jsonb;
begin
  select coalesce(jsonb_agg(row_obj order by sort_rank, last_activity desc), '[]'::jsonb)
  into v_friends
  from (
    select
      jsonb_build_object(
        'friendship_id', f.id,
        'friend_id', o.id,
        'friend_name', public.friend_display_name(o.id),
        'since', f.created_at,
        'daily_streak', ds.streak,
        'deadline_at', ds.deadline_at,
        'done_this_period', ds.done_this_period,
        'next_period_at', ds.next_period_at,
        'team_win_streak', f.team_win_streak,
        'next_action', act.action,
        'incoming', case when inc.id is null then null else jsonb_build_object(
          'puzzle_id', inc.id, 'title', inc.title, 'difficulty', inc.difficulty,
          'sent_at', inc.sent_at, 'started', inc.started_at is not null,
          'seen', inc.recipient_seen_at is not null, 'guesses', inc.guesses) end,
        'outgoing', case when outg.id is null then null else jsonb_build_object(
          'puzzle_id', outg.id, 'sent_at', outg.sent_at, 'started', outg.started_at is not null) end,
        'unseen_result', case when uns.id is null then null else jsonb_build_object(
          'puzzle_id', uns.id, 'outcome', uns.outcome, 'lives_used', uns.lives_used,
          'finished_at', uns.finished_at) end,
        'last_finished', case when lf.id is null then null else jsonb_build_object(
          'puzzle_id', lf.id, 'by_me', lf.recipient_id = v_uid, 'outcome', lf.outcome,
          'lives_used', lf.lives_used, 'finished_at', lf.finished_at) end,
        'draft', case when dr.id is null then null else jsonb_build_object(
          'id', dr.id, 'updated_at', dr.updated_at) end
      ) as row_obj,
      case act.action when 'play' then 0 when 'see_result' then 1 when 'make_back' then 2
                      when 'make' then 3 else 4 end as sort_rank,
      greatest(f.created_at, lf.finished_at, inc.sent_at, outg.sent_at) as last_activity
    from public.friendships f
    cross join lateral (select case when f.user_a = v_uid then f.user_b else f.user_a end as id) o
    cross join lateral public.friend_daily_status(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now) ds
    left join lateral (
      select p.id, p.title, p.difficulty, p.sent_at, p.started_at, p.recipient_seen_at,
             (select count(*) from public.friend_guesses g where g.puzzle_id = p.id) as guesses
      from public.friend_puzzles p
      where p.friendship_id = f.id and p.recipient_id = v_uid and p.finished_at is null
      limit 1) inc on true
    left join lateral (
      select p.id, p.sent_at, p.started_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.creator_id = v_uid and p.finished_at is null
      limit 1) outg on true
    left join lateral (
      select p.id, p.outcome, p.lives_used, p.finished_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.creator_id = v_uid
        and p.finished_at is not null and p.creator_seen_result_at is null
      order by p.finished_at desc limit 1) uns on true
    left join lateral (
      select p.id, p.recipient_id, p.outcome, p.lives_used, p.finished_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.finished_at is not null
      order by p.finished_at desc limit 1) lf on true
    left join lateral (
      select d.id, d.updated_at from public.friend_puzzle_drafts d
      where d.friendship_id = f.id and d.creator_id = v_uid and d.sent_puzzle_id is null
      limit 1) dr on true
    cross join lateral (select case
      when inc.id is not null then 'play'
      when uns.id is not null then 'see_result'
      when outg.id is not null then 'waiting'
      when lf.id is not null and lf.recipient_id = v_uid then 'make_back'
      else 'make' end as action) act
    where v_uid in (f.user_a, f.user_b)
  ) rows;

  return jsonb_build_object(
    'server_now', v_now,
    'me', public.get_my_profile(),
    'unread', (
      (select count(*) from public.friend_puzzles
        where recipient_id = v_uid and finished_at is null and recipient_seen_at is null)
      + (select count(*) from public.friend_puzzles
        where creator_id = v_uid and finished_at is not null and creator_seen_result_at is null)),
    'friends', v_friends);
end $$;

create or replace function public.list_friend_history(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  if not exists (select 1 from public.friendships
                 where id = p_friendship_id and v_uid in (user_a, user_b)) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'puzzle_id', p.id,
      'direction', case when p.creator_id = v_uid then 'sent' else 'received' end,
      'title', p.title, 'difficulty', p.difficulty,
      'sent_at', p.sent_at, 'finished_at', p.finished_at,
      'outcome', p.outcome, 'lives_used', p.lives_used) order by p.sent_at desc)
    from (select * from public.friend_puzzles
          where friendship_id = p_friendship_id order by sent_at desc limit 30) p
  ), '[]'::jsonb);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  DRAFTS
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_member_other(p_friendship_id uuid, p_uid uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.friendships%rowtype;
begin
  select * into f from public.friendships where id = p_friendship_id;
  if not found or p_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  return case when f.user_a = p_uid then f.user_b else f.user_a end;
end $$;

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  select * into d from public.friend_puzzle_drafts
  where friendship_id = p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'difficulty', d.difficulty, 'board', d.board, 'updated_at', d.updated_at);
end $$;

-- Optimistic concurrency: an update must name the version it was based on,
-- so two tabs cannot silently overwrite each other.
create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int,
  p_title text, p_difficulty text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  if p_difficulty not in ('easy','standard','expert','hardcore') then
    raise exception 'invalid_puzzle: Choose a difficulty.';
  end if;
  if jsonb_typeof(p_board) is distinct from 'object' or octet_length(p_board::text) > 16000 then
    raise exception 'invalid_puzzle: That puzzle is too large to save.';
  end if;
  if p_draft_id is null then
    begin
      insert into public.friend_puzzle_drafts (friendship_id, creator_id, title, difficulty, board)
      values (p_friendship_id, v_uid, left(btrim(coalesce(p_title, '')), 40), p_difficulty, p_board)
      returning * into d;
    exception when unique_violation then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end;
  else
    update public.friend_puzzle_drafts set
      title = left(btrim(coalesce(p_title, '')), 40),
      difficulty = p_difficulty, board = p_board,
      version = version + 1, updated_at = now()
    where id = p_draft_id and creator_id = v_uid and friendship_id = p_friendship_id
      and sent_puzzle_id is null and version = p_version
    returning * into d;
    if not found then
      if exists (select 1 from public.friend_puzzle_drafts
                 where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is not null) then
        raise exception 'draft_sent: This puzzle has already been sent.';
      end if;
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
  end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'updated_at', d.updated_at);
end $$;

create or replace function public.discard_friend_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  delete from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is null;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  SENDING
-- ═══════════════════════════════════════════════════════════════════════
--  Sends exactly the saved version of a draft. On the way out every card
--  gets a fresh opaque id and its stored words are turned by a random
--  quarter-turn (with the answer's orientation adjusted to match), so
--  neither the ids nor the word order in the payload hint at the answer.
--  Decoys beyond the chosen difficulty are dropped. Idempotent: sending an
--  already-sent draft returns the puzzle it became.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_extra int;
  v_cards jsonb := '{}'::jsonb;
  v_slot_cards jsonb := '[]'::jsonb;
  v_orients jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_clues jsonb;
  v_order jsonb;
  v_src text; v_new text; v_rot int; v_orient int;
  v_words jsonb; v_turned jsonb;
  v_puzzle_id uuid;
  i int;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if p_version is distinct from d.version then
    raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
  end if;

  select * into f from public.friendships where id = d.friendship_id for update;
  if not found or v_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  v_recipient := case when f.user_a = v_uid then f.user_b else f.user_a end;

  v_err := public.friend_validate_board(d.board, d.difficulty);
  if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;

  if exists (select 1 from public.friend_puzzles
             where friendship_id = f.id and creator_id = v_uid and finished_at is null) then
    raise exception 'already_waiting: % hasn''t finished your last puzzle yet.',
      public.friend_display_name(v_recipient);
  end if;

  v_extra := public.friend_extra_cards(d.difficulty);
  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(d.board->'clues') with ordinality as t(c, n);

  for i in 0 .. 3 + v_extra loop
    v_src := d.board->'slots'->i->>'cardId';
    v_orient := (d.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := d.board->'cards'->v_src->'words';
    -- Stored word j becomes old word (j + rot); shown with orientation
    -- (o + rot), every edge reads exactly as the creator placed it.
    select jsonb_agg(upper(btrim(v_words->>((j + v_rot) % 4))) order by j)
      into v_turned from generate_series(0, 3) as j;
    v_cards := v_cards || jsonb_build_object(v_new, jsonb_build_object('id', v_new, 'words', v_turned));
    v_ids := v_ids || v_new;
    if i < 4 then
      v_slot_cards := v_slot_cards || to_jsonb(v_new);
      v_orients := v_orients || to_jsonb((v_orient + v_rot) % 4);
    end if;
  end loop;
  select jsonb_agg(x order by random()) into v_order from unnest(v_ids) as x;

  insert into public.friend_puzzles
    (friendship_id, creator_id, recipient_id, draft_id, title, difficulty, clues, cards, card_order)
  values
    (f.id, v_uid, v_recipient, d.id, d.title, d.difficulty, v_clues, v_cards, v_order)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations)
  values (v_puzzle_id, v_slot_cards, v_orients);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = d.id;

  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');

  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PLAYING
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_friendship_status(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.friendships%rowtype;
  s record;
begin
  select * into f from public.friendships where id = p_friendship_id;
  select * into s from public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, now());
  return jsonb_build_object(
    'daily_streak', s.streak, 'deadline_at', s.deadline_at,
    'done_this_period', s.done_this_period, 'next_period_at', s.next_period_at,
    'team_win_streak', f.team_win_streak, 'server_now', now());
end $$;

-- Role-appropriate view of one puzzle.
--   solver:  board, own guesses; the answer only once finished
--   creator: board and answer; the solver's guesses only once finished
-- Opening as the solver marks it seen (it does not count for streaks);
-- opening a finished puzzle as the creator marks the result seen.
create or replace function public.open_friend_puzzle(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  v_role text;
  v_show_answer boolean;
  v_show_guesses boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or v_uid not in (p.creator_id, p.recipient_id) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when v_uid = p.recipient_id then 'solver' else 'creator' end;
  if v_role = 'solver' and (p.recipient_seen_at is null or p.started_at is null) then
    update public.friend_puzzles
      set recipient_seen_at = coalesce(recipient_seen_at, now()), started_at = coalesce(started_at, now())
      where id = p.id;
  elsif v_role = 'creator' and p.finished_at is not null and p.creator_seen_result_at is null then
    update public.friend_puzzles set creator_seen_result_at = now() where id = p.id;
  end if;
  v_show_answer := v_role = 'creator' or p.finished_at is not null;
  v_show_guesses := v_role = 'solver' or p.finished_at is not null;

  return jsonb_build_object(
    'id', p.id, 'role', v_role, 'friendship_id', p.friendship_id,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'solver_name', public.friend_display_name(p.recipient_id),
    'clues', p.clues, 'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', case when v_show_guesses then coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb) end,
    'solution', case when v_show_answer then (
        select jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations)
        from public.friend_puzzle_answers a where a.puzzle_id = p.id) end,
    'friendship', public.friend_friendship_status(p.friendship_id));
end $$;

create or replace function public.friend_guess_response(p_puzzle_id uuid, p_guess_no int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  g public.friend_guesses%rowtype;
  v_final boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  select * into g from public.friend_guesses where puzzle_id = p_puzzle_id and guess_no = p_guess_no;
  v_final := p.finished_at is not null
    and p_guess_no = (select max(guess_no) from public.friend_guesses where puzzle_id = p_puzzle_id);
  return jsonb_build_object(
    'guess_no', g.guess_no, 'correct', g.correct, 'lives_left', g.lives_left,
    'outcome', case when v_final then p.outcome end,
    'lives_used', case when v_final then p.lives_used end,
    'solution', case when v_final then (
        select jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations)
        from public.friend_puzzle_answers a where a.puzzle_id = p.id) end,
    'friendship', case when v_final then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- Judges one Submit. p_guess_no must be the next number: a retry of a
-- guess already recorded (same board) gets the recorded answer back, and
-- anything else stale is refused, so double taps, two tabs and network
-- retries can never cost a second life or finish a puzzle twice.
create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  g public.friend_guesses%rowtype;
  f public.friendships%rowtype;
  v_daily record;
  v_count int;
  v_rot int;
  v_seen text[] := '{}';
  v_card text;
  v_or jsonb;
  v_correct int[] := '{}';
  v_lives int;
  v_outcome text;
  v_now timestamptz := now();
  r int; i int;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;

  select * into g from public.friend_guesses where puzzle_id = p.id and guess_no = p_guess_no;
  if found then
    if g.board = p_board and g.clues = p_clues then
      return public.friend_guess_response(p.id, p_guess_no);
    end if;
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;
  if p.finished_at is not null then
    raise exception 'already_finished: You''ve already finished this puzzle.';
  end if;
  select count(*) into v_count from public.friend_guesses where puzzle_id = p.id;
  if p_guess_no is distinct from v_count + 1 then
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;

  -- The board: four distinct cards from this puzzle, each turned 0..3.
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) <> 4
     or jsonb_typeof(p_clues) is distinct from 'array' or jsonb_array_length(p_clues) <> 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..3 loop
    v_card := p_board->i->>'cardId';
    v_or := p_board->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;

  -- Which whole-board Rotate the solver is on, from where the clues sit
  -- (the same test the daily game makes).
  v_rot := null;
  for r in 0..3 loop
    if (select bool_and(p_clues->>k = p.clues->>((k - r + 4) % 4)) from generate_series(0, 3) as k) then
      v_rot := r; exit;
    end if;
  end loop;
  if v_rot is null then raise exception 'invalid_guess: That board could not be read.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  for i in 0..3 loop
    if p_board->i->>'cardId' = a.slot_cards->>((i - v_rot + 4) % 4)
       and (p_board->i->>'orientation')::int
           = ((a.orientations->>((i - v_rot + 4) % 4))::int + v_rot) % 4 then
      v_correct := v_correct || i;
    end if;
  end loop;

  -- Every earlier guess was a miss (a hit would have finished the puzzle).
  v_lives := public.friend_max_lives() - v_count
             - case when cardinality(v_correct) = 4 then 0 else 1 end;
  if cardinality(v_correct) = 4 then v_outcome := 'won';
  elsif v_lives <= 0 then v_outcome := 'lost';
  end if;

  insert into public.friend_guesses (puzzle_id, guess_no, solver_id, board, extras, clues, correct, lives_left)
  values (p.id, p_guess_no, v_uid, p_board,
          case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end,
          p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    -- Streaks belong to the friendship. Locking the row serializes finishes
    -- from both friends so the win streak follows the order they happened.
    select * into f from public.friendships where id = p.friendship_id for update;
    select * into v_daily from public.friend_daily_after_finish(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now);
    update public.friendships set
      daily_anchor = v_daily.anchor,
      daily_last_period = v_daily.last_period,
      daily_streak = v_daily.streak,
      team_win_streak = public.friend_team_after_finish(f.team_win_streak, v_outcome),
      last_finished_at = v_now
    where id = f.id;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.', public.friend_display_name(v_uid)),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  WEB PUSH
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  if p_endpoint !~ '^https://' then
    raise exception 'invalid_subscription: That notification subscription isn''t valid.';
  end if;
  -- A device belongs to whoever signed in on it most recently.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid;
end $$;

-- Near-deadline reminders: at most one per friend per streak deadline, and
-- only in the last p_window before it, only while nothing has been
-- finished this period, and only for people who turned reminders on.
create or replace function public.enqueue_deadline_reminders(
  p_now timestamptz default now(), p_window interval default interval '3 hours') returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int := 0;
  rec record;
  v_hours int;
  v_queued boolean;
begin
  for rec in
    select f.id as friendship_id, m.uid, m.other, s.streak, s.deadline_at,
           exists (select 1 from public.friend_puzzles p
                   where p.friendship_id = f.id and p.recipient_id = m.uid and p.finished_at is null) as has_puzzle
    from public.friendships f
    cross join lateral public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, p_now) s
    cross join lateral (values (f.user_a, f.user_b), (f.user_b, f.user_a)) as m(uid, other)
    where s.streak > 0 and not s.done_this_period
      and s.deadline_at > p_now + interval '5 minutes'
      and s.deadline_at <= p_now + p_window
  loop
    v_hours := greatest(1, round(extract(epoch from (rec.deadline_at - p_now)) / 3600.0)::int);
    v_queued := public.friend_enqueue_push(
      rec.uid, 'reminder',
      'reminder:' || rec.friendship_id || ':' || rec.uid || ':' || floor(extract(epoch from rec.deadline_at))::bigint,
      rec.friendship_id, null,
      case when rec.has_puzzle then
        format('Finish %s''s puzzle to keep your %s-day Friend Streak — about %s left.',
          public.friend_display_name(rec.other), rec.streak,
          case when v_hours = 1 then 'an hour' else v_hours || ' hours' end)
      else
        format('Your %s-day Friend Streak with %s ends in about %s.',
          rec.streak, public.friend_display_name(rec.other),
          case when v_hours = 1 then 'an hour' else v_hours || ' hours' end)
      end,
      '/?friends=1', rec.deadline_at);
    if v_queued then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Claims a batch for the dispatcher. First retires anything stale: past its
-- time, a new-puzzle alert for a puzzle already opened, a result alert
-- already viewed in the app, or a reminder once the period is safe.
create or replace function public.claim_push_batch(p_limit int default 25) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows jsonb;
begin
  update public.notification_outbox o set status = 'skipped', last_error = 'stale'
  where o.status in ('pending', 'sending')
    and (o.not_after < now()
      or (o.kind = 'new_puzzle' and exists (
            select 1 from public.friend_puzzles p
            where p.id = o.puzzle_id and (p.recipient_seen_at is not null or p.finished_at is not null)))
      or (o.kind = 'result' and exists (
            select 1 from public.friend_puzzles p
            where p.id = o.puzzle_id and p.creator_seen_result_at is not null))
      or (o.kind = 'reminder' and exists (
            select 1 from public.friendships f
            cross join lateral public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, now()) s
            where f.id = o.friendship_id and (s.streak = 0 or s.done_this_period))));

  with c as (
    select id from public.notification_outbox
    where (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '2 minutes'))
      and attempts < 5
    order by id
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), u as (
    update public.notification_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
      returning o.id, o.user_id, o.kind, o.title, o.body, o.url, o.tag
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'kind', u.kind, 'title', u.title, 'body', u.body, 'url', u.url, 'tag', u.tag,
      'subscriptions', coalesce((
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
                                            'created_at', s.created_at))
        from public.push_subscriptions s where s.user_id = u.user_id), '[]'::jsonb))), '[]'::jsonb)
  into v_rows from u;
  return v_rows;
end $$;

create or replace function public.finish_push(p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_outbox set
    status = case when p_ok then 'sent'
                  when p_error like 'no_subscriptions%' then 'skipped'
                  when attempts >= 5 then 'failed'
                  else 'pending' end,
    sent_at = case when p_ok then now() end,
    last_error = left(p_error, 500)
  where id = p_id and status = 'sending';
end $$;

create or replace function public.push_endpoint_result(p_endpoint text, p_gone boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_gone then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  else
    update public.push_subscriptions set last_success_at = now() where endpoint = p_endpoint;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  FUNCTION PRIVILEGES
-- ═══════════════════════════════════════════════════════════════════════
--  Supabase grants EXECUTE on new public functions to anon and
--  authenticated by default. Take it all back, then grant deliberately.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'friend\_%' or p.proname in (
        'get_my_profile','set_display_name','update_notification_prefs',
        'create_friend_invite','get_friend_invite','accept_friend_invite',
        'get_friends_inbox','list_friend_history','get_friend_draft','save_friend_draft',
        'discard_friend_draft','send_friend_puzzle','open_friend_puzzle','submit_friend_guess',
        'save_push_subscription','delete_push_subscription','enqueue_deadline_reminders',
        'claim_push_batch','finish_push','push_endpoint_result'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

grant execute on function
  public.get_my_profile(), public.set_display_name(text),
  public.update_notification_prefs(boolean, boolean, boolean),
  public.create_friend_invite(), public.accept_friend_invite(text),
  public.get_friends_inbox(), public.list_friend_history(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, text, jsonb),
  public.discard_friend_draft(uuid), public.send_friend_puzzle(uuid, int),
  public.open_friend_puzzle(uuid), public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb),
  public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  to authenticated;
grant execute on function public.get_friend_invite(text) to anon, authenticated;
grant execute on function
  public.enqueue_deadline_reminders(timestamptz, interval), public.claim_push_batch(int),
  public.finish_push(bigint, boolean, text), public.push_endpoint_result(text, boolean)
  to service_role;
-- The streak-rule functions are pure; keep them callable for tests and tooling.
grant execute on function
  public.friend_period_length(), public.friend_period_index(timestamptz, timestamptz),
  public.friend_daily_after_finish(timestamptz, int, int, timestamptz),
  public.friend_daily_status(timestamptz, int, int, timestamptz),
  public.friend_team_after_finish(int, text)
  to service_role;


-- ==== 20260927090000_friend_recipient_difficulty ====
-- ═══════════════════════════════════════════════════════════════════════
--  Friend puzzles: the creator authors all seven cards; the recipient
--  chooses the difficulty.
-- ═══════════════════════════════════════════════════════════════════════
--  • A creator always makes one complete puzzle: four answer cards plus
--    exactly three bonus cards. Drafts no longer carry a difficulty.
--  • The server keeps the whole authored puzzle (all seven cards, in the
--    order the creator made the bonus cards) next to the answer, where
--    only the creator — and the solver, once finished — can read it.
--  • The recipient picks Easy / Standard / Expert / Hardcore before
--    starting. That uses the daily game's own meaning (0 / 1 / 2 / 3 bonus
--    cards, friend_extra_cards) and, like the daily game, deals the first
--    N bonus cards in the creator's order. The choice, the dealt cards and
--    their shuffled order are stored with the attempt and can't be changed,
--    so a refresh or another device restores exactly the same game.
--  • Guesses may only use the dealt cards, on the board or in the tray.
--  Judging, streaks and notifications are unchanged.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Data ───────────────────────────────────────────────────────────────

alter table public.friend_puzzles
  alter column difficulty drop not null,
  alter column cards drop not null,
  alter column card_order drop not null,
  add column dealt_extras jsonb;            -- bonus card ids dealt for this attempt, in authored order
alter table public.friend_puzzles
  add constraint friend_puzzles_difficulty_known
    check (difficulty is null or difficulty in ('easy','standard','expert','hardcore')),
  add constraint friend_puzzles_dealt_together
    check ((difficulty is null) = (cards is null) and (cards is null) = (card_order is null));
comment on column public.friend_puzzles.difficulty is 'Chosen by the recipient before play; null until then';
comment on column public.friend_puzzles.cards is 'The cards dealt for this attempt (answer + chosen bonus cards); null until the difficulty is chosen';

alter table public.friend_puzzle_answers
  add column authored_cards jsonb,          -- all seven cards, under their opaque ids
  add column bonus_cards jsonb;             -- the three bonus card ids, in the creator's order

-- Puzzles sent before this change (local only): what was sent is all there is.
update public.friend_puzzle_answers a set
  authored_cards = p.cards,
  bonus_cards = coalesce((select jsonb_agg(k) from jsonb_object_keys(p.cards) as k
                          where not (a.slot_cards ? k)), '[]'::jsonb)
from public.friend_puzzles p where p.id = a.puzzle_id and a.authored_cards is null;
update public.friend_puzzles p set dealt_extras = a.bonus_cards
from public.friend_puzzle_answers a where a.puzzle_id = p.id and p.dealt_extras is null and p.cards is not null;

-- ── Immutability: the difficulty can be set once, then never changed ───

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
begin
  if new.clues is distinct from old.clues
     or new.creator_id is distinct from old.creator_id
     or new.recipient_id is distinct from old.recipient_id
     or new.friendship_id is distinct from old.friendship_id
     or new.title is distinct from old.title then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if (new.difficulty, new.cards, new.card_order, new.dealt_extras)
       is distinct from (old.difficulty, old.cards, old.card_order, old.dealt_extras)
     and old.difficulty is not null then
    raise exception 'immutable: this attempt''s difficulty and cards are already set';
  end if;
  if old.finished_at is not null and (
       new.finished_at is distinct from old.finished_at
       or new.outcome is distinct from old.outcome
       or new.lives_used is distinct from old.lives_used) then
    raise exception 'immutable: a finished result cannot be changed';
  end if;
  return new;
end $$;

-- ── Validation: every one of the seven cards must be complete ──────────

drop function if exists public.friend_validate_board(jsonb, text);
create or replace function public.friend_validate_board(p_board jsonb)
returns text language plpgsql immutable as $$
declare
  v_clue text;
  v_card_id text;
  v_orient jsonb;
  v_words jsonb;
  v_word text;
  v_seen text[] := '{}';
  i int; j int;
begin
  if jsonb_typeof(p_board) is distinct from 'object'
     or jsonb_typeof(p_board->'clues') is distinct from 'array' or jsonb_array_length(p_board->'clues') <> 4
     or jsonb_typeof(p_board->'slots') is distinct from 'array' or jsonb_typeof(p_board->'cards') is distinct from 'object' then
    return 'The puzzle is incomplete.';
  end if;
  for i in 0..3 loop
    if jsonb_typeof(p_board->'clues'->i) is distinct from 'string' then return 'Every side needs a clue.'; end if;
    v_clue := btrim(p_board->'clues'->>i);
    if v_clue = '' then return 'Every side needs a clue.'; end if;
    if char_length(v_clue) > 20 then return 'Clues can be up to 20 letters.'; end if;
  end loop;
  if jsonb_array_length(p_board->'slots') <> 7 then
    return 'A puzzle has four answer cards and three bonus cards.';
  end if;
  for i in 0..6 loop
    v_card_id := p_board->'slots'->i->>'cardId';
    v_orient := p_board->'slots'->i->'orientation';
    if v_card_id is null or v_card_id = any(v_seen) then return 'The board has a missing card.'; end if;
    v_seen := v_seen || v_card_id;
    if jsonb_typeof(v_orient) is distinct from 'number' or (v_orient)::int not between 0 and 3 then
      return 'The board has a card in an unknown position.';
    end if;
    v_words := p_board->'cards'->v_card_id->'words';
    if jsonb_typeof(v_words) is distinct from 'array' or jsonb_array_length(v_words) <> 4 then
      return 'Every card needs four words.';
    end if;
    for j in 0..3 loop
      if jsonb_typeof(v_words->j) is distinct from 'string' or btrim(v_words->>j) = '' then
        return case when i < 4 then 'Every edge of the four answer cards needs a word.'
                    else 'Every edge of the three bonus cards needs a word.' end;
      end if;
      v_word := btrim(v_words->>j);
      if char_length(v_word) > 18 then return 'Card words can be up to 18 letters.'; end if;
    end loop;
  end loop;
  return null;
end $$;

-- ── Drafts: no difficulty any more ─────────────────────────────────────

drop function if exists public.save_friend_draft(uuid, uuid, int, text, text, jsonb);
alter table public.friend_puzzle_drafts drop column difficulty;

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  select * into d from public.friend_puzzle_drafts
  where friendship_id = p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'board', d.board, 'updated_at', d.updated_at);
end $$;

-- Optimistic concurrency: an update must name the version it was based on,
-- so two tabs cannot silently overwrite each other. All seven cards are
-- saved exactly as edited, finished or not.
create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int, p_title text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  if jsonb_typeof(p_board) is distinct from 'object' or octet_length(p_board::text) > 16000 then
    raise exception 'invalid_puzzle: That puzzle is too large to save.';
  end if;
  if p_draft_id is null then
    begin
      insert into public.friend_puzzle_drafts (friendship_id, creator_id, title, board)
      values (p_friendship_id, v_uid, left(btrim(coalesce(p_title, '')), 40), p_board)
      returning * into d;
    exception when unique_violation then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end;
  else
    update public.friend_puzzle_drafts set
      title = left(btrim(coalesce(p_title, '')), 40), board = p_board,
      version = version + 1, updated_at = now()
    where id = p_draft_id and creator_id = v_uid and friendship_id = p_friendship_id
      and sent_puzzle_id is null and version = p_version
    returning * into d;
    if not found then
      if exists (select 1 from public.friend_puzzle_drafts
                 where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is not null) then
        raise exception 'draft_sent: This puzzle has already been sent.';
      end if;
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
  end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'updated_at', d.updated_at);
end $$;

-- ── Sending: keep all seven cards; deal nothing yet ────────────────────
--  Every card gets a fresh opaque id and a random quarter-turn of its
--  stored words (the answer's orientation adjusted to match), so nothing in
--  a payload hints at the answer. Idempotent per draft, as before.

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_cards jsonb := '{}'::jsonb;
  v_slot_cards jsonb := '[]'::jsonb;
  v_orients jsonb := '[]'::jsonb;
  v_bonus jsonb := '[]'::jsonb;
  v_clues jsonb;
  v_src text; v_new text; v_rot int; v_orient int;
  v_words jsonb; v_turned jsonb;
  v_puzzle_id uuid;
  i int;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if p_version is distinct from d.version then
    raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
  end if;

  select * into f from public.friendships where id = d.friendship_id for update;
  if not found or v_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  v_recipient := case when f.user_a = v_uid then f.user_b else f.user_a end;

  v_err := public.friend_validate_board(d.board);
  if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;

  if exists (select 1 from public.friend_puzzles
             where friendship_id = f.id and creator_id = v_uid and finished_at is null) then
    raise exception 'already_waiting: % hasn''t finished your last puzzle yet.',
      public.friend_display_name(v_recipient);
  end if;

  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(d.board->'clues') with ordinality as t(c, n);

  for i in 0..6 loop
    v_src := d.board->'slots'->i->>'cardId';
    v_orient := (d.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := d.board->'cards'->v_src->'words';
    select jsonb_agg(upper(btrim(v_words->>((j + v_rot) % 4))) order by j)
      into v_turned from generate_series(0, 3) as j;
    v_cards := v_cards || jsonb_build_object(v_new, jsonb_build_object('id', v_new, 'words', v_turned));
    if i < 4 then
      v_slot_cards := v_slot_cards || to_jsonb(v_new);
      v_orients := v_orients || to_jsonb((v_orient + v_rot) % 4);
    else
      v_bonus := v_bonus || to_jsonb(v_new);
    end if;
  end loop;

  insert into public.friend_puzzles
    (friendship_id, creator_id, recipient_id, draft_id, title, clues)
  values
    (f.id, v_uid, v_recipient, d.id, d.title, v_clues)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations, authored_cards, bonus_cards)
  values (v_puzzle_id, v_slot_cards, v_orients, v_cards, v_bonus);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = d.id;

  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');

  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

-- ── The recipient chooses the difficulty (once) ────────────────────────
--  Deals the four answer cards plus the first N bonus cards in the
--  creator's order, shuffles their order once, and stores it all with the
--  attempt. Choosing the same level again is a harmless no-op (a double tap
--  or second tab); choosing a different one afterwards is refused.

create or replace function public.choose_friend_difficulty(p_puzzle_id uuid, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_extra int := public.friend_extra_cards(p_difficulty);
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  v_dealt jsonb;
  v_ids text[];
  v_cards jsonb;
  v_order jsonb;
begin
  if v_extra is null then raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.'; end if;
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if p.difficulty is not null then
    if p.difficulty = p_difficulty then
      return jsonb_build_object('difficulty', p.difficulty, 'already_chosen', true);
    end if;
    raise exception 'difficulty_locked: You started this puzzle on %. The difficulty can''t change once you''ve started.',
      initcap(p.difficulty);
  end if;
  if p.finished_at is not null then raise exception 'already_finished: You''ve already finished this puzzle.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  select coalesce(jsonb_agg(x order by n), '[]'::jsonb) into v_dealt
    from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n) where n <= v_extra;
  select array_agg(x) into v_ids from (
    select jsonb_array_elements_text(a.slot_cards) as x
    union all select jsonb_array_elements_text(v_dealt)) s;
  select jsonb_object_agg(x, a.authored_cards->x) into v_cards from unnest(v_ids) as x;
  select jsonb_agg(x order by random()) into v_order from unnest(v_ids) as x;

  update public.friend_puzzles set
    difficulty = p_difficulty, cards = v_cards, card_order = v_order, dealt_extras = v_dealt,
    started_at = coalesce(started_at, now()), recipient_seen_at = coalesce(recipient_seen_at, now())
  where id = p.id;
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

-- ── Opening a puzzle ───────────────────────────────────────────────────
--   solver:  before choosing — only who made it; after — the dealt cards,
--            own guesses; the whole authored puzzle and answer once finished
--   creator: the whole authored puzzle and answer; the attempt's
--            difficulty and dealt cards; the guesses once finished
-- Opening marks it seen; it doesn't start the attempt or count for streaks.

create or replace function public.open_friend_puzzle(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  v_role text;
  v_show_answer boolean;
  v_show_guesses boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or v_uid not in (p.creator_id, p.recipient_id) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when v_uid = p.recipient_id then 'solver' else 'creator' end;
  if v_role = 'solver' and p.recipient_seen_at is null then
    update public.friend_puzzles set recipient_seen_at = now() where id = p.id;
  elsif v_role = 'creator' and p.finished_at is not null and p.creator_seen_result_at is null then
    update public.friend_puzzles set creator_seen_result_at = now() where id = p.id;
  end if;
  v_show_answer := v_role = 'creator' or p.finished_at is not null;
  v_show_guesses := v_role = 'solver' or p.finished_at is not null;
  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;

  return jsonb_build_object(
    'id', p.id, 'role', v_role, 'friendship_id', p.friendship_id,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'solver_name', public.friend_display_name(p.recipient_id),
    'clues', case when p.difficulty is not null or v_show_answer then p.clues end,
    'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', case when v_show_guesses then coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb) end,
    'solution', case when v_show_answer then
        jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations) end,
    'authored_cards', case when v_show_answer then a.authored_cards end,
    'bonus_cards', case when v_show_answer then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'card_id', x, 'dealt', case when p.dealt_extras is null then null else p.dealt_extras ? x end)
          order by n), '[]'::jsonb)
        from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n)) end,
    'friendship', public.friend_friendship_status(p.friendship_id));
end $$;

-- ── Judging: only the dealt cards may be used ──────────────────────────
-- Unchanged from before except: the difficulty must have been chosen, and
-- the reported tray must be exactly the dealt cards not on the board.

create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  g public.friend_guesses%rowtype;
  f public.friendships%rowtype;
  v_daily record;
  v_count int;
  v_rot int;
  v_seen text[] := '{}';
  v_card text;
  v_or jsonb;
  v_correct int[] := '{}';
  v_lives int;
  v_outcome text;
  v_now timestamptz := now();
  r int; i int;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;

  select * into g from public.friend_guesses where puzzle_id = p.id and guess_no = p_guess_no;
  if found then
    if g.board = p_board and g.clues = p_clues then
      return public.friend_guess_response(p.id, p_guess_no);
    end if;
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;
  if p.finished_at is not null then
    raise exception 'already_finished: You''ve already finished this puzzle.';
  end if;
  if p.difficulty is null then
    raise exception 'choose_difficulty: Choose a difficulty to start this puzzle.';
  end if;
  select count(*) into v_count from public.friend_guesses where puzzle_id = p.id;
  if p_guess_no is distinct from v_count + 1 then
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;

  -- The board: four distinct dealt cards, each turned 0..3.
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) <> 4
     or jsonb_typeof(p_clues) is distinct from 'array' or jsonb_array_length(p_clues) <> 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..3 loop
    v_card := p_board->i->>'cardId';
    v_or := p_board->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;
  -- The tray: exactly the other dealt cards.
  if jsonb_typeof(p_extras) is distinct from 'array'
     or jsonb_array_length(p_extras) <> jsonb_array_length(p.card_order) - 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..jsonb_array_length(p_extras) - 1 loop
    v_card := p_extras->i->>'cardId';
    v_or := p_extras->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;

  v_rot := null;
  for r in 0..3 loop
    if (select bool_and(p_clues->>k = p.clues->>((k - r + 4) % 4)) from generate_series(0, 3) as k) then
      v_rot := r; exit;
    end if;
  end loop;
  if v_rot is null then raise exception 'invalid_guess: That board could not be read.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  for i in 0..3 loop
    if p_board->i->>'cardId' = a.slot_cards->>((i - v_rot + 4) % 4)
       and (p_board->i->>'orientation')::int
           = ((a.orientations->>((i - v_rot + 4) % 4))::int + v_rot) % 4 then
      v_correct := v_correct || i;
    end if;
  end loop;

  v_lives := public.friend_max_lives() - v_count
             - case when cardinality(v_correct) = 4 then 0 else 1 end;
  if cardinality(v_correct) = 4 then v_outcome := 'won';
  elsif v_lives <= 0 then v_outcome := 'lost';
  end if;

  insert into public.friend_guesses (puzzle_id, guess_no, solver_id, board, extras, clues, correct, lives_left)
  values (p.id, p_guess_no, v_uid, p_board, p_extras, p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    select * into f from public.friendships where id = p.friendship_id for update;
    select * into v_daily from public.friend_daily_after_finish(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now);
    update public.friendships set
      daily_anchor = v_daily.anchor,
      daily_last_period = v_daily.last_period,
      daily_streak = v_daily.streak,
      team_win_streak = public.friend_team_after_finish(f.team_win_streak, v_outcome),
      last_finished_at = v_now
    where id = f.id;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.', public.friend_display_name(v_uid)),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function public.friend_validate_board(jsonb) from public, anon, authenticated;
revoke all on function public.save_friend_draft(uuid, uuid, int, text, jsonb) from public, anon;
revoke all on function public.choose_friend_difficulty(uuid, text) from public, anon;
grant execute on function public.save_friend_draft(uuid, uuid, int, text, jsonb) to authenticated;
grant execute on function public.choose_friend_difficulty(uuid, text) to authenticated;


-- ---- migration ledger ----
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20260926090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Cluevoyance friend-puzzle exchange
-- ═══════════════════════════════════════════════════════════════════════
--  Players (Cluevoyance accounts, public.accounts; see src/account/README.md)
--  invite a friend by link, make personal puzzles for each other, and keep
--  two streaks that belong to the pair. Every player id below is an account
--  id from public.cluevoyance_uid(), never a raw auth user or an email.
--
--  Access model
--  • RLS is on for every table below. Clients get read-only policies at
--    most; there are no insert/update/delete policies at all.
--  • Every write goes through a SECURITY DEFINER function in this file that
--    checks public.cluevoyance_uid() itself.
--  • A sent puzzle's answer lives in its own table and never reaches the
--    solver until the attempt is over. Guesses are judged here, on the
--    server, so the browser never needs the answer to play.
--  • Nothing here touches the official daily puzzles or word bank tables.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Game constants ─────────────────────────────────────────────────────

create or replace function public.friend_max_lives() returns int
language sql immutable as $$ select 3 $$;

-- Same table as DIFFICULTY_EXTRA in the client: how many decoy cards the
-- solver sees on top of the four that belong on the board.
create or replace function public.friend_extra_cards(p_difficulty text) returns int
language sql immutable as $$
  select case p_difficulty
    when 'easy' then 0 when 'standard' then 1 when 'expert' then 2 when 'hardcore' then 3
  end
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  THE DAILY-PERIOD RULE  (the only place it is defined)
-- ═══════════════════════════════════════════════════════════════════════
--  A friendship's daily streak is counted in 24-hour periods on the server
--  clock, so both friends share one deadline whatever their time zones.
--
--   • The first finished friend puzzle (a win or a loss) starts the clock:
--     period 0 begins at that instant and the streak is 1.
--   • Period n covers [anchor + n·24h, anchor + (n+1)·24h).
--   • Each later period needs at least one finished puzzle. A finish in the
--     period straight after the last counted one adds 1. More finishes in
--     an already-counted period add nothing — they cannot be banked.
--   • If a whole period passes with nothing finished, the streak is 0 and
--     the next finished puzzle starts a new clock.
--   • So while a streak is alive, its deadline is
--         anchor + (last_counted_period + 2) · 24h
--     and a puzzle finished at or after that instant starts over at 1.
--   • Creating, sending or opening a puzzle never counts.
--
--  The daily game's own streak uses each device's local calendar date.
--  That cannot be shared by two people in different time zones, which is
--  why friendships use this server-anchored rolling period instead.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_period_length() returns interval
language sql immutable as $$ select interval '24 hours' $$;

create or replace function public.friend_period_index(p_anchor timestamptz, p_at timestamptz)
returns int language sql immutable as $$
  select floor(
    extract(epoch from (p_at - p_anchor)) / extract(epoch from public.friend_period_length())
  )::int
$$;

-- New stored streak state after a friend puzzle is finished at p_finished_at.
create or replace function public.friend_daily_after_finish(
  p_anchor timestamptz, p_last_period int, p_streak int, p_finished_at timestamptz,
  out anchor timestamptz, out last_period int, out streak int)
language plpgsql immutable as $$
declare
  v_period int;
begin
  if p_anchor is not null and p_last_period is not null and coalesce(p_streak, 0) > 0 then
    v_period := public.friend_period_index(p_anchor, p_finished_at);
    if v_period <= p_last_period then
      -- Already counted this period: no change, nothing banked.
      anchor := p_anchor; last_period := p_last_period; streak := p_streak;
      return;
    elsif v_period = p_last_period + 1 then
      anchor := p_anchor; last_period := v_period; streak := p_streak + 1;
      return;
    end if;
  end if;
  -- No live streak (never started, or a whole period was missed):
  -- this finish starts a new clock.
  anchor := p_finished_at; last_period := 0; streak := 1;
end $$;

-- What both friends see at p_now for the stored streak state.
--   streak            0 once a whole period has been missed
--   deadline_at       finish a puzzle before this instant to keep the streak
--   done_this_period  a puzzle was already finished in the current period
--   next_period_at    when the current (already counted) period ends
create or replace function public.friend_daily_status(
  p_anchor timestamptz, p_last_period int, p_streak int, p_now timestamptz,
  out streak int, out deadline_at timestamptz, out done_this_period boolean,
  out next_period_at timestamptz)
language plpgsql immutable as $$
declare
  v_period int;
begin
  streak := 0; deadline_at := null; done_this_period := false; next_period_at := null;
  if p_anchor is null or p_last_period is null or coalesce(p_streak, 0) = 0 then
    return;
  end if;
  v_period := public.friend_period_index(p_anchor, p_now);
  if v_period > p_last_period + 1 then
    return;
  end if;
  streak := p_streak;
  deadline_at := p_anchor + (p_last_period + 2) * public.friend_period_length();
  done_this_period := v_period <= p_last_period;
  next_period_at := p_anchor + (p_last_period + 1) * public.friend_period_length();
end $$;

-- Team win streak: consecutive finished friend puzzles won by either
-- friend, in the order they were finished. Any finished loss resets it.
create or replace function public.friend_team_after_finish(p_streak int, p_outcome text)
returns int language sql immutable as $$
  select case when p_outcome = 'won' then coalesce(p_streak, 0) + 1 else 0 end
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  TABLES
-- ═══════════════════════════════════════════════════════════════════════

create table public.profiles (
  id uuid primary key references public.accounts(user_id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  notify_new_puzzle boolean not null default true,
  notify_results boolean not null default true,
  notify_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_id uuid not null references public.accounts(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.accounts(user_id) on delete set null,
  accepted_at timestamptz,
  friendship_id uuid
);
create index friend_invites_inviter on public.friend_invites(inviter_id, created_at desc);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.accounts(user_id) on delete cascade,
  user_b uuid not null references public.accounts(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Daily streak state (see the rule above). Players see it as "Friend Streak".
  daily_anchor timestamptz,
  daily_last_period int,
  daily_streak int not null default 0,
  -- Team win streak. Players see it as "Solve Streak".
  team_win_streak int not null default 0,
  last_finished_at timestamptz,
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_pair unique (user_a, user_b)
);
create index friendships_user_b on public.friendships(user_b);

-- A creator's work in progress. One open draft per creator per friendship.
create table public.friend_puzzle_drafts (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  creator_id uuid not null references public.accounts(user_id) on delete cascade,
  version int not null default 1,
  title text not null default '' check (char_length(title) <= 40),
  difficulty text not null default 'standard'
    check (difficulty in ('easy','standard','expert','hardcore')),
  -- { clues:[4 strings], cards:{id:{id,words:[4]}}, slots:[{cardId,orientation}] }
  board jsonb not null check (octet_length(board::text) <= 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_puzzle_id uuid
);
create unique index friend_drafts_one_open
  on public.friend_puzzle_drafts(friendship_id, creator_id) where sent_puzzle_id is null;

-- A sent puzzle. Everything the solver may see; the answer is elsewhere.
create table public.friend_puzzles (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  creator_id uuid not null references public.accounts(user_id) on delete cascade,
  recipient_id uuid not null references public.accounts(user_id) on delete cascade,
  draft_id uuid unique,
  title text not null default '',
  difficulty text not null,
  clues jsonb not null,        -- the four clues in their original positions (top, right, bottom, left)
  cards jsonb not null,        -- only the cards the solver will see, under opaque ids
  card_order jsonb not null,   -- those ids in a random order
  sent_at timestamptz not null default now(),
  recipient_seen_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  outcome text check (outcome in ('won','lost')),
  lives_used int,
  creator_seen_result_at timestamptz,
  constraint friend_puzzles_parties check (creator_id <> recipient_id),
  constraint friend_puzzles_finished check ((finished_at is null) = (outcome is null))
);
-- One unfinished puzzle per sender per friendship: the friend plays it
-- before the sender can send another. Also backs duplicate-send protection.
create unique index friend_puzzles_one_open
  on public.friend_puzzles(friendship_id, creator_id) where finished_at is null;
create index friend_puzzles_recipient on public.friend_puzzles(recipient_id, finished_at);
create index friend_puzzles_friendship on public.friend_puzzles(friendship_id, sent_at desc);

-- The immutable answer, relative to the original clue positions.
create table public.friend_puzzle_answers (
  puzzle_id uuid primary key references public.friend_puzzles(id) on delete cascade,
  slot_cards jsonb not null,    -- card ids for slots 0..3 (TL, TR, BR, BL)
  orientations jsonb not null   -- orientation 0..3 for each of those slots
);

-- Each submitted guess exactly as the solver's board looked at Submit.
create table public.friend_guesses (
  puzzle_id uuid not null references public.friend_puzzles(id) on delete cascade,
  guess_no int not null check (guess_no between 1 and 3),
  solver_id uuid not null references public.accounts(user_id) on delete cascade,
  board jsonb not null,               -- [{cardId, orientation}] for slots 0..3 (TL, TR, BR, BL)
  extras jsonb not null default '[]', -- the tray at that moment, [{cardId, orientation}]
  clues jsonb not null,               -- clue on each side at that moment (reflects Rotate)
  correct jsonb not null,             -- slot indexes judged correct
  lives_left int not null,
  created_at timestamptz not null default now(),
  primary key (puzzle_id, guess_no)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions(user_id);

-- Transactional outbox for web push. Rows are written in the same
-- transaction as the event, deduplicated by key, and re-checked for
-- staleness right before they are sent.
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  kind text not null check (kind in ('new_puzzle','result','reminder')),
  dedupe_key text not null unique,
  friendship_id uuid references public.friendships(id) on delete cascade,
  puzzle_id uuid references public.friend_puzzles(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  not_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','skipped','failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text
);
create index notification_outbox_pending on public.notification_outbox(status, id);

-- ── Immutability guards ────────────────────────────────────────────────

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
begin
  if new.clues is distinct from old.clues or new.cards is distinct from old.cards
     or new.card_order is distinct from old.card_order
     or new.creator_id is distinct from old.creator_id
     or new.recipient_id is distinct from old.recipient_id
     or new.friendship_id is distinct from old.friendship_id
     or new.difficulty is distinct from old.difficulty
     or new.title is distinct from old.title then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if old.finished_at is not null and (
       new.finished_at is distinct from old.finished_at
       or new.outcome is distinct from old.outcome
       or new.lives_used is distinct from old.lives_used) then
    raise exception 'immutable: a finished result cannot be changed';
  end if;
  return new;
end $$;
create trigger friend_puzzles_guard before update on public.friend_puzzles
  for each row execute function public.friend_puzzles_guard();

create or replace function public.friend_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'immutable: % rows cannot be changed', tg_table_name;
end $$;
create trigger friend_answers_immutable before update on public.friend_puzzle_answers
  for each row execute function public.friend_no_update();
create trigger friend_guesses_immutable before update on public.friend_guesses
  for each row execute function public.friend_no_update();

-- ═══════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — read-only, own rows only
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_puzzle_drafts enable row level security;
alter table public.friend_puzzles enable row level security;
alter table public.friend_puzzle_answers enable row level security;
alter table public.friend_guesses enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.profiles, public.friend_invites, public.friendships,
  public.friend_puzzle_drafts, public.friend_puzzles, public.friend_puzzle_answers,
  public.friend_guesses, public.push_subscriptions, public.notification_outbox
  from anon, authenticated;
grant select on public.profiles, public.friend_invites, public.friendships,
  public.friend_puzzle_drafts, public.friend_puzzles, public.friend_puzzle_answers,
  public.friend_guesses, public.push_subscriptions
  to authenticated;

create policy profiles_own on public.profiles for select to authenticated
  using (id = public.cluevoyance_uid());
create policy invites_own on public.friend_invites for select to authenticated
  using (inviter_id = public.cluevoyance_uid());
create policy friendships_member on public.friendships for select to authenticated
  using (public.cluevoyance_uid() in (user_a, user_b));
create policy drafts_own on public.friend_puzzle_drafts for select to authenticated
  using (creator_id = public.cluevoyance_uid());
create policy puzzles_party on public.friend_puzzles for select to authenticated
  using (public.cluevoyance_uid() in (creator_id, recipient_id));
create policy answers_creator_or_finished_solver on public.friend_puzzle_answers
  for select to authenticated using (exists (
    select 1 from public.friend_puzzles p
    where p.id = puzzle_id
      and (p.creator_id = public.cluevoyance_uid()
           or (p.recipient_id = public.cluevoyance_uid() and p.finished_at is not null))));
create policy guesses_solver_or_finished_creator on public.friend_guesses
  for select to authenticated using (exists (
    select 1 from public.friend_puzzles p
    where p.id = puzzle_id
      and (p.recipient_id = public.cluevoyance_uid()
           or (p.creator_id = public.cluevoyance_uid() and p.finished_at is not null))));
create policy push_own on public.push_subscriptions for select to authenticated
  using (user_id = public.cluevoyance_uid());
-- notification_outbox: no policy — server only.

-- ═══════════════════════════════════════════════════════════════════════
--  HELPERS
-- ═══════════════════════════════════════════════════════════════════════
-- Errors are raised as "code: message" so the client can branch on the
-- code and show the message.

create or replace function public.friend_require_uid() returns uuid
language plpgsql stable as $$
declare
  v uuid := public.cluevoyance_uid();
begin
  if v is null then
    raise exception 'not_signed_in: Sign in to use Friends.';
  end if;
  return v;
end $$;

create or replace function public.friend_require_profile(p_uid uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = p_uid;
  if v_name is null then
    raise exception 'no_profile: Choose a display name first.';
  end if;
  return v_name;
end $$;

create or replace function public.friend_display_name(p_uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select display_name from public.profiles where id = p_uid), 'Your friend')
$$;

-- Adds a push notification to the outbox if the user wants this kind and
-- has at least one device subscribed. Never raises: push must not block play.
create or replace function public.friend_enqueue_push(
  p_user uuid, p_kind text, p_dedupe text, p_friendship uuid, p_puzzle uuid,
  p_body text, p_url text, p_not_after timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wants boolean;
begin
  select case p_kind
      when 'new_puzzle' then notify_new_puzzle
      when 'result' then notify_results
      when 'reminder' then notify_reminders
    end
    into v_wants from public.profiles where id = p_user;
  if not coalesce(v_wants, false) then return false; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then return false; end if;
  insert into public.notification_outbox
    (user_id, kind, dedupe_key, friendship_id, puzzle_id, title, body, url, tag, not_after)
  values
    (p_user, p_kind, p_dedupe, p_friendship, p_puzzle, 'Cluevoyance', p_body, p_url,
     p_kind || ':' || coalesce(p_friendship::text, ''), p_not_after)
  on conflict (dedupe_key) do nothing;
  return found;
exception when others then
  raise warning 'friend_enqueue_push skipped: %', sqlerrm;
  return false;
end $$;

-- Validates a draft board for sending. Returns null when it is sendable,
-- otherwise a message for the creator.
create or replace function public.friend_validate_board(p_board jsonb, p_difficulty text)
returns text language plpgsql immutable as $$
declare
  v_extra int := public.friend_extra_cards(p_difficulty);
  v_needed int;
  v_clue text;
  v_card_id text;
  v_orient jsonb;
  v_words jsonb;
  v_word text;
  v_seen text[] := '{}';
  i int; j int;
begin
  if v_extra is null then return 'Choose a difficulty.'; end if;
  v_needed := 4 + v_extra;
  if jsonb_typeof(p_board) is distinct from 'object'
     or jsonb_typeof(p_board->'clues') is distinct from 'array' or jsonb_array_length(p_board->'clues') <> 4
     or jsonb_typeof(p_board->'slots') is distinct from 'array' or jsonb_typeof(p_board->'cards') is distinct from 'object' then
    return 'The puzzle is incomplete.';
  end if;
  for i in 0..3 loop
    if jsonb_typeof(p_board->'clues'->i) is distinct from 'string' then return 'Every side needs a clue.'; end if;
    v_clue := btrim(p_board->'clues'->>i);
    if v_clue = '' then return 'Every side needs a clue.'; end if;
    if char_length(v_clue) > 20 then return 'Clues can be up to 20 letters.'; end if;
  end loop;
  if jsonb_array_length(p_board->'slots') < v_needed then
    return 'Deal or add enough cards for this difficulty.';
  end if;
  for i in 0..v_needed - 1 loop
    v_card_id := p_board->'slots'->i->>'cardId';
    v_orient := p_board->'slots'->i->'orientation';
    if v_card_id is null or v_card_id = any(v_seen) then return 'The board has a missing card.'; end if;
    v_seen := v_seen || v_card_id;
    if jsonb_typeof(v_orient) is distinct from 'number' or (v_orient)::int not between 0 and 3 then
      return 'The board has a card in an unknown position.';
    end if;
    v_words := p_board->'cards'->v_card_id->'words';
    if jsonb_typeof(v_words) is distinct from 'array' or jsonb_array_length(v_words) <> 4 then
      return 'Every card needs four words.';
    end if;
    for j in 0..3 loop
      if jsonb_typeof(v_words->j) is distinct from 'string' then return 'Every card edge needs a word.'; end if;
      v_word := btrim(v_words->>j);
      if v_word = '' then return 'Every card edge needs a word.'; end if;
      if char_length(v_word) > 18 then return 'Card words can be up to 18 letters.'; end if;
    end loop;
  end loop;
  return null;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PROFILE
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  r public.profiles%rowtype;
begin
  select * into r from public.profiles where id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'display_name', r.display_name,
    'notify_new_puzzle', r.notify_new_puzzle, 'notify_results', r.notify_results,
    'notify_reminders', r.notify_reminders);
end $$;

create or replace function public.set_display_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'invalid_name: Display names are 1 to 24 characters.';
  end if;
  if v_name ~ '[[:cntrl:]<>]' then
    raise exception 'invalid_name: Please use letters, numbers and simple punctuation.';
  end if;
  insert into public.profiles (id, display_name) values (v_uid, v_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  return public.get_my_profile();
end $$;

create or replace function public.update_notification_prefs(
  p_new_puzzle boolean, p_results boolean, p_reminders boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  perform public.friend_require_profile(v_uid);
  update public.profiles set
    notify_new_puzzle = coalesce(p_new_puzzle, notify_new_puzzle),
    notify_results = coalesce(p_results, notify_results),
    notify_reminders = coalesce(p_reminders, notify_reminders),
    updated_at = now()
  where id = v_uid;
  return public.get_my_profile();
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  INVITATIONS
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_friend_invite() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_token text;
  v_expires timestamptz;
begin
  perform public.friend_require_profile(v_uid);
  if (select count(*) from public.friend_invites
      where inviter_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited: That''s a lot of invites today — try again tomorrow.';
  end if;
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.friend_invites (token, inviter_id)
  values (v_token, v_uid)
  returning expires_at into v_expires;
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

-- Readable by anyone holding the (unguessable) token, so the invite page
-- can say who it is from before the friend signs in.
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
    'friendship_id', case when v_status = 'accepted' then i.friendship_id end);
end $$;

create or replace function public.accept_friend_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  i public.friend_invites%rowtype;
  v_a uuid; v_b uuid;
  v_fid uuid;
begin
  perform public.friend_require_profile(v_uid);
  select * into i from public.friend_invites where token = p_token for update;
  if not found then raise exception 'invite_not_found: That invite link isn''t valid.'; end if;
  if i.inviter_id = v_uid then raise exception 'own_invite: This is your own invite — send it to a friend.'; end if;
  if i.accepted_by is not null then
    if i.accepted_by = v_uid then
      return jsonb_build_object('friendship_id', i.friendship_id, 'friend_name', public.friend_display_name(i.inviter_id));
    end if;
    raise exception 'invite_used: Someone has already used this invite. Ask for a new link.';
  end if;
  if i.expires_at < now() then raise exception 'invite_expired: This invite has expired. Ask for a new link.'; end if;

  v_a := least(v_uid, i.inviter_id);
  v_b := greatest(v_uid, i.inviter_id);
  insert into public.friendships (user_a, user_b) values (v_a, v_b)
  on conflict (user_a, user_b) do nothing
  returning id into v_fid;
  if v_fid is null then
    select id into v_fid from public.friendships where user_a = v_a and user_b = v_b;
  end if;
  update public.friend_invites set accepted_by = v_uid, accepted_at = now(), friendship_id = v_fid
  where id = i.id;
  return jsonb_build_object('friendship_id', v_fid, 'friend_name', public.friend_display_name(i.inviter_id));
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  FRIENDS INBOX
-- ═══════════════════════════════════════════════════════════════════════
--  next_action, from the caller's point of view:
--    play        a puzzle from the friend is waiting (or half played)
--    see_result  the friend finished the caller's puzzle; not viewed yet
--    waiting     the caller's puzzle is with the friend, unfinished
--    make_back   the caller last solved the friend's puzzle — make one back
--    make        otherwise
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_friends_inbox() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_now timestamptz := now();
  v_friends jsonb;
begin
  select coalesce(jsonb_agg(row_obj order by sort_rank, last_activity desc), '[]'::jsonb)
  into v_friends
  from (
    select
      jsonb_build_object(
        'friendship_id', f.id,
        'friend_id', o.id,
        'friend_name', public.friend_display_name(o.id),
        'since', f.created_at,
        'daily_streak', ds.streak,
        'deadline_at', ds.deadline_at,
        'done_this_period', ds.done_this_period,
        'next_period_at', ds.next_period_at,
        'team_win_streak', f.team_win_streak,
        'next_action', act.action,
        'incoming', case when inc.id is null then null else jsonb_build_object(
          'puzzle_id', inc.id, 'title', inc.title, 'difficulty', inc.difficulty,
          'sent_at', inc.sent_at, 'started', inc.started_at is not null,
          'seen', inc.recipient_seen_at is not null, 'guesses', inc.guesses) end,
        'outgoing', case when outg.id is null then null else jsonb_build_object(
          'puzzle_id', outg.id, 'sent_at', outg.sent_at, 'started', outg.started_at is not null) end,
        'unseen_result', case when uns.id is null then null else jsonb_build_object(
          'puzzle_id', uns.id, 'outcome', uns.outcome, 'lives_used', uns.lives_used,
          'finished_at', uns.finished_at) end,
        'last_finished', case when lf.id is null then null else jsonb_build_object(
          'puzzle_id', lf.id, 'by_me', lf.recipient_id = v_uid, 'outcome', lf.outcome,
          'lives_used', lf.lives_used, 'finished_at', lf.finished_at) end,
        'draft', case when dr.id is null then null else jsonb_build_object(
          'id', dr.id, 'updated_at', dr.updated_at) end
      ) as row_obj,
      case act.action when 'play' then 0 when 'see_result' then 1 when 'make_back' then 2
                      when 'make' then 3 else 4 end as sort_rank,
      greatest(f.created_at, lf.finished_at, inc.sent_at, outg.sent_at) as last_activity
    from public.friendships f
    cross join lateral (select case when f.user_a = v_uid then f.user_b else f.user_a end as id) o
    cross join lateral public.friend_daily_status(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now) ds
    left join lateral (
      select p.id, p.title, p.difficulty, p.sent_at, p.started_at, p.recipient_seen_at,
             (select count(*) from public.friend_guesses g where g.puzzle_id = p.id) as guesses
      from public.friend_puzzles p
      where p.friendship_id = f.id and p.recipient_id = v_uid and p.finished_at is null
      limit 1) inc on true
    left join lateral (
      select p.id, p.sent_at, p.started_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.creator_id = v_uid and p.finished_at is null
      limit 1) outg on true
    left join lateral (
      select p.id, p.outcome, p.lives_used, p.finished_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.creator_id = v_uid
        and p.finished_at is not null and p.creator_seen_result_at is null
      order by p.finished_at desc limit 1) uns on true
    left join lateral (
      select p.id, p.recipient_id, p.outcome, p.lives_used, p.finished_at from public.friend_puzzles p
      where p.friendship_id = f.id and p.finished_at is not null
      order by p.finished_at desc limit 1) lf on true
    left join lateral (
      select d.id, d.updated_at from public.friend_puzzle_drafts d
      where d.friendship_id = f.id and d.creator_id = v_uid and d.sent_puzzle_id is null
      limit 1) dr on true
    cross join lateral (select case
      when inc.id is not null then 'play'
      when uns.id is not null then 'see_result'
      when outg.id is not null then 'waiting'
      when lf.id is not null and lf.recipient_id = v_uid then 'make_back'
      else 'make' end as action) act
    where v_uid in (f.user_a, f.user_b)
  ) rows;

  return jsonb_build_object(
    'server_now', v_now,
    'me', public.get_my_profile(),
    'unread', (
      (select count(*) from public.friend_puzzles
        where recipient_id = v_uid and finished_at is null and recipient_seen_at is null)
      + (select count(*) from public.friend_puzzles
        where creator_id = v_uid and finished_at is not null and creator_seen_result_at is null)),
    'friends', v_friends);
end $$;

create or replace function public.list_friend_history(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  if not exists (select 1 from public.friendships
                 where id = p_friendship_id and v_uid in (user_a, user_b)) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'puzzle_id', p.id,
      'direction', case when p.creator_id = v_uid then 'sent' else 'received' end,
      'title', p.title, 'difficulty', p.difficulty,
      'sent_at', p.sent_at, 'finished_at', p.finished_at,
      'outcome', p.outcome, 'lives_used', p.lives_used) order by p.sent_at desc)
    from (select * from public.friend_puzzles
          where friendship_id = p_friendship_id order by sent_at desc limit 30) p
  ), '[]'::jsonb);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  DRAFTS
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_member_other(p_friendship_id uuid, p_uid uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.friendships%rowtype;
begin
  select * into f from public.friendships where id = p_friendship_id;
  if not found or p_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  return case when f.user_a = p_uid then f.user_b else f.user_a end;
end $$;

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  select * into d from public.friend_puzzle_drafts
  where friendship_id = p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'difficulty', d.difficulty, 'board', d.board, 'updated_at', d.updated_at);
end $$;

-- Optimistic concurrency: an update must name the version it was based on,
-- so two tabs cannot silently overwrite each other.
create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int,
  p_title text, p_difficulty text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  if p_difficulty not in ('easy','standard','expert','hardcore') then
    raise exception 'invalid_puzzle: Choose a difficulty.';
  end if;
  if jsonb_typeof(p_board) is distinct from 'object' or octet_length(p_board::text) > 16000 then
    raise exception 'invalid_puzzle: That puzzle is too large to save.';
  end if;
  if p_draft_id is null then
    begin
      insert into public.friend_puzzle_drafts (friendship_id, creator_id, title, difficulty, board)
      values (p_friendship_id, v_uid, left(btrim(coalesce(p_title, '')), 40), p_difficulty, p_board)
      returning * into d;
    exception when unique_violation then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end;
  else
    update public.friend_puzzle_drafts set
      title = left(btrim(coalesce(p_title, '')), 40),
      difficulty = p_difficulty, board = p_board,
      version = version + 1, updated_at = now()
    where id = p_draft_id and creator_id = v_uid and friendship_id = p_friendship_id
      and sent_puzzle_id is null and version = p_version
    returning * into d;
    if not found then
      if exists (select 1 from public.friend_puzzle_drafts
                 where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is not null) then
        raise exception 'draft_sent: This puzzle has already been sent.';
      end if;
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
  end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'updated_at', d.updated_at);
end $$;

create or replace function public.discard_friend_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  delete from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is null;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  SENDING
-- ═══════════════════════════════════════════════════════════════════════
--  Sends exactly the saved version of a draft. On the way out every card
--  gets a fresh opaque id and its stored words are turned by a random
--  quarter-turn (with the answer's orientation adjusted to match), so
--  neither the ids nor the word order in the payload hint at the answer.
--  Decoys beyond the chosen difficulty are dropped. Idempotent: sending an
--  already-sent draft returns the puzzle it became.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_extra int;
  v_cards jsonb := '{}'::jsonb;
  v_slot_cards jsonb := '[]'::jsonb;
  v_orients jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_clues jsonb;
  v_order jsonb;
  v_src text; v_new text; v_rot int; v_orient int;
  v_words jsonb; v_turned jsonb;
  v_puzzle_id uuid;
  i int;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if p_version is distinct from d.version then
    raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
  end if;

  select * into f from public.friendships where id = d.friendship_id for update;
  if not found or v_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  v_recipient := case when f.user_a = v_uid then f.user_b else f.user_a end;

  v_err := public.friend_validate_board(d.board, d.difficulty);
  if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;

  if exists (select 1 from public.friend_puzzles
             where friendship_id = f.id and creator_id = v_uid and finished_at is null) then
    raise exception 'already_waiting: % hasn''t finished your last puzzle yet.',
      public.friend_display_name(v_recipient);
  end if;

  v_extra := public.friend_extra_cards(d.difficulty);
  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(d.board->'clues') with ordinality as t(c, n);

  for i in 0 .. 3 + v_extra loop
    v_src := d.board->'slots'->i->>'cardId';
    v_orient := (d.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := d.board->'cards'->v_src->'words';
    -- Stored word j becomes old word (j + rot); shown with orientation
    -- (o + rot), every edge reads exactly as the creator placed it.
    select jsonb_agg(upper(btrim(v_words->>((j + v_rot) % 4))) order by j)
      into v_turned from generate_series(0, 3) as j;
    v_cards := v_cards || jsonb_build_object(v_new, jsonb_build_object('id', v_new, 'words', v_turned));
    v_ids := v_ids || v_new;
    if i < 4 then
      v_slot_cards := v_slot_cards || to_jsonb(v_new);
      v_orients := v_orients || to_jsonb((v_orient + v_rot) % 4);
    end if;
  end loop;
  select jsonb_agg(x order by random()) into v_order from unnest(v_ids) as x;

  insert into public.friend_puzzles
    (friendship_id, creator_id, recipient_id, draft_id, title, difficulty, clues, cards, card_order)
  values
    (f.id, v_uid, v_recipient, d.id, d.title, d.difficulty, v_clues, v_cards, v_order)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations)
  values (v_puzzle_id, v_slot_cards, v_orients);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = d.id;

  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');

  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  PLAYING
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_friendship_status(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f public.friendships%rowtype;
  s record;
begin
  select * into f from public.friendships where id = p_friendship_id;
  select * into s from public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, now());
  return jsonb_build_object(
    'daily_streak', s.streak, 'deadline_at', s.deadline_at,
    'done_this_period', s.done_this_period, 'next_period_at', s.next_period_at,
    'team_win_streak', f.team_win_streak, 'server_now', now());
end $$;

-- Role-appropriate view of one puzzle.
--   solver:  board, own guesses; the answer only once finished
--   creator: board and answer; the solver's guesses only once finished
-- Opening as the solver marks it seen (it does not count for streaks);
-- opening a finished puzzle as the creator marks the result seen.
create or replace function public.open_friend_puzzle(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  v_role text;
  v_show_answer boolean;
  v_show_guesses boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or v_uid not in (p.creator_id, p.recipient_id) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when v_uid = p.recipient_id then 'solver' else 'creator' end;
  if v_role = 'solver' and (p.recipient_seen_at is null or p.started_at is null) then
    update public.friend_puzzles
      set recipient_seen_at = coalesce(recipient_seen_at, now()), started_at = coalesce(started_at, now())
      where id = p.id;
  elsif v_role = 'creator' and p.finished_at is not null and p.creator_seen_result_at is null then
    update public.friend_puzzles set creator_seen_result_at = now() where id = p.id;
  end if;
  v_show_answer := v_role = 'creator' or p.finished_at is not null;
  v_show_guesses := v_role = 'solver' or p.finished_at is not null;

  return jsonb_build_object(
    'id', p.id, 'role', v_role, 'friendship_id', p.friendship_id,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'solver_name', public.friend_display_name(p.recipient_id),
    'clues', p.clues, 'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', case when v_show_guesses then coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb) end,
    'solution', case when v_show_answer then (
        select jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations)
        from public.friend_puzzle_answers a where a.puzzle_id = p.id) end,
    'friendship', public.friend_friendship_status(p.friendship_id));
end $$;

create or replace function public.friend_guess_response(p_puzzle_id uuid, p_guess_no int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  g public.friend_guesses%rowtype;
  v_final boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  select * into g from public.friend_guesses where puzzle_id = p_puzzle_id and guess_no = p_guess_no;
  v_final := p.finished_at is not null
    and p_guess_no = (select max(guess_no) from public.friend_guesses where puzzle_id = p_puzzle_id);
  return jsonb_build_object(
    'guess_no', g.guess_no, 'correct', g.correct, 'lives_left', g.lives_left,
    'outcome', case when v_final then p.outcome end,
    'lives_used', case when v_final then p.lives_used end,
    'solution', case when v_final then (
        select jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations)
        from public.friend_puzzle_answers a where a.puzzle_id = p.id) end,
    'friendship', case when v_final then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- Judges one Submit. p_guess_no must be the next number: a retry of a
-- guess already recorded (same board) gets the recorded answer back, and
-- anything else stale is refused, so double taps, two tabs and network
-- retries can never cost a second life or finish a puzzle twice.
create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  g public.friend_guesses%rowtype;
  f public.friendships%rowtype;
  v_daily record;
  v_count int;
  v_rot int;
  v_seen text[] := '{}';
  v_card text;
  v_or jsonb;
  v_correct int[] := '{}';
  v_lives int;
  v_outcome text;
  v_now timestamptz := now();
  r int; i int;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;

  select * into g from public.friend_guesses where puzzle_id = p.id and guess_no = p_guess_no;
  if found then
    if g.board = p_board and g.clues = p_clues then
      return public.friend_guess_response(p.id, p_guess_no);
    end if;
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;
  if p.finished_at is not null then
    raise exception 'already_finished: You''ve already finished this puzzle.';
  end if;
  select count(*) into v_count from public.friend_guesses where puzzle_id = p.id;
  if p_guess_no is distinct from v_count + 1 then
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;

  -- The board: four distinct cards from this puzzle, each turned 0..3.
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) <> 4
     or jsonb_typeof(p_clues) is distinct from 'array' or jsonb_array_length(p_clues) <> 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..3 loop
    v_card := p_board->i->>'cardId';
    v_or := p_board->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;

  -- Which whole-board Rotate the solver is on, from where the clues sit
  -- (the same test the daily game makes).
  v_rot := null;
  for r in 0..3 loop
    if (select bool_and(p_clues->>k = p.clues->>((k - r + 4) % 4)) from generate_series(0, 3) as k) then
      v_rot := r; exit;
    end if;
  end loop;
  if v_rot is null then raise exception 'invalid_guess: That board could not be read.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  for i in 0..3 loop
    if p_board->i->>'cardId' = a.slot_cards->>((i - v_rot + 4) % 4)
       and (p_board->i->>'orientation')::int
           = ((a.orientations->>((i - v_rot + 4) % 4))::int + v_rot) % 4 then
      v_correct := v_correct || i;
    end if;
  end loop;

  -- Every earlier guess was a miss (a hit would have finished the puzzle).
  v_lives := public.friend_max_lives() - v_count
             - case when cardinality(v_correct) = 4 then 0 else 1 end;
  if cardinality(v_correct) = 4 then v_outcome := 'won';
  elsif v_lives <= 0 then v_outcome := 'lost';
  end if;

  insert into public.friend_guesses (puzzle_id, guess_no, solver_id, board, extras, clues, correct, lives_left)
  values (p.id, p_guess_no, v_uid, p_board,
          case when jsonb_typeof(p_extras) = 'array' then p_extras else '[]'::jsonb end,
          p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    -- Streaks belong to the friendship. Locking the row serializes finishes
    -- from both friends so the win streak follows the order they happened.
    select * into f from public.friendships where id = p.friendship_id for update;
    select * into v_daily from public.friend_daily_after_finish(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now);
    update public.friendships set
      daily_anchor = v_daily.anchor,
      daily_last_period = v_daily.last_period,
      daily_streak = v_daily.streak,
      team_win_streak = public.friend_team_after_finish(f.team_win_streak, v_outcome),
      last_finished_at = v_now
    where id = f.id;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.', public.friend_display_name(v_uid)),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  WEB PUSH
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  if p_endpoint !~ '^https://' then
    raise exception 'invalid_subscription: That notification subscription isn''t valid.';
  end if;
  -- A device belongs to whoever signed in on it most recently.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid;
end $$;

-- Near-deadline reminders: at most one per friend per streak deadline, and
-- only in the last p_window before it, only while nothing has been
-- finished this period, and only for people who turned reminders on.
create or replace function public.enqueue_deadline_reminders(
  p_now timestamptz default now(), p_window interval default interval '3 hours') returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int := 0;
  rec record;
  v_hours int;
  v_queued boolean;
begin
  for rec in
    select f.id as friendship_id, m.uid, m.other, s.streak, s.deadline_at,
           exists (select 1 from public.friend_puzzles p
                   where p.friendship_id = f.id and p.recipient_id = m.uid and p.finished_at is null) as has_puzzle
    from public.friendships f
    cross join lateral public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, p_now) s
    cross join lateral (values (f.user_a, f.user_b), (f.user_b, f.user_a)) as m(uid, other)
    where s.streak > 0 and not s.done_this_period
      and s.deadline_at > p_now + interval '5 minutes'
      and s.deadline_at <= p_now + p_window
  loop
    v_hours := greatest(1, round(extract(epoch from (rec.deadline_at - p_now)) / 3600.0)::int);
    v_queued := public.friend_enqueue_push(
      rec.uid, 'reminder',
      'reminder:' || rec.friendship_id || ':' || rec.uid || ':' || floor(extract(epoch from rec.deadline_at))::bigint,
      rec.friendship_id, null,
      case when rec.has_puzzle then
        format('Finish %s''s puzzle to keep your %s-day Friend Streak — about %s left.',
          public.friend_display_name(rec.other), rec.streak,
          case when v_hours = 1 then 'an hour' else v_hours || ' hours' end)
      else
        format('Your %s-day Friend Streak with %s ends in about %s.',
          rec.streak, public.friend_display_name(rec.other),
          case when v_hours = 1 then 'an hour' else v_hours || ' hours' end)
      end,
      '/?friends=1', rec.deadline_at);
    if v_queued then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Claims a batch for the dispatcher. First retires anything stale: past its
-- time, a new-puzzle alert for a puzzle already opened, a result alert
-- already viewed in the app, or a reminder once the period is safe.
create or replace function public.claim_push_batch(p_limit int default 25) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows jsonb;
begin
  update public.notification_outbox o set status = 'skipped', last_error = 'stale'
  where o.status in ('pending', 'sending')
    and (o.not_after < now()
      or (o.kind = 'new_puzzle' and exists (
            select 1 from public.friend_puzzles p
            where p.id = o.puzzle_id and (p.recipient_seen_at is not null or p.finished_at is not null)))
      or (o.kind = 'result' and exists (
            select 1 from public.friend_puzzles p
            where p.id = o.puzzle_id and p.creator_seen_result_at is not null))
      or (o.kind = 'reminder' and exists (
            select 1 from public.friendships f
            cross join lateral public.friend_daily_status(f.daily_anchor, f.daily_last_period, f.daily_streak, now()) s
            where f.id = o.friendship_id and (s.streak = 0 or s.done_this_period))));

  with c as (
    select id from public.notification_outbox
    where (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '2 minutes'))
      and attempts < 5
    order by id
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), u as (
    update public.notification_outbox o
      set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
      returning o.id, o.user_id, o.kind, o.title, o.body, o.url, o.tag
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'kind', u.kind, 'title', u.title, 'body', u.body, 'url', u.url, 'tag', u.tag,
      'subscriptions', coalesce((
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
                                            'created_at', s.created_at))
        from public.push_subscriptions s where s.user_id = u.user_id), '[]'::jsonb))), '[]'::jsonb)
  into v_rows from u;
  return v_rows;
end $$;

create or replace function public.finish_push(p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_outbox set
    status = case when p_ok then 'sent'
                  when p_error like 'no_subscriptions%' then 'skipped'
                  when attempts >= 5 then 'failed'
                  else 'pending' end,
    sent_at = case when p_ok then now() end,
    last_error = left(p_error, 500)
  where id = p_id and status = 'sending';
end $$;

create or replace function public.push_endpoint_result(p_endpoint text, p_gone boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_gone then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  else
    update public.push_subscriptions set last_success_at = now() where endpoint = p_endpoint;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  FUNCTION PRIVILEGES
-- ═══════════════════════════════════════════════════════════════════════
--  Supabase grants EXECUTE on new public functions to anon and
--  authenticated by default. Take it all back, then grant deliberately.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'friend\_%' or p.proname in (
        'get_my_profile','set_display_name','update_notification_prefs',
        'create_friend_invite','get_friend_invite','accept_friend_invite',
        'get_friends_inbox','list_friend_history','get_friend_draft','save_friend_draft',
        'discard_friend_draft','send_friend_puzzle','open_friend_puzzle','submit_friend_guess',
        'save_push_subscription','delete_push_subscription','enqueue_deadline_reminders',
        'claim_push_batch','finish_push','push_endpoint_result'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

grant execute on function
  public.get_my_profile(), public.set_display_name(text),
  public.update_notification_prefs(boolean, boolean, boolean),
  public.create_friend_invite(), public.accept_friend_invite(text),
  public.get_friends_inbox(), public.list_friend_history(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, text, jsonb),
  public.discard_friend_draft(uuid), public.send_friend_puzzle(uuid, int),
  public.open_friend_puzzle(uuid), public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb),
  public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  to authenticated;
grant execute on function public.get_friend_invite(text) to anon, authenticated;
grant execute on function
  public.enqueue_deadline_reminders(timestamptz, interval), public.claim_push_batch(int),
  public.finish_push(bigint, boolean, text), public.push_endpoint_result(text, boolean)
  to service_role;
-- The streak-rule functions are pure; keep them callable for tests and tooling.
grant execute on function
  public.friend_period_length(), public.friend_period_index(timestamptz, timestamptz),
  public.friend_daily_after_finish(timestamptz, int, int, timestamptz),
  public.friend_daily_status(timestamptz, int, int, timestamptz),
  public.friend_team_after_finish(int, text)
  to service_role;
$cvmig$], '20260926090000_friend_puzzles');
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20260927090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Friend puzzles: the creator authors all seven cards; the recipient
--  chooses the difficulty.
-- ═══════════════════════════════════════════════════════════════════════
--  • A creator always makes one complete puzzle: four answer cards plus
--    exactly three bonus cards. Drafts no longer carry a difficulty.
--  • The server keeps the whole authored puzzle (all seven cards, in the
--    order the creator made the bonus cards) next to the answer, where
--    only the creator — and the solver, once finished — can read it.
--  • The recipient picks Easy / Standard / Expert / Hardcore before
--    starting. That uses the daily game's own meaning (0 / 1 / 2 / 3 bonus
--    cards, friend_extra_cards) and, like the daily game, deals the first
--    N bonus cards in the creator's order. The choice, the dealt cards and
--    their shuffled order are stored with the attempt and can't be changed,
--    so a refresh or another device restores exactly the same game.
--  • Guesses may only use the dealt cards, on the board or in the tray.
--  Judging, streaks and notifications are unchanged.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Data ───────────────────────────────────────────────────────────────

alter table public.friend_puzzles
  alter column difficulty drop not null,
  alter column cards drop not null,
  alter column card_order drop not null,
  add column dealt_extras jsonb;            -- bonus card ids dealt for this attempt, in authored order
alter table public.friend_puzzles
  add constraint friend_puzzles_difficulty_known
    check (difficulty is null or difficulty in ('easy','standard','expert','hardcore')),
  add constraint friend_puzzles_dealt_together
    check ((difficulty is null) = (cards is null) and (cards is null) = (card_order is null));
comment on column public.friend_puzzles.difficulty is 'Chosen by the recipient before play; null until then';
comment on column public.friend_puzzles.cards is 'The cards dealt for this attempt (answer + chosen bonus cards); null until the difficulty is chosen';

alter table public.friend_puzzle_answers
  add column authored_cards jsonb,          -- all seven cards, under their opaque ids
  add column bonus_cards jsonb;             -- the three bonus card ids, in the creator's order

-- Puzzles sent before this change (local only): what was sent is all there is.
update public.friend_puzzle_answers a set
  authored_cards = p.cards,
  bonus_cards = coalesce((select jsonb_agg(k) from jsonb_object_keys(p.cards) as k
                          where not (a.slot_cards ? k)), '[]'::jsonb)
from public.friend_puzzles p where p.id = a.puzzle_id and a.authored_cards is null;
update public.friend_puzzles p set dealt_extras = a.bonus_cards
from public.friend_puzzle_answers a where a.puzzle_id = p.id and p.dealt_extras is null and p.cards is not null;

-- ── Immutability: the difficulty can be set once, then never changed ───

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
begin
  if new.clues is distinct from old.clues
     or new.creator_id is distinct from old.creator_id
     or new.recipient_id is distinct from old.recipient_id
     or new.friendship_id is distinct from old.friendship_id
     or new.title is distinct from old.title then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if (new.difficulty, new.cards, new.card_order, new.dealt_extras)
       is distinct from (old.difficulty, old.cards, old.card_order, old.dealt_extras)
     and old.difficulty is not null then
    raise exception 'immutable: this attempt''s difficulty and cards are already set';
  end if;
  if old.finished_at is not null and (
       new.finished_at is distinct from old.finished_at
       or new.outcome is distinct from old.outcome
       or new.lives_used is distinct from old.lives_used) then
    raise exception 'immutable: a finished result cannot be changed';
  end if;
  return new;
end $$;

-- ── Validation: every one of the seven cards must be complete ──────────

drop function if exists public.friend_validate_board(jsonb, text);
create or replace function public.friend_validate_board(p_board jsonb)
returns text language plpgsql immutable as $$
declare
  v_clue text;
  v_card_id text;
  v_orient jsonb;
  v_words jsonb;
  v_word text;
  v_seen text[] := '{}';
  i int; j int;
begin
  if jsonb_typeof(p_board) is distinct from 'object'
     or jsonb_typeof(p_board->'clues') is distinct from 'array' or jsonb_array_length(p_board->'clues') <> 4
     or jsonb_typeof(p_board->'slots') is distinct from 'array' or jsonb_typeof(p_board->'cards') is distinct from 'object' then
    return 'The puzzle is incomplete.';
  end if;
  for i in 0..3 loop
    if jsonb_typeof(p_board->'clues'->i) is distinct from 'string' then return 'Every side needs a clue.'; end if;
    v_clue := btrim(p_board->'clues'->>i);
    if v_clue = '' then return 'Every side needs a clue.'; end if;
    if char_length(v_clue) > 20 then return 'Clues can be up to 20 letters.'; end if;
  end loop;
  if jsonb_array_length(p_board->'slots') <> 7 then
    return 'A puzzle has four answer cards and three bonus cards.';
  end if;
  for i in 0..6 loop
    v_card_id := p_board->'slots'->i->>'cardId';
    v_orient := p_board->'slots'->i->'orientation';
    if v_card_id is null or v_card_id = any(v_seen) then return 'The board has a missing card.'; end if;
    v_seen := v_seen || v_card_id;
    if jsonb_typeof(v_orient) is distinct from 'number' or (v_orient)::int not between 0 and 3 then
      return 'The board has a card in an unknown position.';
    end if;
    v_words := p_board->'cards'->v_card_id->'words';
    if jsonb_typeof(v_words) is distinct from 'array' or jsonb_array_length(v_words) <> 4 then
      return 'Every card needs four words.';
    end if;
    for j in 0..3 loop
      if jsonb_typeof(v_words->j) is distinct from 'string' or btrim(v_words->>j) = '' then
        return case when i < 4 then 'Every edge of the four answer cards needs a word.'
                    else 'Every edge of the three bonus cards needs a word.' end;
      end if;
      v_word := btrim(v_words->>j);
      if char_length(v_word) > 18 then return 'Card words can be up to 18 letters.'; end if;
    end loop;
  end loop;
  return null;
end $$;

-- ── Drafts: no difficulty any more ─────────────────────────────────────

drop function if exists public.save_friend_draft(uuid, uuid, int, text, text, jsonb);
alter table public.friend_puzzle_drafts drop column difficulty;

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  select * into d from public.friend_puzzle_drafts
  where friendship_id = p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'board', d.board, 'updated_at', d.updated_at);
end $$;

-- Optimistic concurrency: an update must name the version it was based on,
-- so two tabs cannot silently overwrite each other. All seven cards are
-- saved exactly as edited, finished or not.
create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int, p_title text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  perform public.friend_member_other(p_friendship_id, v_uid);
  if jsonb_typeof(p_board) is distinct from 'object' or octet_length(p_board::text) > 16000 then
    raise exception 'invalid_puzzle: That puzzle is too large to save.';
  end if;
  if p_draft_id is null then
    begin
      insert into public.friend_puzzle_drafts (friendship_id, creator_id, title, board)
      values (p_friendship_id, v_uid, left(btrim(coalesce(p_title, '')), 40), p_board)
      returning * into d;
    exception when unique_violation then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end;
  else
    update public.friend_puzzle_drafts set
      title = left(btrim(coalesce(p_title, '')), 40), board = p_board,
      version = version + 1, updated_at = now()
    where id = p_draft_id and creator_id = v_uid and friendship_id = p_friendship_id
      and sent_puzzle_id is null and version = p_version
    returning * into d;
    if not found then
      if exists (select 1 from public.friend_puzzle_drafts
                 where id = p_draft_id and creator_id = v_uid and sent_puzzle_id is not null) then
        raise exception 'draft_sent: This puzzle has already been sent.';
      end if;
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
  end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'updated_at', d.updated_at);
end $$;

-- ── Sending: keep all seven cards; deal nothing yet ────────────────────
--  Every card gets a fresh opaque id and a random quarter-turn of its
--  stored words (the answer's orientation adjusted to match), so nothing in
--  a payload hints at the answer. Idempotent per draft, as before.

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_cards jsonb := '{}'::jsonb;
  v_slot_cards jsonb := '[]'::jsonb;
  v_orients jsonb := '[]'::jsonb;
  v_bonus jsonb := '[]'::jsonb;
  v_clues jsonb;
  v_src text; v_new text; v_rot int; v_orient int;
  v_words jsonb; v_turned jsonb;
  v_puzzle_id uuid;
  i int;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if p_version is distinct from d.version then
    raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
  end if;

  select * into f from public.friendships where id = d.friendship_id for update;
  if not found or v_uid not in (f.user_a, f.user_b) then
    raise exception 'not_found: That friend isn''t in your list.';
  end if;
  v_recipient := case when f.user_a = v_uid then f.user_b else f.user_a end;

  v_err := public.friend_validate_board(d.board);
  if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;

  if exists (select 1 from public.friend_puzzles
             where friendship_id = f.id and creator_id = v_uid and finished_at is null) then
    raise exception 'already_waiting: % hasn''t finished your last puzzle yet.',
      public.friend_display_name(v_recipient);
  end if;

  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(d.board->'clues') with ordinality as t(c, n);

  for i in 0..6 loop
    v_src := d.board->'slots'->i->>'cardId';
    v_orient := (d.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := d.board->'cards'->v_src->'words';
    select jsonb_agg(upper(btrim(v_words->>((j + v_rot) % 4))) order by j)
      into v_turned from generate_series(0, 3) as j;
    v_cards := v_cards || jsonb_build_object(v_new, jsonb_build_object('id', v_new, 'words', v_turned));
    if i < 4 then
      v_slot_cards := v_slot_cards || to_jsonb(v_new);
      v_orients := v_orients || to_jsonb((v_orient + v_rot) % 4);
    else
      v_bonus := v_bonus || to_jsonb(v_new);
    end if;
  end loop;

  insert into public.friend_puzzles
    (friendship_id, creator_id, recipient_id, draft_id, title, clues)
  values
    (f.id, v_uid, v_recipient, d.id, d.title, v_clues)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations, authored_cards, bonus_cards)
  values (v_puzzle_id, v_slot_cards, v_orients, v_cards, v_bonus);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = d.id;

  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');

  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

-- ── The recipient chooses the difficulty (once) ────────────────────────
--  Deals the four answer cards plus the first N bonus cards in the
--  creator's order, shuffles their order once, and stores it all with the
--  attempt. Choosing the same level again is a harmless no-op (a double tap
--  or second tab); choosing a different one afterwards is refused.

create or replace function public.choose_friend_difficulty(p_puzzle_id uuid, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_extra int := public.friend_extra_cards(p_difficulty);
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  v_dealt jsonb;
  v_ids text[];
  v_cards jsonb;
  v_order jsonb;
begin
  if v_extra is null then raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.'; end if;
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if p.difficulty is not null then
    if p.difficulty = p_difficulty then
      return jsonb_build_object('difficulty', p.difficulty, 'already_chosen', true);
    end if;
    raise exception 'difficulty_locked: You started this puzzle on %. The difficulty can''t change once you''ve started.',
      initcap(p.difficulty);
  end if;
  if p.finished_at is not null then raise exception 'already_finished: You''ve already finished this puzzle.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  select coalesce(jsonb_agg(x order by n), '[]'::jsonb) into v_dealt
    from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n) where n <= v_extra;
  select array_agg(x) into v_ids from (
    select jsonb_array_elements_text(a.slot_cards) as x
    union all select jsonb_array_elements_text(v_dealt)) s;
  select jsonb_object_agg(x, a.authored_cards->x) into v_cards from unnest(v_ids) as x;
  select jsonb_agg(x order by random()) into v_order from unnest(v_ids) as x;

  update public.friend_puzzles set
    difficulty = p_difficulty, cards = v_cards, card_order = v_order, dealt_extras = v_dealt,
    started_at = coalesce(started_at, now()), recipient_seen_at = coalesce(recipient_seen_at, now())
  where id = p.id;
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

-- ── Opening a puzzle ───────────────────────────────────────────────────
--   solver:  before choosing — only who made it; after — the dealt cards,
--            own guesses; the whole authored puzzle and answer once finished
--   creator: the whole authored puzzle and answer; the attempt's
--            difficulty and dealt cards; the guesses once finished
-- Opening marks it seen; it doesn't start the attempt or count for streaks.

create or replace function public.open_friend_puzzle(p_puzzle_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  v_role text;
  v_show_answer boolean;
  v_show_guesses boolean;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id;
  if not found or v_uid not in (p.creator_id, p.recipient_id) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when v_uid = p.recipient_id then 'solver' else 'creator' end;
  if v_role = 'solver' and p.recipient_seen_at is null then
    update public.friend_puzzles set recipient_seen_at = now() where id = p.id;
  elsif v_role = 'creator' and p.finished_at is not null and p.creator_seen_result_at is null then
    update public.friend_puzzles set creator_seen_result_at = now() where id = p.id;
  end if;
  v_show_answer := v_role = 'creator' or p.finished_at is not null;
  v_show_guesses := v_role = 'solver' or p.finished_at is not null;
  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;

  return jsonb_build_object(
    'id', p.id, 'role', v_role, 'friendship_id', p.friendship_id,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'solver_name', public.friend_display_name(p.recipient_id),
    'clues', case when p.difficulty is not null or v_show_answer then p.clues end,
    'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', case when v_show_guesses then coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb) end,
    'solution', case when v_show_answer then
        jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations) end,
    'authored_cards', case when v_show_answer then a.authored_cards end,
    'bonus_cards', case when v_show_answer then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'card_id', x, 'dealt', case when p.dealt_extras is null then null else p.dealt_extras ? x end)
          order by n), '[]'::jsonb)
        from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n)) end,
    'friendship', public.friend_friendship_status(p.friendship_id));
end $$;

-- ── Judging: only the dealt cards may be used ──────────────────────────
-- Unchanged from before except: the difficulty must have been chosen, and
-- the reported tray must be exactly the dealt cards not on the board.

create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
  a public.friend_puzzle_answers%rowtype;
  g public.friend_guesses%rowtype;
  f public.friendships%rowtype;
  v_daily record;
  v_count int;
  v_rot int;
  v_seen text[] := '{}';
  v_card text;
  v_or jsonb;
  v_correct int[] := '{}';
  v_lives int;
  v_outcome text;
  v_now timestamptz := now();
  r int; i int;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id <> v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;

  select * into g from public.friend_guesses where puzzle_id = p.id and guess_no = p_guess_no;
  if found then
    if g.board = p_board and g.clues = p_clues then
      return public.friend_guess_response(p.id, p_guess_no);
    end if;
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;
  if p.finished_at is not null then
    raise exception 'already_finished: You''ve already finished this puzzle.';
  end if;
  if p.difficulty is null then
    raise exception 'choose_difficulty: Choose a difficulty to start this puzzle.';
  end if;
  select count(*) into v_count from public.friend_guesses where puzzle_id = p.id;
  if p_guess_no is distinct from v_count + 1 then
    raise exception 'stale_guess: This puzzle moved on in another window. Reloading your board.';
  end if;

  -- The board: four distinct dealt cards, each turned 0..3.
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) <> 4
     or jsonb_typeof(p_clues) is distinct from 'array' or jsonb_array_length(p_clues) <> 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..3 loop
    v_card := p_board->i->>'cardId';
    v_or := p_board->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;
  -- The tray: exactly the other dealt cards.
  if jsonb_typeof(p_extras) is distinct from 'array'
     or jsonb_array_length(p_extras) <> jsonb_array_length(p.card_order) - 4 then
    raise exception 'invalid_guess: That board could not be read.';
  end if;
  for i in 0..jsonb_array_length(p_extras) - 1 loop
    v_card := p_extras->i->>'cardId';
    v_or := p_extras->i->'orientation';
    if v_card is null or not (p.cards ? v_card) or v_card = any(v_seen)
       or jsonb_typeof(v_or) is distinct from 'number' or (v_or)::int not between 0 and 3 then
      raise exception 'invalid_guess: That board could not be read.';
    end if;
    v_seen := v_seen || v_card;
  end loop;

  v_rot := null;
  for r in 0..3 loop
    if (select bool_and(p_clues->>k = p.clues->>((k - r + 4) % 4)) from generate_series(0, 3) as k) then
      v_rot := r; exit;
    end if;
  end loop;
  if v_rot is null then raise exception 'invalid_guess: That board could not be read.'; end if;

  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  for i in 0..3 loop
    if p_board->i->>'cardId' = a.slot_cards->>((i - v_rot + 4) % 4)
       and (p_board->i->>'orientation')::int
           = ((a.orientations->>((i - v_rot + 4) % 4))::int + v_rot) % 4 then
      v_correct := v_correct || i;
    end if;
  end loop;

  v_lives := public.friend_max_lives() - v_count
             - case when cardinality(v_correct) = 4 then 0 else 1 end;
  if cardinality(v_correct) = 4 then v_outcome := 'won';
  elsif v_lives <= 0 then v_outcome := 'lost';
  end if;

  insert into public.friend_guesses (puzzle_id, guess_no, solver_id, board, extras, clues, correct, lives_left)
  values (p.id, p_guess_no, v_uid, p_board, p_extras, p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    select * into f from public.friendships where id = p.friendship_id for update;
    select * into v_daily from public.friend_daily_after_finish(
      f.daily_anchor, f.daily_last_period, f.daily_streak, v_now);
    update public.friendships set
      daily_anchor = v_daily.anchor,
      daily_last_period = v_daily.last_period,
      daily_streak = v_daily.streak,
      team_win_streak = public.friend_team_after_finish(f.team_win_streak, v_outcome),
      last_finished_at = v_now
    where id = f.id;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.', public.friend_display_name(v_uid)),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function public.friend_validate_board(jsonb) from public, anon, authenticated;
revoke all on function public.save_friend_draft(uuid, uuid, int, text, jsonb) from public, anon;
revoke all on function public.choose_friend_difficulty(uuid, text) from public, anon;
grant execute on function public.save_friend_draft(uuid, uuid, int, text, jsonb) to authenticated;
grant execute on function public.choose_friend_difficulty(uuid, text) to authenticated;
$cvmig$], '20260927090000_friend_recipient_difficulty');

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
  'policies', (select string_agg(tablename||':'||policyname, ',' order by tablename, policyname) from pg_policies where schemaname='public')
) as after;
