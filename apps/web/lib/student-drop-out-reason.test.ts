import { describe, expect, it } from "vitest";
import {
  validateBackfilledDropOutReason,
  validateStudentDropOutReason,
} from "@/lib/student-drop-out-reason";

describe("validateStudentDropOutReason", () => {
  it("bắt buộc lý do khi chuyển sang nghỉ học", () => {
    expect(
      validateStudentDropOutReason({ currentStatus: "active", nextStatus: "inactive", reason: "  " }),
    ).toBe("Chuyển học sinh sang nghỉ học phải nhập lý do nghỉ.");
    expect(
      validateStudentDropOutReason({
        currentStatus: "active",
        nextStatus: "inactive",
        reason: "Chuyển trường",
      }),
    ).toBeNull();
  });

  it("không bắt buộc lý do khi học sinh học lại hoặc giữ nguyên trạng thái", () => {
    expect(
      validateStudentDropOutReason({ currentStatus: "inactive", nextStatus: "active", reason: "" }),
    ).toBeNull();
    expect(
      validateStudentDropOutReason({ currentStatus: "inactive", nextStatus: "inactive", reason: "" }),
    ).toBeNull();
  });

  it("giới hạn 500 ký tự", () => {
    expect(
      validateStudentDropOutReason({
        currentStatus: "active",
        nextStatus: "inactive",
        reason: "a".repeat(501),
      }),
    ).toBe("Lý do tối đa 500 ký tự.");
  });
});

describe("validateBackfilledDropOutReason", () => {
  it("bắt buộc lý do khác rỗng", () => {
    expect(validateBackfilledDropOutReason("   ")).toBe("Nhập lý do nghỉ trước khi lưu.");
  });

  it("giới hạn 500 ký tự sau khi trim", () => {
    expect(validateBackfilledDropOutReason(` ${"a".repeat(500)} `)).toBeNull();
    expect(validateBackfilledDropOutReason("a".repeat(501))).toBe("Lý do tối đa 500 ký tự.");
  });
});
