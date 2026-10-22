#!/usr/bin/env node
// Builds the x12 candidate batch (main session drafting, no model calls): independent ideas
// emphasising clever double meanings and familiar references, with gradual BAND and VIDEO GAME
// coverage. Every row is checked: bank words, the hint rule, recorded rejections/holds, hints
// already recorded for the pair, and pairs that are already served (left alone).
// Row: HINT | A | B | explanation | line for A | line for B | theme
//   node scripts/unlimited/x12-build-batch.mjs [--report <out.json>]
import { writeFileSync } from "node:fs";
import { loadCatalogue, pairOf, hintProblem, hintKey, servedHints, PLAYABLE } from "./catalogue-lib.mjs";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

const ROWS = `RING|BAND|WEDDING|A wedding band is the ring you wear after the wedding.|A band is another word for a ring.|A wedding ring is the classic wedding band.|band
RING|BAND|FINGER|A band is a ring, and a ring goes on your finger.|A band is another word for a ring.|You wear a ring on your finger.|band
RUBBER|BAND|ELASTIC|A rubber band is a loop of elastic rubber.|A rubber band.|Rubber is stretchy and elastic.|band
STRAP|BAND|WATCH|A watch band is the strap that holds the watch on your wrist.|A watch band is a strap.|A watch is held on by a strap.|band
PARADE|BAND|MARCH|A marching band marches in the parade.|Marching bands play in parades.|Bands march down the street in a parade.|band
TOUR|BAND|BUS|Bands go on tour in a tour bus.|Bands go on tour.|A tour bus carries the band from show to show.|band
GROUPIE|BAND|FAN|A groupie is a superfan who follows a band.|A groupie follows a band.|A groupie is a devoted fan.|band
DRUM|BAND|EAR|Your eardrum is in your ear, and the drummer keeps the band's beat.|Every band needs a drum.|Your eardrum is inside your ear.|band
DRUMSTICK|BAND|TURKEY|A drumstick is a turkey leg and the stick a band's drummer plays with.|A band's drummer plays with drumsticks.|A turkey leg is called a drumstick.|band
WHO|BAND|DOCTOR|The Who is a rock band, and Doctor Who is the famous time traveller.|The Who is a classic rock band.|Doctor Who is the famous TV time traveller.|band
QUEEN|BAND|KING|Queen is a rock band, and a queen rules beside the king.|Queen is the band behind "Bohemian Rhapsody."|A king and queen rule together.|band
QUEEN|BAND|CHESS|Queen is a rock band, and the queen is the strongest chess piece.|Queen is the band behind "Bohemian Rhapsody."|The queen is the most powerful chess piece.|band
EAGLES|BAND|BIRD|The Eagles are a rock band, and eagles are big birds.|The Eagles are the band behind "Hotel California."|Eagles are birds of prey.|band
EAGLES|BAND|HOTEL|"Hotel California" is the Eagles' most famous song.|The Eagles are a famous rock band.|"Hotel California" is their signature song.|band
EAGLES|BAND|FOOTBALL|The Eagles are a rock band and Philadelphia's football team.|The Eagles are a famous rock band.|The Philadelphia Eagles play football.|band
TOTO|BAND|AFRICA|Toto is the band that sang "Africa."|Toto is a rock band.|"Africa" is Toto's most famous song.|band
TOTO|BAND|DOG|Toto is a rock band and Dorothy's little dog in The Wizard of Oz.|Toto is the band behind "Africa."|Toto is Dorothy's dog in The Wizard of Oz.|band
IMAGINE|BAND|DRAGON|Imagine Dragons is a hit rock band.|Imagine Dragons is a band.|Their name ends with dragons.|band
SMASHING|BAND|PUMPKIN|The Smashing Pumpkins are a famous 90s band.|The Smashing Pumpkins are a rock band.|Their name is about smashing pumpkins.|band
GUNS|BAND|ROSE|Guns N' Roses is a famous rock band.|Guns N' Roses is a rock band.|The band's name ends with roses.|band
SERGEANT|BAND|PEPPER|Sgt. Pepper's Lonely Hearts Club Band is a classic Beatles album.|The album title ends with "Club Band."|Sergeant Pepper is the album's title character.|band
ROLLING|BAND|STONE|The Rolling Stones are one of the most famous bands ever.|The Rolling Stones are a rock band.|A rolling stone gathers no moss.|band
ZEPPELIN|BAND|LEAD|Led Zeppelin got its name from the joke that it would go down like a lead balloon.|Led Zeppelin is a classic rock band.|Its name comes from a "lead balloon" joke.|band
FLOYD|BAND|PINK|Pink Floyd is a legendary rock band.|Pink Floyd is a rock band.|The band's name starts with Pink.|band
ABBEY|BAND|ROAD|Abbey Road is the Beatles album with the famous street-crossing cover.|Abbey Road is a Beatles album.|The cover shows the band crossing Abbey Road.|band
GIRLS|BAND|SPICE|The Spice Girls were a hugely popular girl band.|The Spice Girls were a pop band.|Their name starts with Spice.|band
KISS|BAND|VALENTINE|KISS is a face-painted rock band, and a kiss is a classic Valentine's moment.|KISS is a rock band famous for face paint.|A kiss is a Valentine's Day classic.|band
POLICE|BAND|THIEF|The Police were a hit rock band, and the police catch thieves.|The Police were the band behind "Every Breath You Take."|The police chase thieves.|band
DOORS|BAND|WINDOW|The Doors were a classic rock band, and every house has doors and windows.|The Doors were a rock band.|Doors and windows go together.|band
ROCK|BAND|GARAGE|A garage band plays rock in somebody's garage.|Bands play rock music.|Garage rock is made in a garage.|band
ABBA|BAND|DANCE|ABBA is the band behind "Dancing Queen."|ABBA is a famous pop band.|"Dancing Queen" is ABBA's big dance hit.|band
KONG|VIDEO GAME|DONKEY|Donkey Kong is the classic barrel-throwing video game.|Donkey Kong is a classic video game.|Donkey Kong is a giant ape named "Donkey."|game
MARIO|VIDEO GAME|MUSHROOM|Mario grows bigger when he eats a mushroom.|Mario is the most famous video game hero.|In the games, a mushroom makes Mario grow.|game
MARIO|VIDEO GAME|PIPE|Mario travels through green pipes.|Mario is the most famous video game hero.|Mario dives through green pipes.|game
ZELDA|VIDEO GAME|LINK|In The Legend of Zelda, the hero is named Link.|The Legend of Zelda is a classic video game series.|Link is the hero of Zelda.|game
ANGRY|VIDEO GAME|BIRD|Angry Birds is the hit game of slingshotting birds.|Angry Birds is a famous mobile game.|The game's heroes are angry birds.|game
ANGRY|VIDEO GAME|PIG|In Angry Birds, the birds knock down the green pigs.|Angry Birds is a famous mobile game.|The green pigs are the birds' enemies.|game
TETRIS|VIDEO GAME|BLOCK|Tetris is the classic game of falling blocks.|Tetris is a classic video game.|In Tetris, you stack falling blocks.|game
MINECRAFT|VIDEO GAME|DIAMOND|Diamonds are the prized find in Minecraft.|Minecraft is a hugely popular video game.|Players dig for diamonds in Minecraft.|game
CRUSH|VIDEO GAME|CANDY|Candy Crush is the hit game of matching candies.|Candy Crush is a famous mobile game.|Players match candies to crush them.|game
POKEMON|VIDEO GAME|POCKET|Pokémon is short for "Pocket Monsters."|Pokémon is a huge video game series.|The name comes from "Pocket Monsters."|game
POKEMON|VIDEO GAME|MONSTER|Pokémon is short for "Pocket Monsters."|Pokémon is a huge video game series.|The name comes from "Pocket Monsters."|game
KART|VIDEO GAME|RACE|Mario Kart is the classic kart-racing video game.|Mario Kart is a classic video game.|Players race karts.|game
FROGGER|VIDEO GAME|ROAD|In Frogger, you help a frog cross a busy road.|Frogger is a classic arcade game.|The frog has to cross the road.|game
PLANTS|VIDEO GAME|ZOMBIE|Plants vs. Zombies is a hit video game.|Plants vs. Zombies is a video game.|Zombies attack the plants' garden.|game
HALO|VIDEO GAME|ANGEL|Halo is a famous video game, and an angel wears a halo.|Halo is a hit video game series.|Angels are drawn with halos.|game
INVADERS|VIDEO GAME|SPACE|Space Invaders is a classic arcade game.|Space Invaders is a classic video game.|The invaders come from space.|game
FIGHTER|VIDEO GAME|STREET|Street Fighter is the classic fighting video game.|Street Fighter is a classic video game.|Its title starts with Street.|game
HUNT|VIDEO GAME|DUCK|Duck Hunt is the classic game of shooting ducks with a toy gun.|Duck Hunt is a classic video game.|In Duck Hunt, you aim at flying ducks.|game
PONG|VIDEO GAME|TENNIS|Pong, one of the first video games, is a simple game of table tennis.|Pong was one of the first video games.|Pong is a game of table tennis.|game
CONTROLLER|VIDEO GAME|REMOTE|You play a video game with a controller, and a TV remote is a controller too.|You play a video game with a controller.|A remote control is a controller.|game
ARCADE|VIDEO GAME|QUARTER|Arcade video games used to cost a quarter a play.|Arcade games are video games.|Arcade games took quarters.|game
NINTENDO|VIDEO GAME|SWITCH|The Nintendo Switch is a video game console, and a switch turns on a light.|Nintendo makes video games.|The Nintendo Switch is a console.|game
HERO|VIDEO GAME|GUITAR|Guitar Hero is the video game of playing along on a plastic guitar.|Guitar Hero is a video game.|You play a toy guitar.|game
BANDICOOT|VIDEO GAME|CRASH|Crash Bandicoot is a classic video game hero.|Crash Bandicoot is a video game.|His name is Crash.|game
KIRBY|VIDEO GAME|VACUUM|Kirby is a video game hero who sucks things up, and Kirby is a vacuum cleaner brand.|Kirby is a Nintendo video game hero.|Kirby is a vacuum cleaner brand.|game
YOSHI|VIDEO GAME|DINOSAUR|Yoshi is Mario's green dinosaur friend.|Yoshi appears in Mario video games.|Yoshi is a dinosaur.|game
PIKACHU|VIDEO GAME|MOUSE|Pikachu is the electric mouse of Pokémon.|Pikachu is the star of Pokémon games.|Pikachu is an electric mouse.|game
SNAKE|VIDEO GAME|PHONE|Snake was the classic game on old mobile phones.|Snake is a classic video game.|It came on old mobile phones.|game
SOLE|FISH|SHOE|A sole is a flat fish and the bottom of a shoe.|Sole is a kind of fish.|The sole is the bottom of a shoe.|double
SCALE|FISH|PIANO|Fish have scales, and pianists practise scales.|Fish are covered in scales.|Pianists practise scales.|double
BASS|FISH|GUITAR|A bass is a fish and a guitar.|Bass is a popular fish.|A bass guitar plays the low notes.|double
PUNCH|FRUIT|BOXER|Fruit punch is a drink, and a boxer throws a punch.|Fruit punch is a fruity drink.|A boxer throws punches.|double
PITCHER|BASEBALL|LEMON|A pitcher throws the baseball, and lemonade is poured from a pitcher.|The pitcher throws the baseball.|Lemonade comes in a pitcher.|double
DIAMOND|BASEBALL|RING|A baseball field is a diamond, and an engagement ring has a diamond.|Baseball is played on a diamond.|An engagement ring has a diamond.|double
BOWL|SOUP|FOOTBALL|Soup goes in a bowl, and the Super Bowl is football's big game.|Soup is served in a bowl.|The Super Bowl is the big football game.|double
CLUB|GOLF|CARD|Golfers swing clubs, and clubs is a suit of cards.|Golfers swing clubs.|Clubs is one of the four card suits.|double
JACK|CARD|CAR|A jack is a playing card and the tool that lifts a car.|The jack is a face card.|A jack lifts a car to change a tire.|double
ACE|CARD|PILOT|An ace is a top card and a top fighter pilot.|The ace is a playing card.|A top fighter pilot is called an ace.|double
ACE|CARD|TENNIS|An ace is a playing card and a serve nobody can return.|The ace is a playing card.|In tennis, an unreturnable serve is an ace.|double
FLUSH|CARD|TOILET|A flush is a poker hand, and you flush a toilet.|A flush is a poker hand.|You flush the toilet.|double
SPADE|CARD|SHOVEL|Spades is a card suit, and a spade is a shovel.|Spades is one of the four card suits.|A spade is a kind of shovel.|double
SUIT|CARD|COURT|A suit is a set of cards, and a lawsuit is settled in court.|Hearts, spades, clubs and diamonds are suits.|A lawsuit goes to court.|double
CHECK|CHESS|BANK|Check is a chess threat, and a check is cashed at a bank.|In chess, "check" threatens the king.|You cash a check at the bank.|double
BISHOP|CHESS|CHURCH|A bishop is a chess piece and a church leader.|The bishop is a chess piece.|A bishop leads in the church.|double
PAWN|CHESS|SHOP|A pawn is a chess piece, and you pawn things at a pawn shop.|The pawn is a chess piece.|A pawn shop lends money against your things.|double
RING|BOXING|WEDDING|Boxers fight in a ring, and you wear a ring after the wedding.|Boxing matches happen in a ring.|A wedding ring.|double
GLOVE|BOXING|BASEBALL|Boxers and baseball players both wear gloves.|Boxers wear gloves.|A baseball glove catches the ball.|double
BELT|BOXING|PANTS|A boxing champion wins a belt, and a belt holds up your pants.|Boxing champions win a title belt.|A belt holds up your pants.|double
SHOT|CAMERA|BASKETBALL|You take a shot with a camera and with a basketball.|A photo is a shot.|You shoot a basketball shot.|double
NET|FISHING|TENNIS|You fish with a net, and a tennis ball crosses the net.|Fishermen use nets.|Tennis is played over a net.|double
COURT|TENNIS|JUDGE|Tennis is played on a court, and a judge rules in court.|Tennis is played on a court.|A judge presides in court.|double
SERVE|TENNIS|WAITER|Tennis players serve, and so do waiters.|Every tennis point starts with a serve.|A waiter serves food.|double
LOVE|TENNIS|VALENTINE|In tennis, "love" means zero, and Valentine's Day is about love.|In tennis, a score of zero is "love."|Valentine's Day celebrates love.|double
STRIKE|BOWLING|MATCH|A strike knocks down every pin, and you strike a match to light it.|A strike knocks down all ten pins.|You strike a match.|double
ALLEY|BOWLING|CAT|You bowl in a bowling alley, and an alley cat lives on the street.|Bowling happens in a bowling alley.|An alley cat is a street cat.|double
EAGLE|GOLF|AMERICA|An eagle is a great golf score and America's national bird.|In golf, two under par is an eagle.|The bald eagle is America's bird.|double
TEE|GOLF|SHIRT|Golfers hit off a tee, and a T-shirt is a tee.|Golfers put the ball on a tee.|A T-shirt is called a tee.|double
GOAL|SOCCER|DREAM|You score a goal in soccer, and a dream is a goal in life.|Soccer players score goals.|A dream is a goal to chase.|double
PITCH|SOCCER|TENT|Soccer is played on a pitch, and you pitch a tent.|A soccer field is a pitch.|You pitch a tent.|double
DRIBBLE|BASKETBALL|BABY|Basketball players dribble, and so do babies.|You dribble a basketball.|Babies dribble.|double
DUNK|BASKETBALL|COOKIE|You dunk a basketball and dunk a cookie in milk.|A slam dunk in basketball.|You dunk a cookie in milk.|double
SLAM|BASKETBALL|DOOR|A slam dunk, and a slammed door.|A slam dunk in basketball.|You slam a door.|double
FOUL|SOCCER|SMELL|A foul in soccer, and a foul smell.|Soccer referees call fouls.|A foul smell stinks.|double
SAVE|SOCCER|COMPUTER|A goalkeeper makes a save, and you save a file on a computer.|A goalkeeper's save stops a goal.|You save your work on a computer.|double
STEAL|BASEBALL|THIEF|A baseball runner can steal a base, and a thief steals.|In baseball, you can steal a base.|A thief steals.|double
CATCH|FISHING|BASEBALL|A fisherman's catch, and a catch in baseball.|A fisherman's catch of the day.|Fielders catch the baseball.|double
REEL|FISHING|MOVIE|A fishing reel, and a reel of movie film.|A fishing rod has a reel.|Movies used to come on reels.|double
TACKLE|FISHING|FOOTBALL|Fishing gear is called tackle, and football players tackle.|Fishing gear is called tackle.|Football players tackle.|double
DATE|PALM|CALENDAR|Dates grow on date palms, and a calendar is full of dates.|Dates grow on palm trees.|A calendar shows the date.|double
DATE|FRUIT|VALENTINE|A date is a sweet fruit and a Valentine's night out.|A date is a sweet fruit.|A Valentine's date.|double
MOLE|SPY|GARDEN|A mole is a secret spy and a burrowing animal that digs up gardens.|A mole is a spy inside an organization.|Moles dig up gardens.|double
CRANE|BIRD|BUILDING|A crane is a tall bird and the machine that lifts building materials.|A crane is a long-legged bird.|Cranes lift materials for buildings.|double
PUPIL|EYE|SCHOOL|The pupil is the dark center of the eye, and a pupil is a student.|The pupil is part of the eye.|A pupil is a school student.|double
TEMPLE|HEAD|CHURCH|Your temple is the side of your head, and a temple is a place of worship.|The temple is the side of your head.|A temple is a place of worship.|double
IRIS|EYE|FLOWER|The iris is the colored part of the eye and a flower.|The iris is the colored part of the eye.|The iris is a flower.|double
LASH|EYE|WHIP|An eyelash is on your eye, and a lash is a stroke of a whip.|An eyelash protects your eye.|A whip delivers a lash.|double
LID|EYE|JAR|An eyelid covers the eye, and a lid covers a jar.|Your eyelid covers your eye.|A jar has a lid.|double
SOCKET|EYE|OUTLET|The eye sits in its socket, and an outlet is a wall socket.|The eye sits in a socket.|An outlet is a socket.|double
TRUNK|CAR|TREE|A car has a trunk, and so does a tree.|A car's trunk holds luggage.|A tree's trunk is its main stem.|double
CURRENT|RIVER|ELECTRICITY|A river has a current, and so does electricity.|A river's current flows downstream.|Electricity flows as a current.|double
CHANNEL|ENGLAND|TELEVISION|The English Channel lies off England, and you change the channel on TV.|The English Channel separates England and France.|You flip TV channels.|double
WINDOWS|COMPUTER|HOUSE|Windows runs on many computers, and a house has windows.|Windows is a computer operating system.|A house has windows.|double
CLOUD|COMPUTER|WEATHER|Computers save files to the cloud, and clouds bring weather.|Computer files live in the cloud.|Clouds bring rain and weather.|double
BUG|COMPUTER|INSECT|A bug is an insect and a computer glitch.|A computer glitch is a bug.|A bug is an insect.|double
SPAM|MAIL|HAM|Spam is junk mail and a canned ham.|Junk email is spam.|Spam is canned ham.|double
TROLL|INTERNET|BRIDGE|A troll lives under the bridge in the fairy tale and stirs up trouble on the internet.|An internet troll stirs up trouble online.|A troll lives under the bridge in "Three Billy Goats Gruff."|double
SURF|INTERNET|BEACH|You surf the internet, and you surf at the beach.|You surf the web.|Surfers ride waves at the beach.|double
CRUST|EARTH|PIZZA|The Earth has a crust, and so does a pizza.|The Earth's outer layer is its crust.|A pizza has a crust.|double
CORE|APPLE|EARTH|An apple has a core, and so does the Earth.|An apple has a core.|The Earth has a hot core.|double
BATTER|BASEBALL|CAKE|The batter hits the baseball, and cake starts as batter.|The batter swings at the pitch.|Cake starts as batter.|double
FILLING|TOOTH|PIE|A dentist puts a filling in a tooth, and a pie has a filling.|A dentist fills a cavity in a tooth.|A pie has a sweet filling.|double
PLAQUE|TOOTH|AWARD|Plaque builds up on teeth, and an award can be a plaque.|Plaque builds up on teeth.|An award plaque hangs on the wall.|double
BUN|HAIR|HAMBURGER|A bun is a hairstyle and the bread around a hamburger.|You can wear your hair in a bun.|A hamburger comes on a bun.|double
STEAK|VAMPIRE|BEEF|A steak is a cut of beef, and it sounds like the stake used against vampires.|A wooden stake stops a vampire in the stories.|A steak is a cut of beef.|double
DOVE|PEACE|SOAP|The dove is a symbol of peace and a famous soap brand.|The dove is a symbol of peace.|Dove is a soap brand.|double
RAVEN|FOOTBALL|POETRY|The Baltimore Ravens play football, and "The Raven" is Poe's famous poem.|The Baltimore Ravens are a football team.|"The Raven" is Edgar Allan Poe's poem.|double
CARDINAL|BASEBALL|CHURCH|The St. Louis Cardinals play baseball, and a cardinal is a church leader.|The St. Louis Cardinals are a baseball team.|A cardinal is a high church official.|double
COLT|HORSE|FOOTBALL|A colt is a young horse, and the Indianapolis Colts play football.|A colt is a young horse.|The Indianapolis Colts are a football team.|double
DOLPHIN|FOOTBALL|OCEAN|The Miami Dolphins play football, and dolphins swim in the ocean.|The Miami Dolphins are a football team.|Dolphins swim in the ocean.|double
HARE|RABBIT|HAIR|A hare is like a big rabbit, and "hare" sounds just like "hair."|A hare is a close cousin of the rabbit.|"Hare" sounds like "hair."|double
SNAIL|MAIL|SLOW|Snail mail is slow paper mail.|Paper mail is "snail mail."|Snails are famously slow.|double
WORM|BOOK|FISHING|A bookworm loves books, and a worm is fishing bait.|A bookworm loves books.|Worms are fishing bait.|double
BUTTERFLY|SWIMMING|CATERPILLAR|The butterfly is a swimming stroke, and a caterpillar becomes a butterfly.|The butterfly is a swimming stroke.|A caterpillar turns into a butterfly.|double
PYTHON|SNAKE|CODE|Python is a big snake and a popular coding language.|A python is a big snake.|Python is a programming language.|double
JAVA|COFFEE|CODE|Java is slang for coffee and a coding language.|Java is slang for coffee.|Java is a programming language.|double
JORDAN|BASKETBALL|RIVER|Michael Jordan is a basketball legend, and the Jordan is a famous river.|Michael Jordan is a basketball legend.|The Jordan River is a famous river.|double
MARS|CHOCOLATE|PLANET|A Mars bar is chocolate, and Mars is the red planet.|A Mars bar is a chocolate bar.|Mars is the red planet.|double
MARS|WAR|PLANET|Mars is the Roman god of war and the red planet.|Mars is the Roman god of war.|Mars is the red planet.|double
PLUTO|DISNEY|PLANET|Pluto is Disney's dog and the most famous former planet.|Pluto is Mickey's dog.|Pluto used to be called the ninth planet.|double
NEPTUNE|SEA|PLANET|Neptune is the Roman god of the sea and a planet.|Neptune is the Roman god of the sea.|Neptune is a planet.|double
ORBIT|GUM|SATELLITE|Orbit is a gum brand, and a satellite orbits the Earth.|Orbit is a brand of gum.|Satellites orbit the Earth.|double
TRIDENT|GUM|SEA|Trident is a gum brand and the sea god's three-pronged spear.|Trident is a brand of gum.|The sea god Poseidon carries a trident.|double
SNICKERS|LAUGH|CHOCOLATE|A snicker is a little laugh, and Snickers is a chocolate bar.|A snicker is a sly laugh.|Snickers is a chocolate bar.|double
HERSHEY|KISS|CHOCOLATE|Hershey's Kisses are bite-sized chocolates.|Hershey's makes chocolate Kisses.|Hershey's is a chocolate brand.|double
NERDS|CANDY|GENIUS|Nerds is a candy, and nerds are brainy.|Nerds is a crunchy candy.|A nerd is a brainy genius type.|double
SPRITE|SODA|FAIRY|Sprite is a lemon-lime soda, and a sprite is a fairy.|Sprite is a soda.|A sprite is a fairy.|double
CRUSH|ORANGE|LOVE|Orange Crush is a soda, and a crush is a little love.|Orange Crush is an orange soda.|A crush is a little love.|double
TRIX|CEREAL|RABBIT|The Trix rabbit always wants the cereal.|Trix is a cereal.|The Trix mascot is a rabbit.|double
LUCKY|CEREAL|LEPRECHAUN|Lucky the Leprechaun is the Lucky Charms mascot.|Lucky Charms is a cereal.|Its mascot is Lucky the Leprechaun.|double
TONY|CEREAL|TIGER|Tony the Tiger sells Frosted Flakes cereal.|Tony is a cereal mascot.|Tony the Tiger.|double
SNAP|CEREAL|CAMERA|Snap, Crackle and Pop sell Rice Krispies, and you snap a photo.|Snap is a cereal mascot.|You snap a photo with a camera.|double
POP|SODA|MUSIC|Pop is soda and a kind of music.|Soda is called pop.|Pop is a kind of music.|double
SCORE|MUSIC|SOCCER|A film's music is its score, and you score a soccer goal.|A score is written music.|You score a goal in soccer.|double
HIT|MUSIC|BASEBALL|A hit song, and a hit in baseball.|A popular song is a hit.|A batter gets a hit.|double
STOCKING|CHRISTMAS|SOCK|A Christmas stocking is a giant sock for presents.|Christmas stockings hang by the chimney.|A stocking is like a long sock.|double
RUDOLPH|DEER|RED|Rudolph the Red-Nosed Reindeer.|Rudolph is a reindeer.|Rudolph has a red nose.|double
GRINCH|CHRISTMAS|THIEF|The Grinch tried to steal Christmas.|The Grinch hates Christmas.|The Grinch is a thief who steals presents.|double
CUPID|VALENTINE|ARROW|Cupid shoots love arrows on Valentine's Day.|Cupid is the face of Valentine's Day.|Cupid shoots arrows of love.|double
RESOLUTION|NEW YEAR|SCREEN|A New Year's resolution, and a screen's resolution.|People make New Year's resolutions.|A screen has a resolution.|double
BALL|NEW YEAR|DANCE|The New Year's Eve ball drops in Times Square, and a ball is a fancy dance.|The ball drops on New Year's Eve.|A ball is a fancy dance.|double
TRICK|HALLOWEEN|MAGIC|"Trick or treat!" on Halloween, and a magician does tricks.|Kids say "trick or treat" on Halloween.|A magician performs tricks.|double
TREAT|HALLOWEEN|DOG|Halloween treats, and treats for a good dog.|Kids collect treats on Halloween.|A good dog gets a treat.|double
NEMO|FISH|CAPTAIN|Nemo is the lost clownfish, and Captain Nemo commands a submarine.|Nemo is the fish in Finding Nemo.|Captain Nemo commands a submarine in the Jules Verne story.|double
STITCH|ALIEN|NEEDLE|Stitch is Disney's little blue alien, and a needle makes a stitch.|Stitch is the alien in Lilo & Stitch.|A needle makes a stitch.|double
ROCKY|BOXER|MOUNTAIN|Rocky is the famous movie boxer, and the Rockies are mountains.|Rocky Balboa is a movie boxer.|The Rocky Mountains.|double
JOKER|CARD|CLOWN|A joker is a playing card and a clown, like Batman's villain.|The joker is a playing card.|A joker is a clown.|double
JASMINE|TEA|PRINCESS|Jasmine is a tea and Aladdin's princess.|Jasmine tea is a popular tea.|Princess Jasmine is from Aladdin.|double
AURORA|NORTH|PRINCESS|The aurora lights up the northern sky, and Aurora is Sleeping Beauty.|The northern lights are the aurora borealis.|Princess Aurora is Sleeping Beauty.|double
GRUMPY|DWARF|CAT|Grumpy is one of the seven dwarfs and the internet's most famous cat.|Grumpy is one of Snow White's seven dwarfs.|Grumpy Cat is a famous internet cat.|double
DAISY|DUCK|FLOWER|Daisy Duck is Donald's girlfriend, and a daisy is a flower.|Daisy Duck is a Disney duck.|A daisy is a flower.|double
PADDINGTON|BEAR|STATION|Paddington Bear is named after the London station where he was found.|Paddington is a famous bear.|Paddington is a London railway station.|double
BALOO|BEAR|JUNGLE|Baloo is the bear in The Jungle Book.|Baloo is a bear.|Baloo lives in The Jungle Book.|double
GARFIELD|CAT|LAZY|Garfield is the famous lazy cartoon cat.|Garfield is a cartoon cat.|Garfield is famously lazy.|double
SNOOPY|DOG|PILOT|Snoopy is Charlie Brown's dog, who plays a flying ace pilot.|Snoopy is a cartoon dog.|Snoopy pretends to be a fighter pilot.|double
SCOOBY|DOG|GHOST|Scooby-Doo is the cartoon dog who chases ghosts.|Scooby-Doo is a cartoon dog.|Scooby and the gang hunt ghosts.|double
GOOFY|DOG|FUNNY|Goofy is Disney's silly dog, and goofy means funny.|Goofy is a Disney dog.|Goofy means silly and funny.|double
ATLAS|MAP|GIANT|An atlas is a book of maps, named after the giant Atlas who held up the sky.|An atlas is a book of maps.|Atlas is the giant who holds up the sky.|double
CYCLOPS|EYE|GIANT|A cyclops is a one-eyed giant.|A cyclops has one eye.|A cyclops is a giant.|double
TROJAN|HORSE|VIRUS|The Trojan Horse hid soldiers, and a trojan is a computer virus.|The Trojan Horse.|A trojan is a kind of computer virus.|double
ACHILLES|HEEL|HERO|Achilles was a Greek hero whose only weak spot was his heel.|An "Achilles heel" is a weak spot.|Achilles was a Greek hero.|double
MIDAS|GOLD|KING|King Midas turned everything he touched to gold.|Midas had the golden touch.|Midas was a king.|double
PANDORA|BOX|RADIO|Pandora's box, and Pandora the music radio app.|Pandora opened the famous box.|Pandora is an internet radio app.|double
ECHO|VOICE|CAVE|Your voice echoes in a cave.|An echo repeats your voice.|Caves echo.|double
VEGAS|CASINO|DESERT|Las Vegas is the casino city in the desert.|Las Vegas is full of casinos.|Las Vegas sits in the desert.|double
GALAXY|PHONE|SPACE|The Galaxy is a phone, and a galaxy is a star system in space.|The Samsung Galaxy is a phone.|A galaxy is a huge star system in space.|double
OLAF|SNOWMAN|DISNEY|Olaf is the snowman from Disney's Frozen.|Olaf is a snowman.|Olaf is a Disney character.|double
ARIEL|SEA|PRINCESS|Ariel is the little mermaid princess under the sea.|Ariel lives under the sea.|Ariel is a Disney princess.|double
THOR|THUNDER|MARVEL|Thor is the god of thunder and a Marvel hero.|Thor is the god of thunder.|Thor is a Marvel hero.|double
COMPASS|NORTH|MAP|A compass points north and helps you read a map.|A compass points north.|You use a compass with a map.|double`;

