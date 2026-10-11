# Push wake-up loop fix on the hosted project, 2026-10-11

Approved by the owner ("I approve the read-only live check through authorized access … I also approve applying the narrowly scoped push-loop fix after a rollback rehearsal"). Project qszqparrqyhegfznyaby. Run with the Supabase CLI's own login (`supabase db query --linked --project-ref …`), wrapped like `tools/hosted.mjs`.

## The problem

`notification_outbox_wakeup` (migration 20261012090000) ran after every INSERT statement on the outbox, including ones that inserted nothing because the notification was already queued (`on conflict (dedupe_key) do nothing`). push-dispatch starts each run with `enqueue_deadline_reminders()`, which re-inserts an already-queued reminder for the current period. So once a reminder was queued, each run woke the next one until the 3-hour window closed. On the local stack this ran at ~150 wake-ups a second.

## Read-only check before (20:2x UTC)

| | live |
|---|---|
| queued wake-ups (net.http_request_queue) | 0 |
| push-dispatch calls in pg_net's log (kept since 15:17 UTC) | 7, 1 in the last hour |
| outbox | new_puzzle/sent 16, result/sent 17 (nothing pending or failed) |
| players with reminders on / push devices | 2 / 4 |
| streaks inside the 3-hour reminder window | 0 |

No loop was running, but it would have started with the first reminder.

## Rehearsals (both `begin; … rollback;`), with `friends-push-loop-fix-check.sql`

Wake-ups queued after each step (cumulative):

| step | A: current trigger | B: with the fix |
|---|---|---|
| start | 0 | 0 |
| 1 a new notification | 1 | 1 |
| 2 the same notification again (no-op) | **2** | 1 |
| 3 an insert of no rows | **3** | 1 |
| 4 a reminder pass, as each dispatch run does | 3 | 1 |
| 5 a failed send set back to pending (UPDATE, as finish_push does) | 3 | 1 |
| 6 the hourly job (retries) | 4 | 2 |

After the rollbacks: old trigger, ledger ending 20261013090000, 0 queued wake-ups, 0 rehearsal rows.

## Applied

`supabase/ops/hosted/friends-push-loop-fix-install.sql` as `begin; … commit;`: trigger now `referencing new table as inserted`, ledger `…,20261013090000,20261014080000`, 0 queued wake-ups. No table, data, grant or policy changes.

## After

One wake-up through `friend_push_wakeup()` (what the hourly job does): push-dispatch replied 200 `{"reminders":0,"sent":0,"skipped":0,"retry":0,"gone":0}`. pg_net request ids went 58 (20:17 hourly run) → 65 (this call): ids 59–64 were taken by the rehearsals' rolled-back wake-ups, none of which was sent.

Existing queue: nothing was pending, failed or queued, so nothing was resent or deleted. Wake-up rows carry no notification content (push-dispatch reads the outbox); real notifications live only in `notification_outbox` and were not touched.

Not yet observed live: a real notification delivered to a phone after the fix (the owner's "Test" link or a real puzzle will show it).
