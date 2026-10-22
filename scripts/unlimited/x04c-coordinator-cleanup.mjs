#!/usr/bin/env node
// Coordinator review of the x04c backlog (2026-10-19), local cleanup, no model calls.
// Coordinator decisions are labelled as such (never as owner decisions):
//  - #117 BOXING + JOKE -> PUNCHLINE: the coordinator's application of the owner's closely
//    equivalent BOXER + JOKE -> PUNCHLINE preference (not a verbatim owner decision on BOXING);
//    PUNCH stays recorded for this pair, unserved, and is unchanged on every other pair.
//  - #43 CHOCOLATE + HOT -> FUDGE and #177 BASKETBALL + TENNIS -> SLAM: coordinator editorial
//    preferences (checked first: no owner preference, request, exclusion or rejection on either pair).
//  - Mario Kart lines and sentence starts capitalised (#160, #167-#169); #181 simplified;
//    #182 reviewer rationale corrected (the "sonic means sound-speed" side claim removed; the
//    served explanation is unchanged).
//  - #136-#137 MOON + SEA / MOON + SHIP -> SAILOR held as review-pending (Sailor Moon consistency
//    with the earlier BOAT / KNOT holds), not release-approved.
//   node scripts/unlimited/x04c-coordinator-cleanup.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const P = "data/unlimited/library/pairs.json", PR = "data/unlimited/library/preferences.json", O = "data/unlimited/library/overrides.json";
const BY = "coordinator (review of the x04c backlog, 2026-10-19; not an owner decision)";
const today = "2026-10-19";
const lib = JSON.parse(readFileSync(P, "utf8"));
const pair = (id) => lib.pairs.find((p) => p.pair_id === id);
const ADD = [
  { id: "p_boxing__joke", text: "PUNCHLINE", why: "A joke ends with a punchline; boxers throw punches.", a: "Boxers throw punches.", b: "A joke ends with a punchline.",
    basis: "coordinator applies the owner's closely equivalent BOXER + JOKE -> PUNCHLINE preference (owner: \"I think punchline is better\"); not a verbatim owner decision on BOXING" },
  { id: "p_chocolate__hot", text: "FUDGE", why: "Fudge is a rich chocolate treat, and hot fudge is the classic sundae topping.", a: "Fudge is a rich chocolate treat.", b: "Hot fudge is the classic sundae topping.",
    basis: "coordinator editorial improvement (the x04c reviewer named FUDGE as a tighter hint than LAVA); no owner preference or exclusion on this pair" },
];
for (const x of ADD) {
  const p = pair(x.id);
  if (p.clues.some((c) => c.text === x.text)) continue;
  p.clues.push({ text: x.text, status: "ai_reviewed", heldReason: null, type: "coordinator", wordAConnection: x.a, wordBConnection: x.b, revealExplanation: x.why, reference: null,
    provenance: { source: "coordinator-editorial", decidedBy: BY, date: today, basis: x.basis, blindReview: null } });
  p.playableHints = p.clues.filter((c) => ["ai_reviewed", "human_approved"].includes(c.status)).length;
}
// #182: correct the stored reviewer rationale (the served explanation is untouched).
{
  const c = pair("p_fast__ring").clues.find((x) => x.text === "SONIC");
  const from = c.provenance.blindReview.reason;
  const to = from.replace(/ \('gotta go fast', and 'sonic' itself means sound-speed\)/, " ('gotta go fast')");
  if (to !== from) { c.provenance.blindReview.reason = to; c.provenance.rationaleCorrection = { by: BY, date: today, from, to, note: "removed an inaccurate side claim (sonic relates to sound, not sound-speed); verdict unchanged" }; }
}
writeFileSync(P, JSON.stringify(lib, null, 2) + "\n");

const pr = JSON.parse(readFileSync(PR, "utf8"));
for (const [id, canonical, reason] of [
  ["p_boxing__joke", "PUNCHLINE", "coordinator applies the owner's closely equivalent BOXER + JOKE -> PUNCHLINE preference; PUNCH stays recorded, unserved, for this pair"],
  ["p_chocolate__hot", "FUDGE", "coordinator editorial: FUDGE (hot fudge) is tighter than LAVA for CHOCOLATE + HOT; LAVA stays recorded, unserved"],
  ["p_basketball__tennis", "SLAM", "coordinator editorial: SLAM (slam dunk / Grand Slam) over NET; NET stays recorded, unserved"],
]) pr.pairs[id] = { status: "approved", canonical, by: BY, date: today, reason, ...(pr.pairs[id] ? { previous: pr.pairs[id] } : {}) };
writeFileSync(PR, JSON.stringify(pr, null, 2) + "\n");

const o = JSON.parse(readFileSync(O, "utf8"));
for (const id of ["p_moon__sea", "p_moon__ship"]) if (!o.overrides.some((x) => x.pair_id === id && x.text === "SAILOR"))
  o.overrides.push({ pair_id: id, text: "SAILOR", status: "held", by: BY, date: today, reason: "review-pending, not release-approved: needs one consistent Sailor Moon decision with the earlier BOAT + MOON and KNOT + MOON holds" });
writeFileSync(O, JSON.stringify(o, null, 2) + "\n");

// Text: capitalise the Mario Kart clause where it opens a line or a sentence (#160, #167-#169); #181.
const run = (args) => execFileSync(process.execPath, ["scripts/unlimited/correct-text.mjs", ...args], { encoding: "utf8" });
const lib2 = JSON.parse(readFileSync(P, "utf8"));
for (const p of lib2.pairs) for (const c of p.clues) {
  if (c.text !== "SHELL") continue;
  const args = [];
  const fix = (s) => (s && s.startsWith("in Mario Kart") ? "I" + s.slice(1) : null);
  const w = fix(c.revealExplanation), a = fix(c.wordAConnection), b = fix(c.wordBConnection);
  if (w) args.push("--why", w); if (a) args.push("--a", a); if (b) args.push("--b", b);
  if (args.length) { run([p.a, p.b, "SHELL", "--by", BY, "--note", "capitalise 'In' where the clause opens a sentence or line", ...args]); console.log(`${p.a} + ${p.b} SHELL`); }
}
run(["BLUE", "VIDEO GAME", "SONIC", "--by", BY, "--note", "#181 simplified", "--why", "Sonic is Sega's blue video-game hedgehog."]);
console.log("done");
