import { describe, expect, it } from "vitest";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import {
  ASSISTANT_VISIBLE_HREFS,
  canAccessAdminShellRoute,
  canManageAdminExtraAllowance,
  getAdminShellEntryHref,
  resolveAdminShellAccess,
  resolveAdminShellFallbackHref,
  resolveStudentAdminCapabilities,
  resolveUserAdminCapabilities,
} from "./admin-shell-access";

function staffProfile(staffRoles: string[]): UserInfoDto {
  return {
    roleType: "staff",
    staffRoles,
    hasStaffProfile: true,
    staffProfileComplete: true,
  } as unknown as UserInfoDto;
}

const ADMIN_ONLY_REPORT_ROUTES = [
  "/admin",
  "/admin/dashboard",
  "/admin/dashboard/statistics",
  "/admin/monthly-report",
  "/admin/student-statistics",
];

describe("Dashboard / Báo cáo tháng / Thống kê học sinh chỉ Admin (#269)", () => {
  it.each([
    ["Trợ lí / TP Sale & CSKH", ["sale_customer_care_head"]],
    ["Kế toán thu", ["accountant_income"]],
    ["Kế toán chi", ["accountant_expense"]],
    ["Trợ lí kiêm Kế toán thu", ["sale_customer_care_head", "accountant_income"]],
  ])("từ chối %s", (_label, roles) => {
    const access = resolveAdminShellAccess(staffProfile(roles));
    for (const route of ADMIN_ONLY_REPORT_ROUTES) {
      expect(canAccessAdminShellRoute(access, route)).toBe(false);
    }
  });

  it("cho phép users.role_type admin và staff có role admin", () => {
    const accesses = [
      resolveAdminShellAccess({ roleType: "admin" } as unknown as UserInfoDto),
      resolveAdminShellAccess(staffProfile(["admin"])),
    ];
    for (const access of accesses) {
      for (const route of ADMIN_ONLY_REPORT_ROUTES) {
        expect(canAccessAdminShellRoute(access, route)).toBe(true);
      }
    }
  });

  it("Trợ lí không bị đưa về dashboard admin", () => {
    const profile = staffProfile(["sale_customer_care_head"]);
    const access = resolveAdminShellAccess(profile);
    expect(getAdminShellEntryHref(profile)).toBe("/admin/students");
    expect(resolveAdminShellFallbackHref(access, "/admin/dashboard")).toBe(
      "/admin/students",
    );
  });

  it("Kế toán thu vẫn vào được lớp học / học sinh", () => {
    const access = resolveAdminShellAccess(staffProfile(["accountant_income"]));
    expect(canAccessAdminShellRoute(access, "/admin/classes")).toBe(true);
    expect(canAccessAdminShellRoute(access, "/admin/students")).toBe(true);
  });
});

