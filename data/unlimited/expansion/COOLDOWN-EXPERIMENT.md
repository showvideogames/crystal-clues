# Offline experiment: "a hint can't show up again within 100 games"

2026-10-19. This was an offline simulation only. The app's sampler, Daily, Friends, persistence and production are unchanged, and no model calls were made. Script: `scripts/unlimited/cooldown-experiment.mjs`. Raw results: `cooldown-experiment.json`.

## Recommendation

**Adopt a strict per-player hint cooldown of 100 Unlimited games.** The current pool supports it with a wide margin:
- **No failures:** 0 failed or invalid boards in 24,000 simulated strict-100 boards.
- **No repeats:** 0 hint repeats inside the window.
- **Same speed and same rules:** build time is unchanged, and the board rules are the same as today.

It also fixes the backlog's concentration problem without capping or removing any content. POTTER and SHELL drop from about 8% of boards to about 1%.

**No fallback is needed** at 100 with today's pool. As a safety net only, add an *explicit* fallback for the theoretical exhaustion case: if a strict board ever can't be built, shorten the window step by step and record that it happened. The rule must never be broken silently. This fallback never triggered in the simulation.

## What counts as a hint event

- **Counted:** a hint *displayed* on a board dealt to the player, i.e. the four clue words shown on a started Unlimited board, normalized (trimmed, upper case). Two different pairs with the same displayed word, such as POTTER for WAND + OWL and POTTER for BOWL + WHEEL, count as the same hint.
- **Not counted:** hints that were merely available, served for pairs that weren't dealt, stored alternates that are never shown, and held or rejected hints.
- **Abandoned games** still count, because the player saw the hints.
- **Replays** of an old board are the player's choice. I recommend they don't count as new events and don't block anything.
- **Implementation note:** every random board a player starts is already saved as a frozen snapshot (`store.boards`, with its four hints and creation time). So the last 100 games' hints can be read from existing local data, with **no persistence change**.
- If storage is unavailable or cleared, the cooldown simply starts fresh (harmless). Once account syncing exists, the cooldown would follow the account.

## Capacity, before simulating

| | Release candidate (1,515 pairs) | Checkpoint (2,037 pairs, frozen copy before the latest 2-pair cleanup) |
|---|---|---|
| Distinct served hint words | **910** | **939** |
| Hints per board | 4 | 4 |
| Hints cooling during a full 100-game window (worst case) | 400 | 400 |
| Hints still free in the worst case at window 10 / 25 / 50 / 100 | 870 / 810 / 710 / **510** | 899 / 839 / 739 / **539** |
| Theoretical longest strict window (4 fresh hints still possible) | about 226 games | about 233 games |
| Hints that serve exactly one pair | 606 | 592 |
| Busiest hints | SEA 19, FROZEN 16, HALLOWEEN 12, STY 12 | POTTER 42, SHELL 40, RING 27, JAM 24 |

The real limit is pairs, not just hint words: a board needs 4 disjoint pairs with 4 distinct, non-cooling hints. The simulation measures that directly. At strict 100, the fewest dealable pairs any player ever had was **611** (release) and **688** (checkpoint), against the 4 needed.

## Simulation

Each run: 40 players × **300 consecutive games**, which fills the 100-game window and passes it twice. That's 12,000 boards per run. Every board was made by the app's own `generateBoard` and checked with `validateBoard`.

