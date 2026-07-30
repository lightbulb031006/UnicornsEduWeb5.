import { describe, expect, it } from "vitest";
import {
  formatMoneyInputFromUserRaw,
  isNonNegativeMoneyInput,
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "./money-input.helpers";

describe("money-input.helpers", () => {
  it("formats digits while typing", () => {
    expect(formatMoneyInputFromUserRaw("14000")).toBe("14.000");
    expect(formatMoneyInputFromUserRaw("14.000")).toBe("14.000");
  });

  it("strips noise from paste", () => {
    expect(formatMoneyInputFromUserRaw("14,000đ")).toBe("14.000");
    expect(formatMoneyInputFromUserRaw("-14000", true)).toBe("-14.000");
  });

  it("parses formatted values", () => {
    expect(parseMoneyInput("14.000")).toBe(14000);
    expect(parseMoneyInput("")).toBeNull();
  });

  it("supports signed amounts when allowed", () => {
    expect(parseMoneyInput("-14.000", { allowNegative: true })).toBe(-14000);
    expect(parseMoneyInput("-14.000")).toBeNull();
  });

  it("validates non-negative inputs", () => {
    expect(isNonNegativeMoneyInput("14.000")).toBe(true);
    expect(isNonNegativeMoneyInput("-1")).toBe(false);
    expect(isNonNegativeMoneyInput("")).toBe(true);
  });

  it("initializes from numbers", () => {
    expect(moneyInputInitialFromNumber(14000)).toBe("14.000");
    expect(moneyInputInitialFromNumber(-500, true)).toBe("-500");
  });
});
