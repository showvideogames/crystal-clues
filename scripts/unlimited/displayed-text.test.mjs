// node --test scripts/unlimited/displayed-text.test.mjs
// The text players see comes from the client export (src/unlimited/random-library.json).
// These checks make sure a "corrected" hint cannot leave stale text in the
// explanation sentence or either per-word line, and pin the owner's
// BOXER + JOKE -> PUNCHLINE preference in the real export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hintProblem } from "./catalogue-lib.mjs";

const lib = JSON.parse(readFileSync("data/unlimited/library/pairs.json", "utf8"));
const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
const byId = new Map(lib.pairs.map((p) => [p.pair_id, p]));
const FIELDS = ["revealExplanation", "wordAConnection", "wordBConnection"];

test("every served hint shows exactly the library's current text", () => {
  for (const p of client.pairs) for (const h of p.hints) {
    const c = byId.get(p.id).clues.find((x) => x.text === h.text);
    for (const f of FIELDS) assert.equal(h[f], c[f] || "", `${p.id} ${h.text} ${f}`);
  }
});

test("a recorded text correction is what the library now holds", () => {
  for (const p of lib.pairs) for (const c of p.clues) {
    const to = c.provenance?.textCorrection?.to;
    if (!to || typeof to !== "object") continue;   // older single-field (AQUARIUM-style) records hold a string
    for (const [f, v] of Object.entries(to)) assert.equal(c[f], v, `${p.pair_id} ${c.text} ${f}`);
  }
});

test("corrected wording is gone from everything players can see", () => {
  const stale = ["superhero dog", "swarm every beach", "\"Mine! Mine!\".", "pay top dollar", "sweet red drink", "every escape is forbidden", "Fine wine is aged", "flies like a plane", "Murder mysteries often begin", "Pixar's first movie", "Greek god of the sun", "when he puts on a magic hat", "crunchy taco shell.", "shows every color", "James Bond villain", "beneath Gotham,", "danger to every ship", "soft-serve ice cream treat", "Harry Potter wears round glasses, and Harry Potter", "Sherlock Holmes is the most famous fictional detective, and Sherlock Holmes", "about as hot as anything gets", "Chocolate chip cookies.", "Mario players fire", "a wing for each department", "come with tiny paper umbrellas"];
  for (const p of client.pairs) for (const h of p.hints) for (const f of FIELDS) for (const s of stale) assert.ok(!h[f].includes(s), `${p.id} ${h.text} ${f} still says "${s}"`);
});

test("owner preference: BOXER + JOKE serves only PUNCHLINE; other PUNCH pairs unchanged", (t) => {
  const p = client.pairs.find((x) => x.id === "p_boxer__joke");
  if (!p) return t.skip("BOXER + JOKE is checkpoint content, not in this export");
  assert.deepEqual(p.hints.map((h) => h.text), ["PUNCHLINE"]);
  assert.equal(p.rule, "canonical");
  assert.equal(p.hints[0].revealExplanation, "A joke ends with a punchline; a boxer throws a punch.");
  assert.equal(hintProblem("PUNCHLINE", "BOXER", "JOKE"), null, "neither BOXER nor JOKE is inside PUNCHLINE");
  const c = byId.get("p_boxer__joke").clues.find((x) => x.text === "PUNCHLINE");
  assert.equal(c.status, "human_approved"); assert.equal(c.provenance.addedBy, "owner");
  assert.ok(byId.get("p_boxer__joke").clues.some((x) => x.text === "PUNCH"), "PUNCH kept in the research record");
  for (const id of ["p_boxer__fruit", "p_boxer__paper", "p_fruit__joke"]) assert.ok(client.pairs.find((x) => x.id === id).hints.some((h) => h.text === "PUNCH"), `${id} still serves PUNCH`);
});

test("coordinator holds (parent review of x04b) are held, recorded as coordinator decisions, and not served", () => {
  for (const [id, hint] of [["p_knight__new-york", "GOTHAM"], ["p_new-york__penguin", "GOTHAM"], ["p_london__violin", "SHERLOCK"], ["p_beach__bond", "JAWS"]]) {
    const c = byId.get(id).clues.find((x) => x.text === hint);
    assert.equal(c.status, "held", `${id} ${hint}`);
    assert.match(c.override.by, /^coordinator/, "coordinator provenance, not owner");
    assert.ok(!client.pairs.find((p) => p.id === id)?.hints.some((h) => h.text === hint), `${id} ${hint} not served`);
  }
});

test("x04c coordinator cleanup reaches the export (labelled as coordinator, not owner)", (t) => {
  const serve = (id) => client.pairs.find((x) => x.id === id)?.hints.map((h) => h.text) || null;
  if (!serve("p_boxing__joke")) return t.skip("x04c content not in this export");
  assert.deepEqual(serve("p_boxing__joke"), ["PUNCHLINE"]);
  assert.deepEqual(serve("p_chocolate__hot"), ["FUDGE"]);
  assert.deepEqual(serve("p_basketball__tennis"), ["SLAM"]);
  assert.equal(serve("p_moon__sea"), null); assert.equal(serve("p_moon__ship"), null);
  for (const id of ["p_boxing__joke", "p_chocolate__hot", "p_basketball__tennis"]) assert.match(JSON.parse(readFileSync("data/unlimited/library/preferences.json", "utf8")).pairs[id].by, /^coordinator/);
  for (const p of client.pairs) for (const h of p.hints) for (const f of FIELDS) assert.ok(!/^in Mario Kart/.test(h[f]), `${p.id} ${f} starts lower-case`);
});

test("owner rejection: CAMOUFLAGE + HOOK -> FLY is never served or re-proposed", () => {
  const e = JSON.parse(readFileSync("data/unlimited/library/rejections.json", "utf8")).entries.find((x) => x.pair_id === "p_camouflage__hook" && x.hint === "FLY");
  assert.equal(e?.decision, "rejected"); assert.equal(e.by, "owner");
  assert.ok(!client.pairs.find((x) => x.id === "p_camouflage__hook")?.hints.some((h) => h.text === "FLY"));
});

test("x05 owner batch: served choices match the owner's decisions (LURE preferred, two equal sets, no FLY)", (t) => {
  const serve = (id) => client.pairs.find((x) => x.id === id)?.hints.map((h) => h.text) || null;
  if (!serve("p_hook__perfume")) return t.skip("x05 content not in this export");
  assert.deepEqual(serve("p_television__toilet"), ["POOH"]);
  assert.deepEqual(serve("p_camouflage__hook"), ["LURE"]);
  assert.deepEqual(serve("p_hook__perfume"), ["LURE"]);
  assert.deepEqual(serve("p_nurse__roll"), ["BANDAGE"]);
  assert.deepEqual(serve("p_treasure__war"), ["SPOILS"]);
  assert.deepEqual([...serve("p_sea__witness")].sort(), ["LOOKOUT", "SEE"]);
  assert.deepEqual([...serve("p_appetite__salad")].sort(), ["APPETIZER", "VEGETARIAN"]);
  for (const id of ["p_television__toilet", "p_sea__witness", "p_camouflage__hook", "p_hook__perfume", "p_nurse__roll", "p_treasure__war", "p_appetite__salad"])
    for (const c of byId.get(id).clues) { assert.equal(c.status, "human_approved"); assert.equal(c.provenance.addedBy, "owner"); }
  assert.ok(!byId.get("p_camouflage__hook").clues.some((c) => c.text === "FLY"));
});

