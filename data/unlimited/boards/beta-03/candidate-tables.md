# beta-03 candidate pack: 16 new boards (LOCAL, not exported, not published)

Corrected 2026-10-18T07:08:34.150Z after the parent review of the 64 clues. Seed 1. Selection: strongest eligible: served hint blind strength >= 42 ((a+b)*10+fairness), canonical/preferred choice only, pairs from data/unlimited/boards/beta-01/boards.json + data/unlimited/boards/beta-02/boards.json excluded.

Every served hint is the pair's actual canonical or preferred choice; a pair whose choice is below 2/2/2 is left out, never swapped for a numerically stronger alternative. Held, rejected and run-together-name hints are ineligible. No whole-board semantic or decoy review.

## Corrections in this version

- beta-03-005 BEAR+FIRE: CAMP replaced by SMOKEY, the saved u07 reviewer pick, now an approved canonical preference.
- beta-03-011 BAT+CASTLE: VAMPIRE replaced by DRACULA, the saved u06 reviewer pick, now an approved canonical preference.
- beta-03-015 MOON+SHADOW ECLIPSE and beta-03-013 ROSE+SNAKE GARDEN: parent player text, applied in the library and re-copied into the reveal.
- Same 16 boards, ids, cards, solutions and seed. Focused diff: correction-diff.txt.

## Structural checks

- check-boards: 16/16 PASS (server rules, one-word clues, distinct normalised hints, hint differs from its words, 28 distinct words, bestSubmit at all four rotations, deal never solved at any difficulty, state transitions). See check-output.txt.
- Coverage: 64 distinct pairs; each served hint is playable, raw blind PASS, 2/2/2, and equal to the canonical/preferred choice; reveal text equals the library; no pair from beta-01/02; no own-target substrings; no hint repeated in the batch; no id collision.
- Served by: 20 approved canonical, 44 stable provisional top.
- Hint texts also used in beta-01/02 on different pairs: CARD, BOWL, BURN, CHESS, FROST, REEF.

## Prior 16 boards unchanged

| File | SHA-256 |
|---|---|
| live main a98a9b0 src/unlimited/pool.json | dddd17a34ff84d5b82d699dcc0fc6f576862edc7d36290c7d265ac2a6cb82bbb |
| worktree src/unlimited/pool.json | dddd17a34ff84d5b82d699dcc0fc6f576862edc7d36290c7d265ac2a6cb82bbb |
| beta-01/boards.json | 6d7b29c0c65e518d0ea2e2a7dda9e3425d88434917735bde6e4cca4b4e8099fd |
| beta-02/boards.json | ef8cb4c9163aeb64741b39aad92a71e6222b79aea57eb602fe55b66bec86bed4 |

pool-candidate-simulated.json: append-pool on an isolated copy; 32 boards, the first 16 identical to the live pool, candidates at indices 17-32. The real pool file was not modified.

## beta-03-001

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | BELFRY | BAT + BELL | provisional top | 2/2/2 | claude-fable-5-1 | u06 | The belfry: bells, and bats. |
| 1 | MINERAL | IRON + SALT | provisional top | 2/2/2 | claude-fable-5-1 | u24 | Iron and salt are both minerals a body needs. |
| 2 | ARTHUR | CROWN + KNIGHT | canonical | 2/2/2 | claude-fable-5-1 | u13 | King Arthur: the crown and the knights. |
| 3 | SEA | SHARK + WITCH | provisional top | 2/2/2 | claude-opus-5-5 | u32 | Sea: shark and sea witch. |

Cards: c7: BELL / ICE / GHOST / WITCH; c1: SALT / ROSE / LION / BAT; c5: CROWN / RING / KEY / IRON; c3: STAR / BANK / KNIGHT / SHARK; c6: TRAIN / HORSE / BEAR / KING; c2: GLASS / SPIDER / HEART / GOLD; c4: LIGHT / CASTLE / WOLF / SHADOW.