Strategies:
- **baseline:** what ships today (uniform over pairs, avoiding the last 3 boards' pairs).
- **recent10:** the earlier soft experiment.
- **strict25 / strict50 / strict100:** the proposed rule.

Quality guard: a pair can only be dealt through its non-cooling *served* choices. A canonical pair such as BOXER + JOKE → PUNCHLINE simply sits out while PUNCHLINE is cooling. It never falls back to an unserved, held or rejected hint, so all holds and owner preferences are preserved.

| Pool | Strategy | Failures | Hint repeats ≤30 games (per player per 300 games) | Hint repeats ≤100 games | Shortest gap between repeats | Distinct targets seen (300 games) | Repeated pairs | Top hints (share of boards) | Fewest dealable pairs |
|---|---|---|---|---|---|---|---|---|---|
| Release | baseline | 0 | 213.7 | 462.2 | 1 game | 447 | 366 | SEA 4.7%, FROZEN 4.3% | – |
| Release | recent10 | 0 | 152.5 | 434.6 | 1 | 460 | 357 | SEA 3.5%, FROZEN 3.2% | – |
| Release | strict25 | 0 | 41.7 | 378.0 | 26 | 471 | 338 | SEA 2.5% | 1,198 |
| Release | strict50 | 0 | **0** | 288.8 | 51 | 486 | 313 | SEA 1.7% | 986 |
| Release | **strict100** | **0** | **0** | **0** | **101** | **515** | **272** | SEA, FROZEN, STY 1.0% | **611** |
| Checkpoint | baseline | 0 | 296.1 | 540.0 | 1 | 486 | 288 | **POTTER 8.4%, SHELL 7.7%** | – |
| Checkpoint | recent10 | 0 | 209.5 | 491.4 | 1 | 502 | 282 | POTTER 4.8%, SHELL 4.7% | – |
| Checkpoint | strict25 | 0 | 62.2 | 429.6 | 26 | 511 | 276 | SHELL 3.0%, POTTER 3.0% | 1,431 |
| Checkpoint | strict50 | 0 | **0** | 329.4 | 51 | 531 | 259 | SHELL 1.8% | 1,127 |
| Checkpoint | **strict100** | **0** | **0** | **0** | **101** | **550** | **228** | SHELL, JAM, RING 1.0% | **688** |

**Every strict run:**
- 0 invalid boards and 0 exhaustive-fallback boards.
- 0 window violations.
- Build time p50 about 0.15 ms, p99 about 0.4 ms, the same as baseline.

**Coverage:**
- Every pair was shown at least once in every run, except 6 of 2,037 in checkpoint strict100. That's a sampling effect over 12,000 boards, not exclusion.
- All 910 / 939 hints were shown in every run.

**Quality of what's displayed:**
- **Owner-approved share:** steady, 10.9% vs 11.5% in release and 9.7% vs 8.8% in the checkpoint.
- **Clues with both sides at full strength:** steady, 81% in release, and 82% vs 84% in the checkpoint.
- **High-delight share:** rises in the checkpoint, from 40% to 49%. Strict cooldown stops the high-yield POTTER / SHELL pairs (mostly delight 1) from dominating.
- **No weaker hints are introduced:** only served choices are ever used.

**Word and pair diversity improve:**
- About 15% more distinct target words over 300 games (447 → 515 in release, 486 → 550 in the checkpoint).
- About 21–26% fewer repeated pairs.

**After the window, hints come back.** A player who plays 300 games still sees about 430 hints for a second time. That's inevitable with roughly 920 hints and 4 per game, but every repeat is more than 100 games after the last showing.

## 25 / 50 / 100 compared

- **25 games:** removes most short-range repetition but still allows about 42–62 repeats within 30 games.
- **50 games:** no repeats within 30 games; some within 100.
- **100 games:** no repeats within 100 games, still with no failures and plenty of headroom. For the owner's stated goal, 100 is the right setting.
- **Above 100:** the pool could technically support about 220 games, but past roughly 200 the free pool gets thin and the fallback would start to matter. Not recommended without growing the pool.

## Daily and Friends are different

- **Daily** is one shared, curated puzzle per day, the same for every player. A per-player cooldown doesn't apply, and Daily should keep its own editorial process.
- **Friends** puzzles are made by players, so the cooldown doesn't apply there either.
- **Recommendation:** Unlimited-only. Daily and Friends hints should neither count toward nor be blocked by the Unlimited cooldown.

## If adopted (separate, reviewed change)

- Read the hints of the last 100 started Unlimited boards from `store.boards`, excluding replays.
- Filter each pair's served choices against them before `generateBoard`.
- Add the explicit, logged fallback described above.
- Add tests: no repeat within the window over a long simulated sequence, owner canonical pairs never fall back, and storage-unavailable behavior.
- None of this is built yet.
