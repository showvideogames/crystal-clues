# x15 parent decisions, round 2 (2026-10-20): to do, in order

Coordinator decisions (overrides.json coordinator_accept / held, "parent review of x15 holds"; raw reviews unchanged):
1. JAM + PICKLE: serve TROUBLE (catalogue add by "parent (coordinator selection, 2026-10-20)", explanation "In a jam and in a pickle both mean in trouble."). Keep JAR as a valid, less-preferred option: held with reason "valid but less preferred; not false".
2. Accept ITALY + TRUNK -> BOOT (coordinator_accept; the FAIL is kept as the historical model verdict). The familiar British word for a car trunk is a valid connection many Americans know.
3. Accept PUNCH + SOCK -> PUPPET (consistent with the accepted Punch and Judy family).
4. Accept CROW + TOWER -> ROOK, with a moderate-familiarity tag (clue.reference = {recognizability: "moderate", note}).
5. Accept CREAM + TENNIS and CREAM + GRASS -> WIMBLEDON, moderate-familiarity tags (a real, well-known tradition). Do not generalize to obscure regional references.

Audit: was the blanket "British-only automatic fail" rubric assistant-invented? Find its source with file and history evidence (as for SYNONYM-RULE-ANALYSIS.md). If it was, remove the categorical ban from data/unlimited/reviewer-brief-template.md (future guidance only), keeping the general-U.S.-audience and common-knowledge standard and honest familiarity flags. Write a readable audit file in unlimited-preview/x15 and attach it. Also adjust the catalogue-lib adviseKind "british_only" -> not a rule (like synonym), plus a test.

Player-text cleanup (correct-text.mjs, note "parent text cleanup (x15, 2026-10-20)"):
- HOURGLASS: a timekeeper that measures passing time with sand.
- OZ: the per-word lines say they ask the Wizard of Oz for a brain / a heart.
- LUCY: the lines refer directly to the song title ("Lucy in the Sky with Diamonds"), not "Lucy has diamonds".
- SKELLINGTON: the Christmas line is "Jack arranges Santa's kidnapping and tries to take over Christmas."; the Halloween line is "Jack is Halloween Town's Pumpkin King." Do not say he personally abducts Santa or the mayor.
- NARNIA and the crocodile clock line: leave as they are.

Then: validate the export, check test exit codes, commit locally, refresh and attach the x15 final MD/CSV (scratchpad x15-table.cjs, updated counts).
Then x16: about 200 under-covered proposed-core pair candidates, using the same pipeline as x15 (2 drafters via x15-style inputs in data/unlimited/expansion/x16, x14-check.mjs, a copied build script, early table, 5 blind reviewers with briefs from the template, merge, fixes, tests, tables, commit, stop). Included usage only, extras OFF, no padding, no duplicate calls.
