# Local smoke against WorkOS Staging — 2026-10-04

Real OpenID round trip through a disposable WorkOS **Staging** application
(`cluevoyance-local`, redirect `http://127.0.0.1:55421/auth/v1/callback`,
removed afterwards, HTTP 204) into the LOCAL Cluevoyance stack
(`supabase/config.toml`, baseline `0001`, seed). Branch `feat/workos-accounts`
at `5f57d74`. Nothing hosted was touched: not the Cluevoyance Supabase
project, not Vercel, not WorkOS Production, not Rainbow.

Test person: the Staging identity `samwestgames+rainbow3@gmail.com`
(WorkOS id `user_01M3SV4ZFENGMPAXH8NRTYYKH4`), which already holds a Rainbow
account. Deb typed the password on the hosted page once; every later sign-in
was silent (the Staging session was reused). The app ran in the desktop
app's browser pane; database rows were read with psql on the local container
after each step.

## C1 — new account, guest history, Add my progress

Guest keys seeded before sign-in: two wins (puzzles 1700000000001 standard/1
life, 1700000000002 expert/0 lives) and counters showing 4 played, 2 won,
X = 2.

After the hosted sign-in returned to `/auth/callback` → `/`:

```
accounts | cd680275-ef9f-49fa-8d52-41991b6a056d | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | samwestgames+rainbow3@gmail.com | imported_losses 0 | 2026-10-04 14:29:47+00
identities | cd680275-… | custom:platform | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | samwestgames+rainbow3@gmail.com
auth_users 1 | accounts 1 | plays 0
```
The import prompt showed "2 wins out of 4 games, best streak 2". After **Add my progress**:
```
plays | cd680275-… | 1700000000001 | 2026-10-03 | solved | 1 | standard | import | 2026-10-03 10:00:00+00
plays | cd680275-… | 1700000000002 | 2026-10-02 | solved | 0 | expert   | import | 2026-10-02 10:00:00+00
account | cd680275-… | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | imported_losses 2
counts: accounts 1 | auth_users 1 | plays 2
```
Browser: prompt gone; `clover_completions`/`clover_stats` removed; `cv_account_plays`
mirrors the two rows; `cv-auth` holds no `provider_token`.

## C3 — returning identity

Sign out (menu) → localStorage empty → guest history seeded again (1 win on
today's puzzle, 2 losses) → **Sign in** → returned within 8 s with no hosted
page (Staging session reused) → prompt shown for the new guest history.
```
account | cd680275-ef9f-49fa-8d52-41991b6a056d | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | imported_losses 2 | created 14:29:47 | last_seen 14:30:53
counts: accounts 1 | auth_users 1 | identities 1 | plays 2 | sessions 1
```
Same local account, no duplicate; the previous session was revoked by the
local sign-out (one live session).

## C2 — Start fresh

**Start fresh** on that prompt → prompt gone, guest keys cleared, cache still 2
plays; a reload shows no prompt.
```
account | cd680275-… | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | imported_losses 2
plays   | 1700000000001 import ; 1700000000002 import
counts: accounts 1 | plays 2 | admins 0
```
Nothing from the second guest history reached the account.

## Admin gate (database-enforced)

From the signed-in browser, with the session's own token, bypassing the UI
(no Admin button was rendered):
```
POST wordbank (signed-in, not admin)  → 403 "new row violates row-level security policy for table wordbank"
POST wordbank (anon)                  → 401 "permission denied" (no INSERT grant)
DELETE puzzles?id=eq.1700000000000    → 200, [] (zero rows); the puzzle is still there
```
Then `insert into public.admins …` for the account; reload:
```
Admin button rendered
POST wordbank (same session)   → 201
DELETE wordbank?word=eq.SMOKEADMINTEST → 200, [{"word":"SMOKEADMINTEST"}]
```

## C4 — delete, then sign in again

Menu → Delete account… → Delete:
```
after_delete: accounts 0 | auth_users 0 | identities 0 | plays 0 | admins 0 | sessions 0
content: puzzles 3 | wordbank 180   (unchanged)
```
Browser back to a guest (Sign in button, no Admin, localStorage empty).
**Sign in** again → silent → a new account:
```
recreated_account | 397f0649-82cb-40fa-8978-1a30fbc3262b | user_01M3SV4ZFENGMPAXH8NRTYYKH4 | samwestgames+rainbow3@gmail.com | imported_losses 0 | 14:32:55
identity | 397f0649-… | custom:platform | user_01M3SV4ZFENGMPAXH8NRTYYKH4
counts: accounts 1 | auth_users 1 | plays 0 | admins 0
```
One clean account, new local id, same global id, admin rights not carried over.

## Cross-game identity (read-only comparison)

Rainbow's hosted project, read with Rainbow's own tooling in a rolled-back
transaction (nothing changed):
```
rainbow     | local_user_id 0679c454-e8ba-4e9b-bf9e-b58ec32e9d52 | global_user_id user_01M3SV4ZFENGMPAXH8NRTYYKH4
cluevoyance | local_user_id cd680275-ef9f-49fa-8d52-41991b6a056d (C1) / 397f0649-82cb-40fa-8978-1a30fbc3262b (C4) | global_user_id user_01M3SV4ZFENGMPAXH8NRTYYKH4
```
`RAINBOW_ID ≠ CLUEVOYANCE_ID`; `global_user_id` identical. The Cluevoyance
rows lived in the local stack; the hosted repeat is Phase 3.

## Teardown

`npm run workos -- local remove` (provider deleted, WorkOS application
`connect_app_01M43MWE6GQJNE57NF5DM64DY9` deleted, HTTP 204; `status` shows
nothing registered, no local providers); `.runtime/workos-staging-key.txt`
and `.runtime/workos-local.json` deleted; `.env` discovery URL cleared;
`supabase db reset` (accounts 0, auth users 0, custom providers 0); browser
storage cleared and the tab closed. The WorkOS Staging *session* in the
desktop app's browser profile is the person's and was left alone.