const ix = loadCatalogue();
const rejections = loadRejections();
const pairs = []; const skipped = [];
for (const line of ROWS.split("\n")) {
  const [hint, x, y, why, lx, ly, theme] = line.split("|");
  const { a, b, id } = pairOf(x, y);
  const why_skip = (r) => skipped.push({ hint, pair: `${a} + ${b}`, reason: r });
  const missing = [a, b].filter((w) => !ix.inBank.has(w));
  if (missing.length) { why_skip(`not in the bank: ${missing.join(", ")}`); continue; }
  const problem = hintProblem(hint, a, b); if (problem) { why_skip(problem); continue; }
  const rec = rejectionFor(rejections, a, b, hint); if (rec) { why_skip(`recorded ${rec.decision} (${rec.by})`); continue; }
  const p = ix.byId.get(id);
  if (p?.clues.some((c) => hintKey(c.text) === hintKey(hint))) { why_skip(`already recorded for the pair (${p.clues.find((c) => hintKey(c.text) === hintKey(hint)).status})`); continue; }
  if (p && p.clues.some((c) => PLAYABLE.has(c.status)) && !p.generationHold && servedHints(ix, p).hints.length) { why_skip(`pair already served (${servedHints(ix, p).hints.map((c) => c.text).join("/")})`); continue; }
  if (pairs.some((q) => q.pair_id === id)) { why_skip("duplicate pair in this batch"); continue; }
  const lines = { [x]: lx, [y]: ly };
  pairs.push({ pair_id: id, a, b, theme, clues: [{ text: hint, type: "x12-proposal", wordAConnection: lines[a], wordBConnection: lines[b], revealExplanation: why, reference: null }], variants: [], rejected: [] });
}
writeFileSync("data/unlimited/library/batches/x12-batch.json", JSON.stringify({ _metadata: { batch: "x12", prepared: "2026-10-20", note: "independent candidates drafted by the main session (no model calls); script-checked against the bank, hint rule, rejections, library and served pairs" }, pairs }, null, 1) + "\n");
const flag = process.argv.indexOf("--report");
if (flag > 0) writeFileSync(process.argv[flag + 1], JSON.stringify({ kept: pairs.length, skipped }, null, 1));
const t = (k) => pairs.filter((p) => p.theme === k).length;
console.log(`${ROWS.split("\n").length} drafted; ${pairs.length} kept (band ${t("band")}, video game ${t("game")}, double/reference ${t("double")}); ${skipped.length} skipped`);
for (const s of skipped) console.log(`  skip ${s.hint} ${s.pair}: ${s.reason}`);
