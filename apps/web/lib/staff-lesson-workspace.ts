import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";

export type StaffLessonWorkspacePolicy =
  | "admin"
  | "lesson_plan_head"
  | "lesson_plan"
  | "accountant";

export type StaffLessonEndpointAccessMode =
  | "manage"
  | "account"
  | "participant";

export type StaffLessonWorkspaceAccess = {
  workspacePolicy: StaffLessonWorkspacePolicy | null;
  participantMode: boolean;
  canAccessWorkspace: boolean;
  canAccessTaskDetail: boolean;
  canAccessManageDetails: boolean;
  workAccessMode: StaffLessonEndpointAccessMode | null;
  createOutputAccessMode: Exclude<StaffLessonEndpointAccessMode, "account"> | null;
  /**
   * #279: xoá đầu việc / sản phẩm và mọi tài liệu — Admin + Trưởng ban Chuyên môn.
   * Người tạo tài liệu vẫn tự sửa/xoá tài liệu của mình (follow-up Nhóm 3).
   */
  canDeleteLessonWork: boolean;
  /**
   * Sửa bậc độ khó / level / hạng mục của output **người khác** — Admin + Trưởng ban
   * Chuyên môn. Output của chính mình: tự khai khi chưa thanh toán
   * (`lib/lesson-output-pricing-access.ts`).
   */
  canSetLessonOutputPricing: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isAccountantExpense: boolean;
  isLessonPlan: boolean;
  isLessonPlanHead: boolean;
};

export function resolveStaffLessonWorkspace(
  profile?: FullProfileDto | UserInfoDto | null,
): StaffLessonWorkspaceAccess {
  const staffRoles = Array.isArray((profile as UserInfoDto | undefined)?.staffRoles)
    ? (profile as UserInfoDto).staffRoles ?? []
    : (profile as FullProfileDto | undefined)?.staffInfo?.roles ?? [];
  const effectiveRoleTypes =
    (profile as UserInfoDto | undefined)?.effectiveRoleTypes ?? [];
  const hasStaffProfile =
    typeof (profile as UserInfoDto | undefined)?.hasStaffProfile === "boolean"
      ? Boolean((profile as UserInfoDto).hasStaffProfile)
      : Boolean((profile as FullProfileDto | undefined)?.staffInfo?.id);
  const isAdmin =
    profile?.roleType === "admin" ||
    staffRoles.includes("admin") ||
    (profile as UserInfoDto | undefined)?.access?.admin?.tier === "full";
  const isStaff =
    profile?.roleType === "staff" ||
    effectiveRoleTypes.includes(Role.staff) ||
    (hasStaffProfile && profile?.roleType !== "guest");
  const isAssistant = isStaff && hasSaleCsHeadAccess(staffRoles);
  const isLessonPlanHead = isStaff && staffRoles.includes("lesson_plan_head");
  const isLessonPlan = isStaff && staffRoles.includes("lesson_plan");
  const isAccountantExpense =
    isStaff && staffRoles.includes("accountant_expense");
  const isAccountant = isAccountantExpense;

  // #267: Trợ lí không còn quyền quản lý giáo án (backend lesson-management.guard).
  const workspacePolicy: StaffLessonWorkspacePolicy | null = isAdmin
    ? "admin"
    : isLessonPlanHead
      ? "lesson_plan_head"
      : isLessonPlan
        ? "lesson_plan"
        : isAccountant
          ? "accountant"
          : null;
  const workAccessMode: StaffLessonEndpointAccessMode | null =
    isAdmin || isLessonPlanHead
      ? "manage"
      : isAccountant
        ? "account"
        : isLessonPlan
          ? "participant"
          : null;
  const createOutputAccessMode: Exclude<
    StaffLessonEndpointAccessMode,
    "account"
  > | null =
    isAdmin || isLessonPlanHead
      ? "manage"
      : isLessonPlan
        ? "participant"
        : null;

  return {
    workspacePolicy,
    participantMode: workspacePolicy === "lesson_plan",
    canAccessWorkspace: workspacePolicy !== null,
    canAccessTaskDetail:
      workspacePolicy === "admin" ||
      workspacePolicy === "lesson_plan_head" ||
      workspacePolicy === "lesson_plan" ||
      workspacePolicy === "accountant",
    canAccessManageDetails:
      workspacePolicy === "admin" || workspacePolicy === "lesson_plan_head",
    workAccessMode,
    createOutputAccessMode,
    canDeleteLessonWork:
      workspacePolicy === "admin" || workspacePolicy === "lesson_plan_head",
    canSetLessonOutputPricing:
      workspacePolicy === "admin" || workspacePolicy === "lesson_plan_head",
    isAssistant,
    isAccountant,
    isAccountantExpense,
    isLessonPlan,
    isLessonPlanHead,
  };
}
