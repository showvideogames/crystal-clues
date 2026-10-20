// node --test scripts/unlimited/coverage.test.mjs
// Pair evidence vs current state vs attempt decisions (catalogue-lib coverage functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildIndex, loadCatalogue, stats, pairAttempts, pairEvidence, coverageSummary, listHolds, deciderOf, adviseKind, currentState, PLAYABLE } from "./catalogue-lib.mjs";
import { loadRejections, rejectionFor } from "./rejections-lib.mjs";

const CLI = resolve("scripts/unlimited/catalogue.mjs");
const rev = (verdict, extra = {}) => ({ blindReview: { verdict, a: 2, b: 2, fairness: 2, ...extra } });
const WORDS = ["ANT", "BEE", "CAT", "DOG", "EEL", "FOX"];
const own = (pair_id, hint, decision, by = "owner") => ({ a: pair_id.split("__")[0].slice(2).toUpperCase(), b: pair_id.split("__")[1].toUpperCase(), pair_id, hint, decision, by, date: "2026-10-19", reason: "x" });

test("rejection-only pairs count as seen and decided, never untried or generated, and stay open", () => {
  const rejections = [own("p_cat__dog", "PET", "rejected"), { ...own("p_cat__dog", "BARK", "held", "parent fact check (not an owner rejection)"), a: "DOG", b: "CAT" }];
  const ix = buildIndex({ words: WORDS, pairs: [] });
  const s = coverageSummary(ix, rejections);
  assert.equal(s.possiblePairs, 15);
  assert.equal(s.evidence.unseen, 14); assert.equal(s.evidence["reviewed-or-decided"], 1); assert.equal(s.evidence.generatedByARecordedBatch, 0);
  assert.deepEqual(s.rejectionOnlyPairs, { inBank: 1, outsideBank: 0, entries: 2 });
  assert.equal(s.current.noLibraryRecord, 15, "no library record, but not untried");
  assert.equal(s.seenButNotServed.open, 1);
  const info = pairAttempts(ix, "dog", "cat", { rejections });
  assert.equal(info.evidence, "reviewed-or-decided"); assert.equal(info.rejectionOnly, true); assert.equal(info.generated, false);
  assert.equal(info.state, "none"); assert.equal(info.open, true);
  assert.deepEqual(info.attempts.map((t) => [t.text, t.status, t.decision.decider, t.inLibrary]), [["PET", "rejected", "owner", false], ["BARK", "held", "coordinator", false]]);
});

test("mixed sources are deduplicated by pair id (either word order) and hint text", () => {
  const p = { pair_id: "p_ant__bee", a: "ANT", b: "BEE", clues: [{ text: "HILL", status: "rejected", heldReason: "owner rejection: x", override: { by: "owner", status: "rejected", via: "rejections.json", reason: "x" }, provenance: { source: "u04", ...rev("BORDERLINE") } }] };
  const rejections = [{ ...own("p_ant__bee", "hill", "rejected"), a: "BEE", b: "ANT" }, own("p_ant__bee", "COLONY", "rejected")];
  const info = pairAttempts(buildIndex({ words: WORDS, pairs: [p] }), "bee", "ant", { rejections });
  assert.equal(info.id, "p_ant__bee");
  assert.deepEqual(info.attempts.map((t) => [t.text, t.inLibrary, t.recorded.length]), [["HILL", true, 1], ["COLONY", false, 1]]);
  assert.equal(info.generated, true, "u04 is a recorded generation batch");
});

test("candidate-only evidence is not reviewed; a pending candidate is not a decision", () => {
  const p = { pair_id: "p_cat__eel", a: "CAT", b: "EEL", clues: [{ text: "SLINK", status: "candidate", heldReason: "discovery: awaiting review or owner approval", provenance: { source: "friend-play", addedBy: "friend", via: "catalogue add", blindReview: null } }] };
  const ix = buildIndex({ words: WORDS, pairs: [p] });
  assert.deepEqual(pairEvidence(p, []), { evidence: "candidate-only", generated: false, rejectionOnly: false });
  const info = pairAttempts(ix, "cat", "eel");
  assert.equal(info.state, "not-playable"); assert.equal(info.attempts[0].decision.decider, "pending");
  assert.equal(coverageSummary(ix).evidence["candidate-only"], 1);
});

test("one hint rejected and another served: the pair is served and stays open", () => {
  const p = { pair_id: "p_dog__fox", a: "DOG", b: "FOX", clues: [
    { text: "HOUND", status: "rejected", override: { by: "owner", status: "rejected", via: "rejections.json", reason: "no" }, provenance: { source: "u10", ...rev("PASS") } },
    { text: "CANINE", status: "ai_reviewed", provenance: { source: "u10", ...rev("PASS") } }] };
  const ix = buildIndex({ words: WORDS, pairs: [p] });
  const info = pairAttempts(ix, "dog", "fox", { rejections: [own("p_dog__fox", "HOUND", "rejected")] });
  assert.equal(info.state, "served"); assert.deepEqual(info.served, ["CANINE"]); assert.equal(info.open, true);
  assert.equal(info.attempts.find((t) => t.text === "HOUND").advisory, "owner-decision");
  assert.equal(info.attempts.find((t) => t.text === "CANINE").advisory, null);
  // an explicit pair restriction is the only thing that closes a pair
  const held = buildIndex({ words: WORDS, pairs: [{ ...p, generationHold: { by: "coordinator", reason: "pair hold" } }] });
  const h = pairAttempts(held, "dog", "fox");
  assert.equal(h.open, false); assert.equal(h.state, "playable-unserved");
});

