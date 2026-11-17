import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_PUBLISHER_STAFF_ROLES,
  canPublishNotifications,
} from "./notification-publisher-access";

describe("canPublishNotifications", () => {
  it("allows admin without any staff role", () => {
    expect(canPublishNotifications([], true)).toBe(true);
  });

  it.each(NOTIFICATION_PUBLISHER_STAFF_ROLES)("allows staff role %s", (role) => {
    expect(canPublishNotifications([role], false)).toBe(true);
  });

  it.each(["teacher", "customer_care"])("rejects receive-only role %s", (role) => {
    expect(canPublishNotifications([role], false)).toBe(false);
  });

  it("rejects the removed legacy accountant role (#266)", () => {
    expect(canPublishNotifications(["accountant"], false)).toBe(false);
    expect(canPublishNotifications(["accountant_income"], false)).toBe(true);
    expect(canPublishNotifications(["accountant_expense"], false)).toBe(true);
  });

  it("allows a teacher who also holds a publisher role", () => {
    expect(canPublishNotifications(["teacher", "communication"], false)).toBe(true);
  });
});
