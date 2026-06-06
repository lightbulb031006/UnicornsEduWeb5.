export type SessionAllowancePreviewSource = "snapshot" | "live";

export function hasSessionAllowanceSnapshots(session: {
  snapshotPerStudentAllowance?: number | null;
  snapshotScaleAmount?: number | null;
}): boolean {
  return (
    session.snapshotPerStudentAllowance != null ||
    session.snapshotScaleAmount != null
  );
}

/** Resolve allowance preview inputs from session snapshot or live class config. */
export function resolveSessionAllowancePreviewInputs(options: {
  session?: {
    snapshotPerStudentAllowance?: number | null;
    snapshotScaleAmount?: number | null;
  } | null;
  classDetail?: {
    allowancePerSessionPerStudent?: number;
    scaleAmount?: number | null;
    teachers?: Array<{ id: string; customAllowance?: number | null }>;
  } | null;
  teacherId?: string | null;
  chargeableStudentCount: number;
}): {
  source: SessionAllowancePreviewSource;
  perStudent: number;
  scaleAmount: number;
  rawBase: number;
} | null {
  const { session, classDetail, teacherId, chargeableStudentCount } = options;

  if (session && hasSessionAllowanceSnapshots(session)) {
    const perStudent = session.snapshotPerStudentAllowance ?? 0;
    const scaleAmount = session.snapshotScaleAmount ?? 0;
    return {
      source: "snapshot",
      perStudent,
      scaleAmount,
      rawBase: computeSessionAllowanceRawBaseVnd({
        allowancePerStudent: perStudent,
        chargeableStudentCount,
        scaleAmount,
      }),
    };
  }

  if (!classDetail) return null;

  const teacherCustom = teacherId
    ? classDetail.teachers?.find((teacher) => teacher.id === teacherId)
        ?.customAllowance
    : null;
  const perStudent =
    teacherCustom != null && Number.isFinite(Number(teacherCustom))
      ? Math.floor(Number(teacherCustom))
      : (classDetail.allowancePerSessionPerStudent ?? 0);
  const scaleAmount = classDetail.scaleAmount ?? 0;

  return {
    source: "live",
    perStudent,
    scaleAmount,
    rawBase: computeSessionAllowanceRawBaseVnd({
      allowancePerStudent: perStudent,
      chargeableStudentCount,
      scaleAmount,
    }),
  };
}

export function formatSessionAllowanceBreakdownVnd(options: {
  perStudent: number;
  chargeableStudentCount: number;
  scaleAmount: number;
  rawBase: number;
}): string {
  const per = Math.max(0, Math.floor(options.perStudent));
  const count = Math.max(0, Math.floor(options.chargeableStudentCount));
  const scale = Math.max(0, Math.floor(options.scaleAmount));
  const raw = Math.max(0, Math.floor(options.rawBase));
  return `${per.toLocaleString("vi-VN")}đ/hs × ${count} hs + ${scale.toLocaleString("vi-VN")}đ = ${raw.toLocaleString("vi-VN")}đ`;
}

/** Pre-coefficient snapshot stored as / sent as `allowanceAmount` (VND, floored). */
export function computeSessionAllowanceRawBaseVnd(options: {
  allowancePerStudent: number;
  chargeableStudentCount: number;
  scaleAmount?: number | null;
}): number {
  const scale = Math.max(0, Math.floor(Number(options.scaleAmount ?? 0)));
  const per = Math.max(0, Number(options.allowancePerStudent));
  const count = Math.max(0, Math.floor(options.chargeableStudentCount));
  if (!Number.isFinite(per)) {
    return scale;
  }
  return Math.floor(per * count + scale);
}

/** Gross before tax/operating: applies session coefficient and class max cap (display / parity with SQL LEAST). */
export function computeTeacherSessionAllowanceGrossPreviewVnd(options: {
  rawBase: number;
  coefficient: number;
  maxAllowancePerSession?: number | null;
}): number {
  const coeff =
    Number.isFinite(options.coefficient) &&
    options.coefficient >= 0 &&
    options.coefficient <= 1
      ? options.coefficient
      : 1;
  const base = Math.floor(Math.max(0, options.rawBase) * coeff);
  const maxCap = options.maxAllowancePerSession;
  if (maxCap != null && maxCap > 0) {
    return Math.min(maxCap, base);
  }
  return base;
}
