import { describe, expect, it } from "vitest";
import {
  resolveBlurSave,
  toBlurSaveText,
  toDateInputValue,
  validateBirthYear,
} from "./profile-blur-save";

describe("resolveBlurSave", () => {
  it("skips when the value is unchanged, ignoring surrounding spaces", () => {
    expect(resolveBlurSave("An", "  An ")).toEqual({ kind: "skip" });
    expect(resolveBlurSave(null, "")).toEqual({ kind: "skip" });
    expect(resolveBlurSave(undefined, "   ")).toEqual({ kind: "skip" });
    expect(resolveBlurSave(2008, "2008")).toEqual({ kind: "skip" });
  });

  it("saves the trimmed value when it changed", () => {
    expect(resolveBlurSave("An", " Bình ")).toEqual({
      kind: "save",
      value: "Bình",
    });
    expect(resolveBlurSave(null, "0901234567")).toEqual({
      kind: "save",
      value: "0901234567",
    });
  });

  it("clears to an empty string by default", () => {
    expect(resolveBlurSave("TP. HCM", "")).toEqual({ kind: "save", value: "" });
  });

  it("clears to null when the field accepts null", () => {
    expect(resolveBlurSave("ph@example.com", " ", "null")).toEqual({
      kind: "save",
      value: null,
    });
  });

  it("reverts instead of saving when the field cannot be cleared", () => {
    expect(resolveBlurSave("a@example.com", "", "keep")).toEqual({
      kind: "revert",
    });
  });
});

describe("toBlurSaveText", () => {
  it("normalizes nullish and numbers", () => {
    expect(toBlurSaveText(null)).toBe("");
    expect(toBlurSaveText(undefined)).toBe("");
    expect(toBlurSaveText(2008)).toBe("2008");
    expect(toBlurSaveText(" x ")).toBe("x");
  });
});

describe("toDateInputValue", () => {
  it("formats stored ISO dates for date inputs", () => {
    expect(toDateInputValue("2000-05-17T00:00:00.000Z")).toBe("2000-05-17");
  });

  it("returns empty for missing or invalid dates", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("not-a-date")).toBe("");
  });
});

describe("validateBirthYear", () => {
  it("accepts integer years in range", () => {
    expect(validateBirthYear("1900", 2026)).toBeNull();
    expect(validateBirthYear("2026", 2026)).toBeNull();
  });

  it("rejects non-integers and out-of-range years", () => {
    for (const raw of ["1899", "2027", "2008.5", "1e3", "abc"]) {
      expect(validateBirthYear(raw, 2026)).toBe(
        "Năm sinh phải là số nguyên từ 1900 đến 2026.",
      );
    }
  });
});
