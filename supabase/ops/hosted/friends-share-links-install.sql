-- Hosted install of the share-links migration (guest play by link), plus its
-- ledger row. Run with tools/hosted.mjs: rehearsal (BEGIN … ROLLBACK) first,
-- then --apply, only with the owner's approval. Adds link columns and functions;
-- existing puzzles, accounts and permissions on existing tables are unchanged.

-- ==== 20261011090000_friend_share_links ====
-- ═══════════════════════════════════════════════════════════════════════
--  Friend puzzles by link: a player makes a puzzle for someone who hasn't
--  joined yet and texts them a secret link. The person plays as a guest,
--  with no account; the sender watches their guesses; afterwards the guest
--  can sign in or sign up to save the result and become friends.
-- ═══════════════════════════════════════════════════════════════════════
--  Rules (one place; the app and docs repeat them):
--  • A shared puzzle is an ordinary friend puzzle with no recipient yet and
--    a secret link code (share_token). The code unlocks that one puzzle,
--    through the share functions below, and nothing else: no table access,
--    no Friends hub, no other puzzle, no names or streaks.
--  • Opening the link never claims it (a text-message preview can't either:
--    previews don't run the app). The first browser that deliberately starts
--    playing claims it: the browser's own random guest key, kept only in that
--    browser, is stored as a hash. Only that key can continue, guess, see the
--    result or save it to an account. The link alone can't take it over.
--  • Guesses are judged here, exactly like friend puzzles; the answer is only
--    returned once the game is over.
--  • Links work for 30 days from when they were made (a fresh link starts a
--    new 30 days). On day 30 the link closes whatever its state: an
--    unfinished game simply ends (not a loss), can't be continued or saved;
--    a finished game can no longer be saved to an account. The sender keeps
--    the puzzle, and the guesses replay if it was finished.
--  • The sender can stop sharing (the link closes at once) or, while it's
--    unfinished, send a fresh link: a new code, the old one dead, the
--    unfinished game cleared. A finished result is never cleared.
--  • Saving: a signed-in account holding the guest key attaches the finished
--    puzzle to itself and becomes friends with the sender. Once per puzzle;
--    a repeat is a no-op. A guest finish doesn't start a Friend Streak.
--  Also fixed here: "is this your puzzle?" checks are null-safe, so a puzzle
--  with no recipient is never treated as anyone's.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Data ───────────────────────────────────────────────────────────────

alter table public.friend_puzzles
  alter column friendship_id drop not null,
  alter column recipient_id drop not null,
  add column share_token text,
  add column share_label text check (share_label is null or char_length(share_label) <= 24),
  add column share_expires_at timestamptz,
  add column share_revoked_at timestamptz,
  add column guest_key_hash text;
create unique index friend_puzzles_share_token on public.friend_puzzles(share_token) where share_token is not null;
create index friend_puzzles_shared_by on public.friend_puzzles(creator_id, sent_at desc) where share_token is not null;
alter table public.friend_puzzles
  add constraint friend_puzzles_recipient_or_link
    check (recipient_id is not null or share_token is not null),
  add constraint friend_puzzles_friendship_with_recipient
    check ((friendship_id is null) = (recipient_id is null)),
  add constraint friend_puzzles_link_expires
    check (share_token is null or share_expires_at is not null);
comment on column public.friend_puzzles.share_token is 'Secret link code for a puzzle shared by link (null for puzzles sent to a friend)';
comment on column public.friend_puzzles.guest_key_hash is 'sha256 of the guest key of the browser that started it; null until started, and once saved to an account';

-- A guest's guesses have no account behind them (yet).
alter table public.friend_guesses alter column solver_id drop not null;
comment on column public.friend_guesses.solver_id is 'The account that guessed; null when played as a guest by link';

-- Drafts for "someone new" have no friendship: one open per creator.
alter table public.friend_puzzle_drafts alter column friendship_id drop not null;
create unique index friend_drafts_one_open_share
  on public.friend_puzzle_drafts(creator_id) where friendship_id is null and sent_puzzle_id is null;

-- ── Immutability, with the two share transitions ───────────────────────
--  saving to an account: recipient/friendship go from none to set, once
--  a fresh link: an unfinished, unsaved attempt goes back to not started

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
declare
  v_saving boolean := old.recipient_id is null and old.share_token is not null
    and new.recipient_id is not null and new.friendship_id is not null;
  v_resetting boolean := old.recipient_id is null and old.share_token is not null
    and old.finished_at is null and new.difficulty is null and new.cards is null
    and new.card_order is null and new.dealt_extras is null;
begin
  if new.clues is distinct from old.clues
     or new.creator_id is distinct from old.creator_id
     or new.title is distinct from old.title
     or ((new.recipient_id is distinct from old.recipient_id
          or new.friendship_id is distinct from old.friendship_id) and not v_saving) then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if (new.difficulty, new.cards, new.card_order, new.dealt_extras)
       is distinct from (old.difficulty, old.cards, old.card_order, old.dealt_extras)
     and old.difficulty is not null and not v_resetting then
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

-- ── Small helpers ──────────────────────────────────────────────────────

create or replace function public.friend_guest_key_hash(p_key text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_guest: This browser couldn''t be recognised. Reload the page and try again.';
  end if;
  return encode(extensions.digest(p_key, 'sha256'), 'hex');
end $$;

create or replace function public.friend_new_share_token() returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
$$;

-- Where a shared puzzle stands for its link, at this moment.
create or replace function public.friend_share_state(p public.friend_puzzles) returns text
language sql stable as $$
  select case
    when p.share_token is null then 'not_shared'
    when p.recipient_id is not null then 'saved'
    when p.share_revoked_at is not null then 'revoked'
    when now() >= p.share_expires_at then 'expired'
    when p.finished_at is not null then 'finished'
    when p.guest_key_hash is not null then 'playing'
    else 'waiting' end
$$;

-- What a guest's view of their game includes (the solver's view of a friend
-- puzzle, keyed by link): nothing about the answer until it's over.
create or replace function public.friend_shared_view(p public.friend_puzzles) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  a public.friend_puzzle_answers%rowtype;
  v_over boolean := p.finished_at is not null;
begin
  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  return jsonb_build_object(
    'id', 's-' || p.share_token, 'role', 'solver', 'friendship_id', null,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'clues', case when p.difficulty is not null then p.clues end,
    'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'expires_at', p.share_expires_at,
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb),
    'solution', case when v_over then
        jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations) end,
    'authored_cards', case when v_over then a.authored_cards end,
    'bonus_cards', case when v_over then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'card_id', x, 'dealt', case when p.dealt_extras is null then null else p.dealt_extras ? x end)
          order by n), '[]'::jsonb)
        from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n)) end,
    'friendship', null);
