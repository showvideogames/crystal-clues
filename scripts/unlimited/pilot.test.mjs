// Automated tests for the Unlimited clue pilot.
//
//   node --test scripts/unlimited/pilot.test.mjs
//
// Uses the built-in node:test runner, so nothing needs installing.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collidesWithOwnTargets,
  collidesWithOtherBoardWord,
  validatePuzzleClueSelection,
  clueTextFrequency,
} from "./puzzle-clue-rules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "data", "unlimited");
const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const wordsDoc = read("pilot-words-20.json");
const dataset = read("pilot-pair-clues-20.json");
const schema = read("pair-clue-schema.json");

const words = wordsDoc.words;
const pairs = dataset.pairs;
const N = words.length;
const ALLOWED_TYPES = schema.definitions.connectionType.enum;

// The same derivation the build script uses, restated here so the tests are
// an independent check rather than a re-run of the generator.
const pairIdFor = (idA, idB) => {
  const [x, y] = [idA, idB].sort();
  return `p_${x.replace(/^w_/, "")}__${y.replace(/^w_/, "")}`;
};

test("exactly 20 unique pilot words", () => {
  assert.equal(N, 20);
  assert.equal(new Set(words.map((w) => w.id)).size, 20);
  assert.equal(new Set(words.map((w) => w.display)).size, 20);
});

test("word ids are deterministic from the normalized spelling", () => {
  for (const w of words) {
    assert.equal(w.id, `w_${w.normalized}`, `${w.display} has a non-deterministic id`);
    assert.equal(w.normalized, w.display.toLowerCase());
  }
});

test("every pilot word carries a selection reason", () => {
  for (const w of words) assert.ok(w.reason.trim().length >= 10, `${w.display} has no reason`);
});

test("exactly 190 pair records", () => {
  assert.equal(pairs.length, (N * (N - 1)) / 2);
  assert.equal(pairs.length, 190);
});

test("every possible pair appears exactly once", () => {
  const seen = new Set(pairs.map((p) => p.pair_id));
  assert.equal(seen.size, pairs.length, "duplicate pair ids present");
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const id = pairIdFor(words[i].id, words[j].id);
      assert.ok(seen.has(id), `missing pair ${id}`);
    }
});

test("no self-pairs", () => {
  for (const p of pairs) assert.notEqual(p.a.id, p.b.id, `${p.pair_id} pairs a word with itself`);
});

test("pair order cannot create duplicates", () => {
  // Every record is stored in canonical order, and the id derived from the
  // reversed order is identical, so A+B and B+A can never both exist.
  const seen = new Set();
  for (const p of pairs) {
    assert.ok(p.a.id < p.b.id, `${p.pair_id} is not in canonical order`);
    assert.equal(pairIdFor(p.a.id, p.b.id), p.pair_id);
    assert.equal(pairIdFor(p.b.id, p.a.id), p.pair_id, "reversing the pair changes its id");
    const unordered = [p.a.id, p.b.id].sort().join("|");
    assert.ok(!seen.has(unordered), `${p.pair_id} duplicates an existing combination`);
    seen.add(unordered);
  }
});

test("every word appears in exactly 19 pair records", () => {
  const count = new Map(words.map((w) => [w.id, 0]));
  for (const p of pairs) {
    count.set(p.a.id, count.get(p.a.id) + 1);
    count.set(p.b.id, count.get(p.b.id) + 1);
  }
  for (const [id, c] of count) assert.equal(c, N - 1, `${id} appears in ${c} pairs`);
});

test("pair ids are deterministic", () => {
  for (const p of pairs) assert.equal(p.pair_id, pairIdFor(p.a.id, p.b.id));
});

test("display spellings match the word list", () => {
  const byId = new Map(words.map((w) => [w.id, w.display]));
  for (const p of pairs) {
    assert.equal(p.a.display, byId.get(p.a.id));
    assert.equal(p.b.display, byId.get(p.b.id));
  }
});

test("every pair has between 2 and 5 clues", () => {
  for (const p of pairs) {
    assert.ok(p.clues.length >= 2, `${p.pair_id} has only ${p.clues.length} clues`);
    assert.ok(p.clues.length <= 5, `${p.pair_id} has ${p.clues.length} clues`);
  }
});

