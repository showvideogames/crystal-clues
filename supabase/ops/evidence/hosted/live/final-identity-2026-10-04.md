# Final two-game identity evidence after the email change — 2026-10-04

WorkOS Staging user `user_01M3SV4ZFENGMPAXH8NRTYYKH4`: email changed **in place** from
`samwestgames+rainbow3@gmail.com` to `samwestgames@gmail.com`, marked verified (owner's instruction),
same id, `created_at 2026-09-30T19:02:36Z` unchanged, `updated_at 2026-10-04T16:00:09Z`. Before the
change `samwestgames@gmail.com` matched no Staging user; afterwards the old address matches none.
No user was created (`tools/workos-user.mjs`; the Staging key file was deleted afterwards).

One silent sign-in on each live game refreshed the provider identity:

| Game | local_user_id | global_user_id | current email (`account_email()`, shown in the account menu) | `auth.users.email` (stale by design) | accounts with this global id |
|---|---|---|---|---|---|
| Cluevoyance `qszqparrqyhegfznyaby` | `e1dd3d7b-b2f3-4533-b11a-43cb7d6cbe9c` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` | `samwestgames@gmail.com` | `samwestgames+rainbow3@gmail.com` | 1 (accounts total 1, auth users 1) |
| Rainbow `zmauemcjcrdrgfjzkvgd` (read-only) | `0679c454-e8ba-4e9b-bf9e-b58ec32e9d52` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` | `samwestgames@gmail.com` | `samwestgames+rainbow3@gmail.com` | 1 (accounts total 1, auth users 10) |

Local ids differ; global id identical; no duplicate account in either game. Histories intact:
Cluevoyance plays 3 (`1790890621430`, `1790921298070`, `1790996707216`, all imported wins) and
`imported_losses 4`; Rainbow `game_sessions` total 290 as before (the account's own smoke sessions were
removed in Rainbow's Phase 3), ledger `0001,0002`. Files: `after-email-change.json`,
`rainbow-after-email-change.json`.

## Cluevoyance beta admin

Granted by the local-account ↔ global-identity link, never by email:
`insert into public.admins (user_id) select user_id from public.accounts where global_user_id = 'user_01M3SV4ZFENGMPAXH8NRTYYKH4'`
→ `admins = [e1dd3d7b-…]` (`admin-grant.json`). Verified on live cluevoyance.com from the signed-in
browser: `is_cluevoyance_admin → true`; Admin button rendered and the Admin screen listed the puzzles;
`POST wordbank` → 201 and the probe row deleted → 200 (`ADMINCHECKWORD`, id 2654), wordbank back to
1,080. Anonymous: `POST wordbank` 401, `DELETE puzzles` 401. Ordinary account (same session before the
grant, earlier today): 403 by row-level security.
