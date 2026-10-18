# u27-u30 evidence (generated 2026-10-18T06:47:04.924Z)

## Reviewer model evidence

| Batch | _metadata.model in raw review | Dispatcher | Pairs/hints verified |
|---|---|---|---|
| u27 | claude-opus-5-5 | Agent model=opus | 40 pairs / 101 hints, matched to sealed input before merge |
| u28 | claude-opus-5-5 | Agent model=opus | 40 pairs / 96 hints, matched to sealed input before merge |
| u29 | claude-opus-5-5 | Agent model=opus | 40 pairs / 98 hints, matched to sealed input before merge |
| u30 | claude-opus-5-5 | Agent model=opus | 40 pairs / 98 hints, matched to sealed input before merge |

Authoring for u27-u32: main session, claude-opus-5-5 (system prompt evidence; owner UI verified Opus 5.5 High). Session metadata field still reads claude-fable-5-1 because a session cannot change its own model setting.

## Provenance boundary

- u01-u26: authored and reviewed by claude-fable-5-1; every historical blindReview carries model=claude-fable-5-1. Nothing relabelled.
- u27 onward: blindReview.model=claude-opus-5-5 with modelEvidence pointing to the raw review file.

## Correction: u26 recovery

My 02:16Z status check found no u26 review file. The Fable reviewer wrote the complete file at 02:17Z, one minute later, and then its final reply failed with HTTP 429. At 06:22Z I found and validated the file (40/40 pairs, 118/118 hints) and merged it unchanged with Fable provenance. It was not regenerated.

## Per-batch counts

| Batch | P/B/F | Playable pairs | Held-only | Rejected-only |
|---|---|---|---|---|
| u27 | 63/23/15 | 34 | 6 | 0 |
| u28 | 49/26/21 | 28 | 10 | 2 |
| u29 | 61/26/11 | 31 | 9 | 0 |
| u30 | 51/32/15 | 29 | 9 | 2 |

Library: 1156 of 1225 pairs reviewed, 930 playable, 173 held-only, 53 rejected-only, 69 holes. Hints: 2784 total, 1543 playable, 644 held, 597 rejected.

## Representative strong accepted clues

- BULB for LIGHT+SPRING (2/2/2): A light bulb and a spring bulb like a daffodil take exactly the same word.
- SHINE for LIGHT+STAR (2/2/2): Shine: starlight.
- TWINKLE for LIGHT+STAR (2/2/2): Twinkle: the star's light.
- SIGNAL for LIGHT+TRAIN (2/2/2): Signal: the light that stops the train.
- TUNNEL for LIGHT+TRAIN (2/2/2): Tunnel: the train, and the light at its end.
- RAIL for LIGHT+TRAIN (2/2/2): Rail: light rail, a train.
- SPARKLE for LIGHT+WATER (2/2/2): Sparkle: light on the water.
- RAINBOW for LIGHT+WATER (2/2/2): Rainbow: light through water.
- REFLECTION for LIGHT+WATER (2/2/2): Reflection: light on water.
- MOON for LIGHT+WOLF (2/2/2): Moon: moonlight, and the classic image of a wolf howling at it.
- FABLE for LION+MOUSE (2/2/2): Fable: the lion and the mouse.
- AESOP for LION+MOUSE (2/2/2): Aesop: the lion and the mouse.

## Weakest accepted (playable) clues, lowest blind scores among PASS

- PETER for PIRATE+SHADOW (1/1/1): Peter: the boy with the shadow and the pirates.
- SPOOKY for NIGHT+SHADOW (1/1/1): Spooky: night and shadow.
- CREST for LION+QUEEN (1/1/1): Crest: the Queen's lion.
- RUST for ROBOT+SALT (1/1/2): Rust: salt on the robot.
- PANTRY for MOUSE+SALT (1/1/2): Pantry: salt, and the mouse.
- RABBIT for MOON+SPRING (1/1/2): Many cultures see a rabbit in the moon, and the rabbit is also the animal of spring and Easter.
- MIMIC for ROBOT+SHADOW (1/2/1): Mimic: robot and shadow copy you.
- STARK for QUEEN+WOLF (1/2/1): Stark: the queen, and the wolf.
- ROYAL for QUEEN+TRAIN (2/1/1): Royal: the queen's train.
- FOUNTAIN for PIRATE+SPRING (1/2/1): Fountain: the spring the pirates sought.
- REVENGE for PIRATE+QUEEN (2/1/1): Revenge: the pirate ship named for a queen.
- VISION for NIGHT+SNAKE (2/1/1): Vision: the snake's, at night.

