import type { FullProfileDto } from "@/dtos/profile.dto";

export function canViewCrossStaffRoleDetail(
  profile: FullProfileDto | null | undefined,
  staffId: string | null | undefined,
): boolean {
  if (!staffId?.trim()) {
    return false;
  }

  if (profile?.roleType === "admin") {
    return true;
  }

  if (profile?.roleType !== "staff") {
    return false;
  }

  const roles = profile.staffInfo?.roles ?? [];
  // #267: Trợ lí không còn xem trợ cấp của nhân sự khác.
  return roles.includes("accountant_expense");
}
