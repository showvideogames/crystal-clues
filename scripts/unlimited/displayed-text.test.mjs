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
