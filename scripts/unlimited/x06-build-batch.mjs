#!/usr/bin/env node
// Builds the x06 review batch from the approved proposal (51 script-checked candidates),
// with editorial explanations and per-word lines (main session, no model calls).
// Row: HINT | A | B | explanation | line for A | line for B
//   node scripts/unlimited/x06-build-batch.mjs
import { writeFileSync } from "node:fs";
import { pairOf, hintProblem, loadCatalogue } from "./catalogue-lib.mjs";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

const ROWS = `MUSTANG|CAR|HORSE|The Ford Mustang is a classic car, and a mustang is a wild horse.|The Ford Mustang is a classic American car.|A mustang is a wild horse of the American West.
JAGUAR|CAR|CAT|Jaguar makes luxury cars, and the jaguar is a big jungle cat.|Jaguar makes luxury cars.|The jaguar is a big jungle cat.
BEETLE|CAR|INSECT|The Volkswagen Beetle is a classic car, and a beetle is an insect.|The Volkswagen Beetle is a classic car.|A beetle is an insect.
BEETLE|BUG|CAR|The Volkswagen Beetle, a classic car, is nicknamed the Bug.|The VW Beetle is nicknamed the Bug.|The Volkswagen Beetle is a classic car.
PUMA|SHOE|CAT|Puma is a sneaker brand, and the puma is a big cat.|Puma makes sneakers.|The puma is a big cat.
BLACKBERRY|PHONE|FRUIT|BlackBerry made a famous early smartphone, and a blackberry is a fruit.|BlackBerry made a famous early smartphone.|A blackberry is a fruit.
TWEET|BIRD|INTERNET|Birds tweet, and short posts on Twitter were called tweets.|Birds tweet.|Short posts on Twitter were called tweets.
SPARE|BOWLING|CHANGE|In bowling, a spare means knocking down all ten pins in two rolls, and loose coins are spare change.|A spare knocks down all ten pins in two rolls.|Loose coins are spare change.
GUTTER|BOWLING|ROOF|A gutter ball rolls off the side of the lane, and a roof gutter carries away rainwater.|A gutter ball rolls off the side of the lane.|A roof gutter carries away rainwater.
GUTTER|BOWLING|RAIN|A gutter ball rolls off the side of the lane, and rain runs off the roof into the gutter.|A gutter ball rolls off the side of the lane.|Rain runs off the roof into the gutter.
DRIVER|GOLF|CAR|Golfers tee off with a driver, and a driver steers a car.|Golfers tee off with a driver.|A driver steers a car.
DRIVER|GOLF|BUS|Golfers tee off with a driver, and a bus driver drives the route.|Golfers tee off with a driver.|A bus driver drives the route.
TOUCHDOWN|FOOTBALL|PLANE|A touchdown scores six points in football, and a plane touches down when it lands.|A touchdown scores six points.|A plane touches down when it lands.
RAPUNZEL|HAIR|WITCH|A witch locks Rapunzel in a tower, where she lets down her long hair.|Rapunzel lets down her long hair.|A witch locks Rapunzel in a tower.
GOLDILOCKS|BEAR|BED|Goldilocks naps in Baby Bear's bed.|Goldilocks visits the three bears.|She finds Baby Bear's bed just right.
GOLDILOCKS|BEAR|CHAIR|Goldilocks breaks Baby Bear's little chair.|Goldilocks visits the three bears.|She breaks Baby Bear's chair.
GOLDILOCKS|BLOND|BEAR|Golden-haired Goldilocks wanders into the three bears' house.|Goldilocks is named for her golden hair.|Goldilocks visits the three bears.
SCROOGE|CHRISTMAS|GHOST|In A Christmas Carol, ghosts visit Ebenezer Scrooge on Christmas Eve.|Scrooge learns the meaning of Christmas.|Ghosts visit Scrooge on Christmas Eve.
SCROOGE|DUCK|RICH|Scrooge McDuck is a famously rich cartoon duck.|Scrooge McDuck is a cartoon duck.|Scrooge McDuck swims in his money.
SCROOGE|GHOST|RICH|Rich, miserly Ebenezer Scrooge is visited by ghosts in A Christmas Carol.|Ghosts visit Scrooge on Christmas Eve.|Ebenezer Scrooge is rich and miserly.
EXCALIBUR|SWORD|STONE|In many retellings, young Arthur pulls the sword Excalibur from a stone.|Excalibur is King Arthur's sword.|Arthur pulls the sword from the stone.
EXCALIBUR|SWORD|LAKE|In Arthurian legend, the Lady of the Lake gives Arthur his sword, Excalibur.|Excalibur is King Arthur's sword.|The Lady of the Lake gives Arthur Excalibur.
EXCALIBUR|KING|SWORD|Excalibur is King Arthur's legendary sword.|Excalibur belongs to King Arthur.|Excalibur is a legendary sword.
ZEUS|LIGHTNING|GOD|Zeus, king of the Greek gods, hurls lightning bolts.|Zeus hurls lightning bolts.|Zeus is king of the Greek gods.
ZEUS|OLYMPUS|THUNDER|Zeus rules from Mount Olympus and hurls thunderbolts.|Zeus rules from Mount Olympus.|Zeus hurls thunderbolts.
CUPID|ARROW|HEART|Cupid's arrow makes a heart fall in love.|Cupid shoots love arrows.|Cupid's arrow strikes the heart.
CUPID|BABY|ARROW|Cupid is often pictured as a winged baby with a bow and arrow.|Cupid is pictured as a winged baby.|Cupid shoots love arrows.
SPHINX|CAT|EGYPT|Egypt's Great Sphinx has the body of a lion, a big cat, with a human head.|The Sphinx has the body of a lion, a big cat.|The Great Sphinx stands in Egypt.
SPHINX|CAT|PYRAMID|The Great Sphinx, a statue with a lion's body, sits near the pyramids of Giza.|The Sphinx has the body of a lion, a big cat.|The Sphinx sits near the pyramids of Giza.
YETI|SNOW|MONSTER|The Yeti, the abominable snowman, is a legendary snow monster.|The Yeti is the abominable snowman.|The Yeti is a legendary monster.
YETI|HIMALAYAS|MONSTER|The Yeti is a legendary monster said to roam the Himalayas.|The Yeti is said to roam the Himalayas.|The Yeti is a legendary monster.
TOTO|DOG|WIZARD|Toto is Dorothy's little dog in The Wizard of Oz.|Toto is Dorothy's little dog.|Toto travels to see the Wizard of Oz.
TOTO|AFRICA|DOG|Toto is Dorothy's dog in The Wizard of Oz, and the band Toto sang the hit "Africa."|The band Toto sang "Africa."|Toto is Dorothy's little dog.
SCOOBY|DOG|SNACK|Scooby-Doo is the cartoon dog who will do anything for a Scooby Snack.|Scooby-Doo is a cartoon dog.|He'll do anything for a Scooby Snack.
BAMBI|DEER|DISNEY|Bambi is Disney's young deer.|Bambi is a young deer.|Bambi is a Disney classic.
BAMBI|DEER|ICE|In Disney's Bambi, the young deer slips and slides on a frozen pond.|Bambi is a young deer.|Bambi slides around on the ice.
KERMIT|GREEN|PUPPET|Kermit the Frog is the Muppets' famous green puppet.|Kermit is green.|Kermit is a Muppet puppet.
DORY|FISH|MEMORY|Dory is the forgetful fish of Finding Nemo.|Dory is a fish in Finding Nemo.|Dory has trouble with her short-term memory.
DORY|BLUE|MEMORY|Dory, a blue tang, has trouble with her short-term memory.|Dory is a blue tang.|Dory has trouble with her short-term memory.
LIFEGUARD|POOL|WHISTLE|A lifeguard watches the pool with a whistle ready.|A lifeguard watches the pool.|Lifeguards blow a whistle.
LIFEGUARD|BEACH|WHISTLE|A lifeguard watches the beach with a whistle ready.|A lifeguard watches the beach.|Lifeguards blow a whistle.
MAILMAN|DOG|LETTER|The mailman brings the letters, and dogs famously bark at him.|Dogs famously bark at the mailman.|The mailman delivers letters.
RECESS|SCHOOL|SWING|At school recess, kids race for the swings.|Recess is the break in the school day.|Kids race for the swings at recess.
RECESS|SCHOOL|SLIDE|At school recess, kids line up for the slide.|Recess is the break in the school day.|Kids line up for the slide at recess.
TAILGATE|FOOTBALL|TRUCK|Football fans tailgate in the parking lot, partying off the back of a truck.|Football fans tailgate before the game.|A truck's tailgate folds down at the back.
TAILGATE|PARTY|TRUCK|A tailgate party happens off the lowered back of a truck.|A tailgate party happens before a big game.|A truck's tailgate folds down at the back.
PINATA|BIRTHDAY|CANDY|At a birthday party, a piñata bursts open with candy.|Piñatas are a birthday party classic.|A piñata is stuffed with candy.
PINATA|BAT|CANDY|Kids whack a piñata with a bat until the candy spills out.|Kids whack the piñata with a bat or stick.|A piñata is stuffed with candy.
SLEEPOVER|PAJAMAS|FRIEND|A sleepover is a night in pajamas with friends.|Everyone wears pajamas at a sleepover.|A sleepover is a night with friends.
SLEEPOVER|PAJAMAS|MOVIE|A sleepover means pajamas and a late movie.|Everyone wears pajamas at a sleepover.|A sleepover means a late movie.
TICKLE|FEATHER|LAUGH|A feather tickle makes you laugh.|A feather tickles.|A tickle makes you laugh.`;

