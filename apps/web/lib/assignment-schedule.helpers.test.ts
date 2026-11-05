import { describe, expect, it } from "vitest";
import {
  closeAtDraftFromIso,
  closeAtPayload,
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

  it("closeAtPayload: theo lớp = undefined, không hạn = null", () => {
    expect(closeAtPayload({ mode: "class", date: "", time: "" })).toBe(
      undefined,
    );
    expect(closeAtPayload({ mode: "none", date: "", time: "" })).toBeNull();
  });

  it("closeAtPayload: tự chọn thiếu giờ = false, đủ = ISO", () => {
    expect(
      closeAtPayload({ mode: "custom", date: "2026-11-01", time: "" }),
    ).toBe(false);
    expect(
      closeAtPayload({ mode: "custom", date: "2026-11-01", time: "23:59" }),
    ).toBe(toOpenAtIso("2026-11-01", "23:59"));
  });

  it("closeAtDraftFromIso: null = không hạn, có giá trị = tự chọn", () => {
    expect(closeAtDraftFromIso(null).mode).toBe("none");
    const iso = toOpenAtIso("2026-11-01", "23:59");
    expect(closeAtDraftFromIso(iso)).toEqual({
      mode: "custom",
      date: "2026-11-01",
      time: "23:59:00",
    });
  });
});