test("superseded decisions are inactive and kept as history; owner is read from provenance, not the file", () => {
  const sup = { pair_id: "p_bee__fox", text: "STING", status: "coordinator_accept", by: "coordinator (x)", date: "2026-10-19", reason: "ok", superseded: { by: "owner", date: "2026-10-19" } };
  const p = { pair_id: "p_bee__fox", a: "BEE", b: "FOX", clues: [{ text: "STING", status: "held", override: { by: "owner", status: "held", via: "rejections.json", reason: "flagged", history: [{ ...sup }] }, provenance: { source: "x06", ...rev("BORDERLINE") } }] };
  const info = pairAttempts(buildIndex({ words: WORDS, pairs: [p] }), "bee", "fox", { overrides: [sup] });
  const t = info.attempts[0];
  assert.equal(t.decision.decider, "owner"); assert.equal(t.status, "held");
  assert.equal(t.history.length, 1, "the superseded acceptance is kept once, not applied"); assert.equal(t.history[0].status, "coordinator_accept");
  assert.equal(deciderOf("owner (x04 supplement)"), "owner");
  assert.equal(deciderOf("x04 coordinator brief (consistency with the owner MEMPHIS rejection; not a separate owner decision)"), "coordinator");
  assert.equal(deciderOf("parent fact check of an owner candidate (2026-10-19; not an owner rejection)"), "coordinator");
  assert.equal(deciderOf("main session (claude-opus-5-5): strict editorial bar"), "main-session");
});

test("advisory kinds are triage only: playable hints get none, nothing is promoted", () => {
  assert.equal(adviseKind({ status: "ai_reviewed", decider: "reviewer", reason: "inaccurate" }), null);
  assert.equal(adviseKind({ status: "held", decider: "reviewer", flags: ["wrong_fact"] }), "factual");
  assert.equal(adviseKind({ status: "held", decider: "reviewer", reason: "two-word phrase run together" }), "rule");
  assert.equal(adviseKind({ status: "held", decider: "reviewer", reason: "BEAR only via a weak inference" }), "unsupported");
  assert.equal(adviseKind({ status: "held", decider: "reviewer", reason: "a niche reference" }), "familiarity-or-difficulty");
  assert.equal(adviseKind({ status: "held", decider: "owner", reason: "inaccurate" }), "owner-decision");
  assert.equal(adviseKind({ status: "held", decider: "reviewer", reason: "" }), "unclassified");
  const ix = loadCatalogue();
  const before = JSON.stringify(ix.pairs.map((p) => p.clues.map((c) => c.status)));
  const rows = listHolds(ix, { rejections: loadRejections() });
  assert.ok(rows.length > 0 && rows.every((r) => !PLAYABLE.has(r.status)));
  assert.equal(JSON.stringify(ix.pairs.map((p) => p.clues.map((c) => c.status))), before);
});

test("the real data: rejection-only pairs reconcile (16 at the coverage commit, 17 with BIRD + SHIP → FALCON), served matches the export, owner rejections stay exact", () => {
  const ix = loadCatalogue(); const rejections = loadRejections();
  const s = coverageSummary(ix, rejections); const st = stats(ix);
  const ids = new Set(ix.pairs.map((p) => p.pair_id));
  const only = new Set(rejections.filter((e) => !ids.has(e.pair_id)).map((e) => e.pair_id));
  assert.equal(only.size, 17);   // 16 + BIRD + SHIP, whose only record is the owner's FALCON hold
  assert.equal(s.rejectionOnlyPairs.inBank + s.rejectionOnlyPairs.outsideBank, 17);
  assert.equal(s.evidence.unseen, st.possiblePairs - st.storedInBank - s.rejectionOnlyPairs.inBank, "rejection-only pairs are not counted as untried");
  for (const id of only) {
    const e = rejections.find((x) => x.pair_id === id);
    const info = pairAttempts(ix, e.a, e.b, { rejections });
    assert.equal(info.evidence, "reviewed-or-decided", id); assert.equal(info.generated, false, id); assert.equal(info.open, true, id);
  }
  const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
  assert.equal(s.current.served, client.pairs.length);
  for (const p of client.pairs) assert.equal(currentState(ix, ix.byId.get(p.id)), "served", p.id);
  // exact owner-rejected hints are protected; other hints on the same pair are not blocked
  assert.equal(rejectionFor(rejections, "CAMOUFLAGE", "HOOK", "FLY")?.decision, "rejected");
  assert.equal(rejectionFor(rejections, "CAMOUFLAGE", "HOOK", "LURE"), null);
  const fly = pairAttempts(ix, "CAMOUFLAGE", "HOOK", { rejections });
  assert.equal(fly.state, "served"); assert.equal(fly.attempts.find((t) => t.text === "FLY")?.decision.decider, "owner");
  const sp = pairAttempts(ix, "SPEAKER", "SWORD", { rejections });
  assert.equal(sp.rejectionOnly, true); assert.equal(sp.attempts[0].decision.decider, "owner");
  // owner decisions come from provenance: this rejections.json entry is a coordinator's
  assert.equal(pairAttempts(ix, "ELVIS", "PYRAMID", { rejections }).attempts.find((t) => t.text === "MEMPHIS").decision.decider, "coordinator");
});