end $$;

-- ── Shared machinery (was inside send / choose / submit) ───────────────

-- Freezes a draft into a puzzle: fresh opaque card ids, a random quarter-turn
-- of each card's words, the answer adjusted to match. No recipient for a link.
create or replace function public.friend_publish_draft(
  p_draft public.friend_puzzle_drafts, p_friendship uuid, p_recipient uuid,
  p_share_token text, p_share_label text) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
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
  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(p_draft.board->'clues') with ordinality as t(c, n);
  for i in 0..6 loop
    v_src := p_draft.board->'slots'->i->>'cardId';
    v_orient := (p_draft.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := p_draft.board->'cards'->v_src->'words';
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
    (friendship_id, creator_id, recipient_id, draft_id, title, clues,
     share_token, share_label, share_expires_at)
  values
    (p_friendship, p_draft.creator_id, p_recipient, p_draft.id, p_draft.title, v_clues,
     p_share_token, nullif(btrim(coalesce(p_share_label, '')), ''),
     case when p_share_token is not null then now() + interval '30 days' end)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations, authored_cards, bonus_cards)
  values (v_puzzle_id, v_slot_cards, v_orients, v_cards, v_bonus);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = p_draft.id;
  return v_puzzle_id;
end $$;

-- Deals the attempt (four answer cards + the first N bonus cards, shuffled
-- once) and records the start. The caller has checked who may do this.
create or replace function public.friend_deal(p_puzzle_id uuid, p_difficulty text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_extra int := public.friend_extra_cards(p_difficulty);
  a public.friend_puzzle_answers%rowtype;
  v_dealt jsonb;
  v_ids text[];
  v_cards jsonb;
  v_order jsonb;
begin
  select * into a from public.friend_puzzle_answers where puzzle_id = p_puzzle_id;
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
  where id = p_puzzle_id;
end $$;

-- Judges one guess on a puzzle the caller has already locked and authorised.
-- p_solver is the account guessing, or null for a guest. Friend Streaks only
-- move for puzzles between friends.
create or replace function public.friend_judge_guess(
  p public.friend_puzzles, p_solver uuid,
  p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
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
  values (p.id, p_guess_no, p_solver, p_board, p_extras, p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    if p.friendship_id is not null then
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
    end if;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.',
        case when p_solver is null then coalesce(p.share_label, 'Your guest') else public.friend_display_name(p_solver) end),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- The guess result; streak status only between friends.
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
    'friendship', case when v_final and p.friendship_id is not null
                       then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- ── Friend puzzles: same behaviour, null-safe ownership checks ─────────

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_puzzle_id uuid;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if d.friendship_id is null then raise exception 'not_found: That draft is for a link, not a friend.'; end if;
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
  v_puzzle_id := public.friend_publish_draft(d, f.id, v_recipient, null, null);
  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');
  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

create or replace function public.choose_friend_difficulty(p_puzzle_id uuid, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  if public.friend_extra_cards(p_difficulty) is null then
    raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.';
  end if;
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id is distinct from v_uid then
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
  perform public.friend_deal(p.id, p_difficulty);
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id is distinct from v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_judge_guess(p, v_uid, p_guess_no, p_board, p_extras, p_clues);
end $$;

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
  if not found or (p.creator_id is distinct from v_uid and p.recipient_id is distinct from v_uid) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when p.recipient_id = v_uid then 'solver' else 'creator' end;
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
    'solver_name', case when p.recipient_id is null then coalesce(p.share_label, 'Your guest')
                        else public.friend_display_name(p.recipient_id) end,
    'shared', p.share_token is not null and p.recipient_id is null,
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
    'friendship', case when p.friendship_id is not null then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- ── Drafts: a null friendship is the creator's "someone new" draft ─────

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  if p_friendship_id is not null then
    perform public.friend_member_other(p_friendship_id, v_uid);
  else
    perform public.friend_require_profile(v_uid);
  end if;
  select * into d from public.friend_puzzle_drafts
  where friendship_id is not distinct from p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'board', d.board, 'updated_at', d.updated_at);
end $$;

create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int, p_title text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  if p_friendship_id is not null then
    perform public.friend_member_other(p_friendship_id, v_uid);
  else
    perform public.friend_require_profile(v_uid);
  end if;
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
    where id = p_draft_id and creator_id = v_uid and friendship_id is not distinct from p_friendship_id
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

-- ── The sender: make a link, list links, stop sharing, fresh link ──────

create or replace function public.create_share_link(p_draft_id uuid, p_version int, p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  v_err text;
  v_puzzle_id uuid;
  p public.friend_puzzles%rowtype;
begin
  perform public.friend_require_profile(v_uid);
  if char_length(btrim(coalesce(p_label, ''))) > 24 then
    raise exception 'invalid_label: Keep "who it''s for" to 24 letters.';
  end if;
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid and friendship_id is null for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is null then
    if p_version is distinct from d.version then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
    v_err := public.friend_validate_board(d.board);
    if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;
    if (select count(*) from public.friend_puzzles
        where creator_id = v_uid and share_token is not null and recipient_id is null
          and share_revoked_at is null and now() < share_expires_at) >= 20 then
      raise exception 'too_many_links: You have 20 links out. Stop sharing one to make another.';
    end if;
    v_puzzle_id := public.friend_publish_draft(d, null, null, public.friend_new_share_token(), p_label);
  else
    v_puzzle_id := d.sent_puzzle_id;   -- a double tap: the same link
  end if;
  select * into p from public.friend_puzzles where id = v_puzzle_id;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'label', p.share_label,
    'expires_at', p.share_expires_at);
end $$;

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
    from (select * from public.friend_puzzles
          where creator_id = v_uid and share_token is not null and recipient_id is null
            and share_revoked_at is null
          order by sent_at desc limit 20) p
  ), '[]'::jsonb);
