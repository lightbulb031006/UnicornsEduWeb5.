import { describe, expect, it } from "vitest";
import {
  canDeleteSessionsAsHead,
  canHeadDeleteSession,
} from "./session-delete-access";

describe("Quyền xoá buổi của role trưởng (15/11)", () => {
  it.each(["sale_customer_care_head", "training_head", "lesson_plan_head"])(
    "%s được xoá buổi",
    (role) => {
      expect(canDeleteSessionsAsHead(["teacher", role])).toBe(true);
    },
  );

  it.each([[[]], [null], [["training", "lesson_plan", "customer_care", "accountant_expense"]]])(
    "role thường không xoá (%o)",
    (roles) => {
      expect(canDeleteSessionsAsHead(roles)).toBe(false);
    },
  );

  it("ẩn nút xoá buổi đã thanh toán / ghi cọc", () => {
    expect(canHeadDeleteSession({ teacherPaymentStatus: "paid" })).toBe(false);
    expect(canHeadDeleteSession({ teacherPaymentStatus: "deposit" })).toBe(false);
    expect(canHeadDeleteSession({ teacherPaymentStatus: "unpaid" })).toBe(true);
  });

  it("trạng thái bị che (Trưởng phòng) vẫn hiện nút, backend chặn", () => {
    expect(canHeadDeleteSession({})).toBe(true);
  });
});
