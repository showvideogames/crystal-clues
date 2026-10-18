# Owner feedback notes (discussion only)

Relayed by the parent on 2026-10-18 with the random-Unlimited task. **No replacement, hold or global restriction was approved; nothing below has been changed.** Each hint stays the served choice for its pair and can appear on random boards.

| Hint | Pair | Status | Served as | Blind a/b/fair | Reveal text (unchanged) |
|---|---|---|---|---|---|
| HEIST | BANK + DIAMOND | ai_reviewed | provisional (only choice) | 2/2/2 (claude-fable-5-1) | The diamond heist and the bank job are the same film plot. |
| DENTIST | BRIDGE + CROWN | ai_reviewed | provisional (only choice) | 2/2/2 (claude-fable-5-1) | A crown and a bridge are both things a dentist fits in your mouth. |
| SALEM | CAT + WITCH | ai_reviewed | provisional (only choice) | 2/2/2 (claude-fable-5-1) | Salem: the witch trials, and Sabrina's cat. |
| HALLOWEEN | BAT + SPIDER | ai_reviewed | provisional (only choice) | 2/2/2 (claude-fable-5-1) | Both are Halloween decorations. |

Live boards are also unchanged: DOUBLOON and BACK keep their frozen live snapshots in pool.json (beta-01/02), which this change does not touch.

If the owner later decides on any of these, the change is a preference or override in data/unlimited/library, followed by re-running scripts/unlimited/export-random-library.mjs; already-played random boards keep their frozen snapshots.
