-- REHEARSAL ONLY: append to a BEGIN … ROLLBACK run, never to an apply.
-- It queues test notifications to prove when push-dispatch is woken; the
-- rollback removes them (and the wake-ups) before anything is sent.
-- Counts are of net.http_request_queue: one row = one push-dispatch wake-up.
create temp table cv_check (n serial, step text, wakeups bigint, detail text) on commit drop;
create temp table cv_user on commit drop as
  select p.id from public.profiles p
  where p.notify_results and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  limit 1;
insert into cv_check (step, wakeups, detail) select 'start', count(*), (select count(*) || ' player(s) able to receive') from net.http_request_queue, (select 1) x where (select count(*) from cv_user) >= 0;
select public.friend_enqueue_push((select id from cv_user), 'result', 'rehearsal:push-loop-check', null, null,
  'Rehearsal (rolled back)', '/', now() + interval '1 hour');
insert into cv_check (step, wakeups, detail) select '1 new notification queued', count(*),
  (select count(*) || ' outbox row(s)' from public.notification_outbox where dedupe_key = 'rehearsal:push-loop-check') from net.http_request_queue;
select public.friend_enqueue_push((select id from cv_user), 'result', 'rehearsal:push-loop-check', null, null,
  'Rehearsal (rolled back)', '/', now() + interval '1 hour');
insert into cv_check (step, wakeups, detail) select '2 same notification again (no-op)', count(*),
  (select count(*) || ' outbox row(s)' from public.notification_outbox where dedupe_key = 'rehearsal:push-loop-check') from net.http_request_queue;
insert into public.notification_outbox (user_id, kind, dedupe_key, title, body, url, tag, not_after)
  select id, 'result', 'rehearsal:never', 't', 'b', '/', 'x', now() from cv_user where false;
insert into cv_check (step, wakeups) select '3 empty insert', count(*) from net.http_request_queue;
select public.enqueue_deadline_reminders();
insert into cv_check (step, wakeups) select '4 reminder pass, as each dispatch run does', count(*) from net.http_request_queue;
-- A failed send goes back to pending by UPDATE (finish_push); the hourly job retries it.
update public.notification_outbox set status = 'pending', attempts = 1, last_error = 'rehearsal'
  where dedupe_key = 'rehearsal:push-loop-check';
insert into cv_check (step, wakeups, detail) select '5 a failed send set back to pending', count(*),
  (select count(*) || ' row(s) pending' from public.notification_outbox where status = 'pending') from net.http_request_queue;
select public.friend_push_wakeup();
insert into cv_check (step, wakeups) select '6 hourly job (retries)', count(*) from net.http_request_queue;
select step, wakeups, detail,
  (select tgtype || case when tgnewtable is not null then ' +transition table' else '' end from pg_trigger where tgname = 'notification_outbox_wakeup') as trigger
from cv_check order by n;
