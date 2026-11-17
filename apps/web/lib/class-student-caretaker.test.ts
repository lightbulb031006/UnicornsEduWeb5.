import { describe, expect, it } from "vitest";
import {
  resolveClassStudentCaretakerHref,
  resolveClassTeacherHref,
} from "./class-student-caretaker";

const none = {
  isAdmin: false,
  isAssistant: false,
  isAccountantExpense: false,
  isCustomerCare: false,
};

describe("resolveClassTeacherHref (card Gia sư phụ trách)", () => {
  it("Admin luôn vào hồ sơ gia sư ở admin shell", () => {
    for (const routeBase of ["/admin", "/staff"] as const) {
      expect(
        resolveClassTeacherHref({
          routeBase,
          teacherId: "UNISTAFF-1",
          access: { ...none, isAdmin: true },
        }),
      ).toBe("/admin/staffs/UNISTAFF-1");
    }
  });

  it("Kế toán chi đi theo shell đang mở", () => {
    const access = { ...none, isAccountantExpense: true };
    expect(
      resolveClassTeacherHref({ routeBase: "/admin", teacherId: "t1", access }),
    ).toBe("/admin/staffs/t1");
    expect(
      resolveClassTeacherHref({ routeBase: "/staff", teacherId: "t1", access }),
    ).toBe("/staff/staffs/t1");
  });

  it("Trưởng phòng Sale & CSKH, Kế toán thu, CSKH: card không bấm (không bị đẩy về /admin/students)", () => {
    for (const access of [
      { ...none, isAssistant: true },
      { ...none, isCustomerCare: true },
      none,
    ]) {
      for (const routeBase of ["/admin", "/staff"] as const) {
        expect(
          resolveClassTeacherHref({ routeBase, teacherId: "t1", access }),
        ).toBeNull();
      }
    }
  });

  it("Trưởng ban Đào tạo luôn sang hồ sơ giới hạn ở staff shell", () => {
    for (const routeBase of ["/admin", "/staff"] as const) {
      expect(
        resolveClassTeacherHref({
          routeBase,
          teacherId: "t1",
          access: none,
          viewerIsTrainingHead: true,
        }),
      ).toBe("/staff/staffs/t1");
    }
  });

  it("không có id thì không có link", () => {
    expect(
      resolveClassTeacherHref({
        routeBase: "/admin",
        teacherId: " ",
        access: { ...none, isAdmin: true },
      }),
    ).toBeNull();
  });
});

describe("resolveClassStudentCaretakerHref (CSKH phụ trách học sinh)", () => {
  const caretaker = { id: "cc-1", fullName: "CSKH" };

  it("Trưởng phòng Sale & CSKH luôn sang trang CSKH ở staff shell (#267, #271)", () => {
    for (const routeBase of ["/admin", "/staff"] as const) {
      expect(
        resolveClassStudentCaretakerHref({
          routeBase,
          caretaker,
          access: { ...none, isAssistant: true },
        }),
      ).toBe("/staff/customer-care-detail/cc-1");
    }
  });

  it("Admin giữ trang CSKH của admin shell", () => {
    expect(
      resolveClassStudentCaretakerHref({
        routeBase: "/admin",
        caretaker,
        access: { ...none, isAdmin: true },
      }),
    ).toBe("/admin/customer_care_detail/cc-1");
  });
});
