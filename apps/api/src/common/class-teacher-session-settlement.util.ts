import { ClassStatus } from 'generated/enums';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type ClassTeacherSessionSettlement = {
  sessionCount: number;
  unpaidSessionCount: number;
};

/**
 * Kết thúc lớp không còn phụ thuộc trợ cấp gia sư: buổi chưa thanh toán vẫn
 * thanh toán sau được. `unpaidSessionCount` chỉ để FE cảnh báo khi xác nhận.
 */
export type ClassEndEligibility = ClassTeacherSessionSettlement & {
  canEnd: boolean;
};

type SessionSettlementDb = Pick<PrismaService, '$queryRaw'>;

export function buildClassEndEligibility(
  classStatus: ClassStatus,
  settlement: ClassTeacherSessionSettlement,
): ClassEndEligibility {
  return {
    ...settlement,
    canEnd: classStatus === ClassStatus.running,
  };
}

export async function getClassTeacherSessionSettlement(
  db: SessionSettlementDb,
  classId: string,
): Promise<ClassTeacherSessionSettlement> {
  const [row] = await db.$queryRaw<
    Array<{ session_count: number; unpaid_session_count: number }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::int AS session_count,
      COUNT(*) FILTER (
        WHERE LOWER(COALESCE(teacher_payment_status, '')) <> 'paid'
      )::int AS unpaid_session_count
    FROM sessions
    WHERE class_id = ${classId}
  `);

  return {
    sessionCount: row?.session_count ?? 0,
    unpaidSessionCount: row?.unpaid_session_count ?? 0,
  };
}