## beta-03-002

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | JUMPING | SPIDER + SPRING | provisional top | 2/2/2 | claude-opus-5-5 | u32 | Jumping: the spider springs. |
| 1 | RIVER | BEAR + WATER | provisional top | 2/2/2 | claude-fable-5-1 | u08 | A bear standing in the river. |
| 2 | CARD | DIAMOND + HEART | provisional top | 2/2/2 | claude-fable-5-1 | u14 | Hearts and diamonds are the two red suits in a deck of cards. |
| 3 | METAL | IRON + ROBOT | provisional top | 2/2/2 | claude-fable-5-1 | u24 | Metal: iron, and the robot. |

Cards: c1: GLASS / ROBOT / SPIDER / WITCH; c7: TRAIN / KING / SPRING / BEAR; c5: WATER / DIAMOND / KNIGHT / ICE; c4: HEART / IRON / STAR / BELL; c6: GHOST / DRAGON / EGG / FISH; c2: SHARK / OCEAN / NIGHT / WOLF; c3: DOG / CASTLE / MOON / SNAKE.

## beta-03-003

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | WAVES | OCEAN + ROCK | canonical | 2/2/2 | claude-opus-5-5 | u29 | Waves: the ocean, on rock. |
| 1 | EASTER | CARD + EGG | provisional top | 2/2/2 | claude-fable-5-1 | u10 | Easter: cards and eggs. |
| 2 | VALENTINE | HEART + ROSE | canonical | 2/2/2 | claude-fable-5-1 | u22 | Red roses and paper hearts are the two images of Valentine's Day. |
| 3 | BOWL | DOG + WATER | provisional top | 2/2/2 | claude-fable-5-1 | u16 | The dog's water bowl. |

Cards: c1: SPRING / SALT / WATER / OCEAN; c2: SHARK / BRIDGE / ROCK / EGG; c3: ROSE / KING / LIGHT / CARD; c6: STAR / HEART / DOG / KNIGHT; c5: ROBOT / GLASS / MOON / HONEY; c7: IRON / SNAKE / BAT / QUEEN; c4: WOLF / BELL / SHADOW / SPIDER.

## beta-03-004

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | DRONE | HONEY + ROBOT | provisional top | 2/2/2 | claude-fable-5-1 | u22 | Drone: the bee, and the robot. |
| 1 | CINDERELLA | GLASS + MOUSE | provisional top | 2/2/2 | claude-fable-5-1 | u20 | Cinderella: glass slipper, mouse friends. |
| 2 | LICK | HORSE + SALT | canonical | 2/2/2 | claude-fable-5-1 | u23 | A salt lick is the block put out in the field for horses. |
| 3 | JEWEL | CROWN + RING | canonical | 2/2/2 | claude-fable-5-1 | u14 | Jewels: in the crown, in the ring. |

Cards: c2: SHADOW / CROWN / ROBOT / BANK; c5: BRIDGE / TRAIN / HONEY / MOUSE; c4: GLASS / HORSE / BEAR / WATER; c3: SNAKE / SALT / RING / ICE; c1: LION / KING / CARD / FISH; c7: CASTLE / DIAMOND / APPLE / GHOST; c6: OCEAN / EGG / ROSE / KEY.

## beta-03-005

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | BURN | BRIDGE + DRAGON | provisional top | 2/2/2 | claude-fable-5-1 | u09 | Burn: bridges, or whatever a dragon breathes on. |
| 1 | BOBBING | APPLE + WATER | provisional top | 2/2/2 | claude-fable-5-1 | u05 | Bobbing for apples in the water. |
| 2 | SMOKEY | BEAR + FIRE | canonical | 2/2/2 | claude-fable-5-1 | u07 | Smokey Bear and forest fires. |
| 3 | NIGHT | BAT + STAR | provisional top | 2/2/2 | claude-fable-5-1 | u07 | Night brings out the bats and the stars. |

Cards: c4: KEY / STAR / BRIDGE / OCEAN; c5: HONEY / DOG / DRAGON / APPLE; c2: WATER / BEAR / MOON / ROBOT; c3: BAT / DIAMOND / PIRATE / FIRE; c7: ROCK / ICE / KING / WITCH; c6: SPRING / SNAKE / NIGHT / SPIDER; c1: BELL / KNIGHT / QUEEN / FISH.

