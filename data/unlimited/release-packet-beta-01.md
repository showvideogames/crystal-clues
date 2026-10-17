# Cluevoyance Unlimited — guest beta release packet (batch beta-01, 2026-10-17)

For the supervising reviewer. Nothing in this packet has been pushed, merged, deployed or
written to any database. Release within the `/unlimited` scope is the reviewer's call.

## 1. Repository state

| Item | Value |
|---|---|
| Host | DESKTOP-V3ONF8L (Windows 10), user leviw |
| Worktree | `C:\Users\leviw\cluevoyance-unlimited` |
| Branch | `feature/unlimited-guest-beta`, from `origin/main` e928a35 |
| Commits (local only) | 87b3873 "Move the deal and the judging into shared.js so scripts can run them"; 891a98d "Unlimited guest beta: pair library, seeded boards, /unlimited screens" |
| Main checkout `C:\Users\leviw\crystal-clues` | untouched: still on `feature/mobile-visual-redesign` d9b549a with its untracked `data/`, `scripts/` and preview folders; only `.claude/launch.json` gained a `cluevoyance-unlimited` entry (port 5192) |
| Other worktrees | 21, none touching Unlimited; none modified |

### Base: e928a35 versus the earlier main 7794c82

7794c82 was main when the session started (merge of PR #24, the share-grid fix). While the
environment was being verified, PR #25 "fix/stationary-feedback" merged as e928a35: two commits,
46b9ad9 "Feedback that never moves the controls" and e1db20a "Test every feedback-area message at
320, 360 and 390 px", touching `src/App.jsx` (+25/−), `src/game/Results.jsx`, `src/game/results.css`
and a new `tests/home/stationary-feedback.mjs`. 7794c82 is an ancestor of e928a35 (a fast-forward,
nothing dropped), so the worktree is on the intended latest main, and it carries no unrelated
pending change: before the Unlimited commits its only tracked differences from e928a35 were the
refactor files.

## 2. What was built

### Content (data/unlimited, scripts/unlimited)

- **50-word shortlist** (`library/shortlist-50.json`): 18 words kept from the 20-word pilot
  (ENGINE and MIRROR dropped as dry) and 32 new familiar, versatile words, every one checked
  against the complete 1,196-word bank export of 2026-10-15. Inspiration only, no official list.
- **Pair library** (`library/pairs.json`, 48 pairs): 12 newly authored pairs
  (`batches/u01-first-sample.json`, with the author's kept and rejected hints and reasons) and
  36 pilot pairs. Statuses are kept distinct: `candidate`, `ai_reviewed`, `held`, `rejected`;
  `human_approved` is never set by any script and nothing carries it.
- **Fresh blind review** of every hint before it could be played: two subagents saw only
  `pair + hint` lists (author text and verdicts were in separate key files they were told not to
  open). The first pass used a superseded rubric; both reviewers were sent the owner's corrected
  rubric (no minimum hint count, no board competition, generic allowed when natural to both
  words, compounds judged as compounds) and wrote `-v2` files; the v1 files are preserved with
  the correction recorded in `_metadata`. The 2026-10 pilot review scores are provenance only.
  Results: u01 36 PASS / 18 BORDERLINE / 28 FAIL of 82; u02 (pilot) 52 / 51 / 11 of 114.
- **Merge rule** (`merge-review.mjs`): PASS → `ai_reviewed` (playable); BORDERLINE → `held`;
  FAIL → `rejected`; a PASS without player-facing text is `held` until text exists; pilot hints
  the pilot author had flagged stay `held`. Player text for CREEPY, JERRY and MUFASA was written
  after their PASS verdicts on the owner's direction (no new review for text alone).
- **Owner override** (`library/overrides.json`, `apply-overrides.mjs`): FISH+GOLD → FINGER held
  out of the first US beta pending content review (British "fish finger"); it stays in the
  library as a passed hint with the hold recorded on it. Overrides can only hold or release a
  hold; they never make a hint playable.
- **Rules check for intended wordplay**: the code rules are one word (owner), ≤ 20 characters
  (server rule), not equal to either of its own two targets, and four distinct normalised hint
  texts per board. There is no substring or "contains a target" rule in code; GOLDFISH and
  DOGFISH were rejected by the blind reviewer's judgement, not by a rule. MAN (Batman +
  Spider-Man) and MARE (a knight's mare + nightmare) pass every code rule and are `ai_reviewed`.
- **Assembler** (`assemble-boards.mjs`, seeded): four pairs with eight distinct targets, one
  `ai_reviewed` hint per pair chosen so the four hints are distinct after normalisation, 20
  decoys from the shortlist minus the targets, random orientations, card ids shuffled, a frozen
  reveal snapshot per hint. Per batch: a pair once, a hint text once, a word as target at most 3
  times. **No board-level semantic review**, by the owner's decision.
- **Batch beta-01**: 8 boards, seed 6. A 30-seed sweep found no seed giving more under the cap;
  raising the cap to 4 added one board and was not kept. The limit is distinct-word combinations
  (the pilot pairs concentrate on 18 words), not hint quality: eight genuinely distinct boards,
  no padding. Two more boards need roughly six more reviewed pairs on the under-used new words.

| Board | Hints | Pairs |
|---|---|---|
| beta-01-001 | ROLL / MAP / MUFASA / SWEET | EGG+SPRING, KEY+ROSE, KING+LION, HONEY+SALT |
| beta-01-002 | SMITH / QUEEN / BACK / DOUBLOON | HORSE+IRON, CROWN+HEART, DIAMOND+SNAKE, GOLD+PIRATE |
| beta-01-003 | BLOOD / CHASE / BLOOM / HOWL | HEART+IRON, CAT+MOUSE, ROSE+SPRING, MOON+WOLF |
| beta-01-004 | NECTAR / ELSA / BOWL / HEAVY | HONEY+ROSE, ICE+QUEEN, DOG+FISH, IRON+LIGHT |
| beta-01-005 | WILD / SKELETON / CARD / HEIST | FIRE+HORSE, GHOST+KEY, BRIDGE+HEART, BANK+DIAMOND |
| beta-01-006 | BURN / CAST / WIND / BLACK | BRIDGE+FIRE, LIGHT+SHADOW, KEY+SPRING, KNIGHT+NIGHT |
| beta-01-007 | HEADLESS / DENTIST / SALEM / MATCH | GHOST+HORSE, BRIDGE+CROWN, CAT+WITCH, FIRE+LIGHT |
| beta-01-008 | HAMLET / CRYSTAL / HALLOWEEN / BLUE | CROWN+GHOST, DIAMOND+SALT, BAT+SPIDER, MOON+OCEAN |

Full board data (cards, solution, reveal text): `data/unlimited/boards/beta-01/boards.json` and
the bundled copy `src/unlimited/pool.json`; assembly log `boards/beta-01/log.md`.
Readable review packets: `library/review-packet-u01-first-sample.md`,
`review-packet-pilot-2026-10.md`, `review-packet-all.md`.

### App (src)

- `src/game/shared.js`: `biasedShuffle`, `isClueRotation`, `bestSubmit` moved out of App.jsx
  (behaviour unchanged; generator injectable) so scripts run the real judging.
- `src/route.js`: `/unlimited`. Not linked from the home page or header.
- `src/App.jsx`: GameView gains `unlimited` and `endControls`; an Unlimited game is judged
  locally like the daily game, saves its progress under `clover_progress_unlimited-<id>`, reports
  `onFinished`, and never writes daily stats, completions or results.
- `src/unlimited/UnlimitedView.jsx`, `history.js`, `unlimited.css`: lobby (difficulty, played
  list with Replay, feedback count, Copy / Download), play screen, "Why these clues worked"
  (clue, pair, both sides, source; a rating per clue: Great clue / Confusing / Two answers fit /
  Weak link; a note per puzzle). Everything is saved in this browser only
  (`localStorage` key `cv_unlimited_v1`), and the screens say so. Boards are served in batch
  order; a game in progress resumes; when all boards are played the lobby says so and offers
  labelled replays (counted, never overwriting the first result).

## 3. Checks and evidence

| Check | Result |
|---|---|
| `node scripts/unlimited/check-boards.mjs` (structure = Friends server rules + Unlimited rules; `bestSubmit` accepts the answer at all four rotations; turned, extra and swapped cards refused; locked slots kept; `biasedShuffle` never starts solved at any difficulty over 25 seeds; lives 3→2→1→0 and known-bad transitions) | 8/8 boards pass |
| `npx vitest run` (10 files incl. new `judging.test.js`, `history.test.js`) | 130 passed |
| `tests/unlimited/smoke.mjs` (Puppeteer, phone 390×844 then desktop 1280×900): lobby; Standard win with a wrong guess and a refresh that resumes; "Why these clues" with all four pairs and both sides; rating + note saved; refresh keeps them; Copy; Download (file verified); Easy loss with the answer revealed and explanations; Next; leave mid-game and Continue; Expert (2 extras); Hardcore (3 extras); Next into puzzle 6; desktop board, win and reveal; daily storage untouched; no page or console errors | PASS, 15 screenshots |
| `tests/friends/daily-smoke.mjs` against this build | PASS (daily game, tutorial, archive, admin unchanged) |
| `npm run test:friends:api` (local stack) | 53 passed |
| `tests/friends/guest.mjs` against this build | PASS |
| `npx vite build` | OK |
| `npx eslint .` | 4 errors, 8 warnings, **all pre-existing** in `src/App.jsx` (identical list on e928a35: unused `dim`, unused `adminDateLabel`, duplicate `height` key, setState-in-effect); 0 new |

Not run: `supabase test db` and `tests/db` (no schema change); the full Friends e2e two-person
run (not affected; guest flow and API covered).

Screenshots (phone `u01`–`u11`, desktop `d01`–`d04`) and the source diff
`source-diff-e928a35..891a98d.patch` are in `C:\Users\leviw\crystal-clues\unlimited-preview\`
(untracked). Source change: 25 files, +3,494 / −80 lines, of which `src/App.jsx` +27/−80,
`src/game/shared.js` +84, `src/route.js` +3, the rest new files.

## 4. Limitations and open items

- 8 boards, not 10 (reason above). Two more need ~6 reviewed pairs on new words; a reviewer
  decision, not taken here.
- Every served hint is `ai_reviewed` (fresh blind review); none is human-approved. Possible
  unintended associations on a board are not checked, by the owner's decision, and are to be
  judged from playtest feedback.
- Feedback is local to the browser; the player copies or downloads it. No server, no accounts.
- `scripts/unlimited/pair-enumerate.mjs` (a pilot script, not used by the beta) uses a literal
  NUL character as a join separator in two places, so git shows the file as binary. That is how
  the pilot session wrote it; the only edit this session was a one-line unused-variable fix.
- Deployment, pushing and merging were not done. To release: push the branch, open a PR, merge,
  confirm Vercel builds it (the Oct 13 note: the Git integration once failed to build a merge).
