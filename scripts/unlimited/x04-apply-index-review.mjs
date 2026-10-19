#!/usr/bin/env node
// Applies the independent index check (data/unlimited/related/index-review-x04.json)
// to the x04 checkpoint routes. Run after x04-build-routes.mjs (which rebuilds the
// x04 entries from scratch), so the result is reproducible:
//   node scripts/unlimited/x04-build-routes.mjs && node scripts/unlimited/x04-apply-index-review.mjs
// - missing words: added to their route (NEW meanings become new routes);
// - wrong/weak entries: the decisions below (each mirrors the reviewer's fix);
// - group notes for CROW / CAPTAIN and the nautical additions.
// Every added or changed word carries addedBy / fixedBy "x04-index-reviewer".
import { readFileSync, writeFileSync } from "node:fs";

const R = "data/unlimited/related/hint-routes.json", G = "data/unlimited/related/groups.json";
const review = JSON.parse(readFileSync("data/unlimited/related/index-review-x04.json", "utf8"));
const routes = JSON.parse(readFileSync(R, "utf8"));
const by = "x04-index-reviewer";
const hint = (h) => routes.hints.find((x) => x.checkpoint === "x04" && x.hint === h);
const word = (h, w) => { for (const r of hint(h).routes) { const m = r.words.find((x) => x.word === w); if (m) return { r, m }; } return null; };
let added = 0, newRoutes = 0;
for (const h of review.hints) {
  const H = hint(h.hint); if (!H) continue;
  for (const m of h.missing || []) {
    if (word(h.hint, m.word)) continue;
    let r = String(m.route).startsWith("NEW") ? null : H.routes.find((x) => x.id === m.route);
    if (!r) {
      const label = String(m.route).replace(/^NEW:\s*/, "");
      r = H.routes.find((x) => x.label === label);
      if (!r) { r = { id: label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""), label, words: [], addedBy: by }; H.routes.push(r); newRoutes++; }
    }
    r.words.push({ word: m.word, strength: m.strength, clause: m.clause, addedBy: by }); added++;
  }
}
const fix = (h, w, change) => { const f = word(h, w); if (!f) { console.warn(`not found: ${h} ${w}`); return; } if (change === "remove") f.r.words = f.r.words.filter((x) => x !== f.m); else Object.assign(f.m, change, { fixedBy: by }); };
fix("SEAGULL", "CRANE", "remove");
fix("SLAM", "TENNIS", { clause: "tennis's four biggest tournaments are the Grand Slams" });
fix("PICK", "APPLE", { strength: 2 });
fix("DECK", "PATIO", { clause: "a deck and a patio are both backyard spots to sit outside" });
fix("JAM", "GRAPE", { clause: "grape jam and jelly fill the classic PB&J" });
fix("BARK", "WOOD", { clause: "bark wraps around the wood of a tree" });
fix("PITCH", "SOCCER", { strength: 1 });
fix("PITCH", "NIGHT", { clause: "a moonless night can be pitch black" });
fix("RING", "PLANET", { clause: "some planets, like Saturn, are circled by rings" });
fix("NET", "INTERNET", "remove");
fix("NET", "WEB", { strength: 1, clause: "the web is the part of the Net you browse" });
fix("NET", "SOCCER", { clause: "a soccer goal ends up in the back of the net" });
fix("SCALE", "COURT", { clause: "Lady Justice holds the scales outside many courthouses" });
// BOLT: RACE is about Usain Bolt, not the verb; give it its own route.
{ const f = word("BOLT", "RACE"); f.r.words = f.r.words.filter((x) => x !== f.m); hint("BOLT").routes.push({ id: "usain", label: "Usain Bolt", words: [{ ...f.m, fixedBy: by }] }); }
for (const h of routes.hints.filter((x) => x.checkpoint === "x04")) h.routes = h.routes.filter((r) => r.words.length);
routes._metadata.indexReviewX04 = "data/unlimited/related/index-review-x04.json applied by scripts/unlimited/x04-apply-index-review.mjs";
writeFileSync(R, JSON.stringify(routes, null, 1) + "\n");

const groups = JSON.parse(readFileSync(G, "utf8"));
const g = (id) => groups.groups.find((x) => x.id === id);
const crow = g("birds").members.find((m) => m.word === "CROW");
Object.assign(crow, { reason: "a big black bird", sense: "the bird (not a rooster's crow)", note: "back in the word bank 2026-10-19", fixedBy: by });
const cap = g("nautical").members.find((m) => m.word === "CAPTAIN");
Object.assign(cap, { sense: "a ship's captain (not a team captain or Captain America)", fixedBy: by });
for (const [word, strength, reason] of [["OAR", 2, "you row a boat with oars"], ["RAFT", 2, "a simple boat"], ["LIGHTHOUSE", 2, "guides ships to shore"], ["TITANIC", 2, "the most famous ship"], ["WAVE", 1, "ships ride the waves"]])
  if (!g("nautical").members.some((m) => m.word === word)) g("nautical").members.push({ word, strength, reason, addedBy: by });
writeFileSync(G, JSON.stringify(groups, null, 1) + "\n");
console.log(`added ${added} words (${newRoutes} new routes); fixes applied`);