test("clue ranks are sequential and unique within each pair", () => {
  for (const p of pairs) {
    const ranks = p.clues.map((c) => c.rank);
    assert.deepEqual(ranks, p.clues.map((_, i) => i + 1), `${p.pair_id} has bad ranks`);
    assert.equal(new Set(ranks).size, ranks.length);
  }
});

test("no duplicate clue text within a pair", () => {
  for (const p of pairs) {
    const texts = p.clues.map((c) => c.text);
    assert.equal(new Set(texts).size, texts.length, `${p.pair_id} repeats a clue`);
  }
});

test("no empty clues and no empty explanations", () => {
  for (const p of pairs)
    for (const c of p.clues) {
      assert.ok(c.text && c.text.trim().length > 0, `${p.pair_id} rank ${c.rank} has empty text`);
      assert.ok(c.explanation && c.explanation.trim().length > 0, `${p.pair_id} rank ${c.rank} has no explanation`);
    }
});

test("every clue has an allowed connection type", () => {
  for (const p of pairs)
    for (const c of p.clues)
      assert.ok(ALLOWED_TYPES.includes(c.type), `${p.pair_id} rank ${c.rank} has type "${c.type}"`);
});

test("a clue is never simply one of the two target words", () => {
  for (const p of pairs)
    for (const c of p.clues) {
      assert.notEqual(c.text, p.a.display, `${p.pair_id} clue repeats ${p.a.display}`);
      assert.notEqual(c.text, p.b.display, `${p.pair_id} clue repeats ${p.b.display}`);
    }
});

test("clue text is one or two uppercase words", () => {
  for (const p of pairs)
    for (const c of p.clues)
      assert.match(
        c.text,
        /^[A-Z]+(?: [A-Z]+)?$/,
        `${p.pair_id} rank ${c.rank} ("${c.text}") is not one or two uppercase words`
      );
});

test("clue text is never longer than 18 characters", () => {
  for (const p of pairs)
    for (const c of p.clues)
      assert.ok(
        c.text.length <= 18,
        `${p.pair_id} rank ${c.rank} ("${c.text}") is ${c.text.length} characters`
      );
});

test("a clue MAY be another word from the pool, as long as it is not its own target", () => {
  // Deliberately permissive. HONEY + SHADOW -> MOON is valid because of honeymoon and moon
  // shadow; MOON turning up as a visible card elsewhere in the puzzle is useful deduction or
  // misdirection, not a fault. Only the clue's own two targets are banned.
  const board = new Set(words.map((w) => w.display));
  for (const p of pairs)
    for (const c of p.clues)
      if (board.has(c.text)) {
        assert.notEqual(c.text, p.a.display, `${p.pair_id} clue repeats its own target ${p.a.display}`);
        assert.notEqual(c.text, p.b.display, `${p.pair_id} clue repeats its own target ${p.b.display}`);
      }
});

test("clue text may repeat across pair records, with no global ceiling", () => {
  const freq = clueTextFrequency(pairs);
  assert.ok(Math.max(...freq.values()) > 1, "the data should contain at least one reused clue");
  // No upper bound is asserted on purpose. Reuse is resolved per puzzle at selection time,
  // never by deleting a clue from the master data.
});

test("a clue is rejected only when it equals one of its own two targets", () => {
  assert.equal(collidesWithOwnTargets("MOON", "HONEY", "SHADOW"), false);
  assert.equal(collidesWithOwnTargets("MOON", "HONEY", "MOON"), true);
  assert.equal(collidesWithOwnTargets("MOON", "MOON", "SHADOW"), true);
  assert.equal(collidesWithOtherBoardWord(), false);
});

