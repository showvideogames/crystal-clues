// Appearance: System, Light or Dark, remembered on this device only (no
// account needed). The page's colours all come from the tokens in theme.css;
// this file only decides which set is on, by setting data-theme on <html>.
// index.html runs the same decision before the first paint, so a saved Dark
// never flashes light on a refresh.
import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "cv-theme";
export const THEME_CHOICES = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];
const isChoice = (v) => THEME_CHOICES.some((c) => c.key === v);

export function readThemeChoice() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isChoice(v) ? v : "system";
  } catch {
    return "system";
  }
}

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");
export const resolveTheme = (choice) => (choice === "system" ? (darkQuery()?.matches ? "dark" : "light") : choice);

export function applyTheme(choice) {
  const theme = resolveTheme(choice);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  return theme;
}

// [choice, setChoice]. System follows the device as it changes (an evening
// switch to dark, say); a choice made in another tab follows here too.
export function useThemeChoice() {
  const [choice, setChoice] = useState(readThemeChoice);
  useEffect(() => {
    applyTheme(choice);
    if (choice !== "system") return undefined;
    const q = darkQuery();
    const follow = () => applyTheme("system");
    q?.addEventListener?.("change", follow);
    return () => q?.removeEventListener?.("change", follow);
  }, [choice]);
  useEffect(() => {
    const other = (e) => { if (e.key === THEME_KEY) setChoice(readThemeChoice()); };
    window.addEventListener("storage", other);
    return () => window.removeEventListener("storage", other);
  }, []);
  const choose = useCallback((next) => {
    if (!isChoice(next)) return;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: still applies for this visit */ }
    setChoice(next);
  }, []);
  return [choice, choose];
}