test("x06 corrections: DRIVER accepted by the coordinator; EXCALIBUR (LAKE + SWORD) held again by the owner with its history kept; POOH explains the sound-alike", (t) => {
  const s = (id, h) => client.pairs.find((x) => x.id === id)?.hints.find((x) => x.text === h);
  if (!s("p_bus__golf", "DRIVER")) return t.skip("x06 content not in this export");
  const d = byId.get("p_bus__golf").clues.find((x) => x.text === "DRIVER");
  assert.equal(d.override.status, "coordinator_accept"); assert.match(d.override.by, /^coordinator/);
  assert.equal(d.provenance.blindReview.verdict, "BORDERLINE", "the independent review stays on record");
  assert.equal(d.override.endorsed?.by, "owner", "the owner endorsement is recorded separately from the coordinator acceptance");
  // Owner correction (2026-10-19): flagged and unserved, not a permanent exclusion; review and acceptance history kept.
  const e = byId.get("p_lake__sword").clues.find((x) => x.text === "EXCALIBUR");
  assert.equal(e.status, "held"); assert.equal(s("p_lake__sword", "EXCALIBUR"), undefined);
  assert.equal(e.override.by, "owner"); assert.equal(e.override.via, "rejections.json"); assert.match(e.override.reason, /not a permanent exclusion/);
  assert.equal(e.override.history?.[0]?.status, "coordinator_accept"); assert.ok(e.override.history[0].superseded);
  assert.equal(e.provenance.blindReview.verdict, "BORDERLINE"); assert.equal(e.provenance.blindReview.reviewer, "x06-reviewer-a");
  assert.match(e.revealExplanation, /Lady of the Lake/);
  const p = s("p_television__toilet", "POOH");
  assert.match(p.revealExplanation, /sounds like "poo,"/); assert.match(p.wordBConnection, /sounds like "poo,"/);
  assert.match(s("p_stone__sword", "EXCALIBUR").revealExplanation, /retellings/);
});

test("owner rejection: SPEAKER + SWORD → EXCALIBUR (adaptation trivia) is blocked, the pair stays open for other hints", async () => {
  const { loadRejections, rejectionFor } = await import("./rejections-lib.mjs");
  const all = loadRejections();
  const e = rejectionFor(all, "SWORD", "SPEAKER", "excalibur");
  assert.equal(e?.decision, "rejected"); assert.equal(e.by, "owner"); assert.match(e.reason, /Soul Eater/);
  assert.equal(rejectionFor(all, "SPEAKER", "SWORD", "SABER"), null, "only this hint is rejected, not the pair");
  assert.equal(client.pairs.find((x) => x.id === "p_speaker__sword")?.hints.some((h) => h.text === "EXCALIBUR") ?? false, false);
  assert.equal(rejectionFor(all, "LAKE", "SWORD", "EXCALIBUR")?.decision, "held", "LAKE + SWORD stays review-pending, not rejected");
});

test("RECENT + COCKROACH: LARVAE kept as a failed, fact-checked attempt; HATCHLING is an unapproved candidate; nothing served", async () => {
  const { loadRejections, rejectionFor } = await import("./rejections-lib.mjs");
  const p = byId.get("p_cockroach__recent");
  const larvae = p.clues.find((c) => c.text === "LARVAE"), hatch = p.clues.find((c) => c.text === "HATCHLING");
  assert.equal(larvae.status, "rejected"); assert.equal(larvae.provenance.addedBy, "owner");
  assert.match(larvae.heldReason, /^recorded rejection: factually incorrect/, "a fact-check rejection is not labelled as the owner's");
  assert.match(rejectionFor(loadRejections(), "RECENT", "COCKROACH", "larvae").reason, /egg, nymph, adult/);
  assert.equal(hatch.status, "candidate"); assert.equal(hatch.provenance.source, "coordinator-suggestion"); assert.ok(!hatch.override);
  assert.equal(client.pairs.find((x) => x.id === "p_cockroach__recent"), undefined);
});

test("owner-selected RECENT + FLY and RECENT + MOSQUITO → LARVAE are served; COCKROACH never gets LARVAE; HATCHLING stays unselected", () => {
  for (const [id, w] of [["p_fly__recent", "fly"], ["p_mosquito__recent", "mosquito"]]) {
    const h = client.pairs.find((x) => x.id === id)?.hints;
    assert.deepEqual(h?.map((x) => x.text), ["LARVAE"]);
    assert.equal(h[0].wordBConnection, `A recently hatched ${w} is a larva.`);
    const c = byId.get(id).clues[0];
    assert.equal(c.status, "human_approved"); assert.equal(c.provenance.addedBy, "owner"); assert.equal(c.override.by, "owner");
    assert.match(c.provenance.note, /I like those/); assert.match(c.provenance.note, /stretch/);
  }
  assert.ok(!client.pairs.some((x) => x.id === "p_cockroach__recent"));
  assert.equal(byId.get("p_cockroach__recent").clues.find((c) => c.text === "HATCHLING").status, "candidate");
});

test("x07 owner candidates: four coordinator-accepted from owner suggestions; K9 held on syntax; PURGATORY not accepted; PENGUIN later owner-selected", async () => {
  const { loadRejections, rejectionFor } = await import("./rejections-lib.mjs");
  for (const [id, h] of [["p_laugh__volcano", "ERUPT"], ["p_instrument__pocket", "HARMONICA"], ["p_apple__pumpkin", "PIE"], ["p_calculator__pumpkin", "PI"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h), `${h} served`);
    assert.equal(c.provenance.addedBy, "owner", "the source suggestion is the owner's");
    assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /^coordinator .*not an owner decision/);
    assert.equal(c.provenance.blindReview, null, "no model review was run");
  }
  assert.match(byId.get("p_calculator__pumpkin").clues[0].revealExplanation, /sounds like pie/);
  assert.equal(byId.get("p_dog__police").clues.find((x) => x.text === "K9")?.text, "K9", "held for the letters-only rule at first; stored as K9 once the owner allowed the spelling, never renamed");
  const pen = byId.get("p_antarctica__rooster").clues.find((x) => x.text === "PENGUIN");
  assert.equal(pen.status, "human_approved", "candidate at first; later owner-selected (see the penguin analogy test)");
  const all = loadRejections();
  assert.equal(rejectionFor(all, "DEVIL", "CROSSROADS", "PURGATORY")?.decision, "rejected");
  assert.equal(rejectionFor(all, "DEVIL", "CROSSROADS", "DEAL"), null, "DEAL stays an open candidate");
});

test("x07 penguin analogy: ANTARCTICA + ROOSTER and ICE + ROOSTER owner-selected; the 12-pair ANTARCTICA + bird family coordinator-accepted, all served", () => {
  for (const [id, exp] of [["p_antarctica__rooster", "A rooster is a bird; penguins are the birds strongly associated with Antarctica."], ["p_ice__rooster", /commonly associated with ice/]]) {
    const c = byId.get(id).clues.find((x) => x.text === "PENGUIN");
    assert.equal(c.status, "human_approved"); assert.equal(c.override.by, "owner"); assert.equal(c.provenance.addedBy, "owner");
    const s = client.pairs.find((x) => x.id === id)?.hints.find((x) => x.text === "PENGUIN");
    assert.ok(s); if (typeof exp === "string") assert.equal(s.revealExplanation, exp); else assert.match(s.revealExplanation, exp);
  }
  const fam = ["BIRD", "ROBIN", "CHICK", "KIWI", "TURKEY", "DUCK", "EAGLE", "OWL", "CROW", "PIGEON", "HAWK", "HEN"];
  for (const w of fam) {
    const id = ["ANTARCTICA", w].sort().map((x) => x.toLowerCase()).join("__");
    const c = byId.get(`p_${id}`).clues.find((x) => x.text === "PENGUIN");
    assert.equal(c.status, "ai_reviewed"); assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /^coordinator .*not an owner decision/);
    assert.match(c.provenance.addedBy, /^main session/, "drafted by the main session, accepted by the coordinator"); assert.equal(c.provenance.blindReview, null);
    assert.ok(client.pairs.find((x) => x.id === `p_${id}`)?.hints.some((x) => x.text === "PENGUIN"));
    assert.doesNotMatch(c.revealExplanation, /all penguins|lives? in Antarctica/i);
    assert.doesNotMatch(c.revealExplanation, /penguin is an? (robin|duck|eagle|owl|crow|pigeon|hawk|hen|turkey|kiwi|chick)\b/i);
  }
  assert.equal(byId.get("p_frozen__rooster"), undefined, "FROZEN is not in the bank");
  assert.ok(![...byId.values()].some((p) => p.clues.some((c) => c.text === "WADDLE")), "WADDLE was never selected");
});