## beta-03-006

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | FLINT | FIRE + ROCK | provisional top | 2/2/2 | claude-fable-5-1 | u18 | Flint: the rock that makes fire. |
| 1 | TWINKLE | LIGHT + STAR | canonical | 2/2/2 | claude-opus-5-5 | u27 | Twinkle: the star's light. |
| 2 | TITANIC | OCEAN + ROSE | provisional top | 2/2/2 | claude-opus-5-5 | u29 | Titanic: Rose, and the ocean. |
| 3 | CAT | DOG + MOUSE | provisional top | 2/2/2 | claude-fable-5-1 | u15 | The cat: chased by the dog, chasing the mouse. |

Cards: c5: ROCK / NIGHT / GOLD / MOUSE; c7: LIGHT / BANK / BAT / FIRE; c2: RING / STAR / OCEAN / IRON; c3: DRAGON / PIRATE / ROSE / DOG; c6: LION / GLASS / CARD / WITCH; c1: FISH / GHOST / HONEY / ICE; c4: SALT / SHADOW / KING / KEY.

## beta-03-007

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | COSTUME | ROBOT + WITCH | provisional top | 2/2/2 | claude-opus-5-5 | u30 | Costume: robot or witch. |
| 1 | KINGDOM | CROWN + KEY | provisional top | 2/2/2 | claude-fable-5-1 | u13 | The keys to the kingdom is the phrase and the crown is what rules the kingdom. |
| 2 | STARS | GOLD + NIGHT | canonical | 2/2/2 | claude-fable-5-1 | u21 | Stars: gold, in the night. |
| 3 | TRUMP | BRIDGE + CARD | provisional top | 2/2/2 | claude-fable-5-1 | u09 | Trump: in bridge, in cards. |

Cards: c2: CARD / WITCH / FIRE / STAR; c4: KEY / DOG / CAT / ROBOT; c5: HEART / CROWN / GOLD / SPRING; c3: LION / MOUSE / NIGHT / BRIDGE; c6: SALT / DIAMOND / WATER / OCEAN; c1: MOON / DRAGON / APPLE / GLASS; c7: BEAR / WOLF / TRAIN / BANK.

## beta-03-008

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | AGE | ICE + IRON | provisional top | 2/2/2 | claude-fable-5-1 | u23 | Age: Ice Age, Iron Age. |
| 1 | BEAR | FISH + HONEY | provisional top | 2/2/2 | claude-fable-5-1 | u18 | The bear: fish and honey eater. |
| 2 | TANK | SHARK + TRAIN | provisional top | 2/2/2 | claude-opus-5-5 | u31 | Tank: shark, and train. |
| 3 | CHARGE | BANK + KNIGHT | provisional top | 2/2/2 | claude-fable-5-1 | u05 | A knight charges; so does the bank. |

Cards: c7: GHOST / KNIGHT / IRON / WOLF; c5: HONEY / BRIDGE / SHADOW / ICE; c6: MOUSE / SPIDER / FISH / TRAIN; c3: BANK / SALT / NIGHT / SHARK; c4: DIAMOND / OCEAN / WATER / BAT; c2: GLASS / HEART / ROBOT / SNAKE; c1: KEY / BEAR / CARD / ROSE.

## beta-03-009

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | LASER | CAT + LIGHT | provisional top | 2/2/2 | claude-fable-5-1 | u12 | The cat and the laser light. |
| 1 | PREY | MOUSE + SNAKE | canonical | 2/2/2 | claude-opus-5-5 | u28 | Prey: the mouse, for the snake. |
| 2 | RACE | HEART + HORSE | provisional top | 2/2/2 | claude-fable-5-1 | u21 | Horses race and your heart races when you are frightened. |
| 3 | STAKE | FIRE + WITCH | canonical | 2/2/2 | claude-fable-5-1 | u18 | The stake: the witch, and the fire. |

