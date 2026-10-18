#!/usr/bin/env node
// Generates N random boards from src/unlimited/random-library.json with fixed
// seeds and runs the full fixed-board checker (check-boards.mjs) over them:
// server rules, one-word distinct clues, 28 distinct words, the reveal matches
// the words facing each clue, bestSubmit at all four rotations, a turned card /
// extra card / swapped pair refused, the deal never starts solved at any
// difficulty, and the lives/lock state transitions.
//   node scripts/unlimited/check-random.mjs [count=500] [firstSeed=1] [out.json]
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { generateBoard, validateBoard } from "../../src/unlimited/generate.js";

const N = Number(process.argv[2] || 500);
const S0 = Number(process.argv[3] || 1);
const OUT = process.argv[4] || join(mkdtempSync(join(tmpdir(), "cv-random-")), "boards.json");
const lib = JSON.parse(readFileSync("src/unlimited/random-library.json", "utf8"));
const boards = [];
for (let i = 0; i < N; i++) {
  const seed = (S0 + i * 2654435761) >>> 0;
  const b = generateBoard(lib, { seed, createdAt: "2026-10-18T18:00:00.000Z" });
  if (!b) throw new Error(`seed ${seed}: no board`);
  const errs = validateBoard(b, lib);
  if (errs.length) throw new Error(`seed ${seed}: ${errs.join("; ")}`);
  boards.push({ ...b, index: i + 1 });
}
writeFileSync(OUT, JSON.stringify({ _metadata: { generated: N, firstSeed: S0, library: lib._metadata.contentHash }, boards }) + "\n");
const res = execFileSync(process.execPath, ["scripts/unlimited/check-boards.mjs", OUT], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const summary = res.trim().split("\n").slice(-1)[0];
console.log(`${N} generated boards (seeds from ${S0}) -> ${OUT}\n${summary}`);
