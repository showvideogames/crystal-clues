#!/usr/bin/env node
// Applies the independent x04b index check (data/unlimited/related/index-review-x04b.json).
// Run after x04b-build-routes.mjs so the result is reproducible:
//   node scripts/unlimited/x04b-build-routes.mjs && node scripts/unlimited/x04b-apply-index-review.mjs
import { readFileSync, writeFileSync } from "node:fs";

const R = "data/unlimited/related/hint-routes.json";
const review = JSON.parse(readFileSync("data/unlimited/related/index-review-x04b.json", "utf8"));
const routes = JSON.parse(readFileSync(R, "utf8"));
const by = "x04b-index-reviewer";
const hint = (h) => routes.hints.find((x) => x.checkpoint === "x04b" && x.hint === h);
const find = (h, w) => { for (const r of hint(h).routes) { const m = r.words.find((x) => x.word === w); if (m) return { r, m }; } return null; };
let added = 0, newRoutes = 0;
for (const h of review.hints) {
  const H = hint(h.hint); if (!H) continue;
  for (const m of h.missing || []) {
    if (find(h.hint, m.word)) continue;
    let r = String(m.route).startsWith("NEW") ? null : H.routes.find((x) => x.id === m.route);
    if (!r) {
      const label = String(m.route).replace(/^NEW:\s*/, "");
      r = H.routes.find((x) => x.label === label);
      if (!r) { r = { id: label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""), label, words: [], addedBy: by }; H.routes.push(r); newRoutes++; }
    }
    r.words.push({ word: m.word, strength: m.strength, clause: m.clause, addedBy: by }); added++;
  }
}
const remove = (h, w) => { const f = find(h, w); if (f) f.r.words = f.r.words.filter((x) => x !== f.m); else console.warn(`not found ${h} ${w}`); };
const set = (h, w, change) => { const f = find(h, w); if (f) Object.assign(f.m, change, { fixedBy: by }); else console.warn(`not found ${h} ${w}`); };
const move = (h, w, routeId, label, change = {}, sameRoute = false) => {
  const f = find(h, w); if (!f) { console.warn(`not found ${h} ${w}`); return; }
  f.r.words = f.r.words.filter((x) => x !== f.m);
  let r = hint(h).routes.find((x) => x.id === routeId);
  if (!r) { r = { id: routeId, label, ...(sameRoute ? { sameRoute: true } : {}), words: [] }; hint(h).routes.push(r); }
  r.words.push({ ...f.m, ...change, fixedBy: by });
};
// Route fixes from the review.
move("CAMPFIRE", "TENT", "camp", "the campsite");
move("RAINBOW", "UNICORN", "magic", "unicorns and rainbows");
move("UMBRELLA", "WIND", "rain", "keeping dry", { clause: "a gust of wind can flip your umbrella inside out" });
if (!find("UMBRELLA", "FLY")) hint("UMBRELLA").routes.find((r) => r.id === "poppins").words.push({ word: "FLY", strength: 1, clause: "Mary Poppins flies through the sky holding her umbrella", addedBy: by });
remove("GARLIC", "KITCHEN");
remove("PHARAOH", "SNAKE");
set("WALRUS", "IVORY", { strength: 1 });
remove("GOTHAM", "JOKE");
if (!find("GOTHAM", "CLOWN")) hint("GOTHAM").routes[0].words.push({ word: "CLOWN", strength: 1, clause: "the Joker, a villainous clown, terrorizes Gotham City", addedBy: by });
remove("SPOTS", "TREASURE"); remove("SPOTS", "MAP");
hint("PARKER").never = [...(hint("PARKER").never || []), { pair: "CAMERA+PHOTO", why: "near-synonyms (index review)" }];
for (const h of routes.hints.filter((x) => x.checkpoint === "x04b")) h.routes = h.routes.filter((r) => r.words.length);
routes._metadata.indexReviewX04b = "data/unlimited/related/index-review-x04b.json applied by scripts/unlimited/x04b-apply-index-review.mjs";
writeFileSync(R, JSON.stringify(routes, null, 1) + "\n");
console.log(`added ${added} words (${newRoutes} new routes); fixes applied`);
