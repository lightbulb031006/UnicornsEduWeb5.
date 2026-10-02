import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassTimelineItemKind } from '../../generated/enums';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import type { ActionHistoryActor } from 'src/course-content/course-content.service';
import type {
  ClassTimelineItemDto,
  ClassTimelinePageDto,
} from 'src/dtos/class-timeline.dto';

/**
 * Include dùng chung cho cả staff và student. `studentId` chỉ lọc `studentAssessments`
 * để lấy đúng nhận xét khảo sát của người đang xem; staff truyền `null` nên khối này
 * luôn rỗng (staff đã có `knowledgeAssessment` của cả lớp).
 */
const timelineInclude = (studentId: string | null) =>
  ({
    session: {
      include: {
        teacher: {
          include: { user: { select: { first_name: true, last_name: true } } },
        },
        class: { select: { name: true } },
        makeupScheduleEvent: { select: { originalDate: true } },
        attendance: {
          include: { student: { select: { fullName: true } } },
        },
      },
    },
    classSurvey: {
      include: {
        survey: true,
        teacher: {
          include: { user: { select: { first_name: true, last_name: true } } },
        },
        _count: { select: { studentAssessments: true } },
        studentAssessments: {
          where: { studentId: studentId ?? '' },
          select: { comment: true },
        },
      },
    },
    classContentItem: {
      include: {
        lesson: true,
      },
    },
  }) satisfies Prisma.ClassTimelineItemInclude;

function findTimelineItems(
  prisma: PrismaService,
  args: Omit<Prisma.ClassTimelineItemFindManyArgs, 'include'>,
  studentId: string | null,
) {
  return prisma.classTimelineItem.findMany({
    ...args,
    include: timelineInclude(studentId),
  });
}

type TimelineRow = Awaited<ReturnType<typeof findTimelineItems>>[number];

