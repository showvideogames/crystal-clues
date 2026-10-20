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
