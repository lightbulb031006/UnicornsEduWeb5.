/**
 * Nhân sự có role này bắt buộc có ít nhất 1 thành tích, đã chọn thành tích nổi bật
 * và dòng nổi bật có ảnh minh chứng (khớp `hasRequiredStaffAchievements` ở API).
 */
export const ACHIEVEMENT_REQUIRED_STAFF_ROLE = "teacher";

type StaffAchievementRequirementInput = {
  roles?: string[] | null;
  achievementCount?: number | null;
  hasHighlightAchievement?: boolean | null;
  hasHighlightAchievementProof?: boolean | null;
} | null | undefined;

/**
 * Phần thành tích gia sư còn thiếu: chưa có thành tích nào, chưa tích sao, hoặc
 * dòng tích sao chưa có ảnh minh chứng (gắn sao trước, minh chứng sau).
 */
export type StaffAchievementGap =
  | "achievement"
  | "highlight"
  | "highlightProof"
  | null;

/**
 * API cũ không trả `achievementCount` / `hasHighlightAchievement` /
 * `hasHighlightAchievementProof` thì không chặn
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
  if (staffInfo.hasHighlightAchievementProof === false) {
    return "highlightProof";
  }
  return null;
}

export function isMissingRequiredStaffAchievement(
  staffInfo: StaffAchievementRequirementInput,
): boolean {
  return getStaffAchievementGap(staffInfo) !== null;
}
