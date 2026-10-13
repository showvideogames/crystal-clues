// Daily puzzle numbers: calendar days from one fixed start date, so a date's
// number never changes. Removing, retiring or backdating a puzzle renumbers
// nothing; a day without a puzzle simply leaves a gap.
//
// DAILY_START is the date that is Daily #1. It is set here once, on purpose,
// and never worked out from the puzzle list.
//   Beta baseline: 2026-04-08, the earliest published daily in the hosted
//   project's committed snapshot (supabase/ops/evidence/hosted/after/counts.json,
//   2026-10-04).
//   Before launch, change it to the launch date so launch day is Daily #1.
// A build may override it with VITE_DAILY_START_DATE (YYYY-MM-DD).

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_START = "2026-04-08";

// A calendar date as a day count. Built in UTC from its own year, month and
// day, so a daylight-saving change between two dates can't shift the result.
function dayIndex(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null; // e.g. 2026-02-30
  return Math.round(t / 86400000);
}

const configured = (() => {
  try {
    const v = String(import.meta.env?.VITE_DAILY_START_DATE ?? "").trim();
    return v && dayIndex(v) !== null ? v : "";
  } catch {
    return "";
  }
})();

export const DAILY_START = configured || DEFAULT_START;

/**
 * The daily number of a puzzle dated `date` (YYYY-MM-DD): 1 on the start date,
 * 2 the day after, and so on. null for a date before the start or one that
 * isn't a real date, so callers show the date instead of a 0 or a negative.
 */
export function dailyNumber(date, start = DAILY_START) {
  const a = dayIndex(start), b = dayIndex(date);
  if (a === null || b === null || b < a) return null;
  return b - a + 1;
}

/** "Daily #12", or the date ("Daily Oct 13, 2026") when there's no number. */
export function dailyName(date, start = DAILY_START) {
  const n = dailyNumber(date, start);
  if (n) return `Daily #${n}`;
  if (dayIndex(date) === null) return "Daily puzzle";
  return `Daily ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
