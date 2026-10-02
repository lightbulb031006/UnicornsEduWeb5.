/**
 * Live preview học phí học sinh cho buổi đang tạo.
 *
 * Mirror `resolveSessionChargeTuitionFee` phía backend: khi lớp ở chế độ
 * `per_block`, đơn giá / 30 phút thắng mọi gói —
 * `custom_tuition_per_block` → `student_tuition_per_block` — nhân với số block
 * của buổi. Thiếu đơn giá block hoặc thiếu số block thì rơi về
 * `effectiveTuitionPerSession` (chuỗi per-session backend đã resolve sẵn).
 */

function normalizeBlockRate(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

/** Override trên `student_classes`: `0` nghĩa là chưa đặt (kế thừa lớp). */
function normalizeCustomBlockRate(value: number | null | undefined): number | null {
  const n = normalizeBlockRate(value);
  return n === 0 ? null : n;
}

function normalizePositiveBlockCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export function resolveLivePreviewStudentTuitionVnd(options: {
  pricingMode?: string | null;
  customTuitionPerBlock?: number | null;
  classTuitionPerBlock?: number | null;
  effectiveTuitionPerSession?: number | null;
  blockCount?: number | null;
}): number {
  const perSession = normalizeBlockRate(options.effectiveTuitionPerSession) ?? 0;
  if (options.pricingMode !== "per_block") {
    return perSession;
  }

  const blocks = normalizePositiveBlockCount(options.blockCount);
  if (blocks == null) {
    return perSession;
  }

  const customPerBlock = normalizeCustomBlockRate(options.customTuitionPerBlock);
  if (customPerBlock != null) {
    return customPerBlock * blocks;
  }

  const classPerBlock = normalizeBlockRate(options.classTuitionPerBlock);
  if (classPerBlock != null) {
    return classPerBlock * blocks;
  }

  return perSession;
}

/** Đơn giá / 30 phút đang áp dụng cho học sinh (null khi lớp không ở chế độ block). */
export function resolvePreviewStudentBlockRateVnd(options: {
  pricingMode?: string | null;
  customTuitionPerBlock?: number | null;
  classTuitionPerBlock?: number | null;
}): number | null {
  if (options.pricingMode !== "per_block") return null;
  return (
    normalizeCustomBlockRate(options.customTuitionPerBlock) ??
    normalizeBlockRate(options.classTuitionPerBlock)
  );
}
