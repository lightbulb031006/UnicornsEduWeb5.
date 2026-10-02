import type { ClassPricingMode, ClassScheduleItem } from "@/dtos/class.dto";
import { formatCurrency } from "@/lib/class.helpers";
import {
  moneyInputInitialFromNumber,
  parseOptionalMoneyInt,
} from "@/lib/money-input.helpers";

export const BLOCK_DURATION_MINUTES = 30;

export const CLASS_PRICING_MODE_CHANGE_CONFIRM =
  "Đổi chế độ tính tiền sẽ tính lại các buổi chưa thanh toán của lớp. Buổi đã thanh toán hoặc đã ghi cọc giữ nguyên số tiền. Tiếp tục?";

export const MISSING_STANDARD_BLOCKS_FALLBACK =
  "Không thể bật chế độ tính theo block 30 phút: lớp chưa có lịch cố định, hoặc có khung giờ với thời lượng không phải bội số 30 phút.";

const CLOCK_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type ScheduleClockSlot = {
  from?: string | null;
  to?: string | null;
  end?: string | null;
};

export function classRateFieldLabels(mode: ClassPricingMode): {
  allowance: string;
  maxAllowance: string;
  tuition: string;
} {
  if (mode === "per_block") {
    return {
      allowance: "Trợ cấp / HV / 30 phút",
      maxAllowance: "Trợ cấp tối đa / 30 phút",
      tuition: "Học phí / HV / 30 phút",
    };
  }
  return {
    allowance: "Trợ cấp / HV / buổi",
    maxAllowance: "Trợ cấp tối đa / buổi",
    tuition: "Học phí / HV / buổi",
  };
}

