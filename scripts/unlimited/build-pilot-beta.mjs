// Builds the Random-Pair Pilot Beta (src/unlimited/beta) from the reviewed pilot input:
//   src/unlimited/beta/pilot-library.json  the pilot pairs (random-library.json shape)
//   src/unlimited/beta/pilot-boards.json   the finite, fixed board list + metadata
//
// Usage (npm run pilot-beta:build -- [options]):
//   --input <path>      the reviewed input (default data/unlimited/pilot-random-250/beta-input.json;
//                       when that file is missing, the committed PLACEHOLDER input is used and the
//                       screen shows a red "PLACEHOLDER DATA" banner)
//   --seed <n>          the recorded board seed (default 20261026)
//   --placeholder       mark the output as placeholder data whatever the input
//   --make-placeholder  (re)write the placeholder input file and exit
//
// Input rows: { pilot_id, pair_key, a, b, hint, wordAConnection, wordBConnection,
//               alternatives:[{ text, wordAConnection, wordBConnection }], reference:boolean }
// The filler words come from the complete word bank in src/unlimited/random-library.json
// (read only; normal Unlimited's library and generator are never changed).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pilotLibraryBody, buildPilotBoards, DEFAULT_PILOT_SEED } from "../../src/unlimited/beta/pilot.js";
import { mulberry32, shuffle } from "../../src/unlimited/generate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BANK = resolve(ROOT, "src/unlimited/random-library.json");
const DEFAULT_INPUT = resolve(ROOT, "data/unlimited/pilot-random-250/beta-input.json");
const PLACEHOLDER_INPUT = resolve(ROOT, "data/unlimited/pilot-random-250/beta-input.placeholder.json");
const OUT_LIB = resolve(ROOT, "src/unlimited/beta/pilot-library.json");
const OUT_BOARDS = resolve(ROOT, "src/unlimited/beta/pilot-boards.json");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };

const bank = JSON.parse(readFileSync(BANK, "utf8")).words;

if (flag("--make-placeholder")) {
  // 42 fake-but-valid pairs from real bank words (some words shared between pairs,
  // so a few pairs are left over). Hints are obviously fake: TESTHINT01…
  const rng = mulberry32(4242);
  const pool = shuffle(bank.filter((w) => /^[A-Z]+$/.test(w)), rng).slice(0, 70);
  const rows = []; const seen = new Set();
  while (rows.length < 42) {
    const a = pool[Math.floor(rng() * pool.length)], b = pool[Math.floor(rng() * pool.length)];
    const key = [a, b].sort().join("|");
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    const n = String(rows.length + 1).padStart(2, "0");
    rows.push({ pilot_id: `placeholder_${n}`, pair_key: key, a, b, hint: `TESTHINT${n}`,
      wordAConnection: `PLACEHOLDER: fake link from ${a} to TESTHINT${n}.`, wordBConnection: `PLACEHOLDER: fake link from ${b} to TESTHINT${n}.`,
      alternatives: rows.length % 5 === 0 ? [{ text: `TESTALT${n}`, wordAConnection: "PLACEHOLDER", wordBConnection: "PLACEHOLDER" }] : [], reference: rows.length % 7 === 0 });
  }
  writeJson(PLACEHOLDER_INPUT, rows);
  console.log(`wrote ${rel(PLACEHOLDER_INPUT)}: ${rows.length} placeholder rows`);
  process.exit(0);
}

const given = opt("--input");
const input = given ? resolve(process.cwd(), given) : existsSync(DEFAULT_INPUT) ? DEFAULT_INPUT : PLACEHOLDER_INPUT;
if (!existsSync(input)) { console.error(`pilot input not found: ${input}`); process.exit(1); }
const placeholder = flag("--placeholder") || input === PLACEHOLDER_INPUT;
if (!given && input === PLACEHOLDER_INPUT) console.warn(`WARNING: ${rel(DEFAULT_INPUT)} not found; building from PLACEHOLDER input`);
const seedArg = opt("--seed");
const seed = seedArg === undefined ? DEFAULT_PILOT_SEED : Number(seedArg);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) { console.error(`--seed must be a 32-bit unsigned integer`); process.exit(1); }

const rawInput = readFileSync(input, "utf8");
const body = pilotLibraryBody(JSON.parse(rawInput), bank);
const contentHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
const library = {
  _metadata: {
    purpose: "Random-Pair Pilot Beta library: pilot pairs only (never normal Unlimited's library)",
    placeholder,
    source: input.startsWith(ROOT) ? rel(input) : input.replace(/\\/g, "/"),
    inputSha256: createHash("sha256").update(rawInput).digest("hex"),
    wordBank: "src/unlimited/random-library.json words (complete bank, fillers only)",
    contentHash,
    pairCount: body.pairs.length,
  },
  ...body,
};
const out = buildPilotBoards(library, { seed });
writeJson(OUT_LIB, library);
writeJson(OUT_BOARDS, out);
const m = out._metadata;
console.log(`${rel(OUT_LIB)}: ${m.pairCount} pairs, content sha256 ${contentHash.slice(0, 16)}…${placeholder ? " (PLACEHOLDER)" : ""}`);
console.log(`${rel(OUT_BOARDS)}: ${m.boardCount} boards from seed ${m.seed} (generator v${m.generatorVersion}), ${m.usedPairCount} pairs used, ${m.leftoverPairCount} left over${m.leftoverPairCount ? `: ${m.leftoverPairs.map((p) => p.id).join(", ")}` : ""}`);