test("editorial-bar holds lifted by the coordinator: ten served with reviews and history kept; GOTHAM, JAWS, SAILOR, SHERLOCK still pending", () => {
  const T = [["p_boss__dog", "BARK"], ["p_boss__tree", "BARK"], ["p_casino__golf", "CHIP"], ["p_casino__stocks", "CHIP"], ["p_ship__skateboard", "DECK"], ["p_balance__dragon", "SCALE"], ["p_balance__map", "SCALE"], ["p_bird__boat", "SEAGULL"], ["p_angel__stage", "WING"], ["p_buffalo__stage", "WING"]];
  for (const [id, h] of T) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    // BOSS + TREE: the owner chose BARKS on 2026-10-22 (consolidated-1022 review); BARK stays stored with this history
    if (id === "p_boss__tree") assert.deepEqual(client.pairs.find((x) => x.id === id).hints.map((x) => x.text), ["BARKS"]);
    else assert.ok(client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h), `${id} ${h} served`);
    assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /^coordinator .*not an owner decision/);
    assert.equal(c.provenance.blindReview.verdict, "PASS", "the original review is kept");
    assert.match(c.override.history?.[0]?.by || "", /editorial bar/); assert.ok(c.override.history[0].superseded);
  }
  for (const [id, h] of [["p_knight__new-york", "GOTHAM"], ["p_new-york__penguin", "GOTHAM"], ["p_beach__bond", "JAWS"], ["p_moon__sea", "SAILOR"], ["p_london__violin", "SHERLOCK"]])
    assert.equal(byId.get(id).clues.find((x) => x.text === h).status, "held", `${id} ${h} stays pending`);
});

