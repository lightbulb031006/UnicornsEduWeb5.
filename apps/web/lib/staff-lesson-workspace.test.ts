import { describe, expect, it } from "vitest";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import { resolveStaffLessonWorkspace } from "./staff-lesson-workspace";
import { canViewCrossStaffRoleDetail } from "./staff-role-detail-access";
import type { FullProfileDto } from "@/dtos/profile.dto";

function staffProfile(staffRoles: string[]): UserInfoDto {
  return {
    roleType: "staff",
    staffRoles,
    hasStaffProfile: true,
    staffProfileComplete: true,
  } as unknown as UserInfoDto;
}

function fullStaffProfile(roles: string[]): FullProfileDto {
  return {
    roleType: "staff",
    staffInfo: { id: "staff-1", roles },
  } as unknown as FullProfileDto;
}

describe("giáo án / trợ cấp nhân sự khác chỉ Admin (#267)", () => {
  it("Trợ lí không còn vào workspace giáo án", () => {
    const access = resolveStaffLessonWorkspace(staffProfile(["sale_customer_care_head"]));
    expect(access.canAccessWorkspace).toBe(false);
    expect(access.workAccessMode).toBeNull();
    expect(access.createOutputAccessMode).toBeNull();
  });

  it("Admin và Trưởng ban Chuyên môn vẫn quản lý giáo án", () => {
    expect(
      resolveStaffLessonWorkspace(staffProfile(["admin"])).workAccessMode,
    ).toBe("manage");
    expect(
      resolveStaffLessonWorkspace(staffProfile(["lesson_plan_head"]))
        .workAccessMode,
    ).toBe("manage");
  });

  it("Trợ lí không xem trợ cấp của nhân sự khác; Kế toán chi vẫn xem", () => {
    expect(
      canViewCrossStaffRoleDetail(fullStaffProfile(["sale_customer_care_head"]), "S2"),
    ).toBe(false);
    expect(
      canViewCrossStaffRoleDetail(fullStaffProfile(["accountant_expense"]), "S2"),
    ).toBe(true);
    expect(
      canViewCrossStaffRoleDetail(
        { roleType: "admin" } as unknown as FullProfileDto,
        "S2",
      ),
    ).toBe(true);
  });
});

describe("khu giáo án học sinh giỏi: xoá + cài đặt (#279)", () => {
  it("Admin và Trưởng ban Chuyên môn được xoá và sửa bậc độ khó / level / hạng mục output người khác", () => {
    for (const roles of [["admin"], ["lesson_plan_head"], ["lesson_plan", "lesson_plan_head"]]) {
      const access = resolveStaffLessonWorkspace(staffProfile(roles));
      expect(access.canDeleteLessonWork).toBe(true);
      expect(access.canSetLessonOutputPricing).toBe(true);
    }
  });

  it("Ban Chuyên môn thường, Kế toán chi và Trợ lí bị từ chối xoá và sửa chi phí output người khác", () => {
    for (const roles of [["lesson_plan"], ["accountant_expense"], ["sale_customer_care_head"]]) {
      const access = resolveStaffLessonWorkspace(staffProfile(roles));
      expect(access.canDeleteLessonWork).toBe(false);
      expect(access.canSetLessonOutputPricing).toBe(false);
    }
  });
});
