import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole, StudentClassStatus, UserRole, ClassTimelineItemKind } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import {
  CreateClassSurveyDto,
  UpdateClassSurveyDto,
} from 'src/dtos/class-survey.dto';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import { appendClassTimelineItem, syncClassTimelineSortByTime } from 'src/class-timeline/append-timeline-item';

type SurveyMonthQuery = {
  month: string;
  year: string;
};

const SURVEY_INCLUDE = {
  teacher: {
    select: {
      id: true,
      status: true,
      user: {
        select: {
          first_name: true,
          last_name: true,
        },
      },
    },
  },
  survey: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  },
  studentAssessments: {
    include: {
      student: {
        select: {
          id: true,
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClassSurveyInclude;

type ClassSurveyWithTeacher = Prisma.ClassSurveyGetPayload<{
  include: typeof SURVEY_INCLUDE;
}>;

function toDateOnly(value = new Date()): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function parseDateOnly(value?: string): Date {
  if (!value) {
    return toDateOnly();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Ngày báo cáo phải có định dạng YYYY-MM-DD.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('Ngày báo cáo không hợp lệ.');
  }

  return date;
}

function parseMonthRange(query: SurveyMonthQuery) {
  const month = Number(query.month);
  const year = Number(query.year);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException('Năm khảo sát không hợp lệ.');
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('Tháng khảo sát không hợp lệ.');
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

@Injectable()
export class ClassSurveyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private mapSurvey(record: ClassSurveyWithTeacher) {
    return {
      id: record.id,
      classId: record.classId,
      surveyId: record.surveyId,
      survey: record.survey
        ? {
            id: record.survey.id,
            name: record.survey.name,
            startDate: record.survey.startDate,
            endDate: record.survey.endDate,
          }
        : null,
      testNumber: record.testNumber,
      teacherId: record.teacherId,
      reportDate: record.reportDate,
      content: record.content,
      knowledgeAssessment: record.knowledgeAssessment,
      createdAt: record.createdAt,
      teacher: record.teacher
        ? {
            id: record.teacher.id,
            fullName: getUserFullNameFromParts(record.teacher.user),
            status: record.teacher.status,
          }
        : null,
      students: record.studentAssessments.map((assessment) => ({
        studentId: assessment.studentId,
        fullName: getUserFullNameFromParts(assessment.student.user),
        comment: assessment.comment,
      })),
    };
  }

  private async assertClassExists(classId: string) {
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
  }

  private async assertTeacherBelongsToClass(
    classId: string,
    teacherId: string,
  ) {
    const classTeacher = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId,
          teacherId,
        },
      },
      select: {
        classId: true,
        teacherId: true,
      },
    });

    if (!classTeacher) {
      throw new BadRequestException('Người phụ trách phải là gia sư của lớp.');
    }
  }

  private async assertSurveyExists(surveyId: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { id: surveyId },
      select: { id: true },
    });

    if (!survey) {
      throw new NotFoundException('Bài khảo sát không tồn tại.');
    }
  }

  /** Roster học sinh đang học của lớp — dùng để validate + hiển thị form báo cáo. */
  private async getActiveStudentIds(classId: string): Promise<Set<string>> {
    const rows = await this.prisma.studentClass.findMany({
      where: { classId, status: StudentClassStatus.active },
      select: { studentId: true },
    });
    return new Set(rows.map((row) => row.studentId));
  }

  private async validateStudentRoster(
    classId: string,
    students: { student_id: string }[],
  ) {
    if (!students.length) {
      throw new BadRequestException(
        'Báo cáo khảo sát phải có ít nhất một học sinh.',
      );
    }

    const activeStudentIds = await this.getActiveStudentIds(classId);
    const invalid = students.filter(
      (item) => !activeStudentIds.has(item.student_id),
    );
    if (invalid.length) {
      throw new BadRequestException(
        'Chỉ được đánh giá học sinh đang học của lớp.',
      );
    }
  }

  private async assertNoExistingReport(classId: string, surveyId: string) {
    const existing = await this.prisma.classSurvey.findFirst({
      where: { classId, surveyId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Lớp này đã có báo cáo cho bài khảo sát này. Vui lòng chỉnh sửa báo cáo hiện có.',
      );
    }
  }

  private async getSurveyOrThrow(classId: string, surveyId: string) {
    const survey = await this.prisma.classSurvey.findUnique({
      where: { id: surveyId },
      include: SURVEY_INCLUDE,
    });

    if (!survey || survey.classId !== classId) {
      throw new NotFoundException('Class survey not found');
    }

    return survey;
  }

  async getClassSurveys(classId: string, query: SurveyMonthQuery) {
    await this.assertClassExists(classId);
    const { start, end } = parseMonthRange(query);

    const surveys = await this.prisma.classSurvey.findMany({
      where: {
        classId,
        reportDate: {
          gte: start,
          lt: end,
        },
      },
      include: SURVEY_INCLUDE,
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    });

    return surveys.map((survey) => this.mapSurvey(survey));
  }

  async createClassSurvey(
    classId: string,
    dto: CreateClassSurveyDto,
    auditActor?: ActionHistoryActor,
  ) {
    await this.assertClassExists(classId);
    await this.assertSurveyExists(dto.survey_id);
    await this.assertTeacherBelongsToClass(classId, dto.teacher_id);
    await this.assertNoExistingReport(classId, dto.survey_id);
    await this.validateStudentRoster(classId, dto.students);

    return this.prisma.$transaction(async (tx) => {
      const createdSurvey = await tx.classSurvey.create({
        data: {
          classId,
          surveyId: dto.survey_id,
          teacherId: dto.teacher_id,
          reportDate: parseDateOnly(dto.report_date),
          knowledgeAssessment: dto.knowledge_assessment?.trim() || null,
          studentAssessments: {
            create: dto.students.map((item) => ({
              studentId: item.student_id,
              comment: item.comment?.trim() || null,
            })),
          },
        },
        include: SURVEY_INCLUDE,
      });

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'class_survey',
          entityId: createdSurvey.id,
          description: 'Tạo báo cáo khảo sát lớp học',
          afterValue: createdSurvey,
        });
      }

      await appendClassTimelineItem(tx, {
        classId,
        kind: ClassTimelineItemKind.class_survey,
        classSurveyId: createdSurvey.id,
      });

      return this.mapSurvey(createdSurvey);
    });
  }

  async updateClassSurvey(
    classId: string,
    surveyId: string,
    dto: UpdateClassSurveyDto,
    auditActor?: ActionHistoryActor,
  ) {
    const beforeValue = await this.getSurveyOrThrow(classId, surveyId);

    if (dto.teacher_id !== undefined) {
      await this.assertTeacherBelongsToClass(classId, dto.teacher_id);
    }
    if (dto.students !== undefined) {
      await this.validateStudentRoster(classId, dto.students);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.students !== undefined) {
        await tx.classSurveyStudentAssessment.deleteMany({
          where: { classSurveyId: surveyId },
        });
      }

      const updatedSurvey = await tx.classSurvey.update({
        where: { id: surveyId },
        data: {
          ...(dto.teacher_id !== undefined
            ? { teacherId: dto.teacher_id }
            : {}),
          ...(dto.report_date !== undefined
            ? { reportDate: parseDateOnly(dto.report_date) }
            : {}),
          ...(dto.knowledge_assessment !== undefined
            ? { knowledgeAssessment: dto.knowledge_assessment?.trim() || null }
            : {}),
          ...(dto.students !== undefined
            ? {
                studentAssessments: {
                  create: dto.students.map((item) => ({
                    studentId: item.student_id,
                    comment: item.comment?.trim() || null,
                  })),
                },
              }
            : {}),
        },
        include: SURVEY_INCLUDE,
      });

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class_survey',
          entityId: surveyId,
          description: 'Cập nhật báo cáo khảo sát lớp học',
          beforeValue,
          afterValue: updatedSurvey,
        });
      }

      if (dto.report_date !== undefined) {
        await syncClassTimelineSortByTime(tx, classId);
      }

      return this.mapSurvey(updatedSurvey);
    });
  }

  async deleteClassSurvey(
    classId: string,
    surveyId: string,
    auditActor?: ActionHistoryActor,
  ) {
    const beforeValue = await this.getSurveyOrThrow(classId, surveyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.classSurvey.delete({
        where: { id: surveyId },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'class_survey',
          entityId: surveyId,
          description: 'Xóa báo cáo khảo sát lớp học',
          beforeValue,
        });
      }
    });

    return { success: true };
  }

  async getClassSurveysForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    query: SurveyMonthQuery,
  ) {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    await this.staffOperationsAccess.resolveClassViewAccessMode(actor, classId);

    return this.getClassSurveys(classId, query);
  }

  private async resolveStaffSurveyManager(
    userId: string,
    roleType: UserRole,
    classId: string,
  ) {
    if (roleType === UserRole.admin) {
      return { actorId: null, teacherScoped: false };
    }

    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );

    if (
      actor.roles.includes(StaffRole.admin) ||
      actor.roles.includes(StaffRole.assistant)
    ) {
      return { actorId: actor.id, teacherScoped: false };
    }

    if (actor.roles.includes(StaffRole.teacher)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        classId,
      );
      return { actorId: actor.id, teacherScoped: true };
    }

    throw new ForbiddenException(
      'Bạn không có quyền quản lý khảo sát của lớp này.',
    );
  }

  async createClassSurveyForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    dto: CreateClassSurveyDto,
    auditActor?: ActionHistoryActor,
  ) {
    const access = await this.resolveStaffSurveyManager(
      userId,
      roleType,
      classId,
    );
    if (access.teacherScoped && dto.teacher_id !== access.actorId) {
      throw new ForbiddenException(
        'Teacher chỉ được tạo khảo sát với chính mình là người phụ trách.',
      );
    }

    return this.createClassSurvey(classId, dto, auditActor);
  }

  async updateClassSurveyForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    surveyId: string,
    dto: UpdateClassSurveyDto,
    auditActor?: ActionHistoryActor,
  ) {
    const access = await this.resolveStaffSurveyManager(
      userId,
      roleType,
      classId,
    );
    if (access.teacherScoped) {
      const survey = await this.getSurveyOrThrow(classId, surveyId);
      if (survey.teacherId !== access.actorId) {
        throw new ForbiddenException(
          'Teacher chỉ được chỉnh sửa khảo sát do chính mình phụ trách.',
        );
      }
      if (dto.teacher_id !== undefined && dto.teacher_id !== access.actorId) {
        throw new ForbiddenException(
          'Teacher chỉ được tạo khảo sát với chính mình là người phụ trách.',
        );
      }
    }

    return this.updateClassSurvey(classId, surveyId, dto, auditActor);
  }

  async deleteClassSurveyForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    surveyId: string,
    auditActor?: ActionHistoryActor,
  ) {
    const access = await this.resolveStaffSurveyManager(
      userId,
      roleType,
      classId,
    );
    if (access.teacherScoped) {
      const survey = await this.getSurveyOrThrow(classId, surveyId);
      if (survey.teacherId !== access.actorId) {
        throw new ForbiddenException(
          'Teacher chỉ được xóa khảo sát do chính mình phụ trách.',
        );
      }
    }

    return this.deleteClassSurvey(classId, surveyId, auditActor);
  }
}
