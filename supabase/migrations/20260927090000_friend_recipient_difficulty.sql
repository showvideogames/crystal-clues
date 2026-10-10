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