export function minutesFromClockTime(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = CLOCK_RE.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function blockCountFromClockRange(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const start = minutesFromClockTime(from);
  const end = minutesFromClockTime(to);
  if (start == null || end == null) return null;
  const duration = end - start;
  if (duration <= 0 || duration % BLOCK_DURATION_MINUTES !== 0) return null;
  const blocks = duration / BLOCK_DURATION_MINUTES;
  return blocks > 0 ? blocks : null;
}

export function usableScheduleSlots(
  slots: readonly ScheduleClockSlot[] | null | undefined,
): ScheduleClockSlot[] {
  if (!slots) return [];
  return slots.filter((slot) => Boolean(slot.from) && Boolean(slot.to ?? slot.end));
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

/**
 * Đơn vị quy đổi giữa giá / buổi và giá / 30 phút. Các khung giờ được phép
 * lệch thời lượng: lấy GCD số block của mọi khung giờ, nên lịch đồng nhất vẫn
 * ra đúng số block của chính nó như trước. Tiền thực tế không phụ thuộc giá
 * trị này — mỗi buổi tự tính block từ giờ bắt đầu/kết thúc của buổi đó.
 */
export function standardBlockCountFromSlots(
  slots: readonly ScheduleClockSlot[] | null | undefined,
): number | null {
  const usable = usableScheduleSlots(slots);
  if (usable.length === 0) return null;

  let standard: number | null = null;
  for (const slot of usable) {
    const blocks = blockCountFromClockRange(slot.from, slot.to ?? slot.end);
    if (blocks == null) return null;
    standard = standard == null ? blocks : greatestCommonDivisor(standard, blocks);
  }

  return standard != null && standard > 0 ? standard : null;
}

export function standardBlockCountFromClassSchedule(
  schedule: readonly ClassScheduleItem[] | null | undefined,
): number | null {
  return standardBlockCountFromSlots(schedule);
}

export function explainMissingStandardBlocks(
  slots: readonly ScheduleClockSlot[] | null | undefined,
): string {
  const usable = usableScheduleSlots(slots);
  if (usable.length === 0) {
    return "Không thể bật chế độ tính theo block 30 phút: lớp chưa có lịch cố định.";
  }

  const counts = usable.map((slot) =>
    blockCountFromClockRange(slot.from, slot.to ?? slot.end),
  );
  if (counts.some((count) => count == null)) {
    return "Không thể bật chế độ tính theo block 30 phút: thời lượng lịch không phải bội số 30 phút.";
  }
  return MISSING_STANDARD_BLOCKS_FALLBACK;
}

export function perSessionToPerBlock(
  perSession: number | null | undefined,
  standardBlockCount: number | null | undefined,
): number | null {
  if (perSession == null || !Number.isFinite(perSession)) return null;
  if (
    standardBlockCount == null ||
    !Number.isFinite(standardBlockCount) ||
    standardBlockCount <= 0
  ) {
    return null;
  }
  return Math.round(perSession / standardBlockCount);
}

export function perBlockToPerSession(
  perBlock: number | null | undefined,
  standardBlockCount: number | null | undefined,
): number | null {
  if (perBlock == null || !Number.isFinite(perBlock)) return null;
  if (
    standardBlockCount == null ||
    !Number.isFinite(standardBlockCount) ||
    standardBlockCount <= 0
  ) {
    return perBlock;
  }
  return perBlock * standardBlockCount;
}

export function displayedClassRate(options: {
  mode: ClassPricingMode;
  perSession: number | null | undefined;
  perBlock?: number | null;
  standardBlockCount: number | null;
}): number | null | undefined {
  if (options.mode !== "per_block") {
    return options.perSession;
  }
  if (options.perBlock != null && Number.isFinite(options.perBlock)) {
    return options.perBlock;
  }
  return perSessionToPerBlock(options.perSession, options.standardBlockCount) ?? options.perSession;
}

export function convertDisplayedRateInput(options: {
  input: string;
  from: ClassPricingMode;
  to: ClassPricingMode;
  standardBlockCount: number | null;
}): string {
  if (options.from === options.to) return options.input;
  const parsed = parseOptionalMoneyInt(options.input);
  if (parsed == null) return options.input;
  if (options.standardBlockCount == null || options.standardBlockCount <= 0) {
    return options.input;
  }
  if (options.from === "per_session" && options.to === "per_block") {
    const next = perSessionToPerBlock(parsed, options.standardBlockCount);
    return next == null ? options.input : moneyInputInitialFromNumber(next);
  }
  const next = perBlockToPerSession(parsed, options.standardBlockCount);
  return next == null ? options.input : moneyInputInitialFromNumber(next);
}

export function toPerSessionAmountForApi(options: {
  mode: ClassPricingMode;
  displayedAmount: number | undefined;
  standardBlockCount: number | null;
}): number | undefined {
  if (options.displayedAmount == undefined) return undefined;
  if (options.mode !== "per_block") return options.displayedAmount;
  const converted = perBlockToPerSession(options.displayedAmount, options.standardBlockCount);
  return converted ?? options.displayedAmount;
}

export function toPerSessionMaxAllowanceForApi(options: {
  mode: ClassPricingMode;
  displayedAmount: number | null | undefined;
  standardBlockCount: number | null;
}): number | null | undefined {
  if (options.displayedAmount === undefined) return undefined;
  if (options.displayedAmount === null) return null;
  if (options.mode !== "per_block") return options.displayedAmount;
  const converted = perBlockToPerSession(options.displayedAmount, options.standardBlockCount);
  return converted ?? options.displayedAmount;
}

/**
 * Block-mode tuition rate for `student_tuition_per_block`.
 * Empty → `null` (backend derives from the package). Per-session mode omits the field.
 * Unlike allowance, this must NOT be multiplied into `student_tuition_per_session`.
 */
export function toPerBlockTuitionForApi(options: {
  mode: ClassPricingMode;
  displayedAmount: number | undefined;
}): number | null | undefined {
  if (options.mode !== "per_block") return undefined;
  if (options.displayedAmount == undefined) return null;
  return options.displayedAmount;
}

export type PricingModeChangeResult =
  | { ok: true; next: ClassPricingMode }
  | { ok: false; reason: string };

export function requestClassPricingModeChange(options: {
  current: ClassPricingMode;
  next: ClassPricingMode;
  standardBlockCount: number | null;
  missingReason: string;
  requireConfirm: boolean;
  confirm: () => boolean;
}): PricingModeChangeResult {
  if (options.next === options.current) {
    return { ok: true, next: options.current };
  }
  if (options.next === "per_block" && (options.standardBlockCount == null || options.standardBlockCount <= 0)) {
    return { ok: false, reason: options.missingReason };
  }
  if (options.requireConfirm && !options.confirm()) {
    return { ok: false, reason: CLASS_PRICING_MODE_CHANGE_CONFIRM };
  }
  return { ok: true, next: options.next };
}

export function formatStandardBlockSummary(standardBlockCount: number): string {
  const minutes = standardBlockCount * BLOCK_DURATION_MINUTES;
  return `Số block chuẩn: ${standardBlockCount} (mốc quy đổi ${minutes} phút). Mỗi buổi vẫn tính theo số block thực tế của buổi đó.`;
}

export function formatSessionEquivalentLine(
  label: string,
  perBlock: number,
  standardBlockCount: number,
): string {
  const perSession = perBlockToPerSession(perBlock, standardBlockCount) ?? perBlock;
  const minutes = standardBlockCount * BLOCK_DURATION_MINUTES;
  return `${label}: ${formatCurrency(perBlock)} / 30 phút ≈ ${formatCurrency(perSession)} / ${minutes} phút.`;
}

export function compactTuitionChargeLine(options: {
  mode: ClassPricingMode;
  totalInput: string;
  sessionsInput: string;
  standardBlockCount: number | null;
  perSessionLine: string | null;
}): string | null {
  if (!options.perSessionLine) return null;
  if (options.mode !== "per_block" || options.standardBlockCount == null) {
    return options.perSessionLine;
  }
  const perSessionMatch = options.perSessionLine.match(/^(.+)\/buổi$/);
  if (!perSessionMatch) return options.perSessionLine;
  return `${options.perSessionLine} chuẩn · chia ${options.standardBlockCount} block / 30 phút để đối chiếu.`;
}
