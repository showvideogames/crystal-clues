# Friend puzzle exchange

Two players become friends by invite link, make personal Cluevoyance puzzles for
each other, play them on the familiar board, replay each other's real guesses,
and keep two streaks that belong to the friendship.

The daily game, archive, tutorial and admin work exactly as before. The whole
feature is hidden unless the build sets `VITE_FRIENDS=1` and has shared
accounts configured (`FRIENDS_ENABLED` in `src/game/config.js`).

## Pieces

| Where | What |
| --- | --- |
| `supabase/migrations/20260926090000_friend_puzzles.sql` | Tables, RLS, the streak rule, every server operation, push outbox |
| `supabase/functions/push-dispatch/` | Edge Function that sends queued web pushes (logic in `dispatch.js`) |
| `src/friends/` | Friends screens, lazily loaded (sign-in, inbox, creator, play, replay, push) |
| `src/App.jsx` | Header icon, deep links, and GameView's friend mode (server-judged guesses) |
| `src/game/shared.js`, `src/game/config.js` | Deal/validation helpers shared with the admin editor; which Supabase project to use |
| `public/push-sw.js` | Push-only service worker (no caching) |

## Rules worth knowing

**Accounts.** Friends has no sign-in of its own. A player is a Cluevoyance
account from the one shared sign-in (WorkOS through `custom:platform`, see
`src/account/README.md`); the client is `src/account/supabaseClient.js` and
every server function identifies the player with `cluevoyance_uid()`, so an
auth user that is not a Cluevoyance account is refused (`not_signed_in`).
Every player column references `public.accounts(user_id)`, never an email;
deleting an account removes its Friends rows by cascade. Each player picks a
display name (game-local, not identity). An invite opened while signed out is
kept on the device through the sign-in round trip; signing out (or deleting
the account) forgets it and detaches this device's notifications.

**Access.** RLS is on for every table; clients only ever read their own rows.
All writes go through `SECURITY DEFINER` functions that check `cluevoyance_uid()`.
Players never write to the official `puzzles` table.

**The answer never reaches the solver early.** A sent puzzle's answer is in
`friend_puzzle_answers`, readable by the creator and, after finishing, the
solver. Each Submit is judged by `submit_friend_guess` on the server, which
also records the exact board (card and turn per slot), the tray, and where the
clues sat. On send, card ids are replaced with opaque ones and each card's
stored words get a random quarter-turn, so the payload hints at nothing.
The creator always makes one complete puzzle — four answer cards and three
bonus cards — and the server keeps all seven next to the answer. The recipient
chooses Easy / Standard / Expert / Hardcore before starting, with the daily
game's meaning (0 / 1 / 2 / 3 bonus cards, the creator's first N). The choice
and the dealt cards are stored with the attempt and locked, so refreshes and
other devices restore the same game; undealt bonus cards never reach the
solver during play, and guesses may only use dealt cards. The replay shows
each guess's board and the tray the player really had left — never undealt cards.

**Duplicates and races.** One open draft per friend with optimistic versioning;
sending is idempotent per draft; one unfinished puzzle per sender per
friendship; each guess carries its number, so retries return the recorded
result and stale tabs are refused; finishes lock the friendship row so streaks
update in the order puzzles were finished.

**Friend Streak (the only definition is in the migration; stored as `daily_*`).** Counted in 24-hour
periods on the server clock, so both friends share one deadline wherever they
are. The first finished puzzle (win or loss) starts the clock. Each following
24-hour period needs at least one finished puzzle; extras don't carry over.
Miss a whole period and it's 0; the next finish starts a new clock. The
deadline shown is `anchor + (last counted period + 2) × 24h`.
The daily game's own streak uses each device's calendar date, which two people
in different time zones can't share — hence the server-anchored period.

**Solve Streak (stored as `team_win_streak`).** Finished friend puzzles won in a
row by either friend; any finished loss resets it.

The screens say when a period is already counted, when the next day starts
counting, and show the server's deadline in each viewer's own time zone with a
countdown on server time. Timing alternatives for the Friend Streak are
compared in `docs/friend-streak-timing.md` (not implemented).

**Notifications.** The in-app inbox (and the gold dot on the header icon)
always works. Web push is optional: permission is requested only when the
player taps "Turn on notifications". On iPhone/iPad it needs iOS 16.4+ and
the app added to the Home Screen; the settings card explains that. Events go
into a transactional outbox with dedupe keys, and each row is re-checked right
before sending (a new-puzzle alert is dropped once the puzzle was opened, a
result alert once it was viewed, a reminder once the period is safe). One
optional streak reminder per deadline, about 3 hours before. Texts never
contain clues or card words. Push failures never block sending or playing.

## Local preview

Requires Docker. Uses the same local stack as the account work.

```bash
npm install
npm run db:start && npm run db:reset   # baseline + both Friends migrations + local seed
npm run friends:setup                  # .env.friends-local (git-ignored) pointing at the local stack
npm run friends:dev                    # http://127.0.0.1:5186
```

The shared sign-in only completes on a stack wired to WorkOS Staging
(`docs/WORKOS-SMOKE.md`); otherwise Sign in says it is unavailable, and the
browser tests sign their own test accounts in.

## Tests

```bash
npm run test:friends:db      # pgTAP: the streak rule at its boundaries, DST, time zones, validation
npm run test:friends:api     # accounts-only access, invites, idempotency, races, judging, streaks, deletion, push outbox
npm run test:friends:e2e -- <dir>   # two accounts on two "phones": invite while signed out, create, play
                                    # (refresh halfway), win, replay, make one back, lose, reopen, sign-out, switch account
npm run test:friends:daily   # daily game, tutorial, archive; Admin only for admin accounts
npm run test:friends:push    # optional: real web push (needs the local edge runtime)
```

## Preview and production setup

Live site: Vercel project `crystal-clues` builds `main` on every push and
serves cluevoyance.com; other branches get protected preview URLs. Database and
sign-in: the one Cluevoyance Supabase project with WorkOS **Staging** (see
`src/account/README.md`). Nothing here adds a service or a paid feature.

1. Rehearse, then apply both Friends migrations to the project, in order. They
   only add Friends objects; `puzzles`, `wordbank`, `accounts`, `plays`
   and `admins` are untouched. With `VITE_FRIENDS` unset the live site
   shows nothing new.
2. A preview: branch-scoped Vercel Preview variables for the branch
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `VITE_PLATFORM_DISCOVERY_URL`, all public, plus `VITE_FRIENDS=1`), and
   the preview's `/auth/callback` on the project's redirect allow-list.
3. Production, later: `VITE_FRIENDS=1` in Vercel Production, then merge.
4. Optional push, any time later: VAPID keys as Supabase secrets, deploy
   `push-dispatch`, `VITE_VAPID_PUBLIC_KEY`, and a schedule for reminders.
   Without push the inbox and its gold dot still show everything.
