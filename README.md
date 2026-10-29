# Cluevoyance

## Start here for the next session

This is **Cluevoyance**. Read [account architecture](src/account/README.md), [configuration](docs/CONFIG-INVENTORY.md), [shared-login checks](docs/WORKOS-SMOKE.md), and [friend exchange](docs/friend-exchange.md). The React/Vite app uses `src/game/` for shared rules, `src/unlimited/` for generated boards and the pilot, and `src/friends/` for friend play. `src/game/shared.js` defines difficulty extras and three lives; product changes need owner approval, not merely a code edit.

### Status checked 2026-10-29

`main` is `be85e24d8b67f99b59d24a61e0227be5984646ad`; GitHub records a [successful Production deployment](https://api.github.com/repos/showvideogames/crystal-clues/deployments/7352352930/statuses) for it. PRs 35/36 merged the finite Random-Pair Pilot Beta and its difficulty selection. Older research notes saying “local only” or “16 boards live” describe their own snapshots; they are not current release status.

The owner handoff says overnight content generation is complete. Its Windows-only `review/random-pairs-overnight` checkpoint `380883e` was not found in the GitHub branch listing. All candidates from that batch remain unapproved; do not restart generation, infer approval from “final” filenames, or import them. Keep source provenance, reviewer judgments and owner approvals distinct. [Library history](data/unlimited/FINAL-LIBRARY-README.md) and [owner queue proposals](data/unlimited/imports/consolidated-1022/OWNER-QUEUE-PROPOSALS.md) are reference material, not automatic publish instructions.

### Local checks and release boundary

Use `npm ci` and `npm run dev`; without Supabase configuration, `src/game/config.js` deliberately enables the offline sample. For account work, follow the local setup below and the configuration guide. `npm run test:unit` is separate from `npm test`, which also requires the local database/friend suites. Real shared-login and phone checks have their own manual guide. This pass did not repeat them or access live player data.

Shared WorkOS identity is used through this game's Supabase Auth and game-owned records. The configuration guide includes preview callback allow-lists; a preview URL alone does not prove database isolation. Before write tests, verify a disposable backend. For a later release, record the approved content, exact commit and successful deployment; preserve the previous deployment for frontend rollback. Database, uploaded assets and player data need their own backup/restore plan, whose current coverage was not established here. Next useful content work is locating and reconciling the completed Windows batch with the review queue, not generating another batch.

## Accounts and configuration (shared sign-in)

Cluevoyance signs players in through the shared Sting Ray identity (WorkOS)
via this project's own Supabase Auth, keeps its own `accounts` and `plays`
tables, and treats guests exactly as before (localStorage). Read
`src/account/README.md` for the architecture, `docs/CONFIG-INVENTORY.md` for
every environment value and dashboard setting, and `docs/WORKOS-SMOKE.md`
for the manual sign-in checks.

```bash
cp .env.example .env            # then fill in the local stack's values from `npm run db:status`
npm run db:start && npm run db:reset
npm run dev
npm test                        # unit (Vitest) + database (node:test against the local stack)
```
