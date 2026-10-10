// Deadline wording: one server instant, read correctly in each friend's zone.
// Run: node --test tests/friends/format.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDeadline, formatCountdown, serverOffset } from "../../src/friends/format.js";

// Newer ICU puts a narrow no-break space before AM/PM; compare as plain text.
const SPACES = new RegExp(`[${String.fromCharCode(0x202f, 0xa0)}]`, "g"); // narrow and regular no-break spaces
const plain = (s) => s.replace(SPACES, " ");
const at = (iso) => Date.parse(iso);
const DEADLINE = "2026-09-28T09:46:00Z"; // one server instant
const denver = (now) => plain(formatDeadline(DEADLINE, { now: at(now), locale: "en-US", timeZone: "America/Denver" }));
const tokyo = (now) => plain(formatDeadline(DEADLINE, { now: at(now), locale: "en-US", timeZone: "Asia/Tokyo" }));

test("the same deadline, shown in each friend's local time with the zone", () => {
  assert.equal(denver("2026-09-26T10:00:00Z"), "Mon, Sep 28, 3:46 AM MDT");
  assert.equal(tokyo("2026-09-26T10:00:00Z"), "Mon, Sep 28, 6:46 PM GMT+9");
});

test("today / tomorrow follow each viewer's own calendar", () => {
  assert.equal(denver("2026-09-27T12:00:00Z"), "tomorrow, 3:46 AM MDT");
  assert.equal(tokyo("2026-09-27T12:00:00Z"), "tomorrow, 6:46 PM GMT+9");
  // 16:00Z: already Monday 1 AM in Tokyo, still Sunday morning in Denver.
  assert.equal(tokyo("2026-09-27T16:00:00Z"), "today, 6:46 PM GMT+9");
  assert.equal(denver("2026-09-27T16:00:00Z"), "tomorrow, 3:46 AM MDT");
});

test("daylight saving shows the right local zone name", () => {
  const nov = (tz) => plain(formatDeadline("2026-11-02T10:00:00Z", { now: at("2026-10-30T12:00:00Z"), locale: "en-US", timeZone: tz }));
  assert.equal(nov("America/Denver"), "Mon, Nov 2, 3:00 AM MST");
});

test("countdown wording", () => {
  assert.equal(formatCountdown(5 * 3600e3 + 12 * 60e3 + 30e3), "5h 12m");
  assert.equal(formatCountdown(9 * 60e3), "9m");
  assert.equal(formatCountdown(20e3), "under a minute");
  assert.equal(formatCountdown(-1), "no time");
});

test("the countdown runs on server time even if the device clock is off", () => {
  // Server says it's 12:00:00; this device thinks it's 11:55:00.
  const realNow = Date.now;
  Date.now = () => at("2026-09-27T11:55:00Z");
  try {
    const offset = serverOffset("2026-09-27T12:00:00Z");
    assert.equal(offset, 5 * 60e3);
    const serverNow = Date.now() + offset;
    assert.equal(formatCountdown(at(DEADLINE) - serverNow), "21h 46m");
  } finally {
    Date.now = realNow;
  }
});
