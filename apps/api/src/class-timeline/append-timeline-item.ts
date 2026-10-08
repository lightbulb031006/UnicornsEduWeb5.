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
    return (
      row.classContentItem.openAt ?? row.classContentItem.createdAt
    ).getTime();
  }
  return row.createdAt.getTime();
}

/** Sắp lại sortOrder theo thời gian (mới nhất trên). Timeline lớp không sắp tay. */
export async function syncClassTimelineSortByTime(
  db: Db,
  classId: string,
): Promise<void> {
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

/** Thêm nhiều dòng timeline `content_item` một lượt; chỉ sắp lại theo thời gian một lần. */
export async function appendClassTimelineContentItems(
  db: Db,
  classId: string,
  classContentItemIds: string[],
): Promise<void> {
  if (classContentItemIds.length === 0) return;

  await db.classTimelineItem.createMany({
    data: classContentItemIds.map((classContentItemId) => ({
      classId,
      kind: ClassTimelineItemKind.content_item,
      sortOrder: 0,
      classContentItemId,
    })),
  });
  await syncClassTimelineSortByTime(db, classId);
}
