import { describe, expect, it } from "vitest";
import { canSetClassTeacherPay } from "./class-teacher-pay-access";

describe("canSetClassTeacherPay (follow-up grill 13/11)", () => {
  it("Kế toán chi thuần chỉ xem, không sửa", () => {
    expect(
      canSetClassTeacherPay({
        isAdmin: false,
        staffRoles: ["accountant_expense"],
        viewerStaffId: "staff-1",
        classTrainingManagerStaffId: "staff-2",
      }),
    ).toBe(false);
  });

  it("Admin sửa được", () => {
    expect(canSetClassTeacherPay({ isAdmin: true, staffRoles: [] })).toBe(true);
  });

  it("Kế toán chi kiêm Trưởng ban Đào tạo: hợp quyền → sửa được", () => {
    expect(
      canSetClassTeacherPay({
        isAdmin: false,
        staffRoles: ["accountant_expense", "training_head"],
      }),
    ).toBe(true);
  });

  it("Kế toán chi kiêm Ban Đào tạo: chỉ sửa lớp mình quản lý", () => {
    const base = {
      isAdmin: false,
      staffRoles: ["accountant_expense", "training"],
      viewerStaffId: "staff-1",
    };
    expect(canSetClassTeacherPay({ ...base, classTrainingManagerStaffId: "staff-1" })).toBe(true);
    expect(canSetClassTeacherPay({ ...base, classTrainingManagerStaffId: "staff-2" })).toBe(false);
    expect(canSetClassTeacherPay({ ...base, classTrainingManagerStaffId: null })).toBe(false);
  });
});
