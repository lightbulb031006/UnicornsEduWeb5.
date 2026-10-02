/**
 * Shared helpers for student↔class tuition: class defaults vs optional overrides on `student_classes`.
 *
 * Custom override columns (`custom_*`) treat `0` as **unset** (inherit class tuition), matching
 * operator expectations when clearing fields; only positive amounts are real overrides.
 */

import { isBlockPricingMode } from './class-pricing-mode.util';

export function normalizeNullableMoney(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.floor(value);
}

/** Custom override on `student_classes`: `0` means inherit from class (same as `null`). */
export function normalizeStudentClassCustomTuitionMoney(
  value: number | null | undefined,
): number | null {
  const n = normalizeNullableMoney(value);
  return n === 0 ? null : n;
}

export function resolveDerivedTuitionPerSession(
  packageTotal: number | null | undefined,
  packageSession: number | null | undefined,
): number | null {
  if (
    typeof packageTotal !== 'number' ||
    !Number.isFinite(packageTotal) ||
    typeof packageSession !== 'number' ||
    !Number.isFinite(packageSession) ||
    packageSession <= 0
  ) {
    return null;
  }

  return Math.round(packageTotal / packageSession);
}

export function resolveEffectivePackageFields(options: {
  customTuitionPackageTotal?: number | null;
  customTuitionPackageSession?: number | null;
  classTuitionPackageTotal?: number | null;
  classTuitionPackageSession?: number | null;
}): {
  effectivePackageTotal: number | null;
  effectivePackageSession: number | null;
  hasCustomPackageOverride: boolean;
} {
  const customTuitionPackageTotal = normalizeStudentClassCustomTuitionMoney(
    options.customTuitionPackageTotal,
  );
  const customTuitionPackageSession = normalizeStudentClassCustomTuitionMoney(
    options.customTuitionPackageSession,
  );
  const hasCustomPackageOverride =
    customTuitionPackageTotal != null || customTuitionPackageSession != null;

  return {
    effectivePackageTotal:
      customTuitionPackageTotal ??
      normalizeNullableMoney(options.classTuitionPackageTotal),
    effectivePackageSession:
      customTuitionPackageSession ??
      normalizeNullableMoney(options.classTuitionPackageSession),
    hasCustomPackageOverride,
  };
}

export function hasCustomPackageOverride(options: {
  customTuitionPackageTotal?: number | null;
  customTuitionPackageSession?: number | null;
}): boolean {
  return (
    normalizeStudentClassCustomTuitionMoney(
      options.customTuitionPackageTotal,
    ) != null ||
    normalizeStudentClassCustomTuitionMoney(
      options.customTuitionPackageSession,
    ) != null
  );
}

export function resolveEffectiveTuitionPerSession(options: {
  customTuitionPerSession?: number | null;
  classTuitionPerSession?: number | null;
  effectivePackageTotal?: number | null;
  effectivePackageSession?: number | null;
  hasCustomPackageOverride?: boolean;
}): number | null {
  const customTuitionPerSession = normalizeStudentClassCustomTuitionMoney(
    options.customTuitionPerSession,
  );
  if (customTuitionPerSession != null) {
    return customTuitionPerSession;
  }

  const derivedFromEffectivePackage = resolveDerivedTuitionPerSession(
    options.effectivePackageTotal,
    options.effectivePackageSession,
  );

  if (options.hasCustomPackageOverride && derivedFromEffectivePackage != null) {
    return derivedFromEffectivePackage;
  }

  const classTuitionPerSession = normalizeNullableMoney(
    options.classTuitionPerSession,
  );
  if (classTuitionPerSession != null) {
    return classTuitionPerSession;
  }

  return derivedFromEffectivePackage;
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
 * Charge used when creating/updating attendance without an explicit override.
 *
 * `pricingMode` (class-level, default theo buổi):
 * - `per_session`: chuỗi cũ `custom_tuition_per_session` → gói hiệu lực →
 *   `classes.student_tuition_per_session`. Không đọc cột block.
 * - `per_block`: đơn giá / 30 phút thắng mọi gói —
 *   `custom_tuition_per_block` → `student_tuition_per_block` → gói riêng →
 *   gói lớp. Số charge = đơn giá block × snapshot block count. Thiếu
 *   per-block hoặc thiếu số block thì fallback chuỗi per-session.
 */
export function resolveSessionChargeTuitionFee(options: {
  pricingMode?: string | null;
  customTuitionPerSession?: number | null;
  customTuitionPerBlock?: number | null;
  classTuitionPerSession?: number | null;
  classTuitionPerBlock?: number | null;
  effectivePackageTotal?: number | null;
  effectivePackageSession?: number | null;
  hasCustomPackageOverride?: boolean;
  blockCount?: number | null;
}): number | null {
  if (!isBlockPricingMode(options.pricingMode)) {
    return resolveEffectiveTuitionPerSession({
      customTuitionPerSession: options.customTuitionPerSession,
      classTuitionPerSession: options.classTuitionPerSession,
      effectivePackageTotal: options.effectivePackageTotal,
      effectivePackageSession: options.effectivePackageSession,
      hasCustomPackageOverride: options.hasCustomPackageOverride,
    });
  }

  const customTuitionPerBlock = normalizeStudentClassCustomTuitionMoney(
    options.customTuitionPerBlock,
  );
  const classTuitionPerBlock = normalizeNullableMoney(
    options.classTuitionPerBlock,
  );
  const blocks = normalizePositiveBlockCount(options.blockCount);
  if (customTuitionPerBlock != null && blocks != null) {
    return customTuitionPerBlock * blocks;
  }
  if (classTuitionPerBlock != null && blocks != null) {
    return classTuitionPerBlock * blocks;
  }

  return resolveEffectiveTuitionPerSession({
    customTuitionPerSession: options.customTuitionPerSession,
    classTuitionPerSession: options.classTuitionPerSession,
    effectivePackageTotal: options.effectivePackageTotal,
    effectivePackageSession: options.effectivePackageSession,
    hasCustomPackageOverride: options.hasCustomPackageOverride,
  });
}

export function hasCustomTuitionOverride(options: {
  customTuitionPerSession?: number | null;
  customTuitionPackageTotal?: number | null;
  customTuitionPackageSession?: number | null;
}): boolean {
  return (
    normalizeStudentClassCustomTuitionMoney(options.customTuitionPerSession) !=
      null ||
    normalizeStudentClassCustomTuitionMoney(
      options.customTuitionPackageTotal,
    ) != null ||
    normalizeStudentClassCustomTuitionMoney(
      options.customTuitionPackageSession,
    ) != null
  );
}
