import { describe, expect, it } from "vitest";
import { resolveClassWriteAccess } from "./class-write-access";

describe("#274 resolveClassWriteAccess", () => {
  it("Admin được mọi phần", () => {
    expect(resolveClassWriteAccess({ isAdmin: true, staffRoles: [] })).toMatchObject({
      isAdmin: true,
      canWriteClassInfo: true,
      canEditTeachersAndPay: true,
      canEditTuitionAndStudents: true,
      canEditAdminOnlyFields: true,
    });
  });

  it("staff mang role admin coi như Admin", () => {
    expect(
      resolveClassWriteAccess({ isAdmin: false, staffRoles: ["admin"] }).canEditAdminOnlyFields,
    ).toBe(true);
  });

  it("Trưởng ban Đào tạo: gia sư + lương, không học phí/học sinh, không phần Admin", () => {
    expect(
      resolveClassWriteAccess({ isAdmin: false, staffRoles: ["training_head"], staffId: "S1" }),
    ).toEqual({
      isAdmin: false,
      canWriteClassInfo: true,
      canEditTeachersAndPay: true,
      canEditTuitionAndStudents: false,
      canEditAdminOnlyFields: false,
      staffId: "S1",
    });
  });

  it("Trưởng phòng: học phí + học sinh, không gia sư/lương", () => {
    expect(
      resolveClassWriteAccess({ isAdmin: false, staffRoles: ["sale_customer_care_head"] }),
    ).toMatchObject({
      canWriteClassInfo: true,
      canEditTeachersAndPay: false,
      canEditTuitionAndStudents: true,
      canEditAdminOnlyFields: false,
    });
  });

  it("kiêm hai role trưởng: hợp hai phần, vẫn không phần Admin", () => {
    expect(
      resolveClassWriteAccess({
        isAdmin: false,
        staffRoles: ["training_head", "sale_customer_care_head"],
      }),
    ).toMatchObject({
      canWriteClassInfo: true,
      canEditTeachersAndPay: true,
      canEditTuitionAndStudents: true,
      canEditAdminOnlyFields: false,
    });
  });

  it.each([["training"], ["accountant_income"], ["accountant_expense"], ["customer_care"], ["teacher"]])(
    "%s không tạo/sửa lớp",
    (role) => {
      expect(
        resolveClassWriteAccess({ isAdmin: false, staffRoles: [role] }).canWriteClassInfo,
      ).toBe(false);
    },
  );
});
