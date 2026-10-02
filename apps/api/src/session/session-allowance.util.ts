import { perSessionToPerBlock } from '../common/block-pricing.util';
import { isBlockPricingMode } from '../common/class-pricing-mode.util';

/** Resolved per-student allowance (custom ?? class default) at snapshot time. */
export function resolveSnapshotPerStudentAllowanceVnd(input: {
  customAllowance: number | null | undefined;
  classDefaultPerStudent: number | null | undefined;
}): number {
  const perRaw = input.customAllowance ?? input.classDefaultPerStudent ?? 0;
  const per = Number(perRaw);
  return Number.isFinite(per) && per >= 0 ? Math.floor(per) : 0;
}

function normalizePositiveBlockCount(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

/**
 * `class_teachers.custom_allowance` of a per_block class is VNĐ / student / 30 minutes.
 * After #134 it is usually already stored per-block (`storedAsPerBlock`).
 */
export function resolvePerBlockTeacherAllowanceVnd(input: {
  customAllowanceStored: number | null | undefined;
  classDefaultPerBlock: number | null | undefined;
  classDefaultPerStudent: number | null | undefined;
  storedAsPerBlock: boolean;
  blockCount: number | null | undefined;
}): number {
  if (input.storedAsPerBlock) {
    return resolveSnapshotPerStudentAllowanceVnd({
      customAllowance: input.customAllowanceStored,
      classDefaultPerStudent: input.classDefaultPerBlock,
    });
  }

  const perSession = resolveSnapshotPerStudentAllowanceVnd({
    customAllowance: input.customAllowanceStored,
    classDefaultPerStudent: input.classDefaultPerStudent,
  });
  const converted = perSessionToPerBlock(perSession, input.blockCount);
  return converted ?? perSession;
}

/** Cap used by payroll SQL (`LEAST` / `NULLIF(..., 0)`). */
export function resolveTeacherSessionAllowanceCapVnd(input: {
  pricingMode?: string | null;
  maxAllowancePerSession?: number | null;
  maxAllowancePerBlock?: number | null;
  snapshotBlockCount?: number | null;
}): number | null {
  const blocks = normalizePositiveBlockCount(input.snapshotBlockCount);
  if (isBlockPricingMode(input.pricingMode) && blocks != null) {
    const perBlock = Number(input.maxAllowancePerBlock);
    if (Number.isFinite(perBlock) && perBlock > 0) {
      return Math.floor(perBlock) * blocks;
    }
    return null;
  }

  const perSession = Number(input.maxAllowancePerSession);
  if (Number.isFinite(perSession) && perSession > 0) {
    return Math.floor(perSession);
  }
  return null;
}

export function computeTeacherSessionCappedGrossVnd(input: {
  allowanceAmount: number;
  coefficient: number;
  pricingMode?: string | null;
  maxAllowancePerSession?: number | null;
  maxAllowancePerBlock?: number | null;
  snapshotBlockCount?: number | null;
}): number {
  const coeff =
    Number.isFinite(input.coefficient) && input.coefficient >= 0
      ? input.coefficient
      : 1;
  const base = Math.floor(Math.max(0, input.allowanceAmount) * coeff);
  const cap = resolveTeacherSessionAllowanceCapVnd(input);
  if (cap != null) {
    return Math.min(cap, base);
  }
  return base;
}

export function resolveSnapshotScaleAmountVnd(
  scaleAmount: number | null | undefined,
): number {
  const scaleRaw = scaleAmount ?? 0;
  const scaleNum = Number(scaleRaw);
  return Number.isFinite(scaleNum) && scaleNum >= 0 ? Math.floor(scaleNum) : 0;
}

export function hasSessionAllowanceSnapshots(input: {
  snapshotPerStudentAllowance: number | null | undefined;
  snapshotScaleAmount: number | null | undefined;
}): boolean {
  return (
    input.snapshotPerStudentAllowance != null ||
    input.snapshotScaleAmount != null
  );
}

/**
 * Snapshot for `sessions.allowance_amount` (VND, floored): per-student allowance for the
 * session teacher × sĩ số điểm danh (present + excused) + `classes.scale_amount`.
 * Payroll SQL applies `coefficient` and the class cap on top of this snapshot
 * only — it must not add `scale_amount` again from `classes`.
 *
 * This is the per-session formula. Do not change it: per_session classes and
 * attendance recalc from stored session-equivalent snapshots must stay byte-identical.
 */
export function computeDefaultSessionAllowanceAmountVnd(input: {
  perStudentAllowance: number | null | undefined;
  classDefaultPerStudent: number | null | undefined;
  scaleAmount: number | null | undefined;
  chargeableStudentCount: number;
}): number {
  const perRaw = input.perStudentAllowance ?? input.classDefaultPerStudent ?? 0;
  const per = Number(perRaw);
  const perSafe = Number.isFinite(per) && per >= 0 ? per : 0;
  const scaleRaw = input.scaleAmount ?? 0;
  const scaleNum = Number(scaleRaw);
  const scaleSafe =
    Number.isFinite(scaleNum) && scaleNum >= 0 ? Math.floor(scaleNum) : 0;
  const n = Math.max(0, Math.floor(Number(input.chargeableStudentCount)) || 0);
  return Math.floor(perSafe * n + scaleSafe);
}

/**
 * Live allowance from class/teacher rates.
 *
 * per_block: `đơn_giá_block × sĩ_số × snapshot_block_count + scale_amount`
 * (`scale_amount` is flat per session). Missing per-block rate or block count
 * falls back to the per-session formula.
 *
 * Snapshot `snapshot_per_student_allowance` stores the **session-equivalent**
 * (`đơn_giá_block × block`) so attendance recalc can keep using
 * `computeDefaultSessionAllowanceAmountVnd` without multiplying blocks again.
 */
export function computeSessionAllowanceAmountVnd(input: {
  pricingMode?: string | null;
  perStudentAllowance?: number | null;
  classDefaultPerStudent?: number | null;
  perBlockAllowance?: number | null;
  classDefaultPerBlock?: number | null;
  storedAsPerBlock?: boolean;
  customAllowanceStored?: number | null;
  scaleAmount: number | null | undefined;
  chargeableStudentCount: number;
  blockCount?: number | null;
}): number {
  const blocks = normalizePositiveBlockCount(input.blockCount);
  if (isBlockPricingMode(input.pricingMode) && blocks != null) {
    const perBlock = resolvePerBlockTeacherAllowanceVnd({
      customAllowanceStored: input.customAllowanceStored,
      classDefaultPerBlock:
        input.perBlockAllowance ?? input.classDefaultPerBlock,
      classDefaultPerStudent: input.classDefaultPerStudent,
      storedAsPerBlock: input.storedAsPerBlock === true,
      blockCount: blocks,
    });
    const scaleRaw = input.scaleAmount ?? 0;
    const scaleNum = Number(scaleRaw);
    const scaleSafe =
      Number.isFinite(scaleNum) && scaleNum >= 0 ? Math.floor(scaleNum) : 0;
    const n = Math.max(
      0,
      Math.floor(Number(input.chargeableStudentCount)) || 0,
    );
    return Math.floor(perBlock * n * blocks + scaleSafe);
  }

  return computeDefaultSessionAllowanceAmountVnd({
    perStudentAllowance: input.perStudentAllowance,
    classDefaultPerStudent: input.classDefaultPerStudent,
    scaleAmount: input.scaleAmount,
    chargeableStudentCount: input.chargeableStudentCount,
  });
}

export function resolveLiveSessionAllowanceSnapshots(input: {
  pricingMode?: string | null;
  customAllowanceStored: number | null | undefined;
  classDefaultPerStudent: number | null | undefined;
  classDefaultPerBlock: number | null | undefined;
  scaleAmount: number | null | undefined;
  reconstructionBlocks: number | null;
  storedAsPerBlock: boolean;
  snapshotBlockCount: number | null;
  chargeableStudentCount: number;
  presentCustomAsPerSession: number | null;
}): {
  snapshotPerStudentAllowance: number;
  snapshotScaleAmount: number;
  allowanceAmount: number;
} {
  const snapshotScaleAmount = resolveSnapshotScaleAmountVnd(input.scaleAmount);
  const chargeableStudentCount = input.chargeableStudentCount;

  if (
    isBlockPricingMode(input.pricingMode) &&
    normalizePositiveBlockCount(input.snapshotBlockCount) != null
  ) {
    const allowanceAmount = computeSessionAllowanceAmountVnd({
      pricingMode: input.pricingMode,
      customAllowanceStored: input.customAllowanceStored,
      classDefaultPerBlock: input.classDefaultPerBlock,
      classDefaultPerStudent: input.classDefaultPerStudent,
      storedAsPerBlock: input.storedAsPerBlock,
      scaleAmount: snapshotScaleAmount,
      chargeableStudentCount,
      blockCount: input.snapshotBlockCount,
    });
    const perBlock = resolvePerBlockTeacherAllowanceVnd({
      customAllowanceStored: input.customAllowanceStored,
      classDefaultPerBlock: input.classDefaultPerBlock,
      classDefaultPerStudent: input.classDefaultPerStudent,
      storedAsPerBlock: input.storedAsPerBlock,
      blockCount: input.snapshotBlockCount,
    });
    const blocks = normalizePositiveBlockCount(input.snapshotBlockCount) ?? 0;
    return {
      snapshotPerStudentAllowance: Math.floor(perBlock * blocks),
      snapshotScaleAmount,
      allowanceAmount,
    };
  }

  const snapshotPerStudentAllowance = resolveSnapshotPerStudentAllowanceVnd({
    customAllowance: input.presentCustomAsPerSession,
    classDefaultPerStudent: input.classDefaultPerStudent,
  });
  return {
    snapshotPerStudentAllowance,
    snapshotScaleAmount,
    allowanceAmount: computeDefaultSessionAllowanceAmountVnd({
      perStudentAllowance: snapshotPerStudentAllowance,
      classDefaultPerStudent: null,
      scaleAmount: snapshotScaleAmount,
      chargeableStudentCount,
    }),
  };
}
