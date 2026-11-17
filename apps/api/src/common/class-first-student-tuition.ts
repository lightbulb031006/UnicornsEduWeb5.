import { BadRequestException } from '@nestjs/common';
import { StudentClassStatus } from 'generated/enums';
import type { Prisma } from '../../generated/client';
import {
  isBlockPricingMode,
  isOneTimePricingMode,
} from './class-pricing-mode.util';
import { resolveDerivedTuitionPerSession } from './student-class-tuition.util';

/**
 * #273 — Bắt điền Học phí lớp trước khi thêm học sinh đầu tiên.
 *
 * Lớp "chưa có học sinh" = không còn dòng `student_classes` đang học (status
 * `active` hoặc `null` cũ). Lớp như vậy chỉ nhận học sinh khi đã có học phí
 * theo cách thu đang chọn. Học phí riêng của học sinh không thay được học phí
 * lớp. `0` là đã điền (miễn phí); `null` là chưa điền.
 */
export const CLASS_TUITION_REQUIRED_MESSAGE =
  'Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.';

export const ONE_TIME_CLASS_TUITION_REQUIRED_MESSAGE =
  'Lớp bán một lần chưa có Tổng gói. Hãy điền Tổng gói lớn hơn 0đ trước khi thêm học sinh đầu tiên.';

export type ClassTuitionSnapshot = {
  pricingMode?: string | null;
  studentTuitionPerSession?: number | null;
  studentTuitionPerBlock?: number | null;
  tuitionPackageTotal?: number | null;
  tuitionPackageSession?: number | null;
};

function isFilledMoney(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Lớp đã có học phí theo cách thu đang chọn chưa:
 * - `per_session` (theo buổi / theo gói buổi): học phí / buổi, hoặc gói lớp
 *   suy ra được học phí / buổi (tổng gói + số buổi; gói 0đ = miễn phí).
 * - `per_block` (theo 30 phút): học phí / 30 phút, hoặc chuỗi theo buổi ở trên
 *   (charge buổi fallback về chuỗi này khi thiếu đơn giá block).
 * - `one_time` (bán một lần): tổng gói của lớp **lớn hơn 0đ** — lớp bán một
 *   lần được tạo với gói trống, điều kiện > 0đ dời sang lúc nhận học sinh
 *   đầu tiên (follow-up grill 13/11). `0đ` không tính là đã điền ở chế độ này.
 */
export function hasClassTuitionForPricingMode(
  classRow: ClassTuitionSnapshot,
): boolean {
  if (isOneTimePricingMode(classRow.pricingMode)) {
    const total = classRow.tuitionPackageTotal;
    return isFilledMoney(total) && (total as number) > 0;
  }

  const hasPerSessionChain =
    isFilledMoney(classRow.studentTuitionPerSession) ||
    resolveDerivedTuitionPerSession(
      classRow.tuitionPackageTotal,
      classRow.tuitionPackageSession,
    ) != null;

  if (isBlockPricingMode(classRow.pricingMode)) {
    return isFilledMoney(classRow.studentTuitionPerBlock) || hasPerSessionChain;
  }

  return hasPerSessionChain;
}

type RosterDb = {
  studentClass: Pick<Prisma.TransactionClient['studentClass'], 'findMany'>;
};

type ClassDb = {
  class: Pick<Prisma.TransactionClient['class'], 'findMany'>;
};

/** Trong `classIds`, các lớp hiện chưa có học sinh đang học. */
export async function findClassIdsWithoutActiveStudents(
  db: RosterDb,
  classIds: string[],
): Promise<string[]> {
  const uniqueIds = Array.from(new Set(classIds));
  if (uniqueIds.length === 0) {
    return [];
  }

  const activeRows = await db.studentClass.findMany({
    where: {
      classId: { in: uniqueIds },
      OR: [{ status: null }, { status: StudentClassStatus.active }],
    },
    select: { classId: true },
  });
  const classIdsWithStudents = new Set(
    (activeRows ?? []).map((row) => row.classId),
  );
  return uniqueIds.filter((classId) => !classIdsWithStudents.has(classId));
}

/**
 * Chặn thêm học sinh đầu tiên vào các lớp chưa có học phí. Truyền đúng các lớp
 * **đang trống** và **sắp nhận** ít nhất một học sinh đang học. Gọi trong cùng
 * transaction sau khi ghi học phí (nếu thao tác có ghi) để học phí điền cùng
 * lúc được tính.
 */
export async function assertClassTuitionBeforeFirstStudent(
  db: ClassDb,
  classIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(classIds));
  if (uniqueIds.length === 0) {
    return;
  }

  const classes = await db.class.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      name: true,
      pricingMode: true,
      studentTuitionPerSession: true,
      studentTuitionPerBlock: true,
      tuitionPackageTotal: true,
      tuitionPackageSession: true,
    },
  });

  const missing = (classes ?? []).filter(
    (classRow) => !hasClassTuitionForPricingMode(classRow),
  );
  if (missing.length === 0) {
    return;
  }

  if (uniqueIds.length === 1) {
    throw new BadRequestException(
      isOneTimePricingMode(missing[0].pricingMode)
        ? ONE_TIME_CLASS_TUITION_REQUIRED_MESSAGE
        : CLASS_TUITION_REQUIRED_MESSAGE,
    );
  }
  const names = missing.map((classRow) => `«${classRow.name}»`).join(', ');
  throw new BadRequestException(
    `Lớp ${names} chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.`,
  );
}
