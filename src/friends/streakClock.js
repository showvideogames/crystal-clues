import { useEffect, useState } from "react";
import { serverOffset } from "./format";

export const FRIEND_STREAK_HELP = "Days (24-hour periods) in a row in which one of you finished a friend puzzle — a loss still counts.";
export const SOLVE_STREAK_HELP = "Friend puzzles solved in a row, whoever played. A loss resets it.";

// Server time, kept ticking on this device. Refreshing just re-reads the
// server's clock, so the countdown stays right after a reload.
export function useServerNow(serverNowIso, tickMs = 30000) {
  const [offset, setOffset] = useState(()=>serverOffset(serverNowIso));
  const [now, setNow] = useState(()=>Date.now());
  useEffect(()=>{
    const t = setTimeout(()=>{ setOffset(serverOffset(serverNowIso)); setNow(Date.now()); }, 0);
    return ()=>clearTimeout(t);
  },[serverNowIso]);
  useEffect(()=>{
    const id = setInterval(()=>setNow(Date.now()), tickMs);
    return ()=>clearInterval(id);
  },[tickMs]);
  return now + offset;
}
