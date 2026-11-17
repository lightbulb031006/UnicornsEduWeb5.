import type { ClassTeacher } from "@/dtos/class.dto";

/** Mức mặc định của lớp mà Quản lý lớp không được sửa vì chạm lương của chính mình. */
export interface OwnPayLockedClassDefaults {
  allowance: boolean;
  maxAllowance: boolean;
  scale: boolean;
}

/**
 * #276 — khớp BE `findOwnPayFieldsInTeacherPayUpdate`: khi actor đang dạy lớp
 * (phân công chưa nghỉ), mức mặc định của lớp mà dòng của actor đang kế thừa
 * là lương của chính họ → khoá.
 * - Trợ cấp / HS: khoá khi actor không có trợ cấp riêng.
 * - Trần: luôn khoá (áp cho mọi gia sư của lớp).
 * - Scale: khoá khi actor không có scale riêng.
 * Admin không dùng popup này (actor `null` → không khoá gì).
 */
export function resolveOwnPayLockedClassDefaults(
  teachers: readonly ClassTeacher[] | null | undefined,
  actorStaffId: string | null | undefined,
): OwnPayLockedClassDefaults {
  const own = actorStaffId
    ? (teachers ?? []).find((teacher) => teacher.id === actorStaffId)
    : undefined;
  if (!own || own.assignmentStatus === "inactive") {
    return { allowance: false, maxAllowance: false, scale: false };
  }
  return {
    allowance: own.customAllowance == null,
    maxAllowance: true,
    scale: own.customScaleAmount == null,
  };
}
