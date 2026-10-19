// node --test scripts/unlimited/collapse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { collapse } from "./collapse-lib.mjs";

test("same named subject is collapsed; articles, possessives and different subjects are not", () => {
  assert.equal(collapse("Harry Potter wears round glasses", "Harry Potter studies at Hogwarts"), "Harry Potter wears round glasses and studies at Hogwarts");
  assert.equal(collapse("Sherlock Holmes lives in London", "Sherlock Holmes plays the violin"), "Sherlock Holmes lives in London and plays the violin");
  assert.equal(collapse("Seagulls soar over the ocean", "Seagulls are famous for snatching snacks"), "Seagulls soar over the ocean and are famous for snatching snacks");
  assert.equal(collapse("A nut has a hard shell", "A snail carries its shell"), null, "an article is not a subject");
  assert.equal(collapse("Harry Potter's owl Hedwig delivers his mail", "Harry Potter learns to cast spells"), null, "possessive vs name");
  assert.equal(collapse("Pixar made Cars", "Pixar's logo is a hopping desk lamp"), null);
  assert.equal(collapse("Dragons are covered in scales", "Piano students practice scales"), null, "different subjects");
});