## Pairs with no playable hint (38)

These pairs are not served. Each keeps its reviewed hints and raw rejections.

### Held-only (34): at least one BORDERLINE (or held) best-available hint kept

- LIGHT+SHARK: reviewer best available LANTERN (GLOW held, LANTERN held)
- LION+MOON: reviewer best available NIGHT (NIGHT held, ROAR rejected)
- LION+PIRATE: reviewer best available FLAG (FLAG held, ROAR rejected)
- LION+SHADOW: reviewer best available SCAR (KING held, SCAR held)
- MOON+PIRATE: reviewer best available SAIL (SAIL held, CRESCENT rejected)
- MOON+SHARK: reviewer best available NIGHT (NIGHT held, TIDE rejected)
- MOON+SNAKE: reviewer best available ZODIAC (ZODIAC held, CYCLE held, CURVE held)
- MOON+SPIDER: reviewer best available NIGHT (NIGHT held, WEB rejected)
- MOUSE+OCEAN: reviewer best available SHIP (SHIP held, PAD rejected)
- MOUSE+PIRATE: reviewer best available SHIP (MICKEY held, SHIP held)
- MOUSE+ROCK: reviewer best available HOLE (HOLE held, MICKEY rejected)
- MOUSE+ROSE: reviewer best available GARDEN (GARDEN held, BRAMBLY rejected)
- MOUSE+SHADOW: reviewer best available PUPPET (SCURRY held, PUPPET held)
- MOUSE+STAR: reviewer best available MICKEY (HOLLYWOOD held, MICKEY held)
- MOUSE+WATER: reviewer best available BOTTLE (BOTTLE held, DRIP rejected)
- NIGHT+RING: reviewer best available PHONE (PHONE held, BELL rejected, ENGAGEMENT rejected)
- NIGHT+WATER: reviewer best available SWIM (SWIM held, GLASS rejected)
- OCEAN+TRAIN: reviewer best available COAST (TUNNEL held, COAST held)
- OCEAN+WOLF: reviewer best available SEA (FISH held, SEA held)
- PIRATE+SNAKE: reviewer best available VILLAIN (VILLAIN held, TREASURE held)
- PIRATE+SPIDER: reviewer best available RIGGING (RIGGING held, SHIP rejected)
- PIRATE+WOLF: reviewer best available SEA (SEA held, PACK rejected)
- QUEEN+ROBOT: reviewer best available CHESS (CHESS held, BORG held)
- QUEEN+SALT: reviewer best available TAX (TAX held, LOT rejected)
- QUEEN+SHADOW: reviewer best available MIRROR (MIRROR held, EVIL held)
- QUEEN+SPIDER: reviewer best available WIDOW (WIDOW held, SHELOB rejected)
- QUEEN+STAR: reviewer best available SHOOTING (SHOOTING held, BEAUTY rejected, PROM rejected)
- QUEEN+WATER: reviewer best available MERMAID (MERMAID held, LADY held)
- RING+SALT: reviewer best available CIRCLE (CIRCLE held, RIM held)
- RING+SPIDER: reviewer best available WEB (WEB held, ORB rejected)
- RING+SPRING: reviewer best available COIL (COIL held, BELL rejected)
- RING+STAR: reviewer best available SATURN (HALO held, SATURN held)
- RING+WOLF: reviewer best available CIRCLE (CIRCLE held, HOWL rejected)
- ROBOT+SNAKE: reviewer best available ARM (ARM held, SLITHER rejected)

### Rejected-only (4): every hint failed; no servable best-available

- MOUSE+RING: reviewer best available CLICK (TRAP rejected, CLICK rejected)
- NIGHT+SALT: reviewer best available SEA (SEA rejected, ROAD rejected)
- QUEEN+SHARK: reviewer best available REEF (REEF rejected, LOAN rejected)
- ROBOT+WOLF: reviewer best available PACK (HOWL rejected, PACK rejected)

## Open items for the parent

- VANGOGH (NIGHT+STAR) and PETERPAN (PIRATE+SHADOW): blind PASS, reviewer best_available, held on the one-word form rule (two-word names run together). SKY and PETER serve meanwhile.
- KNIGHT (KING+NIGHT): hold retained on the substring rule; proposed text if accepted: A knight serves the king; knight sounds like night.
- WEEK (NIGHT+SHARK): author had rejected it; the reviewer passed it on weeknight + Shark Week. Player text added after the PASS, flagged textAddedAfterPass.
- Text corrections from reviewer cautions: ROVER (MOON+ROBOT) and MOON (LIGHT+WOLF) reworded so neither states a literal false fact.
