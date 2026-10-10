// Time wording for the Friends screens. Deadlines come from the server and
// are shown in this device's own clock, with a countdown that uses the
// server's time (so a phone with the wrong clock still counts correctly).

// Milliseconds to add to this device's clock to get the server's.
export function serverOffset(serverNowIso) {
  return serverNowIso ? new Date(serverNowIso).getTime() - Date.now() : 0;
}

// Calendar day of an instant in a time zone, as "YYYY-MM-DD".
function dayIn(ms, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

// A server deadline in the viewer's local time, always with the zone so
// two friends comparing screens can tell it's the same moment:
//   "today, 9:30 PM MDT" · "tomorrow, 3:46 AM MDT" · "Mon, Sep 28, 3:46 AM MDT"
// `now` should be server time; locale/timeZone default to the device's.
export function formatDeadline(iso, { now = Date.now(), locale, timeZone } = {}) {
  const at = new Date(iso).getTime();
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at);
  const day = dayIn(at, timeZone);
  if (day === dayIn(now, timeZone)) return `today, ${time}`;
  if (day === dayIn(now + 86400e3, timeZone)) return `tomorrow, ${time}`;
  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", month: "short", day: "numeric" }).format(at);
  return `${date}, ${time}`;
}

export function formatCountdown(ms) {
  if (ms <= 0) return "no time";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 1) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// How a win went, by lives left: "with 2 of 3 lives left", "with all 3 lives left".
export const livesLeftPhrase = (used, max) => {
  const left = Math.max(0, max - used);
  return left === max ? `with all ${max} lives left` : `with ${left} of ${max} lives left`;
};
