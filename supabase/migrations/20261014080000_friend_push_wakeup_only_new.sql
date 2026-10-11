-- ═══════════════════════════════════════════════════════════════════════
--  Fix: the outbox wake-up looped.
-- ═══════════════════════════════════════════════════════════════════════
--  notification_outbox_wakeup (20261012090000) ran after every INSERT
--  statement on the outbox — including inserts that added nothing because
--  the notification was already queued ("on conflict (dedupe_key) do
--  nothing"). push-dispatch begins each run with enqueue_deadline_reminders,
--  which re-inserts any reminder already queued for the current period. So
--  while any player with reminders on was within 3 hours of a Friend Streak
--  deadline, every run woke the next one: a self-sustaining loop of
--  push-dispatch calls (locally, ~150 a second) until the window passed.
--
--  Now the trigger looks at the rows the statement actually inserted and
--  wakes push-dispatch only when there is at least one. Nothing else
--  changes: same function, same secret, same hourly job.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.friend_outbox_wakeup() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from inserted) then
    perform public.friend_push_wakeup();
  end if;
  return null;
end $$;

drop trigger if exists notification_outbox_wakeup on public.notification_outbox;
create trigger notification_outbox_wakeup
  after insert on public.notification_outbox
  referencing new table as inserted
  for each statement execute function public.friend_outbox_wakeup();

revoke all on function public.friend_outbox_wakeup() from public, anon, authenticated;
