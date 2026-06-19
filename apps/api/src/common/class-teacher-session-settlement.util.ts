import { ClassStatus } from 'generated/enums';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

export type ClassTeacherSessionSettlement = {
  sessionCount: number;
  unpaidSessionCount: number;
  canEndClass: boolean;
  blockReason: string | null;
};

export type ClassEndEligibility = ClassTeacherSessionSettlement & {
  canEnd: boolean;
};

type SessionSettlementDb = Pick<PrismaService, '$queryRaw'>;

export function resolveClassTeacherSessionSettlementCounts(
  sessionCount: number,
  unpaidSessionCount: number,
): ClassTeacherSessionSettlement {
  const canEndClass = unpaidSessionCount === 0;

  return {
    sessionCount,
    unpaidSessionCount,
    canEndClass,
    blockReason: canEndClass
      ? null
      : `Còn ${unpaidSessionCount} buổi chưa thanh toán trợ cấp gia sư.`,
  };
}

export function buildClassEndEligibility(
  classStatus: ClassStatus,
  settlement: ClassTeacherSessionSettlement,
): ClassEndEligibility {
  if (classStatus !== ClassStatus.running) {
    return {
      ...settlement,
      canEnd: false,
      blockReason: null,
    };
  }

  return {
    ...settlement,
    canEnd: settlement.canEndClass,
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

  return resolveClassTeacherSessionSettlementCounts(
    row?.session_count ?? 0,
    row?.unpaid_session_count ?? 0,
  );
}