@Injectable()
export class ClassTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAccess: StaffOperationsAccessService,
  ) {}

  async listForStaff(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassTimelineItemDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const rows = await findTimelineItems(
      this.prisma,
      {
        where: { classId },
        orderBy: { sortOrder: 'asc' },
      },
      null,
    );
    return rows.map((row) => this.mapItem(row, null));
  }

  async listForStudent(
    classId: string,
    studentId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ClassTimelinePageDto> {
    await this.validateStudentClassAccess(classId, studentId);
    const take = Math.min(Math.max(limit, 1), 50);
    let sortCursor = -1;
    if (cursor) {
      const last = await this.prisma.classTimelineItem.findFirst({
        where: { id: cursor, classId },
        select: { sortOrder: true },
      });
      if (!last) {
        throw new BadRequestException('Invalid timeline cursor');
      }
      sortCursor = last.sortOrder;
    }
    const rows = await findTimelineItems(
      this.prisma,
      {
        where: {
          classId,
          hiddenAt: null,
          OR: [
            { classContentItemId: null },
            { classContentItem: { hiddenAt: null } },
          ],
          ...(cursor ? { sortOrder: { gt: sortCursor } } : {}),
        },
        orderBy: { sortOrder: 'asc' },
        take: take + 1,
      },
      studentId,
    );
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((row) => this.mapItem(row, studentId)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async reorder(
    classId: string,
    orderedIds: string[],
    actor: ActionHistoryActor,
  ): Promise<ClassTimelineItemDto[]> {
    const mode = await this.validateStaffClassAccess(classId, actor);
    if (mode === 'customer_care' || mode === 'training_manager') {
      throw new ForbiddenException('Bạn không được sắp xếp timeline lớp.');
    }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new BadRequestException('orderedIds is required');
    }

    const owned = await this.prisma.classTimelineItem.findMany({
      where: { classId },
      select: { id: true },
    });
    const uniqueOrdered = new Set(orderedIds);
    if (uniqueOrdered.size !== orderedIds.length) {
      throw new BadRequestException(
        'Reorder payload contains duplicate IDs',
      );
    }
    if (owned.length !== orderedIds.length) {
      throw new BadRequestException(
        'Reorder must include every timeline item exactly once',
      );
    }
    const ownedIds = new Set(owned.map((row) => row.id));
    for (const id of orderedIds) {
      if (!ownedIds.has(id)) {
        throw new BadRequestException(
          'Some IDs do not belong to this class timeline',
        );
      }
    }

    await this.prisma.$transaction(
      [
        this.prisma.class.update({
          where: { id: classId },
          data: { timelineCustomOrder: true },
        }),
        ...orderedIds.map((id, idx) =>
          this.prisma.classTimelineItem.update({
            where: { id },
            data: { sortOrder: idx },
          }),
        ),
      ],
    );
    return this.listForStaff(classId, actor);
  }

  async findStudentIdByUserId(userId: string): Promise<string | null> {
    const student = await this.prisma.studentInfo.findUnique({
      where: { userId },
      select: { id: true },
    });
    return student?.id ?? null;
  }

  private mapItem(
    row: TimelineRow,
    studentId: string | null,
  ): ClassTimelineItemDto {
    const isStaffAudience = studentId === null;

    if (row.kind === ClassTimelineItemKind.session && row.session) {
      const teacherName = staffFullName(row.session.teacher);
      const mine = studentId
        ? row.session.attendance.find((a) => a.studentId === studentId)
        : undefined;
      const dateLabel = row.session.date.toISOString().slice(0, 10);
      const staffOnlySession = isStaffAudience
        ? {
            notes: row.session.notes,
            teacherPaymentStatus: row.session.teacherPaymentStatus,
            coefficient: row.session.coefficient
              ? Number(row.session.coefficient)
              : null,
            trainingManagerAllowanceAmount:
              row.session.trainingManagerAllowanceAmount,
            className: row.session.class?.name ?? null,
            makeupOriginalDate:
              row.session.makeupScheduleEvent?.originalDate
                ?.toISOString()
                .slice(0, 10) ?? null,
            teacher: { fullName: teacherName },
            attendance: row.session.attendance.map((item) => ({
              studentId: item.studentId,
              status: item.status as string,
              notes: item.notes,
              student: { fullName: item.student?.fullName ?? null },
            })),
          }
        : {};
      return {
        id: row.id,
        kind: row.kind,
        sortOrder: row.sortOrder,
        title: `Buổi học ${dateLabel}`,
        kindLabel: 'Buổi học',
        occurredAt: row.session.date.toISOString(),
        sessionId: row.session.id,
        classSurveyId: null,
        classContentItemId: null,
        lessonId: null,
        lessonKind: null,
        isOpen: null,
        openAt: null,
        durationMinutes: null,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        session: {
          id: row.session.id,
          date: row.session.date.toISOString(),
          startTime: formatTime(row.session.startTime),
          endTime: formatTime(row.session.endTime),
          lessonContent: row.session.lessonContent,
          homework: row.session.homework,
          tutorial: row.session.tutorial,
          recordingUrl: row.session.recordingUrl,
          teacherName,
          myAttendanceStatus: mine?.status ?? null,
          myAttendanceNotes: mine?.notes ?? null,
          ...staffOnlySession,
        },
        survey: null,
      };
    }

    if (row.kind === ClassTimelineItemKind.class_survey && row.classSurvey) {
      const name = row.classSurvey.survey?.name?.trim() || 'Báo cáo khảo sát';
      return {
        id: row.id,
        kind: row.kind,
        sortOrder: row.sortOrder,
        title: name,
        kindLabel: 'Khảo sát',
        occurredAt: row.classSurvey.reportDate.toISOString(),
        sessionId: null,
        classSurveyId: row.classSurvey.id,
        classContentItemId: null,
        lessonId: null,
        lessonKind: null,
        isOpen: null,
        openAt: null,
        durationMinutes: null,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        session: null,
        survey: {
          id: row.classSurvey.id,
          reportDate: row.classSurvey.reportDate.toISOString(),
          surveyName: row.classSurvey.survey?.name ?? null,
          startDate: row.classSurvey.survey?.startDate?.toISOString() ?? null,
          endDate: row.classSurvey.survey?.endDate?.toISOString() ?? null,
          notificationContent:
            row.classSurvey.survey?.notificationContent ?? null,
          notificationInstructions:
            row.classSurvey.survey?.notificationInstructions ?? null,
          notificationNotes: row.classSurvey.survey?.notificationNotes ?? null,
          notificationTeacherNote:
            row.classSurvey.survey?.notificationTeacherNote ?? null,
          ...(isStaffAudience
            ? {
                testNumber: row.classSurvey.testNumber,
                knowledgeAssessment: row.classSurvey.knowledgeAssessment,
                teacher: { fullName: staffFullName(row.classSurvey.teacher) },
                studentCount: row.classSurvey._count.studentAssessments,
              }
            : {
                myAssessment:
                  row.classSurvey.studentAssessments[0]?.comment ?? null,
              }),
        },
      };
    }

    const content = row.classContentItem;
    const lesson = content?.lesson;
    const lessonKind =
      lesson?.kind === 'practice' ? 'practice' : lesson ? 'theory' : null;
    const isOpen =
      lessonKind === 'practice'
        ? !content?.openAt || content.openAt.getTime() <= Date.now()
        : true;
    return {
      id: row.id,
      kind: ClassTimelineItemKind.content_item,
      sortOrder: row.sortOrder,
      title: lesson?.title ?? 'Tiết học',
      kindLabel: lessonKind === 'practice' ? 'Tiết thực hành' : 'Tiết lý thuyết',
      occurredAt: content?.openAt?.toISOString() ?? null,
      sessionId: null,
      classSurveyId: null,
      classContentItemId: content?.id ?? null,
      lessonId: lesson?.id ?? null,
      lessonKind,
      isOpen,
      openAt: content?.openAt?.toISOString() ?? null,
      durationMinutes: content?.durationMinutes ?? null,
      hiddenAt:
        row.hiddenAt?.toISOString() ??
        content?.hiddenAt?.toISOString() ??
        null,
      session: null,
      survey: null,
    };
  }

  private async validateStaffClassAccess(
    classId: string,
    actor: ActionHistoryActor,
  ) {
    const viewer = await this.staffAccess.resolveClassViewerActor(
      actor.userId,
      actor.roleType,
    );
    return this.staffAccess.resolveClassViewAccessMode(viewer, classId);
  }

  private async validateStudentClassAccess(
    classId: string,
    studentId: string,
  ): Promise<void> {
    const enrollment = await this.prisma.studentClass.findFirst({
      where: { classId, studentId, status: 'active' },
      include: { class: { select: { contentAccessExpiresAt: true } } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this class');
    }
    if (
      enrollment.class.contentAccessExpiresAt &&
      enrollment.class.contentAccessExpiresAt < new Date()
    ) {
      throw new ForbiddenException('This class has expired');
    }
  }
}

/** Ghép họ tên staff từ quan hệ `teacher.user` (StaffInfo không có cột fullName). */
function staffFullName(
  staff: { user?: { first_name: string | null; last_name: string | null } | null } | null,
): string | null {
  if (!staff?.user) return null;
  const name = [staff.user.first_name, staff.user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || null;
}

function formatTime(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(11, 19);
}
