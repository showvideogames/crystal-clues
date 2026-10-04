# Manual smoke test: the shared sign-in (a person, an ordinary browser)

The automated suites prove every database-level and client-level behaviour
on every run (`npm test`). What they cannot prove is the real OpenID round
trip through the hosted sign-in page, because Hosted AuthKit refuses
automated browsers by design (Rainbow proof, E-30). A local stand-in provider
was tried in Phase 1 and does not work either: GoTrue refuses non-HTTPS and
private-network issuers at sign-in time. So the cases below are run by a
person, against a stack that has a real WorkOS **Staging** application
installed, and verified from the database after each step.

When: **not in Phase 1** (Phase 1 must not modify WorkOS Staging). Against
the local stack as soon as a disposable Staging application is approved, and
again on the Phase 3 preview. About 20 minutes with ONE test person in ONE
ordinary Chrome window; a private window per "person".

## Setup (local stack)

```bash
npm run db:start && npm run db:reset
# the Staging API key: EITHER export WORKOS_STAGING_API_KEY=sk_… in this shell,
# OR save it to .runtime/workos-staging-key.txt (git-ignored); delete it afterwards
export CLUEVOYANCE_WORKOS_WRITE=yes
npm run workos -- local register --authkit-domain <name>-staging.authkit.app
npm run workos -- local wire
# .env: VITE_PLATFORM_DISCOVERY_URL=https://<name>-staging.authkit.app/.well-known/openid-configuration
npm run dev                                    # http://127.0.0.1:5173
```

Afterwards: `npm run workos -- local remove`, `unset WORKOS_STAGING_API_KEY`,
delete `.runtime/workos-local.json`.

Queries run with `docker exec -i supabase_db_cluevoyance psql -U postgres -d postgres`
(local) or the project's SQL editor (hosted).

## The cases

**C1 — new person, guest history, Add my progress.** Play and finish today's
puzzle as a guest. Sign in → complete the hosted page as a NEW test person →
back on Cluevoyance → "Bring your progress with you?" → Add my progress.
```sql
select user_id, global_user_id, public.account_email(user_id) from public.accounts;
select puzzle_id, solved, lives_used, source from public.plays;
```
Expect: one account with a `user_…` id; one play with `source = 'import'`;
the Stats overlay shows the game; `localStorage.clover_completions` is gone.

**C4 — sign out, guest play, sign in again.** Account menu → Sign out. Play a
game as a guest. Sign in again as the same person (expect NO password or
code step: the Staging session is still alive). Expect: the prompt again, for
this browser's new guest game; Add → the second play joins the same account;
still one `accounts` row.

**C6 — email change.** Change the test person's email in the WorkOS Staging
dashboard (Users). Sign out of Cluevoyance and sign in again. Expect: the
account menu shows the NEW email; `global_user_id` unchanged; one row.
```sql
select a.global_user_id, public.account_email(a.user_id) as current_email, u.email as auth_users_email
  from public.accounts a join auth.users u on u.id = a.user_id;
```
Known and by design (Rainbow S6): `auth_users_email` keeps the sign-up
address; Cluevoyance reads `account_email()`, so `current_email` and the menu
show the new one.

**C7 — delete account.** Account menu → Delete account… → Delete. Expect:
`accounts`, `plays` and the auth user are gone. Sign in again as the same
person: a fresh, empty account with the SAME `global_user_id` on a NEW auth
user.

**X1 — the cross-game proof** (hosted only, Phase 3/4). Sign into Rainbow
(`https://www.rainbowcategories.com`) with the Staging test person who is
already a Rainbow account. Visit Cluevoyance, Sign in (expect no credential
step). Then, in each project:
```sql
select '<game>' as game, user_id as local_user_id, global_user_id from public.accounts
 where global_user_id = '<user_… of the test person>';
```
Expect: both rows exist; `global_user_id` identical; `local_user_id` different
(two uuids from two projects). Record both rows in
`supabase/ops/evidence/cross-game-proof.md`.

Covered by automation, not run by hand: Start fresh (T6/U6/U9), a second
browser with no history (T3 idempotence), the provider being unreachable
(U2: the button says "temporarily unavailable" and guest play continues), an
auth user that is not a Cluevoyance account (T2), non-admin content writes
(T11), callback failures (U3: guest history untouched).

## On a hosted deployment

Two things only a hosted run shows (Rainbow Phase 3 findings): every origin
that starts a sign-in must have its exact `/auth/callback` on the project's
redirect allow-list (`npm run workos -- hosted allow-callback --url …`), and
with Confirm email ON a first-ever sign-in whose WorkOS email is unverified is
held by GoTrue until the confirmation mail is clicked.
