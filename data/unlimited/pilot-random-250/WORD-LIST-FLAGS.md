# 810-word pilot list: word-quality flags

These flags are for owner review only. No word was removed, and no word was chosen or avoided for being easy or hard to connect. All 810 words were used as given (sha256 `0dae5832…`, identical to `origin/main` `data/unlimited/working-list/cluevoyance-proposed-810-words.txt`).

## 1. Same-root families (the main problem)

When two words from the same family are drawn as a pair, the pair can't get an honest hint: the hint would repeat or contain a target. Members of a family also block each other as hints (for example, AIRPORT can't be the hint for an AIR pair).

- BALL / BASEBALL / BASKETBALL / FOOTBALL; BASKET / BASKETBALL; BASE / BASEBALL; FOOT / FOOTBALL
- BOX / BOXER / BOXING
- BOWL / BOWLING
- FIRE / FIREFIGHTER / FIREWORKS
- ICE / ICE CREAM / CREAM
- FISH / FISHING
- GLASS / GLASSES
- GAME / VIDEO GAME
- HERO / SUPERHERO
- LIGHT / LIGHTNING
- MAGIC / MAGICIAN
- SNOW / SNOWMAN / MAN
- NEW / NEW YEAR / NEW YORK; PAPER / NEWSPAPER
- PRINCE / PRINCESS
- SKATE / SKATEBOARD / BOARD; KEY / KEYBOARD
- SPONGE / SPONGEBOB
- STAR / STAR WARS
- SUIT / SUITCASE / CASE
- SUB / SUBWAY
- SUN / SUNDAY; DAY / SUNDAY / BIRTHDAY
- AIR / AIRPORT / PORT
- FLY / BUTTERFLY

None of the 250 pilot pairs is a same-family pair. Some pilot pairs were still blocked by the rule:
- FIREFIGHTER + WILD can't use WILDFIRE.
- NUMBER + PORT can't use PASSPORT.
- ARM + ASTRONAUT can't use ARMSTRONG.

## 2. Reference-only words

Any hint for these words needs the reference: SPONGEBOB, MARIO, BARBIE, LEGO, OREO, DISNEY, MARVEL, STAR WARS, EINSTEIN, SHAKESPEARE, TITANIC, CINDERELLA, HOLLYWOOD.

These are fine game words, but they push pairs toward reference hints. For those pairs a reference-free alternative is often impossible.

## 3. Near-synonym and size words

BIG, LARGE, SMALL, SHORT, THIN, FULL, HARD, SOFT, HOT, COLD, COOL, FAST, SLOW, NEW, OLD, RIGHT, FIRST, HIGH, DOWN.

Adjectives and directions draw many generic "category" hints. Several pilot NO_GOOD_HINT pairs involve them (FULL + WINTER, RIGHT + SHELL).

## 4. Light content-sensitivity words

GOD, DEVIL, BOMB, BLOOD, DEAD, POISON, CASINO, WAR, KISS, TOILET.

They aren't wrong for the game. Note them if the beta audience includes children.

## 5. Format notes

- **Multi-word entries:** ICE CREAM, NEW YEAR, NEW YORK, STAR WARS, VIDEO GAME.
- **Single words with several meanings:** BUCK, DRAFT, MASS, LEAD (two pronunciations), TAP, PIT, RAM, RAY, TAG and LAP all have several senses. That is good for wordplay, but meaning drift can confuse players.
