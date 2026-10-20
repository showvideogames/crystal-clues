// Pairs reserved for coordinator review and never offered to drafters: the assistant-prepared,
// proposal-only animal x SHIP family from x11 (data/unlimited/expansion/x11-owner-proposals.json,
// shipFamilyProposal). The parent decides on them; batches must not store them on their own.
import { readFileSync, existsSync } from "node:fs";
import { pairOf } from "./catalogue-lib.mjs";
const F = "data/unlimited/expansion/x11-owner-proposals.json";
export function reservedPairIds() {
  if (!existsSync(F)) return new Set();
  const s = JSON.parse(readFileSync(F, "utf8")).shipFamilyProposal || {};
  const ids = new Set();
  for (const e of [...(s.noahPairs || []), ...(s.betterSpecificHints || [])]) { const [x, y] = e.pair.split(" + "); ids.add(pairOf(x, y).id); }
  return ids;
}
