-- The friendship daily-period rule and team win streak, at their edges.
-- Run with:  npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- A fixed first finish to measure from.
create temp table t0 as select timestamptz '2026-03-01 18:30:00+00' as at;

-- ── First finish starts the clock ────────────────────────────────────
select results_eq(
  $$ select anchor, last_period, streak from friend_daily_after_finish(null, null, 0, (select at from t0)) $$,
  $$ values ((select at from t0), 0, 1) $$,
  'the first finished puzzle starts the clock at streak 1');

-- ── No banking inside a period ───────────────────────────────────────
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) + interval '23:59:59.999999') $$,
  $$ values ((select at from t0), 0, 1) $$,
  'a second finish 1µs before the period ends adds nothing');
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) + interval '5 minutes') $$,
  $$ values ((select at from t0), 0, 1) $$,
  'finishing twice in the first period still counts once');

-- ── The next period ──────────────────────────────────────────────────
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) + interval '24 hours') $$,
  $$ values ((select at from t0), 1, 2) $$,
  'a finish exactly 24h after the anchor falls in period 1 and extends the streak');
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) + interval '47:59:59.999999') $$,
  $$ values ((select at from t0), 1, 2) $$,
  'a finish 1µs before the deadline still extends the streak');

-- ── Missing a whole period ───────────────────────────────────────────
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) + interval '48 hours') $$,
  $$ values ((select at from t0) + interval '48 hours', 0, 1) $$,
  'a finish exactly at the deadline is too late: new clock, streak 1');
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 4, 5, (select at from t0) + interval '7 days') $$,
  $$ values ((select at from t0) + interval '7 days', 0, 1) $$,
  'after missing periods, a 5 streak restarts at 1 from the new finish');

-- ── Banking across periods is impossible ─────────────────────────────
-- Three finishes in period 0, then nothing in period 1, then one in period 2.
create temp table banked as
  with a as (select * from friend_daily_after_finish(null, null, 0, (select at from t0))),
       b as (select s.* from a, friend_daily_after_finish(a.anchor, a.last_period, a.streak, (select at from t0) + interval '1 hour') s),
       c as (select s.* from b, friend_daily_after_finish(b.anchor, b.last_period, b.streak, (select at from t0) + interval '2 hours') s),
       d as (select s.* from c, friend_daily_after_finish(c.anchor, c.last_period, c.streak, (select at from t0) + interval '50 hours') s)
  select * from d;
select results_eq($$ select streak from banked $$, $$ values (1) $$,
  'extra finishes in one period do not cover a missed period');

-- ── What both friends see ────────────────────────────────────────────
select results_eq(
  $$ select streak, deadline_at, done_this_period, next_period_at
     from friend_daily_status((select at from t0), 0, 1, (select at from t0) + interval '1 hour') $$,
  $$ values (1, (select at from t0) + interval '48 hours', true, (select at from t0) + interval '24 hours') $$,
  'just after the first finish: safe this period, deadline 48h after the anchor');
select results_eq(
  $$ select streak, done_this_period
     from friend_daily_status((select at from t0), 0, 1, (select at from t0) + interval '24 hours') $$,
  $$ values (1, false) $$,
  'at exactly 24h the new period has begun and needs a finish');
select results_eq(
  $$ select streak from friend_daily_status((select at from t0), 0, 1,
       (select at from t0) + interval '47:59:59.999999') $$,
  $$ values (1) $$,
  'the streak is still alive 1µs before the deadline');
select results_eq(
  $$ select streak, deadline_at, done_this_period
     from friend_daily_status((select at from t0), 0, 1, (select at from t0) + interval '48 hours') $$,
  $$ values (0, null::timestamptz, false) $$,
  'at the deadline the streak shows 0 with no deadline');
select results_eq(
  $$ select streak, deadline_at
     from friend_daily_status((select at from t0), 3, 4, (select at from t0) + interval '3 days 2 hours') $$,
  $$ values (4, (select at from t0) + interval '5 days') $$,
  'a 4 streak last counted in period 3 must be kept by anchor + 5 × 24h');
select results_eq(
  $$ select streak, deadline_at, done_this_period
     from friend_daily_status(null, null, 0, now()) $$,
  $$ values (0, null::timestamptz, false) $$,
  'a friendship with no finished puzzle has no streak and no deadline');

-- ── Independent of time zones and daylight saving ────────────────────
set local timezone = 'America/Denver';
-- US clocks spring forward on 2026-03-08. Periods stay exactly 24 elapsed hours.
select is(
  extract(epoch from (
    (select deadline_at from friend_daily_status(timestamptz '2026-03-07 12:00 America/Denver', 0, 1,
                                                  timestamptz '2026-03-07 13:00 America/Denver'))
    - timestamptz '2026-03-07 12:00 America/Denver'))::bigint,
  48 * 3600::bigint,
  'across a DST change the deadline is exactly 48 elapsed hours after the anchor');
