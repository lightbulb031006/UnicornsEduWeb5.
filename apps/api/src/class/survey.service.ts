import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClassStatus, StaffStatus, UserStatus } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import { NotificationService } from 'src/notification/notification.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AccountantSurveyWarningDto,
  CreateSurveyDto,
  DismissSurveyWarningDto,
  SurveyListDto,
  SurveyMissingClassListDto,
  SurveyRecord,
  SurveyReportedClassListDto,
  TeacherSurveyWarningDto,
  UpdateSurveyDto,
} from 'src/dtos/survey.dto';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textBlockToHtml(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function formatShortDateVi(value: Date | null): string {
  if (!value) return '';
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function buildSurveyNotificationMessageHtml(params: {
  startDate: Date | null;
  endDate: Date | null;
  content: string | null;
  instructions: string | null;
  notes: string | null;
  teacherNote: string | null;
}): string {
  const parts: string[] = [];

  const start = formatShortDateVi(params.startDate);
  const end = formatShortDateVi(params.endDate);
  if (start || end) {
    parts.push(
      `<p><strong>⏰ Thời gian:</strong> ${escapeHtml(start)}${
        start && end ? ' → ' : ''
      }${escapeHtml(end)}</p>`,
    );
  }
  if (params.content?.trim()) {
    parts.push(
      `<p><strong>📌 Nội dung:</strong></p>${textBlockToHtml(params.content.trim())}`,
    );
  }
  if (params.instructions?.trim()) {
    parts.push(
      `<p><strong>📝 Hướng dẫn:</strong></p>${textBlockToHtml(params.instructions.trim())}`,
    );
  }
  if (params.notes?.trim()) {
    parts.push(
      `<p><strong>⚠️ Lưu ý:</strong></p>${textBlockToHtml(params.notes.trim())}`,
    );
  }
  if (params.teacherNote?.trim()) {
    parts.push(
      `<p><strong>📅 Gia sư:</strong></p>${textBlockToHtml(params.teacherNote.trim())}`,
    );
  }

  if (parts.length === 0) {
    parts.push(
      '<p>Vui lòng báo cáo khảo sát cho các lớp đang dạy trong khung thời gian này.</p>',
    );
  }

  return parts.join('');
}

function toDateOnly(value = new Date()): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function parseDateOnly(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} phải có định dạng YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${field} không hợp lệ.`);
  }
  return date;
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly notificationService: NotificationService,
  ) {}

  private async mapSurveyRecord(surveyId: string): Promise<SurveyRecord> {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      include: { excludedClasses: { select: { classId: true } } },
    });
    if (!survey) {
      throw new NotFoundException('Bài khảo sát không tồn tại.');
    }

    const excludedClassIds = survey.excludedClasses.map((row) => row.classId);
    const [totalRunningClasses, reportedCount] = await Promise.all([
      this.prisma.class.count({
        where: {
          status: ClassStatus.running,
          id: { notIn: excludedClassIds },
        },
      }),
      this.prisma.class.count({
        where: {
          status: ClassStatus.running,
          id: { notIn: excludedClassIds },
          surveys: { some: { surveyId } },
        },
      }),
    ]);

    return {
      id: survey.id,
      name: survey.name,
      startDate: toIsoDate(survey.startDate),
      endDate: toIsoDate(survey.endDate),
      notificationTitle: survey.notificationTitle,
      notificationContent: survey.notificationContent,
      notificationInstructions: survey.notificationInstructions,
      notificationNotes: survey.notificationNotes,
      notificationTeacherNote: survey.notificationTeacherNote,
      createdByUserId: survey.createdByUserId,
      createdAt: survey.createdAt.toISOString(),
      updatedAt: survey.updatedAt.toISOString(),
      excludedClassIds,
      totalRunningClasses,
      reportedCount,
      missingCount: Math.max(totalRunningClasses - reportedCount, 0),
    };
  }

  async listSurveys(params: {
    page?: number;
    limit?: number;
  }): Promise<SurveyListDto> {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const [total, surveys] = await Promise.all([
      this.prisma.survey.count({ where: { name: { not: null } } }),
      this.prisma.survey.findMany({
        where: { name: { not: null } },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true },
      }),
    ]);

    const data = await Promise.all(
      surveys.map((survey) => this.mapSurveyRecord(survey.id)),
    );

    return { data, meta: { total, page, limit } };
  }

  async getSurveyById(id: string): Promise<SurveyRecord> {
    return this.mapSurveyRecord(id);
  }

  /** Danh sách bài khảo sát đã mở (startDate <= hôm nay) — dùng cho gia sư chọn khi báo cáo. */
  async listOpenSurveysForReporting(): Promise<
    {
      id: string;
      name: string | null;
      startDate: string | null;
      endDate: string | null;
    }[]
  > {
    const today = toDateOnly();
    const surveys = await this.prisma.survey.findMany({
      where: { name: { not: null }, startDate: { lte: today } },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    return surveys.map((survey) => ({
      id: survey.id,
      name: survey.name,
      startDate: toIsoDate(survey.startDate),
      endDate: toIsoDate(survey.endDate),
    }));
  }

  async createSurvey(
    dto: CreateSurveyDto,
    actor: ActionHistoryActor,
  ): Promise<SurveyRecord> {
    const startDate = parseDateOnly(dto.start_date, 'Ngày bắt đầu');
    const endDate = parseDateOnly(dto.end_date, 'Ngày kết thúc');
    if (endDate < startDate) {
      throw new BadRequestException(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const survey = await tx.survey.create({
        data: {
          name: dto.name.trim(),
          startDate,
          endDate,
          notificationTitle: dto.notification_title?.trim() || null,
          notificationContent: dto.notification_content?.trim() || null,
          notificationInstructions:
            dto.notification_instructions?.trim() || null,
          notificationNotes: dto.notification_notes?.trim() || null,
          notificationTeacherNote:
            dto.notification_teacher_note?.trim() || null,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
          excludedClasses: dto.excluded_class_ids?.length
            ? {
                create: dto.excluded_class_ids.map((classId) => ({ classId })),
              }
            : undefined,
        },
      });

      await this.actionHistoryService.recordCreate(tx, {
        actor,
        entityType: 'survey',
        entityId: survey.id,
        description: 'Tạo bài khảo sát',
        afterValue: survey,
      });

      return survey.id;
    });

    await this.notifyRelevantTeachers(
      {
        name: dto.name.trim(),
        startDate,
        endDate,
        content: dto.notification_content ?? null,
        instructions: dto.notification_instructions ?? null,
        notes: dto.notification_notes ?? null,
        teacherNote: dto.notification_teacher_note ?? null,
      },
      dto.excluded_class_ids ?? [],
      actor,
    );

    return this.mapSurveyRecord(created);
  }

  /** Push thông báo (chuông FE) cho các gia sư có ít nhất 1 lớp đang running cần báo cáo bài khảo sát mới tạo. */
  private async notifyRelevantTeachers(
    survey: {
      name: string;
      startDate: Date;
      endDate: Date;
      content: string | null;
      instructions: string | null;
      notes: string | null;
      teacherNote: string | null;
    },
    excludedClassIds: string[],
    actor: ActionHistoryActor,
  ): Promise<void> {
    if (!actor.userId) return;
    const notificationActor = { ...actor, userId: actor.userId };

    try {
      const teacherUserIds =
        await this.getRelevantTeacherUserIds(excludedClassIds);
      if (teacherUserIds.length === 0) return;

      const draft = await this.notificationService.createNotificationDraft(
        {
          title: survey.name,
          message: buildSurveyNotificationMessageHtml(survey),
          targetAll: false,
          targetUserIds: teacherUserIds,
        },
        notificationActor,
      );
      await this.notificationService.pushNotification(
        draft.id,
        {},
        notificationActor,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify teachers about new survey "${survey.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Danh sách userId của gia sư đang phụ trách ít nhất 1 lớp running chưa bị loại trừ. */
  private async getRelevantTeacherUserIds(
    excludedClassIds: string[],
  ): Promise<string[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        status: ClassStatus.running,
        id: { notIn: excludedClassIds },
      },
      select: {
        teachers: {
          select: {
            teacher: {
              select: {
                status: true,
                userId: true,
                user: { select: { status: true } },
              },
            },
          },
        },
      },
    });

    const userIds = new Set<string>();
    for (const classItem of classes) {
      for (const entry of classItem.teachers) {
        const teacher = entry.teacher;
        if (
          teacher?.userId &&
          teacher.status === StaffStatus.active &&
          teacher.user?.status === UserStatus.active
        ) {
          userIds.add(teacher.userId);
        }
      }
    }
    return Array.from(userIds);
  }

  async updateSurvey(
    id: string,
    dto: UpdateSurveyDto,
    actor: ActionHistoryActor,
  ): Promise<SurveyRecord> {
    const before = await this.prisma.survey.findUnique({ where: { id } });
    if (!before || before.name == null) {
      throw new NotFoundException('Bài khảo sát không tồn tại.');
    }

    const startDate = dto.start_date
      ? parseDateOnly(dto.start_date, 'Ngày bắt đầu')
      : before.startDate;
    const endDate = dto.end_date
      ? parseDateOnly(dto.end_date, 'Ngày kết thúc')
      : before.endDate;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.survey.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.start_date !== undefined ? { startDate } : {}),
          ...(dto.end_date !== undefined ? { endDate } : {}),
          ...(dto.notification_title !== undefined
            ? { notificationTitle: dto.notification_title?.trim() || null }
            : {}),
          ...(dto.notification_content !== undefined
            ? { notificationContent: dto.notification_content?.trim() || null }
            : {}),
          ...(dto.notification_instructions !== undefined
            ? {
                notificationInstructions:
                  dto.notification_instructions?.trim() || null,
              }
            : {}),
          ...(dto.notification_notes !== undefined
            ? { notificationNotes: dto.notification_notes?.trim() || null }
            : {}),
          ...(dto.notification_teacher_note !== undefined
            ? {
                notificationTeacherNote:
                  dto.notification_teacher_note?.trim() || null,
              }
            : {}),
          updatedByUserId: actor.userId,
        },
      });

      if (dto.excluded_class_ids !== undefined) {
        await tx.surveyExcludedClass.deleteMany({ where: { surveyId: id } });
        if (dto.excluded_class_ids.length) {
          await tx.surveyExcludedClass.createMany({
            data: dto.excluded_class_ids.map((classId) => ({
              surveyId: id,
              classId,
            })),
          });
        }
      }

      await this.actionHistoryService.recordUpdate(tx, {
        actor,
        entityType: 'survey',
        entityId: id,
        description: 'Cập nhật bài khảo sát',
        beforeValue: before,
        afterValue: updated,
      });
    });

    return this.mapSurveyRecord(id);
  }

  async deleteSurvey(
    id: string,
    actor: ActionHistoryActor,
  ): Promise<{ success: true }> {
    const before = await this.prisma.survey.findUnique({ where: { id } });
    if (!before || before.name == null) {
      throw new NotFoundException('Bài khảo sát không tồn tại.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.survey.delete({ where: { id } });
      await this.actionHistoryService.recordDelete(tx, {
        actor,
        entityType: 'survey',
        entityId: id,
        description: 'Xóa bài khảo sát',
        beforeValue: before,
      });
    });

    return { success: true };
  }

  async getMissingClasses(
    surveyId: string,
    params: { page?: number; limit?: number },
  ): Promise<SurveyMissingClassListDto> {
    const excluded = await this.prisma.surveyExcludedClass.findMany({
      where: { surveyId },
      select: { classId: true },
    });
    const excludedIds = excluded.map((row) => row.classId);
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const where = {
      status: ClassStatus.running,
      id: { notIn: excludedIds },
      surveys: { none: { surveyId } },
    } as const;

    const [total, classes] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          teachers: {
            select: {
              teacher: {
                select: {
                  user: { select: { first_name: true, last_name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: classes.map((item) => ({
        classId: item.id,
        name: item.name,
        teachers: item.teachers
          .map((entry) => getUserFullNameFromParts(entry.teacher?.user))
          .filter((name): name is string => Boolean(name && name.trim())),
      })),
      meta: { total, page, limit },
    };
  }

  async getReportedClasses(
    surveyId: string,
    params: { page?: number; limit?: number },
  ): Promise<SurveyReportedClassListDto> {
    const excluded = await this.prisma.surveyExcludedClass.findMany({
      where: { surveyId },
      select: { classId: true },
    });
    const excludedIds = excluded.map((row) => row.classId);
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const where = {
      status: ClassStatus.running,
      id: { notIn: excludedIds },
      surveys: { some: { surveyId } },
    } as const;

    const [total, classes] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          teachers: {
            select: {
              teacher: {
                select: {
                  user: { select: { first_name: true, last_name: true } },
                },
              },
            },
          },
          surveys: {
            where: { surveyId },
            orderBy: { reportDate: 'desc' },
            take: 1,
            select: {
              reportDate: true,
              knowledgeAssessment: true,
              teacher: {
                select: {
                  user: { select: { first_name: true, last_name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: classes.map((item) => {
        const latestSurvey = item.surveys[0];
        return {
          classId: item.id,
          name: item.name,
          teachers: item.teachers
            .map((entry) => getUserFullNameFromParts(entry.teacher?.user))
            .filter((name): name is string => Boolean(name && name.trim())),
          reportDate: latestSurvey?.reportDate
            ? latestSurvey.reportDate.toISOString().slice(0, 10)
            : null,
          reportedByTeacherName: latestSurvey?.teacher?.user
            ? getUserFullNameFromParts(latestSurvey.teacher.user)
            : null,
          knowledgeAssessment: latestSurvey?.knowledgeAssessment ?? null,
        };
      }),
      meta: { total, page, limit },
    };
  }

  /** Cảnh báo cho gia sư: các lớp đang running mình phụ trách còn thiếu báo cáo bài khảo sát đã mở (kể cả quá hạn). */
  async getTeacherWarnings(
    staffId: string,
  ): Promise<TeacherSurveyWarningDto[]> {
    const today = toDateOnly();

    const [classes, openSurveys] = await Promise.all([
      this.prisma.class.findMany({
        where: {
          status: ClassStatus.running,
          teachers: { some: { teacherId: staffId } },
        },
        select: { id: true, name: true },
      }),
      this.prisma.survey.findMany({
        where: { name: { not: null }, startDate: { lte: today } },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          excludedClasses: { select: { classId: true } },
        },
      }),
    ]);

    if (!classes.length || !openSurveys.length) {
      return [];
    }

    const classIds = classes.map((item) => item.id);
    const reportedRows = await this.prisma.classSurvey.findMany({
      where: {
        classId: { in: classIds },
        surveyId: { in: openSurveys.map((survey) => survey.id) },
      },
      select: { classId: true, surveyId: true },
    });
    const reportedKeys = new Set(
      reportedRows.map((row) => `${row.classId}::${row.surveyId}`),
    );

    const warnings: TeacherSurveyWarningDto[] = [];
    for (const classItem of classes) {
      const pendingSurveys = openSurveys
        .filter(
          (survey) =>
            !survey.excludedClasses.some((e) => e.classId === classItem.id),
        )
        .filter((survey) => !reportedKeys.has(`${classItem.id}::${survey.id}`))
        .map((survey) => ({
          surveyId: survey.id,
          name: survey.name ?? '',
          startDate: toIsoDate(survey.startDate),
          endDate: toIsoDate(survey.endDate),
        }));

      if (pendingSurveys.length) {
        warnings.push({
          classId: classItem.id,
          className: classItem.name,
          pendingSurveys,
        });
      }
    }

    return warnings.sort((a, b) => a.className.localeCompare(b.className));
  }

  /** Cảnh báo cho kế toán chi: nhân sự (gia sư) chưa báo cáo bài khảo sát đã quá hạn (endDate < hôm nay). */
  async getAccountantWarnings(
    viewerUserId: string,
  ): Promise<AccountantSurveyWarningDto[]> {
    const today = toDateOnly();

    const closedSurveys = await this.prisma.survey.findMany({
      where: { name: { not: null }, endDate: { lt: today } },
      orderBy: { endDate: 'desc' },
      select: {
        id: true,
        name: true,
        endDate: true,
        excludedClasses: { select: { classId: true } },
      },
    });
    if (!closedSurveys.length) {
      return [];
    }

    const dismissals = await this.prisma.surveyWarningDismissal.findMany({
      where: { userId: viewerUserId, permanent: true },
      select: { staffId: true, surveyId: true },
    });
    const dismissedKeys = new Set(
      dismissals.map((row) => `${row.staffId}::${row.surveyId}`),
    );

    const runningClasses = await this.prisma.class.findMany({
      where: { status: ClassStatus.running },
      select: {
        id: true,
        name: true,
        teachers: {
          select: {
            teacher: {
              select: {
                id: true,
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });
    if (!runningClasses.length) {
      return [];
    }

    const classIds = runningClasses.map((item) => item.id);
    const reportedRows = await this.prisma.classSurvey.findMany({
      where: {
        classId: { in: classIds },
        surveyId: { in: closedSurveys.map((survey) => survey.id) },
      },
      select: { classId: true, surveyId: true },
    });
    const reportedKeys = new Set(
      reportedRows.map((row) => `${row.classId}::${row.surveyId}`),
    );

    type Bucket = {
      staffId: string;
      staffName: string;
      surveyId: string;
      surveyName: string;
      endDate: string | null;
      classes: { classId: string; name: string }[];
    };
    const buckets = new Map<string, Bucket>();

    for (const survey of closedSurveys) {
      const excludedIds = new Set(survey.excludedClasses.map((e) => e.classId));
      for (const classItem of runningClasses) {
        if (excludedIds.has(classItem.id)) continue;
        if (reportedKeys.has(`${classItem.id}::${survey.id}`)) continue;

        for (const entry of classItem.teachers) {
          const teacher = entry.teacher;
          if (!teacher) continue;
          const key = `${teacher.id}::${survey.id}`;
          if (dismissedKeys.has(key)) continue;

          const bucket =
            buckets.get(key) ??
            ({
              staffId: teacher.id,
              staffName: getUserFullNameFromParts(teacher.user) ?? teacher.id,
              surveyId: survey.id,
              surveyName: survey.name ?? '',
              endDate: toIsoDate(survey.endDate),
              classes: [],
            } as Bucket);
          bucket.classes.push({ classId: classItem.id, name: classItem.name });
          buckets.set(key, bucket);
        }
      }
    }

    return Array.from(buckets.values()).sort(
      (a, b) =>
        a.staffName.localeCompare(b.staffName) ||
        a.surveyName.localeCompare(b.surveyName),
    );
  }

  async dismissWarning(
    viewerUserId: string,
    dto: DismissSurveyWarningDto,
  ): Promise<{ success: true }> {
    await this.prisma.surveyWarningDismissal.upsert({
      where: {
        userId_staffId_surveyId: {
          userId: viewerUserId,
          staffId: dto.staff_id,
          surveyId: dto.survey_id,
        },
      },
      update: { permanent: dto.permanent ?? true },
      create: {
        userId: viewerUserId,
        staffId: dto.staff_id,
        surveyId: dto.survey_id,
        permanent: dto.permanent ?? true,
      },
    });
    return { success: true };
  }
}