test("CLI: coverage, attempts and holds are read-only", () => {
  const lib = readFileSync("data/unlimited/library/pairs.json", "utf8");
  const cov = JSON.parse(execFileSync(process.execPath, [CLI, "coverage"], { encoding: "utf8" }));
  assert.ok(cov.evidence.unseen > 0);
  assert.match(execFileSync(process.execPath, [CLI, "attempts", "sword", "lake"], { encoding: "utf8" }), /EXCALIBUR\s+held · decided by owner[\s\S]*history: coordinator_accept/);
  const rows = JSON.parse(execFileSync(process.execPath, [CLI, "holds", "--by", "coordinator", "--json"], { encoding: "utf8" }));
  assert.ok(rows.length > 0 && rows.every((r) => r.decision.decider === "coordinator"));
  assert.equal(readFileSync("data/unlimited/library/pairs.json", "utf8"), lib);
});

test("owner holds from the owner's own words: TOY + POTATO → HEAD and SHIP + BIRD → FALCON, exact hints only", () => {
  const ix = loadCatalogue(); const rejections = loadRejections();
  for (const [x, y, h] of [["TOY", "POTATO", "HEAD"], ["SHIP", "BIRD", "FALCON"]]) {
    const e = rejectionFor(rejections, x, y, h);
    assert.equal(e?.decision, "held"); assert.equal(e.by, "owner"); assert.match(e.reason, /millennium falcon/);
    const info = pairAttempts(ix, x, y, { rejections });
    assert.equal(info.open, true); assert.equal(info.attempts.find((t) => t.text === h).decision.decider, "owner");
  }
  assert.equal(ix.byId.get("p_potato__toy").clues.find((c) => c.text === "HEAD").status, "held");
  assert.equal(rejectionFor(rejections, "BIRD", "FOOTBALL", "FALCON"), null, "the owner-approved football FALCON is untouched");
  assert.equal(currentState(ix, ix.byId.get("p_bird__football")), "served");
});

test("synonym audit: naming one sense of one target is not a blanket failure (RING, SOLO, DOODLE, BUG); structural rules unchanged", async () => {
  const { hintProblem } = await import("./catalogue-lib.mjs");
  const brief = readFileSync("data/unlimited/reviewer-brief-template.md", "utf8");
  const failLine = brief.split("\n").find((l) => l.startsWith("- FAIL:"));
  assert.doesNotMatch(failLine, /synonym/i, "the FAIL list no longer includes synonyms");
  assert.match(brief, /synonym of, or names one sense of, ONE target is NOT an automatic failure/);
  for (const h of ["RING", "SOLO", "DOODLE", "BUG"]) assert.match(brief, new RegExp(`-> ${h}\\b`), `${h} is a worked example`);
  const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
  for (const [id, h] of [["p_band__wedding", "RING"], ["p_pilot__solitary", "SOLO"], ["p_dog__drawing", "DOODLE"], ["p_computer__insect", "BUG"]])
    assert.ok(client.pairs.find((p) => p.id === id)?.hints.some((x) => x.text === h), `${id} serves ${h}`);
  assert.notEqual(adviseKind({ status: "held", decider: "reviewer", flags: ["synonym_of_target"] }), "rule");
  // structural rules unchanged: equal, containing, contained in a target
  assert.match(hintProblem("BAND", "BAND", "RING"), /is a target/);
  assert.match(hintProblem("BANDS", "BAND", "RING"), /contains a target/);
  assert.match(hintProblem("RIN", "BAND", "RING"), /target contains the hint/);
  assert.equal(hintProblem("RING", "BAND", "WEDDING"), null);
});

test("British-only audit: regional words are a familiarity note, not an automatic fail or a rule", () => {
  const brief = readFileSync("data/unlimited/reviewer-brief-template.md", "utf8");
  assert.doesNotMatch(brief, /fail niche fandom, British-only usage/);
  assert.match(brief, /British or regional word is not an automatic fail/);
  assert.notEqual(adviseKind({ status: "held", decider: "reviewer", flags: ["british_only"], reason: "British usage" }), "rule");
  const client = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
  for (const [id, h] of [["p_italy__trunk", "BOOT"], ["p_cream__tennis", "WIMBLEDON"], ["p_jam__pickle", "TROUBLE"]]) assert.ok(client.pairs.find((p) => p.id === id)?.hints.some((x) => x.text === h), `${id} ${h}`);
});
