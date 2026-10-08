import { AttendanceStatus, Prisma } from '../../generated/client';

type AttendanceReader = Pick<Prisma.TransactionClient, 'attendance'>;

/**
 * Học sinh đã bị thu học phí cả khoá của lớp `one_time`: có một dòng điểm danh
 * có mặt/nghỉ phép ở buổi khác của lớp mang học phí > 0.
 *
 * Chỉ đếm dòng thực sự mang tiền: các buổi sau buổi thu đều 0đ, nên sửa lại
 * chính buổi đã thu không bị coi là "đã thu ở buổi khác" (tránh hoàn cả gói),
 * và khi buổi đã thu bị xoá/chuyển vắng thì buổi kế tiếp được thu lại.
 */
export async function findOneTimeChargedStudentIds(
  db: AttendanceReader,
  params: {
    classId: string;
    studentIds?: string[];
    excludeSessionId?: string;
  },
): Promise<Set<string>> {
  if (params.studentIds && params.studentIds.length === 0) {
    return new Set();
  }

  const rows = await db.attendance.findMany({
    where: {
      ...(params.studentIds ? { studentId: { in: params.studentIds } } : {}),
      status: { in: [AttendanceStatus.present, AttendanceStatus.excused] },
      tuitionFee: { gt: 0 },
      session: {
        classId: params.classId,
        ...(params.excludeSessionId
          ? { id: { not: params.excludeSessionId } }
          : {}),
      },
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });

  return new Set(rows.map((row) => row.studentId));
}

/**
 * Khoá theo lớp trong transaction, để hai lần tạo/sửa buổi đồng thời của cùng
 * lớp `one_time` không cùng thấy "chưa thu" rồi thu gói hai lần.
 */
export async function lockOneTimeClassCharges(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  classId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`one_time_charge:${classId}`}))`;
}
