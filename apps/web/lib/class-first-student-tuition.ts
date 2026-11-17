import type { ClassDetail } from "@/dtos/class.dto";

/**
 * #273 — Lớp chưa có học sinh đang học chỉ nhận học sinh đầu tiên khi đã có
 * **Học phí lớp** theo cách thu đang chọn. Khớp
 * `apps/api/src/common/class-first-student-tuition.ts` (backend là nơi chặn
 * thật; web dùng để mở popup Học phí lớp trước).
 *
 * - Theo buổi / theo gói buổi: học phí / buổi, hoặc gói lớp suy ra được học phí / buổi.
 * - Theo 30 phút: học phí / 30 phút, hoặc chuỗi theo buổi ở trên.
 * - Trọn gói (bán một lần): tổng gói > 0đ.
 *
 * `0` là đã điền; `null`/`undefined` là chưa điền.
 */
export const CLASS_TUITION_REQUIRED_MESSAGE =
  "Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.";

type ClassTuitionFields = Pick<
  ClassDetail,
  | "pricingMode"
  | "studentTuitionPerSession"
  | "studentTuitionPerBlock"
  | "tuitionPackageTotal"
  | "tuitionPackageSession"
>;

function isFilledMoney(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasDerivedPackageTuition(
  total: number | null | undefined,
  sessions: number | null | undefined,
): boolean {
  if (total === 0) return true;
  return isFilledMoney(total) && isFilledMoney(sessions) && sessions > 0;
}

export function hasClassTuitionForPricingMode(classDetail: ClassTuitionFields): boolean {
  if (classDetail.pricingMode === "one_time") {
    // Gói bán một lần là khoản thu ở buổi đầu: phải > 0đ (follow-up grill 13/11).
    return isFilledMoney(classDetail.tuitionPackageTotal) && classDetail.tuitionPackageTotal > 0;
  }

  const hasPerSessionChain =
    isFilledMoney(classDetail.studentTuitionPerSession) ||
    hasDerivedPackageTuition(classDetail.tuitionPackageTotal, classDetail.tuitionPackageSession);

  if (classDetail.pricingMode === "per_block") {
    return isFilledMoney(classDetail.studentTuitionPerBlock) || hasPerSessionChain;
  }
  return hasPerSessionChain;
}

/** Thêm học sinh lúc này có phải điền Học phí lớp trước không. */
export function needsClassTuitionBeforeFirstStudent(
  classDetail: ClassTuitionFields,
  activeStudentCount: number,
): boolean {
  return activeStudentCount === 0 && !hasClassTuitionForPricingMode(classDetail);
}
