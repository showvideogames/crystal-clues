#!/usr/bin/env node
// Adds the x04b checkpoint (25 more hint families) to the related-word index,
// leaning on scenes, pop culture, visual analogies and shared situations
// (coordinator review 2026-10-19). Route notation as in x04-build-routes.mjs;
// a route id starting with "*" may also pair two of its own words (one shared
// work or scene: WAND + OWL -> POTTER). Re-running replaces the x04b entries.
import { readFileSync, writeFileSync } from "node:fs";

const F = {
  POTTER: [
    "*hp | Harry Potter | WIZARD:2:Harry Potter is the world's most famous boy wizard ; WAND:2:Harry Potter casts spells with his wand ; OWL:2:Harry Potter's owl Hedwig delivers his mail ; BROOM:2:Harry Potter flies a broom at Quidditch ; HOGWARTS:2:Harry Potter studies at Hogwarts ; GLASSES:2:Harry Potter wears round glasses ; LIGHTNING:2:Harry Potter has a lightning-bolt scar ; CLOAK:1:Harry Potter hides under an invisibility cloak ; TRAIN:1:Harry Potter rides the Hogwarts Express ; MAGIC:1:Harry Potter goes to a school of magic",
    "pottery | a potter | BOWL:2:a potter shapes bowls from clay ; WHEEL:2:a potter shapes clay on a spinning wheel ; MUG:1:a potter makes clay mugs" ],
  GOTHAM: [
    "*city | Batman's Gotham City | BAT:2:Batman protects Gotham City ; PENGUIN:2:the Penguin is a Gotham City villain ; JOKE:1:the Joker terrorizes Gotham City ; CAT:1:Catwoman prowls the rooftops of Gotham ; CAVE:1:the Batcave is hidden beneath Wayne Manor, just outside Gotham City ; NIGHT:1:Batman patrols Gotham by night ; SUPERHERO:1:Batman is Gotham City's superhero" ],
  OGRE: [
    "*shrek | Shrek | SHREK:2:Shrek is the world's most famous ogre ; DONKEY:2:Donkey is the ogre Shrek's best friend ; LAYER:2:Shrek says ogres are like onions: they have layers ; PRINCESS:1:Princess Fiona turns out to be an ogre too",
    "monster | a fairy-tale brute | FAIRYTALE:2:ogres are fairy-tale monsters ; GIANT:1:ogres are giant brutes from old stories ; MONSTER:1:an ogre is a hulking monster ; TROLL:1:ogres and trolls are both fairy-tale brutes" ],
  PIXAR: [
    "*films | Pixar movies | TOY:2:Toy Story was Pixar's first feature film ; LAMP:2:Pixar's logo is a hopping desk lamp ; CAR:2:Pixar made Cars ; FISH:2:Pixar's Finding Nemo follows a lost clownfish ; ROBOT:2:Pixar's WALL-E is a lonely little robot ; MONSTER:2:Pixar made Monsters, Inc. ; RAT:2:Pixar's Ratatouille stars a rat who cooks ; HOUSE:1:in Pixar's Up, a house floats away on balloons ; DISNEY:1:Pixar is part of Disney" ],
  SHERLOCK: [
    "*holmes | Sherlock Holmes | DETECTIVE:2:Sherlock Holmes is the most famous fictional detective ; PIPE:2:Sherlock Holmes is pictured puffing a pipe ; LONDON:2:Sherlock Holmes lives on Baker Street in London ; HAT:1:Sherlock Holmes wears a deerstalker hat ; VIOLIN:1:Sherlock Holmes plays the violin ; SUSPECT:1:Sherlock Holmes unmasks the guilty suspect" ],
  APOLLO: [
    "moon | the Apollo missions | MOON:2:Apollo 11 landed on the Moon ; NASA:2:Apollo was NASA's Moon program ; ASTRONAUT:2:Apollo astronauts walked on the Moon ; SPACE:1:the Apollo missions flew into space",
    "god | the Greek god | SUN:2:Apollo is the Greek god of light, often linked with the sun ; GOD:1:Apollo is a Greek god ; MUSIC:1:Apollo is also the Greek god of music ; GREECE:1:Apollo was worshipped in ancient Greece",
    "theater | Harlem's Apollo | THEATER:1:Harlem's Apollo Theater is a legendary music hall" ],
  ICEBERG: [
    "titanic | the Titanic | TITANIC:2:the Titanic sank after hitting an iceberg ; SHIP:2:icebergs are a danger to every ship",
    "polar | polar seas | ANTARCTICA:2:giant icebergs break off Antarctica ; POLAR:2:icebergs float in polar seas ; PENGUIN:1:penguins ride on icebergs ; OCEAN:1:icebergs drift across the ocean" ],
  PICNIC: [
    "gear | the picnic spread | BASKET:2:you pack lunch in a picnic basket ; BLANKET:2:you spread out a picnic blanket",
    "place | where you picnic | PARK:2:people picnic in the park ; GRASS:1:a picnic is lunch on the grass ; SUMMER:1:summer is picnic season",
    "pests | uninvited guests | ANT:2:ants always crash a picnic ; BEAR:2:Yogi Bear steals \"pic-a-nic\" baskets" ],
  CAMPFIRE: [
    "*stories | campfire stories | STORY:2:ghost stories are told around the campfire ; GHOST:2:spooky ghost stories are a campfire tradition ; SONG:1:campers sing campfire songs",
    "setup | building the fire | LOG:2:logs keep a campfire burning ; WOOD:2:you gather wood for the campfire ; TENT:2:a campfire crackles outside the tent ; SMOKE:1:campfire smoke drifts into the night" ],
  STRIPES: [
    "animals | striped animals | ZEBRA:2:zebras are covered in black and white stripes ; TIGER:2:tigers have orange and black stripes ; BEE:1:bees have yellow and black stripes",
    "uniform | striped uniforms | REFEREE:2:referees wear black-and-white stripes ; PRISON:1:old-time prison uniforms had stripes",
    "candy | a candy cane | CANE:2:a candy cane has red-and-white stripes ; CANDY:1:candy canes have red-and-white stripes" ],
  SPOTS: [
    "animals | spotted animals | LADYBUG:2:a ladybug has black spots ; GIRAFFE:2:a giraffe is covered in brown spots ; DOG:1:Dalmatians are spotted dogs ; COW:1:many cows have black-and-white spots",
    "dice | dots on dice | DICE:2:dice show their numbers as spots",
    "place | X marks the spot | TREASURE:1:on a treasure map, X marks the spot ; MAP:1:on a treasure map, X marks the spot" ],
  POOH: [
    "*hundredacre | Winnie the Pooh | BEAR:2:Winnie the Pooh is a teddy bear ; HONEY:2:Winnie the Pooh loves honey ; TIGER:1:Tigger, Pooh's bouncy friend, is a tiger ; DONKEY:1:Eeyore, Pooh's gloomy friend, is a donkey ; PIG:1:Piglet, Pooh's tiny friend, is a pig ; OWL:1:Owl is one of Pooh's friends ; RABBIT:1:Rabbit is one of Pooh's friends ; WOOD:1:Pooh lives in the Hundred Acre Wood" ],
  ELF: [
    "santa | Santa's helpers | SANTA:2:elves help Santa get ready for Christmas ; TOY:2:Santa's elves build the toys ; CHRISTMAS:2:elves are a Christmas tradition ; NORTH:1:Santa's elves live at the North Pole",
    "movie | the movie Elf | MOVIE:1:Elf is the Christmas movie starring Will Ferrell",
    "fantasy | fantasy elves | EAR:2:elves have pointy ears ; ARROW:1:fantasy elves like Legolas are master archers ; FAIRY:1:elves and fairies are magical folk ; SHOE:1:in the fairy tale, elves secretly make the shoemaker's shoes" ],
  GARLIC: [
    "vampire | warding off vampires | VAMPIRE:2:garlic is said to keep vampires away",
    "cooking | in the kitchen | BREAD:2:garlic bread is a favorite side ; PIZZA:1:garlic tops plenty of pizzas ; ITALY:1:Italian cooking loves garlic ; KITCHEN:1:garlic is a kitchen staple",
    "smell | the smell | SMELL:2:garlic has a strong smell" ],
  SONIC: [
    "*hedgehog | Sonic the Hedgehog | VIDEO GAME:2:Sonic is Sega's video game hedgehog ; BLUE:2:Sonic is a blue hedgehog ; FAST:2:Sonic is famously fast ; RING:2:Sonic collects golden rings",
    "sound | the speed of sound | BOOM:2:a jet breaking the sound barrier makes a sonic boom ; SOUND:1:sonic means having to do with sound ; JET:1:a jet can break the sound barrier with a sonic boom" ],
  DISCO: [
    "*dance | the disco era | DANCE:2:disco is music made for dancing ; BALL:2:a disco ball spins over the dance floor ; MIRROR:2:a disco ball is covered in tiny mirrors ; FEVER:2:Saturday Night Fever is the classic disco movie ; LIGHT:1:disco floors flash with colored lights ; MUSIC:1:disco is 1970s dance music ; PARTY:1:a disco is a dance party" ],
  MIDNIGHT: [
    "cinderella | Cinderella's deadline | CINDERELLA:2:Cinderella must leave the ball by midnight",
    "clock | the stroke of twelve | CLOCK:2:the clock strikes twelve at midnight ; NEW YEAR:2:the New Year begins at midnight",
    "snack | a midnight snack | SNACK:2:a late-night bite is a midnight snack",
    "color | midnight blue | BLUE:1:midnight blue is a very dark blue" ],
  JAWS: [
    "*movie | the movie Jaws | SHARK:2:Jaws is the classic shark movie ; BEACH:2:Jaws made beachgoers afraid to swim ; MOVIE:1:Jaws was the first summer blockbuster",
    "bond | the Bond villain | BOND:1:Jaws is the steel-toothed henchman from the James Bond films",
    "mouth | your jaws | MOUTH:2:your jaws open and close your mouth ; TOOTH:1:your teeth sit in your jaws ; BITE:2:your jaws clamp shut when you bite" ],
  WALRUS: [
    "look | the walrus look | MOUSTACHE:2:a big droopy mustache is called a walrus mustache ; IVORY:2:a walrus's tusks are ivory",
    "habitat | life on the ice | SEAL:2:the walrus is a big cousin of the seal ; ICE:1:walruses haul out onto the ice ; POLAR:1:walruses live in polar waters" ],
  RAINBOW: [
    "*gold | the end of the rainbow | LEPRECHAUN:2:a leprechaun's pot of gold waits at the end of the rainbow ; GOLD:2:legend says there's a pot of gold at the end of the rainbow ; UNICORN:2:unicorns and rainbows go together",
    "sky | in the sky | COLOR:2:a rainbow spreads sunlight into a band of colors ; STORM:1:a rainbow can appear after a storm ; SKY:1:a rainbow arcs across the sky",
    "oz | Over the Rainbow | WIZARD:1:\"Over the Rainbow\" is the famous song from The Wizard of Oz" ],
  UMBRELLA: [
    "rain | keeping dry | RAIN:2:an umbrella keeps off the rain ; STORM:1:you open an umbrella in a storm",
    "sun | keeping cool | BEACH:2:a beach umbrella keeps off the sun ; SHADE:2:an umbrella gives shade",
    "drink | the cocktail umbrella | DRINK:2:tropical drinks come with tiny paper umbrellas",
    "poppins | Mary Poppins | WIND:1:Mary Poppins floats in on the wind holding her umbrella" ],
  PHARAOH: [
    "*egypt | ancient Egypt | EGYPT:2:pharaohs ruled ancient Egypt ; PYRAMID:2:many pharaohs, especially in the Old Kingdom, were buried in pyramids ; MUMMY:2:pharaohs were preserved as mummies ; KING:2:a pharaoh was an Egyptian king ; GOLD:1:King Tut was buried with a solid gold mask ; TREASURE:1:King Tut's tomb was packed with treasure ; SNAKE:1:a cobra rises from the front of a pharaoh's crown" ],
  LUIGI: [
    "*mario | Mario's brother | MARIO:2:Luigi is Mario's younger brother ; BROTHER:2:Luigi is one of the Super Mario Bros. ; GREEN:2:Luigi wears green ; GHOST:2:in Luigi's Mansion, Luigi hunts ghosts ; PIPE:1:Luigi travels through green warp pipes ; VIDEO GAME:1:Luigi is a Nintendo video game hero" ],
  FROSTY: [
    "*snowman | Frosty the Snowman | SNOWMAN:2:Frosty is the famous snowman of the Christmas song ; HAT:2:Frosty comes to life when the children place a magic silk hat on his head ; MAGIC:1:Frosty's magic silk hat brings him to life ; CHRISTMAS:1:Frosty the Snowman is a Christmas classic",
    "cold | frosty weather | COLD:2:frosty means icy cold ; WINTER:1:a frosty winter morning ; MORNING:1:a frosty morning glitters with ice ; MUG:1:a frosty mug comes straight from the freezer" ],
  PARKER: [
    "*spiderman | Peter Parker | SPIDER:2:Peter Parker is Spider-Man ; WEB:2:as Spider-Man, Peter Parker shoots webs ; NEWSPAPER:1:Peter Parker sells photos to the Daily Bugle newspaper ; CAMERA:1:Peter Parker is a newspaper photographer ; PHOTO:1:Peter Parker snaps photos of Spider-Man for the Daily Bugle ; MARVEL:1:Peter Parker is Marvel's Spider-Man ; SUPERHERO:1:Peter Parker leads a double life as a superhero" ],
};

const R = "data/unlimited/related/hint-routes.json";
const routes = JSON.parse(readFileSync(R, "utf8"));
const parse = (s) => {
  const [rawId, label, words] = s.split("|").map((x) => x.trim());
  const same = rawId.startsWith("*");
  return { id: rawId.replace(/^\*/, ""), label, ...(same ? { sameRoute: true } : {}), words: words.split(" ; ").map((w) => { const [word, strength, ...c] = w.split(":"); return { word: word.trim(), strength: Number(strength), clause: c.join(":").trim() }; }) };
};
routes.hints = routes.hints.filter((h) => h.checkpoint !== "x04b");
for (const [hint, rs] of Object.entries(F)) routes.hints.push({ hint, checkpoint: "x04b", seeds: [], reviewCap: 7, routes: rs.map(parse) });
writeFileSync(R, JSON.stringify(routes, null, 1) + "\n");
console.log(`x04b families: ${Object.keys(F).length}`);