describe("Trang quản trị mặc định đóng (#267)", () => {
  const ASSISTANT_ALLOWED_ROUTES = [
    "/admin/students",
    "/admin/students/student-1",
    "/admin/notification",
    // #272: Trưởng phòng xem lớp.
    "/admin/classes",
    "/admin/classes/class-1",
  ];
  const ASSISTANT_DENIED_ROUTES = [
    "/admin/users",
    "/admin/users/user-1",
    "/admin/staffs",
    "/admin/staffs/staff-1",
    "/admin/classes/class-1/sessions",
    "/admin/costs",
    "/admin/extra-allowances",
    "/admin/system-settings",
    "/admin/deductions",
    "/admin/notes-subject",
    "/admin/courses",
    "/admin/courses/course-1",
    "/admin/lesson-plans",
    "/admin/calendar",
    "/admin/history",
    "/admin/wallet-direct-topup-requests",
    "/admin/some-future-page",
  ];

  it("Trợ lí chỉ vào được Học sinh, Lớp học (#272) và Thông báo", () => {
    const access = resolveAdminShellAccess(staffProfile(["sale_customer_care_head"]));
    for (const route of ASSISTANT_ALLOWED_ROUTES) {
      expect(canAccessAdminShellRoute(access, route), route).toBe(true);
    }
    for (const route of ASSISTANT_DENIED_ROUTES) {
      expect(canAccessAdminShellRoute(access, route), route).toBe(false);
    }
  });

  it("Admin vẫn vào được mọi trang", () => {
    const access = resolveAdminShellAccess(staffProfile(["admin"]));
    for (const route of [
      ...ASSISTANT_ALLOWED_ROUTES,
      ...ASSISTANT_DENIED_ROUTES,
    ]) {
      expect(canAccessAdminShellRoute(access, route), route).toBe(true);
    }
  });

  it("menu Trợ lí: Học sinh, Lớp học (#272), Thông báo", () => {
    expect([...ASSISTANT_VISIBLE_HREFS].sort()).toEqual([
      "/admin/classes",
      "/admin/notification",
      "/admin/students",
    ]);
  });

  it("Trợ lí không quản lý tài khoản / trợ cấp thêm; sửa được học phí riêng HS (#272)", () => {
    const assistantProfile = staffProfile(["sale_customer_care_head"]);
    const assistantUsers = resolveUserAdminCapabilities(assistantProfile);
    expect(assistantUsers.canManageUsers).toBe(false);
    expect(assistantUsers.canDeleteUser).toBe(false);
    expect(
      canManageAdminExtraAllowance(resolveAdminShellAccess(assistantProfile)),
    ).toBe(false);
    expect(
      resolveStudentAdminCapabilities(assistantProfile)
        .canEditStudentClassTuition,
    ).toBe(true);

    const adminProfile = staffProfile(["admin"]);
    const adminUsers = resolveUserAdminCapabilities(adminProfile);
    expect(adminUsers.canManageUsers).toBe(true);
    expect(adminUsers.canDeleteUser).toBe(true);
    expect(
      canManageAdminExtraAllowance(resolveAdminShellAccess(adminProfile)),
    ).toBe(true);
    expect(
      resolveStudentAdminCapabilities(adminProfile).canEditStudentClassTuition,
    ).toBe(true);
  });

  it("Trợ lí giữ thao tác học sinh và ví (trừ nạp thẳng)", () => {
    const caps = resolveStudentAdminCapabilities(staffProfile(["sale_customer_care_head"]));
    expect(caps.canDeleteStudent).toBe(true);
    expect(caps.canDirectlyWithdrawWallet).toBe(true);
    expect(caps.canRequestDirectTopUp).toBe(true);
    expect(caps.canDirectlyAdjustWallet).toBe(false);
  });

  it("Tạo học sinh trên trang Học sinh: chỉ Trưởng phòng Sale & CSKH (15/11)", () => {
    expect(
      resolveStudentAdminCapabilities(staffProfile(["sale_customer_care_head"]), "/staff")
        .canCreateStudent,
    ).toBe(true);
    for (const roles of [["customer_care"], ["accountant_income"], ["training_head"]]) {
      expect(
        resolveStudentAdminCapabilities(staffProfile(roles), "/staff").canCreateStudent,
      ).toBe(false);
    }
  });

  it("#272: học phí riêng HS — Kế toán thu sửa, Kế toán chi không", () => {
    expect(
      resolveStudentAdminCapabilities(staffProfile(["accountant_income"]))
        .canEditStudentClassTuition,
    ).toBe(true);
    expect(
      resolveStudentAdminCapabilities(staffProfile(["accountant_expense"]))
        .canEditStudentClassTuition,
    ).toBe(false);
  });

  it("Kế toán thu xem lịch sử ví học sinh, Kế toán chi không (quyết định 13/11)", () => {
    expect(
      resolveStudentAdminCapabilities(staffProfile(["accountant_income"]))
        .canViewWalletHistory,
    ).toBe(true);
    expect(
      resolveStudentAdminCapabilities(staffProfile(["accountant_expense"]))
        .canViewWalletHistory,
    ).toBe(false);
  });

  it("Kế toán vẫn giữ phạm vi cũ", () => {
    const income = resolveAdminShellAccess(staffProfile(["accountant_income"]));
    expect(canAccessAdminShellRoute(income, "/admin/classes")).toBe(true);
    const expense = resolveAdminShellAccess(
      staffProfile(["accountant_expense"]),
    );
    expect(canAccessAdminShellRoute(expense, "/admin/costs")).toBe(true);
    expect(canManageAdminExtraAllowance(expense)).toBe(true);
  });

  it("Kế toán thu không vào trang trợ cấp kế toán / hồ sơ nhân sự (#270)", () => {
    const income = resolveAdminShellAccess(staffProfile(["accountant_income"]));
    expect(canAccessAdminShellRoute(income, "/admin/accountant_detail")).toBe(
      false,
    );
    expect(canAccessAdminShellRoute(income, "/admin/staffs")).toBe(false);
    expect(canAccessAdminShellRoute(income, "/admin/staffs/staff-1")).toBe(
      false,
    );
  });

  it("Kế toán thu kiêm Kế toán chi nhận hợp quyền (#270)", () => {
    const both = resolveAdminShellAccess(
      staffProfile(["accountant_income", "accountant_expense"]),
    );
    expect(canAccessAdminShellRoute(both, "/admin/accountant_detail")).toBe(
      true,
    );
    expect(canAccessAdminShellRoute(both, "/admin/students")).toBe(true);
    expect(canAccessAdminShellRoute(both, "/admin/staffs/staff-1")).toBe(true);
  });
});
