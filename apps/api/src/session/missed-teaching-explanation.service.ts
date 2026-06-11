import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassStatus } from '../../generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionScheduleRulesService } from './session-schedule-rules.service';

export interface MissedTeachingExplanationRecord {
  id: string;
  classId: string;
  teacherId: string;
  baselineScheduleEntryId: string;
  originalDate: string;
  reason: string;
  explainedAt: string;
  explainedByName: string | null;
}

export interface CreateMissedTeachingExplanationInput {
  scheduleEntryId: string;
  originalDate: string;
  teacherId: string;
  reason: string;
}

export interface UpdateMissedTeachingExplanationInput {
  reason: string;
}

function isActiveClassTeacherStatus(status: string | null | undefined): boolean {
  return status == null || status === 'active';
}

@Injectable()
export class MissedTeachingExplanationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionScheduleRulesService: SessionScheduleRulesService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  async createExplanationForClass(
    classId: string,
    dto: CreateMissedTeachingExplanationInput,
    actor?: ActionHistoryActor,
    options?: { restrictTeacherId?: string },
  ): Promise<MissedTeachingExplanationRecord> {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Vui lòng nhập lý do giải trình.');
    }

    if (
      options?.restrictTeacherId &&
      dto.teacherId !== options.restrictTeacherId
    ) {
      throw new ForbiddenException(
        'Teacher chỉ được giải trình cho buổi học do chính mình phụ trách.',
      );
    }

    await this.assertClassAndTeacherActive(classId, dto.teacherId);
    await this.assertOccurrenceIsMissedAlert(classId, dto);

    const existing = await this.prisma.missedTeachingExplanation.findUnique({
      where: {
        classId_baselineScheduleEntryId_originalDate: {
          classId,
          baselineScheduleEntryId: dto.scheduleEntryId,
          originalDate: this.parseDateOnly(dto.originalDate),
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Buổi học gốc này đã có giải trình vắng.',
      );
    }

    const explainedByStaffId = options?.restrictTeacherId ?? null;

    const created = await this.prisma.missedTeachingExplanation.create({
      data: {
        classId,
        teacherId: dto.teacherId,
        baselineScheduleEntryId: dto.scheduleEntryId,
        originalDate: this.parseDateOnly(dto.originalDate),
        reason,
        explainedByStaffId,
        explainedByUserId: actor?.userId ?? null,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (actor) {
      await this.actionHistoryService.recordCreate(this.prisma, {
        actor,
        entityType: 'missed_teaching_explanation',
        entityId: created.id,
        description: 'Lưu giải trình vắng buổi học gốc',
        afterValue: {
          classId,
          teacherId: dto.teacherId,
          baselineScheduleEntryId: dto.scheduleEntryId,
          originalDate: dto.originalDate,
        },
      });
    }

    const explainedByName = actor?.userId
      ? await this.resolveUserName(actor.userId)
      : null;

    return {
      ...this.serializeExplanation(created),
      explainedByName,
    };
  }

  async updateExplanation(
    id: string,
    dto: UpdateMissedTeachingExplanationInput,
    actor?: ActionHistoryActor,
    options?: { restrictTeacherId?: string },
  ): Promise<MissedTeachingExplanationRecord> {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Vui lòng nhập lý do giải trình.');
    }

    const existing = await this.prisma.missedTeachingExplanation.findUnique({
      where: { id },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy giải trình vắng.');
    }

    if (
      options?.restrictTeacherId &&
      existing.teacherId !== options.restrictTeacherId
    ) {
      throw new ForbiddenException(
        'Teacher chỉ được sửa giải trình cho buổi học do chính mình phụ trách.',
      );
    }

    await this.assertNoMakeupForOccurrence(
      existing.classId,
      existing.baselineScheduleEntryId,
      existing.originalDate,
    );

    const updated = await this.prisma.missedTeachingExplanation.update({
      where: { id },
      data: { reason },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (actor) {
      await this.actionHistoryService.recordUpdate(this.prisma, {
        actor,
        entityType: 'missed_teaching_explanation',
        entityId: id,
        description: 'Cập nhật giải trình vắng buổi học gốc',
        beforeValue: { reason: existing.reason },
        afterValue: { reason: updated.reason },
      });
    }

    const explainedByName = actor?.userId
      ? await this.resolveUserName(actor.userId)
      : null;

    return {
      ...this.serializeExplanation(updated),
      explainedByName,
    };
  }

  async assertExplanationExists(
    classId: string,
    baselineScheduleEntryId: string,
    originalDate: Date,
  ): Promise<void> {
    const explanation = await this.prisma.missedTeachingExplanation.findUnique({
      where: {
        classId_baselineScheduleEntryId_originalDate: {
          classId,
          baselineScheduleEntryId,
          originalDate,
        },
      },
    });

    if (!explanation) {
      throw new BadRequestException(
        'Vui lòng lưu giải trình vắng cho buổi học gốc trước khi xếp lịch bù.',
      );
    }
  }

  async findExplanationMapForAlerts(
    occurrences: Array<{
      classId: string;
      teacherId: string;
      scheduleEntryId: string;
      originalDate: string;
    }>,
  ) {
    if (occurrences.length === 0) {
      return new Map<
        string,
        {
          id: string;
          reason: string;
          explainedAt: Date;
          explainedByName: string | null;
        }
      >();
    }

    const classIds = [...new Set(occurrences.map((item) => item.classId))];
    const explanations = await this.prisma.missedTeachingExplanation.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        baselineScheduleEntryId: true,
        originalDate: true,
        reason: true,
        createdAt: true,
        explainedByUserId: true,
      },
    });

    const userIds = [
      ...new Set(
        explanations
          .map((item) => item.explainedByUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          })
        : [];
    const userNameById = new Map(
      users.map((user) => [
        user.id,
        [user.first_name, user.last_name]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(' ')
          .trim() || user.email || null,
      ]),
    );

    const map = new Map<
      string,
      {
        id: string;
        reason: string;
        explainedAt: Date;
        explainedByName: string | null;
      }
    >();
    for (const explanation of explanations) {
      const dateKey = this.formatDate(explanation.originalDate);
      const key = this.buildOccurrenceKey({
        classId: explanation.classId,
        teacherId: explanation.teacherId,
        scheduleEntryId: explanation.baselineScheduleEntryId,
        originalDate: dateKey,
      });
      map.set(key, {
        id: explanation.id,
        reason: explanation.reason,
        explainedAt: explanation.createdAt,
        explainedByName: explanation.explainedByUserId
          ? (userNameById.get(explanation.explainedByUserId) ?? null)
          : null,
      });
    }

    return map;
  }

  buildOccurrenceKey(params: {
    classId: string;
    teacherId: string;
    scheduleEntryId: string;
    originalDate: string;
  }) {
    return [
      params.classId,
      params.teacherId,
      params.scheduleEntryId,
      params.originalDate,
    ].join(':');
  }

  private async assertClassAndTeacherActive(classId: string, teacherId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { status: true },
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    if (cls.status !== ClassStatus.running) {
      throw new BadRequestException('Lớp đã kết thúc, không thể giải trình vắng.');
    }

    const assignment = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: { classId, teacherId },
      },
      select: { status: true },
    });
    if (!assignment || !isActiveClassTeacherStatus(assignment.status)) {
      throw new BadRequestException(
        'Gia sư không còn phân công active trên lớp này.',
      );
    }
  }

  private async assertOccurrenceIsMissedAlert(
    classId: string,
    dto: CreateMissedTeachingExplanationInput,
  ) {
    const alerts =
      await this.sessionScheduleRulesService.getMissedTeachingAlertsByClass(
        classId,
        31,
        dto.teacherId,
      );
    const match = alerts.find(
      (alert) =>
        alert.scheduleEntryId === dto.scheduleEntryId &&
        alert.originalDate === dto.originalDate &&
        alert.teacherId === dto.teacherId,
    );
    if (!match) {
      throw new BadRequestException(
        'Buổi học gốc không còn trong danh sách cảnh báo chưa dạy.',
      );
    }
  }

  private async assertNoMakeupForOccurrence(
    classId: string,
    baselineScheduleEntryId: string,
    originalDate: Date,
  ) {
    const makeup = await this.prisma.makeupScheduleEvent.findFirst({
      where: {
        classId,
        baselineScheduleEntryId,
        originalDate,
      },
      select: { id: true },
    });
    if (makeup) {
      throw new BadRequestException(
        'Không thể sửa giải trình sau khi đã xếp lịch bù.',
      );
    }
  }

  private serializeExplanation(
    record: {
      id: string;
      classId: string;
      teacherId: string;
      baselineScheduleEntryId: string;
      originalDate: Date;
      reason: string;
      createdAt: Date;
      teacher?: {
        user?: {
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
        } | null;
      } | null;
    },
  ): MissedTeachingExplanationRecord {
    const explainedByName = record.teacher?.user
      ? [record.teacher.user.first_name, record.teacher.user.last_name]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(' ')
          .trim() || record.teacher.user.email || null
      : null;

    return {
      id: record.id,
      classId: record.classId,
      teacherId: record.teacherId,
      baselineScheduleEntryId: record.baselineScheduleEntryId,
      originalDate: this.formatDate(record.originalDate),
      reason: record.reason,
      explainedAt: record.createdAt.toISOString(),
      explainedByName,
    };
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      throw new BadRequestException('originalDate phải có định dạng YYYY-MM-DD.');
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private async resolveUserName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true, email: true },
    });
    if (!user) {
      return null;
    }
    return (
      [user.first_name, user.last_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
        .trim() || user.email || null
    );
  }

  private formatDate(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
