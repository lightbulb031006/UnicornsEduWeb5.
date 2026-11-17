import { describe, expect, it } from "vitest";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import { resolveStaffShellRouteAccess } from "./staff-shell-access";
import { buildStaffRoleDetailHref } from "./admin-shell-paths";

function staffProfile(staffRoles: string[]): UserInfoDto {
  return {
    roleType: "staff",
    staffRoles,
    hasStaffProfile: true,
    staffProfileComplete: true,
  } as unknown as UserInfoDto;
}

describe("route thu nhập Đào Tạo / Trưởng ban Đào tạo", () => {
  it("training_head thuần vào /staff/training-head-detail, không vào /staff/training-detail", () => {
    const profile = staffProfile(["training_head"]);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/training-head-detail")
        .isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/training-detail").isAllowed,
    ).toBe(false);
  });

  it("training thuần không vào trang của Trưởng ban", () => {
    const profile = staffProfile(["training"]);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/training-detail").isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/training-head-detail")
        .isAllowed,
    ).toBe(false);
  });

  it("training_head vẫn có quyền Ban Đào Tạo (lịch, hồ sơ gia sư)", () => {
    const profile = staffProfile(["training_head"]);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/calendar").isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/staffs").isAllowed,
    ).toBe(true);
  });

  it("link chi tiết role training_head", () => {
    expect(buildStaffRoleDetailHref("/admin", "training_head", "S1")).toBe(
      "/admin/training_head_detail?staffId=S1",
    );
    expect(buildStaffRoleDetailHref("/staff", "training_head", "S1")).toBe(
      "/staff/training-head-detail?staffId=S1",
    );
  });
});

describe("Báo cáo tháng / Thống kê học sinh chỉ Admin (#269)", () => {
  const REPORT_ROUTES = ["/staff/monthly-report", "/staff/student-statistics"];

  it.each([
    ["Trợ lí / TP Sale & CSKH", ["sale_customer_care_head"]],
    ["Kế toán thu", ["accountant_income"]],
    ["Kế toán chi", ["accountant_expense"]],
    [
      "Trợ lí kiêm Kế toán thu",
      ["sale_customer_care_head", "accountant_income"],
    ],
    ["CSKH", ["customer_care"]],
  ])("từ chối %s", (_label, roles) => {
    const profile = staffProfile(roles);
    for (const route of REPORT_ROUTES) {
      expect(resolveStaffShellRouteAccess(profile, route).isAllowed).toBe(
        false,
      );
    }
  });

  it("cho phép staff có role admin", () => {
    const profile = staffProfile(["admin"]);
    for (const route of REPORT_ROUTES) {
      expect(resolveStaffShellRouteAccess(profile, route).isAllowed).toBe(true);
    }
  });
});

describe("Trợ lí trong staff shell chỉ còn Học sinh, Lớp học và Thông báo (#267, #272)", () => {
  const ASSISTANT_ALLOWED_ROUTES = [
    "/staff",
    "/staff/profile",
    "/staff/students",
    "/staff/students/student-1",
    // #272: Trưởng phòng xem mọi lớp (không lương gia sư).
    "/staff/classes",
    "/staff/classes/class-1",
    "/staff/notification",
    "/staff/notification/manage",
    "/staff/assistant-detail",
    // Danh sách + hồ sơ đội Sale & CSKH (thay `/staff/sale-cs-team`).
    "/staff/staffs",
    "/staff/staffs/UNISTAFF-1",
  ];
  const ASSISTANT_DENIED_ROUTES = [
    "/staff/dashboard",
    "/staff/users",
    "/staff/system-settings",
    "/staff/deductions",
    "/staff/costs",
    "/staff/history",
    "/staff/calendar",
    "/staff/surveys",
    "/staff/courses",
    "/staff/lesson-plans",
    "/staff/lesson-plans/tasks/task-1",
    "/staff/lesson-manage-details",
    "/staff/lesson-plan-detail/staff-1",
    "/staff/accountant-detail",
    "/staff/communication-detail",
    "/staff/technical-detail",
    "/staff/training-detail",
    "/staff/training-head-detail",
    "/staff/sale-detail",
  ];

  it("cho Trợ lí vào Học sinh, Lớp học, Thông báo và trang cá nhân", () => {
    const profile = staffProfile(["sale_customer_care_head"]);
    for (const route of ASSISTANT_ALLOWED_ROUTES) {
      expect(
        resolveStaffShellRouteAccess(profile, route).isAllowed,
        route,
      ).toBe(true);
    }
  });

  it("từ chối Trợ lí ở mọi màn quản trị khác", () => {
    const profile = staffProfile(["sale_customer_care_head"]);
    for (const route of ASSISTANT_DENIED_ROUTES) {
      expect(
        resolveStaffShellRouteAccess(profile, route).isAllowed,
        route,
      ).toBe(false);
    }
  });

  it("staff có role admin vẫn vào được các màn đó", () => {
    const profile = staffProfile(["admin"]);
    for (const route of ASSISTANT_DENIED_ROUTES) {
      expect(
        resolveStaffShellRouteAccess(profile, route).isAllowed,
        route,
      ).toBe(true);
    }
  });

  it("Kế toán chi vẫn giữ Chi phí / Nhân sự", () => {
    const profile = staffProfile(["accountant_expense"]);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/costs").isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/staffs").isAllowed,
    ).toBe(true);
  });

  it("Trợ lí kiêm role khác giữ quyền của role đó", () => {
    const profile = staffProfile([
      "sale_customer_care_head",
      "accountant_income",
    ]);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/classes").isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/accountant-detail")
        .isAllowed,
    ).toBe(true);
    expect(
      resolveStaffShellRouteAccess(profile, "/staff/costs").isAllowed,
    ).toBe(false);
  });
});

