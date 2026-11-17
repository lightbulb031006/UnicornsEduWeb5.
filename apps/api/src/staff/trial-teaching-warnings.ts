import type { Prisma } from 'generated/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { StaffTrialTeachingWarningDto } from 'src/dtos/staff.dto';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Cảnh báo chưa dạy thử (CONTEXT.md): mỗi lớp còn trợ cấp buổi chờ trả trong popup thanh
 * toán mà trong lịch sử lớp đó gia sư chưa có buổi **Dạy thử** nào (`coefficient = 0`,
 * kể cả buổi đã trả) và chưa ai bỏ qua cặp (gia sư, lớp) → một cảnh báo.
 */
export async function loadTrialTeachingWarnings(
  db: Db,
  staffId: string,
  pendingClasses: Iterable<{ classId: string; className: string }>,
): Promise<StaffTrialTeachingWarningDto[]> {
  const classNameById = new Map<string, string>();
  for (const { classId, className } of pendingClasses) {
    if (classId && !classNameById.has(classId)) {
      classNameById.set(classId, className);
    }
  }
  if (classNameById.size === 0) return [];

  const classIds = [...classNameById.keys()];
  const [trialSessions, dismissals] = await Promise.all([
    db.session.findMany({
      where: { teacherId: staffId, classId: { in: classIds }, coefficient: 0 },
      distinct: ['classId'],
      select: { classId: true },
    }),
    db.trialTeachingWarningDismissal.findMany({
      where: { staffId, classId: { in: classIds } },
      select: { classId: true },
    }),
  ]);

  const settled = new Set([
    ...trialSessions.map((row) => row.classId),
    ...dismissals.map((row) => row.classId),
  ]);

  return classIds
    .filter((classId) => !settled.has(classId))
    .map((classId) => ({ classId, className: classNameById.get(classId)! }))
    .sort((a, b) => a.className.localeCompare(b.className, 'vi'));
}
