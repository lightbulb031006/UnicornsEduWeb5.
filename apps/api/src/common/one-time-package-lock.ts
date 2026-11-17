import {
  AttendanceStatus,
  ClassPricingMode,
  StudentClassStatus,
} from 'generated/enums';
import type { Prisma } from '../../generated/client';
import { resolveDerivedTuitionPerSession } from './student-class-tuition.util';

type LockDb = Pick<Prisma.TransactionClient, 'studentClass' | 'attendance'>;

export type OneTimePackageLockEntry = {
  classId: string;
  studentId: string;
};

export type OneTimePackageLockClass = {
  tuitionPackageTotal: number | null;
  tuitionPackageSession: number | null;
};

export type OneTimePackageLockMembership = {
  customTuitionPackageTotal: number | null;
};

export type OneTimePackageLockWrite = {
  customTuitionPackageTotal: number;
  customTuitionPackageSession: number | null;
  /** Suy ra từ gói như mọi đường ghi gói riêng khác (gói ÷ số buổi). */
  customStudentTuitionPerSession: number | null;
};

function buildLockWrite(
  total: number,
  sessions: number | null,
): OneTimePackageLockWrite {
  return {
    customTuitionPackageTotal: total,
    customTuitionPackageSession: sessions,
    customStudentTuitionPerSession: resolveDerivedTuitionPerSession(
      total,
      sessions,
    ),
  };
}

/**
 * Gói chốt của một học sinh trên lớp bán một lần (16/11), hoặc `null` nếu
 * không cần ghi.
 *
 * - Đã có gói riêng (đã chốt, hoặc nhập tay trong cùng request) → giữ nguyên.
 * - Đã bị thu trên lớp → chốt đúng số đã thu, số buổi theo gói lớp.
 * - Chưa bị thu → chốt theo gói lớp hiện tại (gói trống / ≤ 0 thì bỏ qua).
 */
export function resolveOneTimePackageLock(params: {
  membership: OneTimePackageLockMembership;
  classPackage: OneTimePackageLockClass;
  chargedFee: number | null;
}): OneTimePackageLockWrite | null {
  if (params.membership.customTuitionPackageTotal != null) {
    return null;
  }
  const sessions = params.classPackage.tuitionPackageSession ?? null;
  if (params.chargedFee != null && params.chargedFee > 0) {
    return buildLockWrite(params.chargedFee, sessions);
  }
  const total = params.classPackage.tuitionPackageTotal;
  if (total == null || total <= 0) {
    return null;
  }
  return buildLockWrite(total, sessions);
}

/**
 * Chốt gói học phí lúc vào lớp bán một lần (16/11): gói lớp lúc đó thành gói
 * riêng của học sinh, sửa gói lớp về sau không đổi gói đã chốt.
 *
 * Gọi sau mọi thao tác đưa học sinh vào (hoặc vào lại) lớp và khi lớp chuyển
 * sang bán một lần. Lớp không phải `one_time` bị bỏ qua. Học sinh vào lại mà
 * đã bị thu trên lớp được chốt đúng số đã thu (và không bị thu thêm).
 */
export async function lockOneTimeStudentPackages(
  db: LockDb,
  entries: OneTimePackageLockEntry[],
): Promise<number> {
  if (entries.length === 0) {
    return 0;
  }

  const classIds = Array.from(new Set(entries.map((entry) => entry.classId)));
  const studentIds = Array.from(
    new Set(entries.map((entry) => entry.studentId)),
  );
  const candidates = await db.studentClass.findMany({
    where: {
      classId: { in: classIds },
      studentId: { in: studentIds },
      OR: [{ status: null }, { status: StudentClassStatus.active }],
      customTuitionPackageTotal: null,
      class: { pricingMode: ClassPricingMode.one_time },
    },
    select: {
      id: true,
      classId: true,
      studentId: true,
      customTuitionPackageTotal: true,
      class: {
        select: { tuitionPackageTotal: true, tuitionPackageSession: true },
      },
    },
  });
  const requested = new Set(
    entries.map((entry) => `${entry.classId}:${entry.studentId}`),
  );
  const needsLock = (candidates ?? []).filter(
    (row) =>
      row.class != null &&
      row.customTuitionPackageTotal == null &&
      requested.has(`${row.classId}:${row.studentId}`),
  );
  if (needsLock.length === 0) {
    return 0;
  }

  // Khoản thu gói = dòng điểm danh có mặt/nghỉ phép đầu tiên mang tiền > 0.
  const chargedRows = await db.attendance.findMany({
    where: {
      studentId: {
        in: Array.from(new Set(needsLock.map((row) => row.studentId))),
      },
      status: { in: [AttendanceStatus.present, AttendanceStatus.excused] },
      tuitionFee: { gt: 0 },
      session: {
        classId: {
          in: Array.from(new Set(needsLock.map((row) => row.classId))),
        },
      },
    },
    select: {
      studentId: true,
      tuitionFee: true,
      session: { select: { classId: true } },
    },
    orderBy: [{ session: { date: 'asc' } }, { createdAt: 'asc' }],
  });
  const chargedFeeByKey = new Map<string, number>();
  for (const row of chargedRows) {
    const key = `${row.session.classId}:${row.studentId}`;
    if (!chargedFeeByKey.has(key) && row.tuitionFee != null) {
      chargedFeeByKey.set(key, row.tuitionFee);
    }
  }

  let locked = 0;
  for (const membership of needsLock) {
    const key = `${membership.classId}:${membership.studentId}`;
    const write = resolveOneTimePackageLock({
      membership,
      classPackage: membership.class,
      chargedFee: chargedFeeByKey.get(key) ?? null,
    });
    if (!write) {
      continue;
    }
    await db.studentClass.update({
      where: { id: membership.id },
      data: write,
    });
    locked += 1;
  }
  return locked;
}

/** Mọi học sinh đang học của các lớp — dùng khi lớp chuyển sang bán một lần. */
export async function lockOneTimePackagesForActiveStudents(
  db: LockDb,
  classIds: string[],
): Promise<number> {
  if (classIds.length === 0) {
    return 0;
  }
  const rows = await db.studentClass.findMany({
    where: {
      classId: { in: classIds },
      OR: [{ status: null }, { status: StudentClassStatus.active }],
    },
    select: { classId: true, studentId: true },
  });
  return lockOneTimeStudentPackages(db, rows);
}
