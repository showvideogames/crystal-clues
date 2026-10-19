#!/usr/bin/env node
// Adds the x04 checkpoint (25 new hint families) to the related-word index
// (data/unlimited/related/hint-routes.json, checkpoint "x04"), plus the group
// updates from the x04 brief (CROW in birds; a nautical group with CAPTAIN) and
// the two clause fixes the pilot reviewers made (philosopher's stone, quarter).
// Route notation: "id | label | WORD:strength:clause ; WORD:strength:clause ..."
// Clauses are sentence-internal (lower-case start unless a proper noun).
// Re-running replaces the x04 entries; nothing else is touched.
import { readFileSync, writeFileSync } from "node:fs";

const F = {
  SEAGULL: { seeds: ["BEACH+PIGEON", "BEACH+CROW", "OCEAN+CROW"], routes: [
    "coast | the seaside | BEACH:2:seagulls are a familiar sight at the beach ; OCEAN:2:seagulls soar over the ocean ; PORT:1:seagulls crowd every fishing port ; LIGHTHOUSE:1:seagulls wheel around the lighthouse ; BOAT:1:seagulls trail fishing boats for scraps",
    "bird | a bird like these | PIGEON:2:seagulls beg for scraps like seaside pigeons ; CROW:2:seagulls scavenge like seaside crows ; BIRD:2:the seagull is a familiar bird ; CRANE:1:like the crane, the seagull is a waterbird",
    "thief | the snack thief | FRY:2:seagulls swoop in to steal your french fries ; SNACK:2:seagulls are famous for snatching snacks ; THIEF:1:seagulls are notorious beach-snack thieves" ] },
  SLAM: { seeds: ["BASKETBALL+POETRY", "DOOR+POETRY"], routes: [
    "dunk | slam dunk | BASKETBALL:2:a slam dunk is basketball's most exciting shot",
    "poetry | poetry slam | POETRY:2:poets compete at a poetry slam",
    "door | slam the door | DOOR:2:you slam a door when you're angry",
    "grand | a grand slam | BASEBALL:2:a grand slam is a home run with the bases loaded ; TENNIS:2:winning all four majors in a year is a tennis Grand Slam ; BREAKFAST:1:Denny's Grand Slam is a famous breakfast" ] },
  PICK: { seeds: ["LOCK+POCKET"], routes: [
    "lock | pick a lock | LOCK:2:a thief can pick a lock",
    "pocket | pick a pocket | POCKET:2:pickpockets pick pockets",
    "guitar | a guitar pick | GUITAR:2:you strum a guitar with a pick",
    "ice | an ice pick | ICE:2:an ice pick chips away at ice",
    "harvest | pick fruit and flowers | ORCHARD:2:you pick apples in an orchard ; APPLE:1:you pick apples off the tree ; FLOWER:1:you pick flowers",
    "draft | a draft pick | DRAFT:2:teams choose players with draft picks",
    "tooth | a toothpick | TOOTH:1:a toothpick cleans between your teeth" ] },
  LAVA: { seeds: ["SPICY+LAMP", "ISLAND+LAMP"], routes: [
    "volcano | a volcano's lava | VOLCANO:2:volcanoes erupt with lava ; ISLAND:1:volcanic islands like Hawaii were built from lava",
    "lamp | a lava lamp | LAMP:2:a lava lamp glows with slow-moving blobs",
    "heat | lava-hot | HOT:2:lava is molten rock, about as hot as anything gets ; SPICY:1:spicy food can feel lava-hot",
    "cake | lava cake | CAKE:2:a lava cake has a molten center ; CHOCOLATE:2:chocolate lava cake oozes in the middle",
    "game | the floor is lava | GAME:1:\"the floor is lava\" is a classic kids' game" ] },
  DECK: { seeds: [], routes: [
    "cards | a deck of cards | CARD:2:a deck holds 52 playing cards ; CASINO:1:casino dealers shuffle the deck",
    "ship | a ship's deck | SHIP:2:sailors stand on a ship's deck ; BOAT:1:you stand on a boat's deck ; CAPTAIN:1:the captain paces the deck",
    "patio | a backyard deck | PATIO:1:a deck is a raised wooden patio ; YARD:1:many backyards have a deck",
    "skate | a skateboard deck | SKATEBOARD:2:the board of a skateboard is called the deck",
    "holly | deck the halls | CHRISTMAS:2:\"Deck the Halls\" is a classic Christmas carol" ] },
  SAILOR: { seeds: ["TATTOO+SHIP", "TATTOO+BOAT"], routes: [
    "sea | life at sea | SHIP:2:sailors work aboard ships ; BOAT:2:sailors work aboard boats ; OCEAN:1:sailors cross the ocean",
    "tattoo | sailor tattoos | TATTOO:2:sailor tattoos are a classic style",
    "moon | Sailor Moon | MOON:2:Sailor Moon is a famous anime heroine",
    "knot | sailor's knots | KNOT:2:sailors are expert knot-tiers",
    "uniform | the sailor suit | UNIFORM:1:the white sailor uniform is iconic" ] },
  JAM: { seeds: [], routes: [
    "traffic | a traffic jam | CAR:2:cars crawl in a traffic jam ; ROAD:1:a jam backs up the road ; TRUCK:1:trucks get stuck in traffic jams",
    "spread | fruit jam | TOAST:2:you spread jam on toast ; FRUIT:2:jam is made from fruit ; BREAD:1:jam goes on bread ; GRAPE:1:grape jam is a sandwich classic ; BERRY:1:berry jam is a favorite",
    "music | a jam session | BAND:2:a band jams together ; GUITAR:1:guitarists jam together",
    "space | Space Jam | BASKETBALL:2:Space Jam teams Michael Jordan with the Looney Tunes on the basketball court ; SPACE:2:Space Jam is the classic basketball movie",
    "printer | a paper jam | PRINTER:2:printers are infamous for paper jams" ] },
  BARK: { seeds: [], routes: [
    "dog | a dog's bark | DOG:2:a dog barks ; BITE:1:his bark is worse than his bite",
    "tree | tree bark | TREE:2:bark covers a tree's trunk ; OAK:1:oak trees have thick, rough bark ; PINE:1:pine trees have scaly bark ; LOG:1:logs are wrapped in bark ; WOOD:1:bark is the outer skin of wood" ] },
  TRUNK: { seeds: [], routes: [
    "car | a car trunk | CAR:2:a car's trunk holds the luggage",
    "tree | a tree trunk | TREE:2:a tree's trunk holds it up ; OAK:1:an oak has a thick trunk",
    "swim | swim trunks | SWIMMING:2:you go swimming in swim trunks ; POOL:1:you wear trunks at the pool ; BEACH:1:you wear trunks at the beach",
    "chest | a storage trunk | SUITCASE:1:a trunk is a big old-fashioned suitcase" ] },
  PITCH: { seeds: ["FORK+TENT"], routes: [
    "baseball | a pitch | BASEBALL:2:the pitcher throws the pitch in baseball",
    "tent | pitch a tent | TENT:2:you pitch a tent ; CAMP:1:at camp, you pitch your tent",
    "sound | musical pitch | VOICE:2:your voice's pitch is how high or low it sounds ; SONG:1:a singer has to hit the right pitch ; PIANO:1:each piano key plays a different pitch",
    "sales | a sales pitch | BUSINESS:2:entrepreneurs pitch their business to investors",
    "dark | pitch black | BLACK:2:pitch black means completely dark ; NIGHT:1:a pitch-black night",
    "soccer | a soccer pitch | SOCCER:2:a soccer field is called a pitch",
    "fork | a pitchfork | FORK:2:a pitchfork is a giant farm fork ; FARM:1:farmers toss hay with a pitchfork" ] },
  RING: { seeds: [], routes: [
    "boxing | the boxing ring | BOXING:2:boxers fight in a ring ; FIGHTER:1:fighters square off in the ring",
    "wedding | a wedding ring | WEDDING:2:couples exchange rings at a wedding ; MARRIAGE:2:a wedding ring is a symbol of marriage ; DIAMOND:1:an engagement ring often has a diamond",
    "sound | to ring | PHONE:2:a phone rings ; BELL:2:a bell rings ; ALARM:1:an alarm rings",
    "circus | the circus ring | CIRCUS:2:circus acts perform in the ring",
    "saturn | planetary rings | SATURN:2:Saturn is famous for its rings ; PLANET:1:Saturn is the planet with rings" ] },
  FAN: { seeds: [], routes: [
    "sports | a sports fan | STADIUM:2:fans pack the stadium ; TEAM:1:fans cheer for their team ; FOOTBALL:1:football fans fill the stands",
    "cool | a cooling fan | SUMMER:2:a fan keeps you cool in summer ; HOT:2:a fan helps on a hot day ; AIR:1:a fan blows air ; WIND:1:a fan makes a little wind",
    "celebrity | a fan of a star | CONCERT:2:fans scream at a concert ; HOLLYWOOD:1:Hollywood stars have millions of fans" ] },
  NET: { seeds: [], routes: [
    "fishing | a fishing net | FISH:2:fishermen catch fish in nets ; FISHING:2:fishing boats haul in nets",
    "basketball | the basketball net | BASKETBALL:2:a basketball swishes through the net",
    "tennis | the tennis net | TENNIS:2:you hit the ball over the tennis net",
    "goal | the back of the net | SOCCER:1:a soccer goal hits the back of the net ; HOCKEY:1:a hockey goal ends up in the net",
    "internet | the Net | INTERNET:2:the internet is nicknamed the Net ; WEB:1:the web is part of the Net",
    "butterfly | a butterfly net | BUTTERFLY:2:you catch butterflies with a net",
    "safety | a safety net | CIRCUS:1:circus trapeze artists perform above a safety net" ] },
  BOW: { seeds: [], routes: [
    "archery | bow and arrow | ARROW:2:a bow shoots an arrow",
    "tie | a bow tie | TIE:2:a bow tie is a fancy tie",
    "violin | a violin bow | VIOLIN:2:a violin is played with a bow",
    "gift | a gift bow | GIFT:2:a bow tops off a wrapped gift ; HAIR:1:a bow can decorate your hair",
    "stage | take a bow | STAGE:2:performers take a bow on stage ; PERFORMANCE:1:actors bow after a performance",
    "ship | a ship's bow | SHIP:1:the front of a ship is its bow ; BOAT:1:the front of a boat is its bow" ] },
  SHELL: { seeds: [], routes: [
    "armor | an animal's shell | TURTLE:2:a turtle hides in its shell ; SNAIL:2:a snail carries its shell ; CRAB:2:a crab has a hard shell",
    "beach | seashells | BEACH:2:you collect seashells on the beach ; OCEAN:1:seashells wash in from the ocean",
    "egg | an eggshell | EGG:2:an egg has a shell ; NUT:2:a nut has a hard shell",
    "taco | a taco shell | TACO:2:a crunchy taco comes in a hard shell",
    "mario | Mario Kart shells | MARIO:2:Mario players fire turtle shells at each other in Mario Kart",
    "gas | Shell gas | GAS:2:Shell is a gas station brand",
    "ammo | an ammo shell | AMMO:1:a shell is a round of ammunition" ] },
  CRUST: { seeds: [], routes: [
    "pizza | pizza crust | PIZZA:2:pizza has a crust",
    "pie | pie crust | PIE:2:a pie has a flaky crust",
    "bread | bread crust | BREAD:2:bread has a crust ; TOAST:1:toast has a crust",
    "earth | Earth's crust | EARTH:2:Earth's crust is its rocky outer layer ; PLANET:1:rocky planets have a crust" ] },
  ORBIT: { seeds: [], routes: [
    "space | going around in space | MOON:2:the Moon orbits Earth ; PLANET:2:planets orbit the Sun ; SATELLITE:2:satellites orbit Earth ; EARTH:2:Earth orbits the Sun ; SUN:1:the planets orbit the Sun ; ASTRONAUT:1:astronauts circle Earth in orbit",
    "gum | Orbit gum | GUM:2:Orbit is a brand of chewing gum ; MINT:1:Orbit gum comes in mint flavors" ] },
  MINT: { seeds: [], routes: [
    "flavor | a mint | CANDY:2:mints are little candies ; GUM:1:mint is the classic gum flavor ; CHOCOLATE:1:mint chocolate chip is a favorite flavor",
    "herb | the mint plant | HERBS:2:mint is a garden herb ; GARDEN:1:mint grows like crazy in a garden ; LEAF:1:mint leaves garnish drinks",
    "money | the Mint | CURRENCY:1:the U.S. Mint makes the nation's coins ; RICH:1:something worth a mint is worth a fortune",
    "condition | mint condition | COMIC:1:collectors want comics in mint condition ; TOY:1:a toy still in its box is in mint condition" ] },
  KEY: { seeds: [], routes: [
    "piano | piano keys | PIANO:2:a piano has 88 keys",
    "lock | a door key | DOOR:2:a key opens the door ; LOCK:2:a key opens a lock",
    "test | an answer key | TEST:2:teachers grade a test with an answer key",
    "map | a map key | MAP:2:a map key explains the symbols",
    "pie | key lime pie | PIE:2:key lime pie is a Florida classic",
    "islands | the Florida Keys | ISLAND:1:the Florida Keys are a chain of islands" ] },
  HORN: { seeds: [], routes: [
    "car | a car horn | CAR:2:you honk a car's horn ; TRUCK:1:truckers blast the horn",
    "unicorn | a unicorn's horn | UNICORN:2:a unicorn has a single horn",
    "animal | animal horns | GOAT:2:goats have horns ; RAM:2:rams have big curled horns ; DEVIL:2:the devil is drawn with horns ; COW:1:many cows have horns ; VIKING:1:cartoon Vikings wear horned helmets",
    "music | the French horn | INSTRUMENT:1:the French horn is a brass instrument ; BAND:1:a band's horn section blasts the brass parts" ] },
  WING: { seeds: [], routes: [
    "flight | wings to fly | BIRD:2:birds fly with wings ; ANGEL:2:angels are pictured with wings ; BUTTERFLY:1:butterflies have colorful wings ; FAIRY:1:fairies flutter on tiny wings ; DRAGON:1:dragons fly on huge wings",
    "plane | a plane's wing | PLANE:2:a plane has two wings ; JET:1:a jet's wings hold its engines ; PILOT:1:new pilots earn their wings",
    "food | chicken wings | BUFFALO:2:buffalo wings are spicy chicken wings ; SPICY:1:hot wings are famously spicy",
    "building | a building's wing | HOSPITAL:2:a hospital has a wing for each department ; MUSEUM:1:a museum has wings for different exhibits ; BUILDING:1:a big building is split into wings" ] },
  PUNCH: { seeds: [], routes: [
    "boxing | a punch | BOXING:2:boxers throw punches ; FIGHTER:1:fighters land punches",
    "drink | fruit punch | FRUIT:2:fruit punch is a sweet fruit drink ; PARTY:2:a bowl of punch is a party classic ; DRINK:1:punch is a party drink",
    "joke | a punchline | JOKE:2:a joke ends with the punchline",
    "paper | a hole punch | PAPER:2:a hole punch makes holes in paper",
    "ticket | punch a ticket | TICKET:1:a conductor punches your ticket ; CLOCK:1:workers punch the clock" ] },
  SCALE: { seeds: [], routes: [
    "skin | scales on skin | FISH:2:fish are covered in scales ; SNAKE:2:snakes have scaly skin ; DRAGON:2:dragons are covered in scales ; REPTILE:2:reptiles have scaly skin ; CROCODILE:1:crocodiles have tough scales",
    "weight | a bathroom scale | WEIGHT:2:a scale measures your weight ; DIET:1:dieters step on the scale",
    "music | a musical scale | PIANO:2:piano students practice scales ; MUSIC:1:a scale is a ladder of musical notes",
    "map | a map scale | MAP:2:a map's scale shows real distances",
    "climb | to scale a wall | MOUNTAIN:1:to scale a mountain is to climb it ; WALL:1:to scale a wall is to climb over it",
    "justice | the scales of justice | JUDGE:1:the scales of justice stand for a fair judge ; COURT:1:the scales of justice hang over the court" ] },
  BOLT: { seeds: [], routes: [
    "lightning | a lightning bolt | LIGHTNING:2:lightning strikes as a bolt ; THUNDER:1:thunder follows a bolt of lightning ; STORM:1:storms throw lightning bolts",
    "hardware | nuts and bolts | SCREW:2:bolts and screws hold things together ; NUT:2:a bolt twists into a nut ; HARDWARE:1:bolts are basic hardware",
    "run | to bolt | FAST:1:to bolt is to run off fast ; RACE:1:Usain Bolt won Olympic sprint races",
    "lock | a door bolt | LOCK:2:you slide a bolt to lock a door ; DOOR:1:a bolt locks the door",
    "dog | Disney's Bolt | DOG:1:Bolt is the Disney dog who believes his TV superpowers are real ; DISNEY:1:Bolt is a Disney movie about a TV-star dog who believes his fictional superpowers are real" ] },
  CHIP: { seeds: [], routes: [
    "computer | a computer chip | COMPUTER:2:a computer runs on chips ; PHONE:1:every phone has computer chips",
    "snack | potato chips | POTATO:2:potato chips are a classic snack ; SALSA:2:chips and salsa go together ; SNACK:1:chips are a favorite snack",
    "casino | casino chips | CASINO:2:gamblers bet with casino chips ; GAMBLE:1:you gamble with chips at the table",
    "cookie | chocolate chips | COOKIE:2:chocolate chip cookies ; CHOCOLATE:2:chocolate chips go in cookies",
    "golf | a chip shot | GOLF:1:a chip shot pops a golf ball onto the green",
    "wood | wood chips | WOOD:1:wood chips cover playgrounds" ] },
};

