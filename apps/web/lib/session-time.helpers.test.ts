import { describe, expect, it } from "vitest";
import {
  getSessionTimeSubmitError,
  isSessionPaymentLockedStatus,
  normalizeSessionTimeForApi,
} from "@/lib/session-time.helpers";

describe("session-time.helpers", () => {
  it("normalizes HH:mm to HH:mm:ss", () => {
    expect(normalizeSessionTimeForApi("19:00")).toBe("19:00:00");
    expect(normalizeSessionTimeForApi("")).toBe("");
    expect(normalizeSessionTimeForApi("25:00")).toBe("");
  });

  it("requires both start and end times before submit", () => {
    expect(getSessionTimeSubmitError("", "")).toBe(
      "Vui lòng nhập giờ bắt đầu và giờ kết thúc.",
    );
    expect(getSessionTimeSubmitError("", "20:00")).toBe(
      "Vui lòng nhập giờ bắt đầu.",
    );
    expect(getSessionTimeSubmitError("19:00", "")).toBe(
      "Vui lòng nhập giờ kết thúc.",
    );
  });

  it("rejects end time that is not after start time", () => {
    expect(getSessionTimeSubmitError("19:00", "19:00")).toBe(
      "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
    );
    expect(getSessionTimeSubmitError("20:00", "19:00")).toBe(
      "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
    );
    expect(getSessionTimeSubmitError("19:00", "20:30")).toBeNull();
  });

  it("allows empty times when they are not required", () => {
    expect(getSessionTimeSubmitError("", "", { required: false })).toBeNull();
  });

  it("locks paid and deposit payment statuses", () => {
    expect(isSessionPaymentLockedStatus("paid")).toBe(true);
    expect(isSessionPaymentLockedStatus("deposit")).toBe(true);
    expect(isSessionPaymentLockedStatus("PAID")).toBe(true);
    expect(isSessionPaymentLockedStatus("unpaid")).toBe(false);
    expect(isSessionPaymentLockedStatus(null)).toBe(false);
  });
});
