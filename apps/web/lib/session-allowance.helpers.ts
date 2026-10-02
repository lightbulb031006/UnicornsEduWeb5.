export type SessionAllowancePreviewSource = "snapshot" | "live";

export function blockCountFromClockRange(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (typeof from !== "string" || typeof to !== "string") {
    return null;
  }
  const parse = (value: string) => {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return null;
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const start = parse(from);
  const end = parse(to);
  if (start == null || end == null) return null;
  const duration = end - start;
  if (duration <= 0 || duration % 30 !== 0) return null;
  return duration / 30;
}

export function hasSessionAllowanceSnapshots(session: {
  snapshotPerStudentAllowance?: number | null;
  snapshotScaleAmount?: number | null;
}): boolean {
  return (
    session.snapshotPerStudentAllowance != null ||
    session.snapshotScaleAmount != null
  );
}

function positiveInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

/** Live per-student amount for preview. Snapshot path already stores session-equivalent. */
export function resolveLivePreviewPerStudentAllowanceVnd(options: {
  pricingMode?: string | null;
  teacherCustomPerSession?: number | null;
  classDefaultPerSession: number;
  classDefaultPerBlock?: number | null;
  blockCount?: number | null;
}): number {
  const customRaw = options.teacherCustomPerSession;
  const custom =
    customRaw != null && Number.isFinite(Number(customRaw))
      ? Math.floor(Number(customRaw))
      : null;
  const classDefault = Math.max(0, Math.floor(options.classDefaultPerSession ?? 0));
  if (options.pricingMode !== "per_block") {
    return custom ?? classDefault;
  }

  const blocks = positiveInt(options.blockCount);
  const perBlockDefault = positiveInt(options.classDefaultPerBlock);
  if (blocks == null) {
    return custom ?? classDefault;
  }
  if (custom != null && perBlockDefault != null && classDefault > 0) {
    const standardBlocks = classDefault / perBlockDefault;
    if (standardBlocks > 0) {
      return Math.floor((custom / standardBlocks) * blocks);
    }
  }
  if (perBlockDefault != null) {
    return Math.floor(perBlockDefault * blocks);
  }
  return custom ?? classDefault;
}

/** Resolve allowance preview inputs from session snapshot or live class config. */
export function resolveSessionAllowancePreviewInputs(options: {
  session?: {
    snapshotPerStudentAllowance?: number | null;
    snapshotScaleAmount?: number | null;
  } | null;
  classDetail?: {
    allowancePerSessionPerStudent?: number;
    allowancePerBlockPerStudent?: number | null;
    scaleAmount?: number | null;
    pricingMode?: string | null;
    teachers?: Array<{ id: string; customAllowance?: number | null }>;
  } | null;
  teacherId?: string | null;
  chargeableStudentCount: number;
  blockCount?: number | null;
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
  const perStudent = resolveLivePreviewPerStudentAllowanceVnd({
    pricingMode: classDetail.pricingMode,
    teacherCustomPerSession: teacherCustom,
    classDefaultPerSession: classDetail.allowancePerSessionPerStudent ?? 0,
    classDefaultPerBlock: classDetail.allowancePerBlockPerStudent,
    blockCount: options.blockCount,
  });
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

/** Gross before CPVH/tax: applies session coefficient and class max cap (display / parity with SQL LEAST). */
export function computeTeacherSessionAllowanceGrossPreviewVnd(options: {
  rawBase: number;
  coefficient: number;
  maxAllowancePerSession?: number | null;
  maxAllowancePerBlock?: number | null;
  snapshotBlockCount?: number | null;
  pricingMode?: string | null;
}): number {
  const coeff =
    Number.isFinite(options.coefficient) &&
    options.coefficient >= 0 &&
    options.coefficient <= 1
      ? options.coefficient
      : 1;
  const base = Math.floor(Math.max(0, options.rawBase) * coeff);
  const blocks =
    typeof options.snapshotBlockCount === "number" &&
    Number.isFinite(options.snapshotBlockCount) &&
    options.snapshotBlockCount > 0
      ? Math.floor(options.snapshotBlockCount)
      : null;
  if (options.pricingMode === "per_block" && blocks != null) {
    const maxPerBlock = options.maxAllowancePerBlock;
    if (maxPerBlock != null && maxPerBlock > 0) {
      return Math.min(Math.floor(maxPerBlock) * blocks, base);
    }
    return base;
  }
  const maxCap = options.maxAllowancePerSession;
  if (maxCap != null && maxCap > 0) {
    return Math.min(maxCap, base);
  }
  return base;
}

/** Convert gross (pre-CPVH/tax) back to `allowanceAmount` raw base for API persistence. */
export function grossAllowanceToRawBaseVnd(
  gross: number,
  coefficient: number,
): number {
  const safeGross = Math.max(0, Math.floor(gross));
  if (coefficient <= 0) return 0;
  return Math.ceil(safeGross / coefficient);
}

/** Gross from persisted `allowanceAmount` (raw base) for form display. */
export function rawBaseToGrossAllowanceVnd(options: {
  rawBase: number;
  coefficient: number;
  maxAllowancePerSession?: number | null;
  maxAllowancePerBlock?: number | null;
  snapshotBlockCount?: number | null;
  pricingMode?: string | null;
}): number {
  return computeTeacherSessionAllowanceGrossPreviewVnd(options);
}