const R = "data/unlimited/related/hint-routes.json";
const G = "data/unlimited/related/groups.json";
const routes = JSON.parse(readFileSync(R, "utf8"));
const parse = (s) => {
  const [id, label, words] = s.split("|").map((x) => x.trim());
  return { id, label, words: words.split(" ; ").map((w) => { const [word, strength, ...c] = w.split(":"); return { word: word.trim(), strength: Number(strength), clause: c.join(":").trim() }; }) };
};
routes.hints = routes.hints.filter((h) => h.checkpoint !== "x04");
for (const [hint, f] of Object.entries(F)) routes.hints.push({ hint, checkpoint: "x04", seeds: f.seeds, reviewCap: 8, routes: f.routes.map(parse) });
// Pilot reviewer fixes (they were committed on the held pilot branch only).
const st = routes.hints.find((h) => h.hint === "ALCHEMY")?.routes.find((r) => r.id === "stone")?.words[0];
if (st) { st.clause = "alchemists hunted for the philosopher's stone, said to turn base metals into gold"; st.fixedBy = "x03-reviewer-pb"; }
const q = routes.hints.find((h) => h.hint === "EAGLE")?.routes.find((r) => r.id === "coin")?.words[0];
if (q) { q.clause = "for decades, an eagle was on the back of the U.S. quarter"; q.fixedBy = "x03-reviewer-pb"; }
writeFileSync(R, JSON.stringify(routes, null, 1) + "\n");

