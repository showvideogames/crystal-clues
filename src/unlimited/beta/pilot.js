// Random-Pair Pilot Beta: the pure parts (no JSON imports, no storage), shared
// by the build script (scripts/unlimited/build-pilot-beta.mjs), the screen
// (PilotBetaView.jsx) and the tests.
//
// The pilot library has the same shape as random-library.json, but holds only
// the pilot pairs (one served hint each, rule "provisional"); its word bank is
// the complete bank from random-library.json, used for the 20 filler words.
//
// The boards are FINITE and fixed at build time: the existing generator
// (generate.js: choosePairs + generateBoard, unchanged) is called again and
// again with a fixed recorded seed. Every call may use only pairs that no
// earlier board used (they are passed as `avoid` AND removed from the pairs it
// may draw from, so neither the generator's "recent pairs allowed" pass nor its
// exhaustive fallback can reuse one). When even the exhaustive search cannot
// make a board from the pairs left, building stops. So each pilot pair is on
// at most one board, and the few left over are listed in the metadata.
// Boards are not curated or filtered by hint difficulty.
import { generateBoard, validateBoard, mulberry32, norm, GENERATOR_VERSION } from "../generate.js";

export const PILOT_BUILDER_VERSION = 1;
export const DEFAULT_PILOT_SEED = 20261026;
// Fixed so the same input and seed always give byte-identical boards.
export const PILOT_CREATED_AT = "2026-10-26T00:00:00.000Z";

/**
 * Turns the reviewed input rows into the pilot library body ({ words, pairs }).
 *   rows:  [{ pilot_id, pair_key, a, b, hint, wordAConnection, wordBConnection,
 *            alternatives:[{ text, wordAConnection, wordBConnection }], reference:boolean }]
 *   words: the complete word bank (random-library.json `words`)
 * Alternatives are never served: they only appear in the reveal text.
 * Throws on anything that would make an invalid board.
 */
export function pilotLibraryBody(rows, words) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("pilot input: expected a non-empty array of rows");
  const bank = new Set(words);
  const ids = new Set();
  const pairKeys = new Set();
  const errs = [];
  const pairs = rows.map((r, i) => {
    const id = String(r.pilot_id ?? r.pair_key ?? "").trim();
    const a = norm(r.a), b = norm(r.b), text = norm(r.hint);
    const at = `row ${i} (${id || "no id"})`;
    if (!id) errs.push(`${at}: missing pilot_id`);
    if (ids.has(id)) errs.push(`${at}: duplicate pilot_id`);
    ids.add(id);
    const key = [a, b].sort().join("|");
    if (pairKeys.has(key)) errs.push(`${at}: duplicate pair ${a}+${b}`);
    pairKeys.add(key);
    if (!bank.has(a)) errs.push(`${at}: ${a} is not in the word bank`);
    if (!bank.has(b)) errs.push(`${at}: ${b} is not in the word bank`);
    if (a === b) errs.push(`${at}: a and b are the same word`);
    if (!text) errs.push(`${at}: missing hint`);
    if (text === a || text === b) errs.push(`${at}: hint equals one of its words`);
    const alts = (Array.isArray(r.alternatives) ? r.alternatives : []).map((x) => norm(x?.text)).filter(Boolean);
    return {
      id, a, b, rule: "provisional",
      hints: [{
        text,
        status: "pilot",
        wordAConnection: String(r.wordAConnection ?? ""),
        wordBConnection: String(r.wordBConnection ?? ""),
        revealExplanation: alts.length ? `Alternative: ${alts.join(" / ")}` : "",
        reference: r.reference ? true : null,
      }],
    };
  });
  if (errs.length) throw new Error(`pilot input is invalid:\n  ${errs.join("\n  ")}`);
  return { words: [...words], pairs };
}

/**
 * The finite board list. `library` is the pilot library (with _metadata).
 * Returns { _metadata, boards } where boards[i] is a frozen generate.js board
 * with a pilot id ("pilot-001"…), its 1-based index and kind "pilot-beta".
 */
export function buildPilotBoards(library, { seed = DEFAULT_PILOT_SEED } = {}) {
  const master = mulberry32(seed);
  const used = new Set();
  const boards = [];
  for (;;) {
    const remaining = library.pairs.filter((p) => !used.has(p.id));
    const boardSeed = Math.floor(master() * 2 ** 32) >>> 0;
    const n = boards.length + 1;
    const b = generateBoard({ ...library, pairs: remaining }, { seed: boardSeed, avoid: new Set(used), createdAt: PILOT_CREATED_AT, idSuffix: `pilot${n}` });
    if (!b) break;
    const errs = validateBoard(b, library);
    if (errs.length) throw new Error(`pilot board ${n} is invalid: ${errs.join("; ")}`);
    const pairIds = b.reveal.map((r) => r.pairId);
    if (pairIds.some((id) => used.has(id))) throw new Error(`pilot board ${n} reuses a pair`);
    pairIds.forEach((id) => used.add(id));
    boards.push({ ...b, id: `pilot-${String(n).padStart(3, "0")}`, index: n, kind: "pilot-beta", title: `Pilot board ${n}`, status: "pilot-beta" });
  }
  const leftover = library.pairs.filter((p) => !used.has(p.id)).map((p) => ({ id: p.id, a: p.a, b: p.b, hint: p.hints[0]?.text || "" }));
  return {
    _metadata: {
      purpose: "Random-Pair Pilot Beta: a finite, fixed list of test boards (not normal Unlimited)",
      placeholder: !!library._metadata?.placeholder,
      seed: seed >>> 0,
      generatorVersion: GENERATOR_VERSION,
      builderVersion: PILOT_BUILDER_VERSION,
      createdAt: PILOT_CREATED_AT,
      pilotLibraryContentHash: library._metadata?.contentHash || null,
      pairCount: library.pairs.length,
      boardCount: boards.length,
      usedPairCount: used.size,
      leftoverPairCount: leftover.length,
      leftoverPairs: leftover,
    },
    boards,
  };
}
