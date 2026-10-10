-- ═══════════════════════════════════════════════════════════════════════
--  Optional web push: the database wakes the sender itself.
-- ═══════════════════════════════════════════════════════════════════════
--  Notifications are queued in notification_outbox, in the same transaction
--  as the event (a puzzle sent, a puzzle finished — by a friend or a guest
--  by link), and only for players who turned notifications on for a device.
--  Until now the player's browser poked the push-dispatch Edge Function
--  afterwards; a guest can't, and nothing retried. Now:
--
--  • After any insert into the outbox, the database asks push-dispatch to
--    run (pg_net: a background HTTP call after the transaction commits, so
--    sending or playing never waits for it and never fails because of it).
--  • Once an hour the same call runs anyway: failed sends are retried and
--    the optional Friend Streak reminder (about 3 hours before a deadline,
--    for players who chose it) is queued.
--  • The call carries a shared secret; push-dispatch refuses anything
--    without it, so no browser can trigger it. The function's address and
--    the secret are kept in the database's encrypted Vault as
--    push_dispatch_url / push_dispatch_secret. Until both exist, nothing is
--    called: this migration is inert on its own.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.friend_push_wakeup() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if v_url is null or v_secret is null then
    return;   -- push not set up here
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'friend_push_wakeup skipped: %', sqlerrm;   -- push must never block play
end $$;

create or replace function public.friend_outbox_wakeup() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.friend_push_wakeup();
  return null;
end $$;

drop trigger if exists notification_outbox_wakeup on public.notification_outbox;
create trigger notification_outbox_wakeup
  after insert on public.notification_outbox
  for each statement execute function public.friend_outbox_wakeup();

-- Hourly: retries and the optional reminder. (Named job: re-running updates it.)
select cron.schedule('friends-push-hourly', '17 * * * *', 'select public.friend_push_wakeup()');

revoke all on function public.friend_push_wakeup(), public.friend_outbox_wakeup() from public, anon, authenticated;
