import { describe, expect, it } from "vitest";
import {
  fromOpenAtIso,
  parseAssignmentDurationMinutes,
  toOpenAtIso,
} from "./assignment-schedule.helpers";

describe("assignment-schedule.helpers", () => {
  it("round-trips 10:07 without flooring to a 15-minute grid", () => {
    const iso = toOpenAtIso("2026-09-08", "10:07:00");
    const parsed = fromOpenAtIso(iso);
    expect(parsed.date).toBe("2026-09-08");
    expect(parsed.time).toBe("10:07:00");
  });

  it("keeps 10:00 on the 15-minute grid as well", () => {
    const iso = toOpenAtIso("2026-09-08", "10:00:00");
    expect(fromOpenAtIso(iso).time).toBe("10:00:00");
  });

  it("rejects empty or non-positive durationMinutes", () => {
    expect(parseAssignmentDurationMinutes("")).toBeNull();
    expect(parseAssignmentDurationMinutes("0")).toBeNull();
    expect(parseAssignmentDurationMinutes("-5")).toBeNull();
    expect(parseAssignmentDurationMinutes("60.5")).toBeNull();
    expect(parseAssignmentDurationMinutes("721")).toBeNull();
  });

  it("accepts integer duration in 1–720", () => {
    expect(parseAssignmentDurationMinutes("1")).toBe(1);
    expect(parseAssignmentDurationMinutes("60")).toBe(60);
    expect(parseAssignmentDurationMinutes("720")).toBe(720);
  });
});
