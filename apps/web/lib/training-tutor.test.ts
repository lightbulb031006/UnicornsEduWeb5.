import { describe, expect, it } from "vitest";
import {
  countPages,
  formatTutorSessionDate,
  formatTutorSessionTimeRange,
} from "./training-tutor";

describe("formatTutorSessionDate", () => {
  it("formats a Date column without timezone shift", () => {
    expect(formatTutorSessionDate("2026-09-01T00:00:00.000Z")).toBe(
      "01/09/2026",
    );
  });

  it("falls back on bad input", () => {
    expect(formatTutorSessionDate("x")).toBe("—");
  });
});

describe("formatTutorSessionTimeRange", () => {
  it("reads wall-clock time from a Time column", () => {
    expect(
      formatTutorSessionTimeRange(
        "1970-01-01T19:30:00.000Z",
        "1970-01-01T21:00:00.000Z",
      ),
    ).toBe("19:30 – 21:00");
  });

  it("shows only start when end is missing", () => {
    expect(formatTutorSessionTimeRange("1970-01-01T08:00:00.000Z", null)).toBe(
      "08:00",
    );
  });

  it("shows dash when start is missing", () => {
    expect(formatTutorSessionTimeRange(null, null)).toBe("—");
  });
});

describe("countPages", () => {
  it("never returns less than 1", () => {
    expect(countPages(0, 20)).toBe(1);
    expect(countPages(41, 20)).toBe(3);
  });
});