test("within one puzzle, selected clue text must be unique across clue positions", () => {
  const ok = validatePuzzleClueSelection([
    { position: 1, text: "MOON", wordA: "HONEY", wordB: "SHADOW" },
    { position: 2, text: "TRAP", wordA: "GHOST", wordB: "HONEY" },
    { position: 3, text: "BOLT", wordA: "HORSE", wordB: "KEY" },
  ]);
  assert.ok(ok.ok, ok.errors.join("; "));

  const dupe = validatePuzzleClueSelection([
    { position: 1, text: "WATER", wordA: "BANK", wordB: "MIRROR" },
    { position: 2, text: "WATER", wordA: "BRIDGE", wordB: "MIRROR" },
  ]);
  assert.equal(dupe.ok, false);
  assert.match(dupe.errors[0], /unique across every clue position/);

  const ownTarget = validatePuzzleClueSelection([
    { position: 1, text: "MOON", wordA: "MOON", wordB: "SHADOW" },
  ]);
  assert.equal(ownTarget.ok, false);
  assert.match(ownTarget.errors[0], /its own two target words/);

  // A selected clue matching a DIFFERENT visible card word is explicitly allowed.
  const shadowsACard = validatePuzzleClueSelection([
    { position: 1, text: "MOON", wordA: "HONEY", wordB: "SHADOW" },
    { position: 2, text: "SHADE", wordA: "MOON", wordB: "ROSE" },
  ]);
  assert.ok(shadowsACard.ok, shadowsACard.errors.join("; "));
});

// --- player-facing postgame explanation data -------------------------------
// These back the future "Why these clues worked" section. They are checked here so the data
// is ready before any screen exists to show it.

test("every clue has a non-empty wordAConnection, wordBConnection and revealExplanation", () => {
  for (const p of pairs)
    for (const c of p.clues) {
      assert.ok(c.wordAConnection?.trim(), `${p.pair_id} ${c.text} has no wordAConnection`);
      assert.ok(c.wordBConnection?.trim(), `${p.pair_id} ${c.text} has no wordBConnection`);
      assert.ok(c.revealExplanation?.trim(), `${p.pair_id} ${c.text} has no revealExplanation`);
    }
});

test("the two side connections are never identical to each other", () => {
  for (const p of pairs)
    for (const c of p.clues)
      assert.notEqual(
        c.wordAConnection.trim().toLowerCase(),
        c.wordBConnection.trim().toLowerCase(),
        `${p.pair_id} ${c.text} explains both sides with the same sentence`
      );
});

test("no explanation is circular - the clue text alone is never the explanation", () => {
  const bare = (s) => s.replace(/[^a-z ]/gi, "").trim().toLowerCase();
  for (const p of pairs)
    for (const c of p.clues)
      for (const f of ["wordAConnection", "wordBConnection", "revealExplanation"])
        assert.notEqual(bare(c[f]), c.text.toLowerCase(), `${p.pair_id} ${c.text}: ${f} is circular`);
});

test("side connections are attached to the canonical wordA / wordB ordering", () => {
  // A straight swap is the failure that matters: each side naming only the OTHER target.
  const names = (s, w) => new RegExp(`\\b${w}`, "i").test(s);
  for (const p of pairs)
    for (const c of p.clues) {
      const swapped =
        names(c.wordAConnection, p.b.display) && !names(c.wordAConnection, p.a.display) &&
        names(c.wordBConnection, p.a.display) && !names(c.wordBConnection, p.b.display);
      assert.ok(!swapped, `${p.pair_id} ${c.text}: the two side connections look swapped`);
    }
});

test("reference metadata is valid wherever it is present", () => {
  const types = schema.definitions.reference.properties.referenceType.enum;
  const recog = schema.definitions.reference.properties.recognizability.enum;
  let seen = 0;
  for (const p of pairs)
    for (const c of p.clues) {
      if (!c.reference) continue;
      seen++;
      assert.ok(types.includes(c.reference.referenceType), `${p.pair_id} ${c.text}: bad referenceType`);
      assert.ok(recog.includes(c.reference.recognizability), `${p.pair_id} ${c.text}: bad recognizability`);
      if ("source" in c.reference)
        assert.ok(c.reference.source.trim().length > 1, `${p.pair_id} ${c.text}: empty reference source`);
    }
  assert.ok(seen > 0, "references are a core generation method; the set should contain some");
});

