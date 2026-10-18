// Regression tests for reconcile-preferences (2026-10-18 root cause: a derived,
// provisional finalBestAvailable hid explicit saved reviewer picks).
//   node --test scripts/unlimited/reconcile.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "./reconcile-preferences.mjs";

const hint = (text, a, b, fair, status = "ai_reviewed") => ({ text, status, provenance: { blindReview: { verdict: status === "ai_reviewed" ? "PASS" : "BORDERLINE", a, b, fairness: fair } } });
// Exact library shapes of the two masked pairs, including the derived field.
const bearFire = () => ({
  pair_id: "p_bear__fire", a: "BEAR", b: "FIRE", source: "u07",
  reviewerBestAvailable: { text: "SMOKEY", why: "A single character who is both a bear and a fire mascot", reviewer: "blind-subagent-7" },
  finalBestAvailable: { text: "CAMP", basis: "provisional", provisional: true, alternatives: ["SMOKEY"] },
  clues: [hint("CAMP", 2, 2, 2), hint("SMOKEY", 2, 2, 2)],
});
const batCastle = () => ({
  pair_id: "p_bat__castle", a: "BAT", b: "CASTLE", source: "u06",
  reviewerBestAvailable: { text: "DRACULA", why: "Names the exact story where both words sit.", reviewer: "blind-subagent-6" },
  finalBestAvailable: { text: "VAMPIRE", basis: "provisional", provisional: true, alternatives: ["DRACULA"] },
  clues: [hint("VAMPIRE", 2, 2, 2), hint("DRACULA", 2, 2, 2)],
});

test("provisional CAMP no longer masks the saved reviewer pick SMOKEY", () => {
  const r = reconcile([bearFire()], {}, "2026-10-18");
  assert.equal(r.entries.p_bear__fire?.canonical, "SMOKEY");
  assert.equal(r.entries.p_bear__fire.evidence.displaced, "CAMP");
  assert.equal(r.entries.p_bear__fire.evidence.numericalTie, true);
  assert.equal(r.entries.p_bear__fire.basis, "reviewer_final_best_available");
});

test("provisional VAMPIRE no longer masks the saved reviewer pick DRACULA", () => {
  const r = reconcile([batCastle()], {}, "2026-10-18");
  assert.equal(r.entries.p_bat__castle?.canonical, "DRACULA");
  assert.equal(r.entries.p_bat__castle.evidence.displaced, "VAMPIRE");
});

test("an approved preference (owner/parent/earlier) always wins and is never rewritten", () => {
  const owner = { status: "approved", canonical: "CAMP", by: "owner", date: "2026-10-18" };
  const r = reconcile([bearFire()], { p_bear__fire: owner }, "2026-10-18");
  assert.equal(r.entries.p_bear__fire, undefined);
  assert.deepEqual(r.kept, ["p_bear__fire"]);
});

test("a reviewer pick that a later override holds is reported, never promoted", () => {
  const p = bearFire();
  p.clues[1].status = "held"; // e.g. an owner/parent hold on SMOKEY
  const r = reconcile([p], {}, "2026-10-18");
  assert.equal(r.entries.p_bear__fire, undefined);
  assert.equal(r.contradictions.length, 1);
  assert.match(r.contradictions[0], /SMOKEY is held/);
});

test("a correction review's pick is the saved FINAL evidence ahead of the original pick", () => {
  const p = bearFire();
  p.clues.push(hint("ASH", 2, 2, 2));
  p.correctionBestAvailable = { text: "ASH", why: "correction review", reviewer: "correction-subagent" };
  const r = reconcile([p], {}, "2026-10-18");
  assert.equal(r.entries.p_bear__fire?.canonical, "ASH");
});

test("a lower-scored reviewer pick is kept as a labelled override, not discarded for score", () => {
  const p = bearFire();
  p.clues = [hint("CAMP", 2, 2, 2), hint("SMOKEY", 2, 1, 1)];
  const r = reconcile([p], {}, "2026-10-18");
  assert.equal(r.entries.p_bear__fire?.canonical, "SMOKEY");
  assert.equal(r.entries.p_bear__fire.evidence.numericalTie, false);
});

test("idempotent: once recorded, re-running adds nothing", () => {
  const pairs = [bearFire(), batCastle()];
  const first = reconcile(pairs, {}, "2026-10-18");
  const second = reconcile(pairs, first.entries, "2026-10-18");
  assert.deepEqual(Object.keys(second.entries), []);
  assert.equal(second.kept.length, 2);
});
