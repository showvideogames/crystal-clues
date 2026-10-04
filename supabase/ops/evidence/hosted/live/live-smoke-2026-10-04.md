# Live beta smoke and final cross-game check — 2026-10-04

Live site `https://cluevoyance.com` = Vercel production deployment `crystal-clues-1cupjum1e` built from
`main` at `ed80f10` (merge of PR #1, `feat/workos-accounts` at `74b22e3`). Hosted project
`qszqparrqyhegfznyaby`, provider `custom:platform` → WorkOS Staging (`cluevoyance-beta`).

Automated: `live-check.md`, 21/21 against the live URL (page, `/auth/callback`, bundle targets the
hosted project with the Staging discovery URL, content 55/1,080, every anon refusal, authorize → Staging
with PKCE and the live callback).

Database before the browser smoke (`state-before-smoke.json`): accounts 1 (`e1dd3d7b-…`, 2 imported
plays, `imported_losses 3`), fingerprints `2eb2e8d5…` / `a43ab241…`.

## Browser (desktop app pane, live origin)

- Guest: today's real puzzle "Deb 10" in the lobby; **Start Puzzle** rendered the real board (clues,
  cards, Rotate/Shuffle/Reset/Submit) and wrote `clover_progress_1790996707216`. Seeded guest
  history: 1 win (`1790890621430`, 2026-10-02) and 1 loss.
- **Sign in** → hosted authorize → WorkOS Staging recognised the existing session → back on
  `cluevoyance.com` with **no hosted page and no human step**. The **same** account loaded
  (`cv_account_plays.user_id = e1dd3d7b-…`, 2 cached plays; the lobby showed "✓ Solved" for today from
  the account before any import). Prompt "1 win out of 2 games".
- **Add my progress** → three plays cached (`1790890621430`, `1790921298070`, `1790996707216`, all
  `import`), guest keys cleared, no provider token in storage.
- From the live session (the app's own RPC path): `record_play` on an unknown id → `unknown_puzzle`;
  `record_play` loss on the oldest real puzzle `1776820120663` → `ok` and visible in the account's
  `plays` (server-side save proven); content insert as this ordinary account → **403 RLS**;
  `my_account` → local `e1dd3d7b-…`, global `user_01M3SV4ZFENGMPAXH8NRTYYKH4`, email
  `samwestgames+rainbow3@gmail.com`, `imported_losses 4`.
- Account menu showed the provider email. **Sign out** → storage held only the in-progress puzzle
  key; Sign in button back.

Database after the smoke (`state-after-smoke.json`): plays 4 (3 imported wins + the probe loss),
`imported_losses 4`, accounts 1, auth users 1, content 55/1,080 with unchanged fingerprints.

## Cleanup (`after-cleanup.json`)

Removed only the probe loss row on `1776820120663` (and any probe words; none existed). Kept: the
Staging test person's account with its three imported wins and the loss count, as beta data. Result:
plays 3, accounts 1, admins 0, puzzles 55, wordbank 1,080, fingerprints unchanged.

## Final X1 (read-only against Rainbow, `rainbow-readonly.json`, rolled back)

| Game | local_user_id | global_user_id |
|---|---|---|
| Rainbow `zmauemcjcrdrgfjzkvgd` | `0679c454-e8ba-4e9b-bf9e-b58ec32e9d52` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` |
| Cluevoyance `qszqparrqyhegfznyaby` (live) | `e1dd3d7b-b2f3-4533-b11a-43cb7d6cbe9c` | `user_01M3SV4ZFENGMPAXH8NRTYYKH4` |

Local ids differ; global id identical. Rainbow unchanged: 1 account, 10 auth users, 290 game
sessions, ledger `0001,0002` (the same figures as its Phase 2/3 reports).

## Admin

`admins` is empty on the live project. The grant waits for the owner to name the intended beta-admin
identity (not the disposable smoke identity).