Cards: c3: WITCH / CAT / DIAMOND / ROBOT; c2: NIGHT / STAR / LIGHT / MOUSE; c4: SNAKE / HEART / SHADOW / CASTLE; c1: BELL / HORSE / FIRE / SALT; c6: KEY / BANK / DOG / EGG; c5: SHARK / SPRING / ICE / WOLF; c7: ROCK / KING / SPIDER / PIRATE.

## beta-03-010

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | VENOM | SNAKE + SPIDER | canonical | 2/2/2 | claude-opus-5-5 | u32 | Venom: snake and spider. |
| 1 | ROYAL | BANK + KING | provisional top | 2/2/2 | claude-fable-5-1 | u05 | Royal: the bank, and the king. |
| 2 | RING | BELL + DIAMOND | provisional top | 2/2/2 | claude-fable-5-1 | u08 | Ring: what a bell does, what a diamond sits in. |
| 3 | HUNT | DOG + EGG | provisional top | 2/2/2 | claude-fable-5-1 | u15 | A hunt: the dog's job, and the Easter eggs. |

Cards: c3: GLASS / PIRATE / DOG / SNAKE; c4: CARD / SPIDER / KING / QUEEN; c2: BELL / GOLD / SALT / BANK; c6: EGG / CROWN / WATER / DIAMOND; c7: DRAGON / STAR / BEAR / WITCH; c5: LION / LIGHT / KEY / MOUSE; c1: IRON / GHOST / HEART / NIGHT.

## beta-03-011

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | COMB | HONEY + HORSE | canonical | 2/2/2 | claude-fable-5-1 | u22 | A currycomb grooms the horse and honeycomb holds the honey. |
| 1 | DRACULA | BAT + CASTLE | canonical | 2/2/2 | claude-fable-5-1 | u06 | Dracula: his castle, and his bat form. |
| 2 | CHESS | KING + KNIGHT | canonical | 2/2/2 | claude-fable-5-1 | u25 | Chess: king and knight. |
| 3 | SILVER | BELL + MOON | provisional top | 2/2/2 | claude-fable-5-1 | u09 | Silver bells under a silvery moon. |

Cards: c5: HORSE / SNAKE / DRAGON / MOON; c7: BAT / WITCH / DIAMOND / HONEY; c4: SHARK / CAT / CASTLE / KING; c2: BELL / ROSE / FIRE / KNIGHT; c6: GHOST / PIRATE / HEART / SPIDER; c3: ROBOT / SHADOW / BEAR / DOG; c1: ROCK / FISH / GLASS / ICE.

## beta-03-012

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | FROZEN | BANK + ICE | provisional top | 2/2/2 | claude-fable-5-1 | u05 | A frozen account; frozen into ice. |
| 1 | FISH | LION + OCEAN | provisional top | 2/2/2 | claude-opus-5-5 | u27 | Fish: the lionfish, in the ocean. |
| 2 | ROBBER | PIRATE + TRAIN | provisional top | 2/2/2 | claude-opus-5-5 | u29 | Robber: of the sea, or of the train. |
| 3 | MINE | GOLD + SALT | canonical | 2/2/2 | claude-fable-5-1 | u21 | Mines: gold or salt. |

Cards: c5: BANK / CASTLE / MOUSE / SALT; c2: ROBOT / ICE / OCEAN / BELL; c1: LION / PIRATE / BRIDGE / GLASS; c3: GOLD / DRAGON / SHADOW / TRAIN; c6: WOLF / GHOST / RING / FISH; c4: LIGHT / SPIDER / SHARK / HONEY; c7: ROSE / KNIGHT / APPLE / BEAR.

## beta-03-013

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | GARDEN | ROSE + SNAKE | provisional top | 2/2/2 | claude-opus-5-5 | u31 | A rose garden; the serpent in the Garden of Eden. |
| 1 | SUN | GOLD + MOON | provisional top | 2/2/2 | claude-fable-5-1 | u21 | Sun: gold, partner to the moon. |
| 2 | MOON | NIGHT + WOLF | canonical | 2/2/2 | claude-opus-5-5 | u29 | Moon: the night's, and the wolf's. |
| 3 | ARCH | BRIDGE + CAT | provisional top | 2/2/2 | claude-fable-5-1 | u09 | An arch: a bridge's, or a cat's back. |

