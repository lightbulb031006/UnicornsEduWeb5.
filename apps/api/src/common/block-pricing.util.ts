/**
 * Expand-step helpers: convert per-session VNĐ rates to per 30-minute block.
 * Payroll still reads per-session columns; these values are dual-written only.
 */

export const BLOCK_DURATION_MINUTES = 30;

const CLOCK_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function minutesFromClockTime(
  value: string | null | undefined,
): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = CLOCK_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function durationMinutesFromClockRange(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const start = minutesFromClockTime(from);
  const end = minutesFromClockTime(to);
  if (start == null || end == null) {
    return null;
  }
  const duration = end - start;
  return duration > 0 ? duration : null;
}

/** Whole 30-minute blocks; null when duration is missing or not a 30-minute multiple. */
export function blockCountFromDurationMinutes(
  durationMinutes: number | null | undefined,
): number | null {
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  if (durationMinutes % BLOCK_DURATION_MINUTES !== 0) {
    return null;
  }
  const blocks = durationMinutes / BLOCK_DURATION_MINUTES;
  return blocks > 0 ? blocks : null;
}

export function blockCountFromClockRange(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  return blockCountFromDurationMinutes(durationMinutesFromClockRange(from, to));
}

export type ScheduleClockSlot = {
  from?: string | null;
  to?: string | null;
  end?: string | null;
};

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
 * Standard block count of a class: the conversion unit between a per-session
 * rate and a per 30-minute rate. Slots may differ in length — the standard is
 * the greatest block count every active slot is a whole multiple of (GCD), so
 * a uniform schedule still yields its own block count exactly as before.
 *
 * Only invalid durations (missing, non-positive, or not a 30-minute multiple)
 * and an empty schedule produce null. Billing never depends on this value:
 * each session derives its own block count from its start/end time.
 */
export function standardBlockCountFromSlots(
  slots: readonly ScheduleClockSlot[] | null | undefined,
): number | null {
  if (!slots || slots.length === 0) {
    return null;
  }

  let standard: number | null = null;
  for (const slot of slots) {
    const blocks = blockCountFromClockRange(slot.from, slot.to ?? slot.end);
    if (blocks == null) {
      return null;
    }
    standard = standard == null ? blocks : greatestCommonDivisor(standard, blocks);
  }

  return standard != null && standard > 0 ? standard : null;
}

/** Round half away from zero toward nearest 1đ (integer VNĐ). */
export function perSessionToPerBlock(
  perSession: number | null | undefined,
  standardBlockCount: number | null | undefined,
): number | null {
  if (
    perSession == null ||
    typeof perSession !== 'number' ||
    !Number.isFinite(perSession)
  ) {
    return null;
  }
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
  if (
    perBlock == null ||
    typeof perBlock !== 'number' ||
    !Number.isFinite(perBlock)
  ) {
    return null;
  }
  if (
    standardBlockCount == null ||
    !Number.isFinite(standardBlockCount) ||
    standardBlockCount <= 0
  ) {
    return perBlock;
  }
  return perBlock * standardBlockCount;
}

/** API still speaks per-session; DB may already store per-block after expand backfill. */
export function presentCustomAllowanceAsPerSession(
  stored: number | null | undefined,
  standardBlockCount: number | null | undefined,
  storedAsPerBlock: boolean,
): number | null {
  if (
    stored == null ||
    typeof stored !== 'number' ||
    !Number.isFinite(stored)
  ) {
    return null;
  }
  if (!storedAsPerBlock) {
    return stored;
  }
  return perBlockToPerSession(stored, standardBlockCount);
}

export function storeCustomAllowanceFromPerSessionInput(
  incomingPerSession: number | null,
  standardBlockCount: number | null | undefined,
): number | null {
  if (incomingPerSession == null) {
    return null;
  }
  const perBlock = perSessionToPerBlock(incomingPerSession, standardBlockCount);
  return perBlock ?? incomingPerSession;
}

export function perBlockReconstructionErrorVnd(
  perSession: number,
  standardBlockCount: number,
): number {
  const perBlock = perSessionToPerBlock(perSession, standardBlockCount);
  if (perBlock == null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(perBlock * standardBlockCount - perSession);
}

export function dualWritePerBlockClassFields(input: {
  allowancePerSessionPerStudent?: number | null;
  maxAllowancePerSession?: number | null;
  studentTuitionPerSession?: number | null;
  /** When a number, admin's / 30 phút rate wins over derivation from per-session. */
  studentTuitionPerBlock?: number | null;
  standardBlockCount: number | null;
  clearWhenUnknown?: boolean;
}): {
  allowancePerBlockPerStudent?: number | null;
  maxAllowancePerBlock?: number | null;
  studentTuitionPerBlock?: number | null;
} {
  const blocks = input.standardBlockCount;
  const hasExplicitTuitionPerBlock = input.studentTuitionPerBlock !== undefined;
  const explicitTuitionPerBlock =
    typeof input.studentTuitionPerBlock === 'number' &&
    Number.isFinite(input.studentTuitionPerBlock)
      ? input.studentTuitionPerBlock
      : null;

  if (blocks == null) {
    if (!input.clearWhenUnknown) {
      if (explicitTuitionPerBlock != null) {
        return { studentTuitionPerBlock: explicitTuitionPerBlock };
      }
      return {};
    }
    const cleared: {
      allowancePerBlockPerStudent?: number | null;
      maxAllowancePerBlock?: number | null;
      studentTuitionPerBlock?: number | null;
    } = {};
    if (input.allowancePerSessionPerStudent !== undefined) {
      cleared.allowancePerBlockPerStudent = null;
    }
    if (input.maxAllowancePerSession !== undefined) {
      cleared.maxAllowancePerBlock = null;
    }
    if (hasExplicitTuitionPerBlock) {
      cleared.studentTuitionPerBlock = explicitTuitionPerBlock;
    } else if (input.studentTuitionPerSession !== undefined) {
      cleared.studentTuitionPerBlock = null;
    }
    if (
      input.allowancePerSessionPerStudent === undefined &&
      input.maxAllowancePerSession === undefined &&
      input.studentTuitionPerSession === undefined &&
      !hasExplicitTuitionPerBlock
    ) {
      return {
        allowancePerBlockPerStudent: null,
        maxAllowancePerBlock: null,
        studentTuitionPerBlock: null,
      };
    }
    return cleared;
  }

  const next: {
    allowancePerBlockPerStudent?: number | null;
    maxAllowancePerBlock?: number | null;
    studentTuitionPerBlock?: number | null;
  } = {};
  if (input.allowancePerSessionPerStudent !== undefined) {
    next.allowancePerBlockPerStudent = perSessionToPerBlock(
      input.allowancePerSessionPerStudent ?? 0,
      blocks,
    );
  }
  if (input.maxAllowancePerSession !== undefined) {
    next.maxAllowancePerBlock = perSessionToPerBlock(
      input.maxAllowancePerSession,
      blocks,
    );
  }
  if (explicitTuitionPerBlock != null) {
    next.studentTuitionPerBlock = explicitTuitionPerBlock;
  } else if (
    input.studentTuitionPerSession !== undefined ||
    hasExplicitTuitionPerBlock
  ) {
    next.studentTuitionPerBlock = perSessionToPerBlock(
      input.studentTuitionPerSession,
      blocks,
    );
  }
  return next;
}
