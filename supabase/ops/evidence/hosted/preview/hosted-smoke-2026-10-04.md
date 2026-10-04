# Hosted preview smoke and cross-game proof — 2026-10-04

Preview: `https://crystal-clues-git-feat-wor-3a5001-showvideogames-2326s-projects.vercel.app` (Vercel
project `crystal-clues`, Git preview of `feat/workos-accounts`, behind deployment protection; opened
once with the project's automation bypass, which was rotated afterwards). Hosted project
`qszqparrqyhegfznyaby` with baseline `0001` and the `custom:platform` provider pointing at WorkOS
Staging (`detailed-pink-69-staging.authkit.app`, application `cluevoyance-beta`,
`connect_app_01M43QX7HV2VG7T0TC7P5E5WB0`, client `client_01M43QX7HV9FY7X746JBZD54BY`, single redirect
`https://qszqparrqyhegfznyaby.supabase.co/auth/v1/callback`).

Automated checks first: `preview-check.md` in this folder, 21/21.

## The one sign-in

Guest history seeded in the preview's localStorage: wins on the two real hosted puzzles
`1790996707216` ("Deb 10", 2026-10-04, standard, 1 life) and `1790921298070` (2026-10-03, expert, 0
lives); counters 5 played, 2 won, X = 3. The lobby showed "✓ Solved on Standard · 1 life used" from
the guest keys (guest localStorage behaviour intact on the preview).

**Sign in** → the hosted authorize endpoint → WorkOS Staging recognised the existing session of
`samwestgames+rainbow3@gmail.com` (the identity already linked to Rainbow) and returned with **no
hosted page and no human step** → `/auth/callback` → the game, signed in, with the import prompt
"2 wins out of 5 games, best streak 2".

Hosted database right after the callback (read through the Management API):
```
accounts   : local_user_id e1dd3d7b-b2f3-4533-b11a-43cb7d6cbe9c | global_user_id user_01M3SV4ZFENGMPAXH8NRTYYKH4 | email samwestgames+rainbow3@gmail.com | imported_losses 0
identities : e1dd3d7b-… | custom:platform | user_01M3SV4ZFENGMPAXH8NRTYYKH4
counts     : accounts 1 | auth_users 1 | plays 0 | admins 0 | puzzles 55 | wordbank 1080
```

**Add my progress** → prompt gone; guest keys cleared; `cv-auth` holds no provider token; the lobby
still shows "Solved" (now derived from the account's plays). Hosted database (`after-import.json`):
```
plays : 1790921298070 | 2026-10-03 | solved | 0 | expert   | import | owner e1dd3d7b-…
plays : 1790996707216 | 2026-10-04 | solved | 1 | standard | import | owner e1dd3d7b-…
account imported_losses 3 ; counts accounts 1 | auth_users 1 | plays 2
content fingerprints: puzzles 2eb2e8d5da923f0f16a0688325d79678, wordbank a43ab241e3926ce0d810897f927f315a (unchanged since the before-inventory)
```
Stats overlay on the preview (Share Results): **Played 5 · Win % 40 · Streak 2 · bars 0:1 1:1 2:0 X:3**
— the guest's own counters, reproduced from two play rows plus the imported loss count.

## Cross-game identity (read-only against Rainbow, `rainbow-readonly.json`)

| Game | local_user_id | global_user_id |
|---|---|---|
| Rainbow (hosted `zmauemcjcrdrgfjzkvgd`) | `0679c454-e8ba-4e9b-bf9e-b58ec32e9d52` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` |
| Cluevoyance (hosted `qszqparrqyhegfznyaby`) | `e1dd3d7b-b2f3-4533-b11a-43cb7d6cbe9c` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` |

`0679c454-… ≠ e1dd3d7b-…`; the global id is identical. Two projects, two local accounts, one person.
Rainbow was only read (a rolled-back transaction through its own tooling).

## Admin boundary on hosted (database-enforced)

From the signed-in preview with the session's own token, bypassing the UI (no Admin button rendered):
```
is_cluevoyance_admin → false
POST wordbank        → 403 "new row violates row-level security policy for table wordbank"
DELETE puzzles?id=eq.1790996707216 → 200, [] (zero rows; the puzzle is still there)
```
Temporary `insert into public.admins` for the smoke account (applied through the gated tool):
```
is_cluevoyance_admin → true ; Admin button rendered after reload
POST wordbank        → 201 ; DELETE wordbank?word=eq.HOSTEDPROBEWORD → 200, [{"id":2652,"word":"HOSTEDPROBEWORD"}]
```
Then revoked: admins 0, wordbank 1080, no probe words left. Which identity should hold admin on the
live site is Deb's decision (section "Admin" of the Phase 2 report).

## State left behind

The smoke account (`e1dd3d7b-…`, two imported plays, `imported_losses 3`) remains on the hosted
project as the Staging test person's Cluevoyance account, for further beta testing and the live X1
repeat. Signed out locally in the preview (storage empty). The WorkOS Staging *session* in the desktop
browser profile is the person's and was left alone. Local credentials deleted: the Staging API key
file and the registration state file (the client secret lives only in the hosted provider config).