Cards: c2: BRIDGE / ROSE / SHADOW / WITCH; c1: GOLD / DRAGON / ROBOT / SNAKE; c5: MOON / WOLF / DIAMOND / IRON; c4: CAT / SHARK / MOUSE / NIGHT; c6: FIRE / CASTLE / DOG / ICE; c7: KING / KNIGHT / CARD / BELL; c3: HEART / APPLE / LIGHT / WATER.

## beta-03-014

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | MAY | QUEEN + SPRING | provisional top | 2/2/2 | claude-opus-5-5 | u30 | May: spring, and its queen. |
| 1 | FROST | ICE + NIGHT | provisional top | 2/2/2 | claude-fable-5-1 | u23 | Frost: ice, overnight. |
| 2 | REEF | FISH + ROCK | provisional top | 2/2/2 | claude-fable-5-1 | u19 | The reef: rock, and fish. |
| 3 | ENGAGEMENT | DIAMOND + RING | canonical | 2/2/2 | claude-fable-5-1 | u14 | The diamond engagement ring. |

Cards: c7: BELL / RING / SPRING / CAT; c6: ROSE / QUEEN / ICE / STAR; c1: ROCK / WITCH / KING / NIGHT; c4: EGG / WOLF / FISH / DIAMOND; c2: MOUSE / APPLE / HORSE / IRON; c5: BAT / FIRE / DRAGON / CASTLE; c3: SPIDER / BANK / DOG / GOLD.

## beta-03-015

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | ANNE | PIRATE + QUEEN | provisional top | 2/2/2 | claude-opus-5-5 | u29 | Anne: Queen Anne's Revenge, the pirate ship. |
| 1 | PREDATOR | LION + SHARK | canonical | 2/2/2 | claude-opus-5-5 | u27 | Predator: lion and shark. |
| 2 | HALO | LIGHT + RING | canonical | 2/2/2 | claude-fable-5-1 | u26 | Halo: a ring of light. |
| 3 | ECLIPSE | MOON + SHADOW | canonical | 2/2/2 | claude-opus-5-5 | u27 | A solar or lunar eclipse involves the Moon and a shadow. |

Cards: c1: QUEEN / SNAKE / BEAR / SHADOW; c5: CASTLE / ICE / PIRATE / SHARK; c7: KEY / NIGHT / LION / RING; c2: WITCH / BANK / LIGHT / MOON; c4: GHOST / WATER / CROWN / CARD; c6: BELL / GLASS / BRIDGE / DOG; c3: DRAGON / HORSE / SPIDER / OCEAN.

## beta-03-016

| # | Clue | Pair | Served by | Blind a/b/fair | Reviewer model | Source | Reveal |
|---|---|---|---|---|---|---|---|
| 0 | LEO | LION + STAR | provisional top | 2/2/2 | claude-opus-5-5 | u27 | Leo: the lion in the stars. |
| 1 | CAVIAR | EGG + FISH | provisional top | 2/2/2 | claude-fable-5-1 | u17 | Caviar: fish eggs. |
| 2 | GOWN | QUEEN + TRAIN | provisional top | 2/2/2 | claude-opus-5-5 | u30 | Gown: the queen's, with a long train. |
| 3 | TREASURE | DRAGON + PIRATE | provisional top | 2/2/2 | claude-fable-5-1 | u16 | Treasure: dragon's and pirate's. |

Cards: c6: IRON / PIRATE / LION / GLASS; c1: NIGHT / DOG / STAR / FISH; c2: QUEEN / WITCH / HORSE / EGG; c5: TRAIN / DRAGON / SPRING / CAT; c4: ROSE / LIGHT / SHARK / SNAKE; c7: BAT / KEY / SALT / ROCK; c3: CROWN / WOLF / OCEAN / BEAR.

