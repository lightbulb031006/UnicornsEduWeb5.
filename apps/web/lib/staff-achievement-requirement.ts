/**
 * Nhân sự có role này bắt buộc có ít nhất 1 thành tích và đã chọn thành tích nổi bật
 * (khớp `hasRequiredStaffAchievements` ở API).
 */
export const ACHIEVEMENT_REQUIRED_STAFF_ROLE = "teacher";

type StaffAchievementRequirementInput = {
  roles?: string[] | null;
  achievementCount?: number | null;
  hasHighlightAchievement?: boolean | null;
} | null | undefined;

/** Phần thành tích gia sư còn thiếu: chưa có thành tích nào, hoặc chưa tích sao. */
export type StaffAchievementGap = "achievement" | "highlight" | null;

/**
 * API cũ không trả `achievementCount` / `hasHighlightAchievement` thì không chặn
 * ở client — gate gốc vẫn là `staffProfileComplete` từ API.
 */
export function getStaffAchievementGap(
  staffInfo: StaffAchievementRequirementInput,
): StaffAchievementGap {
  if (!staffInfo?.roles?.includes(ACHIEVEMENT_REQUIRED_STAFF_ROLE)) {
    return null;
  }
  if (
    typeof staffInfo.achievementCount === "number" &&
    staffInfo.achievementCount < 1
  ) {
    return "achievement";
  }
  if (staffInfo.hasHighlightAchievement === false) {
    return "highlight";
  }
  return null;
}

export function isMissingRequiredStaffAchievement(
  staffInfo: StaffAchievementRequirementInput,
): boolean {
  return getStaffAchievementGap(staffInfo) !== null;
}