end $$;

create or replace function public.stop_share_link(p_puzzle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  update public.friend_puzzles set share_revoked_at = coalesce(share_revoked_at, now())
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null;
  if not found then raise exception 'not_found: That link isn''t yours to stop.'; end if;
end $$;

-- Recovery when the person is stuck in another browser (or the link went
-- astray): a new code and a new 30 days; the old link dies; the unfinished
-- game is cleared. Refused once finished, so a result is never overwritten.
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
  update public.friend_puzzles set
    share_token = public.friend_new_share_token(), share_expires_at = now() + interval '30 days',
    guest_key_hash = null, difficulty = null, cards = null, card_order = null, dealt_extras = null,
    started_at = null, recipient_seen_at = null
  where id = p.id returning * into p;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'expires_at', p.share_expires_at);
end $$;

-- ── The person with the link (no account needed) ───────────────────────
--  Every call needs the link code and this browser's guest key. Opening
--  only reads: it never claims, starts or marks anything.

create or replace function public.open_shared_puzzle(p_token text, p_guest_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_uid uuid := public.cluevoyance_uid();
  v_state text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into p from public.friend_puzzles where share_token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_state := public.friend_share_state(p);
  if v_state = 'revoked' then
    return jsonb_build_object('status', 'revoked', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if v_uid is not null and v_uid = p.creator_id then
    return jsonb_build_object('status', 'own', 'puzzle_id', p.id);
  end if;
  if v_state = 'saved' then
    return jsonb_build_object('status', case when p.recipient_id = v_uid then 'saved_yours' else 'saved' end,
      'puzzle_id', case when p.recipient_id = v_uid then p.id end,
      'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if v_state = 'expired' then
    return jsonb_build_object('status', 'expired', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if p.guest_key_hash is null then
    return jsonb_build_object('status', 'available', 'creator_name', public.friend_display_name(p.creator_id),
      'title', p.title, 'max_lives', public.friend_max_lives(), 'expires_at', p.share_expires_at);
  end if;
  if p.guest_key_hash <> v_hash then
    return jsonb_build_object('status', 'taken', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  return jsonb_build_object('status', 'yours', 'puzzle', public.friend_shared_view(p));
end $$;

-- The deliberate start: claims the puzzle for this browser and deals it.
create or replace function public.start_shared_puzzle(p_token text, p_guest_key text, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_state text;
begin
  if public.friend_extra_cards(p_difficulty) is null then
    raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.';
  end if;
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if p.creator_id = public.cluevoyance_uid() then
    raise exception 'own: This is your own puzzle. Send the link to the person you made it for.';
  end if;
  v_state := public.friend_share_state(p);
  if v_state in ('revoked', 'saved') then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if v_state = 'expired' then raise exception 'expired: This link has expired.'; end if;
  if p.guest_key_hash is not null and p.guest_key_hash <> v_hash then
    raise exception 'taken: This puzzle was started in another browser.';
  end if;
  if p.difficulty is not null then
    if p.difficulty = p_difficulty then
      return jsonb_build_object('difficulty', p.difficulty, 'already_chosen', true);
    end if;
    raise exception 'difficulty_locked: You started this puzzle on %. The difficulty can''t change once you''ve started.',
      initcap(p.difficulty);
  end if;
  update public.friend_puzzles set guest_key_hash = v_hash where id = p.id;
  perform public.friend_deal(p.id, p_difficulty);
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

create or replace function public.submit_shared_guess(
  p_token text, p_guest_key text, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_state text;
begin
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found or p.guest_key_hash is distinct from v_hash then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_state := public.friend_share_state(p);
  if v_state = 'expired' then raise exception 'expired: This link has expired.'; end if;
  if v_state not in ('playing', 'finished') then raise exception 'not_found: That puzzle isn''t available.'; end if;
  return public.friend_judge_guess(p, null, p_guess_no, p_board, p_extras, p_clues);
end $$;

-- Save the finished result to the signed-in account and become friends with
-- the sender. Needs the link code AND this browser's guest key.
create or replace function public.claim_shared_puzzle(p_token text, p_guest_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  p public.friend_puzzles%rowtype;
  v_a uuid; v_b uuid;
  v_fid uuid;
  v_state text;
begin
  perform public.friend_require_profile(v_uid);
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if p.recipient_id is not null then
    if p.recipient_id = v_uid then
      return jsonb_build_object('puzzle_id', p.id, 'friendship_id', p.friendship_id, 'already_saved', true);
    end if;
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if p.creator_id = v_uid then raise exception 'own: This is your own puzzle.'; end if;
  if p.guest_key_hash is distinct from v_hash then raise exception 'not_found: That puzzle isn''t available.'; end if;
  v_state := public.friend_share_state(p);
  if v_state = 'expired' then raise exception 'expired: This link has expired, so the result can''t be saved.'; end if;
  if v_state <> 'finished' then raise exception 'not_finished: Finish the puzzle first.'; end if;

  v_a := least(p.creator_id, v_uid); v_b := greatest(p.creator_id, v_uid);
  select id into v_fid from public.friendships where user_a = v_a and user_b = v_b for update;
  if v_fid is null then
    insert into public.friendships (user_a, user_b) values (v_a, v_b) returning id into v_fid;
  end if;
  update public.friend_puzzles set
    friendship_id = v_fid, recipient_id = v_uid, guest_key_hash = null
  where id = p.id;
  return jsonb_build_object('puzzle_id', p.id, 'friendship_id', v_fid, 'already_saved', false);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function
  public.friend_guest_key_hash(text), public.friend_new_share_token(),
  public.friend_share_state(public.friend_puzzles), public.friend_shared_view(public.friend_puzzles),
  public.friend_publish_draft(public.friend_puzzle_drafts, uuid, uuid, text, text),
  public.friend_deal(uuid, text),
  public.friend_judge_guess(public.friend_puzzles, uuid, int, jsonb, jsonb, jsonb),
  public.friend_guess_response(uuid, int),
  public.create_share_link(uuid, int, text), public.list_share_links(),
  public.stop_share_link(uuid), public.refresh_share_link(uuid),
  public.open_shared_puzzle(text, text), public.start_shared_puzzle(text, text, text),
  public.submit_shared_guess(text, text, int, jsonb, jsonb, jsonb),
  public.claim_shared_puzzle(text, text),
  public.send_friend_puzzle(uuid, int), public.choose_friend_difficulty(uuid, text),
  public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb), public.open_friend_puzzle(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, jsonb)
  from public, anon, authenticated;

-- Signed-in players (as before, plus the sender's link controls and saving).
grant execute on function
  public.send_friend_puzzle(uuid, int), public.choose_friend_difficulty(uuid, text),
  public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb), public.open_friend_puzzle(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, jsonb),
  public.create_share_link(uuid, int, text), public.list_share_links(),
  public.stop_share_link(uuid), public.refresh_share_link(uuid),
  public.claim_shared_puzzle(text, text)
  to authenticated;
-- The person with the link, signed in or not: exactly these three.
grant execute on function
  public.open_shared_puzzle(text, text), public.start_shared_puzzle(text, text, text),
  public.submit_shared_guess(text, text, int, jsonb, jsonb, jsonb)
  to anon, authenticated;


-- ---- migration ledger ----
insert into supabase_migrations.schema_migrations (version, statements, name)
values ('20261011090000', array[$cvmig$-- ═══════════════════════════════════════════════════════════════════════
--  Friend puzzles by link: a player makes a puzzle for someone who hasn't
--  joined yet and texts them a secret link. The person plays as a guest,
--  with no account; the sender watches their guesses; afterwards the guest
--  can sign in or sign up to save the result and become friends.
-- ═══════════════════════════════════════════════════════════════════════
--  Rules (one place; the app and docs repeat them):
--  • A shared puzzle is an ordinary friend puzzle with no recipient yet and
--    a secret link code (share_token). The code unlocks that one puzzle,
--    through the share functions below, and nothing else: no table access,
--    no Friends hub, no other puzzle, no names or streaks.
--  • Opening the link never claims it (a text-message preview can't either:
--    previews don't run the app). The first browser that deliberately starts
--    playing claims it: the browser's own random guest key, kept only in that
--    browser, is stored as a hash. Only that key can continue, guess, see the
--    result or save it to an account. The link alone can't take it over.
--  • Guesses are judged here, exactly like friend puzzles; the answer is only
--    returned once the game is over.
--  • Links work for 30 days from when they were made (a fresh link starts a
--    new 30 days). On day 30 the link closes whatever its state: an
--    unfinished game simply ends (not a loss), can't be continued or saved;
--    a finished game can no longer be saved to an account. The sender keeps
--    the puzzle, and the guesses replay if it was finished.
--  • The sender can stop sharing (the link closes at once) or, while it's
--    unfinished, send a fresh link: a new code, the old one dead, the
--    unfinished game cleared. A finished result is never cleared.
--  • Saving: a signed-in account holding the guest key attaches the finished
--    puzzle to itself and becomes friends with the sender. Once per puzzle;
--    a repeat is a no-op. A guest finish doesn't start a Friend Streak.
--  Also fixed here: "is this your puzzle?" checks are null-safe, so a puzzle
--  with no recipient is never treated as anyone's.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Data ───────────────────────────────────────────────────────────────

alter table public.friend_puzzles
  alter column friendship_id drop not null,
  alter column recipient_id drop not null,
  add column share_token text,
  add column share_label text check (share_label is null or char_length(share_label) <= 24),
  add column share_expires_at timestamptz,
  add column share_revoked_at timestamptz,
  add column guest_key_hash text;
create unique index friend_puzzles_share_token on public.friend_puzzles(share_token) where share_token is not null;
create index friend_puzzles_shared_by on public.friend_puzzles(creator_id, sent_at desc) where share_token is not null;
alter table public.friend_puzzles
  add constraint friend_puzzles_recipient_or_link
    check (recipient_id is not null or share_token is not null),
  add constraint friend_puzzles_friendship_with_recipient
    check ((friendship_id is null) = (recipient_id is null)),
  add constraint friend_puzzles_link_expires
    check (share_token is null or share_expires_at is not null);
comment on column public.friend_puzzles.share_token is 'Secret link code for a puzzle shared by link (null for puzzles sent to a friend)';
comment on column public.friend_puzzles.guest_key_hash is 'sha256 of the guest key of the browser that started it; null until started, and once saved to an account';

-- A guest's guesses have no account behind them (yet).
alter table public.friend_guesses alter column solver_id drop not null;
comment on column public.friend_guesses.solver_id is 'The account that guessed; null when played as a guest by link';

-- Drafts for "someone new" have no friendship: one open per creator.
alter table public.friend_puzzle_drafts alter column friendship_id drop not null;
create unique index friend_drafts_one_open_share
  on public.friend_puzzle_drafts(creator_id) where friendship_id is null and sent_puzzle_id is null;

-- ── Immutability, with the two share transitions ───────────────────────
--  saving to an account: recipient/friendship go from none to set, once
--  a fresh link: an unfinished, unsaved attempt goes back to not started

create or replace function public.friend_puzzles_guard() returns trigger
language plpgsql as $$
declare
  v_saving boolean := old.recipient_id is null and old.share_token is not null
    and new.recipient_id is not null and new.friendship_id is not null;
  v_resetting boolean := old.recipient_id is null and old.share_token is not null
    and old.finished_at is null and new.difficulty is null and new.cards is null
    and new.card_order is null and new.dealt_extras is null;
begin
  if new.clues is distinct from old.clues
     or new.creator_id is distinct from old.creator_id
     or new.title is distinct from old.title
     or ((new.recipient_id is distinct from old.recipient_id
          or new.friendship_id is distinct from old.friendship_id) and not v_saving) then
    raise exception 'immutable: a sent puzzle cannot be changed';
  end if;
  if (new.difficulty, new.cards, new.card_order, new.dealt_extras)
       is distinct from (old.difficulty, old.cards, old.card_order, old.dealt_extras)
     and old.difficulty is not null and not v_resetting then
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

-- ── Small helpers ──────────────────────────────────────────────────────

create or replace function public.friend_guest_key_hash(p_key text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_guest: This browser couldn''t be recognised. Reload the page and try again.';
  end if;
  return encode(extensions.digest(p_key, 'sha256'), 'hex');
end $$;

create or replace function public.friend_new_share_token() returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
$$;

-- Where a shared puzzle stands for its link, at this moment.
create or replace function public.friend_share_state(p public.friend_puzzles) returns text
language sql stable as $$
  select case
    when p.share_token is null then 'not_shared'
    when p.recipient_id is not null then 'saved'
    when p.share_revoked_at is not null then 'revoked'
    when now() >= p.share_expires_at then 'expired'
    when p.finished_at is not null then 'finished'
    when p.guest_key_hash is not null then 'playing'
    else 'waiting' end
$$;

-- What a guest's view of their game includes (the solver's view of a friend
-- puzzle, keyed by link): nothing about the answer until it's over.
create or replace function public.friend_shared_view(p public.friend_puzzles) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  a public.friend_puzzle_answers%rowtype;
  v_over boolean := p.finished_at is not null;
begin
  select * into a from public.friend_puzzle_answers where puzzle_id = p.id;
  return jsonb_build_object(
    'id', 's-' || p.share_token, 'role', 'solver', 'friendship_id', null,
    'title', p.title, 'difficulty', p.difficulty,
    'creator_name', public.friend_display_name(p.creator_id),
    'clues', case when p.difficulty is not null then p.clues end,
    'cards', p.cards, 'card_order', p.card_order,
    'sent_at', p.sent_at, 'started_at', p.started_at, 'finished_at', p.finished_at,
    'outcome', p.outcome, 'lives_used', p.lives_used,
    'max_lives', public.friend_max_lives(),
    'expires_at', p.share_expires_at,
    'guess_count', (select count(*) from public.friend_guesses where puzzle_id = p.id),
    'guesses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'guess_no', g.guess_no, 'board', g.board, 'extras', g.extras, 'clues', g.clues,
          'correct', g.correct, 'lives_left', g.lives_left, 'created_at', g.created_at)
          order by g.guess_no)
        from public.friend_guesses g where g.puzzle_id = p.id), '[]'::jsonb),
    'solution', case when v_over then
        jsonb_build_object('slotCards', a.slot_cards, 'orientations', a.orientations) end,
    'authored_cards', case when v_over then a.authored_cards end,
    'bonus_cards', case when v_over then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'card_id', x, 'dealt', case when p.dealt_extras is null then null else p.dealt_extras ? x end)
          order by n), '[]'::jsonb)
        from jsonb_array_elements_text(a.bonus_cards) with ordinality as t(x, n)) end,
    'friendship', null);
end $$;

-- ── Shared machinery (was inside send / choose / submit) ───────────────

-- Freezes a draft into a puzzle: fresh opaque card ids, a random quarter-turn
-- of each card's words, the answer adjusted to match. No recipient for a link.
create or replace function public.friend_publish_draft(
  p_draft public.friend_puzzle_drafts, p_friendship uuid, p_recipient uuid,
  p_share_token text, p_share_label text) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
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
  select jsonb_agg(upper(btrim(c #>> '{}')) order by n)
    into v_clues
    from jsonb_array_elements(p_draft.board->'clues') with ordinality as t(c, n);
  for i in 0..6 loop
    v_src := p_draft.board->'slots'->i->>'cardId';
    v_orient := (p_draft.board->'slots'->i->>'orientation')::int;
    loop
      v_new := 'k' || encode(extensions.gen_random_bytes(5), 'hex');
      exit when not (v_cards ? v_new);
    end loop;
    v_rot := floor(random() * 4)::int;
    v_words := p_draft.board->'cards'->v_src->'words';
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
    (friendship_id, creator_id, recipient_id, draft_id, title, clues,
     share_token, share_label, share_expires_at)
  values
    (p_friendship, p_draft.creator_id, p_recipient, p_draft.id, p_draft.title, v_clues,
     p_share_token, nullif(btrim(coalesce(p_share_label, '')), ''),
     case when p_share_token is not null then now() + interval '30 days' end)
  returning id into v_puzzle_id;
  insert into public.friend_puzzle_answers (puzzle_id, slot_cards, orientations, authored_cards, bonus_cards)
  values (v_puzzle_id, v_slot_cards, v_orients, v_cards, v_bonus);
  update public.friend_puzzle_drafts set sent_puzzle_id = v_puzzle_id, updated_at = now()
  where id = p_draft.id;
  return v_puzzle_id;
end $$;

-- Deals the attempt (four answer cards + the first N bonus cards, shuffled
-- once) and records the start. The caller has checked who may do this.
create or replace function public.friend_deal(p_puzzle_id uuid, p_difficulty text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_extra int := public.friend_extra_cards(p_difficulty);
  a public.friend_puzzle_answers%rowtype;
  v_dealt jsonb;
  v_ids text[];
  v_cards jsonb;
  v_order jsonb;
begin
  select * into a from public.friend_puzzle_answers where puzzle_id = p_puzzle_id;
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
  where id = p_puzzle_id;
end $$;

-- Judges one guess on a puzzle the caller has already locked and authorised.
-- p_solver is the account guessing, or null for a guest. Friend Streaks only
-- move for puzzles between friends.
create or replace function public.friend_judge_guess(
  p public.friend_puzzles, p_solver uuid,
  p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
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
  values (p.id, p_guess_no, p_solver, p_board, p_extras, p_clues, to_jsonb(v_correct), v_lives);

  if v_outcome is not null then
    update public.friend_puzzles
      set finished_at = v_now, outcome = v_outcome,
          lives_used = public.friend_max_lives() - v_lives,
          started_at = coalesce(started_at, v_now), recipient_seen_at = coalesce(recipient_seen_at, v_now)
      where id = p.id;

    if p.friendship_id is not null then
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
    end if;

    perform public.friend_enqueue_push(
      p.creator_id, 'result', 'result:' || p.id, p.friendship_id, p.id,
      format('%s finished your puzzle — see their guesses.',
        case when p_solver is null then coalesce(p.share_label, 'Your guest') else public.friend_display_name(p_solver) end),
      '/?friends=1&result=' || p.id, v_now + interval '7 days');
  end if;

  return public.friend_guess_response(p.id, p_guess_no);
end $$;

-- The guess result; streak status only between friends.
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
    'friendship', case when v_final and p.friendship_id is not null
                       then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- ── Friend puzzles: same behaviour, null-safe ownership checks ─────────

create or replace function public.send_friend_puzzle(p_draft_id uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  f public.friendships%rowtype;
  v_recipient uuid;
  v_err text;
  v_puzzle_id uuid;
begin
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is not null then
    return jsonb_build_object('puzzle_id', d.sent_puzzle_id, 'already_sent', true);
  end if;
  if d.friendship_id is null then raise exception 'not_found: That draft is for a link, not a friend.'; end if;
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
  v_puzzle_id := public.friend_publish_draft(d, f.id, v_recipient, null, null);
  perform public.friend_enqueue_push(
    v_recipient, 'new_puzzle', 'new_puzzle:' || v_puzzle_id, f.id, v_puzzle_id,
    format('%s made you a puzzle. Tap to play.', public.friend_display_name(v_uid)),
    '/?friends=1&puzzle=' || v_puzzle_id, now() + interval '7 days');
  return jsonb_build_object('puzzle_id', v_puzzle_id, 'already_sent', false);
end $$;

create or replace function public.choose_friend_difficulty(p_puzzle_id uuid, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  if public.friend_extra_cards(p_difficulty) is null then
    raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.';
  end if;
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id is distinct from v_uid then
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
  perform public.friend_deal(p.id, p_difficulty);
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

create or replace function public.submit_friend_guess(
  p_puzzle_id uuid, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  p public.friend_puzzles%rowtype;
begin
  select * into p from public.friend_puzzles where id = p_puzzle_id for update;
  if not found or p.recipient_id is distinct from v_uid then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  return public.friend_judge_guess(p, v_uid, p_guess_no, p_board, p_extras, p_clues);
end $$;

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
  if not found or (p.creator_id is distinct from v_uid and p.recipient_id is distinct from v_uid) then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_role := case when p.recipient_id = v_uid then 'solver' else 'creator' end;
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
    'solver_name', case when p.recipient_id is null then coalesce(p.share_label, 'Your guest')
                        else public.friend_display_name(p.recipient_id) end,
    'shared', p.share_token is not null and p.recipient_id is null,
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
    'friendship', case when p.friendship_id is not null then public.friend_friendship_status(p.friendship_id) end);
end $$;

-- ── Drafts: a null friendship is the creator's "someone new" draft ─────

create or replace function public.get_friend_draft(p_friendship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  if p_friendship_id is not null then
    perform public.friend_member_other(p_friendship_id, v_uid);
  else
    perform public.friend_require_profile(v_uid);
  end if;
  select * into d from public.friend_puzzle_drafts
  where friendship_id is not distinct from p_friendship_id and creator_id = v_uid and sent_puzzle_id is null;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
    'board', d.board, 'updated_at', d.updated_at);
end $$;

create or replace function public.save_friend_draft(
  p_friendship_id uuid, p_draft_id uuid, p_version int, p_title text, p_board jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
begin
  if p_friendship_id is not null then
    perform public.friend_member_other(p_friendship_id, v_uid);
  else
    perform public.friend_require_profile(v_uid);
  end if;
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
    where id = p_draft_id and creator_id = v_uid and friendship_id is not distinct from p_friendship_id
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

-- ── The sender: make a link, list links, stop sharing, fresh link ──────

create or replace function public.create_share_link(p_draft_id uuid, p_version int, p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  d public.friend_puzzle_drafts%rowtype;
  v_err text;
  v_puzzle_id uuid;
  p public.friend_puzzles%rowtype;
begin
  perform public.friend_require_profile(v_uid);
  if char_length(btrim(coalesce(p_label, ''))) > 24 then
    raise exception 'invalid_label: Keep "who it''s for" to 24 letters.';
  end if;
  select * into d from public.friend_puzzle_drafts
  where id = p_draft_id and creator_id = v_uid and friendship_id is null for update;
  if not found then raise exception 'not_found: That draft no longer exists.'; end if;
  if d.sent_puzzle_id is null then
    if p_version is distinct from d.version then
      raise exception 'draft_conflict: This puzzle was changed somewhere else. Reload to continue.';
    end if;
    v_err := public.friend_validate_board(d.board);
    if v_err is not null then raise exception 'invalid_puzzle: %', v_err; end if;
    if (select count(*) from public.friend_puzzles
        where creator_id = v_uid and share_token is not null and recipient_id is null
          and share_revoked_at is null and now() < share_expires_at) >= 20 then
      raise exception 'too_many_links: You have 20 links out. Stop sharing one to make another.';
    end if;
    v_puzzle_id := public.friend_publish_draft(d, null, null, public.friend_new_share_token(), p_label);
  else
    v_puzzle_id := d.sent_puzzle_id;   -- a double tap: the same link
  end if;
  select * into p from public.friend_puzzles where id = v_puzzle_id;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'label', p.share_label,
    'expires_at', p.share_expires_at);
end $$;

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
    from (select * from public.friend_puzzles
          where creator_id = v_uid and share_token is not null and recipient_id is null
            and share_revoked_at is null
          order by sent_at desc limit 20) p
  ), '[]'::jsonb);
end $$;

create or replace function public.stop_share_link(p_puzzle_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
begin
  update public.friend_puzzles set share_revoked_at = coalesce(share_revoked_at, now())
  where id = p_puzzle_id and creator_id = v_uid and share_token is not null and recipient_id is null;
  if not found then raise exception 'not_found: That link isn''t yours to stop.'; end if;
end $$;

-- Recovery when the person is stuck in another browser (or the link went
-- astray): a new code and a new 30 days; the old link dies; the unfinished
-- game is cleared. Refused once finished, so a result is never overwritten.
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
  update public.friend_puzzles set
    share_token = public.friend_new_share_token(), share_expires_at = now() + interval '30 days',
    guest_key_hash = null, difficulty = null, cards = null, card_order = null, dealt_extras = null,
    started_at = null, recipient_seen_at = null
  where id = p.id returning * into p;
  return jsonb_build_object('puzzle_id', p.id, 'token', p.share_token, 'expires_at', p.share_expires_at);
end $$;

-- ── The person with the link (no account needed) ───────────────────────
--  Every call needs the link code and this browser's guest key. Opening
--  only reads: it never claims, starts or marks anything.

create or replace function public.open_shared_puzzle(p_token text, p_guest_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_uid uuid := public.cluevoyance_uid();
  v_state text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into p from public.friend_puzzles where share_token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_state := public.friend_share_state(p);
  if v_state = 'revoked' then
    return jsonb_build_object('status', 'revoked', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if v_uid is not null and v_uid = p.creator_id then
    return jsonb_build_object('status', 'own', 'puzzle_id', p.id);
  end if;
  if v_state = 'saved' then
    return jsonb_build_object('status', case when p.recipient_id = v_uid then 'saved_yours' else 'saved' end,
      'puzzle_id', case when p.recipient_id = v_uid then p.id end,
      'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if v_state = 'expired' then
    return jsonb_build_object('status', 'expired', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  if p.guest_key_hash is null then
    return jsonb_build_object('status', 'available', 'creator_name', public.friend_display_name(p.creator_id),
      'title', p.title, 'max_lives', public.friend_max_lives(), 'expires_at', p.share_expires_at);
  end if;
  if p.guest_key_hash <> v_hash then
    return jsonb_build_object('status', 'taken', 'creator_name', public.friend_display_name(p.creator_id));
  end if;
  return jsonb_build_object('status', 'yours', 'puzzle', public.friend_shared_view(p));
end $$;

-- The deliberate start: claims the puzzle for this browser and deals it.
create or replace function public.start_shared_puzzle(p_token text, p_guest_key text, p_difficulty text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_state text;
begin
  if public.friend_extra_cards(p_difficulty) is null then
    raise exception 'invalid_difficulty: Choose Easy, Standard, Expert or Hardcore.';
  end if;
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if p.creator_id = public.cluevoyance_uid() then
    raise exception 'own: This is your own puzzle. Send the link to the person you made it for.';
  end if;
  v_state := public.friend_share_state(p);
  if v_state in ('revoked', 'saved') then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if v_state = 'expired' then raise exception 'expired: This link has expired.'; end if;
  if p.guest_key_hash is not null and p.guest_key_hash <> v_hash then
    raise exception 'taken: This puzzle was started in another browser.';
  end if;
  if p.difficulty is not null then
    if p.difficulty = p_difficulty then
      return jsonb_build_object('difficulty', p.difficulty, 'already_chosen', true);
    end if;
    raise exception 'difficulty_locked: You started this puzzle on %. The difficulty can''t change once you''ve started.',
      initcap(p.difficulty);
  end if;
  update public.friend_puzzles set guest_key_hash = v_hash where id = p.id;
  perform public.friend_deal(p.id, p_difficulty);
  return jsonb_build_object('difficulty', p_difficulty, 'already_chosen', false);
end $$;

create or replace function public.submit_shared_guess(
  p_token text, p_guest_key text, p_guess_no int, p_board jsonb, p_extras jsonb, p_clues jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.friend_puzzles%rowtype;
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  v_state text;
begin
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found or p.guest_key_hash is distinct from v_hash then
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  v_state := public.friend_share_state(p);
  if v_state = 'expired' then raise exception 'expired: This link has expired.'; end if;
  if v_state not in ('playing', 'finished') then raise exception 'not_found: That puzzle isn''t available.'; end if;
  return public.friend_judge_guess(p, null, p_guess_no, p_board, p_extras, p_clues);
end $$;

-- Save the finished result to the signed-in account and become friends with
-- the sender. Needs the link code AND this browser's guest key.
create or replace function public.claim_shared_puzzle(p_token text, p_guest_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.friend_require_uid();
  v_hash text := public.friend_guest_key_hash(p_guest_key);
  p public.friend_puzzles%rowtype;
  v_a uuid; v_b uuid;
  v_fid uuid;
  v_state text;
begin
  perform public.friend_require_profile(v_uid);
  select * into p from public.friend_puzzles where share_token = p_token for update;
  if not found then raise exception 'not_found: That puzzle isn''t available.'; end if;
  if p.recipient_id is not null then
    if p.recipient_id = v_uid then
      return jsonb_build_object('puzzle_id', p.id, 'friendship_id', p.friendship_id, 'already_saved', true);
    end if;
    raise exception 'not_found: That puzzle isn''t available.';
  end if;
  if p.creator_id = v_uid then raise exception 'own: This is your own puzzle.'; end if;
  if p.guest_key_hash is distinct from v_hash then raise exception 'not_found: That puzzle isn''t available.'; end if;
  v_state := public.friend_share_state(p);
  if v_state = 'expired' then raise exception 'expired: This link has expired, so the result can''t be saved.'; end if;
  if v_state <> 'finished' then raise exception 'not_finished: Finish the puzzle first.'; end if;

  v_a := least(p.creator_id, v_uid); v_b := greatest(p.creator_id, v_uid);
  select id into v_fid from public.friendships where user_a = v_a and user_b = v_b for update;
  if v_fid is null then
    insert into public.friendships (user_a, user_b) values (v_a, v_b) returning id into v_fid;
  end if;
  update public.friend_puzzles set
    friendship_id = v_fid, recipient_id = v_uid, guest_key_hash = null
  where id = p.id;
  return jsonb_build_object('puzzle_id', p.id, 'friendship_id', v_fid, 'already_saved', false);
end $$;

-- ── Privileges ─────────────────────────────────────────────────────────

revoke all on function
  public.friend_guest_key_hash(text), public.friend_new_share_token(),
  public.friend_share_state(public.friend_puzzles), public.friend_shared_view(public.friend_puzzles),
  public.friend_publish_draft(public.friend_puzzle_drafts, uuid, uuid, text, text),
  public.friend_deal(uuid, text),
  public.friend_judge_guess(public.friend_puzzles, uuid, int, jsonb, jsonb, jsonb),
  public.friend_guess_response(uuid, int),
  public.create_share_link(uuid, int, text), public.list_share_links(),
  public.stop_share_link(uuid), public.refresh_share_link(uuid),
  public.open_shared_puzzle(text, text), public.start_shared_puzzle(text, text, text),
  public.submit_shared_guess(text, text, int, jsonb, jsonb, jsonb),
  public.claim_shared_puzzle(text, text),
  public.send_friend_puzzle(uuid, int), public.choose_friend_difficulty(uuid, text),
  public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb), public.open_friend_puzzle(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, jsonb)
  from public, anon, authenticated;

-- Signed-in players (as before, plus the sender's link controls and saving).
grant execute on function
  public.send_friend_puzzle(uuid, int), public.choose_friend_difficulty(uuid, text),
  public.submit_friend_guess(uuid, int, jsonb, jsonb, jsonb), public.open_friend_puzzle(uuid),
  public.get_friend_draft(uuid), public.save_friend_draft(uuid, uuid, int, text, jsonb),
  public.create_share_link(uuid, int, text), public.list_share_links(),
  public.stop_share_link(uuid), public.refresh_share_link(uuid),
  public.claim_shared_puzzle(text, text)
  to authenticated;
-- The person with the link, signed in or not: exactly these three.
grant execute on function
  public.open_shared_puzzle(text, text), public.start_shared_puzzle(text, text, text),
  public.submit_shared_guess(text, text, int, jsonb, jsonb, jsonb)
  to anon, authenticated;
$cvmig$], '20261011090000_friend_share_links');

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
  'policies', (select string_agg(tablename||':'||policyname, ',' order by tablename, policyname) from pg_policies where schemaname='public')
) as after;
