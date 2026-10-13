// The front page's words that depend on saved state (Home.jsx).
import { DIFFICULTY_LABELS } from "../game/shared.js";

const livesPhrase = (n) => `${n} ${n === 1 ? "life" : "lives"}`;

/** What the daily button says, from the saved state of today's puzzle. */
export function dailyCopy(daily){
  if(daily.status === "loading") return { title:"Today's Puzzle", sub:"Checking your progress…" };
  if(daily.status === "done"){
    const r = daily.record, diff = DIFFICULTY_LABELS[r.difficulty] || r.difficulty;
    return { title:"View Today's Results",
      sub: r.solved ? `Solved on ${diff} · ${Number(r.livesUsed) ? `${livesPhrase(Number(r.livesUsed))} used` : "no lives lost"}` : `Not solved · ${diff}` };
  }
  if(daily.status === "progress"){
    const diff = DIFFICULTY_LABELS[daily.difficulty] || daily.difficulty;
    return { title:"Continue Today's Puzzle",
      sub: daily.livesUsed ? `${diff} · ${livesPhrase(daily.livesUsed)} used so far` : `${diff} · in progress` };
  }
  return { title:"Play Today's Puzzle", sub:"A fresh challenge every day" };
}

/** The Friends row's second line: a real count once the inbox has answered, else a plain invitation. */
export function friendsCopy(friends){
  if(friends?.waiting > 0) return `${friends.waiting} ${friends.waiting === 1 ? "puzzle" : "puzzles"} waiting`;
  if(friends?.results > 0) return `${friends.results} new ${friends.results === 1 ? "result" : "results"} to watch`;
  return "Trade puzzles with friends";
}
