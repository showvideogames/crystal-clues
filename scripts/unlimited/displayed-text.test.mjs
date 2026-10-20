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
  assert.equal(byId.get("p_dog__police"), undefined, "K9 is not stored or renamed");
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
    assert.ok(client.pairs.find((x) => x.id === id)?.hints.some((x) => x.text === h), `${id} ${h} served`);
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
  assert.equal(byId.get("p_band__thunder"), undefined, "AC/DC is pending on the hint rule; nothing stored or respelled");
  assert.equal(byId.get("p_cannon__job"), undefined, "JOB is not in the bank");
});
