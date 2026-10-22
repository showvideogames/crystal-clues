// Pairs reserved for coordinator review and never offered to drafters: the assistant-prepared,
// proposal-only animal x SHIP family from x11 (data/unlimited/expansion/x11-owner-proposals.json,
// shipFamilyProposal). The parent decides on them; batches must not store them on their own.
import { readFileSync, existsSync } from "node:fs";
import { pairOf } from "./catalogue-lib.mjs";
const F = "data/unlimited/expansion/x11-owner-proposals.json";
// Reservations the parent has resolved (each by a recorded coordinator decision in overrides.json).
const RESOLVED = new Set([
  "p_crow__ship", // CROW + SHIP -> NEST approved by the parent's source audit, 2026-10-20
]);
export function reservedPairIds() {
  if (!existsSync(F)) return new Set();
  const s = JSON.parse(readFileSync(F, "utf8")).shipFamilyProposal || {};
  const ids = new Set();
  for (const e of [...(s.noahPairs || []), ...(s.betterSpecificHints || [])]) { const [x, y] = e.pair.split(" + "); const id = pairOf(x, y).id; if (!RESOLVED.has(id)) ids.add(id); }
  return ids;
}
