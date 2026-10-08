import { BadRequestException } from '@nestjs/common';
import {
  blockCountFromClockRange,
  standardBlockCountFromSlots,
  type ScheduleClockSlot,
} from './block-pricing.util';

export const CLASS_PRICING_MODE = {
  per_session: 'per_session',
  per_block: 'per_block',
  one_time: 'one_time',
} as const;

export type ClassPricingModeValue =
  (typeof CLASS_PRICING_MODE)[keyof typeof CLASS_PRICING_MODE];

export function isBlockPricingMode(
  mode?: string | null,
): mode is typeof CLASS_PRICING_MODE.per_block {
  return mode === CLASS_PRICING_MODE.per_block;
}

export function isOneTimePricingMode(
  mode?: string | null,
): mode is typeof CLASS_PRICING_MODE.one_time {
  return mode === CLASS_PRICING_MODE.one_time;
}

/**
 * Chế độ tính tiền của lớp theo khoá: khoá bán một lần ép `one_time`; khoá
 * thường nhận `per_session`/`per_block` và từ chối `one_time` (bán một lần là
 * cài đặt của khoá, không chọn trên từng lớp).
 */
export function resolveClassPricingModeForCourse(params: {
  courseIsOneTime: boolean;
  requestedMode?: ClassPricingModeValue | null;
}): ClassPricingModeValue {
  if (params.courseIsOneTime) {
    return CLASS_PRICING_MODE.one_time;
  }
  if (isOneTimePricingMode(params.requestedMode)) {
    throw new BadRequestException(
      'Bán một lần là cài đặt của khoá. Hãy bật "Bán một lần" trên khoá học.',
    );
  }
  return params.requestedMode ?? CLASS_PRICING_MODE.per_session;
}

/** Lớp chỉ đổi sang khoá cùng chế độ bán (bán một lần ↔ bán một lần). */
export function assertCourseChangeKeepsSaleMode(params: {
  fromCourseIsOneTime: boolean;
  toCourseIsOneTime: boolean;
}): void {
  if (params.fromCourseIsOneTime !== params.toCourseIsOneTime) {
    throw new BadRequestException(
      'Chỉ đổi được sang khoá cùng chế độ: lớp bán một lần sang khoá bán một lần, lớp thường sang khoá thường.',
    );
  }
}

/** Lớp bán một lần phải có tổng gói > 0đ, vì gói là khoản thu ở buổi đầu. */
export function assertOneTimePackageTotal(params: {
  isOneTime: boolean;
  tuitionPackageTotal?: number | null;
}): void {
  if (!params.isOneTime) {
    return;
  }
  const total = params.tuitionPackageTotal;
  if (total == null || !Number.isFinite(total) || total <= 0) {
    throw new BadRequestException(
      'Lớp thuộc khoá bán một lần phải có Tổng gói lớn hơn 0đ.',
    );
  }
}

/**
 * Chỉ bật bán một lần cho khoá khi chưa lớp nào của khoá thu học phí: học sinh
 * đã bị trừ theo buổi sẽ bị coi là "đã thu" và không bao giờ bị trừ gói.
 */
export function assertCanEnableOneTimeCourse(chargedAttendanceCount: number) {
  if (chargedAttendanceCount > 0) {
    throw new BadRequestException(
      'Khoá đã có lớp thu học phí theo buổi, không bật bán một lần được. Cần backfill riêng.',
    );
  }
}

export function isFrozenSessionPaymentStatus(status?: string | null): boolean {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'paid' ||
    normalized === 'deposit' ||
    normalized === 'deposite' ||
    normalized === 'coc' ||
    normalized === 'cọc'
  );
}

export function clockHmsFromUnknown(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
      value.trim(),
    );
    if (!match) {
      return null;
    }
    return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
  }

  const isoMatch = /T(\d{2}):(\d{2}):(\d{2})/.exec(value.toISOString());
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}:${isoMatch[3]}`;
  }

  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(
    value.getUTCMinutes(),
  ).padStart(2, '0')}:${String(value.getUTCSeconds()).padStart(2, '0')}`;
}

/** Persist `sessions.snapshot_block_count` only in block mode. */
export function resolveSnapshotBlockCountForPricingMode(options: {
  pricingMode?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  standardBlockCount?: number | null;
}): number | null {
  if (!isBlockPricingMode(options.pricingMode)) {
    return null;
  }
  return (
    blockCountFromClockRange(options.startTime, options.endTime) ??
    options.standardBlockCount ??
    null
  );
}

/**
 * Reconstruct per-session custom teacher allowance after #134 stored
 * `class_teachers.custom_allowance` as per-block. Per-session mode still
 * needs a block count even when `snapshot_block_count` is null.
 */
export function resolveAllowanceReconstructionBlockCount(options: {
  snapshotBlockCount?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  standardBlockCount?: number | null;
}): number | null {
  return (
    options.snapshotBlockCount ??
    blockCountFromClockRange(options.startTime, options.endTime) ??
    options.standardBlockCount ??
    null
  );
}

export function assertCanEnableBlockPricing(
  standardBlockCount: number | null,
): void {
  if (standardBlockCount == null || standardBlockCount <= 0) {
    throw new BadRequestException(
      'Không thể bật chế độ tính theo block 30 phút: lớp chưa có lịch cố định, hoặc có khung giờ với thời lượng không phải bội số 30 phút.',
    );
  }
}

export function standardBlockCountForClassSlots(
  slots: readonly ScheduleClockSlot[] | null | undefined,
): number | null {
  return standardBlockCountFromSlots(slots);
}