select is(
  (select deadline_at from friend_daily_status(timestamptz '2026-03-07 12:00 America/Denver', 0, 1,
                                                timestamptz '2026-03-07 13:00 America/Denver')),
  timestamptz '2026-03-09 13:00 America/Denver',
  'shown in Denver the deadline moves from 12:00 to 13:00 local after the change');
create temp table denver as
  select * from friend_daily_status((select at from t0), 2, 3, (select at from t0) + interval '60 hours');
set local timezone = 'Pacific/Kiritimati';
select results_eq(
  $$ select streak, deadline_at, done_this_period, next_period_at
     from friend_daily_status((select at from t0), 2, 3, (select at from t0) + interval '60 hours') $$,
  $$ select streak, deadline_at, done_this_period, next_period_at from denver $$,
  'the session time zone (UTC-7 vs UTC+14) does not change anything');
select is(
  friend_period_index(timestamptz '2026-03-01 23:30:00-08', timestamptz '2026-03-02 23:29:59-08'),
  0, 'period index ignores calendar dates: 23h59m later is still period 0');
set local timezone = 'UTC';

-- ── Clock edge: a finish stamped before the anchor ───────────────────
select results_eq(
  $$ select anchor, last_period, streak
     from friend_daily_after_finish((select at from t0), 0, 1, (select at from t0) - interval '1 second') $$,
  $$ values ((select at from t0), 0, 1) $$,
  'a finish stamped before the anchor never double counts');

-- ── Team win streak ──────────────────────────────────────────────────
select is(friend_team_after_finish(0, 'won'), 1, 'first win makes 1');
select is(friend_team_after_finish(11, 'won'), 12, 'wins by either friend add up (6 + 6 = 12)');
select is(friend_team_after_finish(12, 'lost'), 0, 'a loss by either friend resets to 0');
select is(friend_team_after_finish(null, 'won'), 1, 'null counts as 0');

-- ── Difficulty → bonus cards dealt, same as the daily game ───────────
select is(friend_extra_cards('easy'), 0, 'easy shows no decoys');
select is(friend_extra_cards('standard'), 1, 'standard shows 1 decoy');
select is(friend_extra_cards('expert'), 2, 'expert shows 2 decoys');
select is(friend_extra_cards('hardcore'), 3, 'hardcore shows 3 decoys');

-- ── Board validation: one complete puzzle, 4 answer + 3 bonus cards ──
create temp table good as select jsonb_build_object(
  'clues', '["A","B","C","D"]'::jsonb,
  'cards', '{"x1":{"id":"x1","words":["A","B","C","D"]},"x2":{"id":"x2","words":["E","F","G","H"]},
             "x3":{"id":"x3","words":["I","J","K","L"]},"x4":{"id":"x4","words":["M","N","O","P"]},
             "x5":{"id":"x5","words":["Q","R","S","T"]},"x6":{"id":"x6","words":["U","V","W","X"]},
             "x7":{"id":"x7","words":["Y","Z","AA","BB"]}}'::jsonb,
  'slots', '[{"cardId":"x1","orientation":0},{"cardId":"x2","orientation":1},{"cardId":"x3","orientation":2},
             {"cardId":"x4","orientation":3},{"cardId":"x5","orientation":0},{"cardId":"x6","orientation":0},
             {"cardId":"x7","orientation":0}]'::jsonb) as b;
select is(friend_validate_board((select b from good)), null, 'a complete seven-card puzzle can be sent');
select is(friend_validate_board(jsonb_set((select b from good), '{cards,x7,words,2}', '""')),
  'Every edge of the three bonus cards needs a word.', 'every bonus card must be finished, whatever the player picks later');
select is(friend_validate_board(jsonb_set((select b from good), '{cards,x2,words,0}', '" "')),
  'Every edge of the four answer cards needs a word.', 'answer cards must be finished');
select is(friend_validate_board(jsonb_set((select b from good), '{slots}', ((select b from good)->'slots') - 6)),
  'A puzzle has four answer cards and three bonus cards.', 'six cards is not a puzzle');
select is(friend_validate_board(jsonb_set((select b from good), '{clues,2}', '"  "')),
  'Every side needs a clue.', 'a blank clue blocks sending');
select is(friend_validate_board(jsonb_set((select b from good), '{clues,0}', '"ABCDEFGHIJKLMNOPQRSTU"')),
  'Clues can be up to 20 letters.', 'an over-long clue blocks sending');
select is(friend_validate_board(jsonb_set((select b from good), '{slots,5,cardId}', '"x1"')),
  'The board has a missing card.', 'the same card twice blocks sending');
select is(friend_validate_board(jsonb_set((select b from good), '{slots,0,orientation}', '7')),
  'The board has a card in an unknown position.', 'a bad orientation blocks sending');
select is(friend_validate_board('{}'::jsonb), 'The puzzle is incomplete.', 'an empty board blocks sending');

select * from finish();
rollback;
