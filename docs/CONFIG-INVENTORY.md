# Configuration inventory

Everything that names a Supabase project, an environment or an outside
service. Nothing on this list lives in code (decision D5): moving Cluevoyance
to another Supabase project, or pointing it at another sign-in environment,
means changing these values and applying `supabase/migrations/` to the new
project. `src/account/account.test.js` (U1, portability) fails if a hosted
address, key or sign-in domain appears in `src/` or the migrations.

## Build-time values (Vercel project settings; `.env` locally; see `.env.example`)

| Key | Purpose | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | the Supabase project | the only place the project is named, with the key below. **Vercel project `crystal-clues` has no variables today; these must be added before the branch is deployed (Phase 3/4)** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | its publishable (anon) key | public by design |
| `VITE_PLATFORM_DISCOVERY_URL` | the shared sign-in's OpenID discovery document | empty = accounts OFF (guest-only build); the reachability probe fetches it |
| `VITE_ACCOUNTS_ENABLED` | emergency switch; `"false"` hides every sign-in surface | anything else = on |

With the first two unset the app runs in **offline guest-only mode** (sample
puzzle, archive/admin unavailable, accounts off) and says so once in the
console. It never falls back to a hosted project.

## Supabase project: Auth settings (dashboard, per project)

| Setting | Value Cluevoyance needs | Why |
|---|---|---|
| Custom OIDC provider `custom:platform` | issuer = the AuthKit domain; client id + secret of Cluevoyance's own WorkOS application; scopes `openid email profile`; PKCE on | installed by `tools/workos.mjs`, never by hand; the secret lives nowhere else |
| Site URL | `https://cluevoyance.com` | |
| Redirect allow-list | `https://cluevoyance.com/auth/callback`, plus `https://www.cluevoyance.com/auth/callback` if that host serves the site, plus each preview's `/auth/callback` while it is used for sign-in | GoTrue matches exactly; a missing entry sends the callback to the Site URL (Rainbow's live-only fix) |
| Confirm email | ON (already ON on the hosted project, checked 2026-10-04) | GoTrue may auto-link a shared sign-in to an existing *confirmed* same-email user; never to an unconfirmed one. A first-ever sign-in whose WorkOS email is unverified is held until its confirmation mail is clicked |
| Anonymous sign-ins | OFF (already) | |
| Manual identity linking | OFF (verify in Phase 2) | |
| Email (password) provider | may stay ON during beta (unused by Cluevoyance; `cluevoyance_uid()` treats such users as guests); local stacks keep it ON to mint test sessions | |
| Email templates / SMTP | not needed | Cluevoyance sends no auth email |

## Supabase project: other

| Item | Value |
|---|---|
| Migration ledger | `supabase_migrations.schema_migrations` holding `0001` after Phase 2 (`supabase db push`) |
| `supabase/config.toml` `project_id` | `cluevoyance` (a local label, not the hosted ref). The hosted ref is never written in the repository; hosted tooling takes it from `CLUEVOYANCE_PROJECT_REF` |
| Local stack ports | API 55421, DB 55422, Studio 55423, Mailpit 55424 (chosen not to collide with Rainbow's 544xx or the Friends stack's 553xx) |

## The shared sign-in service (WorkOS)

| Item | Value |
|---|---|
| Application | one Connect OAuth application per GAME: `cluevoyance-beta` (hosted beta, Staging), `cluevoyance-local` (disposable, for a manual local smoke); first-party, confidential |
| Redirect URIs | `https://<project-ref>.supabase.co/auth/v1/callback` for the project Cluevoyance uses (local: `http://127.0.0.1:55421/auth/v1/callback`) |
| Credentials | the application's client id + secret, held only in the Supabase provider configuration above |
| API key | local tooling only (`WORKOS_STAGING_API_KEY` in the shell), short-lived, never stored in the repository |
| Environment | beta: **Staging** (the same environment and AuthKit domain Rainbow's beta uses); launch: Production, later, as a separate approval |

## Tooling credentials (shell only, never files)

| Variable | Used by |
|---|---|
| `WORKOS_STAGING_API_KEY` | `tools/workos.mjs <local|hosted> register / remove` |
| `CLUEVOYANCE_PROJECT_REF`, `CLUEVOYANCE_HOSTED_SERVICE_ROLE_KEY` | `tools/workos.mjs hosted wire / status / remove` |
| `SUPABASE_ACCESS_TOKEN` | `tools/workos.mjs hosted allow-callback` |
| `CLUEVOYANCE_WORKOS_WRITE=yes`, `CLUEVOYANCE_HOSTED_WRITE=yes` | required by every command that creates/deletes in WorkOS or changes the hosted project |

## Local development and tests

| Item | Where |
|---|---|
| `.env` (git-ignored) | the local stack's `API_URL` and `ANON_KEY` from `npx supabase status -o json`; discovery URL empty for guest-only, or set for the manual smoke |
| `.runtime/workos-local.json`, `.runtime/workos-hosted.json` (git-ignored) | written by `tools/workos.mjs … register`; delete after use |
| `tests/db/helpers.mjs` | reads the stack's keys from `supabase status`; refuses non-loopback hosts |
