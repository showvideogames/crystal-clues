# Move logs (animated replay) install on the hosted project, 2026-10-11

Approved by the owner ("I approve the replay database change and deployment … apply the migration safely, then merge and deploy"). Project qszqparrqyhegfznyaby. Run with the Supabase CLI's own login (`supabase db query --linked --project-ref …`), wrapped like `tools/hosted.mjs`.

Script: `supabase/ops/hosted/friends-move-logs-install.sql` (migration 20261014090000_friend_move_logs, its ledger row, and the snapshot in `friends-move-logs-snapshot.sql`).

1. **Before** (read-only snapshot).
2. **Rehearsal**: install + `friends-move-logs-check.sql` inside `begin; … rollback;`. Afterwards the snapshot was byte-for-byte identical to before.
3. **Applied** as `begin; … commit;`.
4. **Permissions after**: the same check, rolled back.

## Snapshot

| | before | after |
|---|---|---|
| ledger | …,20261013090000,20261014080000 | …,20261013090000,20261014080000,**20261014090000** |
| friend_move_logs table / RLS / policies | none | 1 / on / 0 |
| friend_puzzles / finished / guesses | 35 / 31 / 70 | 35 / 31 / 70 |
| results fingerprint (outcome, lives, viewed timestamps) | 88aa0f15… | 88aa0f15… |
| friendships fingerprint (streaks) | 90c2995b… | 90c2995b… |
| outbox | 33 | 33 |
| policies | 17 | 17 |
| anon/authenticated table grants | unchanged | unchanged |
| anon functions | …,open_shared_puzzle,ping,start_shared_puzzle,submit_shared_guess | adds **save_shared_moves** |
| authenticated move functions | refresh_share_link | adds **get_friend_moves, save_friend_moves, save_shared_moves** |

## Who can call what (after; check rolled back)

| role | call | result |
|---|---|---|
| anon | get_friend_moves | permission denied |
| anon | save_friend_moves | permission denied |
| anon | save_shared_moves (unknown link) | not_found (allowed, needs link + guest key) |
| anon | friend_append_moves (internal) | permission denied |
| anon | select friend_move_logs | permission denied |
| authenticated | get_friend_moves (no account) | not_signed_in (allowed; checks the caller) |
| authenticated | friend_append_moves (internal) | permission denied |
| authenticated | select friend_move_logs | permission denied |

No existing rows, results, streaks, notifications, grants or policies changed. Existing finished puzzles have no move log, so they keep the guess-by-guess replay.
