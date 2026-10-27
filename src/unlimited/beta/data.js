// The built pilot boards (scripts/unlimited/build-pilot-beta.mjs), loaded so
// that a missing file is not a build error: the screen then says the beta data
// is missing. There is deliberately no fallback to normal Unlimited's library.
const files = import.meta.glob("./pilot-boards.json", { eager: true, import: "default" });

/** { data, problem }: data is the board list when usable; otherwise problem says why. */
export function checkPilotData(data) {
  if (!data || !Array.isArray(data.boards) || !data._metadata) return { data: null, problem: "missing" };
  if (data.boards.length === 0) return { data: null, problem: "empty" };
  const ok = data.boards.every((b) => b && typeof b.id === "string" && Array.isArray(b.clues) && b.clues.length === 4
    && b.cards && b.solution && Array.isArray(b.reveal) && b.reveal.length === 4);
  return ok ? { data, problem: null } : { data: null, problem: "invalid" };
}

export const PILOT = checkPilotData(Object.values(files)[0]);
