# Shared accounts in Cluevoyance

Cluevoyance has one sign-in: the shared Sting Ray identity (WorkOS AuthKit),
reached through this project's own Supabase Auth as the custom OIDC provider
`custom:platform`. Modelled on Rainbow Categories' live implementation
(puzzle-connect-daily, `src/lib/platformSignIn.ts` and the account layer of
`supabase/migrations/0001_rainbow_baseline.sql`), reduced to what a game with
browser-only guests needs.

```
WorkOS global identity  (user_… id; the same person in every game)
        │  standard OIDC through THIS project's Supabase Auth
        ▼
accounts  (user_id = this project's auth user id; global_user_id = the WorkOS id, unique)
        │
        ├── plays   one row per finished official puzzle (win or loss); stats are derived
        └── admins  which accounts may write official content

Guest: exactly the game as it always was, in this browser's localStorage (clover_*).
```

The WorkOS id is the cross-game **link**, never a key for gameplay data.
Rainbow holds `accounts(user_id = RAINBOW_LOCAL, global_user_id = user_X)` in
its project; Cluevoyance holds `accounts(user_id = CLUE_LOCAL, global_user_id
= user_X)` in this one. The local ids differ; the global id is the same; no
database depends on the other.

## Files

| File | Role |
|---|---|
| `supabase/migrations/0001_cluevoyance_baseline.sql` | content tables (declared), `accounts`, `cluevoyance_uid()`, `account_email()`, `ensure_account()`, `my_account()`, `ping()`, `admins` + `is_cluevoyance_admin()`, `plays` + `record_play()` / `import_plays()`, `delete_my_account()` / `delete_local_account()`, content write policies, explicit grants |
| `src/game/config.js` | environment-driven configuration; explicit offline mode; `ACCOUNTS_ENABLED` |
| `src/account/supabaseClient.js` | the one Supabase client (PKCE, `cv-auth` storage key, no URL session detection) |
| `src/account/platformSignIn.js` | sign-in (reachability probe first), callback handling, provider-token removal, `ensureAccount`, local sign-out, deletion, the current-account store |
| `src/account/safePath.js` | same-origin return path for the round trip |
| `src/account/localHistory.js` | the guest keys, the account cache, the import payload |
| `src/account/plays.js` | `recordPlay` (cache first, server, unsynced replay), `importGuestHistory`, `startFresh`, `deriveStats`, `deriveCompletions` |
| `src/account/historyStore.js` | the switch App.jsx's four history functions go through |
| `src/account/useAccount.js` | the hook: status, account, isAdmin, importPending, actions |
| `src/account/AccountMenu.jsx`, `ImportPrompt.jsx`, `AuthCallback.jsx`, `account.css` | the three surfaces |
| `src/main.jsx` | renders `AuthCallback` on `/auth/callback`, the game everywhere else |
| `src/App.jsx` | touch points marked `[accounts]`: config import, `sbFetch` bearer, the four history functions, the header control, the import prompt, the Admin button |
| `vercel.json` | SPA rewrite so `/auth/callback` is served |
| `tools/workos.mjs` | register a WorkOS Staging application / install the provider (local stack or hosted project), allow-list callbacks |
| `tests/db/*.test.mjs` | node:test against the local stack (`npm run test:db`) |
| `src/account/account.test.js` | Vitest unit tests (`npm run test:unit`) |

## Behaviour

**Sign in.** Header → Sign in → reachability probe of the discovery document
(8 s; unreachable = "Sign-in is temporarily unavailable", nothing navigates)
→ `signInWithOAuth({provider:'custom:platform', redirectTo: origin + '/auth/callback'})`
→ hosted sign-in → GoTrue callback → `/auth/callback` → PKCE exchange, code
stripped from the address bar, provider token deleted → `ensure_account()`:
`ok` (account published) / `not_platform_linked` (local sign-out; "not a
Cluevoyance account") / unavailable (session kept; Try again). Then back to
the page the player left.

**First sign-in on a browser with guest history.** "Bring your progress with
you?" — *Add my progress* uploads exactly what the guest could see: the wins
as `plays` rows (`import_plays`, never overwrites a solved row; archive and
lobby state follow from them) and the loss count (`accounts.imported_losses`;
the game only ever kept losses as the X bar / Played counter, so they carry
over as a count, never as fabricated per-puzzle rows). *Start fresh* uploads
nothing. Either way the guest keys (`clover_completions`, `clover_stats`)
are cleared afterwards: that clearing is the record of the decision, so
nothing is merged silently and nothing can be imported twice (the loss
count is sent once). Mid-puzzle state, difficulty and the tutorial flag are
untouched. The current streak is re-derived from the imported wins' puzzle
dates; `maxStreak` is kept in the guest counters but never shown, so it is
not imported.

**Signed-in play.** Every finish calls `record_play` (cache first, so the UI
never waits; a failed call is replayed on the next load). Stats and the
archive calendar are derived from plays (`deriveStats`, `deriveCompletions`)
in the exact shapes the guest code uses. The streak counts consecutive
puzzle *dates* with a win, ending today or yesterday.

**Email.** Display only, from `account_email()` (the provider identity,
refreshed on every sign-in). Never `auth.users.email`, never a key.

**Sign out.** Local only (`signOut({scope:'local'})`); the WorkOS session and
other games are untouched. The browser becomes a brand-new guest: the account
cache and the guest keys are cleared.

**Delete account.** `delete_my_account()` removes plays, admin rights, the
account and the auth user. The WorkOS identity survives; the next sign-in
creates a fresh, empty account with the same `global_user_id`.

**Admin.** The Admin button shows only for accounts in `admins`; the database
refuses content writes from anyone else (RLS on `puzzles`/`wordbank`). Grant:
`insert into public.admins (user_id) select user_id from public.accounts where global_user_id = 'user_…';`

**Failure.** Provider down → sign-in says so, guests unaffected, sessions
continue. Supabase down → the daily game behaves as before (sample puzzle);
signed-in plays wait in the cache. Callback error → a sentence and a way
back; guest history is never touched on the callback page. Provider ok but
`ensure_account` failing → the session is kept and the page offers Try again.

## Friends on shared accounts

Friends (`src/friends/`, `docs/friend-exchange.md`) has no sign-in of its
own. It uses this layer's client and the header's Sign in; the Friends tables
reference `public.accounts(user_id)` and every policy and server function
uses `cluevoyance_uid()`, so only Cluevoyance accounts take part. Deleting an
account removes its Friends rows by cascade. Sign-out (App.jsx
`leaveFriends`) first forgets a pending invite and this device's push
subscription. `tests/friends/helpers.mjs` mints players with
`tests/db/helpers.mjs` `makeAccount`.
