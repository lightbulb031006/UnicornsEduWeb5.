import { describe, expect, it } from "vitest";
import {
  currentTimePrefillValue,
  normalizeTypedTime,
  parseTimeValue,
  snapMinutesToPickerGrid,
  toTimeDisplay,
} from "@/components/ui/time-input.helpers";

describe("time-input.helpers", () => {
  it("snaps minutes to the nearest 00/15/30/45 grid", () => {
    expect(snapMinutesToPickerGrid(14, 0)).toEqual({ hours: 14, minutes: 0 });
    expect(snapMinutesToPickerGrid(14, 7)).toEqual({ hours: 14, minutes: 0 });
    expect(snapMinutesToPickerGrid(14, 8)).toEqual({ hours: 14, minutes: 15 });
    expect(snapMinutesToPickerGrid(14, 22)).toEqual({ hours: 14, minutes: 15 });
    expect(snapMinutesToPickerGrid(14, 23)).toEqual({ hours: 14, minutes: 30 });
    expect(snapMinutesToPickerGrid(14, 37)).toEqual({ hours: 14, minutes: 30 });
    expect(snapMinutesToPickerGrid(14, 38)).toEqual({ hours: 14, minutes: 45 });
    expect(snapMinutesToPickerGrid(14, 52)).toEqual({ hours: 14, minutes: 45 });
    expect(snapMinutesToPickerGrid(14, 53)).toEqual({ hours: 15, minutes: 0 });
    expect(snapMinutesToPickerGrid(23, 53)).toEqual({ hours: 0, minutes: 0 });
  });

  it("prefills current local time with minutes snapped to 15′ grid", () => {
    expect(currentTimePrefillValue(new Date(2026, 6, 30, 14, 37, 55))).toBe(
      "14:30:00",
    );
    expect(currentTimePrefillValue(new Date(2026, 6, 30, 14, 8, 0))).toBe(
      "14:15:00",
    );
    expect(currentTimePrefillValue(new Date(2026, 6, 30, 23, 55, 0))).toBe(
      "00:00:00",
    );
  });

  it("formats display as HH:mm from HH:mm:ss", () => {
    expect(toTimeDisplay("09:05:00")).toBe("09:05");
    expect(toTimeDisplay("")).toBe("");
  });

  it("normalizes typed HH:mm to HH:mm:ss", () => {
    expect(normalizeTypedTime("9:30")).toBe("09:30:00");
    expect(normalizeTypedTime("1830")).toBe("18:30:00");
    expect(normalizeTypedTime("")).toBe("");
  });

  it("parses HH:mm and HH:mm:ss", () => {
    expect(parseTimeValue("18:00")).toEqual({
      hours: 18,
      minutes: 0,
      seconds: 0,
    });
    expect(parseTimeValue("18:15:00")).toEqual({
      hours: 18,
      minutes: 15,
      seconds: 0,
    });
  });
});