const groups = JSON.parse(readFileSync(G, "utf8"));
const birds = groups.groups.find((g) => g.id === "birds");
if (!birds.members.some((m) => m.word === "CROW")) birds.members.push({ word: "CROW", strength: 2, reason: "a big black bird; back in the bank 2026-10-19", addedBy: "x04 brief" });
for (const m of birds.members) if (["PIGEON", "CRANE"].includes(m.word)) m.verifiedBy = "x04 brief";
if (!groups.groups.some((g) => g.id === "nautical")) groups.groups.push({ id: "nautical", kind: "association", label: "ships, boats and life at sea", status: "draft", note: "BOAT and SHIP often substitute in nautical pairs, but not blindly in every idiom (a ship's deck yes; 'missed the boat' no)", members: [
  { word: "SHIP", strength: 2, reason: "a big seagoing vessel" }, { word: "BOAT", strength: 2, reason: "a smaller vessel" }, { word: "CAPTAIN", strength: 2, reason: "commands the ship" },
  { word: "OCEAN", strength: 2, reason: "where ships sail" }, { word: "SEA", strength: 2, reason: "where ships sail" }, { word: "SAIL", strength: 2, reason: "what catches the wind" },
  { word: "PORT", strength: 2, reason: "where ships dock" }, { word: "DECK", strength: 1, sense: "a ship's deck (not cards)", reason: "the floor of a ship" }, { word: "KNOT", strength: 1, reason: "sailors tie knots and measure speed in knots" } ] });
writeFileSync(G, JSON.stringify(groups, null, 1) + "\n");
console.log(`x04 families: ${Object.keys(F).length}`);
