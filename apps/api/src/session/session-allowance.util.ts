/** Resolved per-student allowance (custom ?? class default) at snapshot time. */
export function resolveSnapshotPerStudentAllowanceVnd(input: {
  customAllowance: number | null | undefined;
  classDefaultPerStudent: number | null | undefined;
}): number {
  const perRaw = input.customAllowance ?? input.classDefaultPerStudent ?? 0;
  const per = Number(perRaw);
  return Number.isFinite(per) && per >= 0 ? Math.floor(per) : 0;
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
 * Payroll SQL applies `coefficient` and `max_allowance_per_session` on top of this snapshot
 * only — it must not add `scale_amount` again from `classes`.
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