test("x08 owner proposals: seven coordinator-accepted, CAIRO / BILL / SWEEP / BEGGAR owner-selected, EGYPT and BROOM kept unselected", () => {
  const served = (id, h) => client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h);
  for (const [id, h] of [["p_flea__ladder", "CIRCUS"], ["p_pilot__solitary", "SOLO"], ["p_business__duck", "AFLAC"], ["p_bird__pirate", "PARROT"], ["p_dog__drawing", "DOODLE"], ["p_bucket__firefighter", "WATER"], ["p_barn__note", "BANJO"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(served(id, h), `${h} served`); assert.equal(c.provenance.addedBy, "owner");
    assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /not an owner decision/);
  }
  for (const [id, h] of [["p_archaeology__capital", "CAIRO"], ["p_gate__science", "BILL"], ["p_clean__swing", "SWEEP"], ["p_bread__fool", "BEGGAR"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(served(id, h), `${h} served`); assert.equal(c.status, "human_approved"); assert.equal(c.override.by, "owner");
  }
  for (const [id, h] of [["p_archaeology__capital", "EGYPT"], ["p_clean__swing", "BROOM"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.equal(c.status, "held"); assert.match(c.override.reason, /^not selected/); assert.ok(!served(id, h));
  }
  const b = byId.get("p_bread__fool").clues.find((x) => x.text === "BEGGAR");
  assert.equal(b.revealExplanation, "Picture a foolish storybook character begging for a crust of bread.");
  assert.match(b.provenance.note, /not a proven medieval trope/); assert.match(b.provenance.note, /parent disagreed/);
  assert.match(byId.get("p_gate__science").clues[0].revealExplanation, /GATE with an S/);
  assert.equal(byId.get("p_bread__fool").clues.length, 1, "MONEY and SUCKER are not stored");
});

test("x09 owner proposals: seven coordinator-accepted, SWALLOWING owner-selected with SWALLOWER / SWALLOW unselected; BEGGAR endorsement kept", () => {
  const served = (id, h) => client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h);
  for (const [id, h] of [["p_car__doll", "DUMMY"], ["p_movie__shower", "PSYCHO"], ["p_television__war", "MASH"], ["p_appetite__saber", "JABBA"], ["p_appetite__chest", "STOMACH"], ["p_tree__war", "ENTS"], ["p_fast__photo", "SNAPSHOT"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(served(id, h), `${h} served`); assert.equal(c.provenance.addedBy, "owner");
    assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /not an owner decision/);
  }
  assert.doesNotMatch(byId.get("p_appetite__saber").clues[0].revealExplanation, /wields|swings|his (light)?saber/i);
  assert.doesNotMatch(byId.get("p_appetite__chest").clues[0].revealExplanation, /inside (the|your) chest/i);
  const k = byId.get("p_drink__knife").clues;
  const sw = k.find((x) => x.text === "SWALLOWING");
  assert.equal(sw.status, "human_approved"); assert.equal(sw.override.by, "owner"); assert.ok(served("p_drink__knife", "SWALLOWING"));
  assert.doesNotMatch(sw.revealExplanation, /usual|usually|how to/i);
  for (const t of ["SWALLOWER", "SWALLOW"]) { const c = k.find((x) => x.text === t); assert.equal(c.status, "held"); assert.match(c.override.reason, /^not selected/); assert.ok(!served("p_drink__knife", t)); }
  const b = byId.get("p_bread__fool").clues.find((x) => x.text === "BEGGAR");
  assert.equal(b.status, "human_approved"); assert.match(b.override.endorsed?.note || "", /I.m confident/);
});

test("x10 owner proposals: CLIFFORD ×2 and CANNON + WORK FIRED accepted; LAUNCHED owner-selected; COKE flagged and held out of the default pool", async () => {
  const { loadRejections, rejectionFor } = await import("./rejections-lib.mjs");
  const served = (id, h) => client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h);
  for (const [id, h] of [["p_big__dog", "CLIFFORD"], ["p_dog__large", "CLIFFORD"], ["p_cannon__work", "FIRED"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(served(id, h)); assert.equal(c.provenance.addedBy, "owner"); assert.equal(c.override.status, "coordinator_accept");
  }
  for (const id of ["p_cannon__promotion", "p_explosion__promotion"]) {
    const l = byId.get(id).clues.find((x) => x.text === "LAUNCHED"), f = byId.get(id).clues.find((x) => x.text === "FIRED");
    assert.ok(served(id, "LAUNCHED")); assert.equal(l.override.by, "owner"); assert.match(l.provenance.addedBy, /^parent/);
    assert.equal(f.status, "held"); assert.match(f.override.reason, /^not selected/); assert.ok(!served(id, "FIRED"));
  }
  const coke = byId.get("p_diet__line").clues.find((x) => x.text === "COKE");
  assert.deepEqual(coke.contentFlags, ["not-family-friendly"]); assert.equal(coke.status, "held");
  assert.ok(!client.pairs.some((p) => p.hints.some((h) => h.text === "COKE")), "never in the default pool");
  const e = rejectionFor(loadRejections(), "LINE", "DIET", "COKE");
  assert.equal(e.decision, "held"); assert.match(e.holdType, /^content-suitability/); assert.match(e.reason, /not a rejection/);
  assert.deepEqual(byId.get("p_band__thunder").clues.map((x) => x.text), ["AC/DC"], "pending on the hint rule at first; stored as AC/DC once allowed, never respelled");
  assert.equal(byId.get("p_cannon__job"), undefined, "JOB is not in the bank");
});

test("x11 owner proposals: CAROLING, VOILA, NOAH coordinator-accepted; CAP'N pending on the apostrophe; animal × SHIP family not stored", async () => {
  for (const [id, h] of [["p_christmas__voice", "CAROLING"], ["p_france__magic", "VOILA"], ["p_sheep__ship", "NOAH"]]) {
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.ok(client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h)); assert.equal(c.provenance.addedBy, "owner");
    assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /not an owner decision/);
  }
  assert.match(byId.get("p_sheep__ship").clues[0].revealExplanation, /familiar Bible story/);
  for (const id of ["p_cannon__cereal", "p_cereal__pirate"]) assert.deepEqual(byId.get(id).clues.map((x) => x.text), ["CAP'N"], "pending on the apostrophe at first; stored as CAP'N once allowed, never respelled");
  for (const w of ["lion", "giraffe", "rat", "whale"]) assert.equal(byId.get(`p_${w}__ship`), undefined, "proposal only");
  // x20 drafted CROW + SHIP -> NEST independently; the parent's source audit approved it (the x11 entry was an assistant proposal, not an owner hold)
  const crow = byId.get("p_crow__ship"); assert.deepEqual(crow.clues.map((c) => [c.text, c.status, c.provenance.source]), [["NEST", "ai_reviewed", "x20"]]);
  assert.equal(crow.clues[0].override.status, "coordinator_accept"); assert.match(crow.clues[0].override.reason, /assistant-prepared proposal awaiting parent review, not an owner hold/);
  assert.deepEqual(client.pairs.find((x) => x.id === "p_crow__ship").hints.map((h) => h.text), ["NEST"]);
  const { reservedPairIds } = await import("./reserved-pairs.mjs"); const res = reservedPairIds();
  assert.ok(!res.has("p_crow__ship")); assert.ok(res.has("p_rat__ship") && res.has("p_ship__whale") && res.has("p_lion__ship"));
  assert.equal(byId.get("p_bird__ship"), undefined, "BIRD + SHIP still only the owner FALCON hold");
  // the checker and batch builds treat the whole x11 animal x SHIP proposal as reserved for coordinator review
  const { spawnSync } = await import("node:child_process");
  for (const [x, y, h] of [["RAT", "SHIP", "SINKING"], ["WHALE", "SHIP", "AHAB"], ["LION", "SHIP", "NOAH"]])
    assert.match(spawnSync(process.execPath, ["scripts/unlimited/x14-check.mjs", x, y, h], { encoding: "utf8" }).stdout, /reserved for coordinator review/);
});

test("conventional spellings served exactly: POLICE + DOG → K9, THUNDER + BAND → AC/DC, CANNON + CEREAL and PIRATE + CEREAL → CAP'N", () => {
  for (const [id, h, owner] of [["p_dog__police", "K9", false], ["p_band__thunder", "AC/DC", true], ["p_cannon__cereal", "CAP'N", false], ["p_cereal__pirate", "CAP'N", false]]) {
    const s = client.pairs.find((x) => x.id === id)?.hints;
    assert.deepEqual(s?.map((x) => x.text), [h], `${id} serves the exact spelling`);
    const c = byId.get(id).clues.find((x) => x.text === h);
    assert.equal(c.provenance.addedBy, "owner");
    if (owner) { assert.equal(c.status, "human_approved"); assert.equal(c.override.by, "owner"); }
    else { assert.equal(c.override.status, "coordinator_accept"); assert.match(c.override.by, /not an owner decision/); }
  }
  assert.ok(!client.pairs.some((p) => p.hints.some((h) => /[^A-Z0-9/'-]/.test(h.text))), "only letters, digits, /, ' and - in served hints");
  // the hyphen (added 2026-10-20) is served only in conventional spellings: WALL-E (x17), CROCK-POT (x18), HEIGH-HO and X-MEN (x19),
  // 1-UP, POST-IT and WALK-IN (x20), a second 1-UP plus DOUBLE-DECKER, KNOCK-KNOCK and TICK-TOCK (x21), DO-RE-MI and KOOL-AID (x22), HE-MAN and a second DO-RE-MI (x23),
  // A-FRAME, CATCH-UP, ITSY-BITSY, JACK-O-LANTERN, PAC-MAN, PING-PONG, SCI-FI, SPIDER-MAN and a second DOUBLE-DECKER and POST-IT (consolidated-1022 import)
  assert.deepEqual(client.pairs.flatMap((p) => p.hints.filter((h) => h.text.includes("-")).map((h) => h.text)).sort(), ["1-UP", "1-UP", "A-FRAME", "CATCH-UP", "CROCK-POT", "DO-RE-MI", "DO-RE-MI", "DOUBLE-DECKER", "DOUBLE-DECKER", "HE-MAN", "HEIGH-HO", "HEIGH-HO", "ITSY-BITSY", "JACK-O-LANTERN", "KNOCK-KNOCK", "KOOL-AID", "PAC-MAN", "PING-PONG", "POST-IT", "POST-IT", "SCI-FI", "SPIDER-MAN", "TICK-TOCK", "WALK-IN", "WALL-E", "X-MEN", "ANT-MAN", "BA-DUM-TSS", "PAC-MAN", "PAC-MAN", "TIGHT-KNIT", "X-MEN"].sort());
});

test("x12: 162 served from blind review, 8 more coordinator-accepted (5 holds, then RING ×2 and STRAP); coordinator wording corrections traceable; existing served pairs untouched", () => {
  const x12 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x12").map((c) => ({ p, c })));
  assert.equal(x12.length, 170);
  const n = (s) => x12.filter(({ c }) => c.status === s).length;
  // 162 PASS, then 5 BORDERLINE accepted by the coordinator (x12 cleanup); RING (BAND + FINGER) still held.
  // + RING (BAND + WEDDING, BAND + FINGER) and STRAP (BAND + WATCH) accepted by the coordinator after the synonym-rule audit.
  assert.equal(n("ai_reviewed"), 170); assert.equal(n("held"), 0); assert.equal(n("rejected"), 0);
  for (const [id, t, v] of [["p_band__wedding", "RING", "FAIL"], ["p_band__finger", "RING", "BORDERLINE"], ["p_band__watch", "STRAP", "FAIL"]]) {
    const c = byId.get(id).clues.find((x) => x.text === t);
    assert.equal(c.override.status, "coordinator_accept"); assert.equal(c.provenance.blindReview.verdict, v, "raw review kept");
  }
  assert.match(byId.get("p_band__watch").clues[0].override.reason, /WRIST .*unselected/);
  for (const t of ["SMASHING", "ROCK", "PLANTS", "CONTROLLER", "SOCKET"]) {
    const c = x12.find(({ c }) => c.text === t && c.override?.status === "coordinator_accept")?.c;
    assert.ok(c, t); assert.equal(c.provenance.blindReview.verdict, "BORDERLINE", "the raw review stays on record"); assert.match(c.override.by, /not an owner decision/);
  }
  assert.match(x12.find(({ c }) => c.text === "CONTROLLER").c.override.reason, /WII .* unselected/);
  for (const { p, c } of x12) {
    const served = client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text);
    assert.equal(!!served, c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  }
  const spam = x12.find(({ c }) => c.text === "SPAM").c;
  assert.match(spam.revealExplanation, /canned pork with ham/); assert.match(spam.provenance.textCorrection.note, /parent post-review correction/);
  assert.match(spam.provenance.textCorrection.from.revealExplanation, /canned ham/, "the old text is kept");
  assert.equal(x12.find(({ c }) => c.text === "NINTENDO").c.revealExplanation, "Nintendo makes the Switch video game console.");
  assert.doesNotMatch(x12.find(({ c }) => c.text === "GALAXY").c.revealExplanation, /star system/);
});

test("x13: 127 candidates on unseen pairs; 122 served from blind review, 4 holds accepted, MARCHING replaced by ROCK; reviewer accuracy fixes traceable", () => {
  const x13 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x13").map((c) => ({ p, c })));
  assert.equal(x13.length, 127);
  const n = (s) => x13.filter(({ c }) => c.status === s).length;
  // 122 PASS, then PURPLE, ROLL, STAR and CROSSING accepted by the coordinator; MARCHING kept (held) as a less-preferred proposal, ROCK serves BAND + SCHOOL.
  assert.equal(n("ai_reviewed"), 126); assert.equal(n("held"), 1); assert.equal(n("rejected"), 0);
  assert.deepEqual(client.pairs.find((x) => x.id === "p_band__school").hints.map((h) => h.text), ["ROCK"]);
  assert.match(byId.get("p_band__school").clues.find((c) => c.text === "MARCHING").override.reason, /not a rejection/);
  assert.equal(byId.get("p_chess__sand").clues.find((c) => c.text === "CASTLE").wordAConnection, "You can castle in chess.");
  for (const { p, c } of x13) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const shrek = x13.find(({ c }) => c.text === "SHREK").c;
  assert.doesNotMatch(shrek.revealExplanation, /wife|marr/i); assert.match(shrek.revealExplanation, /^In the Shrek films/);
  const tc = JSON.stringify([shrek.provenance.textCorrection, shrek.provenance.textCorrectionHistory]); assert.match(tc, /parent post-review text cleanup/); assert.match(tc, /reviewer-suggested accuracy fix/, "earlier correction kept as history");
  assert.match(x13.find(({ c }) => c.text === "STEM").c.revealExplanation, /technology, engineering/);
});

test("x14: 222 candidates on unseen pairs; 219 passed review; EXCALIBUR and THESEUS familiarity-held (ESCAPE serves LABYRINTH + THREAD); wording fixes traceable", () => {
  const x14 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x14").map((c) => ({ p, c })));
  assert.equal(x14.length, 222);
  const n = (s) => x14.filter(({ c }) => c.status === s).length;
  // 219 PASS; THESEUS then familiarity-held, with ESCAPE (coordinator selection, source catalogue add) serving LABYRINTH + THREAD.
  // + JUDY accepted (moderate familiarity); HOTDOG kept as a held option while CONDIMENT (coordinator selection) serves KETCHUP + MUSTARD.
  assert.equal(n("ai_reviewed"), 219); assert.equal(n("held"), 3); assert.equal(n("rejected"), 0);
  assert.deepEqual(client.pairs.find((x) => x.id === "p_ketchup__mustard").hints.map((h) => h.text), ["CONDIMENT"]);
  assert.match(byId.get("p_ketchup__mustard").clues.find((c) => c.text === "HOTDOG").override.reason, /not for a bad connection/);
  assert.deepEqual(client.pairs.find((x) => x.id === "p_punch__puppet").hints.map((h) => h.text), ["JUDY"]);
  assert.deepEqual(client.pairs.find((x) => x.id === "p_labyrinth__thread").hints.map((h) => h.text), ["ESCAPE"]);
  assert.match(byId.get("p_labyrinth__thread").clues.find((c) => c.text === "THESEUS").override.reason, /familiarity hold/);
  assert.equal(byId.get("p_labyrinth__thread").clues.find((c) => c.text === "ESCAPE").provenance.blindReview, null, "a coordinator selection, not a model verdict");
  assert.doesNotMatch(byId.get("p_alien__day").clues[0].revealExplanation, /Fourth|July/);
  assert.doesNotMatch(byId.get("p_car__plot").clues[0].revealExplanation, /wing/);
  for (const { p, c } of x14) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const ex = byId.get("p_lady__lake").clues.find((c) => c.text === "EXCALIBUR");
  assert.equal(ex.status, "held"); assert.match(ex.override.reason, /owner-familiarity hold/); assert.match(ex.override.reason, /stays open/);
  assert.doesNotMatch(byId.get("p_pound__silver").clues[0].revealExplanation, /fine silver/);
  assert.match(byId.get("p_dream__top").clues[0].revealExplanation, /reality check/);
  assert.ok(!x14.some(({ c }) => /favourite|colour/.test(c.revealExplanation + c.wordAConnection + c.wordBConnection)));
});

test("x15: 213 candidates on unseen pairs; 207 served after blind review, 5 held, 1 rejected; parent text fixes traceable", () => {
  const x15 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x15").map((c) => ({ p, c })));
  assert.equal(x15.length, 213);
  const n = (s) => x15.filter(({ c }) => c.status === s).length;
  // + BOOT, PUPPET, ROOK, WIMBLEDON x2 coordinator-accepted; JAR kept (held) while TROUBLE serves JAM + PICKLE.
  assert.equal(n("ai_reviewed"), 212); assert.equal(n("held"), 1); assert.equal(n("rejected"), 0);
  for (const { p, c } of x15) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  assert.doesNotMatch(byId.get("p_japan__penguin").clues[0].revealExplanation, /last country/);
  assert.match(byId.get("p_ball__ram").clues[0].revealExplanation, /Dodge Ram/);
});

test("x16: 210 candidates on unseen pairs; 206 PASS, 4 BORDERLINE coordinator-accepted; RUSSIAN serves DOLL + NEST (BABUSHKA held); text fixes traceable", () => {
  const x16 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x16").map((c) => ({ p, c })));
  assert.equal(x16.length, 210);
  const n = (s) => x16.filter(({ c }) => c.status === s).length;
  // + VICTORIA, MAVERICK, DAREDEVIL, TREAD coordinator-accepted; BABUSHKA (review PASS) kept as a held option while RUSSIAN serves DOLL + NEST.
  assert.equal(n("ai_reviewed"), 209); assert.equal(n("held"), 1); assert.equal(n("rejected"), 0);
  for (const { p, c } of x16) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const dn = byId.get("p_doll__nest");
  const ru = dn.clues.find((c) => c.text === "RUSSIAN");
  assert.equal(ru.status, "ai_reviewed"); assert.equal(ru.override.status, "coordinator_accept"); assert.equal(ru.provenance.blindReview, null);
  assert.equal(dn.clues.find((c) => c.text === "BABUSHKA").provenance.blindReview.verdict, "PASS");
  assert.deepEqual(client.pairs.find((x) => x.id === "p_doll__nest").hints.map((h) => h.text), ["RUSSIAN"]);
  const bald = byId.get("p_clean__eagle").clues[0];
  assert.doesNotMatch(bald.revealExplanation + bald.wordBConnection, /so is the bald eagle/);
  assert.match(bald.provenance.textCorrection.from.revealExplanation, /so is the bald eagle/);
  const mav = byId.get("p_cowboy__jet").clues[0];
  assert.equal(mav.status, "ai_reviewed"); assert.equal(mav.override.status, "coordinator_accept"); assert.equal(mav.provenance.blindReview.verdict, "BORDERLINE"); assert.equal(mav.reference.recognizability, "moderate"); assert.doesNotMatch(mav.revealExplanation + mav.wordAConnection, /Dallas/);
  assert.match(byId.get("p_bomb__bus").clues[0].revealExplanation, /50 mph/);
  assert.doesNotMatch(byId.get("p_new-york__square").clues[0].revealExplanation, /landmarks/);
});

test("x17: 235 candidates on unseen pairs; 227 PASS + 4 BORDERLINE coordinator-accepted; BIG, SWEET, LUCK coordinator selections; WALL-E spelling and text fixes traceable", () => {
  const x17 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x17").map((c) => ({ p, c })));
  assert.equal(x17.length, 235);
  const n = (s) => x17.filter(({ c }) => c.status === s).length;
  // VIRAL, MAD, ABBEY, FRENCH coordinator-accepted; PIXEL, CAVITY, DIE kept held behind BIG, SWEET, LUCK; DELOREAN familiarity-held.
  assert.equal(n("ai_reviewed"), 231); assert.equal(n("held"), 4); assert.equal(n("rejected"), 0);
  for (const [id, h, old] of [["p_picture__screen", "BIG", "PIXEL"], ["p_sugar__tooth", "SWEET", "CAVITY"], ["p_dice__hard", "LUCK", "DIE"]]) {
    const cs = byId.get(id).clues; const sel = cs.find((c) => c.text === h);
    assert.equal(sel.override.status, "coordinator_accept"); assert.equal(sel.provenance.blindReview, null);
    assert.equal(cs.find((c) => c.text === old).status, "held");
    assert.deepEqual(client.pairs.find((x) => x.id === id).hints.map((x) => x.text), [h]);
  }
  assert.match(byId.get("p_dice__hard").clues.find((c) => c.text === "DIE").override.reason, /spelling-rule hold/);
  assert.ok(!client.pairs.some((x) => x.id === "p_dog__einstein"));
  for (const { p, c } of x17) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const w = byId.get("p_robot__trash").clues;
  assert.equal(w.length, 1); assert.equal(w[0].text, "WALL-E"); assert.equal(w[0].provenance.hintSpelling.from, "WALLE");
  assert.deepEqual(client.pairs.find((x) => x.id === "p_robot__trash").hints.map((h) => h.text), ["WALL-E"]);
  const sc = byId.get("p_box__cat").clues[0];
  assert.doesNotMatch(sc.wordBConnection, /both alive and dead/); assert.match(sc.provenance.textCorrection.from.wordBConnection, /both alive and dead/);
  assert.doesNotMatch(byId.get("p_bath__gold").clues[0].revealExplanation, /while testing/);
  assert.match(byId.get("p_bike__pilot").clues[0].revealExplanation, /first controlled, powered airplane flight/);
});

test("x18: 219 candidates on unseen pairs; 211 PASS + CANON, JAZZ, GORILLA accepted; RELATIVITY, DEAD, HAND, ASH coordinator selections; text fixes traceable", () => {
  const x18 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x18").map((c) => ({ p, c })));
  assert.equal(x18.length, 219);
  const n = (s) => x18.filter(({ c }) => c.status === s).length;
  // held: FINISH, HOUR (less preferred), DELOREAN, FAWKES, LANTERN (familiarity; LANTERN's pair stays open, unserved)
  assert.equal(n("ai_reviewed"), 214); assert.equal(n("held"), 5); assert.equal(n("rejected"), 0);
  for (const [id, h, old] of [["p_end__line", "DEAD", "FINISH"], ["p_clock__short", "HAND", "HOUR"], ["p_fireworks__phoenix", "ASH", "FAWKES"]]) {
    const cs = byId.get(id).clues; const sel = cs.find((c) => c.text === h);
    assert.equal(sel.override.status, "coordinator_accept"); assert.equal(sel.provenance.blindReview, null);
    assert.equal(cs.find((c) => c.text === old).status, "held");
    assert.deepEqual(client.pairs.find((x) => x.id === id).hints.map((x) => x.text), [h]);
  }
  assert.ok(!client.pairs.some((x) => x.id === "p_halloween__turnip"));
  for (const { p, c } of x18) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const pl = byId.get("p_cast__wall").clues[0];
  // two corrections (reviewer, then parent): the drafted text is kept in the history, the latest correction on top
  assert.doesNotMatch(pl.revealExplanation, /set a broken bone/); assert.match(pl.revealExplanation, /immobilize and support/);
  assert.match(pl.provenance.textCorrectionHistory[0].from.revealExplanation, /set a broken bone/);
  assert.match(pl.provenance.textCorrection.from.revealExplanation, /hold broken bones in place/);
  assert.doesNotMatch(byId.get("p_cast__dice").clues[0].wordBConnection, /one of a pair/);
  // parent cleanup: RELATIVITY (coordinator selection) serves EINSTEIN + TIME; DELOREAN familiarity-held; CROCK-POT spelling
  const et = byId.get("p_einstein__time").clues; const rel = et.find((c) => c.text === "RELATIVITY");
  assert.equal(rel.override.status, "coordinator_accept"); assert.equal(rel.provenance.blindReview, null);
  assert.equal(et.find((c) => c.text === "DELOREAN").status, "held");
  assert.deepEqual(client.pairs.find((x) => x.id === "p_einstein__time").hints.map((h) => h.text), ["RELATIVITY"]);
  const cp = byId.get("p_cook__slow").clues; assert.equal(cp.length, 1); assert.equal(cp[0].text, "CROCK-POT"); assert.equal(cp[0].provenance.hintSpelling.from, "CROCKPOT");
});

test("x19: 210 candidates on unseen pairs; 199 PASS + 6 BORDERLINE accepted; SCIENTIST, ARES, STRING, SATELLITE, SANDERSON coordinator selections; text fixes traceable", () => {
  const x19 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x19").map((c) => ({ p, c })));
  assert.equal(x19.length, 210);
  const n = (s) => x19.filter(({ c }) => c.status === s).length;
  // DOC (review PASS) is familiarity-held: it relies on the Back to the Future dog named Einstein.
  // + CAFE, POINT, ROMAN, ISLAND, DOLLY, SLEDGE accepted; held: DOC, KRATOS, FIDDLE, TELESCOPE, MACBETH (valid alternatives) and QUARK (familiarity, pair open)
  assert.equal(n("ai_reviewed"), 204); assert.equal(n("held"), 6); assert.equal(n("rejected"), 0);
  for (const [id, h, old] of [["p_god__war", "ARES", "KRATOS"], ["p_bow__violin", "STRING", "FIDDLE"], ["p_dish__radio", "SATELLITE", "TELESCOPE"], ["p_sister__witch", "SANDERSON", "MACBETH"]]) {
    const cs = byId.get(id).clues; const sel = cs.find((c) => c.text === h);
    assert.equal(sel.override.status, "coordinator_accept"); assert.equal(sel.provenance.blindReview, null);
    assert.equal(cs.find((c) => c.text === old).status, "held");
    assert.deepEqual(client.pairs.find((x) => x.id === id).hints.map((x) => x.text), [h]);
  }
  assert.ok(!client.pairs.some((x) => x.id === "p_charm__top"));
  for (const { p, c } of x19) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const be = byId.get("p_brown__einstein").clues; const sci = be.find((c) => c.text === "SCIENTIST");
  assert.equal(sci.override.status, "coordinator_accept"); assert.equal(sci.provenance.blindReview, null);
  const doc = be.find((c) => c.text === "DOC"); assert.equal(doc.status, "held"); assert.equal(doc.provenance.blindReview.verdict, "PASS");
  assert.deepEqual(client.pairs.find((x) => x.id === "p_brown__einstein").hints.map((h) => h.text), ["SCIENTIST"]);
  const hh = byId.get("p_dwarf__work").clues[0];
  // wording cleanup for concision (not a false-quote correction): the drafted lyric stays in provenance with the parent's clarification
  assert.doesNotMatch(hh.revealExplanation + hh.wordBConnection, /off to work we go/); assert.match(hh.provenance.textCorrection.from.revealExplanation, /off to work we go/);
  assert.match(hh.provenance.textCorrection.clarification, /not an established false quote/);
});

test("x20: 221 candidates on unseen pairs; 211 PASS + 9 BORDERLINE accepted; FEED serves INTERNET + TROLL; CROW + SHIP NEST reserved; text fixes traceable", () => {
  const x20 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x20").map((c) => ({ p, c })));
  assert.equal(x20.length, 221);
  const n = (s) => x20.filter(({ c }) => c.status === s).length;
  // + CROW + SHIP -> NEST (review PASS) held: it belongs to the x11 owner proposal-only animal x SHIP family
  // the parent then accepted 9 BORDERLINE rows; BAIT is kept held behind the coordinator-selected FEED
  // CROW + SHIP -> NEST then approved by the parent's source audit; only BAIT stays held
  assert.equal(n("ai_reviewed"), 220); assert.equal(n("held"), 1); assert.equal(n("rejected"), 0);
  const it = byId.get("p_internet__troll").clues; const feed = it.find((c) => c.text === "FEED");
  assert.equal(feed.override.status, "coordinator_accept"); assert.equal(feed.provenance.blindReview, null); assert.equal(it.find((c) => c.text === "BAIT").status, "held");
  assert.deepEqual(client.pairs.find((x) => x.id === "p_internet__troll").hints.map((h) => h.text), ["FEED"]);
  assert.equal(byId.get("p_date__milk").clues[0].revealExplanation, "An expiration date is a familiar printed label on products such as milk cartons.");
  for (const { p, c } of x20) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  const hit = byId.get("p_baseball__song").clues[0];
  assert.doesNotMatch(hit.revealExplanation, /safely reaching base/); assert.match(hit.provenance.textCorrectionHistory[0].from.revealExplanation, /safely reaching base/);
  assert.match(hit.wordAConnection, /Singles, doubles, triples and home runs/);
  const tide = byId.get("p_detergent__wave").clues[0]; assert.match(tide.wordBConnection, /very long ocean waves/); assert.match(tide.provenance.textCorrectionHistory[0].from.wordBConnection, /tidal wave/);
});

test("x21: 220 candidates on unseen pairs; 215 PASS, 4 BORDERLINE, 1 FAIL; JACK, RAPTOR, MASTER, FILLING, AIR coordinator selections; text fixes traceable", () => {
  const x21 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x21").map((c) => ({ p, c })));
  assert.equal(x21.length, 220);
  const n = (s) => x21.filter(({ c }) => c.status === s).length;
  // held: LOKI, SCREECH, PADAWAN, CREAM (valid, behind JACK, RAPTOR, MASTER, FILLING) and DIVING (rule concern; raw FAIL kept); LOOFAH, SHAKESPEARE accepted
  assert.equal(n("ai_reviewed"), 215); assert.equal(n("held"), 5); assert.equal(n("rejected"), 0);
  const dv = byId.get("p_scuba-diver__sky").clues.find((c) => c.text === "DIVING"); assert.equal(dv.status, "held"); assert.equal(dv.provenance.blindReview.verdict, "FAIL");
  for (const { p, c } of x21) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  for (const [id, h, old] of [["p_frost__giant", "JACK", "LOKI"], ["p_eagle__hawk", "RAPTOR", "SCREECH"], ["p_pupil__yoda", "MASTER", "PADAWAN"], ["p_middle__oreo", "FILLING", "CREAM"], ["p_scuba-diver__sky", "AIR", "DIVING"]]) {
    const cs = byId.get(id).clues; const sel = cs.find((c) => c.text === h);
    assert.equal(sel.override.status, "coordinator_accept"); assert.equal(sel.provenance.blindReview, null);
    assert.equal(cs.find((c) => c.text === old).status, "held");
    assert.deepEqual(client.pairs.find((x) => x.id === id).hints.map((x) => x.text), [h]);
  }
  for (const id of ["p_pupil__yoda", "p_north__winter", "p_foot__piano"]) { const c = byId.get(id).clues.find((x) => x.provenance?.source === "x21" && x.provenance.blindReview); assert.doesNotMatch(c.revealExplanation + c.wordAConnection + c.wordBConnection, /\(/); assert.equal(c.reference.recognizability, "moderate"); }
  assert.doesNotMatch(byId.get("p_ghost__song").clues[0].revealExplanation, /three ghosts/);
});

test("x22: 213 candidates on unseen pairs; 204 PASS, 9 BORDERLINE; parent cleanup: 4 accepted, 5 coordinator selections, YORICK and JUMBO replaced; text fixes traceable", () => {
  const x22 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x22").map((c) => ({ p, c })));
  assert.equal(x22.length, 213);
  const n = (s) => x22.filter(({ c }) => c.status === s).length;
  assert.equal(x22.filter(({ c }) => c.provenance.blindReview.verdict === "BORDERLINE").length, 9, "raw reviews kept");
  // held: SUNLIGHT, PARROT, NOCTURNAL, SKITTLES, BOWLER (review BORDERLINE) and YORICK, JUMBO (review PASS, behind BONEHEAD, DUMBO)
  assert.equal(n("ai_reviewed"), 206); assert.equal(n("held"), 7); assert.equal(n("rejected"), 0);
  // CARD is an accepted alternate: playable, but FLASH is the pair's canonical hint
  for (const { p, c } of x22) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed" && p.pair_id !== "p_camera__memory",`${p.pair_id} ${c.text}`);
  for (const [id, h, old, rule] of [["p_camera__memory", "FLASH", "CARD", "canonical"], ["p_stone__troll", "BRIDGE", "SUNLIGHT", "provisional"], ["p_pirate__silver", "TREASURE", "PARROT", "provisional"], ["p_fool__skull", "BONEHEAD", "YORICK", "canonical"], ["p_circus__jet", "DUMBO", "JUMBO", "canonical"]]) {
    const cs = byId.get(id).clues; const sel = cs.find((c) => c.text === h);
    assert.equal(sel.override.status, "coordinator_accept"); assert.equal(sel.provenance.blindReview, null); assert.match(sel.override.by, /not an owner decision/);
    assert.ok(cs.find((c) => c.text === old).provenance.blindReview, `${old} raw review kept`);
    const e = client.pairs.find((x) => x.id === id); assert.equal(e.rule, rule); assert.deepEqual(e.hints.map((x) => x.text), [h]);
  }
  assert.equal(byId.get("p_camera__memory").clues.find((c) => c.text === "CARD").status, "ai_reviewed");
  for (const [id, t] of [["p_doctor__history", "MEDICAL"], ["p_comic__mint", "CONDITION"], ["p_shield__turtle", "SHELL"]]) { const c = byId.get(id).clues.find((x) => x.text === t); assert.equal(c.override.status, "coordinator_accept"); assert.equal(c.provenance.blindReview.verdict, "BORDERLINE"); }
  const bw = byId.get("p_bowling__hat").clues[0]; assert.equal(bw.status, "held"); assert.match(bw.override.reason, /target-stem rule/);
  for (const id of ["p_einstein__shoe", "p_fox__mask"]) assert.equal(byId.get(id).clues.find((c) => c.provenance?.source === "x22").reference.recognizability, "moderate");
  const g = byId.get("p_virus__wheat").clues[0]; assert.match(g.revealExplanation, /embryo/); assert.match(g.provenance.textCorrection.from.revealExplanation, /core/);
  assert.match(byId.get("p_mexico__queen").clues[0].revealExplanation, /^Eastern monarch/);
  const foul = byId.get("p_baseball__play").clues[0]; assert.match(foul.wordAConnection, /foul balls and foul territory/); assert.match(foul.provenance.textCorrection.from.wordAConnection, /lands outside/);
  assert.match(byId.get("p_nasa__team").clues[0].wordBConnection, /familiar members of/);
  const tr = byId.get("p_pirate__silver").clues.find((c) => c.text === "TREASURE"); assert.equal(tr.revealExplanation, "Pirates hunt buried treasure, and silver coins can be treasure."); assert.doesNotMatch(tr.revealExplanation + tr.wordBConnection, /Long John/); assert.match(tr.provenance.textCorrection.from.wordBConnection, /Long John Silver/); assert.ok(tr.override.history[0].superseded);
  const ph = byId.get("p_ghost__theater").clues[0]; assert.match(ph.wordBConnection, /the musical .* became Broadway's longest-running show/); assert.ok(ph.provenance.textCorrectionHistory?.length || ph.provenance.textCorrection, "drafted text kept");
});

test("x23: 237 candidates on unseen pairs; 233 PASS, 4 BORDERLINE; parent holds FAWKES, ARCHIMEDES, SNOOPY; SALE accepted; text fixes traceable", () => {
  const x23 = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "x23").map((c) => ({ p, c })));
  assert.equal(x23.length, 237);
  const v = (s) => x23.filter(({ c }) => c.provenance.blindReview.verdict === s).length;
  assert.equal(v("PASS"), 233); assert.equal(v("BORDERLINE"), 4); assert.equal(v("FAIL"), 0);
  const n = (s) => x23.filter(({ c }) => c.status === s).length;
  // held: FAWKES, ARCHIMEDES (PASS, parent familiarity hold), SNOOPY, PERISCOPE, SAUCE (review BORDERLINE); SALE accepted with a new route
  assert.equal(n("ai_reviewed"), 232); assert.equal(n("held"), 5); assert.equal(n("rejected"), 0);
  for (const { p, c } of x23) assert.equal(!!client.pairs.find((x) => x.id === p.pair_id)?.hints.some((h) => h.text === c.text), c.status === "ai_reviewed", `${p.pair_id} ${c.text}`);
  for (const [id, t, verdict] of [["p_phoenix__plot", "FAWKES", "PASS"], ["p_bath__screw", "ARCHIMEDES", "PASS"], ["p_pilot__spike", "SNOOPY", "BORDERLINE"]]) {
    const c = byId.get(id).clues.find((x) => x.text === t); assert.equal(c.status, "held"); assert.match(c.override.reason, /familiarity/); assert.equal(c.provenance.blindReview.verdict, verdict, "raw review kept");
  }
  const sale = byId.get("p_garage__tag").clues[0]; assert.equal(sale.override.status, "coordinator_accept"); assert.equal(sale.provenance.blindReview.verdict, "BORDERLINE");
  assert.match(sale.wordBConnection, /price tags/); assert.doesNotMatch(sale.revealExplanation + sale.wordBConnection, /tag sale/i); assert.match(sale.provenance.textCorrection.from.revealExplanation, /tag sale/);
  assert.match(byId.get("p_airport__illness").clues[0].revealExplanation, /expected to lead to death/);
  assert.match(byId.get("p_rome__twins").clues[0].revealExplanation, /founding legend/);
  assert.doesNotMatch(byId.get("p_mark__river").clues[0].revealExplanation, /fathoms/);
  assert.doesNotMatch(byId.get("p_honey__month").clues[0].revealExplanation, /comes from/);
  for (const id of ["p_coffee__siren", "p_giraffe__toy", "p_bucket__chocolate"]) assert.equal(byId.get(id).clues[0].reference.recognizability, "moderate");
  assert.match(byId.get("p_thread__worm").clues[0].provenance.textCorrection.from.wordBConnection, /named worms/);
});

test("consolidated-1022 import: append-only, PASS-only, traceable, no template sentence, labelled; owner decisions replayed from the ledger; set-asides untouched", () => {
  const DIR = "data/unlimited/imports/consolidated-1022";
  const imp = [...byId.values()].flatMap((p) => p.clues.filter((c) => c.provenance?.source === "consolidated-1022").map((c) => ({ p, c })));
  assert.deepEqual(JSON.parse(readFileSync(`${DIR}/summary.json`, "utf8")).counts, { "new-pair": 6069, alternative: 18, duplicate: 22, "set-aside": 83 });
  assert.equal(imp.length, 6087);
  const { decisions } = JSON.parse(readFileSync(`${DIR}/owner-decisions.json`, "utf8"));
  const key = (x, y) => `p_${[x, y].map((w) => w.toLowerCase().replace(/ /g, "-")).sort().join("__")}`;
  const approved = new Set(decisions.filter((d) => d.action === "approve").map((d) => `${key(...d.pair)}|${d.hint}`));
  approved.add("p_ray__telescope|LIGHT"); // Later explicit owner correction retains LIGHT as alternative to SUN.
  const prefs = JSON.parse(readFileSync("data/unlimited/library/preferences.json", "utf8")).pairs;
  const serve = (id) => client.pairs.find((x) => x.id === id)?.hints.map((h) => h.text);
  const batch = JSON.parse(readFileSync("data/unlimited/library/batches/consolidated-1022-batch.json", "utf8"));
  const rec = new Map(batch.pairs.map((p) => [p.pair_id, p.clues[0]]));
  for (const { p, c } of imp) {
    assert.equal(c.status, approved.has(`${p.pair_id}|${c.text}`) ? "human_approved" : "ai_reviewed", `${p.pair_id} ${c.text}`);
    assert.equal(c.provenance.blindReview.verdict, "PASS");
    assert.equal(c.revealExplanation, p.pair_id === "p_ray__telescope" ? "A ray is a beam of light. Optical telescopes collect light." : "", `${p.pair_id} has no template sentence unless later owner-corrected`); assert.ok(c.wordAConnection && c.wordBConnection);
    const r = rec.get(p.pair_id); assert.equal(r.text, c.text, `${p.pair_id} traceable to the batch`);
    assert.ok(r.importRecord.candidate_ids.length && r.importRecord.independent.every((e) => /^pass/i.test(e.verdict)));
    assert.equal(c.provenance.request, r.importRecord.candidate_ids.join(" / "));
    assert.deepEqual(c.contentFlags, r.contentFlags, `${p.pair_id} labels kept through the merge`);
  }
  assert.equal(imp.filter(({ c }) => c.contentFlags).length, 226);
  // an alternative on an existing pair is served only when the owner made it the pair's canonical hint
  const alts = imp.filter(({ p }) => p.pair_id !== "p_ray__telescope" && p.clues.some((c) => !["consolidated-1022", "owner-discovery"].includes(c.provenance?.source) || (c.provenance?.source === "owner-discovery" && c.provenance.date < "2026-10-21")));
  assert.equal(alts.length, 18);
  for (const { p, c } of alts) assert.equal(!!serve(p.pair_id)?.includes(c.text), prefs[p.pair_id]?.canonical === c.text, `${p.pair_id} ${c.text}`);
  // 17 source records had the two per-word lines on the wrong words: swapped back with the drafted text kept
  const swapped = imp.filter(({ c }) => c.provenance.textCorrection?.by === "coordinator (consolidated-1022 import)");
  assert.equal(swapped.length, 17);
  for (const { c } of swapped) assert.deepEqual([c.wordAConnection, c.wordBConnection], [c.provenance.textCorrection.from.wordBConnection, c.provenance.textCorrection.from.wordAConnection]);
  // set-asides stay out of the library
  for (const e of JSON.parse(readFileSync(`${DIR}/editorial-set-aside.json`, "utf8")).entries)
    assert.ok(!byId.get(key(...e.pair.split(" + ")))?.clues.some((c) => c.text === e.hint && c.provenance?.source === "consolidated-1022"), `${e.pair} ${e.hint} set aside`);
  // every owner decision is in force; replaced hints stay stored
  for (const d of decisions) {
    const id = key(...d.pair); const c = byId.get(id).clues.find((x) => x.text === d.hint);
    if (d.action === "hold") { assert.equal(c.status, "held"); assert.ok(!serve(id).includes(d.hint)); continue; }
    assert.equal(c.status, "human_approved", `${id} ${d.hint}`); assert.equal(c.override.by, "owner");
    if (d.prefer) { assert.deepEqual(serve(id), [d.hint], id); assert.equal(prefs[id].canonical, d.hint); assert.equal(prefs[id].by, "owner"); }
    else assert.ok(serve(id).length === 1, `${id} serves one hint`);
    if (d.replaces) assert.ok(byId.get(id).clues.some((x) => x.text === d.replaces), `${d.replaces} kept stored`);
  }
  assert.deepEqual(serve("p_shark__swimming"), ["OCEAN"]); assert.deepEqual(serve("p_honey__wood"), ["BEEHIVE"]); assert.deepEqual(serve("p_physical__sport"), ["ATHLETIC"]);
  assert.deepEqual(byId.get("p_cowboy__pistol").clues.find((c) => c.text === "REVOLVER").contentFlags, ["firearms-explosives"]);
  const minnie = byId.get("p_mouse__queen").clues.find((c) => c.text === "MINNIE");
  assert.equal(minnie.provenance.blindReview.verdict, "FAIL", "the earlier review stays recorded"); assert.match(minnie.override.reason, /supersedes/);
  // final decisions: PARKER for SPIDER + MAN (PETER stays stored), AERIAL for FRAME + HELICOPTER (AIR stays stored)
  assert.deepEqual(serve("p_man__spider"), ["PARKER"]); assert.ok(byId.get("p_man__spider").clues.some((c) => c.text === "PETER"));
  assert.deepEqual(serve("p_frame__helicopter"), ["AERIAL"]); assert.ok(byId.get("p_frame__helicopter").clues.some((c) => c.text === "AIR"));
  assert.doesNotMatch(Object.values(byId.get("p_frame__helicopter").clues.find((c) => c.text === "AERIAL")).join(" "), /aerial frame/i);
  // left as they were by the owner
  assert.deepEqual(serve("p_spicy__taco"), ["JALAPENO"]); assert.deepEqual(serve("p_spider__superhero"), ["PARKER"]); assert.deepEqual(serve("p_tap__voice"), ["RECORDING"]);
});
