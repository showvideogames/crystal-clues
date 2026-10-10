# Share-links (guest play) install on the hosted project, 2026-10-10

Approved by the owner ("Approved: guest links"). Rehearsed inside BEGIN … ROLLBACK, then applied in one transaction with `supabase/ops/hosted/friends-share-links-install.sql`.

| | before | after |
|---|---|---|
| accounts | 2 | 2 |
| admins | 1 | 1 |
| anon_functions | cluevoyance_uid, get_friend_invite, is_cluevoyance_admin, ping | cluevoyance_uid, get_friend_invite, is_cluevoyance_admin, open_shared_puzzle, ping, start_shared_puzzle, submit_shared_guess |
| anon_functions_all | cluevoyance_uid, get_friend_invite, is_cluevoyance_admin, ping | cluevoyance_uid, get_friend_invite, is_cluevoyance_admin, open_shared_puzzle, ping, start_shared_puzzle, submit_shared_guess |
| anon_table_grants | puzzles:SELECT, wordbank:SELECT | puzzles:SELECT, wordbank:SELECT |
| authenticated_table_grants | friend_guesses:SELECT, friend_invites:SELECT, friend_puzzle_answers:SELECT, friend_puzzle_drafts:SELECT, friend_puzzles:SELECT, friendships:SELECT, plays:SELECT, profiles:SELECT, push_subscriptions:SELECT, puzzles:DELETE, puzzles:INSERT, puzzles:SELECT, puzzles:UPDATE, wordbank:DELETE, wordbank:INSERT, wordbank:SELECT, wordbank:UPDATE | friend_guesses:SELECT, friend_invites:SELECT, friend_puzzle_answers:SELECT, friend_puzzle_drafts:SELECT, friend_puzzles:SELECT, friendships:SELECT, plays:SELECT, profiles:SELECT, push_subscriptions:SELECT, puzzles:DELETE, puzzles:INSERT, puzzles:SELECT, puzzles:UPDATE, wordbank:DELETE, wordbank:INSERT, wordbank:SELECT, wordbank:UPDATE |
| friend_tables | 9 | 9 |
| friend_tables_without_rls | 0 | 0 |
| ledger | 0001, 20260926090000, 20260927090000 | 0001, 20260926090000, 20260927090000, 20261011090000 |
| plays | 19 | 19 |
| policies | friend_guesses:guesses_solver_or_finished_creator, friend_invites:invites_own, friend_puzzle_answers:answers_creator_or_finished_solver, friend_puzzle_drafts:drafts_own, friend_puzzles:puzzles_party, friendships:friendships_member, plays:plays_read_own, profiles:profiles_own, push_subscriptions:push_own, puzzles:puzzles_admin_delete, puzzles:puzzles_admin_insert, puzzles:puzzles_admin_update, puzzles:puzzles_read_all, wordbank:wordbank_admin_delete, wordbank:wordbank_admin_insert, wordbank:wordbank_admin_update, wordbank:wordbank_read_all | friend_guesses:guesses_solver_or_finished_creator, friend_invites:invites_own, friend_puzzle_answers:answers_creator_or_finished_solver, friend_puzzle_drafts:drafts_own, friend_puzzles:puzzles_party, friendships:friendships_member, plays:plays_read_own, profiles:profiles_own, push_subscriptions:push_own, puzzles:puzzles_admin_delete, puzzles:puzzles_admin_insert, puzzles:puzzles_admin_update, puzzles:puzzles_read_all, wordbank:wordbank_admin_delete, wordbank:wordbank_admin_insert, wordbank:wordbank_admin_update, wordbank:wordbank_read_all |
| puzzles | 61 | 61 |
| puzzles_fingerprint | 4200d611477390444e3333520eccd05d | 4200d611477390444e3333520eccd05d |
| wordbank | 1080 | 1080 |

Friends data before = after: 1 friendship (streaks 1/3), 2 profiles, 4 friend puzzles (fingerprint c55d06e6…), 6 guesses, 4 drafts. Content, accounts, plays and every table grant unchanged. Added for anon: exactly open_shared_puzzle, start_shared_puzzle, submit_shared_guess (each needs the link code and the browser's guest key).
