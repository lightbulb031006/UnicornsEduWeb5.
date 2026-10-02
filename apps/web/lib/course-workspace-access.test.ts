import { describe, expect, it } from "vitest";
import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import {
  resolveCourseWorkspaceCapabilities,
  resolveCourseWorkspaceTab,
} from "@/lib/course-workspace-access";

function staffProfile(roles: string[], extra?: Partial<UserInfoDto>): UserInfoDto {
  const isHead = roles.includes("lesson_plan_head");
  const isAssistant = roles.includes("assistant");
  const isAdmin = roles.includes("admin");
  return {
    id: "staff-1",
    accountHandle: "staff",
    roleType: Role.staff,
    requiresPasswordSetup: false,
    staffRoles: roles,
    hasStaffProfile: true,
    effectiveRoleTypes: [Role.staff],
    access: {
      admin: {
        canAccess: isAdmin || isAssistant || isHead,
        tier: isAdmin
          ? "full"
          : isAssistant
            ? "assistant"
            : isHead
              ? "lesson_plan_head"
              : null,
      },
      staff: { canAccess: true, profileComplete: true },
      student: { canAccess: false },
    },
    ...extra,
  };
}

describe("resolveCourseWorkspaceCapabilities", () => {
  it("gives admin all tabs and mutate flags on /admin; hrefs use routeBase only", () => {
    const caps = resolveCourseWorkspaceCapabilities(
      staffProfile(["admin"]),
      "/admin",
    );
    expect(caps.listHref).toBe("/admin/courses");
    expect(caps.detailHref("c1")).toBe("/admin/courses/c1");
    expect(caps.visibleTabIds).toEqual(["noi-dung", "cau-hoi", "cai-dat"]);
    expect(caps.canMutateCourses).toBe(true);
    expect(caps.canMutateLessonPlanTeam).toBe(true);
    expect(caps.canMutateContent).toBe(true);
  });

  it("never lets routeBase=/admin grant lesson_plan rights", () => {
    const caps = resolveCourseWorkspaceCapabilities(
      staffProfile(["lesson_plan"]),
      "/admin",
    );
    expect(caps.canEnterWorkspace).toBe(false);
    expect(caps.visibleTabIds).toEqual([]);
    expect(caps.canMutateQuestions).toBe(false);
    expect(caps.listHref).toBe("/admin/courses");
  });

  it("lets lesson_plan use content + academic tabs on /staff without course mutations", () => {
    const caps = resolveCourseWorkspaceCapabilities(
      staffProfile(["lesson_plan"]),
      "/staff",
    );
    expect(caps.listHref).toBe("/staff/courses");
    expect(caps.canEnterWorkspace).toBe(true);
    expect(caps.canViewAllCourses).toBe(false);
    expect(caps.canMutateCourses).toBe(false);
    expect(caps.canViewContentTab).toBe(true);
    expect(caps.canMutateContent).toBe(true);
    expect(caps.visibleTabIds).toEqual(["noi-dung", "cau-hoi", "cai-dat"]);
    expect(caps.canMutateQuestions).toBe(true);
    expect(caps.canMutateDifficultyLevels).toBe(true);
    expect(caps.canViewLessonPlanTeam).toBe(true);
    expect(caps.canMutateLessonPlanTeam).toBe(false);
  });

  it("lets lesson_plan_head manage every tab on /staff without being assigned", () => {
    const caps = resolveCourseWorkspaceCapabilities(
      staffProfile(["lesson_plan_head"]),
      "/staff",
    );
    expect(caps.canViewAllCourses).toBe(true);
    expect(caps.canMutateCourses).toBe(true);
    expect(caps.canViewContentTab).toBe(true);
    expect(caps.canMutateLessonPlanTeam).toBe(true);
    expect(caps.visibleTabIds).toHaveLength(3);
  });

  it("does not let /staff expand a teacher into course managers", () => {
    const caps = resolveCourseWorkspaceCapabilities(
      staffProfile(["teacher"]),
      "/staff",
    );
    expect(caps.canEnterWorkspace).toBe(false);
    expect(caps.canMutateCourses).toBe(false);
    expect(caps.visibleTabIds).toEqual([]);
  });
});

describe("resolveCourseWorkspaceTab", () => {
  it("uses the first visible tab when ?tab is missing", () => {
    expect(resolveCourseWorkspaceTab(null, ["cau-hoi", "cai-dat"])).toEqual({
      status: "missing",
      tab: "cau-hoi",
    });
  });

  it("marks unknown slugs separately from forbidden known slugs", () => {
    expect(resolveCourseWorkspaceTab("chuoi-bay-ba", ["cau-hoi"])).toEqual({
      status: "unknown",
      tab: null,
    });
    expect(resolveCourseWorkspaceTab("noi-dung", ["cau-hoi"])).toEqual({
      status: "forbidden",
      tab: null,
    });
    expect(resolveCourseWorkspaceTab("de-thi", ["noi-dung"])).toEqual({
      status: "unknown",
      tab: null,
    });
  });
});
