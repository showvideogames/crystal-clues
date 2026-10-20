# x15 parent wording fixes (2026-10-20): apply after the blind reviews merge

Wording only. Apply to the final explanation AND the matching per-word lines via correct-text.mjs, note "parent post-review wording fix (x15, 2026-10-20)". Raw review files and verdicts stay unchanged. Row numbers are x15-batch.json order (1-based).

- #54 DODGE: use the familiar historical name "Dodge Ram pickup", not "Dodge sells Ram" (the brands are now separate).
- #178 MCDONALD: explain that "Old MacDonald" from the song sounds like McDonald's; do not misspell the song name.
- #202 DAVID: David defeated Goliath with his sling and a stone; avoid the precise killing mechanism.
- #207 EMPEROR: simply connect Japan's emperor and emperor penguins; remove the "last country" claim.
- #34 TINKERBELL: simply Peter Pan's fairy; no naming derivation.
- #87 PRIME: mention "prime number" with no definition, or define it as an integer greater than one divisible only by one and itself.
- #96 BALL: may use a cannonball fired from a cannon, plus a cannonball jump into a swimming pool; the existing billiards route is also valid.

Then return: ALL held candidates, final MD/CSV tables, exact counts, successful test exit codes, the local commit and usage. Stop after x15.

## Additional coordinator text fixes (parent full-CSV review; also apply)
- #38 PLANT: "To plant a bug is to hide a listening device."
- #108 NEST: remove the One Flew Over the Cuckoo's Nest statement; use "Some cuckoos lay their eggs in other birds' nests."
- #148 FASHION: "Coco Chanel was a famous fashion designer" (not that she personally created Chanel No. 5).
- #155 (main explanation): "A major scale is a familiar musical scale, and major is a military rank."
- #158 SHORT: "A short circuit can blow a fuse" (fuses blow; breakers trip).
- #161 WAITER: both per-word lines connect the waiter to the familiar complaint about a fly in the soup.
- #182 HOOK: "After eating his hand, the crocodile keeps chasing Captain Hook" (not "the rest of his hand").
- #193 CHESS: "Check means the king is under attack."
- #198 ISLAND: say explicitly that Wilson is the volleyball companion of the man stranded on an island in Cast Away.
State: all 5 x15 reviews are merged (207 PASS / 5 BORDERLINE / 1 FAIL), uncommitted; x15-calls.json is written. Next: apply all 16 fixes, then test, tables and commit.
