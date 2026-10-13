import { describe, expect, it } from "vitest";
import { DAILY_START, dailyName, dailyNumber } from "./dailyNumber.js";

describe("daily numbers", () => {
  it("count calendar days from the fixed beta baseline", () => {
    expect(DAILY_START).toBe("2026-04-08");
    expect(dailyNumber("2026-04-08")).toBe(1);
    expect(dailyNumber("2026-04-09")).toBe(2);
    expect(dailyNumber("2026-10-13")).toBe(189);
  });
  it("depend on the date alone: other puzzles coming or going renumber nothing, and gaps stay gaps", () => {
    // There is no puzzle list to consult; the same date always gives the same number.
    const before = ["2026-10-10", "2026-10-11", "2026-10-13"].map((d) => dailyNumber(d));
    expect(before).toEqual([186, 187, 189]);   // 2026-10-12 skipped: #188 is simply unused
    expect(["2026-10-10", "2026-10-11", "2026-10-13"].map((d) => dailyNumber(d))).toEqual(before);
  });
  it("change only when the start date is deliberately changed", () => {
    expect(dailyNumber("2026-11-02", "2026-11-02")).toBe(1);   // e.g. a launch date
    expect(dailyNumber("2026-11-09", "2026-11-02")).toBe(8);
  });
  it("are exact across daylight-saving changes and leap days", () => {
    expect(dailyNumber("2026-03-09", "2026-03-07")).toBe(3);   // US clocks forward 2026-03-08
    expect(dailyNumber("2026-03-30", "2026-03-28")).toBe(3);   // EU clocks forward 2026-03-29
    expect(dailyNumber("2026-11-02", "2026-10-31")).toBe(3);   // US clocks back 2026-11-01
    expect(dailyNumber("2028-03-01", "2028-02-28")).toBe(3);   // leap day 2028-02-29
    expect(dailyNumber("2027-01-01", "2026-12-31")).toBe(2);
    expect(dailyNumber("2027-04-08", "2026-04-08")).toBe(366);
  });
  it("are never zero or negative: before the start (or no real date) there is no number", () => {
    expect(dailyNumber("2026-04-07")).toBe(null);
    expect(dailyNumber("2025-12-31")).toBe(null);
    expect(dailyNumber("2026-02-30")).toBe(null);
    expect(dailyNumber("")).toBe(null);
    expect(dailyNumber(undefined)).toBe(null);
  });
  it("name the puzzle: the number, else its date", () => {
    expect(dailyName("2026-10-13")).toBe("Daily #189");
    expect(dailyName("2026-04-07")).toBe("Daily Apr 7, 2026");
    expect(dailyName(null)).toBe("Daily puzzle");
  });
});
