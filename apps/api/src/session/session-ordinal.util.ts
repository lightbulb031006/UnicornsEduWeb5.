import { Prisma } from '../../generated/client';

type OrdinalDb = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Prisma.PrismaPromise<T>;
};

/**
 * Số thứ tự buổi trong lớp: suy ra, không lưu. Xếp theo ngày → giờ bắt đầu
 * (buổi chưa có giờ lên trước) → thời điểm tạo, tính cả buổi bù.
 */
export async function loadSessionOrdinals(
  db: OrdinalDb,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(sessionIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = await db.$queryRaw<Array<{ id: string; ordinal: number }>>(
    Prisma.sql`
      SELECT ranked.id, ranked.ordinal::int AS ordinal
      FROM (
        SELECT
          s.id,
          ROW_NUMBER() OVER (
            PARTITION BY s.class_id
            ORDER BY s.date, s.start_time NULLS FIRST, s.created_at, s.id
          ) AS ordinal
        FROM sessions s
        WHERE s.class_id IN (
          SELECT DISTINCT class_id FROM sessions WHERE id IN (${Prisma.join(uniqueIds)})
        )
      ) ranked
      WHERE ranked.id IN (${Prisma.join(uniqueIds)})
    `,
  );

  return new Map(rows.map((row) => [row.id, Number(row.ordinal)]));
}

export async function withSessionOrdinals<T extends { id: string }>(
  db: OrdinalDb,
  sessions: T[],
): Promise<Array<T & { ordinal: number | null }>> {
  const ordinals = await loadSessionOrdinals(
    db,
    sessions.map((session) => session.id),
  );
  return sessions.map((session) => ({
    ...session,
    ordinal: ordinals.get(session.id) ?? null,
  }));
}

/**
 * Số thứ tự buổi sẽ nhận nếu tạo mới tại (date, startTime). Buổi mới tạo sau
 * nên đứng sau các buổi trùng ngày + giờ đã có.
 */
export async function previewNextSessionOrdinal(
  db: OrdinalDb,
  classId: string,
  /** YYYY-MM-DD */
  date: string,
  /** HH:mm hoặc HH:mm:ss, null = chưa có giờ */
  startTime: string | null,
): Promise<number> {
  const startTimeCondition = startTime
    ? Prisma.sql`(s.start_time IS NULL OR s.start_time <= ${startTime}::time)`
    : Prisma.sql`s.start_time IS NULL`;

  const [row] = await db.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM sessions s
      WHERE s.class_id = ${classId}
        AND (
          s.date < ${date}::date
          OR (s.date = ${date}::date AND ${startTimeCondition})
        )
    `,
  );

  return Number(row?.count ?? 0) + 1;
}