const ix = loadCatalogue();
const rejections = loadRejections();
const pairs = [];
for (const line of ROWS.split("\n")) {
  const [hint, x, y, why, lx, ly] = line.split("|");
  const { a, b, id } = pairOf(x, y);
  for (const w of [a, b]) if (!ix.inBank.has(w)) throw new Error(`${w} is not a bank word`);
  const problem = hintProblem(hint, a, b); if (problem) throw new Error(`${hint} ${a}+${b}: ${problem}`);
  if (rejectionFor(rejections, a, b, hint)) throw new Error(`${hint} ${a}+${b}: recorded rejection/hold`);
  if (ix.byId.get(id)?.clues.some((c) => c.text === hint)) throw new Error(`${id} ${hint} already in the library`);
  const lines = { [x]: lx, [y]: ly };
  pairs.push({ pair_id: id, a, b, clues: [{ text: hint, type: "x06-proposal", wordAConnection: lines[a], wordBConnection: lines[b], revealExplanation: why, reference: null }], variants: [], rejected: [] });
}
writeFileSync("data/unlimited/library/batches/x06-batch.json", JSON.stringify({ _metadata: { batch: "x06", source: "data/unlimited/expansion/X06-PROPOSAL.md", prepared: "2026-10-19", note: "51 approved proposal candidates; editorial text by the main session (no model calls)" }, pairs }, null, 1) + "\n");
console.log(`${pairs.length} pairs, ${new Set(pairs.map((p) => p.pair_id)).size} distinct`);
