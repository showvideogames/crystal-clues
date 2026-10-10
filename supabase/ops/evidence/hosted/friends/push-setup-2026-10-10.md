# Web push setup on the hosted project, 2026-10-10

Approved by the owner ("Approved: notifications"). No paid service or upgrade.

- VAPID key pair and a dispatch secret generated locally (kept in the git-ignored `.runtime/push-live.json`, never printed).
- Edge Function secrets set: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (https://cluevoyance.com), PUSH_DISPATCH_SECRET.
- `push-dispatch` deployed (`--no-verify-jwt`; the function itself refuses any call without the secret). Checked: no secret → 403, wrong secret → 403, GET → 403, with secret → runs.
- Migration 20261012090000_friend_push_wakeup rehearsed (BEGIN … ROLLBACK), then applied: pg_net and pg_cron enabled, outbox wake-up trigger, hourly job `friends-push-hourly` (17 * * * *). Puzzles 61 and accounts 2 unchanged; anonymous functions unchanged.
- Vault: `push_dispatch_url`, `push_dispatch_secret`. A test wake-up reached the function (HTTP 200, nothing queued).
- Streak reminders: column default false; both profiles false.
- Vercel Production: VITE_VAPID_PUBLIC_KEY added (public by design).