describe("Danh sách nhân sự /staff/staffs cho Trưởng phòng Sale & CSKH (#271)", () => {
  const TEAM_ROUTES = ["/staff/staffs"];

  it.each(TEAM_ROUTES)("Trưởng phòng vào được %s", (route) => {
    expect(
      resolveStaffShellRouteAccess(
        staffProfile(["sale_customer_care_head"]),
        route,
      ).isAllowed,
    ).toBe(true);
  });

  // Ban Đào Tạo cũng vào `/staff/staffs` nhưng thấy danh sách gia sư của mình
  // (khối test "Hồ sơ nhân sự … cho các trưởng" bên dưới).
  it.each([["customer_care"], ["sale"]])("role %s không vào được", (role) => {
    for (const route of TEAM_ROUTES) {
      expect(
        resolveStaffShellRouteAccess(staffProfile([role]), route).isAllowed,
      ).toBe(false);
    }
  });

  it("Trưởng phòng vẫn mở được chi tiết CSKH của thành viên", () => {
    expect(
      resolveStaffShellRouteAccess(
        staffProfile(["sale_customer_care_head"]),
        "/staff/customer-care-detail/UNISTAFF-1",
      ).isAllowed,
    ).toBe(true);
  });
});

describe("Hồ sơ nhân sự /staff/staffs/:id cho các trưởng", () => {
  const DETAIL = "/staff/staffs/UNISTAFF-1";

  it.each([
    ["sale_customer_care_head"],
    ["training"],
    ["training_head"],
    ["accountant_expense"],
  ])("role %s vào được trang chi tiết", (role) => {
    expect(
      resolveStaffShellRouteAccess(staffProfile([role]), DETAIL).isAllowed,
    ).toBe(true);
  });

  it.each([["training"], ["training_head"], ["lesson_plan_head"]])(
    "role %s vào danh sách /staff/staffs (thay /staff/tutors cũ; Trưởng ban Chuyên môn để tạo nhân sự)",
    (role) => {
      expect(
        resolveStaffShellRouteAccess(staffProfile([role]), "/staff/staffs")
          .isAllowed,
      ).toBe(true);
    },
  );

  it.each([["teacher"], ["lesson_plan"], ["customer_care"]])(
    "role %s không vào danh sách /staff/staffs",
    (role) => {
      expect(
        resolveStaffShellRouteAccess(staffProfile([role]), "/staff/staffs")
          .isAllowed,
      ).toBe(false);
    },
  );

  it.each([["customer_care"], ["sale"], ["teacher"], ["lesson_plan_head"]])(
    "role %s không vào trang chi tiết",
    (role) => {
      expect(
        resolveStaffShellRouteAccess(staffProfile([role]), DETAIL).isAllowed,
      ).toBe(false);
    },
  );
});

describe("hàng chờ duyệt nạp thẳng trong staff shell (14/11)", () => {
  const QUEUE = "/staff/wallet-direct-topup-requests";

  it("Trưởng phòng Sale & CSKH vào được", () => {
    expect(
      resolveStaffShellRouteAccess(
        staffProfile(["sale_customer_care_head"]),
        QUEUE,
      ).isAllowed,
    ).toBe(true);
  });

  it.each([
    ["customer_care"],
    ["accountant_income"],
    ["accountant_expense"],
    ["teacher"],
    ["training_head"],
  ])("%s không vào được", (role) => {
    expect(
      resolveStaffShellRouteAccess(staffProfile([role]), QUEUE).isAllowed,
    ).toBe(false);
  });
});
