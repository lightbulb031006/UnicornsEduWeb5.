import { Prisma } from '../../generated/client';
import { ClassTimelineItemKind } from '../../generated/enums';
import { PrismaService } from 'src/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

function timelineOccurredMs(row: {
  createdAt: Date;
  session: { date: Date; startTime: Date | null } | null;
  classSurvey: { reportDate: Date } | null;
  classContentItem: { openAt: Date | null; createdAt: Date } | null;
}): number {
  if (row.session) {
    const date = row.session.date;
    const time = row.session.startTime;
    if (time) {
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        time.getUTCHours(),
        time.getUTCMinutes(),
        time.getUTCSeconds(),
      );
    }
    return date.getTime();
  }
  if (row.classSurvey) {
    return row.classSurvey.reportDate.getTime();
  }
  if (row.classContentItem) {
    return (row.classContentItem.openAt ?? row.classContentItem.createdAt).getTime();
  }
  return row.createdAt.getTime();
}

/** Keep sortOrder chronological until the class has a manual DnD order. */
export async function syncClassTimelineSortByTime(
  db: Db,
  classId: string,
): Promise<void> {
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { timelineCustomOrder: true },
  });
  if (!cls || cls.timelineCustomOrder) return;

  const rows = await db.classTimelineItem.findMany({
    where: { classId },
    include: {
      session: { select: { date: true, startTime: true } },
      classSurvey: { select: { reportDate: true } },
      classContentItem: { select: { openAt: true, createdAt: true } },
    },
  });

  const ordered = rows.toSorted((a, b) => {
    const byTime = timelineOccurredMs(b) - timelineOccurredMs(a);
    if (byTime !== 0) return byTime;
    const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
    if (byCreated !== 0) return byCreated;
    return b.id.localeCompare(a.id);
  });

  // Sequential updates on the caller tx: a throw rolls back every sortOrder
  // write. Parallel Promise.all is unsafe on Prisma interactive transactions.
  for (let idx = 0; idx < ordered.length; idx++) {
    const row = ordered[idx];
    if (row.sortOrder === idx) continue;
    await db.classTimelineItem.update({
      where: { id: row.id },
      data: { sortOrder: idx },
    });
  }
}

export async function appendClassTimelineItem(
  db: Db,
  input: {
    classId: string;
    kind: ClassTimelineItemKind;
    sessionId?: string;
    classSurveyId?: string;
    classContentItemId?: string;
  },
): Promise<void> {
  const cls = await db.class.findUnique({
    where: { id: input.classId },
    select: { timelineCustomOrder: true },
  });
  const custom = Boolean(cls?.timelineCustomOrder);

  if (custom) {
    const maxSort = await db.classTimelineItem.aggregate({
      where: { classId: input.classId },
      _max: { sortOrder: true },
    });
    await db.classTimelineItem.create({
      data: {
        classId: input.classId,
        kind: input.kind,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        sessionId: input.sessionId ?? null,
        classSurveyId: input.classSurveyId ?? null,
        classContentItemId: input.classContentItemId ?? null,
      },
    });
    return;
  }

  await db.classTimelineItem.create({
    data: {
      classId: input.classId,
      kind: input.kind,
      sortOrder: 0,
      sessionId: input.sessionId ?? null,
      classSurveyId: input.classSurveyId ?? null,
      classContentItemId: input.classContentItemId ?? null,
    },
  });
  await syncClassTimelineSortByTime(db, input.classId);
}
