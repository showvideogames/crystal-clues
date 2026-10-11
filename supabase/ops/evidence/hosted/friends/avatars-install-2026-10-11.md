# Profile avatars install on the hosted project, 2026-10-11

Approved by the owner ("I approve the avatar/green-dot database update and deployment, including the corrected stopped-link behavior"). Project qszqparrqyhegfznyaby.

Script: `supabase/ops/hosted/friends-avatars-install.sql` (migration 20261013090000_profile_avatars plus its ledger row). Run through the Supabase Management API query endpoint using the Supabase CLI's own login (`supabase db query --linked --project-ref …`), because the token saved for `tools/hosted.mjs` was rejected as invalid. Same wrapping as `tools/hosted.mjs`: rehearsed as `begin; … rollback;` (the database was identical to before afterwards), then applied as `begin; … commit;`. The CLI sets up its usual short-lived login role for linked queries.

Before: no `profiles.avatar` column (the snapshot's `profiles_with_avatar` line was left out, since the column didn't exist yet).

| | before | after |
|---|---|---|
| accounts | 5 | 5 |
| admins | 1 | 1 |
| anon_functions | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,start_shared_puzzle,submit_shared_guess | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,start_shared_puzzle,submit_shared_guess |
| anon_functions_all | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,start_shared_puzzle,submit_shared_guess | cluevoyance_uid,get_friend_invite,is_cluevoyance_admin,open_shared_puzzle,ping,start_shared_puzzle,submit_shared_guess |
| anon_table_grants | puzzles:SELECT,wordbank:SELECT | puzzles:SELECT,wordbank:SELECT |
| authenticated_functions | none | get_friend_avatars,set_avatar |
| authenticated_table_grants | friend_guesses:SELECT,friend_invites:SELECT,friend_puzzle_answers:SELECT,friend_puzzle_drafts:SELECT,friend_puzzles:SELECT,friendships:SELECT,plays:SELECT,profiles:SELECT,push_subscriptions:SELECT,puzzles:DELETE,puzzles:INSERT,puzzles:SELECT,puzzles:UPDATE,wordbank:DELETE,wordbank:INSERT,wordbank:SELECT,wordbank:UPDATE | friend_guesses:SELECT,friend_invites:SELECT,friend_puzzle_answers:SELECT,friend_puzzle_drafts:SELECT,friend_puzzles:SELECT,friendships:SELECT,plays:SELECT,profiles:SELECT,push_subscriptions:SELECT,puzzles:DELETE,puzzles:INSERT,puzzles:SELECT,puzzles:UPDATE,wordbank:DELETE,wordbank:INSERT,wordbank:SELECT,wordbank:UPDATE |
| avatar_column | none | avatar:text |
| friend_tables | 9 | 9 |
| friend_tables_without_rls | 0 | 0 |
| ledger | 0001,20260926090000,20260927090000,20261011090000,20261012090000 | 0001,20260926090000,20260927090000,20261011090000,20261012090000,20261013090000 |
| plays | 20 | 20 |
| policies | friend_guesses:guesses_solver_or_finished_creator,friend_invites:invites_own,friend_puzzle_answers:answers_creator_or_finished_solver,friend_puzzle_drafts:drafts_own,friend_puzzles:puzzles_party,friendships:friendships_member,plays:plays_read_own,profiles:profiles_own,push_subscriptions:push_own,puzzles:puzzles_admin_delete,puzzles:puzzles_admin_insert,puzzles:puzzles_admin_update,puzzles:puzzles_read_all,wordbank:wordbank_admin_delete,wordbank:wordbank_admin_insert,wordbank:wordbank_admin_update,wordbank:wordbank_read_all | friend_guesses:guesses_solver_or_finished_creator,friend_invites:invites_own,friend_puzzle_answers:answers_creator_or_finished_solver,friend_puzzle_drafts:drafts_own,friend_puzzles:puzzles_party,friendships:friendships_member,plays:plays_read_own,profiles:profiles_own,push_subscriptions:push_own,puzzles:puzzles_admin_delete,puzzles:puzzles_admin_insert,puzzles:puzzles_admin_update,puzzles:puzzles_read_all,wordbank:wordbank_admin_delete,wordbank:wordbank_admin_insert,wordbank:wordbank_admin_update,wordbank:wordbank_read_all |
| profiles | 5 | 5 |
| profiles_with_avatar | — | 0 |
| puzzles | 62 | 62 |
| puzzles_fingerprint | 6c51e15e634bd4b9bfbc0ba591d660e9 | 6c51e15e634bd4b9bfbc0ba591d660e9 |
| wordbank | 1080 | 1080 |

Added: `profiles.avatar` (nullable; null = the default initialed crystal ball, so every existing player keeps it); `set_avatar(text)` and `get_friend_avatars()`, executable by authenticated only (anon refused). Replaced in place, grants kept: `get_my_profile`, `get_friend_invite` (now also `inviter_avatar`), `list_share_links` (a stopped or expired link keeps its finished result listed, unread until the sender opens it). `stop_share_link` is unchanged. Content, accounts, plays, table grants, anon functions and policies are unchanged.