test("a puzzle snapshot carries everything the reveal screen needs", () => {
  // The shape a generated puzzle must store per selected clue, so an old completed puzzle
  // still explains itself after the master data changes.
  const p = pairs[0];
  const c = p.clues[0];
  const snapshot = {
    clueId: `${p.pair_id}#${c.rank}`,
    text: c.text,
    wordA: p.a.display,
    wordB: p.b.display,
    wordAConnection: c.wordAConnection,
    wordBConnection: c.wordBConnection,
    revealExplanation: c.revealExplanation,
    reference: c.reference ?? null,
  };
  for (const k of ["clueId", "text", "wordA", "wordB", "wordAConnection", "wordBConnection", "revealExplanation"])
    assert.ok(snapshot[k], `snapshot is missing ${k}`);
  assert.ok("reference" in snapshot, "snapshot must carry reference metadata, even as null");
});

test("every clue carries a non-empty connection type and explanation", () => {
  for (const p of pairs)
    for (const c of p.clues) {
      assert.ok(c.type && c.type.trim().length > 0, `${p.pair_id} rank ${c.rank} has no type`);
      assert.ok(
        c.explanation && c.explanation.trim().length > 0,
        `${p.pair_id} rank ${c.rank} has no explanation`
      );
    }
});

// --- the quality audit -----------------------------------------------------
// These tests cannot show that a clue is good. They show that the audit was
// complete and that nothing it rejected was quietly left in place.
const audit = read("pilot-clue-quality-audit.json");
const beforeRepair = read("pilot-pair-clues-20-before-quality-repair.json");

test("the audit covers every clue in the pre-repair dataset, and nothing else", () => {
  const audited = new Set(audit.clues.map((c) => `${c.pair_id}|${c.rank}|${c.text}`));
  let n = 0;
  for (const p of beforeRepair.pairs)
    for (const c of p.clues) {
      assert.ok(
        audited.has(`${p.pair_id}|${c.rank}|${c.text}`),
        `${p.pair_id} rank ${c.rank} was never audited`
      );
      n++;
    }
  assert.equal(audit.clues.length, n, "the audit holds entries that are not in the pre-repair dataset");
});

test("every audited clue carries scores, a verdict and a criticism", () => {
  for (const c of audit.clues) {
    assert.ok(["pass", "fail"].includes(c.verdict), `${c.pair_id} ${c.text} has no verdict`);
    assert.ok(c.criticism && c.criticism.trim().length >= 20, `${c.pair_id} ${c.text} has no real criticism`);
    for (const k of [
      "connection_to_a",
      "connection_to_b",
      "player_fairness",
      "recognizability",
      "satisfaction_elegance",
      "explanation_dependence_penalty",
      "excessive_obscurity_penalty",
    ])
      assert.ok(Number.isInteger(c.scores[k]) && c.scores[k] >= 0 && c.scores[k] <= 2, `${c.pair_id} ${c.text}: bad ${k}`);
  }
});

test("no clue the audit rejected survived unchanged", () => {
  const rejected = new Map();
  for (const c of audit.clues)
    if (c.verdict === "fail") rejected.set(`${c.pair_id}|${c.text}`, c.original_explanation);
  for (const p of pairs)
    for (const c of p.clues) {
      const key = `${p.pair_id}|${c.text}`;
      if (!rejected.has(key)) continue;
      assert.notEqual(
        c.explanation,
        rejected.get(key),
        `${p.pair_id} still carries "${c.text}" exactly as the audit rejected it`
      );
    }
});

test("metadata agrees with the data", () => {
  assert.equal(dataset._metadata.word_count, N);
  assert.equal(dataset._metadata.pair_count, pairs.length);
  assert.equal(dataset._metadata.expected_pair_count, 190);
  assert.equal(
    dataset._metadata.total_clues,
    pairs.reduce((s, p) => s + p.clues.length, 0)
  );
});

test("the pair count formula matches the brief's worked examples", () => {
  const f = (n) => (n * (n - 1)) / 2;
  assert.equal(f(20), 190);
  assert.equal(f(50), 1225);
  assert.equal(f(100), 4950);
  assert.equal(f(200), 19900);
});
