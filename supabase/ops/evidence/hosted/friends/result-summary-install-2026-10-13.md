# Result-summary install on the hosted project, 2026-10-13

Approved by the owner ("Approved for steps 1–3: apply the read-only aggregate-stats migration, verify anonymous access returns only the intended counts and private plays remain inaccessible, then push…"). Project qszqparrqyhegfznyaby, Supabase CLI's own login (`supabase db query --linked --project-ref … --output-format json`).

Scripts: `supabase/ops/hosted/result-summary-install.sql` (migration 20261016090000_puzzle_result_summary and its ledger row), `result-summary-check.sql` (rolled back), `beta-open-admin-snapshot.sql` (read-only), undo `result-summary-rollback.sql`.

1. **Before**: read-only snapshot.
2. **Rehearsal**: install + check inside `begin; … rollback;`; a snapshot afterwards was identical to before.
3. **Applied** as `begin; … commit;`.
4. **After**: snapshot; the check again (rolled back) gave the same results as the rehearsal.

## Snapshot

| | before | after |
|---|---|---|
| ledger | 0001,20260926090000,20260927090000,20261011090000,20261012090000,20261013090000,20261014080000,20261014090000,20261015090000 | 0001,20260926090000,20260927090000,20261011090000,20261012090000,20261013090000,20261014080000,20261014090000,20261015090000,20261016090000 |
| puzzles / fingerprint | 64 / 19e05243… | 64 / 19e05243… |
| plays / fingerprint | 26 / 7bcea9cc… | 26 / 7bcea9cc… |
| wordbank / fingerprint | 1196 / 1587d7d2… | 1196 / 1587d7d2… |
| accounts / admins / profiles / friend_puzzles | 6 / 1 / 6 / 65 | 6 / 1 / 6 / 65 |
| tables without RLS | none | none |
| policies (count / other-tables fingerprint) | 23 / 0dd59730… | 23 / 0dd59730… |
| anon table grants | puzzles:DELETE,puzzles:INSERT,puzzles:SELECT,puzzles:UPDATE,wordbank:DELETE,wordbank:INSERT,wordbank:SELECT,wordbank:UPDATE | puzzles:DELETE,puzzles:INSERT,puzzles:SELECT,puzzles:UPDATE,wordbank:DELETE,wordbank:INSERT,wordbank:SELECT,wordbank:UPDATE |
| authenticated table grants | unchanged | unchanged |
| anon functions | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,puzzle_has_plays,save_shared_moves,start_shared_puzzle,submit_shared_guess | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,puzzle_has_plays,puzzle_result_summary,save_shared_moves,start_shared_puzzle,submit_shared_guess |
| authenticated functions (fingerprint) | c93e8a5d… | 368e1619… (adds puzzle_result_summary) |

## Check (disposable puzzle -424250 with 3 disposable plays; rolled back)

| role | check | result |
|---|---|---|
| setup | disposable plays | 3 |
| anon | summary(test, standard) | {"players":3,"solved":2,"lives_0":1,"lives_1":0,"lives_2":1,"not_solved":1} |
| anon | summary(test, hardcore) | {"players":0,"solved":0,"lives_0":0,"lives_1":0,"lives_2":0,"not_solved":0} |
| anon | read plays | permission denied for table plays |
| anon | read test plays | permission denied for table plays |
| authenticated | summary(test, standard) | {"players":3,"solved":2,"lives_0":1,"lives_1":0,"lives_2":1,"not_solved":1} |
| authenticated | summary(test, hardcore) | {"players":0,"solved":0,"lives_0":0,"lives_1":0,"lives_2":0,"not_solved":0} |
| authenticated | read plays | 0 rows visible |
| authenticated | read test plays | 0 rows visible |
| catalog | summary result columns | players,solved,lives_0,lives_1,lives_2,not_solved |
| catalog | plays grants (anon / authenticated) | authenticated:SELECT |
| catalog | plays policies | plays_read_own [SELECT to authenticated] (user_id = cluevoyance_uid()) |

Only the six counts come back; nothing identifies a player. `plays` keeps its own-rows policy and its grants (anon: none). No puzzle, play, word, account or Friends row changed.
