# Beta open admin install on the hosted project, 2026-10-12

Approved by the owner ("Approved for all five steps. Proceed with the dry run, then apply and deploy if it confirms exactly the permissions described"). Project qszqparrqyhegfznyaby. Run with the Supabase CLI's own login (`supabase db query --linked --project-ref … --output-format json`), wrapped like `tools/hosted.mjs`.

Scripts: `supabase/ops/hosted/beta-open-admin-install.sql` (migration 20261015090000_beta_open_puzzle_admin and its ledger row), `beta-open-admin-snapshot.sql`, `beta-open-admin-check.sql`.

1. **Before**: read-only snapshot.
2. **Rehearsal**: install + check inside `begin; … rollback;`, and install + snapshot inside `begin; … rollback;`. A snapshot afterwards was identical to before.
3. **Applied** as `begin; … commit;`.
4. **After**: snapshot identical to the rehearsal's; the check (rolled back) gave the same 61 results.

## Snapshot

| | before | after |
|---|---|---|
| ledger | …,20261014080000,20261014090000 | …,20261014090000,**20261015090000** |
| puzzles / fingerprint | 63 / 30a01398… | 63 / 30a01398… |
| plays / fingerprint | 21 / 32d5d4e1… | 21 / 32d5d4e1… |
| wordbank / fingerprint | 1080 / 78fbfa8b… | 1080 / 78fbfa8b… |
| accounts / admins / profiles / friend_puzzles | 5 / 1 / 5 / 46 | 5 / 1 / 5 / 46 |
| tables without RLS | none | none |
| policies | 17 | 23 (the six `*_beta_open_*` on puzzles and wordbank) |
| policies on every other table (fingerprint) | 0dd59730… | 0dd59730… |
| anon table grants | puzzles:SELECT, wordbank:SELECT | puzzles and wordbank: SELECT, INSERT, UPDATE, DELETE |
| authenticated table grants | unchanged | unchanged |
| anon functions | …,ping,save_shared_moves,… | adds **puzzle_has_plays** |
| authenticated functions (other than puzzle_has_plays) | c93e8a5d… | c93e8a5d… |

`puzzles_beta_open_delete` uses `NOT puzzle_has_plays(id)`: a puzzle with play history can't be deleted through the open policies.

## Check (disposable puzzles -424242 with one disposable play, -424243 without; rolled back)

| role | check | result |
|---|---|---|
| anon | read accounts, admins, plays, profiles, friendships, friend_invites, friend_puzzles, friend_puzzle_drafts, friend_puzzle_answers, friend_guesses, friend_move_logs, push_subscriptions, notification_outbox | permission denied (all) |
| anon | write privileges on those tables | none (all) |
| authenticated (no account) | write privileges on those tables | none (all) |
| authenticated (no account) | reads | accounts, admins, friend_move_logs, notification_outbox: permission denied; the rest: 0 rows visible (own-rows policies, as before) |
| anon, authenticated | puzzle_has_plays(test played) | true |
| anon, authenticated | delete test played puzzle | 0 rows deleted |
| anon, authenticated | move test played puzzle to unused | 1 row updated |
| anon, authenticated | test played puzzle + its play afterwards | 1 puzzle, 1 play |
| anon | delete test unplayed puzzle | 1 row deleted |

No existing puzzle, play, word, account, Friends row or other permission changed.
